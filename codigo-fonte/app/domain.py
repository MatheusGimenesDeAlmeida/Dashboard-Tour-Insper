"""Regras de negócio: vagas (RN-01..08), agendamento (RN-09..12), alocação (seção 6), estados (seção 7),
reagendamento/cancelamento (RN-17..19), exceções (RN-24..25), presença e NPS (RN-27..29).

As funções que alteram dados esperam ser chamadas dentro de core.tx(conn). As notificações são apenas
enfileiradas; quem chama faz notify.flush() depois do COMMIT."""
import json
import random
import re
from datetime import date, timedelta

from . import core, integrations, notify
from .core import ACTIVE_STATUSES, iso, now_utc, parse_iso, slot_key


class DomainError(Exception):
    def __init__(self, message, code="erro", status=400, extra=None):
        super().__init__(message)
        self.message, self.code, self.status, self.extra = message, code, status, extra or {}


# ================================================================ disponibilidade
def ambassador_available(amb, date_str, time_str):
    """Função pura. amb = {active, rules:[{weekday,start_time,valid_from,valid_until}], exceptions:[{date,start_time,available}]}"""
    if not amb.get("active"):
        return False
    exc_time = [e for e in amb.get("exceptions", []) if e["date"] == date_str and e["start_time"] == time_str]
    if exc_time:
        return bool(exc_time[-1]["available"])
    exc_day = [e for e in amb.get("exceptions", []) if e["date"] == date_str and not e["start_time"]]
    if exc_day:
        return bool(exc_day[-1]["available"])
    wd = date.fromisoformat(date_str).weekday()
    for r in amb.get("rules", []):
        if r["weekday"] == wd and r["start_time"] == time_str \
                and (not r.get("valid_from") or r["valid_from"] <= date_str) \
                and (not r.get("valid_until") or date_str <= r["valid_until"]):
            return True
    return False


def load_ambassadors(conn, only_active=True):
    ambs = core.rows(conn.execute("SELECT * FROM ambassadors" + (" WHERE active=1" if only_active else "")))
    by_id = {a["id"]: a for a in ambs}
    for a in ambs:
        a["languages"] = json.loads(a["languages"] or "[]")
        a["rules"], a["exceptions"] = [], []
    for r in conn.execute("SELECT * FROM availability_rules"):
        if r["ambassador_id"] in by_id:
            by_id[r["ambassador_id"]]["rules"].append(dict(r))
    for e in conn.execute("SELECT * FROM availability_exceptions"):
        if e["ambassador_id"] in by_id:
            by_id[e["ambassador_id"]]["exceptions"].append(dict(e))
    return ambs


# ================================================================ alocação (função pura)
def allocate(group, ambassadors, history, config, rng=None):
    """Seção 6. Retorna a lista ordenada de ids: [principal, reserva, fila...].

    group:       {date, time, courses:[...], languages:[...], exclude:[ids]}
    ambassadors: [{id, active, course, languages, rules, exceptions, busy_slots:[(date,time)]}]
    history:     {id: {tours_30d, declines_30d}}
    config:      {match_course: bool}
    """
    rng = rng or random.Random()
    slot = (group["date"], group["time"])
    exclude = set(group.get("exclude", []))
    candidates = [a for a in ambassadors
                  if a["id"] not in exclude
                  and ambassador_available(a, group["date"], group["time"])
                  and slot not in {tuple(s) for s in a.get("busy_slots", [])}]
    wanted_langs = {l for l in group.get("languages", []) if l and l != "Português"}
    courses = group.get("courses", [])

    def profile_score(a):
        score = 0
        if config.get("match_course", True) and a.get("course"):
            score += sum(1 for c in courses if c == a["course"])
        if wanted_langs:
            score += 10 * len(wanted_langs & set(a.get("languages", [])))
        return score

    keyed = []
    for a in candidates:
        h = history.get(a["id"], {})
        keyed.append(((h.get("tours_30d", 0), h.get("declines_30d", 0), -profile_score(a), rng.random()), a["id"]))
    keyed.sort()
    return [aid for _, aid in keyed]


def allocation_history(conn, now):
    since = iso(now - timedelta(days=30))
    hist = {}
    for r in conn.execute("SELECT ambassador_id, COUNT(*) n FROM tour_groups WHERE ambassador_id IS NOT NULL "
                          "AND status IN ('com_embaixador','realizado') AND slot_start >= ? GROUP BY ambassador_id", (since,)):
        hist.setdefault(r["ambassador_id"], {})["tours_30d"] = r["n"]
    for r in conn.execute("SELECT ambassador_id, COUNT(*) n FROM invitations WHERE status IN ('recusado','expirado','desistiu') "
                          "AND responded_at >= ? GROUP BY ambassador_id", (since,)):
        hist.setdefault(r["ambassador_id"], {})["declines_30d"] = r["n"]
    return hist


def busy_slots(conn, slot_start, exclude_group_id=None):
    """Embaixadores ocupados no horário: já conduzem outro grupo ou têm convite em aberto para outro grupo."""
    busy = set()
    for r in conn.execute("SELECT ambassador_id FROM tour_groups WHERE slot_start=? AND ambassador_id IS NOT NULL "
                          "AND status IN ('aberto','com_embaixador') AND id != ?", (slot_start, exclude_group_id or 0)):
        busy.add(r["ambassador_id"])
    for r in conn.execute("SELECT i.ambassador_id FROM invitations i JOIN tour_groups g ON g.id=i.tour_group_id "
                          "WHERE g.slot_start=? AND i.status='enviado' AND g.id != ?", (slot_start, exclude_group_id or 0)):
        busy.add(r["ambassador_id"])
    return busy


# ================================================================ vagas
def _blackouts(conn):
    out = {}
    for b in conn.execute("SELECT date, start_time FROM blackouts"):
        out.setdefault(b["date"], set()).add(b["start_time"])  # None = dia todo
    return out


def slot_bookable(cfg, blackouts, date_str, time_str, now, ignore_window=False):
    d = date.fromisoformat(date_str)
    if d.weekday() not in cfg["weekdays"] or time_str not in cfg["start_times"]:
        return False, "Horário fora da grade de tours."
    day_block = blackouts.get(date_str, set())
    if None in day_block or time_str in day_block:
        return False, "Data ou horário bloqueado por Admissões."
    start = core.local_slot(date_str, time_str)
    if start <= now:
        return False, "Esse horário já passou."
    if not ignore_window:
        if start < now + timedelta(hours=cfg["min_lead_hours"]):
            return False, f"É preciso agendar com pelo menos {cfg['min_lead_hours']}h de antecedência."
        if start > now + timedelta(days=cfg["max_days_ahead"]):
            return False, f"A agenda está aberta para os próximos {cfg['max_days_ahead']} dias."
    return True, ""


def slot_state(conn, slot_start, cfg, ambassadors, exclude_booking_id=None):
    date_str, time_str = slot_key(slot_start)
    marks = ",".join("?" * len(ACTIVE_STATUSES))
    groups = core.rows(conn.execute(
        f"SELECT g.*, COALESCE(SUM(CASE WHEN b.status IN ({marks}) AND b.id != ? THEN b.party_size END), 0) AS booked "
        "FROM tour_groups g LEFT JOIN bookings b ON b.tour_group_id = g.id "
        "WHERE g.slot_start = ? AND g.status IN ('aberto','com_embaixador') GROUP BY g.id ORDER BY g.id",
        (*ACTIVE_STATUSES, exclude_booking_id or 0, slot_start)))
    avail = {a["id"] for a in ambassadors if ambassador_available(a, date_str, time_str)}
    assigned = {g["ambassador_id"] for g in groups if g["ambassador_id"]}
    pending = [g for g in groups if not g["ambassador_id"] and not g["handled_by_admissions"]]
    need = 2 if cfg["reserve_required"] else 1
    free = len(avail - assigned) - len(pending)
    can_open = free >= need
    usable = [g for g in groups if not g["in_exception"] or g["ambassador_id"] or g["handled_by_admissions"]]
    spaces = [max(0, g["capacity"] - g["booked"]) for g in usable]
    cap = cfg["group_capacity"]
    max_fit = max(spaces + [cap if can_open else 0])
    new_groups = max(0, free - (need - 1))
    remaining = sum(spaces) + new_groups * cap
    return {"groups": groups, "usable": usable, "can_open": can_open, "max_fit": max_fit,
            "remaining": remaining, "available_ambassadors": len(avail), "date": date_str, "time": time_str}


def compute_slots(conn, from_date, to_date, party, now=None, exclude_booking_id=None, ignore_window=False):
    now = now or now_utc()
    cfg = core.get_config(conn)
    ambs = load_ambassadors(conn)
    blackouts = _blackouts(conn)
    out = []
    d = from_date
    while d <= to_date:
        ds = d.isoformat()
        for t in sorted(cfg["start_times"]):
            ok, reason = slot_bookable(cfg, blackouts, ds, t, now, ignore_window)
            if d.weekday() not in cfg["weekdays"]:
                continue
            start = iso(core.local_slot(ds, t))
            if not ok:
                if "passou" in reason or "antecedência" in reason or "próximos" in reason:
                    continue
                out.append({"date": ds, "time": t, "slot_start": start, "remaining": 0, "max_fit": 0,
                            "available": False, "reason": reason})
                continue
            st = slot_state(conn, start, cfg, ambs, exclude_booking_id)
            out.append({"date": ds, "time": t, "slot_start": start, "remaining": st["remaining"],
                        "max_fit": st["max_fit"], "available": st["max_fit"] >= party})
        d += timedelta(days=1)
    return out


# ================================================================ leitura
def booking_full(conn, booking_id):
    return core.one(conn.execute(
        "SELECT b.*, c.full_name, c.email, c.phone, c.course_interest, c.is_treineiro, c.cpf_hash, "
        "g.slot_start, g.status AS group_status, g.ambassador_id, g.handled_by_admissions, g.in_exception "
        "FROM bookings b JOIN candidates c ON c.id=b.candidate_id JOIN tour_groups g ON g.id=b.tour_group_id WHERE b.id=?",
        (booking_id,)))


def group_bookings(conn, group_id, active_only=True):
    q = ("SELECT b.*, c.full_name, c.email, c.phone, c.course_interest, c.is_treineiro FROM bookings b "
         "JOIN candidates c ON c.id=b.candidate_id WHERE b.tour_group_id=?")
    if active_only:
        q += " AND b.status IN ('aguardando_embaixador','confirmado','excecao')"
    return core.rows(conn.execute(q + " ORDER BY b.id", (group_id,)))


def ambassador_row(conn, amb_id):
    return core.one(conn.execute("SELECT a.*, u.email FROM ambassadors a LEFT JOIN users u ON u.id=a.user_id WHERE a.id=?", (amb_id,)))


def manage_token(booking_id):
    return core.sign_token("manage", booking_id)


def nps_token(booking_id):
    return core.sign_token("nps", booking_id)


def group_nps_token(group_id):
    return core.sign_token("npsg", group_id)


def ambassador_label(conn, b):
    if b.get("handled_by_admissions"):
        return "a equipe de Admissões"
    if b.get("ambassador_id"):
        a = ambassador_row(conn, b["ambassador_id"])
        return core.first_name(a["display_name"]) if a else ""
    return ""


def candidate_vars(conn, b, cfg):
    slot = parse_iso(b["slot_start"])
    return {
        "nome": core.first_name(b["full_name"]), "data": core.fmt_date_pt(slot), "hora": core.fmt_time_pt(slot),
        "protocolo": b["protocol"], "pessoas": b["party_size"], "ponto_de_encontro": cfg["meeting_point"],
        "o_que_levar": cfg["what_to_bring"], "embaixador": ambassador_label(conn, b),
        "link_minha_visita": f"{core.APP_BASE_URL}/minha-visita/{manage_token(b['id'])}",
        "link_agendar": f"{core.APP_BASE_URL}/agendar", "link_nps": f"{core.APP_BASE_URL}/nps/{nps_token(b['id'])}",
    }


def ics_attachment(b, cfg):
    return [{"filename": "visita-insper.ics", "content_type": "text/calendar",
             "content": notify.make_ics(b["id"], b["protocol"], b["slot_start"], cfg["duration_min"], cfg["meeting_point"])}]


def safe_profile(b):
    """RN-22: único formato de candidato exposto ao embaixador. Nunca inclui CPF, e-mail, telefone ou sobrenome."""
    return {
        "booking_id": b["id"], "first_name": core.first_name(b["full_name"]), "course_interest": b["course_interest"],
        "is_treineiro": bool(b["is_treineiro"]), "companions": b["party_size"] - 1, "party_size": b["party_size"],
        "language": b["language"], "mobility_restriction": bool(b["mobility_restriction"]),
        "mobility_notes": b["mobility_notes"] or "", "questions": b["questions"] or "", "status": b["status"],
    }


def profile_text(conn, group_id):
    lines = []
    for b in group_bookings(conn, group_id):
        p = safe_profile(b)
        parts = [p["first_name"], p["course_interest"] or "curso não informado",
                 "treineiro" if p["is_treineiro"] else "vestibulando"]
        if p["companions"]:
            parts.append(f"+{p['companions']} acompanhante(s)")
        if p["language"] != "Português":
            parts.append(f"idioma: {p['language']}")
        if p["mobility_restriction"]:
            parts.append("restrição de locomoção" + (f" ({p['mobility_notes']})" if p["mobility_notes"] else ""))
        line = "• " + " · ".join(parts)
        if p["questions"]:
            line += f"\n  Dúvidas: {p['questions']}"
        lines.append(line)
    return "\n".join(lines) or "(sem candidatos ativos)"


def group_people(conn, group_id):
    return sum(b["party_size"] for b in group_bookings(conn, group_id))


def ambassador_vars(conn, group, amb, extra=None):
    slot = parse_iso(group["slot_start"])
    v = {"embaixador": core.first_name(amb["display_name"]), "data": core.fmt_date_pt(slot), "hora": core.fmt_time_pt(slot),
         "pessoas": group_people(conn, group["id"]), "perfil_grupo": profile_text(conn, group["id"]),
         "link_portal": f"{core.APP_BASE_URL}/embaixador"}
    v.update(extra or {})
    return v


def notify_ambassador(conn, group, amb_id, code, key_suffix, extra=None):
    amb = ambassador_row(conn, amb_id)
    if amb and amb.get("email"):
        notify.enqueue(conn, f"{code}:g{group['id']}:a{amb_id}:{key_suffix}", code, amb["email"],
                       ambassador_vars(conn, group, amb, extra), ambassador_id=amb_id)


def notify_admissions(conn, code, key, variables):
    cfg = core.get_config(conn)
    recipients = [r["email"] for r in conn.execute("SELECT email FROM users WHERE role='admissions'")] or [cfg["admissions_email"]]
    variables = dict(variables, link_admin=f"{core.APP_BASE_URL}/admin")
    for email in recipients:
        notify.enqueue(conn, f"{code}:{key}:{email}", code, email, variables)


def group_row(conn, group_id):
    return core.one(conn.execute("SELECT * FROM tour_groups WHERE id=?", (group_id,)))


# ================================================================ formulário
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def validate_form(conn, data, cfg):
    errors = {}
    name = " ".join((data.get("full_name") or "").split())
    if len(name.split(" ")) < 2:
        errors["full_name"] = "Informe nome e sobrenome."
    if not core.cpf_valid(data.get("cpf")):
        errors["cpf"] = "CPF inválido. Confira os números."
    email = (data.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        errors["email"] = "E-mail inválido."
    elif (data.get("email_confirm") or "").strip().lower() != email:
        errors["email_confirm"] = "Os e-mails não conferem."
    phone = core.cpf_digits(data.get("phone"))
    if phone.startswith("55") and len(phone) in (12, 13):
        phone = phone[2:]
    if len(phone) not in (10, 11):
        errors["phone"] = "Informe o celular com DDD."
    courses = [r["name"] for r in conn.execute("SELECT name FROM courses WHERE active=1")]
    if data.get("course_interest") not in courses:
        errors["course_interest"] = "Escolha o curso de interesse."
    if data.get("is_treineiro") not in (True, False):
        errors["is_treineiro"] = "Informe se você é treineiro."
    try:
        companions = int(data.get("companions", -1))
    except (TypeError, ValueError):
        companions = -1
    if companions < 0 or companions > cfg["group_capacity"] - 1:
        errors["companions"] = f"Acompanhantes: de 0 a {cfg['group_capacity'] - 1}."
    language = data.get("language") or "Português"
    if language not in cfg["languages"]:
        errors["language"] = "Idioma indisponível."
    questions = (data.get("questions") or "").strip()
    if len(questions) > 500:
        errors["questions"] = "Use até 500 caracteres."
    if not data.get("privacy_accepted"):
        errors["privacy_accepted"] = "É preciso aceitar o aviso de privacidade."
    if errors:
        raise DomainError("Confira os campos destacados.", "validacao", 422, {"fields": errors})
    companions_names = [str(n).strip()[:80] for n in (data.get("companions_names") or []) if str(n).strip()][:companions]
    return {
        "full_name": name, "cpf": core.cpf_digits(data["cpf"]), "email": email, "phone": phone,
        "course_interest": data["course_interest"], "is_treineiro": bool(data["is_treineiro"]),
        "party_size": companions + 1, "companions_names": companions_names,
        "mobility_restriction": bool(data.get("mobility_restriction")),
        "mobility_notes": (data.get("mobility_notes") or "").strip()[:300],
        "language": language, "questions": questions, "whatsapp_opt_in": bool(data.get("whatsapp_opt_in")),
    }


# ================================================================ grupos e convites
def compute_deadline(slot_start, base, cfg):
    """Limite para alguém aceitar (RN-23/RN-24). Para pedidos de última hora, garante ao menos 2h de janela."""
    slot = parse_iso(slot_start)
    deadline = slot - timedelta(hours=cfg["exception_cutoff_hours"])
    if deadline < base + timedelta(hours=2):
        deadline = min(base + timedelta(hours=2), slot - timedelta(hours=1))
    return deadline


def place_booking(conn, slot_start, party, cfg, ambassadors, exclude_booking_id=None):
    st = slot_state(conn, slot_start, cfg, ambassadors, exclude_booking_id)
    fitting = [g for g in st["usable"] if g["capacity"] - g["booked"] >= party]
    if fitting:
        fitting.sort(key=lambda g: (0 if (g["ambassador_id"] or g["handled_by_admissions"]) else 1, -g["booked"]))
        return fitting[0], False
    if st["can_open"] and party <= cfg["group_capacity"]:
        now = now_utc()
        cur = conn.execute("INSERT INTO tour_groups(slot_start, status, capacity, deadline_at, created_at) VALUES (?,?,?,?,?)",
                           (slot_start, "aberto", cfg["group_capacity"], iso(compute_deadline(slot_start, now, cfg)), iso(now)))
        core.log_event(conn, "group", cur.lastrowid, "group.created", payload={"slot_start": slot_start})
        return group_row(conn, cur.lastrowid), True
    raise DomainError("Este horário acabou de esgotar. Escolha outro horário.", "esgotado", 409)


def start_allocation(conn, group_id, exclude=None):
    g = group_row(conn, group_id)
    cfg = core.get_config(conn)
    now = now_utc()
    date_str, time_str = slot_key(g["slot_start"])
    ambs = load_ambassadors(conn)
    busy = busy_slots(conn, g["slot_start"], exclude_group_id=group_id)
    for a in ambs:
        a["busy_slots"] = [(date_str, time_str)] if a["id"] in busy else []
    bookings = group_bookings(conn, group_id)
    previous = {r["ambassador_id"] for r in conn.execute(
        "SELECT ambassador_id FROM invitations WHERE tour_group_id=? AND status IN ('recusado','expirado','desistiu')", (group_id,))}
    ranking = allocate({"date": date_str, "time": time_str, "courses": [b["course_interest"] for b in bookings],
                        "languages": [b["language"] for b in bookings], "exclude": list(previous | set(exclude or []))},
                       ambs, allocation_history(conn, now), cfg)
    conn.execute("UPDATE invitations SET status='cancelado' WHERE tour_group_id=? AND status IN ('pendente','enviado')", (group_id,))
    base_rank = (core.one(conn.execute("SELECT COALESCE(MAX(rank),0) m FROM invitations WHERE tour_group_id=?", (group_id,)))["m"])
    for i, amb_id in enumerate(ranking, start=1):
        conn.execute("INSERT INTO invitations(tour_group_id, ambassador_id, rank, status, created_at) VALUES (?,?,?,?,?)",
                     (group_id, amb_id, base_rank + i, "pendente", iso(now)))
    core.log_event(conn, "group", group_id, "allocation.ranked",
                   payload={"principal": ranking[0] if ranking else None, "reserva": ranking[1] if len(ranking) > 1 else None,
                            "fila": ranking})
    send_next_invitation(conn, group_id)


def send_next_invitation(conn, group_id):
    g = group_row(conn, group_id)
    if g["status"] != "aberto" or g["ambassador_id"] or g["handled_by_admissions"] or g["in_exception"]:
        return
    cfg = core.get_config(conn)
    now = now_utc()
    deadline = parse_iso(g["deadline_at"])
    if now >= deadline:
        open_exception(conn, group_id, "Prazo limite atingido sem aceite de embaixador.")
        return
    date_str, time_str = slot_key(g["slot_start"])
    ambs = {a["id"]: a for a in load_ambassadors(conn)}
    busy = busy_slots(conn, g["slot_start"], exclude_group_id=group_id)
    while True:
        inv = core.one(conn.execute("SELECT * FROM invitations WHERE tour_group_id=? AND status='pendente' ORDER BY rank LIMIT 1",
                                    (group_id,)))
        if not inv:
            open_exception(conn, group_id, "Nenhum embaixador disponível aceitou o convite.")
            return
        a = ambs.get(inv["ambassador_id"])
        if not a or inv["ambassador_id"] in busy or not ambassador_available(a, date_str, time_str):
            conn.execute("UPDATE invitations SET status='cancelado' WHERE id=?", (inv["id"],))
            continue
        expires = min(now + timedelta(hours=cfg["invite_timeout_hours"]), deadline)
        conn.execute("UPDATE invitations SET status='enviado', sent_at=?, expires_at=? WHERE id=?",
                     (iso(now), iso(expires), inv["id"]))
        core.log_event(conn, "invitation", inv["id"], "invitation.sent", payload={"group_id": group_id, "ambassador_id": a["id"]})
        prazo = f"{core.fmt_date_pt(expires)}, às {core.fmt_time_pt(expires)}"
        notify_ambassador(conn, g, a["id"], "M7", inv["id"], {"prazo": prazo})
        return


def open_exception(conn, group_id, reason):
    g = group_row(conn, group_id)
    if g["in_exception"]:
        return
    now = now_utc()
    conn.execute("UPDATE invitations SET status=CASE WHEN status='enviado' THEN 'expirado' ELSE 'cancelado' END, "
                 "responded_at=COALESCE(responded_at, ?) WHERE tour_group_id=? AND status IN ('pendente','enviado')", (iso(now), group_id))
    conn.execute("UPDATE tour_groups SET in_exception=1, exception_opened_at=?, exception_resolved_at=NULL WHERE id=?",
                 (iso(now), group_id))
    conn.execute("UPDATE bookings SET status='excecao', updated_at=? WHERE tour_group_id=? AND status='aguardando_embaixador'",
                 (iso(now), group_id))
    core.log_event(conn, "group", group_id, "group.exception_opened", payload={"motivo": reason})
    slot = parse_iso(g["slot_start"])
    notify_admissions(conn, "M11", f"g{group_id}:{iso(now)}", {
        "data": core.fmt_date_pt(slot), "hora": core.fmt_time_pt(slot), "pessoas": group_people(conn, group_id), "motivo": reason})


def _confirm_group_bookings(conn, group_id):
    cfg = core.get_config(conn)
    now = iso(now_utc())
    for b in group_bookings(conn, group_id):
        if b["status"] in ("aguardando_embaixador", "excecao"):
            conn.execute("UPDATE bookings SET status='confirmado', confirmed_at=COALESCE(confirmed_at, ?), updated_at=? WHERE id=?",
                         (now, now, b["id"]))
            core.log_event(conn, "booking", b["id"], "booking.confirmed")
        full = booking_full(conn, b["id"])
        notify.enqueue_candidate(conn, full, "M2", candidate_vars(conn, full, cfg),
                                 dedupe_suffix=f"a{full['ambassador_id'] or 'adm'}:{full['slot_start']}")
        integrations.queue_crm(conn, b["id"], "updateTourStatus", {"status": "confirmado", "slot_start": full["slot_start"]})
        integrations.queue_webhook(conn, b["id"], "booking.confirmed", {"protocol": full["protocol"], "slot_start": full["slot_start"]})


def accept_invitation(conn, invitation_id, ambassador_id):
    inv = core.one(conn.execute("SELECT * FROM invitations WHERE id=? AND ambassador_id=?", (invitation_id, ambassador_id)))
    if not inv:
        raise DomainError("Convite não encontrado.", "nao_encontrado", 404)
    if inv["status"] != "enviado":
        raise DomainError("Este convite não está mais disponível.", "convite_indisponivel", 409)
    now = now_utc()
    if parse_iso(inv["expires_at"]) <= now:
        raise DomainError("O prazo deste convite terminou.", "convite_expirado", 409)
    g = group_row(conn, inv["tour_group_id"])
    if core.one(conn.execute(
            "SELECT id FROM tour_groups WHERE slot_start=? AND ambassador_id=? AND status='com_embaixador' AND id != ?",
            (g["slot_start"], ambassador_id, g["id"]))):
        raise DomainError("Você já tem um tour neste horário.", "conflito", 409)
    conn.execute("UPDATE invitations SET status='aceito', responded_at=? WHERE id=?", (iso(now), inv["id"]))
    conn.execute("UPDATE invitations SET status='cancelado' WHERE tour_group_id=? AND id != ? AND status IN ('pendente','enviado')",
                 (g["id"], inv["id"]))
    _assign(conn, g["id"], ambassador_id)
    core.log_event(conn, "invitation", inv["id"], "invitation.accepted", actor="ambassador", actor_id=ambassador_id,
                   payload={"group_id": g["id"]})


def _assign(conn, group_id, ambassador_id, handled_by_admissions=False):
    now = iso(now_utc())
    conn.execute("UPDATE tour_groups SET ambassador_id=?, handled_by_admissions=?, status='com_embaixador', in_exception=0, "
                 "exception_resolved_at=CASE WHEN in_exception=1 THEN ? ELSE exception_resolved_at END WHERE id=?",
                 (ambassador_id, 1 if handled_by_admissions else 0, now, group_id))
    conn.execute("DELETE FROM gifts WHERE tour_group_id=? AND collected_at IS NULL", (group_id,))
    if ambassador_id:
        conn.execute("INSERT OR IGNORE INTO gifts(tour_group_id, ambassador_id) VALUES (?,?)", (group_id, ambassador_id))
    _confirm_group_bookings(conn, group_id)


def claim_group(conn, group_id, ambassador_id):
    """O embaixador assume um grupo que ficou sem ninguém (resolve a exceção sem ação de Admissões)."""
    g = group_row(conn, group_id)
    if not g or g["status"] != "aberto" or not g["in_exception"]:
        raise DomainError("Este tour já foi assumido por outra pessoa.", "indisponivel", 409)
    if ambassador_id in busy_slots(conn, g["slot_start"], exclude_group_id=group_id) or core.one(conn.execute(
            "SELECT id FROM tour_groups WHERE slot_start=? AND ambassador_id=? AND status='com_embaixador'", (g["slot_start"], ambassador_id))):
        raise DomainError("Você já tem um tour neste horário.", "conflito", 409)
    now = iso(now_utc())
    conn.execute("INSERT INTO invitations(tour_group_id, ambassador_id, rank, status, sent_at, responded_at, created_at) VALUES (?,?,0,'aceito',?,?,?)",
                 (group_id, ambassador_id, now, now, now))
    _assign(conn, group_id, ambassador_id)
    core.log_event(conn, "group", group_id, "group.claimed", actor="ambassador", actor_id=ambassador_id)


def decline_invitation(conn, invitation_id, ambassador_id, reason=None):
    inv = core.one(conn.execute("SELECT * FROM invitations WHERE id=? AND ambassador_id=?", (invitation_id, ambassador_id)))
    if not inv:
        raise DomainError("Convite não encontrado.", "nao_encontrado", 404)
    if inv["status"] != "enviado":
        raise DomainError("Este convite não está mais disponível.", "convite_indisponivel", 409)
    conn.execute("UPDATE invitations SET status='recusado', responded_at=?, decline_reason=? WHERE id=?",
                 (iso(now_utc()), (reason or "")[:300], inv["id"]))
    core.log_event(conn, "invitation", inv["id"], "invitation.declined", actor="ambassador", actor_id=ambassador_id,
                   payload={"motivo": reason})
    send_next_invitation(conn, inv["tour_group_id"])


def withdraw(conn, group_id, ambassador_id, reason=None, actor="ambassador"):
    """RN-25: desistência depois do aceite. Reabre a alocação na hora (o reserva tende a ser o 1º do novo ranking)."""
    g = group_row(conn, group_id)
    if not g or g["ambassador_id"] != ambassador_id:
        raise DomainError("Tour não encontrado.", "nao_encontrado", 404)
    now = now_utc()
    if parse_iso(g["slot_start"]) <= now:
        raise DomainError("O tour já começou.", "tour_iniciado", 409)
    cfg = core.get_config(conn)
    conn.execute("UPDATE invitations SET status='desistiu', responded_at=?, decline_reason=? WHERE tour_group_id=? "
                 "AND ambassador_id=? AND status='aceito'", (iso(now), reason, group_id, ambassador_id))
    conn.execute("UPDATE tour_groups SET ambassador_id=NULL, status='aberto', deadline_at=? WHERE id=?",
                 (iso(compute_deadline(g["slot_start"], now, cfg)), group_id))
    conn.execute("DELETE FROM gifts WHERE tour_group_id=? AND collected_at IS NULL", (group_id,))
    conn.execute("UPDATE bookings SET status='aguardando_embaixador', updated_at=? WHERE tour_group_id=? AND status='confirmado'",
                 (iso(now), group_id))
    core.log_event(conn, "group", group_id, "ambassador.withdrew", actor=actor, actor_id=ambassador_id, payload={"motivo": reason})
    slot = parse_iso(g["slot_start"])
    if slot - now < timedelta(hours=24):
        notify_admissions(conn, "M11", f"g{group_id}:desistencia:{iso(now)}", {
            "data": core.fmt_date_pt(slot), "hora": core.fmt_time_pt(slot), "pessoas": group_people(conn, group_id),
            "motivo": "Embaixador desistiu a menos de 24h do tour. Alocação reaberta automaticamente."})
    start_allocation(conn, group_id, exclude=[ambassador_id])


def expire_invitations(conn):
    now = iso(now_utc())
    expired = core.rows(conn.execute("SELECT * FROM invitations WHERE status='enviado' AND expires_at <= ?", (now,)))
    for inv in expired:
        conn.execute("UPDATE invitations SET status='expirado', responded_at=? WHERE id=? AND status='enviado'", (now, inv["id"]))
        core.log_event(conn, "invitation", inv["id"], "invitation.expired")
        send_next_invitation(conn, inv["tour_group_id"])
    # grupos sem convite em aberto que chegaram ao limite
    for g in core.rows(conn.execute("SELECT id FROM tour_groups WHERE status='aberto' AND ambassador_id IS NULL AND "
                                    "handled_by_admissions=0 AND in_exception=0 AND deadline_at <= ?", (now,))):
        open_exception(conn, g["id"], "Prazo limite atingido sem aceite de embaixador.")
    return len(expired)


def remind_invitations(conn):
    """M8: metade do prazo sem resposta."""
    now = now_utc()
    n = 0
    for inv in core.rows(conn.execute("SELECT * FROM invitations WHERE status='enviado' AND reminder_sent_at IS NULL")):
        sent, exp = parse_iso(inv["sent_at"]), parse_iso(inv["expires_at"])
        if now >= sent + (exp - sent) / 2:
            g = group_row(conn, inv["tour_group_id"])
            conn.execute("UPDATE invitations SET reminder_sent_at=? WHERE id=?", (iso(now), inv["id"]))
            notify_ambassador(conn, g, inv["ambassador_id"], "M8", inv["id"],
                              {"prazo": f"{core.fmt_date_pt(exp)}, às {core.fmt_time_pt(exp)}"})
            n += 1
    return n


# ================================================================ exceções (Admissões)
def resolve_exception(conn, group_id, action, admin_user_id, ambassador_id=None):
    g = group_row(conn, group_id)
    if not g or g["status"] not in ("aberto", "com_embaixador"):
        raise DomainError("Grupo não encontrado.", "nao_encontrado", 404)
    if action == "designar":
        a = ambassador_row(conn, ambassador_id) if ambassador_id else None
        if not a or not a["active"]:
            raise DomainError("Escolha um embaixador ativo.", "validacao", 422)
        previous = g["ambassador_id"]
        conn.execute("UPDATE invitations SET status='cancelado' WHERE tour_group_id=? AND status IN ('pendente','enviado')", (group_id,))
        if previous and previous != ambassador_id:
            conn.execute("UPDATE invitations SET status='cancelado' WHERE tour_group_id=? AND ambassador_id=? AND status='aceito'",
                         (group_id, previous))
            notify_ambassador(conn, g, previous, "M10", f"removido:{iso(now_utc())}",
                              {"mudanca": "Admissões transferiu este tour para outro embaixador. Você não precisa mais conduzi-lo."})
        conn.execute("INSERT INTO invitations(tour_group_id, ambassador_id, rank, status, sent_at, responded_at, created_at) "
                     "VALUES (?,?,0,'aceito',?,?,?)", (group_id, ambassador_id, *(iso(now_utc()),) * 3))
        _assign(conn, group_id, ambassador_id)
        notify_ambassador(conn, group_row(conn, group_id), ambassador_id, "M10", f"designado:{iso(now_utc())}",
                          {"mudanca": "Admissões designou você para conduzir este tour."})
        core.log_event(conn, "group", group_id, "exception.assigned", actor="admissions", actor_id=admin_user_id,
                       payload={"ambassador_id": ambassador_id})
    elif action == "admissoes_conduz":
        conn.execute("UPDATE invitations SET status='cancelado' WHERE tour_group_id=? AND status IN ('pendente','enviado')", (group_id,))
        _assign(conn, group_id, None, handled_by_admissions=True)
        core.log_event(conn, "group", group_id, "exception.admissions_conducts", actor="admissions", actor_id=admin_user_id)
    elif action == "propor_nova_data":
        cfg = core.get_config(conn)
        for b in group_bookings(conn, group_id):
            full = booking_full(conn, b["id"])
            notify.enqueue_candidate(conn, full, "MX1", candidate_vars(conn, full, cfg), dedupe_suffix=iso(now_utc()))
        core.log_event(conn, "group", group_id, "exception.new_date_proposed", actor="admissions", actor_id=admin_user_id)
    elif action == "reabrir_alocacao":
        conn.execute("UPDATE tour_groups SET in_exception=0, deadline_at=? WHERE id=?",
                     (iso(compute_deadline(g["slot_start"], now_utc(), core.get_config(conn))), group_id))
        conn.execute("UPDATE bookings SET status='aguardando_embaixador' WHERE tour_group_id=? AND status='excecao'", (group_id,))
        core.log_event(conn, "group", group_id, "exception.reallocation", actor="admissions", actor_id=admin_user_id)
        start_allocation(conn, group_id)
    else:
        raise DomainError("Ação desconhecida.", "validacao", 422)


# ================================================================ agendamento
def _upsert_candidate(conn, f):
    h = core.cpf_hash(f["cpf"])
    existing = core.one(conn.execute("SELECT id FROM candidates WHERE cpf_hash=?", (h,)))
    if existing:
        conn.execute("UPDATE candidates SET full_name=?, email=?, phone=?, course_interest=?, is_treineiro=?, anonymized_at=NULL WHERE id=?",
                     (f["full_name"], f["email"], f["phone"], f["course_interest"], 1 if f["is_treineiro"] else 0, existing["id"]))
        return existing["id"], h
    cur = conn.execute("INSERT INTO candidates(full_name, cpf_encrypted, cpf_hash, email, phone, course_interest, is_treineiro, created_at) "
                       "VALUES (?,?,?,?,?,?,?,?)", (f["full_name"], core.encrypt_cpf(f["cpf"]), h, f["email"], f["phone"],
                                                    f["course_interest"], 1 if f["is_treineiro"] else 0, iso(now_utc())))
    return cur.lastrowid, h


def active_future_booking(conn, cpf_h, exclude_booking_id=None):
    return core.one(conn.execute(
        "SELECT b.id FROM bookings b JOIN candidates c ON c.id=b.candidate_id JOIN tour_groups g ON g.id=b.tour_group_id "
        "WHERE c.cpf_hash=? AND b.status IN ('aguardando_embaixador','confirmado','excecao') AND g.slot_start > ? AND b.id != ?",
        (cpf_h, iso(now_utc()), exclude_booking_id or 0)))


def create_booking(conn, data, actor="candidate", actor_id=None, ignore_window=False):
    cfg = core.get_config(conn)
    f = validate_form(conn, data, cfg)
    slot_start = data.get("slot_start") or ""
    try:
        date_str, time_str = slot_key(slot_start)
    except Exception:
        raise DomainError("Escolha um horário.", "validacao", 422, {"fields": {"slot_start": "Escolha um horário."}})
    dup = active_future_booking(conn, core.cpf_hash(f["cpf"]))
    if dup:  # RN-11: o link da visita existente vai para o e-mail cadastrado (ver create_booking_tx), sem expor dados na tela
        raise DomainError("Já existe uma visita agendada para este CPF. Enviamos para o e-mail cadastrado o link para "
                          "ver, reagendar ou cancelar.", "duplicado", 409, {"_existing_booking_id": dup["id"]})
    ok, reason = slot_bookable(cfg, _blackouts(conn), date_str, time_str, now_utc(), ignore_window)
    if not ok:
        raise DomainError(reason, "horario_invalido", 409)
    ambs = load_ambassadors(conn)
    group, created = place_booking(conn, slot_start, f["party_size"], cfg, ambs)
    candidate_id, _ = _upsert_candidate(conn, f)
    now = iso(now_utc())
    has_amb = bool(group["ambassador_id"] or group["handled_by_admissions"])
    cur = conn.execute(
        "INSERT INTO bookings(candidate_id, tour_group_id, status, party_size, companions_names, mobility_restriction, mobility_notes, "
        "language, questions, privacy_accepted_at, whatsapp_opt_in, confirmed_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (candidate_id, group["id"], "confirmado" if has_amb else "aguardando_embaixador", f["party_size"],
         json.dumps(f["companions_names"], ensure_ascii=False), 1 if f["mobility_restriction"] else 0, f["mobility_notes"],
         f["language"], f["questions"], now, 1 if f["whatsapp_opt_in"] else 0, now if has_amb else None, now, now))
    booking_id = cur.lastrowid
    protocol = f"TOUR-{core.local(now_utc()).year}-{booking_id:06d}"
    conn.execute("UPDATE bookings SET protocol=? WHERE id=?", (protocol, booking_id))
    core.log_event(conn, "booking", booking_id, "booking.created", actor=actor, actor_id=actor_id,
                   payload={"slot_start": slot_start, "party_size": f["party_size"], "group_id": group["id"]})
    b = booking_full(conn, booking_id)
    notify.enqueue_candidate(conn, b, "M1", candidate_vars(conn, b, cfg), dedupe_suffix="criado", attachments=ics_attachment(b, cfg))
    integrations.queue_crm(conn, booking_id, "upsertLead", {
        "protocol": protocol, "full_name": f["full_name"], "email": f["email"], "phone": f["phone"], "cpf_hash": b["cpf_hash"],
        "course_interest": f["course_interest"], "is_treineiro": f["is_treineiro"], "slot_start": slot_start,
        "party_size": f["party_size"], "source": "plataforma-tour"})
    integrations.queue_webhook(conn, booking_id, "booking.created", {"protocol": protocol, "slot_start": slot_start})
    if created:
        start_allocation(conn, group["id"])
    elif has_amb:
        notify.enqueue_candidate(conn, b, "M2", candidate_vars(conn, b, cfg),
                                 dedupe_suffix=f"a{b['ambassador_id'] or 'adm'}:{slot_start}")
        if group["ambassador_id"]:
            notify_ambassador(conn, group, group["ambassador_id"], "M10", f"entrou:b{booking_id}",
                              {"mudanca": f"entrou {core.first_name(f['full_name'])} ({f['party_size']} pessoa(s))."})
    return booking_full(conn, booking_id)


def create_booking_tx(conn, data, **kwargs):
    """Cria o agendamento numa transação própria. Em caso de CPF duplicado, o aviso MX2 é enviado fora da
    transação que falhou (senão o rollback descartaria a mensagem)."""
    try:
        with core.tx(conn):
            return create_booking(conn, data, **kwargs)
    except DomainError as e:
        existing = e.extra.pop("_existing_booking_id", None)
        if existing:
            with core.tx(conn):
                full = booking_full(conn, existing)
                notify.enqueue_candidate(conn, full, "MX2", candidate_vars(conn, full, core.get_config(conn)),
                                         dedupe_suffix=iso(now_utc()))
        raise
    finally:
        notify.flush(conn)


def _after_leave_group(conn, group_id, who, booking_id):
    """Avisa o embaixador (M10) e cancela o grupo que ficou vazio (seção 7.3)."""
    g = group_row(conn, group_id)
    remaining = group_bookings(conn, group_id)
    if not remaining:
        conn.execute("UPDATE tour_groups SET status='cancelado' WHERE id=?", (group_id,))
        conn.execute("UPDATE invitations SET status='cancelado' WHERE tour_group_id=? AND status IN ('pendente','enviado')", (group_id,))
        conn.execute("DELETE FROM gifts WHERE tour_group_id=? AND collected_at IS NULL", (group_id,))
        core.log_event(conn, "group", group_id, "group.cancelled", payload={"motivo": "sem agendamentos ativos"})
        if g["ambassador_id"]:
            notify_ambassador(conn, g, g["ambassador_id"], "M10", f"cancelado:b{booking_id}",
                              {"mudanca": "o grupo foi cancelado (não há mais candidatos). Você não precisa conduzir este tour."})
    elif g["ambassador_id"]:
        notify_ambassador(conn, g, g["ambassador_id"], "M10", f"saiu:b{booking_id}", {"mudanca": f"saiu {who} do grupo."})


def cancel_booking(conn, booking_id, actor="candidate", actor_id=None, reason=None):
    b = booking_full(conn, booking_id)
    if not b or b["status"] not in ACTIVE_STATUSES:
        raise DomainError("Esta visita não pode mais ser cancelada.", "estado_invalido", 409)
    cfg = core.get_config(conn)
    now = now_utc()
    if actor == "candidate" and parse_iso(b["slot_start"]) - now < timedelta(hours=cfg["cancel_cutoff_hours"]):
        raise DomainError(f"O cancelamento pelo link fecha {cfg['cancel_cutoff_hours']}h antes do tour. Fale com Admissões.",
                          "prazo", 409)
    status = "cancelado_candidato" if actor == "candidate" else "cancelado_admissoes"
    conn.execute("UPDATE bookings SET status=?, outcome=?, cancelled_at=?, cancel_reason=?, updated_at=? WHERE id=?",
                 (status, status, iso(now), (reason or "")[:200], iso(now), booking_id))
    core.log_event(conn, "booking", booking_id, "booking.cancelled", actor=actor, actor_id=actor_id, payload={"motivo": reason})
    notify.enqueue_candidate(conn, b, "M5", candidate_vars(conn, b, cfg), dedupe_suffix="cancelado")
    integrations.queue_crm(conn, booking_id, "updateTourStatus", {"status": status, "motivo": reason})
    integrations.queue_webhook(conn, booking_id, "booking.cancelled", {"protocol": b["protocol"], "status": status})
    _after_leave_group(conn, b["tour_group_id"], core.first_name(b["full_name"]), booking_id)
    return booking_full(conn, booking_id)


def reschedule_booking(conn, booking_id, new_slot_start, actor="candidate", actor_id=None):
    b = booking_full(conn, booking_id)
    if not b or b["status"] not in ACTIVE_STATUSES:
        raise DomainError("Esta visita não pode mais ser reagendada.", "estado_invalido", 409)
    cfg = core.get_config(conn)
    now = now_utc()
    if actor == "candidate":
        if parse_iso(b["slot_start"]) - now < timedelta(hours=cfg["cancel_cutoff_hours"]):
            raise DomainError(f"O reagendamento pelo link fecha {cfg['cancel_cutoff_hours']}h antes do tour. Fale com Admissões.",
                              "prazo", 409)
        if b["reschedule_count"] >= cfg["max_reschedules"]:
            raise DomainError(f"Você já reagendou {cfg['max_reschedules']} vezes. Para nova alteração, fale com Admissões.",
                              "limite_reagendamento", 409)
    if new_slot_start == b["slot_start"]:
        raise DomainError("Escolha um horário diferente do atual.", "validacao", 422)
    try:
        date_str, time_str = slot_key(new_slot_start)
    except Exception:
        raise DomainError("Escolha um horário.", "validacao", 422)
    ok, reason = slot_bookable(cfg, _blackouts(conn), date_str, time_str, now, ignore_window=(actor == "admissions"))
    if not ok:
        raise DomainError(reason, "horario_invalido", 409)
    old_group_id = b["tour_group_id"]
    group, created = place_booking(conn, new_slot_start, b["party_size"], cfg, load_ambassadors(conn), exclude_booking_id=booking_id)
    has_amb = bool(group["ambassador_id"] or group["handled_by_admissions"])
    conn.execute("UPDATE bookings SET tour_group_id=?, status=?, confirmed_at=?, reschedule_count=reschedule_count+?, "
                 "reminder_sent_at=NULL, presence_confirmed_at=NULL, updated_at=? WHERE id=?",
                 (group["id"], "confirmado" if has_amb else "aguardando_embaixador", iso(now) if has_amb else None,
                  1 if actor == "candidate" else 0, iso(now), booking_id))
    core.log_event(conn, "booking", booking_id, "booking.rescheduled", actor=actor, actor_id=actor_id,
                   payload={"de": b["slot_start"], "para": new_slot_start})
    _after_leave_group(conn, old_group_id, core.first_name(b["full_name"]), booking_id)
    nb = booking_full(conn, booking_id)
    notify.enqueue_candidate(conn, nb, "M4", candidate_vars(conn, nb, cfg), dedupe_suffix=f"{new_slot_start}:{iso(now)}",
                             attachments=ics_attachment(nb, cfg))
    integrations.queue_crm(conn, booking_id, "updateTourStatus", {"status": "reagendado", "slot_start": new_slot_start})
    integrations.queue_webhook(conn, booking_id, "booking.rescheduled", {"protocol": nb["protocol"], "slot_start": new_slot_start})
    if created:
        start_allocation(conn, group["id"])
    elif has_amb:
        notify.enqueue_candidate(conn, nb, "M2", candidate_vars(conn, nb, cfg),
                                 dedupe_suffix=f"a{nb['ambassador_id'] or 'adm'}:{new_slot_start}")
        if group["ambassador_id"]:
            notify_ambassador(conn, group, group["ambassador_id"], "M10", f"entrou:b{booking_id}:{iso(now)}",
                              {"mudanca": f"entrou {core.first_name(nb['full_name'])} ({nb['party_size']} pessoa(s))."})
    return nb


def confirm_presence(conn, booking_id):
    b = booking_full(conn, booking_id)
    if not b or b["status"] not in ACTIVE_STATUSES:
        raise DomainError("Esta visita não está ativa.", "estado_invalido", 409)
    conn.execute("UPDATE bookings SET presence_confirmed_at=? WHERE id=?", (iso(now_utc()), booking_id))
    core.log_event(conn, "booking", booking_id, "booking.presence_confirmed", actor="candidate")


# ================================================================ presença, NPS e encerramento
def mark_attendance(conn, group_id, marks, actor="ambassador", actor_id=None):
    g = group_row(conn, group_id)
    if not g:
        raise DomainError("Tour não encontrado.", "nao_encontrado", 404)
    if actor == "ambassador" and g["ambassador_id"] != actor_id:
        raise DomainError("Este tour não é seu.", "proibido", 403)
    now = now_utc()
    if parse_iso(g["slot_start"]) - timedelta(minutes=30) > now:
        raise DomainError("A presença só pode ser marcada no dia do tour.", "cedo_demais", 409)
    cfg = core.get_config(conn)
    for m in marks:
        b = booking_full(conn, int(m["booking_id"]))
        if not b or b["tour_group_id"] != group_id:
            continue
        if b["status"] not in ("confirmado", "presenca_pendente", "realizado", "nao_compareceu", "aguardando_embaixador", "excecao"):
            continue
        attended = bool(m["attended"])
        conn.execute("INSERT INTO attendance(booking_id, attended, marked_by, marked_at) VALUES (?,?,?,?) "
                     "ON CONFLICT(booking_id) DO UPDATE SET attended=excluded.attended, marked_by=excluded.marked_by, marked_at=excluded.marked_at",
                     (b["id"], 1 if attended else 0, f"{actor}:{actor_id}", iso(now)))
        new_status = "realizado" if attended else "nao_compareceu"
        conn.execute("UPDATE bookings SET status=?, outcome=?, updated_at=? WHERE id=?", (new_status, new_status, iso(now), b["id"]))
        core.log_event(conn, "booking", b["id"], f"attendance.{new_status}", actor=actor, actor_id=actor_id)
        integrations.queue_crm(conn, b["id"], "updateTourStatus", {"status": new_status})
        if attended:
            if not core.one(conn.execute("SELECT id FROM nps_responses WHERE booking_id=?", (b["id"],))):
                notify.enqueue_candidate(conn, b, "M6", candidate_vars(conn, b, cfg), dedupe_suffix="fim_do_tour")
        else:
            integrations.queue_crm(conn, b["id"], "closeActivity", {"result": "nao_compareceu"})
    left = core.one(conn.execute("SELECT COUNT(*) n FROM bookings WHERE tour_group_id=? AND status IN "
                                 "('confirmado','presenca_pendente','aguardando_embaixador','excecao')", (group_id,)))["n"]
    if left == 0 and g["status"] != "realizado":
        conn.execute("UPDATE tour_groups SET status='realizado' WHERE id=?", (group_id,))
        core.log_event(conn, "group", group_id, "tour.completed", actor=actor, actor_id=actor_id)
        for b in group_bookings(conn, group_id, active_only=False):
            if b["status"] == "realizado":
                integrations.queue_webhook(conn, b["id"], "tour.completed", {"protocol": b["protocol"]})


def close_booking(conn, booking_id, result):
    b = booking_full(conn, booking_id)
    if not b or b["status"] != "realizado":
        return False
    conn.execute("UPDATE bookings SET status='encerrado', closed_at=?, updated_at=? WHERE id=? AND status='realizado'",
                 (iso(now_utc()), iso(now_utc()), booking_id))
    core.log_event(conn, "booking", booking_id, "booking.closed", payload={"resultado": result})
    integrations.queue_crm(conn, booking_id, "closeActivity", {"result": result})
    return True


def submit_nps(conn, booking_id, data):
    b = booking_full(conn, booking_id)
    if not b:
        raise DomainError("Visita não encontrada.", "nao_encontrado", 404)
    if core.one(conn.execute("SELECT id FROM nps_responses WHERE booking_id=?", (booking_id,))):
        raise DomainError("Você já respondeu. Obrigado!", "ja_respondido", 409)
    if parse_iso(b["slot_start"]) > now_utc():
        raise DomainError("A avaliação abre depois do tour.", "cedo_demais", 409)
    try:
        score = int(data.get("score"))
        assert 0 <= score <= 10
    except Exception:
        raise DomainError("Escolha uma nota de 0 a 10.", "validacao", 422, {"fields": {"score": "Escolha uma nota de 0 a 10."}})
    rating = data.get("ambassador_rating")
    rating = int(rating) if rating not in (None, "") and 1 <= int(rating) <= 5 else None
    if b["status"] in ("confirmado", "presenca_pendente"):
        # responder ao QR do fim do tour é prova de presença
        mark_attendance(conn, b["tour_group_id"], [{"booking_id": booking_id, "attended": True}], actor="system")
    conn.execute("INSERT INTO nps_responses(booking_id, score, highlight, improvement, ambassador_rating, created_at) VALUES (?,?,?,?,?,?)",
                 (booking_id, score, (data.get("highlight") or "")[:1000], (data.get("improvement") or "")[:1000], rating, iso(now_utc())))
    core.log_event(conn, "booking", booking_id, "nps.received", actor="candidate", payload={"score": score})
    integrations.queue_webhook(conn, booking_id, "nps.received", {"protocol": b["protocol"], "score": score})
    close_booking(conn, booking_id, "nps_respondido")


def public_view(conn, b, cfg):
    slot = parse_iso(b["slot_start"])
    now = now_utc()
    labels = {"aguardando_embaixador": "Agendada — aguardando confirmação do embaixador", "confirmado": "Confirmada",
              "excecao": "Agendada — estamos confirmando o embaixador", "cancelado_candidato": "Cancelada",
              "cancelado_admissoes": "Cancelada por Admissões", "realizado": "Realizada", "encerrado": "Realizada",
              "nao_compareceu": "Não compareceu", "presenca_pendente": "Realizada (presença em registro)"}
    active = b["status"] in ACTIVE_STATUSES
    can_change = active and slot - now >= timedelta(hours=cfg["cancel_cutoff_hours"])
    return {
        "protocol": b["protocol"], "status": b["status"], "status_label": labels.get(b["status"], b["status"]),
        "first_name": core.first_name(b["full_name"]), "slot_start": b["slot_start"],
        "date_label": core.fmt_date_pt(slot), "time_label": core.fmt_time_pt(slot), "party_size": b["party_size"],
        "ambassador": ambassador_label(conn, b) if b["status"] == "confirmado" or b["group_status"] == "realizado" else "",
        "meeting_point": cfg["meeting_point"], "what_to_bring": cfg["what_to_bring"],
        "can_cancel": can_change, "can_reschedule": can_change and b["reschedule_count"] < cfg["max_reschedules"],
        "reschedules_left": max(0, cfg["max_reschedules"] - b["reschedule_count"]),
        "presence_confirmed": bool(b["presence_confirmed_at"]), "cancel_cutoff_hours": cfg["cancel_cutoff_hours"],
        "nps_link": f"/nps/{nps_token(b['id'])}" if b["status"] in ("realizado",) else None,
        "party": b["party_size"],
    }

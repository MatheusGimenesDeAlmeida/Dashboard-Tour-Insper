"""Indicadores do painel de Admissões (seção 12), calculados a partir de bookings, eventos, convites e NPS."""
from datetime import date, datetime, timedelta

from . import core, domain
from .core import iso, parse_iso


def _period(from_date, to_date):
    start = datetime.combine(from_date, datetime.min.time(), tzinfo=core.TZ)
    end = datetime.combine(to_date + timedelta(days=1), datetime.min.time(), tzinfo=core.TZ)
    return iso(start), iso(end)


def _avg(xs):
    return round(sum(xs) / len(xs), 1) if xs else None


def _p90(xs):
    if not xs:
        return None
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(round(0.9 * (len(xs) - 1))))], 1)


def _pct(a, b):
    return round(100.0 * a / b, 1) if b else None


def dashboard(conn, from_date, to_date):
    start, end = _period(from_date, to_date)
    cfg = core.get_config(conn)
    bookings = core.rows(conn.execute(
        "SELECT b.*, g.slot_start, c.course_interest, c.is_treineiro FROM bookings b JOIN tour_groups g ON g.id=b.tour_group_id "
        "JOIN candidates c ON c.id=b.candidate_id WHERE g.slot_start >= ? AND g.slot_start < ?", (start, end)))
    total = len(bookings)
    realized = [b for b in bookings if b["outcome"] == "realizado"]
    no_show = [b for b in bookings if b["outcome"] == "nao_compareceu"]
    canc_cand = [b for b in bookings if b["status"] == "cancelado_candidato"]
    canc_adm = [b for b in bookings if b["status"] == "cancelado_admissoes"]
    pending_presence = [b for b in bookings if b["status"] == "presenca_pendente"]

    excl_h = cfg["metric_cancel_exclusion_hours"]
    early_cancel = [b for b in canc_cand if b["cancelled_at"]
                    and parse_iso(b["slot_start"]) - parse_iso(b["cancelled_at"]) >= timedelta(hours=excl_h)]
    adjusted_base = total - len(early_cancel)

    # tempo até a primeira confirmação: envio do M1 − criação
    first_conf, tour_conf = [], []
    ids = [b["id"] for b in bookings]
    if ids:
        marks = ",".join("?" * len(ids))
        sent = {r["booking_id"]: r["sent_at"] for r in conn.execute(
            f"SELECT booking_id, MIN(sent_at) sent_at FROM notifications WHERE template_code='M1' AND channel='email' "
            f"AND sent_at IS NOT NULL AND booking_id IN ({marks}) GROUP BY booking_id", ids)}
        for b in bookings:
            if b["id"] in sent:
                first_conf.append((parse_iso(sent[b["id"]]) - parse_iso(b["created_at"])).total_seconds())
            if b["confirmed_at"]:
                tour_conf.append((parse_iso(b["confirmed_at"]) - parse_iso(b["created_at"])).total_seconds() / 3600)

    groups = core.rows(conn.execute("SELECT * FROM tour_groups WHERE slot_start >= ? AND slot_start < ?", (start, end)))
    group_ids = [g["id"] for g in groups]
    realized_groups = {b["tour_group_id"] for b in realized}
    manual = 0
    if ids or group_ids:
        manual = core.one(conn.execute(
            "SELECT COUNT(*) n FROM events WHERE is_manual=1 AND ((entity_type='booking' AND entity_id IN ({})) "
            "OR (entity_type='group' AND entity_id IN ({})))".format(",".join("?" * len(ids)) or "NULL",
                                                                     ",".join("?" * len(group_ids)) or "NULL"),
            ids + group_ids))["n"]
    exc_groups = [g for g in groups if g["exception_opened_at"]]
    resolution = [(parse_iso(g["exception_resolved_at"]) - parse_iso(g["exception_opened_at"])).total_seconds() / 3600
                  for g in exc_groups if g["exception_resolved_at"]]

    invs = core.rows(conn.execute(
        "SELECT i.* FROM invitations i JOIN tour_groups g ON g.id=i.tour_group_id WHERE g.slot_start >= ? AND g.slot_start < ? "
        "AND i.sent_at IS NOT NULL AND i.rank > 0", (start, end)))
    accepted = [i for i in invs if i["status"] in ("aceito", "desistiu")]
    responded = [i for i in invs if i["responded_at"] and i["status"] in ("aceito", "recusado", "desistiu")]
    response_h = [(parse_iso(i["responded_at"]) - parse_iso(i["sent_at"])).total_seconds() / 3600 for i in responded]

    nps = core.rows(conn.execute(
        "SELECT r.* FROM nps_responses r JOIN bookings b ON b.id=r.booking_id JOIN tour_groups g ON g.id=b.tour_group_id "
        "WHERE g.slot_start >= ? AND g.slot_start < ?", (start, end)))
    promoters = sum(1 for r in nps if r["score"] >= 9)
    detractors = sum(1 for r in nps if r["score"] <= 6)
    nps_score = round(100.0 * (promoters - detractors) / len(nps), 1) if nps else None
    amb_ratings = [r["ambassador_rating"] for r in nps if r["ambassador_rating"]]

    # ocupação: pessoas (ativas ou realizadas) ÷ capacidade ofertada, por dia da semana e horário
    ambs = domain.load_ambassadors(conn)
    occ = {}
    d = from_date
    while d <= to_date:
        if d.weekday() in cfg["weekdays"]:
            for t in cfg["start_times"]:
                n_amb = sum(1 for a in ambs if domain.ambassador_available(a, d.isoformat(), t))
                key = (d.weekday(), t)
                occ.setdefault(key, [0, 0])[1] += n_amb * cfg["group_capacity"]
        d += timedelta(days=1)
    for b in bookings:
        if b["status"] in ("aguardando_embaixador", "confirmado", "excecao", "realizado", "encerrado", "presenca_pendente", "nao_compareceu"):
            dt = core.local(parse_iso(b["slot_start"]))
            key = (dt.weekday(), dt.strftime("%H:%M"))
            occ.setdefault(key, [0, 0])[0] += b["party_size"]
    occupancy = [{"weekday": k[0], "weekday_label": core.WEEKDAYS_PT[k[0]], "time": k[1], "people": v[0], "capacity": v[1],
                  "pct": _pct(v[0], v[1])} for k, v in sorted(occ.items())]

    by_course = {}
    for b in bookings:
        c = b["course_interest"] or "Não informado"
        by_course.setdefault(c, {"course": c, "total": 0, "treineiros": 0})
        by_course[c]["total"] += 1
        by_course[c]["treineiros"] += 1 if b["is_treineiro"] else 0

    return {
        "period": {"from": from_date.isoformat(), "to": to_date.isoformat()},
        "totals": {"bookings": total, "realized": len(realized), "no_show": len(no_show), "cancelled_candidate": len(canc_cand),
                   "cancelled_admissions": len(canc_adm), "presence_pending": len(pending_presence),
                   "early_cancellations_excluded": len(early_cancel)},
        "realized_rate": {"gross": _pct(len(realized), total), "adjusted": _pct(len(realized), adjusted_base),
                          "target": 85, "baseline": 63, "exclusion_hours": excl_h},
        "first_confirmation_seconds": {"avg": _avg(first_conf), "p90": _p90(first_conf), "target": 300, "baseline": 26 * 3600},
        "tour_confirmation_hours": {"avg": _avg(tour_conf)},
        "manual_tasks_per_tour": {"value": round(manual / len(realized_groups), 2) if realized_groups else None,
                                  "manual_events": manual, "realized_groups": len(realized_groups), "target": 3, "baseline": 8},
        "exceptions": {"count": len(exc_groups), "pct": _pct(len(exc_groups), len(groups)), "groups": len(groups),
                       "avg_resolution_hours": _avg(resolution),
                       "open": sum(1 for g in groups if g["in_exception"] and g["status"] == "aberto")},
        "ambassador_acceptance": {"rate": _pct(len(accepted), len(invs)), "invitations": len(invs),
                                  "avg_response_hours": _avg(response_h)},
        "nps": {"score": nps_score, "responses": len(nps), "response_rate": _pct(len(nps), len(realized)),
                "promoters": promoters, "detractors": detractors, "target": 90,
                "ambassador_rating_avg": _avg(amb_ratings)},
        "occupancy": occupancy,
        "by_course": sorted(by_course.values(), key=lambda x: -x["total"]),
        "funnel": {"booked": total, "confirmed": sum(1 for b in bookings if b["confirmed_at"]), "realized": len(realized), "nps": len(nps)},
        "journey": _journey(conn, bookings, nps, start, end),
        "messages": _messages(conn, start, end),
        "weekly": _weekly(from_date, to_date, bookings),
    }


TEMPLATE_AUDIENCE = {"M1": "candidato", "M2": "candidato", "M3": "candidato", "M4": "candidato", "M5": "candidato", "M6": "candidato",
                     "MX1": "candidato", "MX2": "candidato", "M7": "embaixador", "M8": "embaixador", "M9": "embaixador", "M10": "embaixador",
                     "M12": "embaixador", "M11": "admissoes", "M11D": "admissoes", "LOGIN": "acesso"}


def _journey(conn, bookings, nps, start, end):
    """Quantas visitas do período chegaram a cada etapa e quantas mensagens saíram em cada uma."""
    ids = [b["id"] for b in bookings] or [0]
    marks = ",".join("?" * len(ids))

    def msgs(codes):
        cm = ",".join("?" * len(codes))
        r = core.rows(conn.execute(f"SELECT channel, COUNT(*) n FROM notifications WHERE template_code IN ({cm}) AND booking_id IN ({marks}) GROUP BY channel",
                                   (*codes, *ids)))
        by = {x["channel"]: x["n"] for x in r}
        return {"email": by.get("email", 0), "whatsapp": by.get("whatsapp", 0)}
    invites = core.one(conn.execute(f"SELECT COUNT(*) n FROM invitations WHERE sent_at IS NOT NULL AND rank > 0 AND tour_group_id IN "
                                    f"(SELECT tour_group_id FROM bookings WHERE id IN ({marks}))", ids))["n"]
    realized_ids = [b["id"] for b in bookings if b["outcome"] == "realizado"] or [0]
    closed = core.one(conn.execute("SELECT COUNT(DISTINCT booking_id) n FROM crm_sync_log WHERE operation='closeActivity' AND booking_id IN ({})"
                                   .format(",".join("?" * len(realized_ids))), realized_ids))["n"]
    return [
        {"key": "booked", "label": "Agendados", "icon": "calendar", "count": len(bookings), "msg": msgs(["M1"]), "note": "confirmação do pedido"},
        {"key": "confirmed", "label": "Embaixador confirmado", "icon": "users", "count": sum(1 for b in bookings if b["confirmed_at"]), "msg": msgs(["M2"]),
         "note": f"{invites} convites a embaixadores"},
        {"key": "reminded", "label": "Lembrados (D-1)", "icon": "bell", "count": sum(1 for b in bookings if b["reminder_sent_at"]), "msg": msgs(["M3"]), "note": "lembrete na véspera"},
        {"key": "realized", "label": "Realizados", "icon": "pin", "count": sum(1 for b in bookings if b["outcome"] == "realizado"), "msg": None,
         "note": f"{sum(1 for b in bookings if b['outcome'] == 'nao_compareceu')} não vieram"},
        {"key": "nps", "label": "Avaliaram", "icon": "star", "count": len(nps), "msg": msgs(["M6"]), "note": "pedido de NPS"},
        {"key": "closed", "label": "Encerrados no CRM", "icon": "check-circle", "count": closed, "msg": None, "note": "sem trabalho manual"},
    ]


def _messages(conn, start, end):
    names = {r["code"]: r["name"] for r in conn.execute("SELECT code, name FROM message_templates")}
    ns = core.rows(conn.execute("SELECT template_code, channel, status FROM notifications WHERE created_at >= ? AND created_at < ?", (start, end)))
    by = {}
    for n in ns:
        by[n["template_code"]] = by.get(n["template_code"], 0) + 1
    aud = lambda code: TEMPLATE_AUDIENCE.get(code, "candidato")
    return {"total": len(ns), "email": sum(1 for n in ns if n["channel"] == "email"), "whatsapp": sum(1 for n in ns if n["channel"] == "whatsapp"),
            "failed": sum(1 for n in ns if n["status"] == "falhou"),
            "by_audience": [{"audience": a, "count": sum(1 for n in ns if aud(n["template_code"]) == a)} for a in ("candidato", "embaixador", "admissoes")],
            "by_template": sorted([{"code": c, "name": names.get(c, c), "audience": aud(c), "count": k} for c, k in by.items()], key=lambda x: -x["count"])}


def _weekly(from_date, to_date, bookings):
    out = []
    w = from_date - timedelta(days=from_date.weekday())
    while w <= to_date:
        s, e = _period(w, w + timedelta(days=6))
        in_w = [b for b in bookings if s <= b["slot_start"] < e]
        out.append({"week_start": w.isoformat(), "bookings": len(in_w), "realized": sum(1 for b in in_w if b["outcome"] == "realizado")})
        w += timedelta(days=7)
    return out


def ambassador_facts(conn, amb_id):
    """Números do embaixador para níveis, benefícios e conquistas do portal."""
    now = core.now_utc()
    groups = core.rows(conn.execute("SELECT * FROM tour_groups WHERE ambassador_id=?", (amb_id,)))
    done = [g for g in groups if g["status"] == "realizado"]
    month_start = core.today_local().replace(day=1).isoformat()
    since = iso(now - timedelta(days=90))
    invs = core.rows(conn.execute("SELECT * FROM invitations WHERE ambassador_id=? AND rank > 0 AND sent_at >= ? AND status != 'enviado'",
                                  (amb_id, since)))
    accepted = [i for i in invs if i["status"] in ("aceito", "desistiu")]
    gids = [g["id"] for g in groups] or [0]
    marks = ",".join("?" * len(gids))
    my = core.rows(conn.execute(f"SELECT * FROM bookings WHERE tour_group_id IN ({marks})", gids))
    ratings = [r["ambassador_rating"] for r in conn.execute(
        f"SELECT r.ambassador_rating FROM nps_responses r JOIN bookings b ON b.id=r.booking_id WHERE b.tour_group_id IN ({marks}) "
        "AND r.ambassador_rating IS NOT NULL", gids)]
    return {
        "tours_total": len(done),
        "tours_month": sum(1 for g in done if core.local(parse_iso(g["slot_start"])).date().isoformat() >= month_start),
        "upcoming": sum(1 for g in groups if g["status"] == "com_embaixador" and parse_iso(g["slot_start"]) > now),
        "people_total": sum(b["party_size"] for b in my if b["outcome"] == "realizado"),
        "accept_rate": round(100 * len(accepted) / len(invs)) if invs else None,
        "fast_accepts": sum(1 for i in accepted if (parse_iso(i["responded_at"]) - parse_iso(i["sent_at"])) <= timedelta(hours=1)),
        "rating_avg": round(sum(ratings) / len(ratings), 1) if ratings else None,
        "five_stars": sum(1 for r in ratings if r == 5),
        "foreign_tours": sum(1 for b in my if b["outcome"] == "realizado" and b["language"] != "Português"),
        "pending_presence": sum(1 for b in my if b["status"] == "presenca_pendente"),
        "gifts_pending": core.one(conn.execute("SELECT COUNT(*) n FROM gifts WHERE ambassador_id=? AND collected_at IS NULL", (amb_id,)))["n"],
        "game": _gamification(conn, amb_id, groups, done, accepted, gids),
    }


# Pontos do semestre (referência: Uber Pro), sequência semanal (Duolingo) e desafios do mês.
# Horário em alta = quinta ou sexta, às 10h ou 15h (os mais procurados nos dados de Admissões).
POINTS = {"tour": 10, "hot": 5, "fast": 2, "five": 3}


def is_hot(slot_start):
    dt = core.local(parse_iso(slot_start))
    return dt.weekday() in (3, 4) and dt.strftime("%H:%M") in ("10:00", "15:00")


def _gamification(conn, amb_id, groups, done, accepted, gids):
    now = core.now_utc()
    since = now - timedelta(days=182)
    month_start = core.today_local().replace(day=1)
    sem = [g for g in done if parse_iso(g["slot_start"]) >= since]
    fast = [i for i in accepted if (parse_iso(i["responded_at"]) - parse_iso(i["sent_at"])) <= timedelta(hours=1)]
    marks = ",".join("?" * len(gids))
    five = core.one(conn.execute(f"SELECT COUNT(*) n FROM nps_responses r JOIN bookings b ON b.id=r.booking_id WHERE r.ambassador_rating=5 "
                                 f"AND r.created_at >= ? AND b.tour_group_id IN ({marks})", (iso(since), *gids)))["n"]
    parts = {"tours": len(sem) * POINTS["tour"], "hot": sum(1 for g in sem if is_hot(g["slot_start"])) * POINTS["hot"],
             "fast": sum(1 for i in fast if parse_iso(i["responded_at"]) >= since) * POINTS["fast"], "five": five * POINTS["five"]}
    monday = lambda d: d - timedelta(days=d.weekday())
    weeks = {monday(core.local(parse_iso(g["slot_start"])).date()) for g in groups if g["status"] in ("realizado", "com_embaixador")}
    w = monday(core.today_local())
    this_week = w in weeks
    if not this_week:
        w -= timedelta(days=7)
    streak = 0
    while w in weeks:
        streak += 1
        w -= timedelta(days=7)
    month = [g for g in done if core.local(parse_iso(g["slot_start"])).date() >= month_start]
    fast_month = sum(1 for i in fast if core.local(parse_iso(i["responded_at"])).date() >= month_start)
    return {"points": sum(parts.values()), "parts": parts, "rules": POINTS, "streak": streak, "this_week": this_week,
            "challenges": [
                {"id": "tours3", "title": "Conduza 3 tours no mês", "progress": len(month), "goal": 3, "reward": 15},
                {"id": "hot1", "title": "Um tour em horário em alta", "progress": sum(1 for g in month if is_hot(g["slot_start"])), "goal": 1, "reward": 5},
                {"id": "fast2", "title": "Aceite 2 convites em até 1 h", "progress": fast_month, "goal": 2, "reward": 4}]}


def ambassador_opportunities(conn, amb_id):
    """Grupos que ficaram sem embaixador (dá para assumir) e horários em alta onde o embaixador ainda não está disponível."""
    from . import domain
    now = core.now_utc()
    out = {"claimable": [], "hot": []}
    for g in core.rows(conn.execute("SELECT * FROM tour_groups WHERE status='aberto' AND in_exception=1 AND slot_start > ? ORDER BY slot_start",
                                    (iso(now + timedelta(hours=2)),))):
        if amb_id in domain.busy_slots(conn, g["slot_start"], exclude_group_id=g["id"]):
            continue
        bs = domain.group_bookings(conn, g["id"])
        out["claimable"].append({"group_id": g["id"], "slot_start": g["slot_start"], "people": sum(b["party_size"] for b in bs),
                                 "courses": sorted({b["course_interest"] for b in bs}), "hot": is_hot(g["slot_start"])})
    ambs = domain.load_ambassadors(conn)
    me = next((a for a in ambs if a["id"] == amb_id), None)
    cfg = core.get_config(conn)
    today = core.today_local()
    hot = []
    for s in domain.compute_slots(conn, today + timedelta(days=1), today + timedelta(days=14), 1):
        if s.get("reason") or not is_hot(s["slot_start"]) or (me and domain.ambassador_available(me, s["date"], s["time"])):
            continue
        st = domain.slot_state(conn, s["slot_start"], cfg, ambs)
        hot.append({"date": s["date"], "time": s["time"], "slot_start": s["slot_start"], "booked": sum(g["booked"] for g in st["groups"]),
                    "ambassadors": len(st["groups"]), "remaining": s["remaining"]})
    out["hot"] = sorted(hot, key=lambda x: (x["remaining"], x["slot_start"]))[:4]
    return out


def ambassador_stats(conn, since_days=90):
    since = iso(core.now_utc() - timedelta(days=since_days))
    out = {}
    for a in core.rows(conn.execute("SELECT id FROM ambassadors")):
        out[a["id"]] = {"tours": 0, "invites": 0, "accepted": 0, "declined": 0, "expired": 0, "nps_avg": None,
                        "gifts_pending": 0, "gifts_collected": 0}
    for r in conn.execute("SELECT ambassador_id, COUNT(*) n FROM tour_groups WHERE status='realizado' AND ambassador_id IS NOT NULL "
                          "AND slot_start >= ? GROUP BY ambassador_id", (since,)):
        out.setdefault(r["ambassador_id"], {})["tours"] = r["n"]
    for r in conn.execute("SELECT ambassador_id, status, COUNT(*) n FROM invitations WHERE sent_at >= ? AND rank > 0 "
                          "GROUP BY ambassador_id, status", (since,)):
        s = out.setdefault(r["ambassador_id"], {})
        s["invites"] = s.get("invites", 0) + r["n"]
        key = {"aceito": "accepted", "desistiu": "accepted", "recusado": "declined", "expirado": "expired"}.get(r["status"])
        if key:
            s[key] = s.get(key, 0) + r["n"]
    for r in conn.execute("SELECT g.ambassador_id, AVG(r.ambassador_rating) a FROM nps_responses r JOIN bookings b ON b.id=r.booking_id "
                          "JOIN tour_groups g ON g.id=b.tour_group_id WHERE r.ambassador_rating IS NOT NULL GROUP BY g.ambassador_id"):
        if r["ambassador_id"] in out:
            out[r["ambassador_id"]]["nps_avg"] = round(r["a"], 2)
    for r in conn.execute("SELECT ambassador_id, SUM(collected_at IS NULL) p, SUM(collected_at IS NOT NULL) c FROM gifts GROUP BY ambassador_id"):
        if r["ambassador_id"] in out:
            out[r["ambassador_id"]]["gifts_pending"] = r["p"]
            out[r["ambassador_id"]]["gifts_collected"] = r["c"]
    return out

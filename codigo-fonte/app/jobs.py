"""Jobs agendados (seção 13). Todos são idempotentes: cada mensagem tem uma chave única em notifications.dedupe_key,
então rodar duas vezes não envia duas mensagens. O agendador roda todos a cada minuto e cada job decide,
pelo relógio local, se é hora de agir."""
import json
import threading
import time as _time
import traceback
from datetime import datetime, timedelta

from . import core, domain, integrations, notify
from .core import iso, now_utc, parse_iso


def _local_now():
    return core.local(now_utc())


def _after(hhmm):
    h, m = (int(x) for x in hhmm.split(":"))
    n = _local_now()
    return (n.hour, n.minute) >= (h, m)


def _day_bounds(d):
    start = datetime.combine(d, datetime.min.time(), tzinfo=core.TZ)
    return iso(start), iso(start + timedelta(days=1))


def send_reminders(conn):
    """M3 — lembrete D-1 no horário configurado. Agendamentos feitos com menos de 24h não recebem lembrete separado."""
    cfg = core.get_config(conn)
    if not _after(cfg["reminder_time"]):
        return 0
    start, end = _day_bounds(core.today_local() + timedelta(days=1))
    n = 0
    for b in core.rows(conn.execute(
            "SELECT b.id FROM bookings b JOIN tour_groups g ON g.id=b.tour_group_id WHERE g.slot_start >= ? AND g.slot_start < ? "
            "AND b.status IN ('aguardando_embaixador','confirmado','excecao') AND b.reminder_sent_at IS NULL", (start, end))):
        full = domain.booking_full(conn, b["id"])
        if parse_iso(full["slot_start"]) - parse_iso(full["created_at"]) < timedelta(hours=24):
            continue
        with core.tx(conn):
            if conn.execute("UPDATE bookings SET reminder_sent_at=? WHERE id=? AND reminder_sent_at IS NULL",
                            (iso(now_utc()), b["id"])).rowcount:
                n += notify.enqueue_candidate(conn, full, "M3", domain.candidate_vars(conn, full, cfg),
                                              dedupe_suffix=full["slot_start"])
    return n


def expire_invitations(conn):
    with core.tx(conn):
        n = domain.expire_invitations(conn)
        domain.remind_invitations(conn)
    return n


def ambassador_day_before(conn):
    """M9 — 18h do dia anterior."""
    if not _after("18:00"):
        return 0
    start, end = _day_bounds(core.today_local() + timedelta(days=1))
    n = 0
    with core.tx(conn):
        for g in core.rows(conn.execute("SELECT * FROM tour_groups WHERE status='com_embaixador' AND ambassador_id IS NOT NULL "
                                        "AND slot_start >= ? AND slot_start < ?", (start, end))):
            domain.notify_ambassador(conn, g, g["ambassador_id"], "M9", "d-1")
            n += 1
    return n


def mark_attendance_pending(conn):
    """RN-28 — depois das 23h59 do dia do tour, quem não teve presença marcada vira 'presenca_pendente'."""
    start, _ = _day_bounds(core.today_local())
    with core.tx(conn):
        cur = conn.execute(
            "UPDATE bookings SET status='presenca_pendente', updated_at=? WHERE status IN ('confirmado','aguardando_embaixador','excecao') "
            "AND tour_group_id IN (SELECT id FROM tour_groups WHERE slot_start < ?)", (iso(now_utc()), start))
        return cur.rowcount


def attendance_pending(conn):
    """M12 — 9h do dia seguinte ao tour, para embaixador e Admissões."""
    if not _after("09:00"):
        return 0
    start, end = _day_bounds(core.today_local() - timedelta(days=1))
    n = 0
    with core.tx(conn):
        for g in core.rows(conn.execute(
                "SELECT DISTINCT g.* FROM tour_groups g JOIN bookings b ON b.tour_group_id=g.id WHERE b.status='presenca_pendente' "
                "AND g.slot_start >= ? AND g.slot_start < ?", (start, end))):
            if g["ambassador_id"]:
                domain.notify_ambassador(conn, g, g["ambassador_id"], "M12", "pendente")
            slot = parse_iso(g["slot_start"])
            domain.notify_admissions(conn, "M12", f"g{g['id']}", {"embaixador": "equipe de Admissões",
                                                                  "data": core.fmt_date_pt(slot), "hora": core.fmt_time_pt(slot),
                                                                  "link_portal": f"{core.APP_BASE_URL}/admin"})
            n += 1
    return n


def nps_followup(conn):
    """M6 (reenvio único) — 10h do D+1 para quem fez o tour ontem e não respondeu."""
    if not _after("10:00"):
        return 0
    cfg = core.get_config(conn)
    start, end = _day_bounds(core.today_local() - timedelta(days=1))
    n = 0
    with core.tx(conn):
        for b in core.rows(conn.execute(
                "SELECT b.id FROM bookings b JOIN tour_groups g ON g.id=b.tour_group_id LEFT JOIN nps_responses r ON r.booking_id=b.id "
                "WHERE b.status='realizado' AND r.id IS NULL AND g.slot_start >= ? AND g.slot_start < ?", (start, end))):
            full = domain.booking_full(conn, b["id"])
            n += notify.enqueue_candidate(conn, full, "M6", domain.candidate_vars(conn, full, cfg), dedupe_suffix="d+1")
    return n


def close_crm_activity(conn):
    """RN-16 — às 23h do D+1, encerra os tours realizados sem resposta de NPS."""
    limit_day = core.today_local() - timedelta(days=1) if _after("23:00") else core.today_local() - timedelta(days=2)
    _, end = _day_bounds(limit_day)
    n = 0
    with core.tx(conn):
        for b in core.rows(conn.execute("SELECT b.id FROM bookings b JOIN tour_groups g ON g.id=b.tour_group_id "
                                        "WHERE b.status='realizado' AND g.slot_start < ?", (end,))):
            n += domain.close_booking(conn, b["id"], "sem_resposta_nps")
    return n


def exceptions_digest(conn):
    """M11D — resumo diário às 8h."""
    if not _after("08:00"):
        return 0
    groups = core.rows(conn.execute("SELECT * FROM tour_groups WHERE in_exception=1 AND status='aberto' ORDER BY slot_start"))
    if not groups:
        return 0
    lines = []
    for g in groups:
        slot = parse_iso(g["slot_start"])
        lines.append(f"• {core.fmt_date_pt(slot)}, {core.fmt_time_pt(slot)} — {domain.group_people(conn, g['id'])} pessoa(s)")
    with core.tx(conn):
        domain.notify_admissions(conn, "M11D", core.today_local().isoformat(), {"qtd": len(groups), "lista": "\n".join(lines)})
    return len(groups)


def crm_retry(conn):
    with core.tx(conn):
        return integrations.process(conn)


def anonymize_old(conn):
    """LGPD — anonimiza dados pessoais N meses após o tour (padrão 24)."""
    cfg = core.get_config(conn)
    cutoff = iso(now_utc() - timedelta(days=30 * cfg["retention_months"]))
    with core.tx(conn):
        ids = [r["candidate_id"] for r in conn.execute(
            "SELECT b.candidate_id FROM bookings b JOIN tour_groups g ON g.id=b.tour_group_id JOIN candidates c ON c.id=b.candidate_id "
            "WHERE c.anonymized_at IS NULL GROUP BY b.candidate_id HAVING MAX(g.slot_start) < ?", (cutoff,))]
        for cid in ids:
            anonymize_candidate(conn, cid)
    return len(ids)


def anonymize_candidate(conn, candidate_id):
    conn.execute("UPDATE candidates SET full_name='Anonimizado', email='anonimizado@invalid', phone='', "
                 "cpf_encrypted='', cpf_hash=?, anonymized_at=? WHERE id=?", (f"anon-{candidate_id}", iso(now_utc()), candidate_id))
    conn.execute("UPDATE bookings SET companions_names='[]', mobility_notes=NULL, questions=NULL WHERE candidate_id=?", (candidate_id,))
    core.log_event(conn, "candidate", candidate_id, "candidate.anonymized")


JOBS = [
    ("expire-invitations", expire_invitations),
    ("send-reminders", send_reminders),
    ("ambassador-day-before", ambassador_day_before),
    ("mark-attendance-pending", mark_attendance_pending),
    ("attendance-pending", attendance_pending),
    ("nps-followup", nps_followup),
    ("close-crm-activity", close_crm_activity),
    ("exceptions-digest", exceptions_digest),
    ("crm-retry", crm_retry),
    ("anonymize", anonymize_old),
]


def run_all(conn):
    results = {}
    for name, fn in JOBS:
        started = iso(now_utc())
        try:
            results[name] = fn(conn)
            status, detail = "ok", str(results[name])
        except Exception:
            status, detail = "falhou", traceback.format_exc()[-1500:]
            results[name] = "falhou"
        conn.execute("INSERT INTO job_runs(job, started_at, finished_at, status, detail) VALUES (?,?,?,?,?)",
                     (name, started, iso(now_utc()), status, detail))
        if status == "falhou":
            with core.tx(conn):
                domain.notify_admissions(conn, "M11", f"job:{name}:{started[:13]}", {
                    "data": "—", "hora": "—", "pessoas": "—", "motivo": f"O job {name} falhou. Veja Saúde dos jobs no painel."})
    notify.flush(conn)
    conn.execute("DELETE FROM job_runs WHERE id NOT IN (SELECT id FROM job_runs ORDER BY id DESC LIMIT 2000)")
    return results


class Scheduler(threading.Thread):
    daemon = True

    def __init__(self, interval=60):
        super().__init__(name="scheduler")
        self.interval = interval
        self.stop_event = threading.Event()

    def run(self):
        conn = core.connect()
        while not self.stop_event.is_set():
            try:
                run_all(conn)
            except Exception:
                traceback.print_exc()
            self.stop_event.wait(self.interval)

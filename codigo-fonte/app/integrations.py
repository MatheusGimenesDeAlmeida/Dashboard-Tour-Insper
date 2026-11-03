"""CRM (CrmAdapter) e webhooks de saída. Tudo passa pela fila crm_sync_log, com retentativas e backoff:
falha de integração nunca impede o candidato de agendar."""
import hashlib
import hmac
import json
import urllib.request
from datetime import timedelta

from . import core
from .core import iso, now_utc


class MockCrmAdapter:
    """v1: simula o CRM. O resultado de cada operação fica registrado em crm_sync_log."""
    name = "mock"

    def upsert_lead(self, lead):
        return {"crmId": "CRM-" + hashlib.sha1(lead["cpf_hash"].encode()).hexdigest()[:8].upper()}

    def update_tour_status(self, crm_id, status, data=None):
        return None

    def close_activity(self, crm_id, result):
        return None


def _post_signed(url, secret, body):
    raw = json.dumps(body, ensure_ascii=False).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    req = urllib.request.Request(url, data=raw, method="POST", headers={
        "Content-Type": "application/json", "X-Signature-SHA256": sig, "User-Agent": "insper-tour/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"HTTP {resp.status}")
        return resp.read()


class WebhookCrmAdapter:
    """Envia cada operação de CRM como JSON assinado (HMAC-SHA256 no cabeçalho X-Signature-SHA256)."""
    name = "webhook"

    def __init__(self):
        self.url = core.env("CRM_WEBHOOK_URL")
        self.secret = core.env("CRM_WEBHOOK_SECRET", "")

    def upsert_lead(self, lead):
        _post_signed(self.url, self.secret, {"operation": "upsertLead", "lead": lead})
        return MockCrmAdapter().upsert_lead(lead)

    def update_tour_status(self, crm_id, status, data=None):
        _post_signed(self.url, self.secret, {"operation": "updateTourStatus", "crmId": crm_id, "status": status, "data": data or {}})

    def close_activity(self, crm_id, result):
        _post_signed(self.url, self.secret, {"operation": "closeActivity", "crmId": crm_id, "result": result})


def crm_adapter():
    return WebhookCrmAdapter() if core.env("CRM_ADAPTER", "mock") == "webhook" and core.env("CRM_WEBHOOK_URL") else MockCrmAdapter()


WEBHOOK_EVENTS = {"booking.created", "booking.confirmed", "booking.rescheduled", "booking.cancelled", "tour.completed", "nps.received"}


def queue_crm(conn, booking_id, operation, payload):
    conn.execute("INSERT INTO crm_sync_log(booking_id, kind, operation, payload, status, next_attempt_at, created_at) "
                 "VALUES (?,?,?,?,?,?,?)", (booking_id, "crm", operation, json.dumps(payload, ensure_ascii=False),
                                            "pendente", iso(now_utc()), iso(now_utc())))


def queue_webhook(conn, booking_id, event, payload):
    if event not in WEBHOOK_EVENTS or not core.env("WEBHOOK_URL"):
        return
    conn.execute("INSERT INTO crm_sync_log(booking_id, kind, operation, payload, status, next_attempt_at, created_at) "
                 "VALUES (?,?,?,?,?,?,?)", (booking_id, "webhook", event, json.dumps(payload, ensure_ascii=False),
                                            "pendente", iso(now_utc()), iso(now_utc())))


def process(conn, limit=100):
    """Processa a fila em ordem. Operações de status esperam o lead ter crm_id."""
    items = core.rows(conn.execute(
        "SELECT * FROM crm_sync_log WHERE status IN ('pendente','falhou') AND attempts < 8 AND next_attempt_at <= ? ORDER BY id LIMIT ?",
        (iso(now_utc()), limit)))
    adapter = crm_adapter()
    done = 0
    for it in items:
        payload = json.loads(it["payload"])
        try:
            if it["kind"] == "webhook":
                _post_signed(core.env("WEBHOOK_URL"), core.env("WEBHOOK_SECRET", ""), {"event": it["operation"], "data": payload})
            elif it["operation"] == "upsertLead":
                res = adapter.upsert_lead(payload)
                conn.execute("UPDATE bookings SET crm_id=? WHERE id=?", (res["crmId"], it["booking_id"]))
            else:
                b = core.one(conn.execute("SELECT crm_id FROM bookings WHERE id=?", (it["booking_id"],)))
                if not b or not b["crm_id"]:
                    continue  # aguarda o upsertLead anterior
                if it["operation"] == "closeActivity":
                    adapter.close_activity(b["crm_id"], payload)
                else:
                    adapter.update_tour_status(b["crm_id"], payload.get("status"), payload)
            conn.execute("UPDATE crm_sync_log SET status='ok', attempts=attempts+1, done_at=?, last_error=NULL WHERE id=?",
                         (iso(now_utc()), it["id"]))
            done += 1
        except Exception as e:
            backoff = timedelta(minutes=2 ** min(it["attempts"], 6))
            conn.execute("UPDATE crm_sync_log SET status='falhou', attempts=attempts+1, last_error=?, next_attempt_at=? WHERE id=?",
                         (str(e)[:500], iso(now_utc() + backoff), it["id"]))
    return done

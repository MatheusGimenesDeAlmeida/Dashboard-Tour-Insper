"""Servidor HTTP (biblioteca padrão do Python) com a API REST da seção 14 e as páginas."""
import csv
import io
import json
import mimetypes
import os
import re
import threading
import time
import traceback
from datetime import date, timedelta
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import core, domain, integrations, jobs, metrics, notify
from .core import iso, now_utc, parse_iso
from .domain import DomainError

STATIC_DIR = os.path.join(core.BASE_DIR, "static")
SESSION_COOKIE = "tour_session"
ROUTES = []


def route(method, pattern, role=None):
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), fn, role))
        return fn
    return deco


class Request:
    def __init__(self, handler, method, path, query, body, user, conn):
        self.handler, self.method, self.path, self.query, self.body, self.user, self.conn = \
            handler, method, path, query, body, user, conn

    def q(self, name, default=None):
        v = self.query.get(name)
        return v[0] if v else default

    @property
    def ip(self):
        return self.handler.headers.get("X-Forwarded-For", self.handler.client_address[0]).split(",")[0].strip()


class Response:
    def __init__(self, status=200, body=None, content_type="application/json; charset=utf-8", headers=None):
        self.status, self.body, self.content_type, self.headers = status, body, content_type, headers or {}


def json_resp(data, status=200, headers=None):
    return Response(status, json.dumps(data, ensure_ascii=False, default=str).encode(), headers=headers)


def csv_resp(filename, header, rows_):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(header)
    w.writerows(rows_)
    return Response(200, ("﻿" + buf.getvalue()).encode(), "text/csv; charset=utf-8",
                    {"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------------------------------------------------------- limite de requisições (anti-abuso)
_rate = {}
_rate_lock = threading.Lock()


def rate_limit(key, limit, window_s):
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate.get(key, []) if now - t < window_s]
        if len(hits) >= limit:
            raise DomainError("Muitas tentativas em pouco tempo. Aguarde alguns minutos.", "limite", 429)
        hits.append(now)
        _rate[key] = hits


def run_in_tx(req, fn, *args, **kwargs):
    with core.tx(req.conn):
        result = fn(req.conn, *args, **kwargs)
    notify.flush(req.conn)
    return result


def parse_date(s, default):
    try:
        return date.fromisoformat(s) if s else default
    except ValueError:
        raise DomainError("Data inválida.", "validacao", 422)


# ================================================================ público
@route("GET", "/api/public/config")
def public_config(req):
    cfg = core.get_config(req.conn)
    courses = [r["name"] for r in req.conn.execute("SELECT name FROM courses WHERE active=1 ORDER BY ord, name")]
    return json_resp({
        "courses": courses, "languages": cfg["languages"], "group_capacity": cfg["group_capacity"],
        "hidden_fields": cfg["hidden_fields"], "meeting_point": cfg["meeting_point"], "what_to_bring": cfg["what_to_bring"],
        "privacy_url": cfg["privacy_url"], "virtual_tour_url": cfg["virtual_tour_url"], "max_days_ahead": cfg["max_days_ahead"],
        "min_lead_hours": cfg["min_lead_hours"], "today": core.today_local().isoformat(), "now": iso(now_utc()),
        "dev": core.APP_ENV == "dev",
    })


@route("GET", "/api/public/slots")
def public_slots(req):
    today = core.today_local()
    cfg = core.get_config(req.conn)
    frm = parse_date(req.q("from"), today)
    to = parse_date(req.q("to"), today + timedelta(days=cfg["max_days_ahead"]))
    to = min(to, today + timedelta(days=cfg["max_days_ahead"] + 1))
    try:
        party = max(1, min(cfg["group_capacity"], int(req.q("party", "1"))))
    except ValueError:
        party = 1
    exclude = None
    if req.q("token"):
        exclude = core.verify_token(req.q("token"), "manage")
    slots = domain.compute_slots(req.conn, frm, to, party, exclude_booking_id=exclude)
    return json_resp({"party": party, "slots": slots})


@route("POST", "/api/public/bookings")
def public_create_booking(req):
    if req.body.get("website"):  # honeypot
        raise DomainError("Não foi possível concluir o pedido.", "bloqueado", 400)
    rate_limit(f"booking:{req.ip}", 10, 600)
    b = domain.create_booking_tx(req.conn, req.body)
    cfg = core.get_config(req.conn)
    token = domain.manage_token(b["id"])
    view = domain.public_view(req.conn, b, cfg)
    view.update({"manage_url": f"/minha-visita/{token}", "ics_url": f"/api/public/bookings/{token}/ics"})
    return json_resp(view, 201)


def _booking_from_token(req, token):
    bid = core.verify_token(token, "manage")
    b = domain.booking_full(req.conn, bid) if bid else None
    if not b:
        raise DomainError("Link inválido ou expirado.", "token_invalido", 404)
    if parse_iso(b["slot_start"]) + timedelta(days=7) < now_utc():  # válido até 7 dias após o tour
        raise DomainError("Este link expirou.", "token_expirado", 410)
    return b


@route("GET", r"/api/public/bookings/(?P<token>[\w\-\.]+)")
def public_get_booking(req, token):
    b = _booking_from_token(req, token)
    view = domain.public_view(req.conn, b, core.get_config(req.conn))
    view["ics_url"] = f"/api/public/bookings/{token}/ics"
    return json_resp(view)


@route("GET", r"/api/public/bookings/(?P<token>[\w\-\.]+)/ics")
def public_ics(req, token):
    b = _booking_from_token(req, token)
    cfg = core.get_config(req.conn)
    ics = notify.make_ics(b["id"], b["protocol"], b["slot_start"], cfg["duration_min"], cfg["meeting_point"])
    return Response(200, ics.encode(), "text/calendar; charset=utf-8", {"Content-Disposition": 'attachment; filename="visita-insper.ics"'})


@route("POST", r"/api/public/bookings/(?P<token>[\w\-\.]+)/reschedule")
def public_reschedule(req, token):
    b = _booking_from_token(req, token)
    nb = run_in_tx(req, domain.reschedule_booking, b["id"], req.body.get("slot_start"), actor="candidate")
    return json_resp(domain.public_view(req.conn, nb, core.get_config(req.conn)))


@route("POST", r"/api/public/bookings/(?P<token>[\w\-\.]+)/cancel")
def public_cancel(req, token):
    b = _booking_from_token(req, token)
    nb = run_in_tx(req, domain.cancel_booking, b["id"], actor="candidate", reason=req.body.get("reason"))
    return json_resp(domain.public_view(req.conn, nb, core.get_config(req.conn)))


@route("POST", r"/api/public/bookings/(?P<token>[\w\-\.]+)/confirm-attendance")
def public_confirm(req, token):
    b = _booking_from_token(req, token)
    run_in_tx(req, domain.confirm_presence, b["id"])
    return json_resp(domain.public_view(req.conn, domain.booking_full(req.conn, b["id"]), core.get_config(req.conn)))


def _nps_booking(req, token):
    bid = core.verify_token(token, "nps")
    b = domain.booking_full(req.conn, bid) if bid else None
    if not b:
        raise DomainError("Link inválido.", "token_invalido", 404)
    return b


@route("GET", r"/api/public/nps/(?P<token>[\w\-\.]+)")
def public_nps_get(req, token):
    b = _nps_booking(req, token)
    answered = bool(core.one(req.conn.execute("SELECT id FROM nps_responses WHERE booking_id=?", (b["id"],))))
    slot = parse_iso(b["slot_start"])
    return json_resp({"first_name": core.first_name(b["full_name"]), "answered": answered, "date_label": core.fmt_date_pt(slot),
                      "ambassador": domain.ambassador_label(req.conn, b), "open": slot <= now_utc(),
                      "status": b["status"]})


@route("POST", r"/api/public/nps/(?P<token>[\w\-\.]+)")
def public_nps_post(req, token):
    b = _nps_booking(req, token)
    rate_limit(f"nps:{req.ip}", 30, 600)
    run_in_tx(req, domain.submit_nps, b["id"], req.body)
    return json_resp({"ok": True})


@route("GET", r"/api/public/nps-group/(?P<token>[\w\-\.]+)")
def public_nps_group(req, token):
    gid = core.verify_token(token, "npsg")
    g = domain.group_row(req.conn, gid) if gid else None
    if not g:
        raise DomainError("Link inválido.", "token_invalido", 404)
    people = []
    for b in domain.group_bookings(req.conn, gid, active_only=False):
        if b["status"] in ("confirmado", "realizado", "presenca_pendente", "encerrado"):
            answered = bool(core.one(req.conn.execute("SELECT id FROM nps_responses WHERE booking_id=?", (b["id"],))))
            people.append({"first_name": core.first_name(b["full_name"]), "token": domain.nps_token(b["id"]), "answered": answered})
    return json_resp({"date_label": core.fmt_date_pt(parse_iso(g["slot_start"])), "people": people})


# ================================================================ autenticação
@route("POST", "/api/auth/magic-link")
def auth_magic(req):
    email = (req.body.get("email") or "").strip().lower()
    rate_limit(f"login:{req.ip}", 8, 600)
    user = core.one(req.conn.execute("SELECT * FROM users WHERE email=?", (email,)))
    if user:
        token = core.sign_token("login", user["id"], now_utc() + timedelta(minutes=15))
        with core.tx(req.conn):
            notify.enqueue(req.conn, f"LOGIN:{user['id']}:{iso(now_utc())}", "LOGIN", email,
                           {"nome": core.first_name(user["name"]), "link_login": f"{core.APP_BASE_URL}/entrar/{token}"})
        notify.flush(req.conn)
    # mesma resposta exista ou não o e-mail (não revela quem tem acesso)
    return json_resp({"ok": True, "message": "Se o e-mail tiver acesso, enviamos um link para entrar. Ele vale por 15 minutos."})


def _login_response(req, user, redirect=None):
    req.conn.execute("UPDATE users SET last_login_at=? WHERE id=?", (iso(now_utc()), user["id"]))
    cookie = f"{SESSION_COOKIE}={core.sign_session(user['id'], user['role'])}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200"
    if APP_SECURE_COOKIES:
        cookie += "; Secure"
    target = redirect or ("/admin" if user["role"] == "admissions" else "/embaixador")
    if redirect is None and req.method == "POST":
        return json_resp({"ok": True, "redirect": target}, headers={"Set-Cookie": cookie})
    return Response(302, b"", "text/plain", {"Location": target, "Set-Cookie": cookie})


APP_SECURE_COOKIES = core.APP_BASE_URL.startswith("https://")


@route("GET", r"/entrar/(?P<token>[\w\-\.]+)")
def auth_enter(req, token):
    uid = core.verify_token(token, "login")
    user = core.one(req.conn.execute("SELECT * FROM users WHERE id=?", (uid,))) if uid else None
    if not user:
        return Response(302, b"", "text/plain", {"Location": "/login?erro=link"})
    return _login_response(req, user, "/admin" if user["role"] == "admissions" else "/embaixador")


@route("POST", "/api/auth/dev-login")
def auth_dev_login(req):
    if core.APP_ENV != "dev":
        raise DomainError("Indisponível.", "proibido", 403)
    user = core.one(req.conn.execute("SELECT * FROM users WHERE email=?", ((req.body.get("email") or "").lower(),)))
    if not user:
        raise DomainError("Usuário não encontrado.", "nao_encontrado", 404)
    return _login_response(req, user)


@route("POST", "/api/auth/logout")
def auth_logout(req):
    return json_resp({"ok": True}, headers={"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; Max-Age=0"})


@route("GET", "/api/auth/me")
def auth_me(req):
    if not req.user:
        return json_resp({"user": None})
    return json_resp({"user": {k: req.user[k] for k in ("id", "email", "name", "role")}})


@route("GET", "/api/auth/dev-users")
def auth_dev_users(req):
    if core.APP_ENV != "dev":
        return json_resp({"users": []})
    users = core.rows(req.conn.execute("SELECT u.email, u.name, u.role FROM users u LEFT JOIN ambassadors a ON a.user_id=u.id "
                                       "ORDER BY u.role, u.id LIMIT 9"))
    return json_resp({"users": users})


# ================================================================ embaixador
def _me_amb(req):
    a = core.one(req.conn.execute("SELECT * FROM ambassadors WHERE user_id=?", (req.user["id"],)))
    if not a:
        raise DomainError("Perfil de embaixador não encontrado.", "nao_encontrado", 404)
    return a


def _group_for_ambassador(req, g, amb_id):
    """Somente dados não sensíveis (RN-22)."""
    slot = parse_iso(g["slot_start"])
    bookings = domain.group_bookings(req.conn, g["id"], active_only=False)
    visible = [b for b in bookings if b["status"] not in ("cancelado_candidato", "cancelado_admissoes")]
    att = {r["booking_id"]: r["attended"] for r in req.conn.execute(
        "SELECT booking_id, attended FROM attendance WHERE booking_id IN (SELECT id FROM bookings WHERE tour_group_id=?)", (g["id"],))}
    people = []
    for b in visible:
        p = domain.safe_profile(b)
        p["attended"] = None if b["id"] not in att else bool(att[b["id"]])
        people.append(p)
    gift = core.one(req.conn.execute("SELECT collected_at FROM gifts WHERE tour_group_id=? AND ambassador_id=?", (g["id"], amb_id)))
    return {"group_id": g["id"], "slot_start": g["slot_start"], "date_label": core.fmt_date_pt(slot), "time_label": core.fmt_time_pt(slot),
            "status": g["status"], "people_count": sum(p["party_size"] for p in people if p["status"] not in ("nao_compareceu",)),
            "people": people, "gift_collected": bool(gift and gift["collected_at"]), "has_gift": bool(gift),
            "is_today": core.local(slot).date() == core.today_local(), "is_past": slot < now_utc(),
            "can_mark": slot - timedelta(minutes=30) <= now_utc()}


@route("GET", "/api/ambassador/me", role="ambassador")
def amb_me(req):
    a = _me_amb(req)
    a["languages"] = json.loads(a["languages"])
    a["notify_prefs"] = json.loads(a["notify_prefs"])
    stale = not a["availability_updated_at"] or parse_iso(a["availability_updated_at"]) < now_utc() - timedelta(days=30)
    cfg = core.get_config(req.conn)
    courses = [r["name"] for r in req.conn.execute("SELECT name FROM courses WHERE active=1 ORDER BY ord, name")]
    return json_resp({"ambassador": a, "availability_stale": stale, "grid": {"weekdays": cfg["weekdays"], "start_times": cfg["start_times"]},
                      "courses": courses, "languages": cfg["languages"], "email": req.user["email"]})


@route("GET", "/api/ambassador/stats", role="ambassador")
def amb_stats(req):
    return json_resp(metrics.ambassador_facts(req.conn, _me_amb(req)["id"]))


@route("GET", "/api/ambassador/opportunities", role="ambassador")
def amb_opportunities(req):
    return json_resp(metrics.ambassador_opportunities(req.conn, _me_amb(req)["id"]))


@route("POST", r"/api/ambassador/opportunities/(?P<gid>\d+)/claim", role="ambassador")
def amb_claim(req, gid):
    run_in_tx(req, domain.claim_group, int(gid), _me_amb(req)["id"])
    return json_resp({"ok": True})


@route("POST", "/api/ambassador/availability/add", role="ambassador")
def amb_availability_add(req):
    a = _me_amb(req)
    cfg = core.get_config(req.conn)
    d = parse_date(req.body.get("date"), None)
    t = req.body.get("start_time")
    if not d or t not in cfg["start_times"]:
        raise DomainError("Horário inválido.", "validacao", 422)
    with core.tx(req.conn):
        req.conn.execute("DELETE FROM availability_exceptions WHERE ambassador_id=? AND date=? AND start_time=?", (a["id"], d.isoformat(), t))
        req.conn.execute("INSERT INTO availability_exceptions(ambassador_id, date, start_time, available) VALUES (?,?,?,1)", (a["id"], d.isoformat(), t))
        req.conn.execute("UPDATE ambassadors SET availability_updated_at=? WHERE id=?", (iso(now_utc()), a["id"]))
    return json_resp({"ok": True})


@route("PUT", "/api/ambassador/profile", role="ambassador")
def amb_profile(req):
    a = _me_amb(req)
    b = req.body
    with core.tx(req.conn):
        req.conn.execute("UPDATE ambassadors SET course=?, languages=?, phone=?, notify_prefs=? WHERE id=?",
                         (b.get("course") or None, json.dumps(b.get("languages") or ["Português"], ensure_ascii=False),
                          (b.get("phone") or "")[:20], json.dumps(b.get("notify_prefs") or {"email": True}), a["id"]))
    return amb_me(req)


@route("GET", "/api/ambassador/availability", role="ambassador")
def amb_availability(req):
    a = _me_amb(req)
    rules = core.rows(req.conn.execute("SELECT weekday, start_time FROM availability_rules WHERE ambassador_id=?", (a["id"],)))
    excs = core.rows(req.conn.execute("SELECT date, start_time, available FROM availability_exceptions WHERE ambassador_id=? "
                                      "AND date >= ? ORDER BY date, start_time", (a["id"], core.today_local().isoformat())))
    return json_resp({"rules": rules, "exceptions": excs, "updated_at": a["availability_updated_at"]})


@route("PUT", "/api/ambassador/availability", role="ambassador")
def amb_availability_put(req):
    a = _me_amb(req)
    cfg = core.get_config(req.conn)
    rules = [(int(r["weekday"]), r["start_time"]) for r in req.body.get("rules", [])
             if int(r["weekday"]) in range(7) and r["start_time"] in cfg["start_times"]]
    excs = []
    for e in req.body.get("exceptions", []):
        parse_date(e.get("date"), None)
        st = e.get("start_time") or None
        if st and st not in cfg["start_times"]:
            continue
        excs.append((e["date"], st, 1 if e.get("available") else 0))
    with core.tx(req.conn):
        req.conn.execute("DELETE FROM availability_rules WHERE ambassador_id=?", (a["id"],))
        req.conn.executemany("INSERT INTO availability_rules(ambassador_id, weekday, start_time) VALUES (?,?,?)",
                             [(a["id"], w, t) for w, t in sorted(set(rules))])
        req.conn.execute("DELETE FROM availability_exceptions WHERE ambassador_id=? AND date >= ?", (a["id"], core.today_local().isoformat()))
        req.conn.executemany("INSERT INTO availability_exceptions(ambassador_id, date, start_time, available) VALUES (?,?,?,?)",
                             [(a["id"], *e) for e in excs])
        req.conn.execute("UPDATE ambassadors SET availability_updated_at=? WHERE id=?", (iso(now_utc()), a["id"]))
        core.log_event(req.conn, "ambassador", a["id"], "availability.updated", actor="ambassador", actor_id=a["id"])
    return amb_availability(req)


@route("GET", "/api/ambassador/invitations", role="ambassador")
def amb_invitations(req):
    a = _me_amb(req)
    out = []
    for inv in core.rows(req.conn.execute("SELECT * FROM invitations WHERE ambassador_id=? AND status='enviado' ORDER BY expires_at", (a["id"],))):
        g = domain.group_row(req.conn, inv["tour_group_id"])
        item = _group_for_ambassador(req, g, a["id"])
        item.update({"invitation_id": inv["id"], "expires_at": inv["expires_at"], "rank": inv["rank"]})
        out.append(item)
    recent = core.rows(req.conn.execute(
        "SELECT i.status, i.responded_at, g.slot_start FROM invitations i JOIN tour_groups g ON g.id=i.tour_group_id "
        "WHERE i.ambassador_id=? AND i.status IN ('recusado','expirado','aceito','desistiu') ORDER BY i.id DESC LIMIT 10", (a["id"],)))
    return json_resp({"invitations": out, "recent": recent, "now": iso(now_utc())})


@route("POST", r"/api/ambassador/invitations/(?P<inv_id>\d+)/accept", role="ambassador")
def amb_accept(req, inv_id):
    a = _me_amb(req)
    run_in_tx(req, domain.accept_invitation, int(inv_id), a["id"])
    return json_resp({"ok": True})


@route("POST", r"/api/ambassador/invitations/(?P<inv_id>\d+)/decline", role="ambassador")
def amb_decline(req, inv_id):
    a = _me_amb(req)
    run_in_tx(req, domain.decline_invitation, int(inv_id), a["id"], req.body.get("reason"))
    return json_resp({"ok": True})


@route("GET", "/api/ambassador/tours", role="ambassador")
def amb_tours(req):
    a = _me_amb(req)
    groups = core.rows(req.conn.execute("SELECT * FROM tour_groups WHERE ambassador_id=? AND status IN ('com_embaixador','realizado') "
                                        "ORDER BY slot_start", (a["id"],)))
    upcoming, past = [], []
    today_start = iso(core.local_slot(core.today_local().isoformat(), "00:00"))
    for g in groups:
        (upcoming if g["slot_start"] >= today_start else past).append(_group_for_ambassador(req, g, a["id"]))
    pending = [t for t in past if any(p["status"] == "presenca_pendente" for p in t["people"])]
    return json_resp({"upcoming": upcoming, "past": list(reversed(past))[:30], "pending_attendance": pending})


def _amb_group(req, group_id):
    a = _me_amb(req)
    g = domain.group_row(req.conn, int(group_id))
    if not g or g["ambassador_id"] != a["id"]:
        raise DomainError("Tour não encontrado.", "nao_encontrado", 404)
    return a, g


@route("POST", r"/api/ambassador/tours/(?P<group_id>\d+)/attendance", role="ambassador")
def amb_attendance(req, group_id):
    a, g = _amb_group(req, group_id)
    run_in_tx(req, domain.mark_attendance, g["id"], req.body.get("marks", []), actor="ambassador", actor_id=a["id"])
    return json_resp(_group_for_ambassador(req, domain.group_row(req.conn, g["id"]), a["id"]))


@route("POST", r"/api/ambassador/tours/(?P<group_id>\d+)/gift-collected", role="ambassador")
def amb_gift(req, group_id):
    a, g = _amb_group(req, group_id)
    with core.tx(req.conn):
        req.conn.execute("UPDATE gifts SET collected_at=? WHERE tour_group_id=? AND ambassador_id=?",
                         (iso(now_utc()) if req.body.get("collected", True) else None, g["id"], a["id"]))
        core.log_event(req.conn, "group", g["id"], "gift.collected", actor="ambassador", actor_id=a["id"],
                       payload={"collected": bool(req.body.get("collected", True))})
    return json_resp(_group_for_ambassador(req, g, a["id"]))


@route("POST", r"/api/ambassador/tours/(?P<group_id>\d+)/withdraw", role="ambassador")
def amb_withdraw(req, group_id):
    a, g = _amb_group(req, group_id)
    run_in_tx(req, domain.withdraw, g["id"], a["id"], req.body.get("reason"))
    return json_resp({"ok": True})


@route("GET", r"/api/ambassador/tours/(?P<group_id>\d+)/nps-qr", role="ambassador")
def amb_nps_qr(req, group_id):
    a, g = _amb_group(req, group_id)
    return json_resp({"url": f"{core.APP_BASE_URL}/nps/grupo/{domain.group_nps_token(g['id'])}"})


# ================================================================ Admissões
def _period_args(req, default_days_back=30, default_days_fwd=0):
    today = core.today_local()
    return (parse_date(req.q("from"), today - timedelta(days=default_days_back)),
            parse_date(req.q("to"), today + timedelta(days=default_days_fwd)))


@route("GET", "/api/admin/dashboard", role="admissions")
def admin_dashboard(req):
    frm, to = _period_args(req)
    data = metrics.dashboard(req.conn, frm, to)
    today = core.today_local().isoformat()
    s, e = iso(core.local_slot(today, "00:00")), iso(core.local_slot(today, "00:00") + timedelta(days=1))
    data["today"] = [_admin_group(req, g) for g in core.rows(req.conn.execute(
        "SELECT * FROM tour_groups WHERE slot_start >= ? AND slot_start < ? AND status != 'cancelado' ORDER BY slot_start", (s, e)))]
    data["alerts"] = {
        "open_exceptions": core.one(req.conn.execute("SELECT COUNT(*) n FROM tour_groups WHERE in_exception=1 AND status='aberto'"))["n"],
        "presence_pending": core.one(req.conn.execute("SELECT COUNT(*) n FROM bookings WHERE status='presenca_pendente'"))["n"],
        "failed_notifications": core.one(req.conn.execute("SELECT COUNT(*) n FROM notifications WHERE status='falhou'"))["n"],
        "failed_crm": core.one(req.conn.execute("SELECT COUNT(*) n FROM crm_sync_log WHERE status='falhou'"))["n"],
        "failed_jobs": core.one(req.conn.execute("SELECT COUNT(*) n FROM job_runs WHERE status='falhou' AND started_at >= ?",
                                                 (iso(now_utc() - timedelta(days=1)),)))["n"],
        "invites_expiring": core.one(req.conn.execute("SELECT COUNT(*) n FROM invitations WHERE status='enviado' AND expires_at < ?",
                                                      (iso(now_utc() + timedelta(hours=6)),)))["n"],
    }
    return json_resp(data)


def _admin_group(req, g):
    slot = parse_iso(g["slot_start"])
    bookings = domain.group_bookings(req.conn, g["id"], active_only=False)
    active = [b for b in bookings if b["status"] not in ("cancelado_candidato", "cancelado_admissoes")]
    amb = domain.ambassador_row(req.conn, g["ambassador_id"]) if g["ambassador_id"] else None
    inv = core.one(req.conn.execute("SELECT i.*, a.display_name FROM invitations i JOIN ambassadors a ON a.id=i.ambassador_id "
                                    "WHERE i.tour_group_id=? AND i.status='enviado'", (g["id"],)))
    return {"id": g["id"], "slot_start": g["slot_start"], "date_label": core.fmt_date_pt(slot), "time_label": core.fmt_time_pt(slot),
            "status": g["status"], "in_exception": bool(g["in_exception"]), "handled_by_admissions": bool(g["handled_by_admissions"]),
            "capacity": g["capacity"], "people": sum(b["party_size"] for b in active),
            "ambassador": amb["display_name"] if amb else None, "ambassador_id": g["ambassador_id"],
            "pending_invite": {"ambassador": inv["display_name"], "expires_at": inv["expires_at"]} if inv else None,
            "deadline_at": g["deadline_at"], "exception_opened_at": g["exception_opened_at"],
            "bookings": [{"id": b["id"], "protocol": b["protocol"], "name": b["full_name"], "party_size": b["party_size"],
                          "status": b["status"], "course": b["course_interest"]} for b in active]}


@route("GET", "/api/admin/agenda", role="admissions")
def admin_agenda(req):
    today = core.today_local()
    frm = parse_date(req.q("from"), today - timedelta(days=today.weekday()))
    to = parse_date(req.q("to"), frm + timedelta(days=6))
    s, e = iso(core.local_slot(frm.isoformat(), "00:00")), iso(core.local_slot((to + timedelta(days=1)).isoformat(), "00:00"))
    groups = [_admin_group(req, g) for g in core.rows(req.conn.execute(
        "SELECT * FROM tour_groups WHERE slot_start >= ? AND slot_start < ? AND status != 'cancelado' ORDER BY slot_start", (s, e)))]
    slots = domain.compute_slots(req.conn, frm, to, 1, now=core.local_slot(frm.isoformat(), "00:00") - timedelta(days=1),
                                 ignore_window=True)
    cfg = core.get_config(req.conn)
    return json_resp({"from": frm.isoformat(), "to": to.isoformat(), "groups": groups, "slots": slots,
                      "start_times": cfg["start_times"], "weekdays": cfg["weekdays"]})


BOOKING_COLS = ("SELECT b.*, c.full_name, c.email, c.phone, c.course_interest, c.is_treineiro, g.slot_start, g.ambassador_id, "
                "g.handled_by_admissions, a.display_name AS ambassador_name FROM bookings b JOIN candidates c ON c.id=b.candidate_id "
                "JOIN tour_groups g ON g.id=b.tour_group_id LEFT JOIN ambassadors a ON a.id=g.ambassador_id")


def _booking_filters(req):
    where, args = [], []
    q = (req.q("q") or "").strip()
    if q:
        digits = core.cpf_digits(q)
        if len(digits) == 11:
            where.append("c.cpf_hash = ?")
            args.append(core.cpf_hash(digits))
        else:
            where.append("(c.full_name LIKE ? OR c.email LIKE ? OR b.protocol LIKE ?)")
            args += [f"%{q}%"] * 3
    if req.q("status"):
        where.append("b.status = ?")
        args.append(req.q("status"))
    if req.q("course"):
        where.append("c.course_interest = ?")
        args.append(req.q("course"))
    if req.q("treineiro") in ("0", "1"):
        where.append("c.is_treineiro = ?")
        args.append(int(req.q("treineiro")))
    if req.q("from"):
        where.append("g.slot_start >= ?")
        args.append(iso(core.local_slot(parse_date(req.q("from"), None).isoformat(), "00:00")))
    if req.q("to"):
        where.append("g.slot_start < ?")
        args.append(iso(core.local_slot((parse_date(req.q("to"), None) + timedelta(days=1)).isoformat(), "00:00")))
    return (" WHERE " + " AND ".join(where)) if where else "", args


@route("GET", "/api/admin/bookings", role="admissions")
def admin_bookings(req):
    where, args = _booking_filters(req)
    items = core.rows(req.conn.execute(BOOKING_COLS + where + " ORDER BY g.slot_start DESC LIMIT 500", args))
    for b in items:
        slot = parse_iso(b["slot_start"])
        b["date_label"], b["time_label"] = core.local(slot).strftime("%d/%m/%Y"), core.fmt_time_pt(slot)
        if b["handled_by_admissions"]:
            b["ambassador_name"] = "Admissões"
    return json_resp({"items": items})


@route("GET", r"/api/admin/bookings/(?P<bid>\d+)", role="admissions")
def admin_booking(req, bid):
    b = core.one(req.conn.execute(BOOKING_COLS + " WHERE b.id=?", (int(bid),)))
    if not b:
        raise DomainError("Agendamento não encontrado.", "nao_encontrado", 404)
    cand = core.one(req.conn.execute("SELECT cpf_encrypted, anonymized_at, id FROM candidates WHERE id=?", (b["candidate_id"],)))
    b["cpf"] = core.format_cpf(core.decrypt_cpf(cand["cpf_encrypted"])) if cand["cpf_encrypted"] else ""
    b["anonymized"] = bool(cand["anonymized_at"])
    b["companions_names"] = json.loads(b["companions_names"])
    slot = parse_iso(b["slot_start"])
    b["date_label"], b["time_label"] = core.fmt_date_pt(slot), core.fmt_time_pt(slot)
    b["manage_url"] = f"/minha-visita/{domain.manage_token(b['id'])}"
    b["events"] = core.rows(req.conn.execute(
        "SELECT * FROM events WHERE (entity_type='booking' AND entity_id=?) OR (entity_type='group' AND entity_id=?) ORDER BY id",
        (b["id"], b["tour_group_id"])))
    b["notifications"] = core.rows(req.conn.execute(
        "SELECT id, template_code, channel, status, subject, sent_at, recipient FROM notifications WHERE booking_id=? ORDER BY id", (b["id"],)))
    b["crm"] = core.rows(req.conn.execute("SELECT operation, status, attempts, last_error, created_at FROM crm_sync_log "
                                          "WHERE booking_id=? AND kind='crm' ORDER BY id", (b["id"],)))
    b["nps"] = core.one(req.conn.execute("SELECT * FROM nps_responses WHERE booking_id=?", (b["id"],)))
    b["group"] = _admin_group(req, domain.group_row(req.conn, b["tour_group_id"]))
    req.conn.execute("INSERT INTO access_log(user_id, action, entity, created_at) VALUES (?,?,?,?)",
                     (req.user["id"], "view_booking", f"booking:{b['id']}", iso(now_utc())))
    return json_resp(b)


@route("PATCH", r"/api/admin/bookings/(?P<bid>\d+)", role="admissions")
def admin_booking_action(req, bid):
    bid = int(bid)
    action = req.body.get("action")
    uid = req.user["id"]
    if action == "reschedule":
        run_in_tx(req, domain.reschedule_booking, bid, req.body.get("slot_start"), actor="admissions", actor_id=uid)
    elif action == "cancel":
        run_in_tx(req, domain.cancel_booking, bid, actor="admissions", actor_id=uid, reason=req.body.get("reason"))
    elif action == "resend":
        code = req.body.get("template_code", "M1")
        if code not in ("M1", "M2", "M3", "M4", "M5", "M6"):
            raise DomainError("Mensagem inválida.", "validacao", 422)

        def _resend(conn):
            b = domain.booking_full(conn, bid)
            cfg = core.get_config(conn)
            att = domain.ics_attachment(b, cfg) if code in ("M1", "M4") else None
            notify.enqueue_candidate(conn, b, code, domain.candidate_vars(conn, b, cfg), dedupe_suffix=f"reenvio:{iso(now_utc())}",
                                     attachments=att)
            core.log_event(conn, "booking", bid, "message.resent", actor="admissions", actor_id=uid, payload={"template": code})
        run_in_tx(req, _resend)
    elif action == "change_ambassador":
        b = domain.booking_full(req.conn, bid)
        run_in_tx(req, domain.resolve_exception, b["tour_group_id"], "designar", uid, int(req.body.get("ambassador_id") or 0))
    elif action == "attendance":
        b = domain.booking_full(req.conn, bid)
        run_in_tx(req, domain.mark_attendance, b["tour_group_id"], [{"booking_id": bid, "attended": bool(req.body.get("attended"))}],
                  actor="admissions", actor_id=uid)
    else:
        raise DomainError("Ação desconhecida.", "validacao", 422)
    return admin_booking(req, str(bid))


@route("GET", "/api/admin/exceptions", role="admissions")
def admin_exceptions(req):
    groups = core.rows(req.conn.execute("SELECT * FROM tour_groups WHERE in_exception=1 AND status='aberto' ORDER BY slot_start"))
    out = []
    for g in groups:
        item = _admin_group(req, g)
        reason = core.one(req.conn.execute("SELECT payload FROM events WHERE entity_type='group' AND entity_id=? AND "
                                           "type='group.exception_opened' ORDER BY id DESC LIMIT 1", (g["id"],)))
        item["reason"] = json.loads(reason["payload"]).get("motivo") if reason else ""
        item["hours_left"] = round((parse_iso(g["slot_start"]) - now_utc()).total_seconds() / 3600, 1)
        out.append(item)
    return json_resp({"items": out})


@route("GET", r"/api/admin/groups/(?P<gid>\d+)/available-ambassadors", role="admissions")
def admin_group_ambs(req, gid):
    g = domain.group_row(req.conn, int(gid))
    date_str, time_str = core.slot_key(g["slot_start"])
    busy = domain.busy_slots(req.conn, g["slot_start"], exclude_group_id=g["id"])
    out = []
    for a in domain.load_ambassadors(req.conn):
        out.append({"id": a["id"], "name": a["display_name"], "course": a["course"],
                    "available": domain.ambassador_available(a, date_str, time_str), "busy": a["id"] in busy})
    out.sort(key=lambda x: (not x["available"], x["busy"], x["name"]))
    return json_resp({"items": out})


@route("POST", r"/api/admin/exceptions/(?P<gid>\d+)/resolve", role="admissions")
def admin_resolve(req, gid):
    run_in_tx(req, domain.resolve_exception, int(gid), req.body.get("action"), req.user["id"],
              int(req.body["ambassador_id"]) if req.body.get("ambassador_id") else None)
    return json_resp({"ok": True})


@route("GET", "/api/admin/ambassadors", role="admissions")
def admin_ambassadors(req):
    stats = metrics.ambassador_stats(req.conn)
    items = core.rows(req.conn.execute("SELECT a.*, u.email FROM ambassadors a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.display_name"))
    cfg = core.get_config(req.conn)
    for a in items:
        a["languages"] = json.loads(a["languages"])
        a["stats"] = stats.get(a["id"], {})
        rules = core.rows(req.conn.execute("SELECT weekday, start_time FROM availability_rules WHERE ambassador_id=?", (a["id"],)))
        a["availability"] = rules
        a["availability_stale"] = not a["availability_updated_at"] or parse_iso(a["availability_updated_at"]) < now_utc() - timedelta(days=30)
    return json_resp({"items": items, "grid": {"weekdays": cfg["weekdays"], "start_times": cfg["start_times"]}})


@route("POST", "/api/admin/ambassadors", role="admissions")
def admin_ambassador_create(req):
    name = " ".join((req.body.get("name") or "").split())
    email = (req.body.get("email") or "").strip().lower()
    if len(name) < 3 or not domain.EMAIL_RE.match(email):
        raise DomainError("Informe nome e e-mail válidos.", "validacao", 422)
    if core.one(req.conn.execute("SELECT id FROM users WHERE email=?", (email,))):
        raise DomainError("Já existe um usuário com este e-mail.", "duplicado", 409)
    with core.tx(req.conn):
        cur = req.conn.execute("INSERT INTO users(email, name, role, created_at) VALUES (?,?,?,?)", (email, name, "ambassador", iso(now_utc())))
        uid = cur.lastrowid
        cur = req.conn.execute("INSERT INTO ambassadors(user_id, display_name, course, languages, phone, created_at) VALUES (?,?,?,?,?,?)",
                               (uid, name, req.body.get("course") or None, json.dumps(["Português"]), req.body.get("phone") or "", iso(now_utc())))
        core.log_event(req.conn, "ambassador", cur.lastrowid, "ambassador.created", actor="admissions", actor_id=req.user["id"], is_manual=False)
        token = core.sign_token("login", uid, now_utc() + timedelta(days=7))
        notify.enqueue(req.conn, f"LOGIN:{uid}:convite", "LOGIN", email,
                       {"nome": core.first_name(name), "link_login": f"{core.APP_BASE_URL}/entrar/{token}"})
    notify.flush(req.conn)
    return admin_ambassadors(req)


@route("PATCH", r"/api/admin/ambassadors/(?P<aid>\d+)", role="admissions")
def admin_ambassador_update(req, aid):
    a = domain.ambassador_row(req.conn, int(aid))
    if not a:
        raise DomainError("Embaixador não encontrado.", "nao_encontrado", 404)
    with core.tx(req.conn):
        if "active" in req.body:
            req.conn.execute("UPDATE ambassadors SET active=? WHERE id=?", (1 if req.body["active"] else 0, a["id"]))
        for field in ("course", "phone", "display_name"):
            if field in req.body:
                req.conn.execute(f"UPDATE ambassadors SET {field}=? WHERE id=?", (req.body[field], a["id"]))
        if "gift_group_id" in req.body:
            req.conn.execute("UPDATE gifts SET collected_at=? WHERE tour_group_id=? AND ambassador_id=?",
                             (iso(now_utc()) if req.body.get("collected") else None, int(req.body["gift_group_id"]), a["id"]))
        core.log_event(req.conn, "ambassador", a["id"], "ambassador.updated", actor="admissions", actor_id=req.user["id"],
                       payload=req.body, is_manual=False)
    return admin_ambassadors(req)


@route("GET", "/api/admin/gifts", role="admissions")
def admin_gifts(req):
    items = core.rows(req.conn.execute(
        "SELECT gi.*, a.display_name, g.slot_start, g.status FROM gifts gi JOIN ambassadors a ON a.id=gi.ambassador_id "
        "JOIN tour_groups g ON g.id=gi.tour_group_id ORDER BY g.slot_start DESC LIMIT 300"))
    for i in items:
        slot = parse_iso(i["slot_start"])
        i["date_label"] = core.local(slot).strftime("%d/%m/%Y") + " " + core.fmt_time_pt(slot)
    return json_resp({"items": items})


@route("GET", "/api/admin/config", role="admissions")
def admin_config(req):
    return json_resp({"config": core.get_config(req.conn),
                      "blackouts": core.rows(req.conn.execute("SELECT * FROM blackouts ORDER BY date, start_time")),
                      "courses": core.rows(req.conn.execute("SELECT * FROM courses ORDER BY ord, name"))})


@route("PUT", "/api/admin/config", role="admissions")
def admin_config_put(req):
    allowed = set(core.DEFAULT_CONFIG)
    updates = {k: v for k, v in req.body.items() if k in allowed}
    if "start_times" in updates:
        if not all(re.match(r"^\d{2}:\d{2}$", t) for t in updates["start_times"]):
            raise DomainError("Horários no formato HH:MM.", "validacao", 422)
        updates["start_times"] = sorted(set(updates["start_times"]))
    if "group_capacity" in updates and not (1 <= int(updates["group_capacity"]) <= 50):
        raise DomainError("Capacidade entre 1 e 50.", "validacao", 422)
    with core.tx(req.conn):
        core.set_config(req.conn, updates)
        core.log_event(req.conn, "config", 0, "config.updated", actor="admissions", actor_id=req.user["id"], payload=updates, is_manual=False)
    return admin_config(req)


@route("POST", "/api/admin/blackouts", role="admissions")
def admin_blackout_add(req):
    d = parse_date(req.body.get("date"), None)
    if not d:
        raise DomainError("Informe a data.", "validacao", 422)
    with core.tx(req.conn):
        req.conn.execute("INSERT INTO blackouts(date, start_time, reason) VALUES (?,?,?)",
                         (d.isoformat(), req.body.get("start_time") or None, (req.body.get("reason") or "")[:120]))
    return admin_config(req)


@route("DELETE", r"/api/admin/blackouts/(?P<bid>\d+)", role="admissions")
def admin_blackout_del(req, bid):
    with core.tx(req.conn):
        req.conn.execute("DELETE FROM blackouts WHERE id=?", (int(bid),))
    return admin_config(req)


@route("POST", "/api/admin/courses", role="admissions")
def admin_course_add(req):
    name = (req.body.get("name") or "").strip()
    if not name:
        raise DomainError("Informe o nome do curso.", "validacao", 422)
    with core.tx(req.conn):
        req.conn.execute("INSERT INTO courses(name, active, ord) VALUES (?,1,(SELECT COALESCE(MAX(ord),0)+1 FROM courses))", (name,))
    return admin_config(req)


@route("PATCH", r"/api/admin/courses/(?P<cid>\d+)", role="admissions")
def admin_course_update(req, cid):
    with core.tx(req.conn):
        if "active" in req.body:
            req.conn.execute("UPDATE courses SET active=? WHERE id=?", (1 if req.body["active"] else 0, int(cid)))
        if "name" in req.body:
            req.conn.execute("UPDATE courses SET name=? WHERE id=?", (req.body["name"], int(cid)))
    return admin_config(req)


@route("GET", "/api/admin/templates", role="admissions")
def admin_templates(req):
    return json_resp({"items": core.rows(req.conn.execute("SELECT * FROM message_templates ORDER BY id"))})


@route("PUT", r"/api/admin/templates/(?P<code>\w+)", role="admissions")
def admin_template_put(req, code):
    with core.tx(req.conn):
        req.conn.execute("UPDATE message_templates SET subject=?, body=?, active=? WHERE code=?",
                         (req.body.get("subject", ""), req.body.get("body", ""), 1 if req.body.get("active", True) else 0, code))
    return admin_templates(req)


@route("POST", r"/api/admin/templates/(?P<code>\w+)/reset", role="admissions")
def admin_template_reset(req, code):
    for c, name, audience, subject, body in notify.DEFAULT_TEMPLATES:
        if c == code:
            with core.tx(req.conn):
                req.conn.execute("UPDATE message_templates SET subject=?, body=?, active=1 WHERE code=?", (subject, body, code))
    return admin_templates(req)


@route("GET", r"/api/admin/export/(?P<kind>\w+)\.csv", role="admissions")
def admin_export(req, kind):
    req.conn.execute("INSERT INTO access_log(user_id, action, entity, created_at) VALUES (?,?,?,?)",
                     (req.user["id"], "export", kind, iso(now_utc())))
    where, args = _booking_filters(req)
    if kind == "bookings":
        items = core.rows(req.conn.execute(BOOKING_COLS + where + " ORDER BY g.slot_start", args))
        return csv_resp("agendamentos.csv",
                        ["protocolo", "data", "hora", "status", "resultado", "nome", "email", "telefone", "curso", "treineiro", "pessoas",
                         "idioma", "locomocao", "embaixador", "reagendamentos", "criado_em", "cancelado_em", "motivo_cancelamento"],
                        [[b["protocol"], core.local(parse_iso(b["slot_start"])).strftime("%d/%m/%Y"),
                          core.local(parse_iso(b["slot_start"])).strftime("%H:%M"), b["status"], b["outcome"] or "", b["full_name"],
                          b["email"], b["phone"], b["course_interest"], "sim" if b["is_treineiro"] else "não", b["party_size"],
                          b["language"], "sim" if b["mobility_restriction"] else "não",
                          "Admissões" if b["handled_by_admissions"] else (b["ambassador_name"] or ""), b["reschedule_count"],
                          b["created_at"], b["cancelled_at"] or "", b["cancel_reason"] or ""] for b in items])
    if kind == "attendance":
        items = core.rows(req.conn.execute(
            "SELECT b.protocol, c.full_name, g.slot_start, b.party_size, a.attended, a.marked_by, a.marked_at, b.status FROM bookings b "
            "JOIN candidates c ON c.id=b.candidate_id JOIN tour_groups g ON g.id=b.tour_group_id LEFT JOIN attendance a ON a.booking_id=b.id "
            "WHERE g.slot_start < ? ORDER BY g.slot_start", (iso(now_utc()),)))
        return csv_resp("presenca.csv", ["protocolo", "nome", "data_hora", "pessoas", "compareceu", "marcado_por", "marcado_em", "status"],
                        [[i["protocol"], i["full_name"], core.local(parse_iso(i["slot_start"])).strftime("%d/%m/%Y %H:%M"), i["party_size"],
                          "" if i["attended"] is None else ("sim" if i["attended"] else "não"), i["marked_by"] or "", i["marked_at"] or "",
                          i["status"]] for i in items])
    if kind == "nps":
        items = core.rows(req.conn.execute(
            "SELECT b.protocol, g.slot_start, r.score, r.highlight, r.improvement, r.ambassador_rating, r.created_at, am.display_name "
            "FROM nps_responses r JOIN bookings b ON b.id=r.booking_id JOIN tour_groups g ON g.id=b.tour_group_id "
            "LEFT JOIN ambassadors am ON am.id=g.ambassador_id ORDER BY r.id"))
        return csv_resp("nps.csv", ["protocolo", "data_tour", "nota", "o_que_marcou", "o_que_melhorar", "nota_embaixador", "embaixador", "respondido_em"],
                        [[i["protocol"], core.local(parse_iso(i["slot_start"])).strftime("%d/%m/%Y"), i["score"], i["highlight"],
                          i["improvement"], i["ambassador_rating"] or "", i["display_name"] or "", i["created_at"]] for i in items])
    if kind == "crm":
        # formato genérico de importação; ajustar quando o CRM for definido [A CONFIRMAR]
        items = core.rows(req.conn.execute(BOOKING_COLS + where + " ORDER BY b.id", args))
        return csv_resp("crm-importacao.csv", ["external_id", "nome", "email", "telefone", "curso_interesse", "treineiro", "origem",
                                               "atividade", "data_atividade", "status_atividade"],
                        [[b["protocol"], b["full_name"], b["email"], b["phone"], b["course_interest"], "S" if b["is_treineiro"] else "N",
                          "Tour no campus", "Visita ao campus", core.local(parse_iso(b["slot_start"])).strftime("%Y-%m-%d %H:%M"),
                          b["status"]] for b in items])
    if kind == "dashboard":
        frm, to = _period_args(req)
        d = metrics.dashboard(req.conn, frm, to)
        rows_ = [
            ["Tours realizados ÷ agendados (bruto, %)", d["realized_rate"]["gross"]],
            ["Tours realizados ÷ agendados (ajustado, %)", d["realized_rate"]["adjusted"]],
            ["Agendamentos", d["totals"]["bookings"]], ["Realizados", d["totals"]["realized"]],
            ["Não compareceu", d["totals"]["no_show"]], ["Cancelado pelo candidato", d["totals"]["cancelled_candidate"]],
            ["Cancelado por Admissões", d["totals"]["cancelled_admissions"]],
            ["Tempo até 1ª confirmação — média (s)", d["first_confirmation_seconds"]["avg"]],
            ["Tempo até 1ª confirmação — p90 (s)", d["first_confirmation_seconds"]["p90"]],
            ["Tempo até confirmação do tour — média (h)", d["tour_confirmation_hours"]["avg"]],
            ["Tarefas manuais por tour", d["manual_tasks_per_tour"]["value"]],
            ["Exceções (nº)", d["exceptions"]["count"]], ["Exceções (%)", d["exceptions"]["pct"]],
            ["Resolução de exceção — média (h)", d["exceptions"]["avg_resolution_hours"]],
            ["Aceite dos embaixadores (%)", d["ambassador_acceptance"]["rate"]],
            ["Resposta dos embaixadores — média (h)", d["ambassador_acceptance"]["avg_response_hours"]],
            ["NPS", d["nps"]["score"]], ["Taxa de resposta do NPS (%)", d["nps"]["response_rate"]],
        ] + [[f"Ocupação {o['weekday_label']} {o['time']} (%)", o["pct"]] for o in d["occupancy"]] \
          + [[f"Curso: {c['course']} (agendamentos / treineiros)", f"{c['total']} / {c['treineiros']}"] for c in d["by_course"]]
        return csv_resp(f"indicadores-{frm}-{to}.csv", ["indicador", "valor"], rows_)
    raise DomainError("Exportação desconhecida.", "nao_encontrado", 404)


@route("GET", "/api/admin/jobs", role="admissions")
def admin_jobs(req):
    last = {}
    for r in core.rows(req.conn.execute("SELECT * FROM job_runs ORDER BY id DESC LIMIT 400")):
        last.setdefault(r["job"], r)
    crm = core.rows(req.conn.execute("SELECT status, COUNT(*) n FROM crm_sync_log GROUP BY status"))
    notif = core.rows(req.conn.execute("SELECT status, COUNT(*) n FROM notifications GROUP BY status"))
    return json_resp({"jobs": [last.get(name, {"job": name, "status": "nunca rodou"}) for name, _ in jobs.JOBS],
                      "crm": crm, "notifications": notif, "now": iso(now_utc()), "clock_offset_hours": round(core.clock_offset() / 3600, 2),
                      "dev": core.APP_ENV == "dev", "email_adapter": notify.email_adapter().name,
                      "crm_adapter": integrations.crm_adapter().name, "whatsapp_adapter": notify.whatsapp_adapter().name})


@route("POST", "/api/admin/jobs/run", role="admissions")
def admin_jobs_run(req):
    return json_resp({"results": jobs.run_all(req.conn)})


@route("POST", "/api/admin/dev/clock", role="admissions")
def admin_clock(req):
    if core.APP_ENV != "dev":
        raise DomainError("Disponível apenas em desenvolvimento.", "proibido", 403)
    if req.body.get("reset"):
        offset = 0
    else:
        offset = core.clock_offset() + float(req.body.get("advance_hours", 0)) * 3600
    core.set_clock_offset(max(0, offset))
    with core.tx(req.conn):
        req.conn.execute("INSERT INTO config(key, value) VALUES ('__clock_offset', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                         (json.dumps(core.clock_offset()),))
    results = jobs.run_all(req.conn)
    return json_resp({"now": iso(now_utc()), "clock_offset_hours": round(core.clock_offset() / 3600, 2), "results": results})


@route("GET", r"/api/admin/lgpd/(?P<bid>\d+)/export", role="admissions")
def admin_lgpd_export(req, bid):
    b = domain.booking_full(req.conn, int(bid))
    if not b:
        raise DomainError("Agendamento não encontrado.", "nao_encontrado", 404)
    cand = core.one(req.conn.execute("SELECT * FROM candidates WHERE id=?", (b["candidate_id"],)))
    data = {"titular": {"nome": cand["full_name"], "cpf": core.format_cpf(core.decrypt_cpf(cand["cpf_encrypted"])) if cand["cpf_encrypted"] else "",
                        "email": cand["email"], "telefone": cand["phone"], "curso_interesse": cand["course_interest"],
                        "treineiro": bool(cand["is_treineiro"]), "criado_em": cand["created_at"]},
            "agendamentos": core.rows(req.conn.execute(
                "SELECT b.protocol, b.status, g.slot_start, b.party_size, b.companions_names, b.language, b.questions, b.created_at "
                "FROM bookings b JOIN tour_groups g ON g.id=b.tour_group_id WHERE b.candidate_id=?", (cand["id"],))),
            "nps": core.rows(req.conn.execute("SELECT r.* FROM nps_responses r JOIN bookings b ON b.id=r.booking_id WHERE b.candidate_id=?",
                                              (cand["id"],)))}
    req.conn.execute("INSERT INTO access_log(user_id, action, entity, created_at) VALUES (?,?,?,?)",
                     (req.user["id"], "lgpd_export", f"candidate:{cand['id']}", iso(now_utc())))
    return Response(200, json.dumps(data, ensure_ascii=False, indent=2).encode(), "application/json; charset=utf-8",
                    {"Content-Disposition": f'attachment; filename="dados-titular-{b["protocol"]}.json"'})


@route("POST", r"/api/admin/lgpd/(?P<bid>\d+)/anonymize", role="admissions")
def admin_lgpd_anonymize(req, bid):
    b = domain.booking_full(req.conn, int(bid))
    if not b:
        raise DomainError("Agendamento não encontrado.", "nao_encontrado", 404)
    if b["status"] in core.ACTIVE_STATUSES:
        raise DomainError("Cancele as visitas futuras antes de anonimizar.", "estado_invalido", 409)
    with core.tx(req.conn):
        jobs.anonymize_candidate(req.conn, b["candidate_id"])
        req.conn.execute("INSERT INTO access_log(user_id, action, entity, created_at) VALUES (?,?,?,?)",
                         (req.user["id"], "lgpd_anonymize", f"candidate:{b['candidate_id']}", iso(now_utc())))
    return json_resp({"ok": True})


# ================================================================ caixa de entrada local (substitui o Mailpit em desenvolvimento)
def _dev_only():
    if core.APP_ENV != "dev":
        raise DomainError("Indisponível.", "nao_encontrado", 404)


@route("GET", "/api/dev/inbox")
def dev_inbox(req):
    _dev_only()
    to = (req.q("to") or "").strip().lower()
    q = "SELECT id, recipient, template_code, channel, status, subject, sent_at, created_at FROM notifications"
    args = []
    if to:
        q += " WHERE recipient LIKE ?"
        args.append(f"%{to}%")
    return json_resp({"items": core.rows(req.conn.execute(q + " ORDER BY id DESC LIMIT 200", args))})


@route("GET", r"/api/dev/inbox/(?P<nid>\d+)")
def dev_inbox_item(req, nid):
    _dev_only()
    n = core.one(req.conn.execute("SELECT * FROM notifications WHERE id=?", (int(nid),)))
    if not n:
        raise DomainError("Mensagem não encontrada.", "nao_encontrado", 404)
    n["attachments"] = [{"filename": a["filename"], "index": i} for i, a in enumerate(json.loads(n["attachments"]))]
    return json_resp(n)


@route("GET", r"/api/dev/inbox/(?P<nid>\d+)/attachment/(?P<idx>\d+)")
def dev_inbox_attachment(req, nid, idx):
    _dev_only()
    n = core.one(req.conn.execute("SELECT attachments FROM notifications WHERE id=?", (int(nid),)))
    a = json.loads(n["attachments"])[int(idx)]
    return Response(200, a["content"].encode(), a["content_type"], {"Content-Disposition": f'attachment; filename="{a["filename"]}"'})


# ================================================================ páginas
PAGES = [
    (re.compile(r"^/$"), "index.html", None),
    (re.compile(r"^/agendar/?$"), "agendar.html", None),
    (re.compile(r"^/minha-visita/[\w\-\.]+/?$"), "minha-visita.html", None),
    (re.compile(r"^/nps/(grupo/)?[\w\-\.]+/?$"), "nps.html", None),
    (re.compile(r"^/login/?$"), "login.html", None),
    (re.compile(r"^/embaixador/?$"), "embaixador.html", "ambassador"),
    (re.compile(r"^/admin/?$"), "admin.html", "admissions"),
    (re.compile(r"^/caixa-de-entrada/?$"), "inbox.html", None),
    (re.compile(r"^/embed/?$"), "embed.html", None),
    (re.compile(r"^/simulador/?$"), "simulador-tour-insper.html", None),
]


class Handler(BaseHTTPRequestHandler):
    server_version = "InsperTour/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("QUIET") != "1":
            print(json.dumps({"ts": iso(now_utc()), "ip": self.client_address[0], "msg": fmt % args}, ensure_ascii=False))

    def _user(self, conn):
        c = SimpleCookie(self.headers.get("Cookie", ""))
        if SESSION_COOKIE not in c:
            return None
        data = core.verify_session(c[SESSION_COOKIE].value)
        if not data:
            return None
        return core.one(conn.execute("SELECT * FROM users WHERE id=? AND role=?", (data["u"], data["r"])))

    def _send(self, resp):
        body = resp.body or b""
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        if self.path.startswith(("/minha-visita", "/nps", "/api/")):
            self.send_header("X-Robots-Tag", "noindex, nofollow")
            self.send_header("Cache-Control", "no-store")
        for k, v in resp.headers.items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _static(self, rel):
        path = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not path.startswith(STATIC_DIR) or not os.path.isfile(path):
            return Response(404, "Não encontrado".encode(), "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",):
            ctype += "; charset=utf-8"
        with open(path, "rb") as f:
            return Response(200, f.read(), ctype, {"Cache-Control": "no-cache"})

    def _handle(self, method):
        conn = core.connect()
        try:
            url = urlparse(self.path)
            path = url.path
            if path.startswith("/static/"):
                return self._send(self._static(path[len("/static/"):]))
            if method == "GET":
                for rx, page, role in PAGES:
                    if rx.match(path):
                        if role:
                            user = self._user(conn)
                            if not user or user["role"] != role:
                                return self._send(Response(302, b"", "text/plain", {"Location": f"/login?next={path}"}))
                        return self._send(self._static(page))
            body = {}
            if method in ("POST", "PUT", "PATCH", "DELETE"):
                length = int(self.headers.get("Content-Length") or 0)
                if length > 1_000_000:
                    return self._send(json_resp({"error": "Requisição grande demais."}, 413))
                raw = self.rfile.read(length) if length else b""
                if raw:
                    # exigir JSON também protege contra CSRF de formulários de outros sites
                    if "application/json" not in (self.headers.get("Content-Type") or ""):
                        return self._send(json_resp({"error": "Envie JSON."}, 415))
                    body = json.loads(raw.decode("utf-8"))
            query = parse_qs(url.query)
            for m, rx, fn, role in ROUTES:
                if m != method:
                    continue
                match = rx.match(path)
                if not match:
                    continue
                user = self._user(conn)
                if role and (not user or user["role"] != role):
                    return self._send(json_resp({"error": "Faça login para continuar.", "code": "nao_autenticado"}, 401))
                req = Request(self, method, path, query, body, user, conn)
                return self._send(fn(req, **match.groupdict()))
            return self._send(json_resp({"error": "Não encontrado."}, 404) if path.startswith("/api/")
                              else Response(404, "Página não encontrada".encode(), "text/plain; charset=utf-8"))
        except DomainError as e:
            self._send(json_resp({"error": e.message, "code": e.code, **e.extra}, e.status))
        except json.JSONDecodeError:
            self._send(json_resp({"error": "JSON inválido."}, 400))
        except Exception:
            traceback.print_exc()
            self._send(json_resp({"error": "Erro interno. Tente novamente em instantes."}, 500))
        finally:
            conn.close()

    def do_GET(self):
        self._handle("GET")

    def do_HEAD(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PUT(self):
        self._handle("PUT")

    def do_PATCH(self):
        self._handle("PATCH")

    def do_DELETE(self):
        self._handle("DELETE")


def restore_clock(conn):
    r = core.one(conn.execute("SELECT value FROM config WHERE key='__clock_offset'"))
    if r and core.APP_ENV == "dev":
        core.set_clock_offset(json.loads(r["value"]))


def serve(host="127.0.0.1", port=8000, scheduler=True):
    conn = core.connect()
    core.init_db(conn)
    notify.ensure_templates(conn)
    restore_clock(conn)
    conn.close()
    if scheduler:
        jobs.Scheduler(interval=60).start()
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    return httpd

"""Testes dos critérios de aceite (seção 18). Rode com:  python3 -m unittest discover -s tests -v"""
import json
import os
import random
import tempfile
import threading
import unittest
import urllib.request
from datetime import timedelta

TMP = tempfile.mkdtemp(prefix="tour-test-")
os.environ["DATABASE_PATH"] = os.path.join(TMP, "test.db")
os.environ["QUIET"] = "1"

from app import core, domain, jobs, metrics, notify, seed, server  # noqa: E402
from app.core import iso, now_utc  # noqa: E402

rng = random.Random(7)


def fresh_db():
    for s in ("", "-wal", "-shm"):
        p = os.environ["DATABASE_PATH"] + s
        if os.path.exists(p):
            os.remove(p)
    core.set_clock_offset(0)
    conn = core.connect()
    core.init_db(conn)
    notify.ensure_templates(conn)
    with core.tx(conn):
        for i, c in enumerate(["Economia", "Direito", "Administração"]):
            conn.execute("INSERT INTO courses(name, ord) VALUES (?,?)", (c, i))
        conn.execute("INSERT INTO users(email, name, role, created_at) VALUES ('adm@exemplo.com','Adm Teste','admissions',?)", (iso(now_utc()),))
    return conn


def add_ambassador(conn, name, slots, course=None):
    """slots: lista de (weekday, 'HH:MM')."""
    with core.tx(conn):
        uid = conn.execute("INSERT INTO users(email, name, role, created_at) VALUES (?,?,?,?)",
                           (name.lower().replace(" ", ".") + "@exemplo.com", name, "ambassador", iso(now_utc()))).lastrowid
        aid = conn.execute("INSERT INTO ambassadors(user_id, display_name, course, created_at, availability_updated_at) VALUES (?,?,?,?,?)",
                           (uid, name, course, iso(now_utc()), iso(now_utc()))).lastrowid
        for wd, t in slots:
            conn.execute("INSERT INTO availability_rules(ambassador_id, weekday, start_time) VALUES (?,?,?)", (aid, wd, t))
    return aid


def future_slot(days_min=4, time_="15:00"):
    d = core.today_local() + timedelta(days=days_min)
    while d.weekday() > 4:
        d += timedelta(days=1)
    return d, iso(core.local_slot(d.isoformat(), time_))


def form(slot_start, companions=0, **kw):
    cpf = seed.make_cpf(rng)
    n = rng.randint(1000, 99999)
    data = {"full_name": f"Candidata Teste{n} Sobrenomeúnico{n}", "cpf": cpf, "email": f"cand{n}@exemplo.com",
            "email_confirm": f"cand{n}@exemplo.com", "phone": f"11 9{n:04d}-0000"[:15], "course_interest": "Economia",
            "is_treineiro": False, "companions": companions, "privacy_accepted": True, "slot_start": slot_start}
    data["phone"] = "11987654321"
    data.update(kw)
    return data


def book(conn, data):
    return domain.create_booking_tx(conn, data)


def sent(conn, code, **where):
    q = "SELECT * FROM notifications WHERE template_code=?"
    args = [code]
    for k, v in where.items():
        q += f" AND {k}=?"
        args.append(v)
    return core.rows(conn.execute(q, args))


class AllocationTests(unittest.TestCase):
    def test_pure_ranking_balances_load_then_declines_then_profile(self):
        rules = [{"weekday": 0, "start_time": "15:00"}]
        ambs = [{"id": i, "active": 1, "course": c, "languages": ["Português"], "rules": rules, "exceptions": []}
                for i, c in [(1, "Direito"), (2, "Economia"), (3, "Economia"), (4, "Direito")]]
        history = {1: {"tours_30d": 3}, 2: {"tours_30d": 1, "declines_30d": 2}, 3: {"tours_30d": 1}, 4: {"tours_30d": 1}}
        g = {"date": "2030-01-07", "time": "15:00", "courses": ["Economia"], "languages": ["Português"]}
        ranking = domain.allocate(g, ambs, history, {"match_course": True}, random.Random(1))
        # 3 e 4 empatam em carga e recusas; 3 vence por ser do mesmo curso; 2 tem recusas; 1 tem mais tours
        self.assertEqual(ranking, [3, 4, 2, 1])

    def test_excludes_unavailable_busy_inactive_and_previous_decliners(self):
        rules = [{"weekday": 0, "start_time": "15:00"}]
        ambs = [{"id": 1, "active": 1, "rules": rules, "exceptions": []},
                {"id": 2, "active": 0, "rules": rules, "exceptions": []},
                {"id": 3, "active": 1, "rules": [{"weekday": 1, "start_time": "15:00"}], "exceptions": []},
                {"id": 4, "active": 1, "rules": rules, "exceptions": [], "busy_slots": [("2030-01-07", "15:00")]},
                {"id": 5, "active": 1, "rules": rules, "exceptions": [{"date": "2030-01-07", "start_time": None, "available": 0}]},
                {"id": 6, "active": 1, "rules": rules, "exceptions": []},
                {"id": 7, "active": 1, "rules": [], "exceptions": [{"date": "2030-01-07", "start_time": "15:00", "available": 1}]}]
        g = {"date": "2030-01-07", "time": "15:00", "exclude": [6]}
        self.assertEqual(sorted(domain.allocate(g, ambs, {}, {}, random.Random(1))), [1, 7])


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.conn = fresh_db()
        self.day, self.slot = future_slot()
        wd = self.day.weekday()
        self.a1 = add_ambassador(self.conn, "Ana Embaixadora", [(wd, "15:00")], course="Economia")
        self.a2 = add_ambassador(self.conn, "Bruno Embaixador", [(wd, "15:00")])

    def slot_info(self, party=1):
        return next(s for s in domain.compute_slots(self.conn, self.day, self.day, party) if s["slot_start"] == self.slot)

    def test_slots_reflect_ambassadors_and_capacity(self):
        self.assertEqual(self.slot_info()["remaining"], 20)  # 2 embaixadores × 10
        book(self.conn, form(self.slot, companions=6))
        s = self.slot_info(party=4)
        self.assertEqual(s["remaining"], 13)
        self.assertTrue(s["available"])  # cabe no grupo atual (3) ou em grupo novo (10)
        other = next(x for x in domain.compute_slots(self.conn, self.day, self.day, 1) if x["time"] == "10:00")
        self.assertFalse(other["available"])  # sem embaixador → esgotado

    def test_full_slot_disabled_and_party_filter(self):
        book(self.conn, form(self.slot, companions=9))
        book(self.conn, form(self.slot, companions=8))
        self.assertFalse(self.slot_info(party=2)["available"])
        self.assertTrue(self.slot_info(party=1)["available"])
        book(self.conn, form(self.slot))
        self.assertEqual(self.slot_info()["remaining"], 0)
        with self.assertRaises(domain.DomainError) as ctx:
            book(self.conn, form(self.slot))
        self.assertEqual(ctx.exception.code, "esgotado")

    def test_concurrent_last_seat_only_one_wins(self):
        # 1 embaixador → 10 vagas; 9 ocupadas; duas pessoas tentam a última ao mesmo tempo
        with core.tx(self.conn):
            self.conn.execute("UPDATE ambassadors SET active=0 WHERE id=?", (self.a2,))
        book(self.conn, form(self.slot, companions=8))
        results, barrier = [], threading.Barrier(6)
        datas = [form(self.slot) for _ in range(6)]

        def attempt(d):
            c = core.connect()
            barrier.wait()
            try:
                with core.tx(c):
                    domain.create_booking(c, d)
                results.append("ok")
            except domain.DomainError as e:
                results.append(e.code)
            finally:
                c.close()
        threads = [threading.Thread(target=attempt, args=(d,)) for d in datas]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(results.count("ok"), 1)
        self.assertEqual(results.count("esgotado"), 5)
        people = core.one(self.conn.execute("SELECT SUM(party_size) n FROM bookings WHERE status IN ('aguardando_embaixador','confirmado')"))["n"]
        self.assertEqual(people, 10)

    def test_confirmation_email_with_protocol_and_ics(self):
        b = book(self.conn, form(self.slot))
        m1 = sent(self.conn, "M1", booking_id=b["id"])
        self.assertEqual(len(m1), 1)
        self.assertEqual(m1[0]["status"], "enviado")
        self.assertIn(b["protocol"], m1[0]["body_text"])
        self.assertRegex(b["protocol"], r"^TOUR-\d{4}-\d{6}$")
        att = json.loads(m1[0]["attachments"])
        self.assertIn("BEGIN:VCALENDAR", att[0]["content"])
        delay = core.parse_iso(m1[0]["sent_at"]) - core.parse_iso(b["created_at"])
        self.assertLess(delay.total_seconds(), 60)

    def test_duplicate_cpf_resends_link_without_exposing(self):
        d = form(self.slot)
        book(self.conn, d)
        d2 = form(self.slot, cpf=d["cpf"])
        with self.assertRaises(domain.DomainError) as ctx:
            book(self.conn, d2)
        self.assertEqual(ctx.exception.code, "duplicado")
        notify.flush(self.conn)
        self.assertEqual(len(sent(self.conn, "MX2", recipient=d["email"])), 1)

    def test_invite_accept_sends_ambassador_name(self):
        b = book(self.conn, form(self.slot))
        inv = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        self.assertIsNotNone(inv)
        self.assertEqual(len(sent(self.conn, "M7", ambassador_id=inv["ambassador_id"])), 1)
        with core.tx(self.conn):
            domain.accept_invitation(self.conn, inv["id"], inv["ambassador_id"])
        notify.flush(self.conn)
        self.assertEqual(domain.booking_full(self.conn, b["id"])["status"], "confirmado")
        m2 = sent(self.conn, "M2", booking_id=b["id"])
        name = core.first_name(domain.ambassador_row(self.conn, inv["ambassador_id"])["display_name"])
        self.assertEqual(len(m2), 1)
        self.assertIn(name, m2[0]["subject"])

    def test_decline_passes_to_reserve_then_exception(self):
        b = book(self.conn, form(self.slot))
        first = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        with core.tx(self.conn):
            domain.decline_invitation(self.conn, first["id"], first["ambassador_id"], "prova")
        second = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        self.assertNotEqual(first["ambassador_id"], second["ambassador_id"])
        with core.tx(self.conn):
            domain.decline_invitation(self.conn, second["id"], second["ambassador_id"])
        notify.flush(self.conn)
        g = domain.group_row(self.conn, b["tour_group_id"])
        self.assertEqual(g["in_exception"], 1)
        self.assertEqual(domain.booking_full(self.conn, b["id"])["status"], "excecao")
        self.assertEqual(len(sent(self.conn, "M11")), 1)

    def test_expiration_moves_to_next_and_deadline_opens_exception(self):
        b = book(self.conn, form(self.slot))
        first = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        core.set_clock_offset((core.parse_iso(first["expires_at"]) - now_utc()).total_seconds() + 60)
        jobs.expire_invitations(self.conn)
        self.assertEqual(core.one(self.conn.execute("SELECT status FROM invitations WHERE id=?", (first["id"],)))["status"], "expirado")
        second = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        self.assertIsNotNone(second)
        g = domain.group_row(self.conn, b["tour_group_id"])
        core.set_clock_offset((core.parse_iso(g["deadline_at"]) - core.now_utc()).total_seconds() + core.clock_offset() + 60)
        jobs.expire_invitations(self.conn)
        self.assertEqual(domain.group_row(self.conn, b["tour_group_id"])["in_exception"], 1)

    def test_exception_resolution_is_manual_and_confirms(self):
        b = book(self.conn, form(self.slot))
        with core.tx(self.conn):
            domain.open_exception(self.conn, b["tour_group_id"], "teste")
            domain.resolve_exception(self.conn, b["tour_group_id"], "admissoes_conduz", 1)
        self.assertEqual(domain.booking_full(self.conn, b["id"])["status"], "confirmado")
        manual = core.one(self.conn.execute("SELECT COUNT(*) n FROM events WHERE is_manual=1"))["n"]
        self.assertEqual(manual, 1)

    def test_withdraw_reopens_allocation(self):
        b = book(self.conn, form(self.slot))
        inv = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        with core.tx(self.conn):
            domain.accept_invitation(self.conn, inv["id"], inv["ambassador_id"])
            domain.withdraw(self.conn, b["tour_group_id"], inv["ambassador_id"], "doente")
        new = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        self.assertNotEqual(new["ambassador_id"], inv["ambassador_id"])
        self.assertEqual(domain.booking_full(self.conn, b["id"])["status"], "aguardando_embaixador")

    def test_reminder_sent_once_even_if_job_runs_twice(self):
        tomorrow = core.today_local() + timedelta(days=1)
        add_ambassador(self.conn, "Carla Embaixadora", [(tomorrow.weekday(), "17:00")])
        slot = iso(core.local_slot(tomorrow.isoformat(), "17:00"))
        with core.tx(self.conn):
            b = domain.create_booking(self.conn, form(slot), ignore_window=True)
            self.conn.execute("UPDATE bookings SET created_at=? WHERE id=?", (iso(now_utc() - timedelta(days=3)), b["id"]))
        # força o horário local para depois das 10h
        local_now = core.local(now_utc())
        if local_now.hour < 10:
            core.set_clock_offset((10 - local_now.hour) * 3600 + 120)
        if tomorrow.weekday() > 4 or core.local(now_utc()).date() != core.today_local():
            self.skipTest("fim de semana")
        jobs.send_reminders(self.conn)
        jobs.send_reminders(self.conn)
        self.assertEqual(len(sent(self.conn, "M3", booking_id=b["id"], channel="email")), 1)

    def test_cancel_and_reschedule_free_seat_and_notify_ambassador(self):
        b = book(self.conn, form(self.slot, companions=4))
        inv = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        with core.tx(self.conn):
            domain.accept_invitation(self.conn, inv["id"], inv["ambassador_id"])
        b2 = book(self.conn, form(self.slot, companions=1))
        before = self.slot_info()["remaining"]
        with core.tx(self.conn):
            domain.cancel_booking(self.conn, b2["id"], actor="candidate", reason="não poderei ir")
        self.assertEqual(self.slot_info()["remaining"], before + 2)
        self.assertEqual(len(sent(self.conn, "M10", ambassador_id=inv["ambassador_id"])), 2)  # entrou + saiu
        # reagendar para outro dia
        day2 = self.day + timedelta(days=7)
        add_ambassador(self.conn, "Davi Embaixador", [(day2.weekday(), "10:00")])
        new_slot = iso(core.local_slot(day2.isoformat(), "10:00"))
        with core.tx(self.conn):
            nb = domain.reschedule_booking(self.conn, b["id"], new_slot)
        self.assertEqual(nb["protocol"], b["protocol"])
        self.assertEqual(nb["reschedule_count"], 1)
        self.assertEqual(domain.group_row(self.conn, b["tour_group_id"])["status"], "cancelado")
        self.assertEqual(self.slot_info()["remaining"], 20)
        self.assertEqual(len(sent(self.conn, "M4", booking_id=b["id"])), 1)

    def test_reschedule_limit(self):
        b = book(self.conn, form(self.slot))
        wd = self.day.weekday()
        add_ambassador(self.conn, "Eva Embaixadora", [(wd, "10:00"), (wd, "14:00")])
        slots = [iso(core.local_slot(self.day.isoformat(), t)) for t in ("10:00", "14:00", "15:00")]
        for s in slots:
            with core.tx(self.conn):
                domain.reschedule_booking(self.conn, b["id"], s)
        with self.assertRaises(domain.DomainError) as ctx:
            with core.tx(self.conn):
                domain.reschedule_booking(self.conn, b["id"], slots[0])
        self.assertEqual(ctx.exception.code, "limite_reagendamento")

    def test_attendance_nps_and_crm_close_full_flow_without_manual_actions(self):
        b = book(self.conn, form(self.slot))
        nb = book(self.conn, form(self.slot))
        inv = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        with core.tx(self.conn):
            domain.accept_invitation(self.conn, inv["id"], inv["ambassador_id"])
        core.set_clock_offset((core.parse_iso(self.slot) - now_utc()).total_seconds() + 3600)
        with core.tx(self.conn):
            domain.mark_attendance(self.conn, b["tour_group_id"], [{"booking_id": b["id"], "attended": True},
                                                                   {"booking_id": nb["id"], "attended": False}],
                                   actor="ambassador", actor_id=inv["ambassador_id"])
        self.assertEqual(domain.booking_full(self.conn, nb["id"])["outcome"], "nao_compareceu")
        self.assertEqual(len(sent(self.conn, "M6", booking_id=b["id"])), 1)
        # D+1 10h: reenvio único
        d1 = core.local(core.parse_iso(self.slot)).replace(hour=10, minute=30) + timedelta(days=1)
        core.set_clock_offset((d1 - core.now_utc()).total_seconds() + core.clock_offset())
        jobs.nps_followup(self.conn)
        jobs.nps_followup(self.conn)
        self.assertEqual(len(sent(self.conn, "M6", booking_id=b["id"])), 2)
        # fim do D+1 (23h): encerra no CRM
        core.set_clock_offset(core.clock_offset() + 13 * 3600)
        jobs.close_crm_activity(self.conn)
        jobs.crm_retry(self.conn)
        self.assertEqual(domain.booking_full(self.conn, b["id"])["status"], "encerrado")
        ops = [r["operation"] for r in self.conn.execute("SELECT operation FROM crm_sync_log WHERE booking_id=? AND status='ok'", (b["id"],))]
        self.assertIn("upsertLead", ops)
        self.assertIn("closeActivity", ops)
        self.assertEqual(core.one(self.conn.execute("SELECT COUNT(*) n FROM events WHERE is_manual=1"))["n"], 0)

    def test_ambassador_can_claim_exception_group_and_earns_points(self):
        b = book(self.conn, form(self.slot))
        with core.tx(self.conn):
            domain.open_exception(self.conn, b["tour_group_id"], "teste")
        opp = metrics.ambassador_opportunities(self.conn, self.a1)
        self.assertEqual([o["group_id"] for o in opp["claimable"]], [b["tour_group_id"]])
        with core.tx(self.conn):
            domain.claim_group(self.conn, b["tour_group_id"], self.a1)
        self.assertEqual(domain.booking_full(self.conn, b["id"])["status"], "confirmado")
        self.assertEqual(core.one(self.conn.execute("SELECT COUNT(*) n FROM events WHERE is_manual=1"))["n"], 0)
        with self.assertRaises(domain.DomainError):
            with core.tx(self.conn):
                domain.claim_group(self.conn, b["tour_group_id"], self.a2)
        core.set_clock_offset((core.parse_iso(self.slot) - now_utc()).total_seconds() + 3600)
        with core.tx(self.conn):
            domain.mark_attendance(self.conn, b["tour_group_id"], [{"booking_id": b["id"], "attended": True}], actor="ambassador", actor_id=self.a1)
        game = metrics.ambassador_facts(self.conn, self.a1)["game"]
        self.assertGreaterEqual(game["points"], 10)
        self.assertGreaterEqual(game["streak"], 1)

    def test_nps_response_closes_immediately(self):
        b = book(self.conn, form(self.slot))
        inv = core.one(self.conn.execute("SELECT * FROM invitations WHERE status='enviado'"))
        with core.tx(self.conn):
            domain.accept_invitation(self.conn, inv["id"], inv["ambassador_id"])
        core.set_clock_offset((core.parse_iso(self.slot) - now_utc()).total_seconds() + 3600)
        with core.tx(self.conn):
            domain.submit_nps(self.conn, b["id"], {"score": 10, "highlight": "Tudo"})
        full = domain.booking_full(self.conn, b["id"])
        self.assertEqual(full["status"], "encerrado")
        self.assertEqual(full["outcome"], "realizado")

    def test_metrics_from_seed(self):
        conn = fresh_db()
        conn.close()
        for s in ("", "-wal", "-shm"):
            p = os.environ["DATABASE_PATH"] + s
            if os.path.exists(p):
                os.remove(p)
        conn = core.connect()
        seed.seed(conn)
        d = metrics.dashboard(conn, core.today_local() - timedelta(days=31), core.today_local())
        t = d["totals"]
        self.assertEqual(t["bookings"], 60)
        self.assertEqual(t["realized"] + t["no_show"] + t["cancelled_candidate"] + t["cancelled_admissions"] + t["presence_pending"], 60)
        self.assertAlmostEqual(d["realized_rate"]["gross"], round(100 * t["realized"] / 60, 1))
        self.assertLess(d["first_confirmation_seconds"]["avg"], 60)
        self.assertIsNotNone(d["nps"]["score"])
        self.assertGreater(d["manual_tasks_per_tour"]["manual_events"], 0)
        self.assertTrue(-100 <= d["nps"]["score"] <= 100)


class ApiPrivacyTests(unittest.TestCase):
    """Nenhuma tela ou resposta de API do embaixador traz CPF, e-mail, telefone ou sobrenome do candidato."""

    @classmethod
    def setUpClass(cls):
        conn = fresh_db()
        cls.day, cls.slot = future_slot()
        cls.amb = add_ambassador(conn, "Fabio Embaixador", [(cls.day.weekday(), "15:00")])
        cls.data = form(cls.slot, companions=1, phone="11 98765-4321", mobility_restriction=True, mobility_notes="rampa",
                        questions="Laboratórios?")
        cls.booking = book(conn, cls.data)
        conn.close()
        cls.httpd = server.serve("127.0.0.1", 0, scheduler=False)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def req(self, method, path, body=None, cookie=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, method=method)
        if data:
            r.add_header("Content-Type", "application/json")
        if cookie:
            r.add_header("Cookie", cookie)
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, resp.read().decode(), resp.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(), e.headers

    def login(self, email):
        status, body, headers = self.req("POST", "/api/auth/dev-login", {"email": email})
        self.assertEqual(status, 200)
        return headers["Set-Cookie"].split(";")[0]

    def test_ambassador_endpoints_hide_sensitive_data(self):
        cookie = self.login("fabio.embaixador@exemplo.com")
        status, body, _ = self.req("GET", "/api/ambassador/invitations", cookie=cookie)
        self.assertEqual(status, 200)
        inv = json.loads(body)["invitations"][0]
        status, body2, _ = self.req("POST", f"/api/ambassador/invitations/{inv['invitation_id']}/accept", {}, cookie=cookie)
        self.assertEqual(status, 200, body2)
        bodies = [body]
        for path in ("/api/ambassador/invitations", "/api/ambassador/tours", "/api/ambassador/me", "/api/ambassador/availability"):
            st, b, _ = self.req("GET", path, cookie=cookie)
            self.assertEqual(st, 200)
            bodies.append(b)
        blob = "\n".join(bodies)
        surname = self.data["full_name"].split()[-1]
        digits = core.cpf_digits(self.data["cpf"])
        for secret in (self.data["email"], digits, core.format_cpf(digits), "98765", surname):
            self.assertNotIn(secret, blob, f"vazou {secret}")
        self.assertIn("Candidata", blob)       # primeiro nome aparece
        self.assertIn("rampa", blob)           # restrição de locomoção chega ao embaixador
        # e o e-mail M7 para o embaixador também não traz dados sensíveis
        conn = core.connect()
        m7 = core.rows(conn.execute("SELECT body_text, subject FROM notifications WHERE template_code IN ('M7','M10','M9')"))
        for m in m7:
            for secret in (self.data["email"], digits, surname):
                self.assertNotIn(secret, m["body_text"] + m["subject"])

    def test_roles_are_enforced(self):
        st, _, _ = self.req("GET", "/api/admin/dashboard")
        self.assertEqual(st, 401)
        cookie = self.login("fabio.embaixador@exemplo.com")
        st, _, _ = self.req("GET", "/api/admin/bookings", cookie=cookie)
        self.assertEqual(st, 401)

    def test_public_flow_and_manage_link(self):
        st, body, _ = self.req("GET", f"/api/public/slots?from={self.day}&to={self.day}&party=2")
        self.assertEqual(st, 200)
        self.assertTrue(any(s["available"] for s in json.loads(body)["slots"]))
        st, body, _ = self.req("POST", "/api/public/bookings", form(self.slot))
        self.assertEqual(st, 201, body)
        created = json.loads(body)
        token = created["manage_url"].split("/")[-1]
        st, body, _ = self.req("GET", f"/api/public/bookings/{token}")
        self.assertEqual(st, 200)
        self.assertEqual(json.loads(body)["protocol"], created["protocol"])
        st, _, _ = self.req("GET", "/api/public/bookings/" + token[:-3] + "xyz")
        self.assertEqual(st, 404)
        st, body, _ = self.req("POST", f"/api/public/bookings/{token}/cancel", {"reason": "outro"})
        self.assertEqual(json.loads(body)["status"], "cancelado_candidato")

    def test_validation_errors_are_field_level(self):
        st, body, _ = self.req("POST", "/api/public/bookings", form(self.slot, cpf="111.111.111-11", email_confirm="x@y.com"))
        self.assertEqual(st, 422)
        fields = json.loads(body)["fields"]
        self.assertIn("cpf", fields)
        self.assertIn("email_confirm", fields)

    def test_admin_exports_csv(self):
        cookie = self.login("adm@exemplo.com")
        for kind in ("bookings", "attendance", "nps", "crm", "dashboard"):
            st, body, headers = self.req("GET", f"/api/admin/export/{kind}.csv", cookie=cookie)
            self.assertEqual(st, 200)
            self.assertIn("text/csv", headers["Content-Type"])
        st, body, _ = self.req("GET", "/api/admin/dashboard", cookie=cookie)
        self.assertEqual(st, 200)
        self.assertIn("realized_rate", json.loads(body))


class EmailAdapterTests(unittest.TestCase):
    """Envio real pelo Brevo, testado contra um servidor falso local (nada sai para a internet)."""

    def setUp(self):
        from http.server import BaseHTTPRequestHandler, HTTPServer
        self.calls = []
        test = self

        class FakeBrevo(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                test.calls.append({"key": self.headers.get("api-key"), "body": body})
                ok = body["to"][0]["email"] != "recusa@teste.com"
                self.send_response(201 if ok else 400)
                self.end_headers()
                self.wfile.write(b'{"messageId":"x"}' if ok else b'{"message":"sender not valid"}')

            def log_message(self, *a):
                pass

        self.httpd = HTTPServer(("127.0.0.1", 0), FakeBrevo)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.env = {"BREVO_API_KEY": "chave-teste", "EMAIL_FROM": "Tours Insper <tours@teste.com>",
                    "BREVO_API_URL": f"http://127.0.0.1:{self.httpd.server_port}/v3/smtp/email"}
        self.saved = {k: os.environ.get(k) for k in self.env}
        os.environ.update(self.env)

    def tearDown(self):
        self.httpd.shutdown()
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_brevo_sends_real_address_with_attachment(self):
        adapter = notify.email_adapter()
        self.assertEqual(adapter.name, "brevo")
        status = adapter.send("candidato@gmail.com", "Assunto", "texto", "<p>html</p>",
                              [{"filename": "visita.ics", "content_type": "text/calendar", "content": "BEGIN:VCALENDAR"}])
        self.assertEqual(status, "enviado")
        call = self.calls[0]
        self.assertEqual(call["key"], "chave-teste")
        self.assertEqual(call["body"]["sender"], {"name": "Tours Insper", "email": "tours@teste.com"})
        self.assertEqual(call["body"]["to"], [{"email": "candidato@gmail.com"}])
        self.assertEqual(call["body"]["attachment"][0]["name"], "visita.ics")

    def test_fictional_addresses_stay_in_local_inbox(self):
        self.assertEqual(notify.email_adapter().send("lucas.martins@exemplo.com", "s", "t", "<p>h</p>", []), "simulado")
        self.assertEqual(self.calls, [])

    def test_brevo_error_is_reported(self):
        with self.assertRaises(RuntimeError) as ctx:
            notify.email_adapter().send("recusa@teste.com", "s", "t", "<p>h</p>", [])
        self.assertIn("sender not valid", str(ctx.exception))

    def test_without_key_uses_local_inbox(self):
        os.environ.pop("BREVO_API_KEY")
        self.assertEqual(notify.email_adapter().name, "local")


if __name__ == "__main__":
    unittest.main()

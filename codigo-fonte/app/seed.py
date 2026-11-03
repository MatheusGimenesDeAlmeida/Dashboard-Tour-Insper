"""Dados de exemplo (seção 17). Tudo é fictício: e-mails @exemplo.com e CPFs válidos gerados aleatoriamente."""
import json
import random
from datetime import timedelta

from . import core, domain, notify
from .core import iso, now_utc

COURSES = ["Administração", "Economia", "Direito", "Ciência da Computação", "Engenharia de Computação",
           "Engenharia Mecânica", "Engenharia Mecatrônica", "Ainda não decidi"]

ADMISSIONS = [("Beatriz Lima", "beatriz.admissoes@exemplo.com"), ("Carlos Souza", "carlos.admissoes@exemplo.com"),
              ("Daniela Prado", "daniela.admissoes@exemplo.com")]

AMBASSADORS = [
    ("Lucas Martins", "Economia", ["Português", "Inglês"]), ("Mariana Costa", "Administração", ["Português"]),
    ("Pedro Almeida", "Engenharia de Computação", ["Português", "Inglês"]), ("Julia Ferreira", "Direito", ["Português", "Espanhol"]),
    ("Gabriel Rocha", "Ciência da Computação", ["Português"]), ("Beatriz Nunes", "Economia", ["Português"]),
    ("Rafael Teixeira", "Engenharia Mecânica", ["Português", "Inglês"]), ("Larissa Gomes", "Administração", ["Português"]),
    ("Thiago Ribeiro", "Engenharia Mecatrônica", ["Português"]), ("Camila Duarte", "Direito", ["Português", "Inglês"]),
    ("Felipe Barros", "Economia", ["Português"]), ("Isabela Moura", "Ciência da Computação", ["Português", "Espanhol"]),
]

FIRST = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Fernando", "Giovana", "Henrique", "Isadora", "João", "Kátia", "Leonardo",
         "Manuela", "Nicolas", "Olívia", "Paulo", "Rafaela", "Samuel", "Tatiana", "Vinícius", "Yasmin", "Arthur", "Helena", "Miguel"]
LAST = ["Andrade", "Barbosa", "Cardoso", "Dias", "Esteves", "Freitas", "Guimarães", "Hoffmann", "Lacerda", "Macedo", "Nogueira",
        "Pacheco", "Queiroz", "Siqueira", "Toledo", "Vasconcelos"]

QUESTIONS = ["", "", "", "Quero conhecer os laboratórios.", "Como funciona o intercâmbio?", "Tenho interesse nas ligas e entidades.",
             "Quero saber sobre bolsas.", "Gostaria de ver a biblioteca."]
HIGHLIGHTS = ["A conversa com o embaixador.", "Os laboratórios de engenharia.", "A biblioteca e os espaços de estudo.",
              "Conhecer as entidades estudantis.", ""]
IMPROVEMENTS = ["", "", "Tour um pouco mais longo.", "Mais informação sobre bolsas.", "Sinalização da recepção."]


def make_cpf(rng):
    d = [rng.randint(0, 9) for _ in range(9)]
    for n in (9, 10):
        s = sum(d[i] * (n + 1 - i) for i in range(n))
        d.append((s * 10) % 11 % 10)
    cpf = "".join(map(str, d))
    return cpf if core.cpf_valid(cpf) else make_cpf(rng)


def _person(rng, used):
    while True:
        first, last = rng.choice(FIRST), rng.choice(LAST)
        name = f"{first} {rng.choice(LAST)} {last}"
        if name not in used:
            used.add(name)
            break
    slug = core.cpf_digits(str(len(used))) or "0"
    email = (first + "." + last).lower()
    for a, b in (("á", "a"), ("ã", "a"), ("â", "a"), ("é", "e"), ("ê", "e"), ("í", "i"), ("ó", "o"), ("ô", "o"), ("ú", "u"), ("ç", "c")):
        email = email.replace(a, b)
    return name, f"{email}{slug}@exemplo.com"


def seed(conn, rng_seed=42):
    rng = random.Random(rng_seed)
    core.init_db(conn)
    notify.ensure_templates(conn)
    now = now_utc()
    with core.tx(conn):
        for i, c in enumerate(COURSES):
            conn.execute("INSERT INTO courses(name, active, ord) VALUES (?,?,?)", (c, 1, i))
        for name, email in ADMISSIONS:
            conn.execute("INSERT INTO users(email, name, role, created_at) VALUES (?,?,?,?)", (email, name, "admissions", iso(now)))
        cfg = core.get_config(conn)
        amb_ids = []
        for idx, (name, course, langs) in enumerate(AMBASSADORS):
            email = name.lower().replace(" ", ".") + "@exemplo.com"
            uid = conn.execute("INSERT INTO users(email, name, role, created_at) VALUES (?,?,?,?)",
                               (email, name, "ambassador", iso(now))).lastrowid
            aid = conn.execute("INSERT INTO ambassadors(user_id, display_name, course, languages, phone, availability_updated_at, created_at) "
                               "VALUES (?,?,?,?,?,?,?)", (uid, name, course, json.dumps(langs, ensure_ascii=False),
                                                          f"11 9{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}",
                                                          iso(now - timedelta(days=rng.choice([2, 5, 12, 40]))), iso(now))).lastrowid
            amb_ids.append(aid)
            # mais disponibilidade na sexta e quinta (reflete a demanda)
            weights = {4: 0.75, 3: 0.65, 0: 0.5, 1: 0.4, 2: 0.35}
            for wd in cfg["weekdays"]:
                for t in cfg["start_times"]:
                    if rng.random() < weights.get(wd, 0.4):
                        conn.execute("INSERT INTO availability_rules(ambassador_id, weekday, start_time) VALUES (?,?,?)", (aid, wd, t))
        # um feriado de exemplo (Proclamação da República)
        conn.execute("INSERT INTO blackouts(date, start_time, reason) VALUES (?,?,?)",
                     (f"{core.today_local().year}-11-15", None, "Feriado — Proclamação da República"))
        conn.execute("INSERT INTO blackouts(date, start_time, reason) VALUES (?,?,?)",
                     (f"{core.today_local().year}-11-20", None, "Feriado — Dia da Consciência Negra"))

    used = set()
    _seed_past(conn, rng, used, amb_ids, cfg)
    _seed_future(conn, rng, used, cfg)
    notify.flush(conn)


def _form(rng, used, cfg, slot_start):
    name, email = _person(rng, used)
    companions = rng.choice([0, 0, 1, 1, 1, 2, 2, 3])
    return {"full_name": name, "cpf": make_cpf(rng), "email": email, "email_confirm": email,
            "phone": f"11 9{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}", "course_interest": rng.choice(COURSES[:-1] + COURSES[:3]),
            "is_treineiro": rng.random() < 0.3, "companions": companions,
            "companions_names": [f"{rng.choice(FIRST)} (acompanhante)" for _ in range(companions)],
            "mobility_restriction": rng.random() < 0.05, "mobility_notes": "Usa cadeira de rodas" if rng.random() < 0.5 else "",
            "language": "Inglês" if rng.random() < 0.05 else "Português", "questions": rng.choice(QUESTIONS),
            "privacy_accepted": True, "whatsapp_opt_in": rng.random() < 0.6, "slot_start": slot_start}


def _weighted_slot(rng, cfg, day):
    times = ["15:00", "10:00", "17:00", "14:00", "16:00"]
    return rng.choices(times, weights=[5, 4, 3, 2, 1.5])[0]


def _seed_past(conn, rng, used, amb_ids, cfg):
    """60 agendamentos nos últimos 30 dias, com presença, NPS, cancelamentos e algumas exceções resolvidas."""
    today = core.today_local()
    days = [today - timedelta(days=i) for i in range(1, 31) if (today - timedelta(days=i)).weekday() in cfg["weekdays"]]
    groups = {}
    with core.tx(conn):
        for i in range(60):
            day = rng.choices(days, weights=[{4: 5, 3: 4, 0: 3, 1: 2.5, 2: 2}[d.weekday()] for d in days])[0]
            t = _weighted_slot(rng, cfg, day)
            slot = core.local_slot(day.isoformat(), t)
            slot_s = iso(slot)
            f = _form(rng, used, cfg, slot_s)
            party = f["companions"] + 1
            g = groups.get(slot_s)
            if not g or g["people"] + party > cfg["group_capacity"]:
                created = slot - timedelta(days=rng.randint(2, 12), hours=rng.randint(0, 10))
                exception = rng.random() < 0.12
                amb = rng.choice(amb_ids)
                gid = conn.execute("INSERT INTO tour_groups(slot_start, status, ambassador_id, handled_by_admissions, capacity, deadline_at, "
                                   "exception_opened_at, exception_resolved_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                                   (slot_s, "realizado", None if exception and rng.random() < 0.4 else amb,
                                    0, cfg["group_capacity"], iso(slot - timedelta(hours=24)),
                                    iso(slot - timedelta(hours=24)) if exception else None,
                                    iso(slot - timedelta(hours=rng.randint(4, 20))) if exception else None, iso(created))).lastrowid
                grow = core.one(conn.execute("SELECT * FROM tour_groups WHERE id=?", (gid,)))
                if grow["ambassador_id"] is None:
                    conn.execute("UPDATE tour_groups SET handled_by_admissions=1 WHERE id=?", (gid,))
                    core.log_event(conn, "group", gid, "exception.admissions_conducts", actor="admissions", actor_id=1)
                else:
                    sent = created + timedelta(seconds=5)
                    if exception:
                        decl = rng.choice([a for a in amb_ids if a != amb])
                        conn.execute("INSERT INTO invitations(tour_group_id, ambassador_id, rank, status, sent_at, responded_at, expires_at, created_at) "
                                     "VALUES (?,?,?,?,?,?,?,?)", (gid, decl, 1, "expirado", iso(sent), iso(sent + timedelta(hours=12)),
                                                                  iso(sent + timedelta(hours=12)), iso(created)))
                        conn.execute("INSERT INTO invitations(tour_group_id, ambassador_id, rank, status, sent_at, responded_at, created_at) "
                                     "VALUES (?,?,0,'aceito',?,?,?)", (gid, amb, grow["exception_resolved_at"], grow["exception_resolved_at"], iso(created)))
                        core.log_event(conn, "group", gid, "exception.assigned", actor="admissions", actor_id=1, payload={"ambassador_id": amb})
                    else:
                        if rng.random() < 0.25:
                            decl = rng.choice([a for a in amb_ids if a != amb])
                            conn.execute("INSERT INTO invitations(tour_group_id, ambassador_id, rank, status, sent_at, responded_at, decline_reason, created_at) "
                                         "VALUES (?,?,?,?,?,?,?,?)", (gid, decl, 1, "recusado", iso(sent), iso(sent + timedelta(hours=2)),
                                                                      "Tenho prova neste horário", iso(created)))
                            sent += timedelta(hours=2)
                        conn.execute("INSERT INTO invitations(tour_group_id, ambassador_id, rank, status, sent_at, responded_at, created_at) "
                                     "VALUES (?,?,?,?,?,?,?)", (gid, amb, 2, "aceito", iso(sent),
                                                                iso(sent + timedelta(hours=rng.uniform(0.3, 9))), iso(created)))
                    conn.execute("INSERT INTO gifts(tour_group_id, ambassador_id, collected_at) VALUES (?,?,?)",
                                 (gid, amb, iso(slot) if rng.random() < 0.85 else None))
                g = groups[slot_s] = {"id": gid, "people": 0, "created": created}
            g["people"] += party
            created = g["created"] + timedelta(hours=rng.randint(0, 20))
            cand = conn.execute("INSERT INTO candidates(full_name, cpf_encrypted, cpf_hash, email, phone, course_interest, is_treineiro, created_at) "
                                "VALUES (?,?,?,?,?,?,?,?)", (f["full_name"], core.encrypt_cpf(f["cpf"]), core.cpf_hash(f["cpf"]), f["email"],
                                                             core.cpf_digits(f["phone"]), f["course_interest"], 1 if f["is_treineiro"] else 0,
                                                             iso(created))).lastrowid
            r = rng.random()
            if r < 0.66:
                status, outcome = "realizado", "realizado"
            elif r < 0.78:
                status, outcome = "nao_compareceu", "nao_compareceu"
            elif r < 0.92:
                status, outcome = "cancelado_candidato", "cancelado_candidato"
            elif r < 0.95:
                status, outcome = "cancelado_admissoes", "cancelado_admissoes"
            else:
                status, outcome = "presenca_pendente", None
            confirmed = created + timedelta(hours=rng.uniform(0.2, 10))
            cancelled = slot - timedelta(hours=rng.choice([3, 30, 72, 120])) if status.startswith("cancelado") else None
            bid = conn.execute(
                "INSERT INTO bookings(candidate_id, tour_group_id, status, outcome, party_size, companions_names, mobility_restriction, "
                "mobility_notes, language, questions, privacy_accepted_at, whatsapp_opt_in, confirmed_at, cancelled_at, cancel_reason, "
                "reminder_sent_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (cand, g["id"], status, outcome, party, json.dumps(f["companions_names"], ensure_ascii=False), 1 if f["mobility_restriction"] else 0,
                 f["mobility_notes"], f["language"], f["questions"], iso(created), 1 if f["whatsapp_opt_in"] else 0, iso(confirmed),
                 iso(cancelled) if cancelled else None, "não poderei ir" if status == "cancelado_candidato" else None,
                 iso(slot - timedelta(hours=14)), iso(created), iso(slot))).lastrowid
            conn.execute("UPDATE bookings SET protocol=? WHERE id=?", (f"TOUR-{slot.year}-{bid:06d}", bid))
            conn.execute("INSERT INTO notifications(dedupe_key, booking_id, recipient, template_code, channel, status, subject, body_text, "
                         "sent_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                         (f"M1:b{bid}:criado", bid, f["email"], "M1", "email", "enviado", "Sua visita ao Insper está agendada",
                          "(mensagem de exemplo do seed)", iso(created + timedelta(seconds=rng.randint(2, 40))), iso(created)))
            core.log_event(conn, "booking", bid, "booking.created", actor="candidate")
            if status in ("realizado", "nao_compareceu"):
                conn.execute("INSERT INTO attendance(booking_id, attended, marked_by, marked_at) VALUES (?,?,?,?)",
                             (bid, 1 if status == "realizado" else 0, "ambassador", iso(slot + timedelta(hours=1))))
            if status == "realizado" and rng.random() < 0.7:
                score = rng.choices(range(11), weights=[0.2, 0.2, 0.2, 0.3, 0.3, 0.5, 1, 2, 5, 9, 14])[0]
                conn.execute("INSERT INTO nps_responses(booking_id, score, highlight, improvement, ambassador_rating, created_at) VALUES (?,?,?,?,?,?)",
                             (bid, score, rng.choice(HIGHLIGHTS), rng.choice(IMPROVEMENTS), rng.choice([4, 5, 5, 5, 3]),
                              iso(slot + timedelta(hours=rng.uniform(1, 30)))))
                conn.execute("UPDATE bookings SET status='encerrado', closed_at=? WHERE id=?", (iso(slot + timedelta(days=1)), bid))
            elif status == "realizado" and day < today - timedelta(days=1):
                conn.execute("UPDATE bookings SET status='encerrado', closed_at=? WHERE id=?", (iso(slot + timedelta(days=1, hours=13)), bid))
            if status == "cancelado_admissoes":
                core.log_event(conn, "booking", bid, "booking.cancelled", actor="admissions", actor_id=1)
        # grupos sem nenhum agendamento ativo/realizado foram cancelados
        for g in core.rows(conn.execute("SELECT id FROM tour_groups")):
            n = core.one(conn.execute("SELECT COUNT(*) n FROM bookings WHERE tour_group_id=? AND status NOT LIKE 'cancelado%'", (g["id"],)))["n"]
            if n == 0:
                conn.execute("UPDATE tour_groups SET status='cancelado' WHERE id=?", (g["id"],))


def _seed_future(conn, rng, used, cfg):
    """40 agendamentos nos próximos 14 dias, criados pelo fluxo real (vagas, alocação, convites, mensagens)."""
    today = core.today_local()
    created = 0
    attempts = 0
    while created < 40 and attempts < 400:
        attempts += 1
        day = today + timedelta(days=rng.randint(1, 14))
        if day.weekday() not in cfg["weekdays"]:
            continue
        t = _weighted_slot(rng, cfg, day)
        slot_s = iso(core.local_slot(day.isoformat(), t))
        try:
            with core.tx(conn):
                domain.create_booking(conn, _form(rng, used, cfg, slot_s), ignore_window=True)
            created += 1
        except domain.DomainError:
            continue
    # respostas dos embaixadores: a maioria aceita, alguns recusam, alguns ficam pendentes; 2 grupos vão para exceção
    open_groups = core.rows(conn.execute("SELECT id FROM tour_groups WHERE status='aberto' ORDER BY slot_start"))
    for i, g in enumerate(open_groups):
        with core.tx(conn):
            inv = core.one(conn.execute("SELECT * FROM invitations WHERE tour_group_id=? AND status='enviado'", (g["id"],)))
            if not inv:
                continue
            if i in (1, 5):
                domain.open_exception(conn, g["id"], "Nenhum embaixador disponível aceitou o convite.")
                continue
            r = rng.random()
            if r < 0.15:
                domain.decline_invitation(conn, inv["id"], inv["ambassador_id"], "Tenho aula neste horário")
                inv = core.one(conn.execute("SELECT * FROM invitations WHERE tour_group_id=? AND status='enviado'", (g["id"],)))
                if inv and rng.random() < 0.7:
                    domain.accept_invitation(conn, inv["id"], inv["ambassador_id"])
            elif r < 0.8:
                domain.accept_invitation(conn, inv["id"], inv["ambassador_id"])

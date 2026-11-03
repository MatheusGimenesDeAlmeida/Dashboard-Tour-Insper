"""Infraestrutura comum: configuração, tempo, banco, tokens, criptografia de CPF e eventos."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env(name, default=None):
    return os.environ.get(name, default)


APP_ENV = env("APP_ENV", "dev")
DATABASE_PATH = env("DATABASE_PATH", os.path.join(BASE_DIR, "data", "tour.db"))
# No Render, RENDER_EXTERNAL_URL traz o endereço público (https://….onrender.com) automaticamente.
APP_BASE_URL = (env("APP_BASE_URL") or env("RENDER_EXTERNAL_URL") or "http://localhost:8000").rstrip("/")
TZ = ZoneInfo(env("TZ_NAME", "America/Sao_Paulo"))
# Em produção, estes segredos DEVEM vir do ambiente. Os padrões existem só para desenvolvimento.
AUTH_SECRET = env("AUTH_SECRET", "dev-auth-secret-troque-em-producao").encode()
TOKEN_SIGNING_SECRET = env("TOKEN_SIGNING_SECRET", "dev-token-secret-troque-em-producao").encode()
CPF_ENCRYPTION_KEY = env("CPF_ENCRYPTION_KEY", "dev-cpf-key-troque-em-producao").encode()

ACTIVE_STATUSES = ("aguardando_embaixador", "confirmado", "excecao")
CANCELLED_STATUSES = ("cancelado_candidato", "cancelado_admissoes")


# ---------------------------------------------------------------- tempo
# O relógio pode ser adiantado na tela de simulação (apenas em desenvolvimento),
# para testar lembretes, expiração de convites e NPS sem esperar.
_clock_offset = {"seconds": 0.0}


def set_clock_offset(seconds):
    _clock_offset["seconds"] = float(seconds)


def clock_offset():
    return _clock_offset["seconds"]


def now_utc():
    return datetime.now(timezone.utc).replace(microsecond=0) + timedelta(seconds=_clock_offset["seconds"])


def iso(dt):
    """Formato único de armazenamento: UTC, 'YYYY-MM-DDTHH:MM:SSZ' (ordenável como texto)."""
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def local(dt):
    return dt.astimezone(TZ)


def local_slot(date_str, time_str):
    d = date.fromisoformat(date_str)
    hh, mm = (int(x) for x in time_str.split(":"))
    return datetime.combine(d, time(hh, mm), tzinfo=TZ)


def slot_key(slot_start_iso):
    """(data local, hora local) de um slot armazenado em UTC."""
    dt = local(parse_iso(slot_start_iso))
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


def today_local():
    return local(now_utc()).date()


WEEKDAYS_PT = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
             "setembro", "outubro", "novembro", "dezembro"]


def fmt_date_pt(dt):
    dt = local(dt)
    return f"{WEEKDAYS_PT[dt.weekday()]}, {dt.day} de {MONTHS_PT[dt.month - 1]} de {dt.year}"


def fmt_time_pt(dt):
    dt = local(dt)
    return f"{dt.hour}h" if dt.minute == 0 else f"{dt.hour}h{dt.minute:02d}"


# ---------------------------------------------------------------- banco
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admissions','ambassador')),
  last_login_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ambassadors (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), display_name TEXT NOT NULL,
  course TEXT, languages TEXT NOT NULL DEFAULT '["Português"]', phone TEXT,
  active INTEGER NOT NULL DEFAULT 1, availability_updated_at TEXT,
  notify_prefs TEXT NOT NULL DEFAULT '{"email": true}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS availability_rules (
  id INTEGER PRIMARY KEY, ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id),
  weekday INTEGER NOT NULL, start_time TEXT NOT NULL, valid_from TEXT, valid_until TEXT
);
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id INTEGER PRIMARY KEY, ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id),
  date TEXT NOT NULL, start_time TEXT, available INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, cpf_encrypted TEXT NOT NULL,
  cpf_hash TEXT UNIQUE NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
  course_interest TEXT, is_treineiro INTEGER NOT NULL DEFAULT 0, anonymized_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tour_groups (
  id INTEGER PRIMARY KEY, slot_start TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aberto','com_embaixador','realizado','cancelado')),
  ambassador_id INTEGER REFERENCES ambassadors(id), handled_by_admissions INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL, deadline_at TEXT, in_exception INTEGER NOT NULL DEFAULT 0,
  exception_opened_at TEXT, exception_resolved_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_groups_slot ON tour_groups(slot_start);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, protocol TEXT UNIQUE, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  tour_group_id INTEGER NOT NULL REFERENCES tour_groups(id), status TEXT NOT NULL, outcome TEXT,
  party_size INTEGER NOT NULL, companions_names TEXT NOT NULL DEFAULT '[]',
  mobility_restriction INTEGER NOT NULL DEFAULT 0, mobility_notes TEXT, language TEXT NOT NULL DEFAULT 'Português',
  questions TEXT, privacy_accepted_at TEXT NOT NULL, whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  reschedule_count INTEGER NOT NULL DEFAULT 0, crm_id TEXT, cancel_reason TEXT, cancelled_at TEXT,
  confirmed_at TEXT, presence_confirmed_at TEXT, reminder_sent_at TEXT, closed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bookings_group ON bookings(tour_group_id);
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY, tour_group_id INTEGER NOT NULL REFERENCES tour_groups(id),
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id), rank INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendente','enviado','aceito','recusado','expirado','cancelado','desistiu')),
  sent_at TEXT, responded_at TEXT, expires_at TEXT, decline_reason TEXT, reminder_sent_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY, booking_id INTEGER UNIQUE NOT NULL REFERENCES bookings(id),
  attended INTEGER NOT NULL, marked_by TEXT, marked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gifts (
  id INTEGER PRIMARY KEY, tour_group_id INTEGER UNIQUE NOT NULL REFERENCES tour_groups(id),
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id), collected_at TEXT
);
CREATE TABLE IF NOT EXISTS nps_responses (
  id INTEGER PRIMARY KEY, booking_id INTEGER UNIQUE NOT NULL REFERENCES bookings(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10), highlight TEXT, improvement TEXT,
  ambassador_rating INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS blackouts (id INTEGER PRIMARY KEY, date TEXT NOT NULL, start_time TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, ord INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, audience TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email', subject TEXT NOT NULL, body TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, dedupe_key TEXT UNIQUE NOT NULL, booking_id INTEGER, ambassador_id INTEGER,
  recipient TEXT NOT NULL, template_code TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL,
  subject TEXT, body_text TEXT, body_html TEXT, attachments TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0, sent_at TEXT, error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, type TEXT NOT NULL,
  actor TEXT NOT NULL, actor_id INTEGER, is_manual INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_entity ON events(entity_type, entity_id);
CREATE TABLE IF NOT EXISTS crm_sync_log (
  id INTEGER PRIMARY KEY, booking_id INTEGER, kind TEXT NOT NULL, operation TEXT NOT NULL,
  payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT, last_error TEXT, created_at TEXT NOT NULL, done_at TEXT
);
CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, entity TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY, job TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL, detail TEXT
);
"""


def connect(path=None):
    path = path or DATABASE_PATH
    if path != ":memory:":
        os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, timeout=10, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def init_db(conn):
    conn.executescript(SCHEMA)


class tx:
    """Transação com bloqueio de escrita imediato (serializa reservas de vaga e evita overbooking)."""

    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        self.conn.execute("BEGIN IMMEDIATE")
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        if exc_type:
            self.conn.execute("ROLLBACK")
        else:
            self.conn.execute("COMMIT")
        return False


def rows(cur):
    return [dict(r) for r in cur.fetchall()]


def one(cur):
    r = cur.fetchone()
    return dict(r) if r else None


# ---------------------------------------------------------------- configuração (ScheduleConfig e afins)
DEFAULT_CONFIG = {
    "weekdays": [0, 1, 2, 3, 4],             # 0 = segunda
    "start_times": ["10:00", "14:00", "15:00", "16:00", "17:00"],
    "duration_min": 60,
    "group_capacity": 10,
    "min_lead_hours": 24,
    "max_days_ahead": 60,
    "reminder_time": "10:00",
    "cancel_cutoff_hours": 2,
    "invite_timeout_hours": 12,
    "exception_cutoff_hours": 24,
    "reserve_required": False,
    "max_reschedules": 3,
    "match_course": True,
    "metric_cancel_exclusion_hours": 48,
    "retention_months": 24,
    "meeting_point": "Recepção do Insper — Rua Quatá, 300, Vila Olímpia, São Paulo",
    "what_to_bring": "Documento com foto (RG, CNH ou passaporte) de todas as pessoas do grupo.",
    "privacy_url": "https://www.insper.edu.br/politica-de-privacidade/",
    "virtual_tour_url": "https://www.youtube.com/watch?v=d_xUY4s5KCA",
    "languages": ["Português", "Inglês", "Espanhol"],
    "hidden_fields": [],                      # campos opcionais ocultados por Admissões
    "feature_vestibular_discount": False,     # fora da v1 (seção 3)
    "admissions_email": "admissoes@exemplo.com",
}

_config_lock = threading.Lock()


def get_config(conn):
    cfg = dict(DEFAULT_CONFIG)
    for r in conn.execute("SELECT key, value FROM config"):
        cfg[r["key"]] = json.loads(r["value"])
    return cfg


def set_config(conn, updates):
    with _config_lock:
        for k, v in updates.items():
            if k not in DEFAULT_CONFIG:
                raise ValueError(f"Configuração desconhecida: {k}")
            conn.execute("INSERT INTO config(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                         (k, json.dumps(v)))


# ---------------------------------------------------------------- tokens assinados
def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_token(purpose, entity_id, expires_at=None):
    exp = str(int(expires_at.timestamp())) if expires_at else "0"
    msg = f"{purpose}.{entity_id}.{exp}"
    sig = hmac.new(TOKEN_SIGNING_SECRET, msg.encode(), hashlib.sha256).digest()[:18]
    return f"{_b64(msg.encode())}.{_b64(sig)}"


def verify_token(token, purpose):
    """Retorna o id da entidade ou None. Tokens sem expiração própria (exp=0) têm a validade checada pelo chamador."""
    try:
        msg_b64, sig_b64 = token.split(".")
        msg = _unb64(msg_b64).decode()
        expected = hmac.new(TOKEN_SIGNING_SECRET, msg.encode(), hashlib.sha256).digest()[:18]
        if not hmac.compare_digest(expected, _unb64(sig_b64)):
            return None
        p, entity_id, exp = msg.split(".")
        if p != purpose:
            return None
        if exp != "0" and int(exp) < now_utc().timestamp():
            return None
        return int(entity_id)
    except Exception:
        return None


def _wall_clock():
    """Sessões usam o relógio real, não o simulado: adiantar o tempo na simulação não pode derrubar o login."""
    return datetime.now(timezone.utc)


def sign_session(user_id, role):
    exp = int((_wall_clock() + timedelta(hours=12)).timestamp())
    payload = _b64(json.dumps({"u": user_id, "r": role, "e": exp}).encode())
    sig = _b64(hmac.new(AUTH_SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_session(cookie_value):
    try:
        payload, sig = cookie_value.split(".")
        expected = _b64(hmac.new(AUTH_SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, sig):
            return None
        data = json.loads(_unb64(payload))
        if data["e"] < _wall_clock().timestamp():
            return None
        return data
    except Exception:
        return None


# ---------------------------------------------------------------- CPF
def cpf_digits(value):
    return "".join(ch for ch in (value or "") if ch.isdigit())


def cpf_valid(value):
    d = cpf_digits(value)
    if len(d) != 11 or d == d[0] * 11:
        return False
    for n in (9, 10):
        s = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        dv = (s * 10) % 11 % 10
        if dv != int(d[n]):
            return False
    return True


def cpf_hash(value):
    return hmac.new(CPF_ENCRYPTION_KEY, b"cpf-hash:" + cpf_digits(value).encode(), hashlib.sha256).hexdigest()


def _keystream(key, nonce, length):
    out = b""
    counter = 0
    while len(out) < length:
        out += hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        counter += 1
    return out[:length]


def encrypt_cpf(value):
    """Criptografia autenticada (HMAC-SHA256 em modo contador + tag). Sem dependências externas.
    Em produção, a TI pode trocar por AES-GCM / KMS mantendo esta mesma interface."""
    data = cpf_digits(value).encode()
    enc_key = hmac.new(CPF_ENCRYPTION_KEY, b"enc", hashlib.sha256).digest()
    mac_key = hmac.new(CPF_ENCRYPTION_KEY, b"mac", hashlib.sha256).digest()
    nonce = secrets.token_bytes(12)
    ct = bytes(a ^ b for a, b in zip(data, _keystream(enc_key, nonce, len(data))))
    tag = hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()[:16]
    return _b64(nonce + ct + tag)


def decrypt_cpf(token):
    raw = _unb64(token)
    nonce, ct, tag = raw[:12], raw[12:-16], raw[-16:]
    enc_key = hmac.new(CPF_ENCRYPTION_KEY, b"enc", hashlib.sha256).digest()
    mac_key = hmac.new(CPF_ENCRYPTION_KEY, b"mac", hashlib.sha256).digest()
    if not hmac.compare_digest(tag, hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()[:16]):
        raise ValueError("CPF corrompido")
    return bytes(a ^ b for a, b in zip(ct, _keystream(enc_key, nonce, len(ct)))).decode()


def format_cpf(d):
    d = cpf_digits(d)
    return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}" if len(d) == 11 else d


# ---------------------------------------------------------------- eventos (auditoria e base dos indicadores)
def log_event(conn, entity_type, entity_id, type_, actor="system", actor_id=None, payload=None, is_manual=None):
    if is_manual is None:
        is_manual = actor == "admissions"
    conn.execute(
        "INSERT INTO events(entity_type, entity_id, type, actor, actor_id, is_manual, payload, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (entity_type, entity_id, type_, actor, actor_id, 1 if is_manual else 0, json.dumps(payload or {}, ensure_ascii=False), iso(now_utc())))


def first_name(full_name):
    return (full_name or "").strip().split(" ")[0]


def short_name(full_name):
    """Primeiro nome + inicial do sobrenome (para o embaixador diferenciar homônimos sem ver o sobrenome)."""
    parts = (full_name or "").strip().split()
    if len(parts) <= 1:
        return parts[0] if parts else ""
    return f"{parts[0]} {parts[-1][0]}."

"""Serviço de notificações: modelos editáveis (M1..M12), fila com deduplicação e adaptadores de e-mail e WhatsApp."""
import base64
import html
import json
import re
import smtplib
import urllib.error
import urllib.request
from datetime import timedelta
from email.message import EmailMessage
from email.utils import parseaddr

from . import core
from .core import iso, now_utc, parse_iso

DEFAULT_TEMPLATES = [
    ("M1", "Agendamento criado", "candidato", "Sua visita ao Insper está agendada — {data} às {hora}",
     "Olá, {nome}! Recebemos seu agendamento.\n\n"
     "Local: {ponto_de_encontro}\nData: {data}, às {hora}\nGrupo: {pessoas} pessoa(s)\nProtocolo: {protocolo}\n\n"
     "Assim que o embaixador que vai receber você confirmar, mandamos o nome dele por aqui.\n\n"
     "Precisa mudar algo? Reagende ou cancele em {link_minha_visita}\n\n{o_que_levar}"),
    ("M2", "Embaixador aceitou", "candidato", "Tour confirmado: {embaixador} vai receber você no Insper",
     "Olá, {nome}! Seu tour está confirmado.\n\n{embaixador} vai conduzir sua visita em {data}, às {hora}.\n"
     "Local: {ponto_de_encontro}\nProtocolo: {protocolo}\n\nGerencie sua visita em {link_minha_visita}"),
    ("M3", "Lembrete D-1", "candidato", "Amanhã é dia de conhecer o Insper — {hora}",
     "Olá, {nome}! Lembrete da sua visita amanhã, {data}, às {hora}.\n\nLocal: {ponto_de_encontro}\n{o_que_levar}\n\n"
     "Confirme sua presença, reagende ou cancele em {link_minha_visita}"),
    ("M4", "Reagendado", "candidato", "Visita reagendada — {data} às {hora}",
     "Olá, {nome}! Sua visita foi reagendada para {data}, às {hora}.\nO protocolo continua o mesmo: {protocolo}.\n\n"
     "Local: {ponto_de_encontro}\nGerencie sua visita em {link_minha_visita}"),
    ("M5", "Cancelado", "candidato", "Visita cancelada — protocolo {protocolo}",
     "Olá, {nome}. Sua visita de {data}, às {hora}, foi cancelada.\n\nQuando quiser, agende de novo em {link_agendar}"),
    ("M6", "NPS", "candidato", "Como foi sua visita ao Insper?",
     "Olá, {nome}! Obrigado por visitar o Insper.\n\nConte para a gente como foi, leva menos de 1 minuto: {link_nps}"),
    ("M7", "Convite ao embaixador", "embaixador", "Convite de tour: {data} às {hora} ({pessoas} pessoas)",
     "Olá, {embaixador}! Temos um tour para você.\n\nData: {data}, às {hora}\nGrupo:\n{perfil_grupo}\n\n"
     "Responda até {prazo}: {link_portal}"),
    ("M8", "Lembrete de convite", "embaixador", "Lembrete: convite de tour aguardando resposta ({data} às {hora})",
     "Olá, {embaixador}! O convite para o tour de {data}, às {hora}, ainda aguarda sua resposta.\n\nGrupo:\n{perfil_grupo}\n\n"
     "Responda até {prazo}: {link_portal}"),
    ("M9", "Tour do dia seguinte", "embaixador", "Seu tour de amanhã — {hora}",
     "Olá, {embaixador}! Amanhã, {data}, às {hora}, você conduz o tour.\n\nGrupo:\n{perfil_grupo}\n\n"
     "Não esqueça de retirar o brinde e o voucher de almoço. Lista de presença em {link_portal}"),
    ("M10", "Mudança no grupo", "embaixador", "Mudança no seu tour de {data} às {hora}",
     "Olá, {embaixador}! Houve uma mudança no tour de {data}, às {hora}: {mudanca}\n\nVeja o grupo atualizado em {link_portal}"),
    ("M11", "Exceção aberta", "admissoes", "[Exceção] Grupo sem embaixador — {data} às {hora}",
     "O grupo de {data}, às {hora} ({pessoas} pessoas), está sem embaixador.\nMotivo: {motivo}\n\nResolva em {link_admin}"),
    ("M11D", "Resumo diário de exceções", "admissoes", "Resumo de exceções — {qtd} grupo(s) aguardando",
     "Grupos na fila de exceções:\n\n{lista}\n\nResolva em {link_admin}"),
    ("M12", "Presença pendente", "embaixador", "Presença pendente — tour de {data} às {hora}",
     "Olá, {embaixador}! A presença do tour de {data}, às {hora}, ainda não foi registrada.\nMarque em {link_portal}"),
    ("MX1", "Proposta de nova data", "candidato", "Precisamos ajustar sua visita ao Insper",
     "Olá, {nome}. Não conseguimos garantir um embaixador para {data}, às {hora}.\n\n"
     "Por favor, escolha outro horário em {link_minha_visita}. Seu protocolo continua o mesmo: {protocolo}."),
    ("MX2", "Agendamento já existente", "candidato", "Você já tem uma visita agendada ao Insper",
     "Olá, {nome}! Recebemos um novo pedido com o seu CPF, mas você já tem uma visita agendada para {data}, às {hora}.\n\n"
     "Para ver, reagendar ou cancelar, use {link_minha_visita}"),
    ("LOGIN", "Link de acesso", "interno", "Seu link de acesso à plataforma de tours",
     "Olá, {nome}! Use o link abaixo para entrar. Ele vale por 15 minutos.\n\n{link_login}"),
]


def ensure_templates(conn):
    for code, name, audience, subject, body in DEFAULT_TEMPLATES:
        conn.execute("INSERT OR IGNORE INTO message_templates(code, name, audience, subject, body) VALUES (?,?,?,?,?)",
                     (code, name, audience, subject, body))


def render(text, variables):
    return re.sub(r"\{(\w+)\}", lambda m: str(variables.get(m.group(1), m.group(0))), text)


def _linkify(escaped):
    return re.sub(r"(https?://[^\s<]+)", r'<a href="\1" style="color:#E50505">\1</a>', escaped)


def html_email(subject, body_text):
    paragraphs = "".join(
        f'<p style="margin:0 0 14px;line-height:1.55">{_linkify(html.escape(p)).replace(chr(10), "<br>")}</p>'
        for p in body_text.split("\n\n"))
    return (
        '<div style="background:#F2F2F2;padding:24px;font-family:Inter,Arial,sans-serif;color:#0E171D">'
        '<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #E3E3E3">'
        '<div style="padding:18px 24px;border-bottom:3px solid #E50505;font-family:Georgia,serif;font-size:20px">Insper · Visite o campus</div>'
        f'<div style="padding:24px"><h1 style="font-family:Georgia,serif;font-weight:600;font-size:22px;margin:0 0 16px">{html.escape(subject)}</h1>'
        f'{paragraphs}</div>'
        '<div style="padding:14px 24px;color:#6C7880;font-size:12px;border-top:1px solid #E3E3E3">'
        'Mensagem automática da plataforma de agendamento de tours do Insper.</div></div></div>')


def make_ics(booking_id, protocol, slot_start, duration_min, location, summary="Visita ao campus do Insper"):
    start = parse_iso(slot_start)
    end = start + timedelta(minutes=duration_min)
    fmt = "%Y%m%dT%H%M%SZ"

    def esc(s):
        return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")

    return "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Insper//Agendamento de Tour//PT-BR", "METHOD:PUBLISH",
        "BEGIN:VEVENT", f"UID:{protocol}@tour.insper", f"SEQUENCE:{int(now_utc().timestamp())}",
        f"DTSTAMP:{now_utc().strftime(fmt)}", f"DTSTART:{start.strftime(fmt)}", f"DTEND:{end.strftime(fmt)}",
        f"SUMMARY:{esc(summary)}", f"LOCATION:{esc(location)}",
        f"DESCRIPTION:{esc('Protocolo ' + protocol + '. Leve um documento com foto.')}",
        "END:VEVENT", "END:VCALENDAR", ""])


# ---------------------------------------------------------------- adaptadores
# Cada adaptador devolve a situação da notificação: "enviado" (saiu de verdade, ou caixa local em desenvolvimento)
# ou "simulado" (ficou só na caixa local de propósito).
class LocalInboxEmailAdapter:
    """Desenvolvimento: as mensagens ficam na caixa de entrada local (/caixa-de-entrada), no lugar do Mailpit."""
    name = "local"

    def send(self, to, subject, text, html_body, attachments):
        return "enviado"


class SmtpEmailAdapter:
    name = "smtp"

    def __init__(self):
        self.host = core.env("SMTP_HOST")
        self.port = int(core.env("SMTP_PORT", "587"))
        self.user = core.env("SMTP_USER")
        self.password = core.env("SMTP_PASS")
        self.sender = core.env("EMAIL_FROM", "Insper Admissões <nao-responda@insper.edu.br>")

    def send(self, to, subject, text, html_body, attachments):
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = self.sender, to, subject
        msg.set_content(text)
        msg.add_alternative(html_body, subtype="html")
        for a in attachments:
            maintype, subtype = a["content_type"].split("/")
            msg.add_attachment(a["content"].encode(), maintype=maintype, subtype=subtype, filename=a["filename"])
        with smtplib.SMTP(self.host, self.port, timeout=20) as s:
            s.starttls()
            if self.user:
                s.login(self.user, self.password)
            s.send_message(msg)
        return "enviado"


class BrevoEmailAdapter:
    """Envio real pela API HTTP do Brevo (https://www.brevo.com). Útil onde as portas de SMTP são bloqueadas,
    como no plano gratuito do Render. O remetente (EMAIL_FROM) precisa estar verificado na conta do Brevo."""
    name = "brevo"

    def __init__(self):
        self.api_key = core.env("BREVO_API_KEY")
        self.url = core.env("BREVO_API_URL", "https://api.brevo.com/v3/smtp/email")
        sender_name, sender_email = parseaddr(core.env("EMAIL_FROM", ""))
        self.sender = {"name": sender_name or "Insper · Tours no campus", "email": sender_email}

    def send(self, to, subject, text, html_body, attachments):
        if not self.sender["email"]:
            raise RuntimeError("Defina EMAIL_FROM com um remetente verificado no Brevo.")
        payload = {"sender": self.sender, "to": [{"email": to}], "subject": subject, "textContent": text, "htmlContent": html_body}
        if attachments:
            payload["attachment"] = [{"name": a["filename"], "content": base64.b64encode(a["content"].encode()).decode()}
                                     for a in attachments]
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode(), method="POST", headers={
            "api-key": self.api_key, "Content-Type": "application/json", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                r.read()
        except urllib.error.HTTPError as e:  # a mensagem do Brevo explica o motivo (remetente, cota diária…)
            raise RuntimeError(f"Brevo {e.code}: {e.read().decode(errors='replace')[:300]}") from None
        return "enviado"


class DemoSafeEmailAdapter:
    """Envia de verdade só para endereços reais. Os e-mails fictícios dos dados de exemplo (ex.: @exemplo.com)
    ficam na caixa local como "simulado", para a demonstração não disparar mensagens para endereços inexistentes."""

    def __init__(self, real):
        self.real = real
        self.name = real.name
        domains = core.env("EMAIL_SIMULATED_DOMAINS", "exemplo.com,example.com")
        self.simulated = {d.strip().lower() for d in domains.split(",") if d.strip()}

    def send(self, to, subject, text, html_body, attachments):
        if to.rsplit("@", 1)[-1].lower() in self.simulated:
            return "simulado"
        return self.real.send(to, subject, text, html_body, attachments)


class MockWhatsAppAdapter:
    """v1: apenas registra o que seria enviado. Trocar pela WhatsApp Business Platform (Cloud API) quando aprovada."""
    name = "mock"

    def send(self, to, text):
        return True


def email_adapter():
    if core.env("BREVO_API_KEY"):
        return DemoSafeEmailAdapter(BrevoEmailAdapter())
    if core.env("SMTP_HOST"):
        return DemoSafeEmailAdapter(SmtpEmailAdapter())
    return LocalInboxEmailAdapter()


def whatsapp_adapter():
    return MockWhatsAppAdapter()


# ---------------------------------------------------------------- fila
def enqueue(conn, dedupe_key, template_code, recipient, variables, booking_id=None, ambassador_id=None,
            attachments=None, channel="email"):
    """Insere a notificação uma única vez (dedupe_key único torna os jobs idempotentes). Retorna True se inseriu."""
    tpl = core.one(conn.execute("SELECT * FROM message_templates WHERE code=?", (template_code,)))
    if not tpl or not tpl["active"]:
        return False
    subject = render(tpl["subject"], variables)
    body = render(tpl["body"], variables)
    cur = conn.execute(
        "INSERT OR IGNORE INTO notifications(dedupe_key, booking_id, ambassador_id, recipient, template_code, channel, status, "
        "subject, body_text, body_html, attachments, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (dedupe_key, booking_id, ambassador_id, recipient, template_code, channel, "pendente", subject, body,
         html_email(subject, body) if channel == "email" else None, json.dumps(attachments or []), iso(now_utc())))
    return cur.rowcount == 1


def enqueue_candidate(conn, booking, template_code, variables, dedupe_suffix="", attachments=None):
    key = f"{template_code}:b{booking['id']}:{dedupe_suffix}"
    inserted = enqueue(conn, key, template_code, booking["email"], variables, booking_id=booking["id"], attachments=attachments)
    if booking.get("whatsapp_opt_in"):
        enqueue(conn, key + ":wa", template_code, booking["phone"], variables, booking_id=booking["id"], channel="whatsapp")
    return inserted


def flush(conn, limit=200):
    """Envia notificações pendentes, com até 5 tentativas."""
    pending = core.rows(conn.execute(
        "SELECT * FROM notifications WHERE status IN ('pendente','falhou') AND attempts < 5 ORDER BY id LIMIT ?", (limit,)))
    email, wa = email_adapter(), whatsapp_adapter()
    for n in pending:
        try:
            if n["channel"] == "email":
                status = email.send(n["recipient"], n["subject"], n["body_text"], n["body_html"], json.loads(n["attachments"]))
            else:
                wa.send(n["recipient"], n["body_text"])
                status = "simulado"
            conn.execute("UPDATE notifications SET status=?, sent_at=?, attempts=attempts+1, error=NULL WHERE id=?",
                         (status, iso(now_utc()), n["id"]))
        except Exception as e:  # falha de envio nunca derruba o fluxo do candidato
            conn.execute("UPDATE notifications SET status='falhou', attempts=attempts+1, error=? WHERE id=?", (str(e)[:500], n["id"]))
    return len(pending)

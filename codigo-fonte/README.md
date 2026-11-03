# Plataforma de Agendamento de Tour no Campus — Insper (v1)

Implementação da especificação `plataforma-agendamento-tour-v1.md`: agendamento público com vagas reais,
confirmação imediata, alocação automática de embaixadores com reserva e fila de exceções, lembretes, reagendamento
e cancelamento por link, presença, NPS com QR code, encerramento no CRM e painel de Admissões com os indicadores.

## Como rodar

Só precisa do Python 3.9+ que já vem no macOS. Não há dependências para instalar.

```bash
python3 run.py            # http://localhost:8000 (na 1ª vez cria o banco com dados fictícios)
python3 run.py --reset    # apaga o banco e recria com os dados de exemplo
python3 -m unittest discover -s tests -t . -v   # testes dos critérios de aceite
```

| Endereço | O que é |
|---|---|
| `/agendar` | Agendamento do candidato (3 passos, sem login) |
| `/minha-visita/{token}` | Ver, confirmar presença, reagendar ou cancelar |
| `/nps/{token}` e `/nps/grupo/{token}` | Avaliação (o QR do embaixador abre a versão de grupo) |
| `/embaixador` | Convites, meus tours, presença, QR do NPS, brinde, disponibilidade |
| `/admin` | Painel de Admissões |
| `/caixa-de-entrada` | Todos os e-mails e WhatsApps simulados (substitui o Mailpit) |
| `/embed` | Botão pronto para o site institucional |

Em `/login` há um **acesso rápido de demonstração** com os usuários fictícios. Em **Admin › Saúde e simulação**
dá para adiantar o relógio (+1h, +1 dia…) e ver lembretes, expiração de convites, exceções, NPS D+1 e
encerramento no CRM acontecerem sozinhos.

## Decisões de implementação

- **Stack.** A seção 17 sugere Next.js + PostgreSQL, a validar com a TI. Esta máquina não tinha Node, Docker nem
  Postgres, então a v1 foi feita em **Python (só biblioteca padrão) + SQLite**, com a mesma arquitetura:
  regras em `app/domain.py` (alocação como função pura `allocate()`), adaptadores em `app/integrations.py` e
  `app/notify.py`, jobs idempotentes em `app/jobs.py`, indicadores em `app/metrics.py`, API REST da seção 14 em
  `app/server.py`. A reserva de vaga usa transação com bloqueio de escrita (`BEGIN IMMEDIATE`), e o teste de
  concorrência garante que não há overbooking. Para Postgres, troque `core.connect()`/`core.tx()` e use
  `SELECT … FOR UPDATE` no grupo.
- **Itens [A CONFIRMAR]** seguem os padrões da seção 19 e são configuráveis em Admin › Configurações (prazos,
  grade, capacidade, reserva obrigatória, cursos, campos ocultáveis, textos das mensagens, retenção LGPD).
- **Integrações.** E-mail real via SMTP quando `SMTP_HOST` estiver definido; sem ele, vai para a caixa local.
  CRM: `CRM_ADAPTER=mock` (padrão) ou `webhook` com `CRM_WEBHOOK_URL`/`CRM_WEBHOOK_SECRET` (HMAC-SHA256 no
  cabeçalho `X-Signature-SHA256`), além de exportação CSV. Webhooks de eventos: `WEBHOOK_URL`/`WEBHOOK_SECRET`.
  WhatsApp: simulado (só para quem deu opt-in).
- **Login.** Link mágico por e-mail. O SSO Microsoft (Entra ID) ainda não foi feito.
- **CPF.** Criptografado em repouso com HMAC-SHA256 em modo contador + tag de autenticação (sem bibliotecas
  externas). Em produção, a TI pode trocar por AES-GCM/KMS na mesma interface (`encrypt_cpf`/`decrypt_cpf`).
- **Prazo de convite para pedidos de última hora.** Pela RN-24 o limite é 24h antes do tour. Quando o pedido chega
  depois disso (por exemplo, criado por Admissões), o limite passa a ser 2h após a criação, sem ultrapassar 1h
  antes do tour. Assim o grupo não cai direto em exceção.
- **NPS pelo QR.** Responder ao NPS depois do início do tour conta como presença confirmada.

## Variáveis de ambiente

`APP_ENV` (`dev` habilita acesso rápido, caixa local e simulação de tempo; use `prod` em produção),
`APP_BASE_URL`, `DATABASE_PATH`, `AUTH_SECRET`, `TOKEN_SIGNING_SECRET`, `CPF_ENCRYPTION_KEY`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `CRM_ADAPTER`, `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET`,
`WEBHOOK_URL`, `WEBHOOK_SECRET`, `PORT`, `HOST`.

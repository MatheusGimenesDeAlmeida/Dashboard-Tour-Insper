# Plataforma de Agendamento de Tour no Campus — Insper

Protótipo v1 com dados fictícios. Duas partes:

- **`codigo-fonte/`**: plataforma com servidor (Python só com biblioteca padrão + SQLite). Detalhes em
  [`codigo-fonte/README.md`](codigo-fonte/README.md).
- **`codigo-fonte/frontend/`**: interface em Angular + Angular Material com todas as telas (candidato, login,
  painel de Admissões, portal do embaixador, caixa de entrada e embed). Veja
  [`codigo-fonte/frontend/README.md`](codigo-fonte/frontend/README.md).
- **`simulador-tour-insper.html`**: versão autônoma que roda direto no navegador. Também é servida em `/simulador`.

## Deploy (Render)

O arquivo [`render.yaml`](render.yaml) descreve o serviço. Para publicar:

1. Em <https://dashboard.render.com/blueprints>, clique em **New Blueprint Instance** e escolha este repositório.
2. Confirme. O Render gera os segredos, instala o Python 3.12 e inicia `python run.py` na porta que ele define.

O serviço foi criado a partir da URL pública do repositório, então um `git push` **não** publica sozinho: depois do
push, abra o Blueprint `tour-insper` no Render e clique em **Manual sync** (ou **Manual Deploy** no serviço). Para
publicar automaticamente a cada push, conecte o GitHub ao Render (Account Settings › Git Providers).

### E-mail de verdade (Brevo)

Sem configuração, os e-mails são simulados e aparecem só em `/caixa-de-entrada`. O plano gratuito do Render
bloqueia as portas de SMTP, então o envio real usa a API do [Brevo](https://www.brevo.com) (grátis até 300 e-mails/dia):

1. Crie uma conta no Brevo e, em **Senders, Domains & Dedicated IPs › Senders**, adicione e confirme o e-mail
   remetente (pode ser um Gmail).
2. Em **SMTP & API › API Keys**, gere uma chave.
3. No Render, abra o serviço `tour-insper` › **Environment** e adicione:
   - `BREVO_API_KEY` = a chave do passo 2
   - `EMAIL_FROM` = `Tours Insper <o-email-confirmado@gmail.com>`
4. Salve. O Render reinicia o serviço sozinho.

Os endereços fictícios dos dados de exemplo (`@exemplo.com`) continuam só na caixa local, marcados como
"simulado". Para mudar a lista, use `EMAIL_SIMULATED_DOMAINS` (domínios separados por vírgula). WhatsApp segue simulado.

**Limitações do plano gratuito**

- O serviço hiberna após ~15 min sem acesso; a primeira visita depois disso leva uns 50 s para acordar.
- O disco é efêmero: a cada reinício ou deploy o banco volta aos dados de exemplo.
- `APP_ENV=dev` mantém o acesso rápido de demonstração em `/login`, a caixa de entrada simulada e a simulação de
  tempo. Qualquer pessoa com o link entra como Admissões ou embaixador, então não use dados reais.

## Rodar localmente

```bash
cd codigo-fonte
python3 run.py            # http://localhost:8000
```

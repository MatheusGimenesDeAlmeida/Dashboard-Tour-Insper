# Plataforma de Agendamento de Tour no Campus — Insper

Protótipo v1 com dados fictícios. Duas partes:

- **`codigo-fonte/`**: plataforma com servidor (Python só com biblioteca padrão + SQLite). Detalhes em
  [`codigo-fonte/README.md`](codigo-fonte/README.md).
- **`codigo-fonte/frontend/`**: interface nova em Angular + Angular Material (início, agendamento, minha visita e
  avaliação). As outras telas ainda usam as páginas de `codigo-fonte/static/`. Veja
  [`codigo-fonte/frontend/README.md`](codigo-fonte/frontend/README.md).
- **`simulador-tour-insper.html`**: versão autônoma que roda direto no navegador. Também é servida em `/simulador`.

## Deploy (Render)

O arquivo [`render.yaml`](render.yaml) descreve o serviço. Para publicar:

1. Em <https://dashboard.render.com/blueprints>, clique em **New Blueprint Instance** e escolha este repositório.
2. Confirme. O Render gera os segredos, instala o Python 3.12 e inicia `python run.py` na porta que ele define.

O serviço foi criado a partir da URL pública do repositório, então um `git push` **não** publica sozinho: depois do
push, abra o Blueprint `tour-insper` no Render e clique em **Manual sync** (ou **Manual Deploy** no serviço). Para
publicar automaticamente a cada push, conecte o GitHub ao Render (Account Settings › Git Providers).

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

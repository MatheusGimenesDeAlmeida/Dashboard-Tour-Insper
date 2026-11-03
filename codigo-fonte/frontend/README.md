# Telas em Angular

Interface nova da plataforma, em Angular 21 + Angular Material. Ela conversa com a mesma API do servidor
Python (`../app/server.py`), sem mudar nenhuma regra de negócio.

## Telas migradas

| Rota | Arquivo |
|---|---|
| `/` | `src/app/pages/home/` |
| `/agendar` (e `/agendar?reagendar=<token>`) | `src/app/pages/booking/` |
| `/minha-visita/<token>` | `src/app/pages/my-visit/` |
| `/nps/<token>` e `/nps/grupo/<token>` | `src/app/pages/nps/` |

Login, portal do embaixador, painel de Admissões, caixa de entrada e embed continuam nas páginas antigas
(`../static/`) até serem migrados. Ao migrar uma tela, inclua a rota em `src/app/app.routes.ts` **e** em
`SPA_PAGES` no `app/server.py`.

## Onde mexer

- **Cores, fontes e espaçamentos:** `src/styles.scss` (tokens no topo do arquivo).
- **Chamadas à API:** `src/app/core/api.ts`. Formatos das respostas em `src/app/core/models.ts`.
- **Cabeçalho e rodapé:** `src/app/app.html`.

## Rodar no computador

Precisa do Node 22.12 ou mais novo.

```bash
npm install          # só na primeira vez
npm run build        # gera ../web/, que o servidor Python passa a entregar
cd .. && python run.py
```

Abra http://localhost:8000.

Para editar com recarga automática, deixe o `python run.py` rodando e, em outro terminal, use `npm start`.
Abra http://localhost:4200: o Angular encaminha as chamadas `/api` para o servidor na porta 8000.

## Deploy

O Render roda `npm ci && npm run build` a cada push na `main` (veja `render.yaml` na raiz do repositório).

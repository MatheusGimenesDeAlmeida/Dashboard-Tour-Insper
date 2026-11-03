# Telas em Angular

Interface nova da plataforma, em Angular 21 + Angular Material. Ela conversa com a mesma API do servidor
Python (`../app/server.py`), sem mudar nenhuma regra de negócio.

## Telas

| Rota | Arquivo |
|---|---|
| `/` | `src/app/pages/home/` |
| `/agendar` (e `/agendar?reagendar=<token>`) | `src/app/pages/booking/` |
| `/minha-visita/<token>` | `src/app/pages/my-visit/` |
| `/nps/<token>` e `/nps/grupo/<token>` | `src/app/pages/nps/` |
| `/login` | `src/app/pages/login/` |
| `/admin/...` (painel de Admissões, só com login de Admissões) | `src/app/pages/admin/` |
| `/embaixador/...` (portal do embaixador, só com login de embaixador) | `src/app/pages/ambassador/` |
| `/caixa-de-entrada` | `src/app/pages/inbox/` |
| `/embed` | `src/app/pages/embed/` |

No painel, cada seção do menu é um arquivo em `pages/admin/` (`overview`, `agenda`, `bookings`, `exceptions`,
`ambassadors`, `settings`, `templates`, `health`), e os diálogos ficam em `dialogs.ts`. No portal do embaixador,
o Início fica em `amb-home`, as outras abas em `amb-pages.ts` e os cartões de convite e de tour em `amb-cards.ts`.

Toda tela nova precisa da rota em `src/app/app.routes.ts` **e** em `SPA_PAGES` no `app/server.py`.

As páginas antigas em `../static/` só aparecem se o Angular não tiver sido compilado (sem a pasta `../web/`).

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

No deploy, o Render roda `npm ci && npm run build` antes de iniciar o servidor (veja `render.yaml` e o README na
raiz do repositório).

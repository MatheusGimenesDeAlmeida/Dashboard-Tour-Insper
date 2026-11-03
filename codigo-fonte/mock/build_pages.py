"""Gera mock/pages.js a partir das telas de static/*.js, adaptando-as para rodar dentro do artifact (sem servidor)."""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda f: open(os.path.join(ROOT, "static", f), encoding="utf-8").read()

def patch(src, pairs, name):
    for old, new in pairs:
        n = src.count(old)
        assert n >= 1, f"{name}: não encontrei {old!r}"
        src = src.replace(old, new)
    return src

def as_page(src, key, name):
    src = src.strip()
    head = src.index("(function () {")
    assert src.endswith("})();"), name
    return src[:head] + f'Pages["{key}"] = function (ROUTE) {{' + src[head + len("(function () {"):-len("})();")] + "};\n"

out = ["/* Gerado por build_pages.py a partir de static/*.js. Não edite à mão. */", "window.Pages = window.Pages || {};"]

app = S("app.js")
app = patch(app, [
    ("    const res = await fetch(url, opts);\n    let data = null;\n    try { data = await res.json(); } catch (e) { data = {}; }\n    if (!res.ok) {\n      const err = new Error((data && data.error) || \"Algo deu errado. Tente novamente.\");\n      err.status = res.status; err.code = data && data.code; err.fields = (data && data.fields) || {};\n      if (res.status === 401 && !url.startsWith(\"/api/public\")) location.href = \"/login?next=\" + encodeURIComponent(location.pathname);\n      throw err;\n    }\n    return data;",
     "    return window.MockAPI.api(method, url, body);"),
    ("    await api(\"POST\", \"/api/auth/logout\");\n    location.href = \"/login\";", "    window.nav(\"/\");"),
], "app.js")
out.append(app)

ag = patch(S("agendar.js"), [
    ("new URLSearchParams(location.search)", "new URLSearchParams(ROUTE.search)"),
    ("h(\"a\", { class: \"btn dark\", href: r.ics_url || `/api/public/bookings/${rescheduleToken}/ics` }, \"Adicionar ao calendário\"),",
     "h(\"button\", { class: \"btn dark\", onclick: () => window.showIcs(r) }, \"Adicionar ao calendário\"),"),
    ("href: r.manage_url || `/minha-visita/${rescheduleToken}`", "href: `/minha-visita/${r.token || rescheduleToken}`"),
], "agendar")
out.append(as_page(ag, "agendar", "agendar"))

mv = patch(S("minha-visita.js"), [
    ("location.pathname.split(\"/\").filter(Boolean)[1]", "ROUTE.path.split(\"/\").filter(Boolean)[1]"),
    ("h(\"a\", { class: \"btn ghost\", href: v.ics_url }, \"Adicionar ao calendário\")", "h(\"button\", { class: \"btn ghost\", onclick: () => window.showIcs(v) }, \"Adicionar ao calendário\")"),
    ("v.nps_link ?", "v.nps_open && !v.nps_answered ?"),
    ("h(\"a\", { href: v.nps_link }, \"Responda em menos de 1 minuto\")", "h(\"a\", { href: `/nps/${token}` }, \"Responda em menos de 1 minuto\")"),
], "minha-visita")
out.append(as_page(mv, "minha-visita", "minha-visita"))

nps = patch(S("nps.js"), [
    ("location.pathname.split(\"/\")", "ROUTE.path.split(\"/\")"),
    ("`/api/public/nps-group/${token}`", "`/api/ambassador/tours/${token}/nps-group`"),
], "nps")
out.append(as_page(nps, "nps", "nps"))

em = patch(S("embaixador.js"), [
    ("location.hash.slice(1) || \"inicio\"", "ROUTE.tab || \"inicio\""),
    ("h(\"button\", { class: \"btn small\", onclick: T.logout }, \"Sair\")", "null"),
    ("location.hash = id; render();", "ROUTE.setTab(id); render();"),
    ("    window.addEventListener(\"hashchange\", () => { const id = location.hash.slice(1); if (id && id !== S.tab) { S.tab = id; render(); } });\n", ""),
    ("api(\"GET\", `/api/ambassador/tours/${tour.group_id}/nps-qr`).then((r) => {", "Promise.resolve({ url: `/nps/grupo/${tour.group_id}` }).then((r) => {"),
    ("h(\"a\", { href: r.url, target: \"_blank\" }, r.url)", "\"O celular abre a avaliação na hora.\""),
    ("new QRCode(box, { text: r.url,", "new QRCode(box, { text: \"INSPER-TOUR-NPS-GRUPO-\" + tour.group_id,"),
], "embaixador")
out.append(as_page(em, "embaixador", "embaixador"))

ad = S("admin.js")
ad = patch(ad, [
    ("location.hash.slice(1) || \"visao\"", "ROUTE.tab || \"visao\""),
    ("    h(\"a\", { href: \"/caixa-de-entrada\", target: \"_blank\" }, \"Caixa de entrada\"), h(\"span\", { id: \"who\", class: \"muted\" }),\n    h(\"button\", { class: \"btn small\", onclick: T.logout }, \"Sair\")]));",
     "    h(\"span\", { id: \"who\", class: \"muted\" })]));"),
    ("[\"bookings\", \"attendance\", \"nps\", \"crm\"].map((k) => h(\"a\", { class: \"btn small\", href: `/api/admin/export/${k}.csv?` + params },\n        { bookings: \"CSV agendamentos\", attendance: \"CSV presença\", nps: \"CSV NPS\", crm: \"CSV para o CRM\" }[k]))",
     "[\"bookings\", \"nps\"].map((k) => h(\"button\", { class: \"btn small\", onclick: () => window.showCsv(k, params) },\n        { bookings: \"CSV agendamentos\", nps: \"CSV NPS\" }[k]))"),
    ("h(\"a\", { href: b.manage_url, target: \"_blank\" }, \"Abrir “Minha visita” do candidato\")", "h(\"a\", { href: `/minha-visita/${b.token}` }, \"Abrir “Minha visita” do candidato\")"),
    ("    actions.push(h(\"a\", { class: \"btn ghost\", href: `/api/admin/lgpd/${id}/export` }, \"Exportar dados (LGPD)\"));\n", ""),
    ("&token=${b.manage_url.split(\"/\").pop()}", "&token=${b.token}"),
    ("function go(id) { S.section = id; location.hash = id; render(); }", "function go(id) { S.section = id; ROUTE.setTab(id); render(); }"),
    ("    window.addEventListener(\"hashchange\", () => { const id = location.hash.slice(1); if (id && id !== S.section) { S.section = id; render(); } });\n", ""),
    ("const [me, cfg, jobs] = await Promise.all([api(\"GET\", \"/api/auth/me\"), api(\"GET\", \"/api/public/config\"), api(\"GET\", \"/api/admin/jobs\")]);\n    document.getElementById(\"who\").textContent = me.user.name;",
     "const [cfg, jobs] = await Promise.all([api(\"GET\", \"/api/public/config\"), api(\"GET\", \"/api/sim/state\")]);\n    document.getElementById(\"who\").textContent = window.MockAPI.me().name;"),
    (", [\"saude\", \"Saúde e simulação\", secSaude]", ""),
], "admin")
# a seção antiga de saúde dependia do servidor; a de simulação está em shell.js
start = ad.index("  // ------------------------------------------------------------ saúde e simulação")
end = ad.index("  const SECTIONS = [")
ad = ad[:start] + ad[end:]
out.append(as_page(ad, "admin", "admin"))

open(os.path.join(ROOT, "mock", "pages.js"), "w", encoding="utf-8").write("\n".join(out))
print("ok", sum(len(x) for x in out), "bytes")

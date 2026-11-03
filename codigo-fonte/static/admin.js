/* /admin — painel de Admissões (seção 8.5). */
(function () {
  const { api, h, clear, fmt, toast, dialog, confirmDialog, tag, addDays } = T;
  const main = document.getElementById("conteudo");
  const side = document.getElementById("side");
  const S = { section: location.hash.slice(1) || "visao", period: null, agendaFrom: null, filters: {} };
  const WD = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

  document.getElementById("top").appendChild(T.topbar("Painel de Admissões", [
    h("a", { href: "/caixa-de-entrada", target: "_blank" }, "Caixa de entrada"), h("span", { id: "who", class: "muted" }),
    h("button", { class: "btn small", onclick: T.logout }, "Sair")]));

  const today = () => S.today;
  function periodBar(onChange) {
    const from = h("input", { type: "date", id: "p-from", value: S.period.from });
    const to = h("input", { type: "date", id: "p-to", value: S.period.to });
    const apply = () => { S.period = { from: from.value, to: to.value }; onChange(); };
    const preset = (label, back, fwd) => h("button", { class: "btn small", onclick: () => { S.period = { from: addDays(today(), -back), to: addDays(today(), fwd) }; onChange(); } }, label);
    return h("div", { class: "toolbar" },
      h("div", { class: "field" }, h("label", { for: "p-from" }, "De"), from),
      h("div", { class: "field" }, h("label", { for: "p-to" }, "Até"), to),
      h("button", { class: "btn small dark", onclick: apply }, "Aplicar"),
      preset("Últimos 7 dias", 7, 0), preset("Últimos 30 dias", 30, 0), preset("Últimos 90 dias", 90, 0), preset("Próximos 14 dias", 0, 14));
  }

  function kpi(label, value, meta, pct) {
    return h("div", { class: "kpi" }, h("div", { class: "label" }, label), h("div", { class: "value" }, value), h("div", { class: "meta" }, meta || ""),
      pct !== undefined && pct !== null ? h("div", { class: "bar", "aria-hidden": "true" }, h("span", { style: `width:${Math.max(0, Math.min(100, pct))}%` })) : null);
  }

  // ------------------------------------------------------------ visão geral
  const I = T.icon;
  function goal(label, value, status, opts = {}) {
    const pillTxt = { ok: "Na meta", warn: "Perto da meta", crit: "Fora da meta", none: "Sem meta" }[status];
    const pos = (v) => `${Math.max(0, Math.min(100, ((v - (opts.min || 0)) / ((opts.max || 100) - (opts.min || 0))) * 100))}%`;
    return h("div", { class: "goal s-" + status },
      h("div", { class: "goal-head" }, h("span", { class: "lbl" }, label), h("span", { class: "pill " + status }, status === "ok" ? I("check", 12) : status === "crit" ? I("alert", 12) : null, pillTxt)),
      h("div", { class: "big" }, value),
      opts.gap ? h("div", { class: "gap" }, opts.gap) : null,
      opts.fill !== undefined && opts.fill !== null ? h("div", { class: "scale", "aria-hidden": "true" },
        h("span", { class: "fill", style: `width:${pos(opts.fill)}` }),
        opts.baseline !== undefined ? h("span", { class: "mark", style: `left:${pos(opts.baseline)}`, title: "antes" }) : null,
        opts.target !== undefined ? h("span", { class: "mark target", style: `left:${pos(opts.target)}`, title: "meta" }) : null) : null,
      h("div", { class: "legend" }, h("span", {}, opts.before || ""), h("span", {}, opts.goal || "")));
  }

  function weeklyChart(weeks) {
    if (!weeks.length) return h("div", { class: "empty" }, "Sem dados no período.");
    const max = Math.max(1, ...weeks.map((w) => w.bookings));
    const lab = (w) => w.week_start.slice(8, 10) + "/" + w.week_start.slice(5, 7);
    return h("div", {},
      h("div", { class: "wchart", role: "img", "aria-label": "Agendados e realizados por semana" },
        h("div", { class: "wy" }, h("span", {}, max), h("span", {}, Math.round(max / 2)), h("span", {}, 0)),
        h("div", { class: "wcols" }, weeks.map((w) => h("div", { class: "wcol", title: `Semana de ${lab(w)}: ${w.bookings} agendados, ${w.realized} realizados` },
          h("div", { class: "wbars" }, h("span", { class: "wb light", style: `height:${(100 * w.bookings) / max}%` }), h("span", { class: "wb", style: `height:${(100 * w.realized) / max}%` })),
          h("span", { class: "wl" }, lab(w)))))),
      h("div", { class: "legend-row" }, h("span", {}, h("i", { class: "light" }), "Agendados"), h("span", {}, h("i"), "Realizados")));
  }

  // Anel de progresso até a meta (estilo dos anéis de atividade), na cor da situação.
  function ringSvg(progress, status, size = 64) {
    const r = size / 2 - 6, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, progress || 0));
    const color = { ok: "var(--ok)", warn: "var(--yellow)", crit: "var(--red)", none: "var(--ink-3)" }[status];
    return h("span", { class: "kring", "aria-hidden": "true", html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="color-mix(in srgb, ${color} 18%, transparent)" stroke-width="8"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>` });
  }

  function kpiCard(icon, label, value, unit, status, progress, foot) {
    const stTxt = { ok: "Na meta", warn: "Perto da meta", crit: "Fora da meta", none: "" }[status];
    return h("div", { class: "kcard s-" + status },
      h("div", { class: "khead" }, h("span", { class: "klabel" }, I(icon, 16), label), stTxt ? h("span", { class: "kstatus" }, stTxt) : null),
      h("div", { class: "kbody" }, h("div", {}, h("span", { class: "kval" }, value), unit ? h("span", { class: "kunit" }, unit) : null), ringSvg(progress, status)),
      h("div", { class: "kfoot" }, foot));
  }

  function sectionHead(title, aside) {
    return h("div", { class: "sh" }, h("h2", {}, title), aside || null);
  }

  async function secVisao(el) {
    const q = new URLSearchParams(S.period);
    const d = await api("GET", "/api/admin/dashboard?" + q);
    S.counts.exceptions = d.alerts.open_exceptions;
    drawSide();
    const a = d.alerts, rr = d.realized_rate, fc = d.first_confirmation_seconds, mt = d.manual_tasks_per_tour, nps = d.nps;
    const presets = [["7 dias", 7, 0], ["30 dias", 30, 0], ["90 dias", 90, 0], ["Próximos 14 dias", 0, 14]];
    const curPreset = presets.find(([, b, f]) => S.period.from === addDays(today(), -b) && S.period.to === addDays(today(), f));

    // cabeçalho
    el.append(h("header", { class: "ov-head" },
      h("div", {}, h("p", { class: "ov-date" }, fmt.dateLong(S.now || new Date().toISOString())), h("h1", {}, "Visão geral")),
      h("div", { class: "btns" },
        h("div", { class: "seg2", role: "group", "aria-label": "Período dos indicadores" }, presets.map(([l, b, f]) => h("button", { type: "button", "aria-pressed": curPreset && curPreset[0] === l ? "true" : "false",
          onclick: () => { S.period = { from: addDays(today(), -b), to: addDays(today(), f) }; render(); } }, l))),
        h("button", { class: "btn small", "aria-label": "Exportar indicadores em CSV", onclick: () => (window.showCsv ? window.showCsv("dashboard", q) : (location.href = "/api/admin/export/dashboard.csv?" + q)) }, I("download", 16)))));

    // 0. jornada do período + panorama de mensagens
    const J = d.journey || [], first = Math.max(1, (J[0] || {}).count || 0);
    const pctOf = (n, base) => (base ? Math.round((100 * n) / base) : 0);
    el.append(h("section", { class: "ov-sec", style: "margin-top:0" },
      sectionHead("Jornada do período", h("span", { class: "muted" }, `${fmt.date(S.period.from + "T12:00:00-03:00")} a ${fmt.date(S.period.to + "T12:00:00-03:00")}`)),
      h("div", { class: "journey" }, J.map((st2, i) => {
        const prev = i ? J[i - 1].count : null;
        return h("div", { class: "jstep" + (i === J.length - 1 ? " last" : "") },
          h("div", { class: "jtop" }, h("span", { class: "jdot" }, I(st2.icon, 18)), i < J.length - 1 ? h("span", { class: "jline" }, i < J.length - 2 ? h("span", { class: "jconv", title: "passaram para a próxima etapa" }, `${pctOf(J[i + 1].count, st2.count)}%`) : null) : null),
          h("div", { class: "jlabel" }, st2.label),
          h("div", { class: "jcount" }, st2.count),
          h("div", { class: "jbar" }, h("span", { style: `width:${pctOf(st2.count, first)}%` })),
          st2.msg ? h("div", { class: "jmsg" }, I("mail", 13), `${st2.msg.email}`, st2.msg.whatsapp ? [h("span", { class: "sep" }, "·"), I("message", 13), `${st2.msg.whatsapp}`] : null)
            : h("div", { class: "jmsg muted-note" }, st2.note),
          st2.msg ? h("div", { class: "jnote" }, st2.note) : null);
      }))));

    const M = d.messages || { total: 0, email: 0, whatsapp: 0, failed: 0, by_audience: [], by_template: [] };
    const audName = { candidato: "Candidatos", embaixador: "Embaixadores", admissoes: "Admissões" };
    const audTotal = Math.max(1, M.by_audience.reduce((x, y) => x + y.count, 0));
    const topT = M.by_template.slice(0, 6), maxT = Math.max(1, ...topT.map((t) => t.count));
    el.append(h("section", { class: "ov-sec" }, sectionHead("Mensagens enviadas", window.nav ? h("a", { class: "muted", href: "/mensagens", style: "font-size:13px" }, "Ver todas") : null),
      h("div", { class: "msgs" },
        h("div", { class: "msgs-total" },
          h("span", { class: "kval" }, M.total), h("span", { class: "klabel2" }, M.total === 1 ? "mensagem no período" : "mensagens no período"),
          h("div", { class: "chips", style: "margin-top:12px" },
            h("span", { class: "chip" }, I("mail", 14), `${M.email} e-mails`),
            h("span", { class: "chip" }, I("message", 14), `${M.whatsapp} WhatsApp`),
            h("span", { class: "chip" + (M.failed ? " warn" : "") }, I(M.failed ? "alert" : "check", 14), M.failed ? `${M.failed} com falha` : "nenhuma falha"))),
        h("div", { class: "msgs-aud" }, h("h3", {}, "Para quem"),
          h("div", { class: "stack", role: "img", "aria-label": M.by_audience.map((x) => `${audName[x.audience]}: ${x.count}`).join(", ") },
            M.by_audience.map((x) => h("span", { class: "seg-" + x.audience, style: `width:${(100 * x.count) / audTotal}%`, title: `${audName[x.audience]}: ${x.count}` }))),
          h("div", { class: "stack-legend" }, M.by_audience.map((x) => h("span", {}, h("i", { class: "seg-" + x.audience }), `${audName[x.audience]} `, h("b", {}, x.count))))),
        h("div", { class: "msgs-top" }, h("h3", {}, "Mais enviadas"),
          topT.length ? topT.map((t) => h("div", { class: "hbar" }, h("span", { class: "name", title: t.code }, t.name),
            h("span", { class: "track" }, h("span", { style: `width:${(100 * t.count) / maxT}%` })), h("span", { class: "n" }, t.count)))
            : h("p", { class: "muted" }, "Nenhuma mensagem no período.")))));

    // 1. precisa de você + hoje
    const items = [];
    const irow = (badge, tone, title, sub, n, onclick) => h("button", { class: "irow", type: "button", onclick },
      h("span", { class: "ibadge " + tone }, I(badge, 18)), h("span", { class: "itext" }, h("strong", {}, title), h("small", {}, sub)),
      h("span", { class: "icount" + (tone === "red" ? " red" : "") }, n), h("span", { class: "chev" }, I("arrow", 16)));
    if (a.open_exceptions) items.push(irow("alert", "red", a.open_exceptions === 1 ? "Grupo sem embaixador" : "Grupos sem embaixador", "Designar, conduzir ou propor nova data", a.open_exceptions, () => go("excecoes")));
    if (a.invites_expiring) items.push(irow("clock", "amber", a.invites_expiring === 1 ? "Convite vencendo" : "Convites vencendo", "Vencem em até 6 h", a.invites_expiring, () => go("agenda")));
    if (a.presence_pending) items.push(irow("check-circle", "gray", "Presenças sem registro", "Marcar compareceu ou não compareceu", a.presence_pending, () => { S.filters = { status: "presenca_pendente" }; go("agendamentos"); }));
    const pending = [a.open_exceptions, a.invites_expiring, a.presence_pending].reduce((x, y) => x + (y || 0), 0);
    const peopleToday = d.today.reduce((x, g) => x + g.people, 0);
    el.append(h("div", { class: "ov-top" },
      h("section", {}, sectionHead("Precisa de você", pending ? h("span", { class: "count-badge" }, pending) : null),
        h("div", { class: "ilist" }, items.length ? items : h("div", { class: "irow done" }, h("span", { class: "ibadge green" }, I("check", 18)),
          h("span", { class: "itext" }, h("strong", {}, "Tudo em dia"), h("small", {}, "A plataforma está confirmando, lembrando e escalando sozinha."))))),
      h("section", {}, sectionHead("Hoje"),
        h("div", { class: "today-card" },
          h("div", { class: "today-nums" },
            h("div", {}, h("span", { class: "kval" }, d.today.length), h("span", { class: "klabel2" }, d.today.length === 1 ? "tour" : "tours")),
            h("div", {}, h("span", { class: "kval" }, peopleToday), h("span", { class: "klabel2" }, "pessoas"))),
          d.today.length ? h("div", { class: "today-list" }, d.today.map((g) => h("div", { class: "tl" + (g.in_exception ? " exc" : "") },
            h("b", {}, g.time_label), h("span", {}, g.handled_by_admissions ? "Admissões" : (g.ambassador || "Sem embaixador")), h("small", {}, `${g.people}/${g.capacity}`))))
            : h("p", { class: "muted", style: "margin:0" }, "Nenhum tour agendado para hoje.")))));

    // 2. indicadores (anel = quanto falta para a meta)
    const st = (v, okIf, warnIf) => (v === null || v === undefined ? "none" : okIf(v) ? "ok" : warnIf(v) ? "warn" : "crit");
    const fcMin = fc.avg === null ? null : fc.avg / 60;
    el.append(h("section", { class: "ov-sec" }, sectionHead("Indicadores", h("span", { class: "muted" }, "Anel: caminho até a meta do projeto")),
      h("div", { class: "kgrid" },
        kpiCard("check-circle", "Realizados ÷ agendados", rr.gross === null ? "—" : fmt.num(rr.gross, 0), rr.gross === null ? "" : "%", st(rr.gross, (v) => v >= 85, (v) => v >= 75),
          rr.gross === null ? 0 : rr.gross / 85, `Meta 85% · antes 63%`),
        kpiCard("zap", "1ª confirmação", fcMin === null ? "—" : fcMin < 1 ? fmt.num(fc.avg, 0) : fmt.num(fcMin, 1), fcMin === null ? "" : fcMin < 1 ? "s" : "min",
          st(fc.avg, (v) => v <= 300, (v) => v <= 3600), fc.avg === null ? 0 : Math.min(1, 300 / Math.max(fc.avg, 1)), "Meta 5 min · antes ~26 h"),
        kpiCard("user", "Tarefas manuais por tour", mt.value === null ? "—" : fmt.num(mt.value, 1), "", st(mt.value, (v) => v <= 3, (v) => v <= 5),
          mt.value === null ? 0 : mt.value <= 3 ? 1 : 3 / mt.value, "Meta 3 · antes 8"),
        kpiCard("star", "NPS do tour", nps.score === null ? "—" : fmt.num(nps.score, 0), "", st(nps.score, (v) => v >= 90, (v) => v >= 75),
          nps.score === null ? 0 : (nps.score + 100) / 190, `Meta 90 · ${nps.responses} respostas`))));

    // 3. funil e semana
    const f = d.funnel, maxF = Math.max(1, f.booked);
    const conv = (a1, b1) => (b1 ? Math.round((100 * a1) / b1) + "%" : "—");
    const fr = (label, n, prev) => h("div", { class: "fr" }, h("span", {}, label),
      h("span", { class: "track" }, h("span", { class: "bar", style: `width:${(100 * n) / maxF}%` })),
      h("span", { class: "n" }, n, prev !== undefined ? h("small", { title: "da etapa anterior" }, conv(n, prev)) : h("small", {}, "")));
    el.append(h("section", { class: "ov-sec" }, sectionHead("Por semana"),
      h("div", { class: "panel2" }, weeklyChart(d.weekly),
        h("div", { class: "mini-stats" },
          h("span", {}, h("b", {}, d.totals.no_show), " não vieram"),
          h("span", {}, h("b", {}, d.totals.cancelled_candidate + d.totals.cancelled_admissions), " cancelados"),
          h("span", {}, h("b", {}, d.totals.presence_pending), " sem registro de presença")))));

    // 4. ocupação e cursos
    const times = [...new Set(d.occupancy.map((o) => o.time))].sort();
    const wds = [...new Set(d.occupancy.map((o) => o.weekday))].sort();
    const cell = (wd, t) => d.occupancy.find((o) => o.weekday === wd && o.time === t);
    const maxOcc = Math.max(1, ...d.occupancy.map((o) => o.pct || 0));
    const maxC = d.by_course.length ? d.by_course[0].total || 1 : 1;
    el.append(h("section", { class: "ov-sec" }, sectionHead("Demanda"),
      h("div", { class: "grid-2" },
        h("div", { class: "panel2" }, h("h3", {}, "Ocupação por dia e horário"),
          h("div", { class: "table-wrap", style: "border:0;box-shadow:none;background:transparent" }, h("table", { class: "heat" },
            h("thead", {}, h("tr", {}, h("th", {}, ""), wds.map((w) => h("th", {}, WD[w].slice(0, 3))))),
            h("tbody", {}, times.map((t) => h("tr", {}, h("th", {}, fmt.hhmm(t)), wds.map((w) => {
              const c = cell(w, t);
              const p = c && c.pct !== null ? c.pct : null;
              const share = p === null ? 0 : Math.round((85 * p) / maxOcc);
              return h("td", { style: `background:color-mix(in srgb, var(--ink) ${share}%, var(--surface));color:${share > 45 ? "var(--bg)" : "inherit"}`,
                title: c ? `${c.people} de ${c.capacity} lugares` : "" }, p === null ? "—" : `${Math.round(p)}%`);
            })))))),
          h("p", { class: "muted", style: "font-size:12px;margin:10px 0 0" }, "Mais escuro = horário mais cheio.")),
        h("div", { class: "panel2" }, h("h3", {}, "Interesse por curso"),
          d.by_course.length ? d.by_course.map((c) => h("div", { class: "hbar" }, h("span", { class: "name", title: c.course }, c.course),
            h("span", { class: "track" }, h("span", { style: `width:${(100 * c.total / maxC).toFixed(1)}%` })), h("span", { class: "n", title: `${c.treineiros} treineiro(s)` }, c.total)))
            : h("p", { class: "muted" }, "Sem agendamentos no período.")))));
  }

  // ------------------------------------------------------------ agenda
  async function secAgenda(el) {
    if (!S.agendaFrom) { const d = new Date(today() + "T12:00:00Z"); S.agendaFrom = addDays(today(), -((d.getUTCDay() + 6) % 7)); }
    const r = await api("GET", `/api/admin/agenda?from=${S.agendaFrom}&to=${addDays(S.agendaFrom, 6)}`);
    const days = Array.from({ length: 7 }, (_, i) => addDays(S.agendaFrom, i)).filter((d) => r.weekdays.includes((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));
    el.append(h("div", { class: "section-title" }, h("h1", {}, "Agenda"),
      h("div", { class: "btns" },
        h("button", { class: "btn small", onclick: () => { S.agendaFrom = addDays(S.agendaFrom, -7); render(); } }, "← Semana anterior"),
        h("button", { class: "btn small", onclick: () => { S.agendaFrom = null; render(); } }, "Esta semana"),
        h("button", { class: "btn small", onclick: () => { S.agendaFrom = addDays(S.agendaFrom, 7); render(); } }, "Próxima semana →"))),
      h("p", { class: "muted" }, `${fmt.dayMonth(r.from)} a ${fmt.dayMonth(r.to)} · cada bloco é um grupo (ocupação/capacidade e embaixador).`));
    const grid = h("div", { class: "agenda", style: `grid-template-columns: 56px repeat(${days.length}, minmax(140px, 1fr))` });
    grid.append(h("div"), ...days.map((d) => h("div", { class: "head" }, `${fmt.weekdayShort(d)} ${fmt.dayMonth(d)}`)));
    for (const t of r.start_times) {
      grid.append(h("div", { class: "time" }, fmt.hhmm(t)));
      for (const d of days) {
        const groups = r.groups.filter((g) => g.slot_start === (r.slots.find((s) => s.date === d && s.time === t) || {}).slot_start);
        const slot = r.slots.find((s) => s.date === d && s.time === t);
        grid.append(h("div", { class: "cell" },
          groups.map((g) => h("div", { class: "grp " + (g.in_exception ? "exc" : (!g.ambassador && !g.handled_by_admissions ? "wait" : "")), role: "button", tabindex: "0",
            style: "cursor:pointer", onclick: () => groupDialog(g), onkeydown: (e) => e.key === "Enter" && groupDialog(g) },
            h("strong", {}, `${g.people}/${g.capacity}`), " ",
            g.in_exception ? "EXCEÇÃO" : g.handled_by_admissions ? "Admissões" : g.ambassador ? g.ambassador.split(" ")[0]
              : g.pending_invite ? `convite: ${g.pending_invite.ambassador.split(" ")[0]}` : "sem embaixador")),
          slot && slot.reason ? h("div", { class: "free" }, "bloqueado")
            : slot && new Date(slot.slot_start) > new Date(S.now) ? h("div", { class: "free" }, `${slot.remaining} vagas livres`) : null));
      }
    }
    el.append(h("div", { style: "overflow-x:auto" }, grid));
  }

  function groupDialog(g) {
    dialog(`Grupo · ${g.date_label}, ${g.time_label}`, h("div", {},
      h("p", {}, `Embaixador: `, h("strong", {}, g.handled_by_admissions ? "Admissões" : (g.ambassador || "—")), ` · ${g.people}/${g.capacity} pessoas · `, g.in_exception ? tag("excecao") : tag(g.status)),
      g.pending_invite ? h("p", { class: "muted" }, `Convite em aberto para ${g.pending_invite.ambassador} até ${fmt.dateTime(g.pending_invite.expires_at)}.`) : null,
      h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Protocolo"), h("th", {}, "Nome"), h("th", { class: "num" }, "Pessoas"), h("th", {}, "Situação"))),
        h("tbody", {}, g.bookings.map((b) => h("tr", { class: "click", onclick: () => bookingDialog(b.id) }, h("td", {}, b.protocol), h("td", {}, b.name),
          h("td", { class: "num" }, b.party_size), h("td", {}, tag(b.status)))))))),
      [g.status !== "realizado" ? h("button", { class: "btn", onclick: () => assignDialog(g) }, "Trocar/designar embaixador") : null].filter(Boolean));
  }

  // ------------------------------------------------------------ agendamentos
  async function secAgendamentos(el) {
    const f = S.filters;
    const q = h("input", { type: "search", id: "f-q", placeholder: "Nome, CPF, protocolo ou e-mail", value: f.q || "" });
    const status = h("select", { id: "f-status" }, h("option", { value: "" }, "Todos"),
      ["aguardando_embaixador", "confirmado", "excecao", "realizado", "encerrado", "nao_compareceu", "presenca_pendente", "cancelado_candidato", "cancelado_admissoes"]
        .map((s) => h("option", { value: s, selected: f.status === s ? true : null }, T.STATUS[s][0])));
    const cfg = await api("GET", "/api/admin/config");
    const course = h("select", { id: "f-course" }, h("option", { value: "" }, "Todos"), cfg.courses.map((c) => h("option", { value: c.name, selected: f.course === c.name ? true : null }, c.name)));
    const tr = h("select", { id: "f-tr" }, h("option", { value: "" }, "Todos"), h("option", { value: "1", selected: f.treineiro === "1" ? true : null }, "Treineiros"), h("option", { value: "0", selected: f.treineiro === "0" ? true : null }, "Vestibulandos"));
    const from = h("input", { type: "date", id: "f-from", value: f.from || "" });
    const to = h("input", { type: "date", id: "f-to", value: f.to || "" });
    const apply = (e) => { e && e.preventDefault(); S.filters = { q: q.value, status: status.value, course: course.value, treineiro: tr.value, from: from.value, to: to.value }; render(); };
    const params = new URLSearchParams(Object.entries(S.filters).filter(([, v]) => v));
    const r = await api("GET", "/api/admin/bookings?" + params);
    el.append(h("div", { class: "section-title" }, h("h1", {}, "Agendamentos"),
      h("div", { class: "btns" }, ["bookings", "attendance", "nps", "crm"].map((k) => h("a", { class: "btn small", href: `/api/admin/export/${k}.csv?` + params },
        { bookings: "CSV agendamentos", attendance: "CSV presença", nps: "CSV NPS", crm: "CSV para o CRM" }[k])))),
      h("form", { class: "toolbar", onsubmit: apply },
        h("div", { class: "field", style: "flex:1;min-width:220px" }, h("label", { for: "f-q" }, "Busca"), q),
        h("div", { class: "field" }, h("label", { for: "f-status" }, "Situação"), status),
        h("div", { class: "field" }, h("label", { for: "f-course" }, "Curso"), course),
        h("div", { class: "field" }, h("label", { for: "f-tr" }, "Treineiro"), tr),
        h("div", { class: "field" }, h("label", { for: "f-from" }, "De"), from),
        h("div", { class: "field" }, h("label", { for: "f-to" }, "Até"), to),
        h("button", { class: "btn small dark", type: "submit" }, "Filtrar"),
        h("button", { class: "btn small", type: "button", onclick: () => { S.filters = {}; render(); } }, "Limpar")),
      h("p", { class: "muted" }, `${r.items.length} resultado(s)${r.items.length === 500 ? " (mostrando os 500 primeiros)" : ""}`),
      r.items.length ? h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Protocolo", "Data", "Hora", "Nome", "Curso", "Pessoas", "Embaixador", "Situação"].map((x, i) => h("th", { class: i === 5 ? "num" : null }, x)))),
        h("tbody", {}, r.items.map((b) => h("tr", { class: "click", tabindex: "0", onclick: () => bookingDialog(b.id), onkeydown: (e) => e.key === "Enter" && bookingDialog(b.id) },
          h("td", {}, b.protocol), h("td", {}, b.date_label), h("td", {}, b.time_label), h("td", {}, b.full_name),
          h("td", {}, b.course_interest, b.is_treineiro ? h("span", { class: "tag", style: "margin-left:6px" }, "T") : null),
          h("td", { class: "num" }, b.party_size), h("td", {}, b.ambassador_name || "—"), h("td", {}, tag(b.status)))))))
        : h("div", { class: "empty" }, "Nenhum agendamento encontrado."));
  }

  const EVENT_LABELS = {
    "booking.created": "Agendamento criado", "booking.confirmed": "Tour confirmado", "booking.cancelled": "Cancelado", "booking.rescheduled": "Reagendado",
    "booking.presence_confirmed": "Candidato confirmou presença", "booking.closed": "Encerrado no CRM", "attendance.realizado": "Presença: compareceu",
    "attendance.nao_compareceu": "Presença: não compareceu", "nps.received": "NPS respondido", "message.resent": "Mensagem reenviada",
    "group.created": "Grupo aberto", "allocation.ranked": "Alocação: ranking de embaixadores", "group.exception_opened": "Exceção aberta",
    "exception.assigned": "Admissões designou embaixador", "exception.admissions_conducts": "Admissões vai conduzir",
    "exception.new_date_proposed": "Admissões propôs nova data", "exception.reallocation": "Alocação reaberta", "ambassador.withdrew": "Embaixador desistiu",
    "group.cancelled": "Grupo cancelado", "tour.completed": "Tour concluído", "gift.collected": "Brinde e voucher",
  };

  async function bookingDialog(id) {
    const b = await api("GET", `/api/admin/bookings/${id}`);
    const active = ["aguardando_embaixador", "confirmado", "excecao"].includes(b.status);
    const body = h("div", {},
      h("p", {}, tag(b.status), b.group.in_exception ? [" ", tag("excecao")] : null),
      h("dl", { class: "summary" },
        h("dt", {}, "Visita"), h("dd", {}, `${b.date_label}, às ${b.time_label}`),
        h("dt", {}, "Nome"), h("dd", {}, b.full_name), h("dt", {}, "CPF"), h("dd", {}, b.cpf || "—"),
        h("dt", {}, "E-mail"), h("dd", {}, b.email), h("dt", {}, "Celular"), h("dd", {}, T.maskPhone(b.phone || "")),
        h("dt", {}, "Curso"), h("dd", {}, `${b.course_interest} · ${b.is_treineiro ? "treineiro" : "vestibulando"}`),
        h("dt", {}, "Pessoas"), h("dd", {}, `${b.party_size}${b.companions_names.length ? " — " + b.companions_names.join(", ") : ""}`),
        h("dt", {}, "Idioma"), h("dd", {}, b.language), h("dt", {}, "Locomoção"), h("dd", {}, b.mobility_restriction ? `Sim${b.mobility_notes ? " — " + b.mobility_notes : ""}` : "Não"),
        h("dt", {}, "Dúvidas"), h("dd", {}, b.questions || "—"),
        h("dt", {}, "Embaixador"), h("dd", {}, b.handled_by_admissions ? "Admissões" : (b.ambassador_name || "—")),
        h("dt", {}, "Reagendamentos"), h("dd", {}, b.reschedule_count), h("dt", {}, "WhatsApp"), h("dd", {}, b.whatsapp_opt_in ? "aceitou" : "não"),
        h("dt", {}, "CRM"), h("dd", {}, b.crm_id || "pendente"),
        b.nps ? [h("dt", {}, "NPS"), h("dd", {}, `${b.nps.score}/10${b.nps.highlight ? " — “" + b.nps.highlight + "”" : ""}`)] : null),
      h("p", { style: "margin-top:12px" }, h("a", { href: b.manage_url, target: "_blank" }, "Abrir “Minha visita” do candidato")),
      h("h3", { style: "margin-top:20px" }, "Histórico"),
      h("ul", { class: "timeline" }, b.events.map((e) => h("li", { class: e.is_manual ? "manual" : "" }, h("time", {}, fmt.dateTime(e.created_at)),
        `${EVENT_LABELS[e.type] || e.type} · ${{ system: "plataforma", candidate: "candidato", ambassador: "embaixador", admissions: "Admissões" }[e.actor] || e.actor}`,
        e.is_manual ? h("span", { class: "tag", style: "margin-left:6px" }, "manual") : null))),
      h("h3", { style: "margin-top:20px" }, "Mensagens"),
      b.notifications.length ? h("div", { class: "table-wrap" }, h("table", {}, h("tbody", {}, b.notifications.map((n) => h("tr", {},
        h("td", {}, n.template_code), h("td", {}, n.channel === "whatsapp" ? "WhatsApp" : "E-mail"), h("td", {}, n.subject), h("td", {}, tag(n.status)), h("td", {}, fmt.dateTime(n.sent_at)))))))
        : h("p", { class: "muted" }, "Nenhuma."),
      b.crm.length ? [h("h3", { style: "margin-top:20px" }, "Sincronização com o CRM"), h("div", { class: "table-wrap" }, h("table", {}, h("tbody", {}, b.crm.map((c) => h("tr", {},
        h("td", {}, c.operation), h("td", {}, tag(c.status)), h("td", {}, `${c.attempts} tentativa(s)`), h("td", {}, c.last_error || "")))))) ] : null);
    const close = () => dlg.close();
    const after = async (p) => { try { await p; toast("Feito."); close(); render(); } catch (e) { toast(e.message, true); } };
    const actions = [];
    if (active) {
      actions.push(h("button", { class: "btn", onclick: () => { close(); rescheduleDialog(b); } }, "Reagendar"));
      actions.push(h("button", { class: "btn", onclick: () => { close(); assignDialog(b.group); } }, "Trocar embaixador"));
      actions.push(h("button", { class: "btn danger", onclick: async () => {
        if (await confirmDialog("Cancelar agendamento", `Cancelar a visita de ${b.full_name}? O candidato recebe um e-mail.`, "Cancelar visita", true))
          after(api("PATCH", `/api/admin/bookings/${id}`, { action: "cancel", reason: "cancelado por Admissões" }));
      } }, "Cancelar"));
    }
    if (["confirmado", "presenca_pendente", "realizado", "nao_compareceu"].includes(b.status) && new Date(b.slot_start) < new Date(S.now)) {
      actions.push(h("button", { class: "btn", onclick: () => after(api("PATCH", `/api/admin/bookings/${id}`, { action: "attendance", attended: true })) }, "Marcar compareceu"));
      actions.push(h("button", { class: "btn", onclick: () => after(api("PATCH", `/api/admin/bookings/${id}`, { action: "attendance", attended: false })) }, "Marcar não compareceu"));
    }
    const resendSel = h("select", { "aria-label": "Mensagem para reenviar", style: "width:auto" }, ["M1", "M2", "M3", "M4", "M5", "M6"].map((c) => h("option", { value: c }, c)));
    actions.push(h("span", { class: "btns" }, resendSel, h("button", { class: "btn", onclick: () => after(api("PATCH", `/api/admin/bookings/${id}`, { action: "resend", template_code: resendSel.value })) }, "Reenviar")));
    actions.push(h("a", { class: "btn ghost", href: `/api/admin/lgpd/${id}/export` }, "Exportar dados (LGPD)"));
    if (!active && !b.anonymized) actions.push(h("button", { class: "btn ghost", onclick: async () => {
      if (await confirmDialog("Anonimizar titular", "Apaga nome, CPF, e-mail e telefone deste titular (pedido LGPD). Não dá para desfazer.", "Anonimizar", true))
        after(api("POST", `/api/admin/lgpd/${id}/anonymize`));
    } }, "Anonimizar"));
    const dlg = dialog(`${b.protocol}`, body, actions);
  }

  async function rescheduleDialog(b) {
    const from = today(), to = addDays(today(), 60);
    const r = await api("GET", `/api/public/slots?from=${from}&to=${to}&party=${b.party_size}&token=${b.manage_url.split("/").pop()}`);
    const sel = h("select", { id: "rs" }, r.slots.filter((s) => s.available && s.slot_start !== b.slot_start).map((s) =>
      h("option", { value: s.slot_start }, `${fmt.dateLong(s.slot_start)}, ${fmt.hhmm(s.time)} — ${s.remaining} vagas`)));
    const dlg = dialog("Reagendar", h("div", {}, h("p", {}, `${b.full_name} · ${b.party_size} pessoa(s). Admissões não tem limite de reagendamentos.`),
      h("div", { class: "field" }, h("label", { for: "rs" }, "Novo horário"), sel)), [
      h("button", { class: "btn", onclick: () => dlg.close() }, "Voltar"),
      h("button", { class: "btn primary", onclick: async () => {
        try { await api("PATCH", `/api/admin/bookings/${b.id}`, { action: "reschedule", slot_start: sel.value }); toast("Reagendado. O candidato recebeu o novo horário."); dlg.close(); render(); }
        catch (e) { toast(e.message, true); }
      } }, "Reagendar")]);
  }

  async function assignDialog(g) {
    const r = await api("GET", `/api/admin/groups/${g.id}/available-ambassadors`);
    const sel = h("select", { id: "amb" }, r.items.map((a) => h("option", { value: a.id, disabled: a.busy ? true : null },
      `${a.name}${a.course ? " · " + a.course : ""}${a.available ? " · disponível" : " · fora da disponibilidade"}${a.busy ? " · ocupado" : ""}`)));
    const dlg = dialog("Designar embaixador", h("div", {}, h("p", {}, `${g.date_label}, ${g.time_label} · ${g.people} pessoa(s)`),
      h("div", { class: "field" }, h("label", { for: "amb" }, "Embaixador"), sel),
      h("p", { class: "muted" }, "O embaixador e os candidatos são avisados automaticamente.")), [
      h("button", { class: "btn", onclick: () => dlg.close() }, "Voltar"),
      h("button", { class: "btn primary", onclick: async () => {
        try { await api("POST", `/api/admin/exceptions/${g.id}/resolve`, { action: "designar", ambassador_id: +sel.value }); toast("Embaixador designado."); dlg.close(); render(); }
        catch (e) { toast(e.message, true); }
      } }, "Designar")]);
  }

  // ------------------------------------------------------------ exceções
  async function secExcecoes(el) {
    const r = await api("GET", "/api/admin/exceptions");
    S.counts.exceptions = r.items.length;
    drawSide();
    el.append(h("h1", {}, "Fila de exceções"),
      h("p", { class: "muted" }, "Grupos que ficaram sem embaixador. Ordenados pela proximidade do tour."));
    if (!r.items.length) el.append(h("div", { class: "empty" }, "Nenhuma exceção aberta. Tudo está sendo resolvido automaticamente."));
    const act = async (g, action, extra) => {
      try { await api("POST", `/api/admin/exceptions/${g.id}/resolve`, Object.assign({ action }, extra || {})); toast("Feito."); render(); }
      catch (e) { toast(e.message, true); }
    };
    for (const g of r.items) {
      el.append(h("article", { class: "exc-card" },
        h("div", { class: "tour-head" }, h("span", { class: "chip-ico" + (g.hours_left < 24 ? " red" : "") }, I("alert", 22)),
          h("div", {}, h("div", { class: "when", style: "font-family:var(--serif);font-size:22px;font-weight:600" }, `${g.date_label.split(",")[0]}, ${g.time_label}`),
            h("div", { class: "muted" }, `${g.date_label.split(",").slice(1).join(",").trim()} · ${g.people} pessoa(s)`)),
          h("div", { class: "tags" }, h("span", { class: "tag " + (g.hours_left < 24 ? "err" : "yellow") }, g.hours_left < 0 ? "tour já passou" : `faltam ${fmt.num(g.hours_left, 0)} h`))),
        h("p", { class: "muted", style: "margin:0" }, g.reason),
        h("div", { class: "who" }, g.bookings.map((b) => h("div", { class: "p" }, h("span", {}, h("strong", {}, b.name), ` · ${b.course}`), h("span", { class: "muted" }, `${b.party_size} pessoa(s) · ${b.protocol}`)))),
        h("div", { class: "btns" },
          h("button", { class: "btn primary", onclick: () => assignDialog(g) }, "Designar embaixador"),
          h("button", { class: "btn", onclick: () => act(g, "admissoes_conduz") }, "Admissões conduz"),
          h("button", { class: "btn", onclick: () => act(g, "reabrir_alocacao") }, "Tentar alocação de novo"),
          h("button", { class: "btn", onclick: async () => {
            if (await confirmDialog("Propor nova data", "Os candidatos recebem um e-mail pedindo para escolher outro horário pelo link “Minha visita”.", "Enviar"))
              act(g, "propor_nova_data");
          } }, "Propor nova data"))));
    }
  }

  // ------------------------------------------------------------ embaixadores
  async function secEmbaixadores(el) {
    const [r, gifts, cfg] = await Promise.all([api("GET", "/api/admin/ambassadors"), api("GET", "/api/admin/gifts"), api("GET", "/api/admin/config")]);
    const name = h("input", { type: "text", id: "n-name" }), email = h("input", { type: "email", id: "n-email" });
    const course = h("select", { id: "n-course" }, h("option", { value: "" }, "—"), cfg.courses.map((c) => h("option", { value: c.name }, c.name)));
    el.append(h("h1", {}, "Embaixadores"),
      h("div", { class: "card", style: "margin-bottom:20px" }, h("h2", {}, "Convidar embaixador"),
        h("form", { class: "toolbar", onsubmit: async (e) => {
          e.preventDefault();
          try { await api("POST", "/api/admin/ambassadors", { name: name.value, email: email.value, course: course.value }); toast("Convite enviado por e-mail."); render(); }
          catch (err) { toast(err.message, true); }
        } },
          h("div", { class: "field" }, h("label", { for: "n-name" }, "Nome"), name),
          h("div", { class: "field" }, h("label", { for: "n-email" }, "E-mail"), email),
          h("div", { class: "field" }, h("label", { for: "n-course" }, "Curso"), course),
          h("button", { class: "btn primary", type: "submit" }, "Convidar"))),
      h("p", { class: "muted" }, "Estatísticas dos últimos 90 dias. Relatório interno (sem ranking público)."),
      h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Embaixador", "Curso", "Horários/semana", "Tours", "Convites", "Aceites", "Recusas", "Expirados", "Nota", "Brinde pendente", "Situação", ""].map((x, i) =>
          h("th", { class: i >= 2 && i <= 9 ? "num" : null }, x)))),
        h("tbody", {}, r.items.map((a) => h("tr", {},
          h("td", {}, h("strong", {}, a.display_name), h("br"), h("small", {}, a.email)),
          h("td", {}, a.course || "—"),
          h("td", { class: "num" }, a.availability.length, a.availability_stale ? h("span", { class: "tag yellow", style: "margin-left:6px" }, "desatualizada") : null),
          h("td", { class: "num" }, a.stats.tours || 0), h("td", { class: "num" }, a.stats.invites || 0), h("td", { class: "num" }, a.stats.accepted || 0),
          h("td", { class: "num" }, a.stats.declined || 0), h("td", { class: "num" }, a.stats.expired || 0),
          h("td", { class: "num" }, a.stats.nps_avg ? fmt.num(a.stats.nps_avg, 1) : "—"), h("td", { class: "num" }, a.stats.gifts_pending || 0),
          h("td", {}, a.active ? tag("ok") : h("span", { class: "tag" }, "Inativo")),
          h("td", {}, h("button", { class: "btn small", onclick: async () => {
            try { await api("PATCH", `/api/admin/ambassadors/${a.id}`, { active: !a.active }); render(); } catch (e) { toast(e.message, true); }
          } }, a.active ? "Desativar" : "Ativar"))))))),
      h("h2", { style: "margin-top:32px" }, "Controle de brinde e voucher de almoço"),
      gifts.items.length ? h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, "Tour"), h("th", {}, "Embaixador"), h("th", {}, "Situação do tour"), h("th", {}, "Retirada"))),
        h("tbody", {}, gifts.items.slice(0, 60).map((g) => h("tr", {}, h("td", {}, g.date_label), h("td", {}, g.display_name), h("td", {}, tag(g.status)),
          h("td", {}, h("label", { class: "choice" }, h("input", { type: "checkbox", checked: g.collected_at ? true : null, onchange: async (e) => {
            try { await api("PATCH", `/api/admin/ambassadors/${g.ambassador_id}`, { gift_group_id: g.tour_group_id, collected: e.target.checked }); toast("Atualizado."); }
            catch (err) { toast(err.message, true); }
          } }), g.collected_at ? fmt.date(g.collected_at) : "pendente"))))))) : h("div", { class: "empty" }, "Nenhum tour confirmado ainda."));
  }

  // ------------------------------------------------------------ configurações
  async function secConfig(el) {
    const r = await api("GET", "/api/admin/config");
    const c = r.config;
    const inputs = {};
    const num = (k, label, hint) => { inputs[k] = h("input", { type: "number", id: "c-" + k, value: c[k], min: "0" }); return h("div", { class: "field" }, h("label", { for: "c-" + k }, label), inputs[k], hint ? h("div", { class: "hint" }, hint) : null); };
    const txt = (k, label) => { inputs[k] = h("input", { type: "text", id: "c-" + k, value: c[k] }); return h("div", { class: "field" }, h("label", { for: "c-" + k }, label), inputs[k]); };
    const wdSet = new Set(c.weekdays);
    const hidden = new Set(c.hidden_fields);
    const times = h("input", { type: "text", id: "c-times", value: c.start_times.join(", ") });
    const reserve = h("input", { type: "checkbox", checked: c.reserve_required ? true : null });
    const matchCourse = h("input", { type: "checkbox", checked: c.match_course ? true : null });
    const reminderTime = h("input", { type: "time", id: "c-rt", value: c.reminder_time });
    const langs = h("input", { type: "text", id: "c-langs", value: c.languages.join(", ") });
    const save = async () => {
      const body = {
        weekdays: [...wdSet].sort(), start_times: times.value.split(",").map((s) => s.trim()).filter(Boolean),
        reserve_required: reserve.checked, match_course: matchCourse.checked, reminder_time: reminderTime.value, hidden_fields: [...hidden],
        languages: langs.value.split(",").map((s) => s.trim()).filter(Boolean),
      };
      for (const [k, inp] of Object.entries(inputs)) body[k] = inp.type === "number" ? +inp.value : inp.value;
      try { await api("PUT", "/api/admin/config", body); toast("Configurações salvas."); render(); } catch (e) { toast(e.message, true); }
    };
    el.append(h("div", { class: "section-title" }, h("h1", {}, "Configurações"), h("button", { class: "btn primary", onclick: save }, "Salvar configurações")),
      h("div", { class: "grid2", style: "gap:20px" },
        h("div", { class: "card" }, h("h2", {}, "Grade de horários"),
          h("fieldset", { class: "field" }, h("legend", {}, "Dias com tour"), WD.map((w, i) => h("label", { class: "choice" },
            h("input", { type: "checkbox", checked: wdSet.has(i) ? true : null, onchange: (e) => e.target.checked ? wdSet.add(i) : wdSet.delete(i) }), w.slice(0, 3)))),
          h("div", { class: "field" }, h("label", { for: "c-times" }, "Horários de início (HH:MM, separados por vírgula)"), times),
          num("duration_min", "Duração do tour (min)"), num("group_capacity", "Pessoas por embaixador (grupo)"),
          h("label", { class: "choice" }, reserve, "Exigir embaixador reserva disponível para abrir grupo novo (RN-06)")),
        h("div", { class: "card" }, h("h2", {}, "Prazos"),
          num("min_lead_hours", "Antecedência mínima para agendar (h)"), num("max_days_ahead", "Agenda aberta para os próximos (dias)"),
          h("div", { class: "field" }, h("label", { for: "c-rt" }, "Horário do lembrete D-1"), reminderTime),
          num("cancel_cutoff_hours", "Cancelar/reagendar pelo link até (h antes)"), num("max_reschedules", "Máximo de reagendamentos pelo link"),
          num("invite_timeout_hours", "Prazo do embaixador para responder (h)"), num("exception_cutoff_hours", "Abrir exceção se ninguém aceitar até (h antes)")),
        h("div", { class: "card" }, h("h2", {}, "Visita e formulário"),
          txt("meeting_point", "Ponto de encontro"), txt("what_to_bring", "O que levar"), txt("privacy_url", "Link do aviso de privacidade"),
          txt("virtual_tour_url", "Link do tour virtual"),
          h("div", { class: "field" }, h("label", { for: "c-langs" }, "Idiomas oferecidos (separados por vírgula)"), langs),
          h("fieldset", { class: "field" }, h("legend", {}, "Ocultar campos opcionais do formulário"),
            [["companions_names", "Nome dos acompanhantes"], ["mobility", "Restrição de locomoção"], ["questions", "Dúvidas"], ["whatsapp_opt_in", "Opt-in de WhatsApp"]].map(([k, l]) =>
              h("label", { class: "choice", style: "display:flex" }, h("input", { type: "checkbox", checked: hidden.has(k) ? true : null, onchange: (e) => e.target.checked ? hidden.add(k) : hidden.delete(k) }), l)))),
        h("div", { class: "card" }, h("h2", {}, "Alocação, indicadores e dados"),
          h("label", { class: "choice" }, matchCourse, "Priorizar embaixador do mesmo curso do grupo"),
          num("metric_cancel_exclusion_hours", "Indicador ajustado: ignorar cancelamentos feitos com (h) de antecedência"),
          num("retention_months", "Anonimizar dados pessoais após (meses)"), txt("admissions_email", "E-mail de Admissões (alertas)"))));

    // bloqueios
    const bd = h("input", { type: "date", id: "b-date" }), bt = h("select", { id: "b-time" }, h("option", { value: "" }, "Dia todo"), c.start_times.map((t) => h("option", { value: t }, fmt.hhmm(t))));
    const br = h("input", { type: "text", id: "b-reason", placeholder: "Feriado, vestibular, evento…" });
    el.append(h("div", { class: "grid2", style: "gap:20px;margin-top:20px" },
      h("div", { class: "card" }, h("h2", {}, "Bloqueios e feriados"),
        r.blackouts.length ? r.blackouts.map((b) => h("div", { class: "person" }, h("span", {}, `${fmt.date(b.date + "T12:00:00-03:00")} · ${b.start_time ? fmt.hhmm(b.start_time) : "dia todo"} · ${b.reason || ""}`),
          h("button", { class: "btn small", onclick: async () => { await api("DELETE", `/api/admin/blackouts/${b.id}`); render(); } }, "Remover"))) : h("p", { class: "muted" }, "Nenhum bloqueio."),
        h("form", { class: "toolbar", style: "margin-top:12px", onsubmit: async (e) => {
          e.preventDefault();
          try { await api("POST", "/api/admin/blackouts", { date: bd.value, start_time: bt.value, reason: br.value }); toast("Bloqueio adicionado."); render(); } catch (err) { toast(err.message, true); }
        } }, h("div", { class: "field" }, h("label", { for: "b-date" }, "Data"), bd), h("div", { class: "field" }, h("label", { for: "b-time" }, "Horário"), bt),
          h("div", { class: "field" }, h("label", { for: "b-reason" }, "Motivo"), br), h("button", { class: "btn", type: "submit" }, "Bloquear"))),
      h("div", { class: "card" }, h("h2", {}, "Cursos de interesse"),
        r.courses.map((co) => h("div", { class: "person" }, h("span", {}, co.name, co.active ? "" : h("span", { class: "tag", style: "margin-left:6px" }, "oculto")),
          h("button", { class: "btn small", onclick: async () => { await api("PATCH", `/api/admin/courses/${co.id}`, { active: !co.active }); render(); } }, co.active ? "Ocultar" : "Mostrar"))),
        (() => { const n = h("input", { type: "text", id: "co-new" }); return h("form", { class: "toolbar", style: "margin-top:12px", onsubmit: async (e) => {
          e.preventDefault(); try { await api("POST", "/api/admin/courses", { name: n.value }); render(); } catch (err) { toast(err.message, true); } } },
          h("div", { class: "field" }, h("label", { for: "co-new" }, "Novo curso"), n), h("button", { class: "btn", type: "submit" }, "Adicionar")); })())));
  }

  // ------------------------------------------------------------ mensagens
  async function secMensagens(el) {
    const r = await api("GET", "/api/admin/templates");
    el.append(h("h1", {}, "Mensagens automáticas"),
      h("p", { class: "muted" }, "Variáveis: {nome} {data} {hora} {protocolo} {pessoas} {embaixador} {ponto_de_encontro} {o_que_levar} {link_minha_visita} {link_nps} {link_agendar} {perfil_grupo} {prazo} {link_portal} {mudanca} {motivo}"));
    for (const t of r.items) {
      const subject = h("input", { type: "text", id: "s-" + t.code, value: t.subject });
      const body = h("textarea", { id: "b-" + t.code, rows: "7" }, t.body);
      const active = h("input", { type: "checkbox", checked: t.active ? true : null });
      el.append(h("details", { class: "card" }, h("summary", { style: "cursor:pointer" }, h("strong", {}, `${t.code} · ${t.name}`), h("span", { class: "muted" }, ` — para ${t.audience}`),
        t.active ? null : h("span", { class: "tag", style: "margin-left:6px" }, "desativada")),
        h("div", { style: "margin-top:12px" },
          h("div", { class: "field" }, h("label", { for: "s-" + t.code }, "Assunto"), subject),
          h("div", { class: "field" }, h("label", { for: "b-" + t.code }, "Texto"), body),
          h("label", { class: "choice" }, active, "Ativa"),
          h("div", { class: "btns" },
            h("button", { class: "btn primary small", onclick: async () => {
              try { await api("PUT", `/api/admin/templates/${t.code}`, { subject: subject.value, body: body.value, active: active.checked }); toast("Mensagem salva."); }
              catch (e) { toast(e.message, true); }
            } }, "Salvar"),
            h("button", { class: "btn small", onclick: async () => { await api("POST", `/api/admin/templates/${t.code}/reset`); toast("Texto padrão restaurado."); render(); } }, "Restaurar padrão")))));
    }
  }

  // ------------------------------------------------------------ saúde e simulação
  async function secSaude(el) {
    const r = await api("GET", "/api/admin/jobs");
    S.now = r.now;
    el.append(h("h1", {}, "Saúde e simulação"),
      h("div", { class: "kpis" },
        kpi("Relógio da plataforma", fmt.dateTime(r.now), r.clock_offset_hours ? `adiantado ${fmt.num(r.clock_offset_hours)} h (simulação)` : "tempo real"),
        kpi("E-mail", r.email_adapter === "local" ? "Caixa local" : "SMTP", r.email_adapter === "local" ? "defina SMTP_HOST para envio real" : "envio real"),
        kpi("CRM", r.crm_adapter === "mock" ? "Simulado" : "Webhook", (r.crm.map((c) => `${c.n} ${c.status}`).join(" · ")) || "sem operações"),
        kpi("WhatsApp", "Simulado", "aguarda conta WhatsApp Business"),
        kpi("Mensagens", `${r.notifications.reduce((s, x) => s + x.n, 0)}`, r.notifications.map((n) => `${n.n} ${n.status}`).join(" · "))));
    if (r.dev) {
      const adv = (hours) => async () => {
        try { const x = await api("POST", "/api/admin/dev/clock", { advance_hours: hours }); toast(`Relógio: ${fmt.dateTime(x.now)}. Jobs executados.`); render(); }
        catch (e) { toast(e.message, true); }
      };
      el.append(h("div", { class: "card", style: "margin-bottom:20px" }, h("h2", {}, "Simulação de tempo (só em desenvolvimento)"),
        h("p", { class: "muted" }, "Adiante o relógio para ver lembretes, expiração de convites, exceções, presença pendente, NPS D+1 e encerramento no CRM acontecerem sozinhos. Os jobs rodam logo após cada avanço."),
        h("div", { class: "btns" }, h("button", { class: "btn", onclick: adv(1) }, "+1 hora"), h("button", { class: "btn", onclick: adv(6) }, "+6 horas"),
          h("button", { class: "btn", onclick: adv(12) }, "+12 horas"), h("button", { class: "btn", onclick: adv(24) }, "+1 dia"),
          h("button", { class: "btn", onclick: async () => { await api("POST", "/api/admin/dev/clock", { reset: true }); toast("Relógio voltou ao tempo real."); render(); } }, "Voltar ao tempo real"),
          h("button", { class: "btn dark", onclick: async () => { await api("POST", "/api/admin/jobs/run"); toast("Jobs executados."); render(); } }, "Rodar jobs agora"))));
    }
    el.append(h("h2", {}, "Jobs agendados"), h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Job"), h("th", {}, "Última execução"), h("th", {}, "Situação"), h("th", {}, "Resultado"))),
      h("tbody", {}, r.jobs.map((j) => h("tr", {}, h("td", {}, h("code", {}, j.job)), h("td", {}, fmt.dateTime(j.started_at)),
        h("td", {}, j.status === "ok" ? tag("ok") : j.status === "falhou" ? tag("falhou") : h("span", { class: "tag" }, j.status)),
        h("td", {}, j.status === "falhou" ? h("pre", {}, j.detail) : (j.detail || "—"))))))));
  }

  const SECTIONS = [
    ["visao", "Visão geral", secVisao], ["agenda", "Agenda", secAgenda], ["agendamentos", "Agendamentos", secAgendamentos],
    ["excecoes", "Exceções", secExcecoes], ["embaixadores", "Embaixadores", secEmbaixadores], null,
    ["config", "Configurações", secConfig], ["mensagens", "Mensagens", secMensagens], ["saude", "Saúde e simulação", secSaude],
  ];

  function drawSide() {
    const ICON = { visao: "home", agenda: "calendar", agendamentos: "list", excecoes: "alert", embaixadores: "users", config: "sliders", mensagens: "message", saude: "play" };
    clear(side).append(...SECTIONS.map((s) => s === null ? h("div", { class: "sep" }) : h("button", { "aria-current": S.section === s[0] ? "page" : null, onclick: () => go(s[0]) },
      h("span", { class: "lab" }, T.icon(ICON[s[0]] || "list", 18), s[1]), s[0] === "excecoes" && S.counts.exceptions ? h("span", { class: "tag red-solid" }, S.counts.exceptions) : null)));
  }

  function go(id) { S.section = id; location.hash = id; render(); }

  async function render() {
    drawSide();
    clear(main).append(h("p", { class: "loading" }, "Carregando…"));
    const tmp = h("div");
    try {
      await SECTIONS.find((s) => s && s[0] === S.section)[2](tmp);
      clear(main).append(...tmp.childNodes);
    } catch (e) { clear(main).append(h("div", { class: "notice error" }, e.message)); }
  }

  (async () => {
    const [me, cfg, jobs] = await Promise.all([api("GET", "/api/auth/me"), api("GET", "/api/public/config"), api("GET", "/api/admin/jobs")]);
    document.getElementById("who").textContent = me.user.name;
    S.today = cfg.today;
    S.now = jobs.now;
    S.period = { from: addDays(S.today, -30), to: S.today };
    S.counts = { exceptions: (await api("GET", "/api/admin/exceptions")).items.length };
    window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== S.section) { S.section = id; render(); } });
    render();
  })().catch((e) => clear(main).append(h("div", { class: "notice error" }, e.message)));
})();

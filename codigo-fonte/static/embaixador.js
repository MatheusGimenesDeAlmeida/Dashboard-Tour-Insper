/* /embaixador — convites, meus tours (presença, QR do NPS, brinde), disponibilidade e perfil. */
(function () {
  const { api, h, clear, fmt, toast, dialog, confirmDialog, tag } = T;
  const app = document.getElementById("app");
  const S = { tab: location.hash.slice(1) || "inicio", me: null };
  const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  document.getElementById("top").appendChild(T.topbar("Portal do embaixador", [
    h("span", { id: "who", class: "muted" }), h("button", { class: "btn small", onclick: T.logout }, "Sair")]));

  function profileLine(p) {
    const bits = [p.course_interest, p.is_treineiro ? "treineiro" : "vestibulando"];
    if (p.companions) bits.push(`+${p.companions} acompanhante${p.companions > 1 ? "s" : ""}`);
    if (p.language && p.language !== "Português") bits.push(`idioma: ${p.language}`);
    return bits.join(" · ");
  }

  function people(list) {
    return h("div", {}, list.map((p) => h("div", { class: "person" },
      h("div", {}, h("strong", {}, p.first_name), h("div", { class: "muted", style: "font-size:14px" }, profileLine(p)),
        p.mobility_restriction ? h("div", { style: "margin-top:4px" }, h("span", { class: "tag yellow" }, "Restrição de locomoção"),
          p.mobility_notes ? " " + p.mobility_notes : "") : null,
        p.questions ? h("div", { style: "margin-top:4px;font-size:14px" }, "Dúvidas: ", h("em", {}, p.questions)) : null))));
  }

  function countdown(iso, nowIso) {
    const ms = new Date(iso) - new Date(nowIso);
    if (ms <= 0) return "prazo encerrado";
    const hrs = Math.floor(ms / 3600000), min = Math.floor((ms % 3600000) / 60000);
    return hrs ? `${hrs}h${String(min).padStart(2, "0")} para responder` : `${min} min para responder`;
  }

  async function tabConvites(main) {
    const r = await api("GET", "/api/ambassador/invitations");
    main.append(h("p", { class: "eyebrow" }, "Portal do embaixador"), h("h1", {}, "Convites"));
    if (!r.invitations.length) main.append(h("div", { class: "empty" }, "Nenhum convite aguardando resposta. Mantenha sua disponibilidade em dia para receber tours."));
    for (const inv of r.invitations) main.append(offerCard(inv, r.now, true));
    if (r.recent.length) {
      main.append(h("h2", { class: "section", style: "margin-bottom:14px" }, "Respostas recentes"), h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, "Tour"), h("th", {}, "Situação"), h("th", {}, "Quando"))),
        h("tbody", {}, r.recent.map((x) => h("tr", {}, h("td", {}, `${fmt.date(x.slot_start)} ${fmt.time(x.slot_start)}`), h("td", {}, tag(x.status)),
          h("td", {}, fmt.dateTime(x.responded_at))))))));
    }
  }

  function decline(inv) {
    const reason = h("input", { type: "text", id: "motivo", placeholder: "Ex.: tenho aula neste horário" });
    const dlg = dialog("Recusar convite", h("div", {}, h("p", {}, "O convite vai para o próximo embaixador da fila."),
      h("div", { class: "field" }, h("label", { for: "motivo" }, "Motivo (opcional)"), reason)), [
      h("button", { class: "btn", onclick: () => dlg.close() }, "Voltar"),
      h("button", { class: "btn danger", onclick: async () => {
        try { await api("POST", `/api/ambassador/invitations/${inv.invitation_id}/decline`, { reason: reason.value }); dlg.close(); toast("Convite recusado."); render(); }
        catch (e) { toast(e.message, true); }
      } }, "Recusar")]);
  }

  function showQR(tour) {
    api("GET", `/api/ambassador/tours/${tour.group_id}/nps-qr`).then((r) => {
      const box = h("div", { class: "qr" });
      dialog("Avaliação do tour", h("div", {}, h("p", { style: "text-align:center" }, "Peça ao grupo para apontar a câmera do celular:"), box,
        h("p", { style: "text-align:center;word-break:break-all;font-size:13px" }, h("a", { href: r.url, target: "_blank" }, r.url))));
      if (window.QRCode) new QRCode(box, { text: r.url, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M });
      else box.append(h("p", { class: "muted" }, "Não foi possível gerar o QR (sem internet). Compartilhe o link abaixo."));
    }).catch((e) => toast(e.message, true));
  }

  function tourCard(t, opts = {}) {
    const marks = {};
    t.people.forEach((p) => { if (p.attended !== null) marks[p.booking_id] = p.attended; });
    const attendance = t.can_mark ? h("div", {}, h("h3", { style: "font-family:var(--sans);font-size:15px;margin:4px 0 0" }, "Lista de presença"),
      t.people.map((p) => {
        const seg = h("div", { class: "seg", role: "group", "aria-label": `Presença de ${p.first_name}` });
        const mk = (label, val) => h("button", { type: "button", "aria-pressed": marks[p.booking_id] === val ? "true" : "false", onclick: (e) => {
          marks[p.booking_id] = val;
          seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
          e.target.setAttribute("aria-pressed", "true");
        } }, label);
        seg.append(mk("Compareceu", true), mk("Não veio", false));
        return h("div", { class: "person" }, h("div", {}, h("strong", {}, p.first_name), h("div", { class: "muted", style: "font-size:14px" }, `${p.party_size} pessoa(s)`)), seg);
      }),
      h("div", { class: "btns", style: "margin-top:12px" },
        h("button", { class: "btn dark", onclick: async () => {
          const list = Object.entries(marks).map(([booking_id, attended]) => ({ booking_id: +booking_id, attended }));
          if (!list.length) return toast("Marque pelo menos uma pessoa.", true);
          try { await api("POST", `/api/ambassador/tours/${t.group_id}/attendance`, { marks: list }); toast("Presença registrada."); render(); }
          catch (e) { toast(e.message, true); }
        } }, "Salvar presença"),
        h("button", { class: "btn primary", onclick: () => showQR(t) }, "Mostrar QR do NPS"))) : null;
    return h("article", { class: "tour" },
      h("div", { class: "tour-head" }, h("span", { class: "chip-ico" }, I(t.is_today ? "pin" : "calendar", 22)),
        h("div", {}, h("div", { class: "when" }, `${t.date_label.split(",")[0]}, ${t.time_label}`), h("div", { class: "muted" }, `${t.date_label.split(",").slice(1).join(",").trim()} · ${t.people_count} pessoa(s)`)),
        h("div", { class: "tags" }, t.is_today ? h("span", { class: "tag yellow" }, "Hoje") : null, tag(t.status))),
      t.can_mark ? null : people(t.people),
      attendance,
      t.has_gift ? h("label", { class: "choice", style: "margin-top:12px" }, h("input", { type: "checkbox", checked: t.gift_collected ? true : null,
        onchange: async (e) => {
          try { await api("POST", `/api/ambassador/tours/${t.group_id}/gift-collected`, { collected: e.target.checked }); toast(e.target.checked ? "Retirada registrada." : "Retirada desmarcada."); }
          catch (err) { toast(err.message, true); }
        } }), "Retirei brinde e voucher de almoço") : null,
      !t.is_past && !opts.past ? h("div", { style: "margin-top:12px" }, h("button", { class: "btn ghost small", onclick: async () => {
        if (!(await confirmDialog("Desistir do tour", "O tour volta para a alocação automática e o reserva será chamado. Use só se não puder mesmo ir.", "Desistir", true))) return;
        try { await api("POST", `/api/ambassador/tours/${t.group_id}/withdraw`, { reason: "desistência pelo portal" }); toast("Desistência registrada. Obrigado por avisar."); render(); }
        catch (e) { toast(e.message, true); }
      } }, "Não vou conseguir conduzir")) : null);
  }

  async function tabTours(main) {
    const r = await api("GET", "/api/ambassador/tours");
    main.append(h("p", { class: "eyebrow" }, "Portal do embaixador"), h("h1", {}, "Meus tours"));
    if (r.pending_attendance.length) {
      main.append(h("div", { class: "notice warn" }, `Você tem ${r.pending_attendance.length} tour(s) com presença pendente.`));
      r.pending_attendance.forEach((t) => main.append(tourCard(t, { past: true })));
    }
    main.append(h("h2", { class: "section", style: "margin-bottom:14px" }, "Próximos"));
    if (!r.upcoming.length) main.append(h("div", { class: "empty" }, "Nenhum tour confirmado. Novos convites aparecem na aba Convites."));
    r.upcoming.forEach((t) => main.append(tourCard(t)));
    const past = r.past.filter((t) => !r.pending_attendance.find((p) => p.group_id === t.group_id));
    if (past.length) {
      main.append(h("h2", { class: "section", style: "margin-bottom:14px" }, "Anteriores"), h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, "Tour"), h("th", { class: "num" }, "Pessoas"), h("th", {}, "Situação"), h("th", {}, "Brinde e voucher"))),
        h("tbody", {}, past.map((t) => h("tr", {}, h("td", {}, `${t.date_label}, ${t.time_label}`), h("td", { class: "num" }, t.people_count),
          h("td", {}, tag(t.status)), h("td", {}, t.has_gift ? (t.gift_collected ? "Retirado" : "Pendente") : "—")))))));
    }
  }

  async function tabDisponibilidade(main) {
    const [r, me] = [await api("GET", "/api/ambassador/availability"), S.me];
    const grid = me.grid;
    const on = new Set(r.rules.map((x) => `${x.weekday}|${x.start_time}`));
    const excs = r.exceptions.slice();
    main.append(h("p", { class: "eyebrow" }, "Portal do embaixador"), h("h1", {}, "Minha disponibilidade"),
      me.availability_stale ? h("div", { class: "notice warn" }, "Sua disponibilidade não é atualizada há mais de 30 dias. Confira e salve para continuar recebendo convites.") : null,
      h("p", { class: "muted" }, "Marque os horários em que você pode conduzir tours toda semana. Os convites só chegam nesses horários."));
    const table = h("table", { class: "avail-grid" },
      h("thead", {}, h("tr", {}, h("th", {}, ""), grid.weekdays.map((w) => h("th", { scope: "col" }, WD[w])))),
      h("tbody", {}, grid.start_times.map((t) => h("tr", {}, h("th", { scope: "row" }, fmt.hhmm(t)),
        grid.weekdays.map((w) => h("td", {}, h("input", { type: "checkbox", "aria-label": `${WD[w]} ${fmt.hhmm(t)}`, checked: on.has(`${w}|${t}`) ? true : null,
          onchange: (e) => e.target.checked ? on.add(`${w}|${t}`) : on.delete(`${w}|${t}`) })))))));
    main.append(h("div", { class: "card" }, h("h2", {}, "Semana padrão"), h("div", { style: "overflow-x:auto" }, table)));

    const excList = h("div", {});
    const drawExc = () => {
      clear(excList);
      if (!excs.length) excList.append(h("p", { class: "muted" }, "Nenhuma exceção cadastrada."));
      excs.forEach((e, i) => excList.append(h("div", { class: "person" },
        h("span", {}, `${fmt.date(e.date + "T12:00:00-03:00")} · ${e.start_time ? fmt.hhmm(e.start_time) : "dia todo"} · `,
          h("strong", {}, e.available ? "disponível" : "indisponível")),
        h("button", { class: "btn small", onclick: () => { excs.splice(i, 1); drawExc(); } }, "Remover"))));
    };
    drawExc();
    const d = h("input", { type: "date", id: "ex-date", min: new Date().toISOString().slice(0, 10) });
    const t = h("select", { id: "ex-time" }, h("option", { value: "" }, "Dia todo"), grid.start_times.map((x) => h("option", { value: x }, fmt.hhmm(x))));
    const a = h("select", { id: "ex-av" }, h("option", { value: "0" }, "Indisponível"), h("option", { value: "1" }, "Disponível"));
    main.append(h("div", { class: "card" }, h("h2", {}, "Exceções por data"),
      h("p", { class: "muted" }, "Provas, viagens ou um horário extra em que você pode ajudar."),
      excList,
      h("div", { class: "toolbar", style: "margin-top:12px" },
        h("div", { class: "field" }, h("label", { for: "ex-date" }, "Data"), d),
        h("div", { class: "field" }, h("label", { for: "ex-time" }, "Horário"), t),
        h("div", { class: "field" }, h("label", { for: "ex-av" }, "Situação"), a),
        h("button", { class: "btn", onclick: () => { if (!d.value) return toast("Escolha a data.", true); excs.push({ date: d.value, start_time: t.value || null, available: a.value === "1" }); drawExc(); } }, "Adicionar"))),
      h("div", { class: "btns", style: "margin-top:16px" }, h("button", { class: "btn primary", onclick: async () => {
        try {
          await api("PUT", "/api/ambassador/availability", { rules: [...on].map((k) => { const [weekday, start_time] = k.split("|"); return { weekday: +weekday, start_time }; }), exceptions: excs });
          S.me = await api("GET", "/api/ambassador/me");
          toast("Disponibilidade salva.");
          render();
        } catch (e) { toast(e.message, true); }
      } }, "Salvar disponibilidade"), r.updated_at ? h("span", { class: "muted" }, "Atualizada em " + fmt.dateTime(r.updated_at)) : null));
  }

  async function tabPerfil(main) {
    const me = S.me, a = me.ambassador;
    const course = h("select", { id: "p-course" }, h("option", { value: "" }, "—"), me.courses.map((c) => h("option", { value: c, selected: a.course === c ? true : null }, c)));
    const phone = h("input", { type: "tel", id: "p-phone", value: a.phone || "", oninput: (e) => { e.target.value = T.maskPhone(e.target.value); } });
    const langs = new Set(a.languages);
    main.append(h("p", { class: "eyebrow" }, "Portal do embaixador"), h("h1", {}, "Perfil"), h("div", { class: "card narrow" },
      h("p", {}, h("strong", {}, a.display_name), h("br"), h("span", { class: "muted" }, me.email)),
      h("div", { class: "field" }, h("label", { for: "p-course" }, "Seu curso"), course, h("div", { class: "hint" }, "Ajuda a combinar você com candidatos do mesmo curso.")),
      h("fieldset", { class: "field" }, h("legend", {}, "Idiomas em que você conduz o tour"), me.languages.map((l) => h("label", { class: "choice" },
        h("input", { type: "checkbox", checked: langs.has(l) ? true : null, onchange: (e) => e.target.checked ? langs.add(l) : langs.delete(l) }), l))),
      h("div", { class: "field" }, h("label", { for: "p-phone" }, "Telefone (para contato de Admissões)"), phone),
      h("button", { class: "btn primary", onclick: async () => {
        try {
          await api("PUT", "/api/ambassador/profile", { course: course.value, languages: [...langs], phone: phone.value, notify_prefs: { email: true } });
          S.me = await api("GET", "/api/ambassador/me");
          toast("Perfil salvo.");
        } catch (e) { toast(e.message, true); }
      } }, "Salvar")));
  }

  // Níveis e benefícios. Hoje só existem brinde e voucher; os demais são exemplos para Admissões validar.
  const LEVELS = [
    { name: "Bronze", min: 0, color: "#D29A68", perks: ["Brinde e voucher de almoço a cada tour"] },
    { name: "Prata", min: 60, color: "#C3CDD6", perks: ["Certificado de horas complementares"] },
    { name: "Ouro", min: 160, color: "#FFCC00", perks: ["Recebe convites antes dos demais", "Kit Insper exclusivo"] },
    { name: "Diamante", min: 320, color: "#8FD8FF", perks: ["Carta de recomendação de Admissões", "Convite para eventos do Insper"] },
  ];
  const levelOf = (n) => LEVELS.filter((l) => n >= l.min).pop();
  const BADGES = [
    ["award", "Primeiro tour", "1 tour conduzido", (s) => s.tours_total >= 1],
    ["trophy", "10 tours", "10 tours conduzidos", (s) => s.tours_total >= 10],
    ["users", "50 visitantes", "50 pessoas recebidas", (s) => s.people_total >= 50],
    ["star", "Nota 5", "avaliação máxima de um candidato", (s) => s.five_stars >= 1],
    ["zap", "Resposta rápida", "3 convites aceitos em até 1h", (s) => s.fast_accepts >= 3],
    ["globe", "Poliglota", "tour em outro idioma", (s) => s.foreign_tours >= 1],
    ["flame", "Mês cheio", "4 tours no mesmo mês", (s) => s.tours_month >= 4],
    ["check-circle", "Presença em dia", "nenhuma presença pendente", (s) => s.tours_total >= 3 && !s.pending_presence],
  ];
  const I = T.icon;

  function offerCard(inv, nowIso, withPeople) {
    const left = new Date(inv.expires_at) - new Date(nowIso);
    const hrs = Math.max(0, Math.floor(left / 3600000)), mins = Math.max(0, Math.floor((left % 3600000) / 60000));
    const chips = [h("span", { class: "chip" }, I("users", 14), `${inv.people_count} pessoa${inv.people_count > 1 ? "s" : ""}`)]
      .concat([...new Set(inv.people.map((p) => p.course_interest))].map((c) => h("span", { class: "chip" }, c)))
      .concat(inv.people.some((p) => p.mobility_restriction) ? [h("span", { class: "chip warn" }, I("alert", 14), "locomoção")] : [])
      .concat([...new Set(inv.people.filter((p) => p.language !== "Português").map((p) => p.language))].map((l) => h("span", { class: "chip" }, I("globe", 14), l)));
    return h("div", { class: "offer" },
      h("div", { class: "offer-top" }, h("div", { class: "chip-ico red" }, I("bell", 22)),
        h("div", {}, h("div", { class: "when" }, `${inv.date_label.split(",")[0]}, ${inv.time_label}`), h("div", { class: "muted" }, inv.date_label.split(",").slice(1).join(",").trim())),
        ring(left / (12 * 3600000), hrs ? `${hrs}h${String(mins).padStart(2, "0")}` : `${mins} min`)),
      h("div", { class: "chips" }, chips),
      withPeople ? h("div", { class: "people" }, people(inv.people)) : null,
      h("div", { class: "btns" }, h("button", { class: "btn primary", onclick: () => acceptInvite(inv) }, I("check", 18), "Aceitar"),
        h("button", { class: "btn", onclick: () => decline(inv) }, "Recusar")));
  }

  async function acceptInvite(inv) {
    try { await api("POST", `/api/ambassador/invitations/${inv.invitation_id}/accept`); toast("Tour aceito! O candidato já recebeu seu nome."); render(); }
    catch (e) { toast(e.message, true); render(); }
  }

  function ring(fraction, label) {
    const r = 26, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, fraction));
    return h("div", { class: "ring", "aria-label": label },
      h("span", { html: `<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="6"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${f < .25 ? "var(--red)" : "var(--ink)"}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}"/></svg>` }),
      h("span", {}, label));
  }

  async function claimTour(o) {
    try { await api("POST", `/api/ambassador/opportunities/${o.group_id}/claim`); toast("Tour assumido. O grupo já recebeu seu nome."); render(); }
    catch (e) { toast(e.message, true); render(); }
  }
  async function addHot(o) {
    try { await api("POST", "/api/ambassador/availability/add", { date: o.date, start_time: o.time }); toast("Disponibilidade adicionada. Os próximos convites desse horário podem vir para você."); render(); }
    catch (e) { toast(e.message, true); }
  }

  async function tabInicio(main) {
    const [st, inv, tours, opp] = await Promise.all([api("GET", "/api/ambassador/stats"), api("GET", "/api/ambassador/invitations"),
      api("GET", "/api/ambassador/tours"), api("GET", "/api/ambassador/opportunities")]);
    const g = st.game, pts = g.points;
    const lvl = levelOf(pts), next = LEVELS[LEVELS.indexOf(lvl) + 1];
    const pct = next ? Math.round(100 * (pts - lvl.min) / (next.min - lvl.min)) : 100;

    // 1. nível (Uber Pro / Nomad Pass)
    main.append(h("div", { class: "tier", style: `--tier-c:${lvl.color}` },
      h("div", { class: "tier-head" }, h("div", { class: "tier-medal" }, I("award", 28)),
        h("div", {}, h("div", { class: "tier-sub" }, "Seu nível neste semestre"), h("div", { class: "tier-name" }, `Embaixador ${lvl.name}`)),
        h("div", { class: "tier-count" }, h("b", {}, pts), h("span", {}, "pontos"))),
      h("div", { class: "tier-bar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Progresso até o próximo nível" }, h("span", { style: `width:${pct}%` })),
      h("div", { class: "tier-foot" }, next ? h("span", {}, "Faltam ", h("strong", {}, `${next.min - pts} pontos`), ` para ${next.name}`) : h("span", {}, "Nível máximo"),
        h("span", {}, next ? `Próximo benefício: ${next.perks[0]}` : "Obrigado por receber tantos candidatos"))));

    // 2. convite novo
    const first = inv.invitations[0];
    if (first) main.append(h("section", { class: "section" }, h("div", { class: "sh" }, h("h2", {}, "Novo convite"), inv.invitations.length > 1 ? h("span", { class: "count-badge" }, inv.invitations.length) : null), offerCard(first, inv.now)));

    // 3. oportunidades (tela de corridas do Uber)
    if (opp.claimable.length || opp.hot.length) {
      main.append(h("section", { class: "section" }, h("div", { class: "sh" }, h("h2", {}, "Oportunidades"), h("span", { class: "muted" }, "Pontos extras em horários em alta")),
        h("div", { class: "ilist" },
          opp.claimable.slice(0, 3).map((o) => h("div", { class: "irow" },
            h("span", { class: "ibadge red" }, I("alert", 18)),
            h("span", { class: "itext" }, h("strong", {}, `${fmt.dateLong(o.slot_start)}, ${fmt.time(o.slot_start)}`), h("small", {}, `Grupo sem embaixador · ${o.people} pessoa(s) · ${o.courses.join(", ")}`)),
            h("span", { class: "pts" }, `+${g.rules.tour + (o.hot ? g.rules.hot : 0)} pts`),
            h("button", { class: "btn small primary", onclick: () => claimTour(o) }, "Assumir"))),
          opp.hot.map((o) => h("div", { class: "irow" },
            h("span", { class: "ibadge amber" }, I("flame", 18)),
            h("span", { class: "itext" }, h("strong", {}, `${fmt.dateLong(o.slot_start)}, ${fmt.hhmm(o.time)}`), h("small", {}, `Horário em alta · ${o.booked} pessoa(s) já agendada(s)`)),
            h("span", { class: "pts" }, `+${g.rules.hot} bônus`),
            h("button", { class: "btn small", onclick: () => addHot(o) }, "Ficar disponível"))))));
    }

    // 4. sua semana (sequência do Duolingo + números)
    main.append(h("section", { class: "section" }, h("div", { class: "sh" }, h("h2", {}, "Seu ritmo")),
      h("div", { class: "grid-2" },
        h("div", { class: "streak" + (g.streak ? "" : " zero") },
          h("span", { class: "streak-ico" }, I("flame", 30)),
          h("div", {}, h("div", { class: "streak-n" }, g.streak, h("span", {}, g.streak === 1 ? " semana" : " semanas")),
            h("div", { class: "muted", style: "font-size:14px" }, g.this_week ? "Esta semana já conta. Continue assim!" : g.streak ? "Faça um tour esta semana para não perder a sequência." : "Conduza um tour esta semana para começar uma sequência."))),
        h("div", { class: "grid-2", style: "gap:12px" },
          h("div", { class: "tile" }, h("span", { class: "lbl" }, I("calendar", 16), "Tours no mês"), h("span", { class: "big" }, st.tours_month)),
          h("div", { class: "tile" }, h("span", { class: "lbl" }, I("users", 16), "Pessoas recebidas"), h("span", { class: "big" }, st.people_total)),
          h("div", { class: "tile" }, h("span", { class: "lbl" }, I("check", 16), "Convites aceitos"), h("span", { class: "big" }, st.accept_rate === null ? "—" : st.accept_rate + "%")),
          h("div", { class: "tile" }, h("span", { class: "lbl" }, I("star", 16), "Nota média"), h("span", { class: "big" }, st.rating_avg === null ? "—" : fmt.num(st.rating_avg)))))));

    // 5. desafios do mês (missões das plataformas de embaixadores)
    main.append(h("section", { class: "section" }, h("div", { class: "sh" }, h("h2", {}, "Desafios do mês"), h("span", { class: "muted" }, `${g.challenges.filter((c) => c.progress >= c.goal).length} de ${g.challenges.length} concluídos`)),
      h("div", { class: "challenges" }, g.challenges.map((c) => {
        const done = c.progress >= c.goal;
        return h("div", { class: "challenge" + (done ? " done" : "") },
          h("span", { class: "ch-ico" }, I(done ? "check" : c.id === "hot1" ? "flame" : c.id === "fast2" ? "zap" : "calendar", 18)),
          h("div", { class: "ch-main" }, h("strong", {}, c.title),
            h("div", { class: "ch-bar" }, h("span", { style: `width:${Math.min(100, (100 * c.progress) / c.goal)}%` })),
            h("small", {}, done ? "Concluído" : `${Math.min(c.progress, c.goal)} de ${c.goal}`)),
          h("span", { class: "pts" }, `+${c.reward} pts`));
      }))));

    // 6. requisitos para manter o nível (Airbnb Superhost)
    const req = [
      ["Aceite de convites", st.accept_rate === null ? "—" : `${st.accept_rate}%`, "mínimo 80%", st.accept_rate === null || st.accept_rate >= 80],
      ["Nota dos candidatos", st.rating_avg === null ? "sem notas" : fmt.num(st.rating_avg), "mínimo 4,5", st.rating_avg === null || st.rating_avg >= 4.5],
      ["Presença registrada", st.pending_presence ? `${st.pending_presence} pendente(s)` : "em dia", "nenhuma pendência", !st.pending_presence],
    ];
    main.append(h("section", { class: "section grid-2" },
      h("div", {}, h("div", { class: "sh" }, h("h2", {}, "Para manter o nível")),
        h("div", { class: "ilist" }, req.map(([t, v, goal, ok]) => h("div", { class: "irow info" },
          h("span", { class: "ibadge " + (ok ? "green" : "red") }, I(ok ? "check" : "alert", 18)),
          h("span", { class: "itext" }, h("strong", {}, t), h("small", {}, goal)), h("span", { class: "icount", style: "font-size:16px" }, v)))),
        h("p", { class: "muted", style: "font-size:13px;margin:10px 4px 0" }, "O nível é recalculado a cada semestre.")),
      h("div", {}, h("div", { class: "sh" }, h("h2", {}, "Como ganhar pontos")),
        h("div", { class: "ilist" }, [
          ["pin", "Tour conduzido", `+${g.rules.tour}`, g.parts.tours], ["flame", "Tour em horário em alta", `+${g.rules.hot}`, g.parts.hot],
          ["zap", "Aceite em até 1 hora", `+${g.rules.fast}`, g.parts.fast], ["star", "Nota 5 de um candidato", `+${g.rules.five}`, g.parts.five],
        ].map(([ic, t, v, total]) => h("div", { class: "irow info" }, h("span", { class: "ibadge gray" }, I(ic, 18)),
          h("span", { class: "itext" }, h("strong", {}, t), h("small", {}, `${total} pts neste semestre`)), h("span", { class: "pts" }, `${v} pts`)))))));

    // 7. benefícios por nível (Nomad Pass)
    main.append(h("section", { class: "section" }, h("div", { class: "sh" }, h("h2", {}, "Benefícios")),
      h("div", { class: "ladder" }, LEVELS.map((l) => {
        const reached = pts >= l.min, current = l === lvl;
        return h("div", { class: "rung" + (reached ? "" : " locked") + (current ? " current" : ""), style: `--tier-c:${l.color}` },
          h("span", { class: "medal" }, I(reached ? "award" : "lock", 18)),
          h("div", {}, h("strong", {}, l.name), h("span", { class: "muted", style: "font-size:13px" }, l.min ? ` · a partir de ${l.min} pts` : " · desde o primeiro tour"), h("ul", {}, l.perks.map((p) => h("li", {}, p)))),
          current ? h("span", { class: "pill ok" }, "Seu nível") : reached ? h("span", { class: "pill none" }, I("check", 12), "liberado") : h("span", { class: "pill none" }, `faltam ${l.min - pts} pts`));
      })),
      h("p", { class: "muted", style: "font-size:13px;margin-top:10px" }, "Benefícios além do brinde e do voucher são exemplos para Admissões definir.")));

    // 8. conquistas
    const earned = BADGES.filter((b) => b[3](st)).length;
    main.append(h("section", { class: "section" }, h("div", { class: "sh" }, h("h2", {}, "Conquistas"), h("span", { class: "muted" }, `${earned} de ${BADGES.length}`)),
      h("div", { class: "badges" }, BADGES.map(([ic, title, how, test]) => h("div", { class: "badge" + (test(st) ? "" : " off") },
        h("span", { class: "bi" }, I(test(st) ? ic : "lock", 20)), h("strong", {}, title), h("small", {}, how))))));
  }

  const TABS = [["inicio", "Início", tabInicio], ["convites", "Convites", tabConvites], ["tours", "Meus tours", tabTours], ["disponibilidade", "Disponibilidade", tabDisponibilidade], ["perfil", "Perfil", tabPerfil]];

  async function render() {
    try { S.invites = (await api("GET", "/api/ambassador/invitations")).invitations.length; } catch (e) { /* mantém o valor anterior */ }
    clear(app);
    const tabs = h("div", { class: "tabs", role: "tablist" }, TABS.map(([id, label]) => h("button", { role: "tab", "aria-selected": S.tab === id ? "true" : "false",
      onclick: () => { S.tab = id; location.hash = id; render(); } }, label, id === "convites" && S.invites ? h("span", { class: "count" }, S.invites) : null,
      id === "disponibilidade" && S.me.availability_stale ? h("span", { class: "count" }, "!") : null)));
    const main = h("div", { role: "tabpanel" }, h("p", { class: "loading" }, "Carregando…"));
    app.append(tabs, main);
    try {
      const fn = TABS.find((t) => t[0] === S.tab)[2];
      const tmp = h("div");
      await fn(tmp);
      clear(main).append(...tmp.childNodes);
    } catch (e) { clear(main).append(h("div", { class: "notice error" }, e.message)); }
  }

  (async () => {
    S.me = await api("GET", "/api/ambassador/me");
    document.getElementById("who").textContent = S.me.ambassador.display_name;
    window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== S.tab) { S.tab = id; render(); } });
    render();
  })().catch((e) => clear(app).append(h("div", { class: "notice error" }, e.message)));
})();

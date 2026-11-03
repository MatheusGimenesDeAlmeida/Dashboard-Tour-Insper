/* /agendar — 3 passos: horário → dados → confirmação. Com ?reagendar=<token>, reaproveita o calendário para reagendar. */
(function () {
  const { api, h, clear, fmt, toast, maskCPF, cpfValid, maskPhone, addDays } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Visite o campus", [h("a", { href: "/" }, "Início")]));

  const params = new URLSearchParams(location.search);
  const rescheduleToken = params.get("reagendar");
  const S = { cfg: null, party: 1, slots: [], selected: null, day: null, booking: null, form: {}, errors: {} };

  function steps(n) {
    const labels = rescheduleToken ? ["Novo horário", "Confirmação"] : ["Data e horário", "Seus dados", "Confirmação"];
    return h("ol", { class: "steps", "aria-label": "Etapas" }, labels.map((l, i) =>
      h("li", { class: i + 1 === n ? "on" : (i + 1 < n ? "done" : ""), "aria-current": i + 1 === n ? "step" : null },
        h("span", { class: "n" }, i + 1), h("span", {}, l))));
  }

  async function loadSlots() {
    const from = S.cfg.today;
    const to = addDays(from, S.cfg.max_days_ahead);
    const q = new URLSearchParams({ from, to, party: S.party });
    if (rescheduleToken) q.set("token", rescheduleToken);
    const data = await api("GET", "/api/public/slots?" + q);
    S.slots = data.slots;
    if (S.selected && !S.slots.find((s) => s.slot_start === S.selected.slot_start && s.available)) S.selected = null;
  }

  const I = T.icon;
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function slotLabel(s) {
    if (s.reason) return "bloqueado";
    if (s.remaining <= 0) return "esgotado";
    if (!s.available) return `sem espaço p/ ${S.party}`;
    return `${s.remaining} ${s.remaining === 1 ? "vaga" : "vagas"}`;
  }

  function days() {
    const map = new Map();
    for (const s of S.slots) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return [...map.entries()].map(([date, slots]) => ({ date, slots, any: slots.some((x) => x.available) }));
  }

  function step1() {
    const ds = days();
    if (!S.day || !ds.find((d) => d.date === S.day && d.any)) S.day = (ds.find((d) => d.any) || {}).date;
    const day = ds.find((d) => d.date === S.day);
    const setParty = async (n) => { S.party = n; await loadSlots(); render(); };
    const partyLabel = S.party === 1 ? "Só eu" : `${S.party} pessoas`;
    return [
      h("p", { class: "eyebrow" }, rescheduleToken ? `Reagendar · ${S.booking.protocol}` : "Visite o campus"),
      h("h1", {}, rescheduleToken ? "Escolha o novo horário" : "Agende sua visita"),
      h("p", { class: "lead" }, rescheduleToken ? `Visita atual: ${S.booking.date_label}, às ${S.booking.time_label}.`
        : "Tour de cerca de 1 hora com um aluno embaixador. Não precisa estar inscrito no vestibular."),
      steps(1),
      h("div", { class: "group" },
        h("h2", {}, I("users", 20), "Quantas pessoas vêm?"),
        h("div", { class: "stepper", role: "group", "aria-label": "Número de pessoas, contando com você" },
          h("button", { type: "button", "aria-label": "Menos uma pessoa", disabled: S.party <= 1 || rescheduleToken ? true : null, onclick: () => setParty(S.party - 1) }, "−"),
          h("output", { id: "party", "aria-live": "polite" }, partyLabel),
          h("button", { type: "button", "aria-label": "Mais uma pessoa", disabled: S.party >= S.cfg.group_capacity || rescheduleToken ? true : null, onclick: () => setParty(S.party + 1) }, "+")),
        h("p", { class: "muted", style: "margin:10px 0 0;font-size:14px" }, `Contando com você. Até ${S.cfg.group_capacity} pessoas por tour.`)),
      h("div", { class: "group" },
        h("h2", {}, I("calendar", 20), "Escolha o dia"),
        ds.length ? h("div", { class: "dates", role: "listbox", "aria-label": "Dias disponíveis" }, ds.map((d) => {
          const dt = new Date(d.date + "T12:00:00Z");
          return h("button", { class: "date", type: "button", role: "option", disabled: !d.any, "aria-pressed": d.date === S.day ? "true" : "false", "aria-selected": d.date === S.day ? "true" : "false",
            "aria-label": `${fmt.weekdayShort(d.date)}, ${fmt.dayMonth(d.date)}${d.any ? "" : ", sem vagas"}`, onclick: () => { S.day = d.date; S.selected = null; render(); } },
            h("span", { class: "wd" }, fmt.weekdayShort(d.date)), h("span", { class: "dn" }, dt.getUTCDate()), h("span", { class: "mo" }, MONTHS[dt.getUTCMonth()]), h("span", { class: "dot" }));
        })) : h("div", { class: "empty" }, "Não há horários abertos no momento."),
        day ? [h("h2", { style: "margin-top:20px" }, I("clock", 20), "Escolha o horário"),
          h("div", { class: "times" }, day.slots.map((s) => {
            const pressed = S.selected && S.selected.slot_start === s.slot_start;
            return h("button", { class: "slot", type: "button", disabled: !s.available, "aria-pressed": pressed ? "true" : "false",
              "aria-label": `${fmt.hhmm(s.time)}: ${slotLabel(s)}`, onclick: () => { S.selected = s; render(); document.getElementById("continuar")?.focus(); } },
              h("span", { class: "t" }, fmt.hhmm(s.time)), h("span", { class: "v" }, slotLabel(s)));
          }))] : null),
      h("div", { class: "bottom-bar" },
        h("div", {}, S.selected ? [h("strong", {}, `${fmt.dateLong(S.selected.slot_start)}, ${fmt.hhmm(S.selected.time)}`), h("small", {}, partyLabel)]
          : [h("strong", {}, "Escolha um horário"), h("small", {}, "Só aparecem horários com vaga para o seu grupo")]),
        h("button", { id: "continuar", class: "btn primary", disabled: !S.selected, onclick: () => rescheduleToken ? doReschedule() : (S.step = 2, render(), window.scrollTo(0, 0)) },
          rescheduleToken ? "Confirmar novo horário" : "Continuar", I("arrow", 18))),
      !rescheduleToken ? h("p", { class: "muted", style: "margin-top:20px;text-align:center" }, "Prefere conhecer agora? ",
        h("a", { href: S.cfg.virtual_tour_url, target: "_blank", rel: "noopener" }, "Faça o tour virtual")) : null,
    ];
  }

  function field(name, label, input, opts = {}) {
    if ((S.cfg.hidden_fields || []).includes(name)) return null;
    const err = S.errors[name];
    if (input.tagName === "INPUT" || input.tagName === "SELECT" || input.tagName === "TEXTAREA") {
      input.id = input.id || "f-" + name;
      input.setAttribute("aria-invalid", err ? "true" : "false");
      if (err) input.setAttribute("aria-describedby", "e-" + name);
    }
    return h("div", { class: "field" + (err ? " invalid" : "") },
      h("label", { for: input.id || null }, label, opts.required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null),
      input, opts.hint ? h("div", { class: "hint" }, opts.hint) : null, err ? h("div", { class: "err", id: "e-" + name }, err) : null);
  }

  function bind(name, transform) {
    return (e) => {
      let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      if (transform) { v = transform(v); e.target.value = v; }
      S.form[name] = v;
      if (S.errors[name]) { delete S.errors[name]; }
    };
  }

  function validateLocal() {
    const f = S.form, e = {};
    if ((f.full_name || "").trim().split(/\s+/).length < 2) e.full_name = "Informe nome e sobrenome.";
    if (!cpfValid(f.cpf || "")) e.cpf = "CPF inválido. Confira os números.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test((f.email || "").trim())) e.email = "E-mail inválido.";
    else if ((f.email || "").trim().toLowerCase() !== (f.email_confirm || "").trim().toLowerCase()) e.email_confirm = "Os e-mails não conferem.";
    const ph = (f.phone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (ph.length < 10 || ph.length > 11) e.phone = "Informe o celular com DDD.";
    if (!f.course_interest) e.course_interest = "Escolha o curso de interesse.";
    if (f.is_treineiro === undefined) e.is_treineiro = "Informe se você é treineiro.";
    if (!f.privacy_accepted) e.privacy_accepted = "É preciso aceitar o aviso de privacidade.";
    if ((f.questions || "").length > 500) e.questions = "Use até 500 caracteres.";
    return e;
  }

  function step2() {
    const f = S.form;
    const companions = S.party - 1;
    const yesNo = (name, label) => {
      const err = S.errors[name];
      return h("fieldset", { class: "field" + (err ? " invalid" : ""), "aria-describedby": err ? "e-" + name : null },
        h("legend", {}, label, h("span", { class: "req", "aria-hidden": "true" }, " *")),
        [["Sim", true], ["Não", false]].map(([l, v]) => h("label", { class: "choice" },
          h("input", { type: "radio", name, checked: f[name] === v ? true : null, onchange: () => { f[name] = v; delete S.errors[name]; } }), l)),
        err ? h("div", { class: "err", id: "e-" + name }, err) : null);
    };
    const form = h("form", { novalidate: true, onsubmit: submit },
      h("input", { class: "hp", type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", oninput: bind("website") }),
      h("div", { class: "group" }, h("h2", {}, I("user", 20), "Seus dados"),
      field("full_name", "Nome completo", h("input", { type: "text", autocomplete: "name", value: f.full_name || "", oninput: bind("full_name") }), { required: true }),
      h("div", { class: "grid2" },
        field("cpf", "CPF", h("input", { type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "000.000.000-00", value: f.cpf || "", oninput: bind("cpf", maskCPF) }),
          { required: true, hint: "Obrigatório por segurança durante o tour." }),
        field("phone", "Celular com DDD", h("input", { type: "tel", autocomplete: "tel", placeholder: "(11) 91234-5678", value: f.phone || "", oninput: bind("phone", maskPhone) }), { required: true })),
      h("div", { class: "grid2" },
        field("email", "E-mail", h("input", { type: "email", autocomplete: "email", value: f.email || "", oninput: bind("email") }), { required: true }),
        field("email_confirm", "Confirme o e-mail", h("input", { type: "email", autocomplete: "off", value: f.email_confirm || "", oninput: bind("email_confirm"), onpaste: (e) => e.preventDefault() }), { required: true }))),
      h("div", { class: "group" }, h("h2", {}, I("calendar", 20), "Sobre a visita"),
      field("course_interest", "Curso de interesse", h("select", { onchange: bind("course_interest") },
        h("option", { value: "" }, "Selecione…"), S.cfg.courses.map((c) => h("option", { value: c, selected: f.course_interest === c ? true : null }, c))), { required: true }),
      yesNo("is_treineiro", "Você é treineiro (vai prestar o vestibular só para treinar)?"),
      companions > 0 && !(S.cfg.hidden_fields || []).includes("companions_names") ? h("fieldset", { class: "field" },
        h("legend", {}, `Nome dos acompanhantes (opcional) — ${companions} pessoa${companions > 1 ? "s" : ""}`),
        Array.from({ length: companions }, (_, i) => h("input", { type: "text", "aria-label": `Acompanhante ${i + 1}`, style: "margin-bottom:8px",
          value: (f.companions_names || [])[i] || "", oninput: (e) => { f.companions_names = f.companions_names || []; f.companions_names[i] = e.target.value; } })),
        h("div", { class: "hint" }, "Para mudar o número de pessoas, volte ao passo anterior.")) : null,
      !(S.cfg.hidden_fields || []).includes("mobility") ? h("fieldset", { class: "field" },
        h("legend", {}, "Alguém do grupo tem restrição de locomoção?"),
        [["Sim", true], ["Não", false]].map(([l, v]) => h("label", { class: "choice" },
          h("input", { type: "radio", name: "mobility", checked: !!f.mobility_restriction === v ? true : null, onchange: () => { f.mobility_restriction = v; render(); } }), l)),
        f.mobility_restriction ? h("input", { type: "text", "aria-label": "Conte o que precisamos saber", placeholder: "Conte o que precisamos saber (opcional)",
          value: f.mobility_notes || "", oninput: bind("mobility_notes") }) : null) : null,
      S.cfg.languages.length > 1 ? field("language", "Idioma do tour", h("select", { onchange: bind("language") },
        S.cfg.languages.map((l) => h("option", { value: l, selected: (f.language || "Português") === l ? true : null }, l))),
        { hint: "Outros idiomas dependem da disponibilidade dos embaixadores." }) : null,
      field("questions", "Dúvidas ou interesses para o tour (opcional)", h("textarea", { maxlength: "500", oninput: bind("questions") }, f.questions || ""),
        { hint: "Ajuda o embaixador a preparar a visita. Até 500 caracteres." })),
      h("div", { class: "group" }, h("h2", {}, I("shield", 20), "Avisos e privacidade"),
      !(S.cfg.hidden_fields || []).includes("whatsapp_opt_in") ? h("div", { class: "field" }, h("label", { class: "choice" },
        h("input", { type: "checkbox", checked: f.whatsapp_opt_in ? true : null, onchange: bind("whatsapp_opt_in") }),
        "Quero receber avisos da visita também por WhatsApp")) : null,
      h("div", { class: "field" + (S.errors.privacy_accepted ? " invalid" : "") }, h("label", { class: "choice" },
        h("input", { type: "checkbox", checked: f.privacy_accepted ? true : null, onchange: bind("privacy_accepted"),
          "aria-describedby": S.errors.privacy_accepted ? "e-privacy_accepted" : null }),
        h("span", {}, "Li e aceito o ", h("a", { href: S.cfg.privacy_url, target: "_blank", rel: "noopener" }, "aviso de privacidade"),
          ". Os dados são usados para organizar a visita e o contato de Admissões.", h("span", { class: "req", "aria-hidden": "true" }, " *"))),
        S.errors.privacy_accepted ? h("div", { class: "err", id: "e-privacy_accepted" }, S.errors.privacy_accepted) : null)),
      S.formError ? h("div", { class: "notice error", role: "alert" }, S.formError) : null,
      h("div", { class: "bottom-bar" },
        h("div", {}, h("strong", {}, `${fmt.dateLong(S.selected.slot_start)}, ${fmt.hhmm(S.selected.time)}`), h("small", {}, `${S.party} pessoa${S.party > 1 ? "s" : ""}`)),
        h("div", { class: "btns" },
          h("button", { class: "btn", type: "button", onclick: () => { S.step = 1; S.formError = null; render(); } }, "Voltar"),
          h("button", { class: "btn primary", type: "submit", id: "enviar" }, "Confirmar agendamento"))));
    return [h("p", { class: "eyebrow" }, "Visite o campus"), h("h1", {}, "Seus dados"), steps(2), form];
  }

  async function submit(e) {
    e.preventDefault();
    S.errors = validateLocal();
    S.formError = null;
    if (Object.keys(S.errors).length) {
      render();
      const first = document.querySelector(".field.invalid input, .field.invalid select, .field.invalid textarea");
      if (first) first.focus();
      return;
    }
    const btn = document.getElementById("enviar");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const f = S.form;
      S.result = await api("POST", "/api/public/bookings", {
        slot_start: S.selected.slot_start, full_name: f.full_name, cpf: f.cpf, email: f.email, email_confirm: f.email_confirm, phone: f.phone,
        course_interest: f.course_interest, is_treineiro: f.is_treineiro, companions: S.party - 1, companions_names: f.companions_names || [],
        mobility_restriction: !!f.mobility_restriction, mobility_notes: f.mobility_notes || "", language: f.language || "Português",
        questions: f.questions || "", privacy_accepted: !!f.privacy_accepted, whatsapp_opt_in: !!f.whatsapp_opt_in, website: f.website || "",
      });
      S.step = 3;
      render();
      window.scrollTo(0, 0);
    } catch (err) {
      if (err.code === "esgotado" || err.code === "horario_invalido") {
        await loadSlots();
        S.step = 1;
        render();
        toast(err.message, true);
        return;
      }
      S.errors = err.fields || {};
      S.formError = err.message;
      render();
      document.querySelector(".notice.error")?.focus();
    }
  }

  function step3() {
    const r = S.result;
    return [
      h("div", { class: "success" }, h("div", { class: "check" }, I("check", 40)),
        h("h1", { tabindex: "-1", id: "ok-title" }, rescheduleToken ? "Visita reagendada" : "Visita agendada"),
        h("p", {}, rescheduleToken ? "Mandamos os novos detalhes por e-mail." : "Mandamos tudo por e-mail. Você recebe o nome do embaixador assim que ele confirmar.")),
      h("div", { class: "narrow", style: "margin:0 auto" },
        h("div", { class: "ticket" },
          h("div", { class: "ticket-top" }, h("span", { class: "eyebrow", style: "margin:0" }, "Tour no campus do Insper"),
            h("div", { class: "when" }, `${r.date_label.split(",")[0]}, ${r.time_label}`),
            h("div", { class: "sub" }, r.date_label.split(",").slice(1).join(",").trim())),
          h("div", { class: "ticket-cut", "aria-hidden": "true" }),
          h("div", { class: "rows" },
            h("div", { class: "r" }, I("list", 18), h("div", {}, h("div", { class: "k" }, "Protocolo"), h("span", { class: "protocol" }, r.protocol))),
            h("div", { class: "r" }, I("users", 18), h("div", {}, h("div", { class: "k" }, "Pessoas"), r.party_size)),
            h("div", { class: "r" }, I("pin", 18), h("div", {}, h("div", { class: "k" }, "Local"), r.meeting_point)),
            h("div", { class: "r" }, I("shield", 18), h("div", {}, h("div", { class: "k" }, "Leve"), r.what_to_bring)),
            h("div", { class: "r" }, I("clock", 18), h("div", {}, h("div", { class: "k" }, "Situação"), r.status_label)))),
        h("div", { class: "btns", style: "margin-top:20px;justify-content:center" },
          h("a", { class: "btn dark", href: r.ics_url || `/api/public/bookings/${rescheduleToken}/ics` }, "Adicionar ao calendário"),
          h("a", { class: "btn", href: r.manage_url || `/minha-visita/${rescheduleToken}` }, "Gerenciar minha visita"))),
    ];
  }

  async function doReschedule() {
    const btn = document.getElementById("continuar");
    btn.disabled = true; btn.textContent = "Reagendando…";
    try {
      S.result = await api("POST", `/api/public/bookings/${rescheduleToken}/reschedule`, { slot_start: S.selected.slot_start });
      S.step = 3;
      render();
      window.scrollTo(0, 0);
    } catch (err) {
      toast(err.message, true);
      await loadSlots();
      render();
    }
  }

  function render() {
    clear(app);
    const step = S.step || 1;
    app.append(...[step === 1 ? step1() : step === 2 ? step2() : step3()].flat(Infinity).filter(Boolean));
    if (step === 3) document.getElementById("ok-title")?.focus();
  }

  (async function init() {
    try {
      S.cfg = await api("GET", "/api/public/config");
      if (rescheduleToken) {
        S.booking = await api("GET", `/api/public/bookings/${rescheduleToken}`);
        if (!S.booking.can_reschedule) {
          clear(app).append(h("h1", {}, "Não é possível reagendar"),
            h("div", { class: "notice warn" }, S.booking.reschedules_left === 0
              ? "Você já usou todos os reagendamentos pelo link. Fale com Admissões."
              : `O reagendamento pelo link fecha ${S.booking.cancel_cutoff_hours}h antes do tour ou a visita não está ativa.`),
            h("a", { class: "btn", href: `/minha-visita/${rescheduleToken}` }, "Voltar para minha visita"));
          return;
        }
        S.party = S.booking.party;
      }
      await loadSlots();
      render();
    } catch (err) {
      clear(app).append(h("div", { class: "notice error", role: "alert" }, err.message));
    }
  })();
})();

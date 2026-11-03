/* Gerado por build_pages.py a partir de static/*.js. Não edite à mão. */
window.Pages = window.Pages || {};
/* Utilitários compartilhados pelas páginas. */
(function () {
  const TZ = "America/Sao_Paulo";

  // As telas montam conteúdo com condicionais (cond ? nó : null). Sem isto, append() escreveria "null" na página.
  const nativeAppend = Element.prototype.append;
  Element.prototype.append = function (...nodes) {
    return nativeAppend.apply(this, nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
  };

  async function api(method, url, body) {
    const opts = { method, headers: {}, credentials: "same-origin" };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return window.MockAPI.api(method, url, body);
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  const dtf = (opts) => new Intl.DateTimeFormat("pt-BR", Object.assign({ timeZone: TZ }, opts));
  const fmt = {
    date: (iso) => dtf({ day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)),
    dateLong: (iso) => dtf({ weekday: "long", day: "numeric", month: "long" }).format(new Date(iso)),
    dateTime: (iso) => iso ? dtf({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—",
    time: (iso) => { const p = dtf({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).split(":"); return p[1] === "00" ? `${+p[0]}h` : `${+p[0]}h${p[1]}`; },
    hhmm: (t) => { const [a, b] = t.split(":"); return b === "00" ? `${+a}h` : `${+a}h${b}`; },
    weekdayShort: (dateStr) => dtf({ weekday: "short" }).format(new Date(dateStr + "T12:00:00-03:00")).replace(".", ""),
    dayMonth: (dateStr) => dtf({ day: "numeric", month: "short" }).format(new Date(dateStr + "T12:00:00-03:00")).replace(".", ""),
    num: (v, d = 1) => (v === null || v === undefined) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }),
    duration: (secs) => {
      if (secs === null || secs === undefined) return "—";
      if (secs < 90) return `${Math.round(secs)} s`;
      if (secs < 5400) return `${Math.round(secs / 60)} min`;
      if (secs < 172800) return `${fmt.num(secs / 3600)} h`;
      return `${fmt.num(secs / 86400)} dias`;
    },
  };

  const STATUS = {
    aguardando_embaixador: ["Aguardando embaixador", "yellow"], confirmado: ["Confirmado", "ok"], excecao: ["Exceção", "err"],
    realizado: ["Realizado", "dark"], encerrado: ["Encerrado", ""], nao_compareceu: ["Não compareceu", "err"],
    presenca_pendente: ["Presença pendente", "yellow"], cancelado_candidato: ["Cancelado (candidato)", ""],
    cancelado_admissoes: ["Cancelado (Admissões)", ""], aberto: ["Aberto", "yellow"], com_embaixador: ["Com embaixador", "ok"],
    cancelado: ["Cancelado", ""], enviado: ["Enviado", "info"], aceito: ["Aceito", "ok"], recusado: ["Recusado", "err"],
    expirado: ["Expirado", "err"], pendente: ["Na fila", ""], desistiu: ["Desistiu", "err"], simulado: ["Simulado", "info"], falhou: ["Falhou", "err"],
    ok: ["OK", "ok"],
  };
  function tag(status) {
    const [label, cls] = STATUS[status] || [status, ""];
    return h("span", { class: "tag " + cls }, label);
  }

  let toastTimer;
  function toast(msg, isError) {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const t = h("div", { class: "toast" + (isError ? " error" : ""), role: "status", "aria-live": "polite" }, msg);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 4500);
  }

  function maskCPF(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  function cpfValid(v) {
    const d = v.replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [9, 10]) {
      let s = 0;
      for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i);
      if ((s * 10) % 11 % 10 !== +d[n]) return false;
    }
    return true;
  }
  function maskPhone(v) {
    let d = v.replace(/\D/g, "");
    let prefix = "";
    if (d.startsWith("55") && d.length > 11) { prefix = "+55 "; d = d.slice(2); }
    d = d.slice(0, 11);
    if (d.length <= 2) return prefix + d;
    if (d.length <= 6) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function dialog(title, body, actions) {
    const dlg = h("dialog", { "aria-labelledby": "dlg-title" },
      h("div", { class: "dhead" }, h("h2", { id: "dlg-title" }, title),
        h("button", { class: "close", "aria-label": "Fechar", onclick: () => dlg.close() }, "×")),
      h("div", { class: "dbody" }, body),
      actions && actions.length ? h("div", { class: "dfoot" }, actions) : null);
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
    return dlg;
  }

  function confirmDialog(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      let result = false;
      const dlg = dialog(title, h("p", {}, text), [
        h("button", { class: "btn", onclick: () => dlg.close() }, "Voltar"),
        h("button", { class: "btn " + (danger ? "danger" : "primary"), onclick: () => { result = true; dlg.close(); } }, okLabel || "Confirmar"),
      ]);
      dlg.addEventListener("close", () => resolve(result));
    });
  }

  function topbar(area, links) {
    return h("header", { class: "topbar" }, h("div", { class: "inner" },
      h("a", { class: "brand", href: "/" }, h("span", { class: "logo" }, "Insper"), h("span", { class: "area" }, area)),
      h("nav", { "aria-label": "Principal" }, links || [])));
  }

  async function logout() {
    window.nav("/");
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Ícones em traço (24×24, cor herdada do texto).
  const ICONS = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3M12 9v4M12 17h.01"/>',
    chart: '<path d="M3 3v18h18M7 16v-5M12 16V8M17 16V6"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
    flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-13-3 2-6 5-6 9-1-1-2-2-2-4-2 2-1 5-1 8 0 4 3 7 7 7"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    home: '<path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    play: '<path d="m6 3 14 9-14 9z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  };
  function icon(name, size = 20, cls = "") {
    return h("span", { class: "ico " + cls, "aria-hidden": "true",
      html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>` });
  }

  window.T = { api, icon, h, clear, fmt, tag, toast, maskCPF, cpfValid, maskPhone, dialog, confirmDialog, topbar, logout, addDays, STATUS };
})();

/* /agendar — 3 passos: horário → dados → confirmação. Com ?reagendar=<token>, reaproveita o calendário para reagendar. */
Pages["agendar"] = function (ROUTE) {
  const { api, h, clear, fmt, toast, maskCPF, cpfValid, maskPhone, addDays } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Visite o campus", [h("a", { href: "/" }, "Início")]));

  const params = new URLSearchParams(ROUTE.search);
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
          h("button", { class: "btn dark", onclick: () => window.showIcs(r) }, "Adicionar ao calendário"),
          h("a", { class: "btn", href: `/minha-visita/${r.token || rescheduleToken}` }, "Gerenciar minha visita"))),
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
};

/* /minha-visita/{token} — ver, confirmar presença, reagendar ou cancelar. */
Pages["minha-visita"] = function (ROUTE) {
  const { api, h, clear, toast, dialog } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Minha visita", [h("a", { href: "/agendar" }, "Agendar")]));
  const token = ROUTE.path.split("/").filter(Boolean)[1];

  const I = T.icon;
  function render(v) {
    clear(app);
    const active = ["aguardando_embaixador", "confirmado", "excecao"].includes(v.status);
    const tone = v.status === "confirmado" ? "ok" : active ? "yellow" : "";
    const row = (ic, k, val) => h("div", { class: "r" }, I(ic, 18), h("div", {}, h("div", { class: "k" }, k), val));
    app.append(
      h("p", { class: "eyebrow" }, "Minha visita"),
      h("div", { class: "section-title" }, h("h1", {}, `Olá, ${v.first_name}`), h("span", { class: "tag " + tone }, v.status_label)),
      h("div", { class: "ticket" },
        h("div", { class: "ticket-top" }, h("span", { class: "eyebrow", style: "margin:0" }, "Tour no campus do Insper"),
          h("div", { class: "when" }, `${v.date_label.split(",")[0]}, ${v.time_label}`),
          h("div", { class: "sub" }, v.date_label.split(",").slice(1).join(",").trim())),
        h("div", { class: "ticket-cut", "aria-hidden": "true" }),
        h("div", { class: "rows" },
          row("user", "Embaixador", v.ambassador || "Aguardando confirmação. Avisamos por e-mail."),
          row("users", "Pessoas", v.party_size),
          row("pin", "Local", v.meeting_point),
          row("shield", "Leve", v.what_to_bring),
          row("list", "Protocolo", h("span", { class: "protocol" }, v.protocol)))),
      active ? [h("h2", { class: "section", style: "margin-bottom:12px" }, "Gerenciar"),
        h("div", { class: "list" },
          v.presence_confirmed ? h("div", { class: "li", "aria-disabled": "true" }, I("check-circle", 20), h("span", {}, "Presença confirmada"), h("span"))
            : h("button", { class: "li", type: "button", onclick: confirmPresence }, I("check-circle", 20), h("span", {}, "Confirmar presença", h("small", {}, "Ajuda o embaixador a se preparar")), I("arrow", 18)),
          v.can_reschedule ? h("a", { class: "li", href: `/agendar?reagendar=${token}` }, I("calendar", 20), h("span", {}, "Reagendar", h("small", {}, `Mesmo protocolo · ${v.reschedules_left} alteração(ões) disponível(is)`)), I("arrow", 18))
            : h("div", { class: "li", "aria-disabled": "true" }, I("calendar", 20), h("span", {}, "Reagendar", h("small", {}, v.can_cancel ? "Limite de reagendamentos atingido. Fale com Admissões." : `Fecha ${v.cancel_cutoff_hours}h antes do tour`)), h("span")),
          v.can_cancel ? h("button", { class: "li danger", type: "button", onclick: () => cancel(v) }, I("alert", 20), h("span", {}, "Cancelar visita", h("small", {}, "A vaga é liberada na hora")), I("arrow", 18)) : null),
        h("div", { class: "btns", style: "margin-top:14px" }, h("button", { class: "btn ghost", onclick: () => window.showIcs(v) }, "Adicionar ao calendário"))] : null,
      v.nps_open && !v.nps_answered ? h("div", { class: "notice", style: "margin-top:20px" }, "Como foi sua visita? ", h("a", { href: `/nps/${token}` }, "Responda em menos de 1 minuto"), ".") : null,
      !active && v.status.startsWith("cancelado") ? h("p", { style: "margin-top:24px" }, h("a", { class: "btn primary", href: "/agendar" }, "Agendar nova visita")) : null);
  }

  async function confirmPresence() {
    try { render(await api("POST", `/api/public/bookings/${token}/confirm-attendance`)); toast("Presença confirmada. Até lá!"); }
    catch (e) { toast(e.message, true); }
  }

  function cancel(v) {
    let reason = "não poderei ir";
    const reasons = ["não poderei ir", "já conheci o campus", "outro"];
    const dlg = dialog("Cancelar visita",
      h("div", {}, h("p", {}, `Cancelar a visita de ${v.date_label}, às ${v.time_label}? A vaga é liberada na hora.`),
        h("fieldset", {}, h("legend", {}, "Motivo (opcional)"), reasons.map((r, i) => h("label", { class: "choice", style: "display:flex" },
          h("input", { type: "radio", name: "motivo", checked: i === 0 ? true : null, onchange: () => { reason = r; } }), r[0].toUpperCase() + r.slice(1))))),
      [h("button", { class: "btn", onclick: () => dlg.close() }, "Manter visita"),
       h("button", { class: "btn danger", onclick: async () => {
         try { render(await api("POST", `/api/public/bookings/${token}/cancel`, { reason })); dlg.close(); toast("Visita cancelada."); }
         catch (e) { toast(e.message, true); }
       } }, "Cancelar visita")]);
  }

  api("GET", `/api/public/bookings/${token}`).then(render).catch((e) => {
    clear(app).append(h("h1", {}, "Link indisponível"), h("div", { class: "notice error", role: "alert" }, e.message),
      h("a", { class: "btn", href: "/agendar" }, "Agendar uma visita"));
  });
};

/* /nps/{token} e /nps/grupo/{token} (QR mostrado pelo embaixador ao fim do tour). */
Pages["nps"] = function (ROUTE) {
  const { api, h, clear, toast } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Avalie sua visita"));
  const parts = ROUTE.path.split("/").filter(Boolean);

  function thanks() {
    clear(app).append(h("h1", { tabindex: "-1", id: "t" }, "Obrigado!"),
      h("p", {}, "Sua resposta ajuda o Insper a melhorar a visita para os próximos candidatos."),
      h("a", { class: "btn", href: "https://www.insper.edu.br/" }, "Ir para o site do Insper"));
    document.getElementById("t").focus();
  }

  async function group(token) {
    const data = await api("GET", `/api/ambassador/tours/${token}/nps-group`);
    clear(app).append(h("h1", {}, "Como foi a visita?"), h("p", {}, `Tour de ${data.date_label}. Toque no seu nome para avaliar.`),
      data.people.length ? h("div", { class: "btns" }, data.people.map((p) => p.answered
        ? h("span", { class: "btn", "aria-disabled": "true", style: "opacity:.5" }, `${p.first_name} ✓`)
        : h("a", { class: "btn", href: `/nps/${p.token}` }, p.first_name))) : h("div", { class: "empty" }, "Nenhum participante encontrado."));
  }

  async function single(token) {
    const info = await api("GET", `/api/public/nps/${token}`);
    if (info.answered) return thanks();
    if (!info.open) {
      clear(app).append(h("h1", {}, "Ainda não é hora"), h("p", {}, "A avaliação abre depois do tour. Até lá!"));
      return;
    }
    const st = { score: null, rating: null };
    const scoreBtns = Array.from({ length: 11 }, (_, i) => h("button", { type: "button", "aria-pressed": "false", "aria-label": `Nota ${i}`,
      onclick: () => { st.score = i; scoreBtns.forEach((b, j) => b.setAttribute("aria-pressed", j === i ? "true" : "false")); } }, i));
    const rateBtns = [1, 2, 3, 4, 5].map((i) => h("button", { type: "button", "aria-pressed": "false",
      onclick: () => { st.rating = i; rateBtns.forEach((b, j) => b.setAttribute("aria-pressed", j + 1 === i ? "true" : "false")); } }, `${i}`));
    const highlight = h("textarea", { id: "hl", maxlength: "1000" });
    const improvement = h("textarea", { id: "im", maxlength: "1000" });
    const errBox = h("div", { role: "alert" });
    clear(app).append(
      h("h1", {}, `${info.first_name}, como foi sua visita?`), h("p", { class: "muted" }, info.date_label),
      h("form", { class: "group", onsubmit: async (e) => {
        e.preventDefault();
        if (st.score === null) { clear(errBox).append(h("div", { class: "notice error" }, "Escolha uma nota de 0 a 10.")); return; }
        try {
          await api("POST", `/api/public/nps/${token}`, { score: st.score, highlight: highlight.value, improvement: improvement.value, ambassador_rating: st.rating });
          thanks();
        } catch (err) { toast(err.message, true); if (err.code === "ja_respondido") thanks(); }
      } },
        h("fieldset", { class: "field" }, h("legend", {}, "De 0 a 10, quanto você recomendaria o tour no Insper a um amigo ou familiar?", h("span", { class: "req" }, " *")),
          h("div", { class: "score" }, scoreBtns), h("div", { class: "score-legend" }, h("span", {}, "0 — nada provável"), h("span", {}, "10 — muito provável"))),
        h("div", { class: "field" }, h("label", { for: "hl" }, "O que mais marcou sua visita?"), highlight),
        h("div", { class: "field" }, h("label", { for: "im" }, "O que podemos melhorar?"), improvement),
        info.ambassador ? h("fieldset", { class: "field" }, h("legend", {}, `Como você avalia ${info.ambassador}, que conduziu o tour? (opcional, 1 a 5)`),
          h("div", { class: "seg" }, rateBtns)) : null,
        errBox, h("button", { class: "btn primary", type: "submit" }, "Enviar avaliação")));
  }

  (parts[1] === "grupo" ? group(parts[2]) : single(parts[1])).catch((e) => clear(app).append(h("div", { class: "notice error", role: "alert" }, e.message)));
};

/* /embaixador — convites, meus tours (presença, QR do NPS, brinde), disponibilidade e perfil. */
Pages["embaixador"] = function (ROUTE) {
  const { api, h, clear, fmt, toast, dialog, confirmDialog, tag } = T;
  const app = document.getElementById("app");
  const S = { tab: ROUTE.tab || "inicio", me: null };
  const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  document.getElementById("top").appendChild(T.topbar("Portal do embaixador", [
    h("span", { id: "who", class: "muted" }), null]));

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
    Promise.resolve({ url: `/nps/grupo/${tour.group_id}` }).then((r) => {
      const box = h("div", { class: "qr" });
      dialog("Avaliação do tour", h("div", {}, h("p", { style: "text-align:center" }, "Peça ao grupo para apontar a câmera do celular:"), box,
        h("p", { style: "text-align:center;word-break:break-all;font-size:13px" }, "O celular abre a avaliação na hora.")));
      if (window.QRCode) new QRCode(box, { text: "INSPER-TOUR-NPS-GRUPO-" + tour.group_id, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M });
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
      onclick: () => { S.tab = id; ROUTE.setTab(id); render(); } }, label, id === "convites" && S.invites ? h("span", { class: "count" }, S.invites) : null,
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
    render();
  })().catch((e) => clear(app).append(h("div", { class: "notice error" }, e.message)));
};

/* /admin — painel de Admissões (seção 8.5). */
Pages["admin"] = function (ROUTE) {
  const { api, h, clear, fmt, toast, dialog, confirmDialog, tag, addDays } = T;
  const main = document.getElementById("conteudo");
  const side = document.getElementById("side");
  const S = { section: ROUTE.tab || "visao", period: null, agendaFrom: null, filters: {} };
  const WD = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

  document.getElementById("top").appendChild(T.topbar("Painel de Admissões", [
    h("span", { id: "who", class: "muted" })]));

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
      h("div", { class: "btns" }, ["bookings", "nps"].map((k) => h("button", { class: "btn small", onclick: () => window.showCsv(k, params) },
        { bookings: "CSV agendamentos", nps: "CSV NPS" }[k])))),
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
      h("p", { style: "margin-top:12px" }, h("a", { href: `/minha-visita/${b.token}` }, "Abrir “Minha visita” do candidato")),
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
    if (!active && !b.anonymized) actions.push(h("button", { class: "btn ghost", onclick: async () => {
      if (await confirmDialog("Anonimizar titular", "Apaga nome, CPF, e-mail e telefone deste titular (pedido LGPD). Não dá para desfazer.", "Anonimizar", true))
        after(api("POST", `/api/admin/lgpd/${id}/anonymize`));
    } }, "Anonimizar"));
    const dlg = dialog(`${b.protocol}`, body, actions);
  }

  async function rescheduleDialog(b) {
    const from = today(), to = addDays(today(), 60);
    const r = await api("GET", `/api/public/slots?from=${from}&to=${to}&party=${b.party_size}&token=${b.token}`);
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

  const SECTIONS = [
    ["visao", "Visão geral", secVisao], ["agenda", "Agenda", secAgenda], ["agendamentos", "Agendamentos", secAgendamentos],
    ["excecoes", "Exceções", secExcecoes], ["embaixadores", "Embaixadores", secEmbaixadores], null,
    ["config", "Configurações", secConfig], ["mensagens", "Mensagens", secMensagens],
  ];

  function drawSide() {
    const ICON = { visao: "home", agenda: "calendar", agendamentos: "list", excecoes: "alert", embaixadores: "users", config: "sliders", mensagens: "message", saude: "play" };
    clear(side).append(...SECTIONS.map((s) => s === null ? h("div", { class: "sep" }) : h("button", { "aria-current": S.section === s[0] ? "page" : null, onclick: () => go(s[0]) },
      h("span", { class: "lab" }, T.icon(ICON[s[0]] || "list", 18), s[1]), s[0] === "excecoes" && S.counts.exceptions ? h("span", { class: "tag red-solid" }, S.counts.exceptions) : null)));
  }

  function go(id) { S.section = id; ROUTE.setTab(id); render(); }

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
    const [cfg, jobs] = await Promise.all([api("GET", "/api/public/config"), api("GET", "/api/sim/state")]);
    document.getElementById("who").textContent = window.MockAPI.me().name;
    S.today = cfg.today;
    S.now = jobs.now;
    S.period = { from: addDays(S.today, -30), to: S.today };
    S.counts = { exceptions: (await api("GET", "/api/admin/exceptions")).items.length };
    render();
  })().catch((e) => clear(main).append(h("div", { class: "notice error" }, e.message)));
};

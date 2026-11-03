/* Backend simulado: as mesmas regras de app/domain.py, rodando no navegador. Os dados ficam no localStorage de quem abre. */
(function () {
  const TZ_OFFSET_H = -3; // America/Sao_Paulo, sem horário de verão desde 2019
  const STORE_KEY = "tour-insper-mock-v1";
  const ACTIVE = ["aguardando_embaixador", "confirmado", "excecao"];
  const H = 3600e3, D = 24 * H;

  const DEFAULT_CONFIG = {
    weekdays: [0, 1, 2, 3, 4], start_times: ["10:00", "14:00", "15:00", "16:00", "17:00"], duration_min: 60, group_capacity: 10,
    min_lead_hours: 24, max_days_ahead: 60, reminder_time: "10:00", cancel_cutoff_hours: 2, invite_timeout_hours: 12,
    exception_cutoff_hours: 24, reserve_required: false, max_reschedules: 3, match_course: true, metric_cancel_exclusion_hours: 48,
    retention_months: 24, meeting_point: "Recepção do Insper — Rua Quatá, 300, Vila Olímpia, São Paulo",
    what_to_bring: "Documento com foto (RG, CNH ou passaporte) de todas as pessoas do grupo.",
    privacy_url: "https://www.insper.edu.br/", virtual_tour_url: "https://www.youtube.com/watch?v=d_xUY4s5KCA",
    languages: ["Português", "Inglês", "Espanhol"], hidden_fields: [], admissions_email: "admissoes@exemplo.com",
  };

  const TEMPLATES = [
    ["M1", "Agendamento criado", "candidato", "Sua visita ao Insper está agendada — {data} às {hora}",
      "Olá, {nome}! Recebemos seu agendamento.\n\nLocal: {ponto_de_encontro}\nData: {data}, às {hora}\nGrupo: {pessoas} pessoa(s)\nProtocolo: {protocolo}\n\nAssim que o embaixador que vai receber você confirmar, mandamos o nome dele por aqui.\n\nPrecisa mudar algo? Reagende ou cancele em Minha visita.\n\n{o_que_levar}"],
    ["M2", "Embaixador aceitou", "candidato", "Tour confirmado: {embaixador} vai receber você no Insper",
      "Olá, {nome}! Seu tour está confirmado.\n\n{embaixador} vai conduzir sua visita em {data}, às {hora}.\nLocal: {ponto_de_encontro}\nProtocolo: {protocolo}"],
    ["M3", "Lembrete D-1", "candidato", "Amanhã é dia de conhecer o Insper — {hora}",
      "Olá, {nome}! Lembrete da sua visita amanhã, {data}, às {hora}.\n\nLocal: {ponto_de_encontro}\n{o_que_levar}\n\nConfirme sua presença, reagende ou cancele em Minha visita."],
    ["M4", "Reagendado", "candidato", "Visita reagendada — {data} às {hora}",
      "Olá, {nome}! Sua visita foi reagendada para {data}, às {hora}.\nO protocolo continua o mesmo: {protocolo}.\n\nLocal: {ponto_de_encontro}"],
    ["M5", "Cancelado", "candidato", "Visita cancelada — protocolo {protocolo}",
      "Olá, {nome}. Sua visita de {data}, às {hora}, foi cancelada.\n\nQuando quiser, agende de novo pela página de agendamento."],
    ["M6", "NPS", "candidato", "Como foi sua visita ao Insper?", "Olá, {nome}! Obrigado por visitar o Insper.\n\nConte para a gente como foi, leva menos de 1 minuto."],
    ["M7", "Convite ao embaixador", "embaixador", "Convite de tour: {data} às {hora} ({pessoas} pessoas)",
      "Olá, {embaixador}! Temos um tour para você.\n\nData: {data}, às {hora}\nGrupo:\n{perfil_grupo}\n\nResponda até {prazo} no portal do embaixador."],
    ["M8", "Lembrete de convite", "embaixador", "Lembrete: convite de tour aguardando resposta ({data} às {hora})",
      "Olá, {embaixador}! O convite para o tour de {data}, às {hora}, ainda aguarda sua resposta.\n\nResponda até {prazo}."],
    ["M9", "Tour do dia seguinte", "embaixador", "Seu tour de amanhã — {hora}",
      "Olá, {embaixador}! Amanhã, {data}, às {hora}, você conduz o tour.\n\nGrupo:\n{perfil_grupo}\n\nNão esqueça de retirar o brinde e o voucher de almoço."],
    ["M10", "Mudança no grupo", "embaixador", "Mudança no seu tour de {data} às {hora}", "Olá, {embaixador}! Houve uma mudança no tour de {data}, às {hora}: {mudanca}"],
    ["M11", "Exceção aberta", "admissoes", "[Exceção] Grupo sem embaixador — {data} às {hora}",
      "O grupo de {data}, às {hora} ({pessoas} pessoas), está sem embaixador.\nMotivo: {motivo}\n\nResolva na fila de exceções do painel."],
    ["M11D", "Resumo diário de exceções", "admissoes", "Resumo de exceções — {qtd} grupo(s) aguardando", "Grupos na fila de exceções:\n\n{lista}"],
    ["M12", "Presença pendente", "embaixador", "Presença pendente — tour de {data} às {hora}",
      "Olá, {embaixador}! A presença do tour de {data}, às {hora}, ainda não foi registrada."],
    ["MX1", "Proposta de nova data", "candidato", "Precisamos ajustar sua visita ao Insper",
      "Olá, {nome}. Não conseguimos garantir um embaixador para {data}, às {hora}.\n\nPor favor, escolha outro horário em Minha visita. Seu protocolo continua o mesmo: {protocolo}."],
    ["MX2", "Agendamento já existente", "candidato", "Você já tem uma visita agendada ao Insper",
      "Olá, {nome}! Recebemos um novo pedido com o seu CPF, mas você já tem uma visita agendada para {data}, às {hora}.\n\nPara ver, reagendar ou cancelar, use Minha visita."],
  ];

  let DB = null;

  // ------------------------------------------------------------ tempo (UTC-3 fixo)
  const nowMs = () => Date.now() + DB.clockOffset * 1000;
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const parse = (s) => (s ? Date.parse(s) : null);
  const now = () => iso(nowMs());
  function lp(ms) {
    const d = new Date(ms + TZ_OFFSET_H * H);
    return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), weekday: (d.getUTCDay() + 6) % 7,
      year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
  const localSlot = (dateStr, t) => Date.parse(`${dateStr}T${t}:00Z`) - TZ_OFFSET_H * H;
  const slotKey = (s) => { const p = lp(parse(s)); return [p.date, p.time]; };
  const todayLocal = () => lp(nowMs()).date;
  const addDays = (ds, n) => { const d = new Date(ds + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekdayOf = (ds) => (new Date(ds + "T12:00:00Z").getUTCDay() + 6) % 7;
  const WD = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
  const MO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const fmtDate = (ms) => { const p = lp(ms); return `${WD[p.weekday]}, ${p.day} de ${MO[p.month]} de ${p.year}`; };
  const fmtTime = (ms) => { const p = lp(ms); return p.minute ? `${p.hour}h${String(p.minute).padStart(2, "0")}` : `${p.hour}h`; };
  const firstName = (n) => (n || "").trim().split(/\s+/)[0];

  // ------------------------------------------------------------ armazenamento
  function blank() {
    return { version: 1, clockOffset: 0, seq: {}, config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)), session: null,
      users: [], ambassadors: [], rules: [], exceptions: [], candidates: [], groups: [], bookings: [], invitations: [], attendance: [],
      gifts: [], nps: [], blackouts: [], courses: [], templates: TEMPLATES.map(([code, name, audience, subject, body]) => ({ code, name, audience, subject, body, active: true })),
      notifications: [], events: [], crm: [], jobRuns: [] };
  }
  function insert(table, row) {
    DB.seq[table] = (DB.seq[table] || 0) + 1;
    row.id = DB.seq[table];
    DB[table].push(row);
    return row;
  }
  const byId = (table, id) => DB[table].find((r) => r.id === id);
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { /* sem armazenamento: segue em memória */ } }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) { DB = JSON.parse(raw); return true; } } catch (e) { /* ignora */ }
    return false;
  }

  class DomainError extends Error {
    constructor(message, code = "erro", status = 400, extra = {}) { super(message); this.code = code; this.status = status; this.fields = extra.fields || {}; this.extra = extra; }
  }

  // ------------------------------------------------------------ eventos e mensagens
  function logEvent(entity_type, entity_id, type, actor = "system", actor_id = null, payload = {}, is_manual = null) {
    insert("events", { entity_type, entity_id, type, actor, actor_id, is_manual: is_manual === null ? actor === "admissions" : is_manual, payload, created_at: now() });
  }
  const render = (text, v) => text.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  const dedupe = new Set();
  function enqueue(key, code, recipient, vars, extra = {}) {
    if (DB.notifications.some((n) => n.dedupe_key === key)) return false;
    const t = DB.templates.find((x) => x.code === code);
    if (!t || !t.active) return false;
    insert("notifications", Object.assign({ dedupe_key: key, template_code: code, recipient, channel: "email", status: "enviado",
      subject: render(t.subject, vars), body_text: render(t.body, vars), sent_at: now(), created_at: now() }, extra));
    return true;
  }
  function enqueueCandidate(b, code, vars, suffix = "") {
    const key = `${code}:b${b.id}:${suffix}`;
    const r = enqueue(key, code, b.email, vars, { booking_id: b.id });
    if (b.whatsapp_opt_in) enqueue(key + ":wa", code, b.phone, vars, { booking_id: b.id, channel: "whatsapp", status: "simulado" });
    return r;
  }

  // ------------------------------------------------------------ disponibilidade e alocação
  function ambassadorAvailable(a, ds, t) {
    if (!a.active) return false;
    const exT = DB.exceptions.filter((e) => e.ambassador_id === a.id && e.date === ds && e.start_time === t);
    if (exT.length) return !!exT[exT.length - 1].available;
    const exD = DB.exceptions.filter((e) => e.ambassador_id === a.id && e.date === ds && !e.start_time);
    if (exD.length) return !!exD[exD.length - 1].available;
    const wd = weekdayOf(ds);
    return DB.rules.some((r) => r.ambassador_id === a.id && r.weekday === wd && r.start_time === t);
  }

  /** Seção 6 — função pura de ranking. */
  function allocate(group, ambassadors, history, cfg, rand = Math.random) {
    const exclude = new Set(group.exclude || []);
    const wanted = new Set((group.languages || []).filter((l) => l && l !== "Português"));
    const cand = ambassadors.filter((a) => !exclude.has(a.id) && !a.busy && ambassadorAvailable(a, group.date, group.time));
    const score = (a) => {
      let s = 0;
      if (cfg.match_course && a.course) s += (group.courses || []).filter((c) => c === a.course).length;
      if (wanted.size) s += 10 * (a.languages || []).filter((l) => wanted.has(l)).length;
      return s;
    };
    return cand.map((a) => ({ a, k: [(history[a.id] || {}).tours_30d || 0, (history[a.id] || {}).declines_30d || 0, -score(a), rand()] }))
      .sort((x, y) => { for (let i = 0; i < 4; i++) if (x.k[i] !== y.k[i]) return x.k[i] - y.k[i]; return 0; })
      .map((x) => x.a.id);
  }

  function history() {
    const since = nowMs() - 30 * D, h = {};
    DB.groups.filter((g) => g.ambassador_id && ["com_embaixador", "realizado"].includes(g.status) && parse(g.slot_start) >= since)
      .forEach((g) => { (h[g.ambassador_id] = h[g.ambassador_id] || {}).tours_30d = ((h[g.ambassador_id] || {}).tours_30d || 0) + 1; });
    DB.invitations.filter((i) => ["recusado", "expirado", "desistiu"].includes(i.status) && parse(i.responded_at) >= since)
      .forEach((i) => { (h[i.ambassador_id] = h[i.ambassador_id] || {}).declines_30d = ((h[i.ambassador_id] || {}).declines_30d || 0) + 1; });
    return h;
  }

  function busyAt(slot_start, excludeGroup) {
    const busy = new Set();
    DB.groups.filter((g) => g.slot_start === slot_start && g.ambassador_id && ["aberto", "com_embaixador"].includes(g.status) && g.id !== excludeGroup)
      .forEach((g) => busy.add(g.ambassador_id));
    DB.invitations.filter((i) => i.status === "enviado").forEach((i) => {
      const g = byId("groups", i.tour_group_id);
      if (g && g.slot_start === slot_start && g.id !== excludeGroup) busy.add(i.ambassador_id);
    });
    return busy;
  }

  // ------------------------------------------------------------ vagas
  function slotBookable(ds, t, ignoreWindow) {
    const cfg = DB.config;
    if (!cfg.weekdays.includes(weekdayOf(ds)) || !cfg.start_times.includes(t)) return [false, "Horário fora da grade de tours."];
    if (DB.blackouts.some((b) => b.date === ds && (!b.start_time || b.start_time === t))) return [false, "Data ou horário bloqueado por Admissões."];
    const start = localSlot(ds, t);
    if (start <= nowMs()) return [false, "Esse horário já passou."];
    if (!ignoreWindow) {
      if (start < nowMs() + cfg.min_lead_hours * H) return [false, `É preciso agendar com pelo menos ${cfg.min_lead_hours}h de antecedência.`];
      if (start > nowMs() + cfg.max_days_ahead * D) return [false, `A agenda está aberta para os próximos ${cfg.max_days_ahead} dias.`];
    }
    return [true, ""];
  }

  const groupBookings = (gid, activeOnly = true) => DB.bookings.filter((b) => b.tour_group_id === gid && (!activeOnly || ACTIVE.includes(b.status)));
  const groupPeople = (gid) => groupBookings(gid).reduce((s, b) => s + b.party_size, 0);

  function slotState(slot_start, excludeBooking) {
    const cfg = DB.config;
    const [ds, t] = slotKey(slot_start);
    const groups = DB.groups.filter((g) => g.slot_start === slot_start && ["aberto", "com_embaixador"].includes(g.status)).map((g) => Object.assign({}, g, {
      booked: DB.bookings.filter((b) => b.tour_group_id === g.id && ACTIVE.includes(b.status) && b.id !== excludeBooking).reduce((s, b) => s + b.party_size, 0) }));
    const avail = new Set(DB.ambassadors.filter((a) => ambassadorAvailable(a, ds, t)).map((a) => a.id));
    const assigned = new Set(groups.filter((g) => g.ambassador_id).map((g) => g.ambassador_id));
    const pending = groups.filter((g) => !g.ambassador_id && !g.handled_by_admissions);
    const need = cfg.reserve_required ? 2 : 1;
    const free = [...avail].filter((a) => !assigned.has(a)).length - pending.length;
    const canOpen = free >= need;
    const usable = groups.filter((g) => !g.in_exception || g.ambassador_id || g.handled_by_admissions);
    const spaces = usable.map((g) => Math.max(0, g.capacity - g.booked));
    const maxFit = Math.max(0, ...spaces, canOpen ? cfg.group_capacity : 0);
    const remaining = spaces.reduce((a, b) => a + b, 0) + Math.max(0, free - (need - 1)) * cfg.group_capacity;
    return { groups, usable, canOpen, maxFit, remaining };
  }

  function computeSlots(from, to, party, excludeBooking, ignoreWindow) {
    const cfg = DB.config, out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!cfg.weekdays.includes(weekdayOf(d))) continue;
      for (const t of [...cfg.start_times].sort()) {
        const [ok, reason] = slotBookable(d, t, ignoreWindow);
        const slot_start = iso(localSlot(d, t));
        if (!ok) {
          if (/passou|antecedência|próximos/.test(reason)) continue;
          out.push({ date: d, time: t, slot_start, remaining: 0, max_fit: 0, available: false, reason });
          continue;
        }
        const st = slotState(slot_start, excludeBooking);
        out.push({ date: d, time: t, slot_start, remaining: st.remaining, max_fit: st.maxFit, available: st.maxFit >= party });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ leitura
  function full(bid) {
    const b = byId("bookings", bid);
    if (!b) return null;
    const c = byId("candidates", b.candidate_id), g = byId("groups", b.tour_group_id);
    return Object.assign({}, b, { full_name: c.full_name, email: c.email, phone: c.phone, course_interest: c.course_interest, is_treineiro: c.is_treineiro,
      cpf: c.cpf, slot_start: g.slot_start, group_status: g.status, ambassador_id: g.ambassador_id, handled_by_admissions: g.handled_by_admissions, in_exception: g.in_exception });
  }
  function ambLabel(b) {
    if (b.handled_by_admissions) return "a equipe de Admissões";
    const a = b.ambassador_id && byId("ambassadors", b.ambassador_id);
    return a ? firstName(a.display_name) : "";
  }
  function candVars(b) {
    const ms = parse(b.slot_start);
    return { nome: firstName(b.full_name), data: fmtDate(ms), hora: fmtTime(ms), protocolo: b.protocol, pessoas: b.party_size,
      ponto_de_encontro: DB.config.meeting_point, o_que_levar: DB.config.what_to_bring, embaixador: ambLabel(b) };
  }
  function safeProfile(b) {
    return { booking_id: b.id, first_name: firstName(b.full_name), course_interest: b.course_interest, is_treineiro: !!b.is_treineiro,
      companions: b.party_size - 1, party_size: b.party_size, language: b.language, mobility_restriction: !!b.mobility_restriction,
      mobility_notes: b.mobility_notes || "", questions: b.questions || "", status: b.status };
  }
  function profileText(gid) {
    return groupBookings(gid).map((b) => {
      const p = safeProfile(full(b.id));
      const parts = [p.first_name, p.course_interest, p.is_treineiro ? "treineiro" : "vestibulando"];
      if (p.companions) parts.push(`+${p.companions} acompanhante(s)`);
      if (p.language !== "Português") parts.push(`idioma: ${p.language}`);
      if (p.mobility_restriction) parts.push("restrição de locomoção" + (p.mobility_notes ? ` (${p.mobility_notes})` : ""));
      return "• " + parts.join(" · ") + (p.questions ? `\n  Dúvidas: ${p.questions}` : "");
    }).join("\n") || "(sem candidatos ativos)";
  }
  function notifyAmb(g, ambId, code, suffix, extra = {}) {
    const a = byId("ambassadors", ambId);
    if (!a) return;
    const u = byId("users", a.user_id), ms = parse(g.slot_start);
    enqueue(`${code}:g${g.id}:a${ambId}:${suffix}`, code, u.email, Object.assign({ embaixador: firstName(a.display_name), data: fmtDate(ms), hora: fmtTime(ms),
      pessoas: groupPeople(g.id), perfil_grupo: profileText(g.id) }, extra), { ambassador_id: ambId });
  }
  function notifyAdm(code, key, vars) {
    DB.users.filter((u) => u.role === "admissions").forEach((u) => enqueue(`${code}:${key}:${u.email}`, code, u.email, vars));
  }

  // ------------------------------------------------------------ formulário
  function cpfDigits(v) { return String(v || "").replace(/\D/g, ""); }
  function cpfValid(v) {
    const d = cpfDigits(v);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); if ((s * 10) % 11 % 10 !== +d[n]) return false; }
    return true;
  }
  function validate(data) {
    const cfg = DB.config, e = {};
    const name = String(data.full_name || "").trim().replace(/\s+/g, " ");
    if (name.split(" ").length < 2) e.full_name = "Informe nome e sobrenome.";
    if (!cpfValid(data.cpf)) e.cpf = "CPF inválido. Confira os números.";
    const email = String(data.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) e.email = "E-mail inválido.";
    else if (String(data.email_confirm || "").trim().toLowerCase() !== email) e.email_confirm = "Os e-mails não conferem.";
    let phone = cpfDigits(data.phone);
    if (phone.startsWith("55") && phone.length >= 12) phone = phone.slice(2);
    if (phone.length < 10 || phone.length > 11) e.phone = "Informe o celular com DDD.";
    if (!DB.courses.some((c) => c.active && c.name === data.course_interest)) e.course_interest = "Escolha o curso de interesse.";
    if (data.is_treineiro !== true && data.is_treineiro !== false) e.is_treineiro = "Informe se você é treineiro.";
    const comp = Number.isInteger(+data.companions) ? +data.companions : -1;
    if (comp < 0 || comp > cfg.group_capacity - 1) e.companions = `Acompanhantes: de 0 a ${cfg.group_capacity - 1}.`;
    if (!data.privacy_accepted) e.privacy_accepted = "É preciso aceitar o aviso de privacidade.";
    if (String(data.questions || "").length > 500) e.questions = "Use até 500 caracteres.";
    if (Object.keys(e).length) throw new DomainError("Confira os campos destacados.", "validacao", 422, { fields: e });
    return { full_name: name, cpf: cpfDigits(data.cpf), email, phone, course_interest: data.course_interest, is_treineiro: !!data.is_treineiro,
      party_size: comp + 1, companions_names: (data.companions_names || []).filter(Boolean).slice(0, comp), mobility_restriction: !!data.mobility_restriction,
      mobility_notes: data.mobility_notes || "", language: data.language || "Português", questions: data.questions || "", whatsapp_opt_in: !!data.whatsapp_opt_in };
  }

  // ------------------------------------------------------------ grupos e convites
  function deadlineFor(slot_start, base) {
    const slot = parse(slot_start);
    let dl = slot - DB.config.exception_cutoff_hours * H;
    if (dl < base + 2 * H) dl = Math.min(base + 2 * H, slot - H);
    return iso(dl);
  }
  function place(slot_start, party, excludeBooking) {
    const st = slotState(slot_start, excludeBooking);
    const fit = st.usable.filter((g) => g.capacity - g.booked >= party)
      .sort((a, b) => ((a.ambassador_id || a.handled_by_admissions) ? 0 : 1) - ((b.ambassador_id || b.handled_by_admissions) ? 0 : 1) || b.booked - a.booked);
    if (fit.length) return [byId("groups", fit[0].id), false];
    if (st.canOpen && party <= DB.config.group_capacity) {
      const g = insert("groups", { slot_start, status: "aberto", ambassador_id: null, handled_by_admissions: false, capacity: DB.config.group_capacity,
        deadline_at: deadlineFor(slot_start, nowMs()), in_exception: false, exception_opened_at: null, exception_resolved_at: null, created_at: now() });
      logEvent("group", g.id, "group.created");
      return [g, true];
    }
    throw new DomainError("Este horário acabou de esgotar. Escolha outro horário.", "esgotado", 409);
  }
  function startAllocation(gid, exclude = []) {
    const g = byId("groups", gid);
    const [ds, t] = slotKey(g.slot_start);
    const busy = busyAt(g.slot_start, gid);
    const ambs = DB.ambassadors.map((a) => Object.assign({}, a, { busy: busy.has(a.id) }));
    const bs = groupBookings(gid).map((b) => full(b.id));
    const prev = DB.invitations.filter((i) => i.tour_group_id === gid && ["recusado", "expirado", "desistiu"].includes(i.status)).map((i) => i.ambassador_id);
    const ranking = allocate({ date: ds, time: t, courses: bs.map((b) => b.course_interest), languages: bs.map((b) => b.language), exclude: prev.concat(exclude) },
      ambs, history(), DB.config);
    DB.invitations.filter((i) => i.tour_group_id === gid && ["pendente", "enviado"].includes(i.status)).forEach((i) => { i.status = "cancelado"; });
    const base = Math.max(0, ...DB.invitations.filter((i) => i.tour_group_id === gid).map((i) => i.rank));
    ranking.forEach((aid, i) => insert("invitations", { tour_group_id: gid, ambassador_id: aid, rank: base + i + 1, status: "pendente", created_at: now() }));
    logEvent("group", gid, "allocation.ranked", "system", null, { principal: ranking[0] || null, reserva: ranking[1] || null, fila: ranking });
    sendNext(gid);
  }
  function sendNext(gid) {
    const g = byId("groups", gid);
    if (g.status !== "aberto" || g.ambassador_id || g.handled_by_admissions || g.in_exception) return;
    const deadline = parse(g.deadline_at);
    if (nowMs() >= deadline) return openException(gid, "Prazo limite atingido sem aceite de embaixador.");
    const [ds, t] = slotKey(g.slot_start);
    const busy = busyAt(g.slot_start, gid);
    for (;;) {
      const inv = DB.invitations.filter((i) => i.tour_group_id === gid && i.status === "pendente").sort((a, b) => a.rank - b.rank)[0];
      if (!inv) return openException(gid, "Nenhum embaixador disponível aceitou o convite.");
      const a = byId("ambassadors", inv.ambassador_id);
      if (!a || busy.has(a.id) || !ambassadorAvailable(a, ds, t)) { inv.status = "cancelado"; continue; }
      const exp = Math.min(nowMs() + DB.config.invite_timeout_hours * H, deadline);
      Object.assign(inv, { status: "enviado", sent_at: now(), expires_at: iso(exp) });
      logEvent("invitation", inv.id, "invitation.sent", "system", null, { group_id: gid, ambassador_id: a.id });
      notifyAmb(g, a.id, "M7", inv.id, { prazo: `${fmtDate(exp)}, às ${fmtTime(exp)}` });
      return;
    }
  }
  function openException(gid, reason) {
    const g = byId("groups", gid);
    if (g.in_exception) return;
    DB.invitations.filter((i) => i.tour_group_id === gid && ["pendente", "enviado"].includes(i.status)).forEach((i) => {
      i.status = i.status === "enviado" ? "expirado" : "cancelado"; i.responded_at = i.responded_at || now();
    });
    Object.assign(g, { in_exception: true, exception_opened_at: now(), exception_resolved_at: null });
    DB.bookings.filter((b) => b.tour_group_id === gid && b.status === "aguardando_embaixador").forEach((b) => { b.status = "excecao"; b.updated_at = now(); });
    logEvent("group", gid, "group.exception_opened", "system", null, { motivo: reason });
    const ms = parse(g.slot_start);
    notifyAdm("M11", `g${gid}:${now()}`, { data: fmtDate(ms), hora: fmtTime(ms), pessoas: groupPeople(gid), motivo: reason });
  }
  function confirmGroup(gid) {
    groupBookings(gid).forEach((b) => {
      if (["aguardando_embaixador", "excecao"].includes(b.status)) {
        b.status = "confirmado"; b.confirmed_at = b.confirmed_at || now(); b.updated_at = now();
        logEvent("booking", b.id, "booking.confirmed");
      }
      const f = full(b.id);
      enqueueCandidate(f, "M2", candVars(f), `a${f.ambassador_id || "adm"}:${f.slot_start}`);
      queueCrm(b.id, "updateTourStatus", { status: "confirmado" });
    });
  }
  function assign(gid, ambId, byAdmissions = false) {
    const g = byId("groups", gid);
    if (g.in_exception) g.exception_resolved_at = now();
    Object.assign(g, { ambassador_id: ambId, handled_by_admissions: byAdmissions, status: "com_embaixador", in_exception: false });
    DB.gifts = DB.gifts.filter((x) => !(x.tour_group_id === gid && !x.collected_at));
    if (ambId && !DB.gifts.some((x) => x.tour_group_id === gid)) insert("gifts", { tour_group_id: gid, ambassador_id: ambId, collected_at: null });
    confirmGroup(gid);
  }
  function accept(invId, ambId) {
    const inv = byId("invitations", invId);
    if (!inv || inv.ambassador_id !== ambId) throw new DomainError("Convite não encontrado.", "nao_encontrado", 404);
    if (inv.status !== "enviado") throw new DomainError("Este convite não está mais disponível.", "convite_indisponivel", 409);
    if (parse(inv.expires_at) <= nowMs()) throw new DomainError("O prazo deste convite terminou.", "convite_expirado", 409);
    const g = byId("groups", inv.tour_group_id);
    if (DB.groups.some((x) => x.slot_start === g.slot_start && x.ambassador_id === ambId && x.status === "com_embaixador" && x.id !== g.id))
      throw new DomainError("Você já tem um tour neste horário.", "conflito", 409);
    Object.assign(inv, { status: "aceito", responded_at: now() });
    DB.invitations.filter((i) => i.tour_group_id === g.id && i.id !== inv.id && ["pendente", "enviado"].includes(i.status)).forEach((i) => { i.status = "cancelado"; });
    assign(g.id, ambId);
    logEvent("invitation", inv.id, "invitation.accepted", "ambassador", ambId);
  }
  function decline(invId, ambId, reason) {
    const inv = byId("invitations", invId);
    if (!inv || inv.ambassador_id !== ambId) throw new DomainError("Convite não encontrado.", "nao_encontrado", 404);
    if (inv.status !== "enviado") throw new DomainError("Este convite não está mais disponível.", "convite_indisponivel", 409);
    Object.assign(inv, { status: "recusado", responded_at: now(), decline_reason: reason || "" });
    logEvent("invitation", inv.id, "invitation.declined", "ambassador", ambId, { motivo: reason });
    sendNext(inv.tour_group_id);
  }
  function withdraw(gid, ambId, reason) {
    const g = byId("groups", gid);
    if (!g || g.ambassador_id !== ambId) throw new DomainError("Tour não encontrado.", "nao_encontrado", 404);
    if (parse(g.slot_start) <= nowMs()) throw new DomainError("O tour já começou.", "tour_iniciado", 409);
    DB.invitations.filter((i) => i.tour_group_id === gid && i.ambassador_id === ambId && i.status === "aceito").forEach((i) => Object.assign(i, { status: "desistiu", responded_at: now() }));
    Object.assign(g, { ambassador_id: null, status: "aberto", deadline_at: deadlineFor(g.slot_start, nowMs()) });
    DB.gifts = DB.gifts.filter((x) => !(x.tour_group_id === gid && !x.collected_at));
    DB.bookings.filter((b) => b.tour_group_id === gid && b.status === "confirmado").forEach((b) => { b.status = "aguardando_embaixador"; });
    logEvent("group", gid, "ambassador.withdrew", "ambassador", ambId, { motivo: reason });
    if (parse(g.slot_start) - nowMs() < 24 * H) {
      const ms = parse(g.slot_start);
      notifyAdm("M11", `g${gid}:desist:${now()}`, { data: fmtDate(ms), hora: fmtTime(ms), pessoas: groupPeople(gid), motivo: "Embaixador desistiu a menos de 24h do tour." });
    }
    startAllocation(gid, [ambId]);
  }
  function resolveException(gid, action, adminId, ambId) {
    const g = byId("groups", gid);
    if (!g || !["aberto", "com_embaixador"].includes(g.status)) throw new DomainError("Grupo não encontrado.", "nao_encontrado", 404);
    if (action === "designar") {
      const a = byId("ambassadors", ambId);
      if (!a || !a.active) throw new DomainError("Escolha um embaixador ativo.", "validacao", 422);
      const prev = g.ambassador_id;
      DB.invitations.filter((i) => i.tour_group_id === gid && ["pendente", "enviado"].includes(i.status)).forEach((i) => { i.status = "cancelado"; });
      if (prev && prev !== ambId) {
        DB.invitations.filter((i) => i.tour_group_id === gid && i.ambassador_id === prev && i.status === "aceito").forEach((i) => { i.status = "cancelado"; });
        notifyAmb(g, prev, "M10", `removido:${now()}`, { mudanca: "Admissões transferiu este tour para outro embaixador." });
      }
      insert("invitations", { tour_group_id: gid, ambassador_id: ambId, rank: 0, status: "aceito", sent_at: now(), responded_at: now(), created_at: now() });
      assign(gid, ambId);
      notifyAmb(g, ambId, "M10", `designado:${now()}`, { mudanca: "Admissões designou você para conduzir este tour." });
      logEvent("group", gid, "exception.assigned", "admissions", adminId, { ambassador_id: ambId });
    } else if (action === "admissoes_conduz") {
      DB.invitations.filter((i) => i.tour_group_id === gid && ["pendente", "enviado"].includes(i.status)).forEach((i) => { i.status = "cancelado"; });
      assign(gid, null, true);
      logEvent("group", gid, "exception.admissions_conducts", "admissions", adminId);
    } else if (action === "propor_nova_data") {
      groupBookings(gid).forEach((b) => { const f = full(b.id); enqueueCandidate(f, "MX1", candVars(f), now()); });
      logEvent("group", gid, "exception.new_date_proposed", "admissions", adminId);
    } else if (action === "reabrir_alocacao") {
      Object.assign(g, { in_exception: false, deadline_at: deadlineFor(g.slot_start, nowMs()) });
      DB.bookings.filter((b) => b.tour_group_id === gid && b.status === "excecao").forEach((b) => { b.status = "aguardando_embaixador"; });
      logEvent("group", gid, "exception.reallocation", "admissions", adminId);
      startAllocation(gid);
    } else throw new DomainError("Ação desconhecida.", "validacao", 422);
  }

  // ------------------------------------------------------------ CRM simulado
  function queueCrm(bid, operation, payload) {
    const b = byId("bookings", bid);
    if (operation === "upsertLead" && !b.crm_id) b.crm_id = "CRM-" + (100000 + bid * 7919 % 900000).toString(36).toUpperCase();
    insert("crm", { booking_id: bid, operation, payload, status: "ok", attempts: 1, created_at: now() });
  }

  // ------------------------------------------------------------ agendamento
  function activeFuture(cpf, excludeId) {
    return DB.bookings.find((b) => {
      const c = byId("candidates", b.candidate_id), g = byId("groups", b.tour_group_id);
      return c.cpf === cpf && ACTIVE.includes(b.status) && parse(g.slot_start) > nowMs() && b.id !== excludeId;
    });
  }
  function createBooking(data, opts = {}) {
    const f = validate(data);
    let ds, t;
    try { [ds, t] = slotKey(data.slot_start); } catch (e) { throw new DomainError("Escolha um horário.", "validacao", 422); }
    const dup = activeFuture(f.cpf);
    if (dup) {
      const fb = full(dup.id);
      enqueueCandidate(fb, "MX2", candVars(fb), now());
      throw new DomainError("Já existe uma visita agendada para este CPF. Enviamos para o e-mail cadastrado o link para ver, reagendar ou cancelar.", "duplicado", 409);
    }
    const [ok, reason] = slotBookable(ds, t, opts.ignoreWindow);
    if (!ok) throw new DomainError(reason, "horario_invalido", 409);
    const [g, created] = place(data.slot_start, f.party_size);
    let c = DB.candidates.find((x) => x.cpf === f.cpf);
    if (c) Object.assign(c, { full_name: f.full_name, email: f.email, phone: f.phone, course_interest: f.course_interest, is_treineiro: f.is_treineiro });
    else c = insert("candidates", { full_name: f.full_name, cpf: f.cpf, email: f.email, phone: f.phone, course_interest: f.course_interest, is_treineiro: f.is_treineiro, created_at: now() });
    const hasAmb = !!(g.ambassador_id || g.handled_by_admissions);
    const b = insert("bookings", { candidate_id: c.id, tour_group_id: g.id, status: hasAmb ? "confirmado" : "aguardando_embaixador", outcome: null,
      party_size: f.party_size, companions_names: f.companions_names, mobility_restriction: f.mobility_restriction, mobility_notes: f.mobility_notes,
      language: f.language, questions: f.questions, whatsapp_opt_in: f.whatsapp_opt_in, reschedule_count: 0, crm_id: null,
      confirmed_at: hasAmb ? now() : null, created_at: opts.createdAt || now(), updated_at: now(), token: Math.random().toString(36).slice(2, 10) });
    b.protocol = `TOUR-${lp(nowMs()).year}-${String(b.id).padStart(6, "0")}`;
    logEvent("booking", b.id, "booking.created", opts.actor || "candidate", null, { slot_start: data.slot_start });
    const fb = full(b.id);
    enqueueCandidate(fb, "M1", candVars(fb), "criado");
    queueCrm(b.id, "upsertLead", { protocol: b.protocol });
    if (created) startAllocation(g.id);
    else if (hasAmb) {
      enqueueCandidate(fb, "M2", candVars(fb), `a${fb.ambassador_id || "adm"}:${fb.slot_start}`);
      if (g.ambassador_id) notifyAmb(g, g.ambassador_id, "M10", `entrou:b${b.id}`, { mudanca: `entrou ${firstName(f.full_name)} (${f.party_size} pessoa(s)).` });
    }
    return full(b.id);
  }
  function afterLeave(gid, who, bid) {
    const g = byId("groups", gid);
    if (!groupBookings(gid).length) {
      g.status = "cancelado";
      DB.invitations.filter((i) => i.tour_group_id === gid && ["pendente", "enviado"].includes(i.status)).forEach((i) => { i.status = "cancelado"; });
      DB.gifts = DB.gifts.filter((x) => !(x.tour_group_id === gid && !x.collected_at));
      logEvent("group", gid, "group.cancelled");
      if (g.ambassador_id) notifyAmb(g, g.ambassador_id, "M10", `cancelado:b${bid}`, { mudanca: "o grupo foi cancelado. Você não precisa conduzir este tour." });
    } else if (g.ambassador_id) notifyAmb(g, g.ambassador_id, "M10", `saiu:b${bid}:${now()}`, { mudanca: `saiu ${who} do grupo.` });
  }
  function cancel(bid, actor = "candidate", actorId = null, reason = "") {
    const b = byId("bookings", bid), f = full(bid);
    if (!b || !ACTIVE.includes(b.status)) throw new DomainError("Esta visita não pode mais ser cancelada.", "estado_invalido", 409);
    if (actor === "candidate" && parse(f.slot_start) - nowMs() < DB.config.cancel_cutoff_hours * H)
      throw new DomainError(`O cancelamento pelo link fecha ${DB.config.cancel_cutoff_hours}h antes do tour. Fale com Admissões.`, "prazo", 409);
    const st = actor === "candidate" ? "cancelado_candidato" : "cancelado_admissoes";
    Object.assign(b, { status: st, outcome: st, cancelled_at: now(), cancel_reason: reason, updated_at: now() });
    logEvent("booking", bid, "booking.cancelled", actor, actorId, { motivo: reason });
    enqueueCandidate(f, "M5", candVars(f), "cancelado");
    queueCrm(bid, "updateTourStatus", { status: st });
    afterLeave(b.tour_group_id, firstName(f.full_name), bid);
    return full(bid);
  }
  function reschedule(bid, newSlot, actor = "candidate", actorId = null) {
    const b = byId("bookings", bid), f = full(bid);
    if (!b || !ACTIVE.includes(b.status)) throw new DomainError("Esta visita não pode mais ser reagendada.", "estado_invalido", 409);
    const cfg = DB.config;
    if (actor === "candidate") {
      if (parse(f.slot_start) - nowMs() < cfg.cancel_cutoff_hours * H) throw new DomainError(`O reagendamento pelo link fecha ${cfg.cancel_cutoff_hours}h antes do tour.`, "prazo", 409);
      if (b.reschedule_count >= cfg.max_reschedules) throw new DomainError(`Você já reagendou ${cfg.max_reschedules} vezes. Fale com Admissões.`, "limite_reagendamento", 409);
    }
    if (newSlot === f.slot_start) throw new DomainError("Escolha um horário diferente do atual.", "validacao", 422);
    const [ds, t] = slotKey(newSlot);
    const [ok, reason] = slotBookable(ds, t, actor === "admissions");
    if (!ok) throw new DomainError(reason, "horario_invalido", 409);
    const oldG = b.tour_group_id;
    const [g, created] = place(newSlot, b.party_size, bid);
    const hasAmb = !!(g.ambassador_id || g.handled_by_admissions);
    Object.assign(b, { tour_group_id: g.id, status: hasAmb ? "confirmado" : "aguardando_embaixador", confirmed_at: hasAmb ? now() : null,
      reschedule_count: b.reschedule_count + (actor === "candidate" ? 1 : 0), reminder_sent_at: null, presence_confirmed_at: null, updated_at: now() });
    logEvent("booking", bid, "booking.rescheduled", actor, actorId, { de: f.slot_start, para: newSlot });
    afterLeave(oldG, firstName(f.full_name), bid);
    const nb = full(bid);
    enqueueCandidate(nb, "M4", candVars(nb), `${newSlot}:${now()}`);
    queueCrm(bid, "updateTourStatus", { status: "reagendado" });
    if (created) startAllocation(g.id);
    else if (hasAmb) {
      enqueueCandidate(nb, "M2", candVars(nb), `a${nb.ambassador_id || "adm"}:${newSlot}`);
      if (g.ambassador_id) notifyAmb(g, g.ambassador_id, "M10", `entrou:b${bid}:${now()}`, { mudanca: `entrou ${firstName(nb.full_name)} (${nb.party_size} pessoa(s)).` });
    }
    return nb;
  }
  function markAttendance(gid, marks, actor = "ambassador", actorId = null) {
    const g = byId("groups", gid);
    if (!g) throw new DomainError("Tour não encontrado.", "nao_encontrado", 404);
    if (actor === "ambassador" && g.ambassador_id !== actorId) throw new DomainError("Este tour não é seu.", "proibido", 403);
    if (parse(g.slot_start) - 30 * 60e3 > nowMs()) throw new DomainError("A presença só pode ser marcada no dia do tour. Avance o relógio na barra de simulação.", "cedo_demais", 409);
    for (const m of marks) {
      const b = byId("bookings", +m.booking_id);
      if (!b || b.tour_group_id !== gid || b.status.startsWith("cancelado") || b.status === "encerrado") continue;
      const att = !!m.attended;
      const ex = DB.attendance.find((a) => a.booking_id === b.id);
      if (ex) Object.assign(ex, { attended: att, marked_by: actor, marked_at: now() });
      else insert("attendance", { booking_id: b.id, attended: att, marked_by: actor, marked_at: now() });
      const st = att ? "realizado" : "nao_compareceu";
      Object.assign(b, { status: st, outcome: st, updated_at: now() });
      logEvent("booking", b.id, `attendance.${st}`, actor, actorId);
      queueCrm(b.id, "updateTourStatus", { status: st });
      const f = full(b.id);
      if (att && !DB.nps.some((n) => n.booking_id === b.id)) enqueueCandidate(f, "M6", candVars(f), "fim_do_tour");
      if (!att) queueCrm(b.id, "closeActivity", { result: "nao_compareceu" });
    }
    const left = DB.bookings.filter((b) => b.tour_group_id === gid && ["confirmado", "presenca_pendente", "aguardando_embaixador", "excecao"].includes(b.status)).length;
    if (!left && g.status !== "realizado") { g.status = "realizado"; logEvent("group", gid, "tour.completed", actor, actorId); }
  }
  function closeBooking(bid, result) {
    const b = byId("bookings", bid);
    if (!b || b.status !== "realizado") return false;
    Object.assign(b, { status: "encerrado", closed_at: now(), updated_at: now() });
    logEvent("booking", bid, "booking.closed", "system", null, { resultado: result });
    queueCrm(bid, "closeActivity", { result });
    return true;
  }
  function submitNps(bid, data) {
    const b = byId("bookings", bid), f = full(bid);
    if (!b) throw new DomainError("Visita não encontrada.", "nao_encontrado", 404);
    if (DB.nps.some((n) => n.booking_id === bid)) throw new DomainError("Você já respondeu. Obrigado!", "ja_respondido", 409);
    if (parse(f.slot_start) > nowMs()) throw new DomainError("A avaliação abre depois do tour. Avance o relógio na barra de simulação.", "cedo_demais", 409);
    const score = +data.score;
    if (!(score >= 0 && score <= 10)) throw new DomainError("Escolha uma nota de 0 a 10.", "validacao", 422);
    if (["confirmado", "presenca_pendente"].includes(b.status)) markAttendance(b.tour_group_id, [{ booking_id: bid, attended: true }], "system");
    insert("nps", { booking_id: bid, score, highlight: data.highlight || "", improvement: data.improvement || "", ambassador_rating: data.ambassador_rating || null, created_at: now() });
    logEvent("booking", bid, "nps.received", "candidate", null, { score });
    closeBooking(bid, "nps_respondido");
  }

  // ------------------------------------------------------------ jobs (idempotentes)
  const afterLocal = (hhmm) => { const p = lp(nowMs()); const [h, m] = hhmm.split(":").map(Number); return p.hour * 60 + p.minute >= h * 60 + m; };
  const dayBounds = (ds) => [localSlot(ds, "00:00"), localSlot(ds, "00:00") + D];
  const JOBS = {
    "expire-invitations": () => {
      let n = 0;
      DB.invitations.filter((i) => i.status === "enviado" && parse(i.expires_at) <= nowMs()).forEach((i) => {
        Object.assign(i, { status: "expirado", responded_at: now() }); logEvent("invitation", i.id, "invitation.expired"); sendNext(i.tour_group_id); n++;
      });
      DB.groups.filter((g) => g.status === "aberto" && !g.ambassador_id && !g.handled_by_admissions && !g.in_exception && parse(g.deadline_at) <= nowMs())
        .forEach((g) => openException(g.id, "Prazo limite atingido sem aceite de embaixador."));
      DB.invitations.filter((i) => i.status === "enviado" && !i.reminder_sent_at).forEach((i) => {
        const s = parse(i.sent_at), e = parse(i.expires_at);
        if (nowMs() >= s + (e - s) / 2) { i.reminder_sent_at = now(); notifyAmb(byId("groups", i.tour_group_id), i.ambassador_id, "M8", i.id, { prazo: `${fmtDate(e)}, às ${fmtTime(e)}` }); }
      });
      return n;
    },
    "send-reminders": () => {
      if (!afterLocal(DB.config.reminder_time)) return 0;
      const [s, e] = dayBounds(addDays(todayLocal(), 1));
      let n = 0;
      DB.bookings.filter((b) => ACTIVE.includes(b.status) && !b.reminder_sent_at).forEach((b) => {
        const f = full(b.id), ms = parse(f.slot_start);
        if (ms < s || ms >= e || ms - parse(b.created_at) < 24 * H) return;
        b.reminder_sent_at = now(); n += enqueueCandidate(f, "M3", candVars(f), f.slot_start) ? 1 : 0;
      });
      return n;
    },
    "ambassador-day-before": () => {
      if (!afterLocal("18:00")) return 0;
      const [s, e] = dayBounds(addDays(todayLocal(), 1));
      const gs = DB.groups.filter((g) => g.status === "com_embaixador" && g.ambassador_id && parse(g.slot_start) >= s && parse(g.slot_start) < e);
      gs.forEach((g) => notifyAmb(g, g.ambassador_id, "M9", "d-1"));
      return gs.length;
    },
    "mark-attendance-pending": () => {
      const [s] = dayBounds(todayLocal());
      let n = 0;
      DB.bookings.filter((b) => ["confirmado", "aguardando_embaixador", "excecao"].includes(b.status)).forEach((b) => {
        if (parse(byId("groups", b.tour_group_id).slot_start) < s) { b.status = "presenca_pendente"; n++; }
      });
      return n;
    },
    "attendance-pending": () => {
      if (!afterLocal("09:00")) return 0;
      const [s, e] = dayBounds(addDays(todayLocal(), -1));
      const gs = DB.groups.filter((g) => parse(g.slot_start) >= s && parse(g.slot_start) < e && DB.bookings.some((b) => b.tour_group_id === g.id && b.status === "presenca_pendente"));
      gs.forEach((g) => { if (g.ambassador_id) notifyAmb(g, g.ambassador_id, "M12", "pendente"); });
      return gs.length;
    },
    "nps-followup": () => {
      if (!afterLocal("10:00")) return 0;
      const [s, e] = dayBounds(addDays(todayLocal(), -1));
      let n = 0;
      DB.bookings.filter((b) => b.status === "realizado" && !DB.nps.some((x) => x.booking_id === b.id)).forEach((b) => {
        const f = full(b.id), ms = parse(f.slot_start);
        if (ms >= s && ms < e) n += enqueueCandidate(f, "M6", candVars(f), "d+1") ? 1 : 0;
      });
      return n;
    },
    "close-crm-activity": () => {
      const limitDay = afterLocal("23:00") ? addDays(todayLocal(), -1) : addDays(todayLocal(), -2);
      const [, end] = dayBounds(limitDay);
      let n = 0;
      DB.bookings.filter((b) => b.status === "realizado").forEach((b) => { if (parse(full(b.id).slot_start) < end) n += closeBooking(b.id, "sem_resposta_nps") ? 1 : 0; });
      return n;
    },
    "exceptions-digest": () => {
      if (!afterLocal("08:00")) return 0;
      const gs = DB.groups.filter((g) => g.in_exception && g.status === "aberto");
      if (!gs.length) return 0;
      notifyAdm("M11D", todayLocal(), { qtd: gs.length, lista: gs.map((g) => `• ${fmtDate(parse(g.slot_start))}, ${fmtTime(parse(g.slot_start))} — ${groupPeople(g.id)} pessoa(s)`).join("\n") });
      return gs.length;
    },
    "crm-retry": () => 0,
  };
  function runJobs() {
    const res = {};
    for (const [name, fn] of Object.entries(JOBS)) {
      try { res[name] = fn(); DB.jobRuns.push({ job: name, started_at: now(), status: "ok", detail: String(res[name]) }); }
      catch (e) { res[name] = "falhou"; DB.jobRuns.push({ job: name, started_at: now(), status: "falhou", detail: String(e && e.stack || e) }); }
    }
    DB.jobRuns = DB.jobRuns.slice(-300);
    return res;
  }

  // ------------------------------------------------------------ indicadores
  function dashboard(from, to) {
    const [s] = dayBounds(from), [, e] = dayBounds(to), cfg = DB.config;
    const bs = DB.bookings.map((b) => full(b.id)).filter((b) => parse(b.slot_start) >= s && parse(b.slot_start) < e);
    const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : null);
    const avg = (xs) => (xs.length ? Math.round(10 * xs.reduce((a, b) => a + b, 0) / xs.length) / 10 : null);
    const p90 = (xs) => { if (!xs.length) return null; const y = [...xs].sort((a, b) => a - b); return Math.round(10 * y[Math.min(y.length - 1, Math.round(0.9 * (y.length - 1)))]) / 10; };
    const realized = bs.filter((b) => b.outcome === "realizado"), noShow = bs.filter((b) => b.outcome === "nao_compareceu");
    const cc = bs.filter((b) => b.status === "cancelado_candidato"), ca = bs.filter((b) => b.status === "cancelado_admissoes");
    const early = cc.filter((b) => b.cancelled_at && parse(b.slot_start) - parse(b.cancelled_at) >= cfg.metric_cancel_exclusion_hours * H);
    const first = bs.map((b) => { const n = DB.notifications.find((x) => x.booking_id === b.id && x.template_code === "M1" && x.channel === "email"); return n ? (parse(n.sent_at) - parse(b.created_at)) / 1000 : null; }).filter((x) => x !== null);
    const tourConf = bs.filter((b) => b.confirmed_at).map((b) => (parse(b.confirmed_at) - parse(b.created_at)) / H);
    const groups = DB.groups.filter((g) => parse(g.slot_start) >= s && parse(g.slot_start) < e);
    const gids = new Set(groups.map((g) => g.id)), bids = new Set(bs.map((b) => b.id));
    const realizedGroups = new Set(realized.map((b) => b.tour_group_id));
    const manual = DB.events.filter((ev) => ev.is_manual && ((ev.entity_type === "booking" && bids.has(ev.entity_id)) || (ev.entity_type === "group" && gids.has(ev.entity_id)))).length;
    const exc = groups.filter((g) => g.exception_opened_at);
    const resol = exc.filter((g) => g.exception_resolved_at).map((g) => (parse(g.exception_resolved_at) - parse(g.exception_opened_at)) / H);
    const invs = DB.invitations.filter((i) => gids.has(i.tour_group_id) && i.sent_at && i.rank > 0);
    const acc = invs.filter((i) => ["aceito", "desistiu"].includes(i.status));
    const resp = invs.filter((i) => i.responded_at && ["aceito", "recusado", "desistiu"].includes(i.status)).map((i) => (parse(i.responded_at) - parse(i.sent_at)) / H);
    const nps = DB.nps.filter((n) => bids.has(n.booking_id));
    const prom = nps.filter((n) => n.score >= 9).length, det = nps.filter((n) => n.score <= 6).length;
    const occ = {};
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!cfg.weekdays.includes(weekdayOf(d))) continue;
      for (const t of cfg.start_times) {
        const k = weekdayOf(d) + "|" + t;
        occ[k] = occ[k] || [0, 0];
        occ[k][1] += DB.ambassadors.filter((a) => ambassadorAvailable(a, d, t)).length * cfg.group_capacity;
      }
    }
    bs.filter((b) => !b.status.startsWith("cancelado")).forEach((b) => { const p = lp(parse(b.slot_start)); const k = p.weekday + "|" + p.time; occ[k] = occ[k] || [0, 0]; occ[k][0] += b.party_size; });
    const byCourse = {};
    bs.forEach((b) => { const c = b.course_interest; byCourse[c] = byCourse[c] || { course: c, total: 0, treineiros: 0 }; byCourse[c].total++; if (b.is_treineiro) byCourse[c].treineiros++; });
    const ratings = nps.filter((n) => n.ambassador_rating).map((n) => +n.ambassador_rating);
    return {
      totals: { bookings: bs.length, realized: realized.length, no_show: noShow.length, cancelled_candidate: cc.length, cancelled_admissions: ca.length,
        presence_pending: bs.filter((b) => b.status === "presenca_pendente").length },
      realized_rate: { gross: pct(realized.length, bs.length), adjusted: pct(realized.length, bs.length - early.length), target: 85, baseline: 63, exclusion_hours: cfg.metric_cancel_exclusion_hours },
      first_confirmation_seconds: { avg: avg(first), p90: p90(first) },
      tour_confirmation_hours: { avg: avg(tourConf) },
      manual_tasks_per_tour: { value: realizedGroups.size ? Math.round(100 * manual / realizedGroups.size) / 100 : null, manual_events: manual, realized_groups: realizedGroups.size, target: 3, baseline: 8 },
      exceptions: { count: exc.length, pct: pct(exc.length, groups.length), avg_resolution_hours: avg(resol) },
      ambassador_acceptance: { rate: pct(acc.length, invs.length), invitations: invs.length, avg_response_hours: avg(resp) },
      nps: { score: nps.length ? Math.round(1000 * (prom - det) / nps.length) / 10 : null, responses: nps.length, response_rate: pct(nps.length, realized.length), ambassador_rating_avg: avg(ratings) },
      occupancy: Object.entries(occ).map(([k, v]) => { const [wd, t] = k.split("|"); return { weekday: +wd, time: t, people: v[0], capacity: v[1], pct: pct(v[0], v[1]) }; }),
      by_course: Object.values(byCourse).sort((a, b) => b.total - a.total),
      funnel: { booked: bs.length, confirmed: bs.filter((b) => b.confirmed_at).length, realized: realized.length, nps: nps.length },
      journey: journey(bs, nps, s, e),
      messages: messagesPanorama(s, e),
      weekly: weekly(from, to, bs),
    };
  }
  // Jornada do período: quantas visitas chegaram a cada etapa e quantas mensagens saíram em cada uma.
  function journey(bs, nps, s, e) {
    const ids = new Set(bs.map((b) => b.id));
    const msgs = (codes) => {
      const ns = DB.notifications.filter((n) => codes.includes(n.template_code) && ((n.booking_id && ids.has(n.booking_id)) || (!n.booking_id && parse(n.created_at) >= s && parse(n.created_at) < e)));
      return { email: ns.filter((n) => n.channel === "email").length, whatsapp: ns.filter((n) => n.channel === "whatsapp").length };
    };
    const invites = DB.invitations.filter((i) => i.sent_at && i.rank > 0 && bs.some((b) => b.tour_group_id === i.tour_group_id));
    const realizedIds = new Set(bs.filter((b) => b.outcome === "realizado").map((b) => b.id));
    const closed = DB.crm.filter((c) => c.operation === "closeActivity" && realizedIds.has(c.booking_id));
    return [
      { key: "booked", label: "Agendados", icon: "calendar", count: bs.length, msg: msgs(["M1"]), note: "confirmação do pedido" },
      { key: "confirmed", label: "Embaixador confirmado", icon: "users", count: bs.filter((b) => b.confirmed_at).length, msg: msgs(["M2"]), note: `${invites.length} convites a embaixadores` },
      { key: "reminded", label: "Lembrados (D-1)", icon: "bell", count: bs.filter((b) => b.reminder_sent_at).length, msg: msgs(["M3"]), note: "lembrete na véspera" },
      { key: "realized", label: "Realizados", icon: "pin", count: bs.filter((b) => b.outcome === "realizado").length, msg: null, note: `${bs.filter((b) => b.outcome === "nao_compareceu").length} não vieram` },
      { key: "nps", label: "Avaliaram", icon: "star", count: nps.length, msg: msgs(["M6"]), note: "pedido de NPS" },
      { key: "closed", label: "Encerrados no CRM", icon: "check-circle", count: new Set(closed.map((c) => c.booking_id)).size, msg: null, note: "sem trabalho manual" },
    ];
  }
  function messagesPanorama(s, e) {
    const ns = DB.notifications.filter((n) => parse(n.created_at) >= s && parse(n.created_at) < e);
    const names = { M1: "Confirmação do pedido", M2: "Embaixador confirmado", M3: "Lembrete D-1", M4: "Reagendamento", M5: "Cancelamento", M6: "Pedido de NPS",
      M7: "Convite ao embaixador", M8: "Lembrete de convite", M9: "Tour de amanhã", M10: "Mudança no grupo", M11: "Alerta de exceção", M11D: "Resumo de exceções",
      M12: "Presença pendente", MX1: "Proposta de nova data", MX2: "Visita já existente" };
    const aud = { M1: "candidato", M2: "candidato", M3: "candidato", M4: "candidato", M5: "candidato", M6: "candidato", MX1: "candidato", MX2: "candidato",
      M7: "embaixador", M8: "embaixador", M9: "embaixador", M10: "embaixador", M12: "embaixador", M11: "admissoes", M11D: "admissoes" };
    const by = {};
    ns.forEach((n) => { by[n.template_code] = (by[n.template_code] || 0) + 1; });
    return { total: ns.length, email: ns.filter((n) => n.channel === "email").length, whatsapp: ns.filter((n) => n.channel === "whatsapp").length,
      failed: ns.filter((n) => n.status === "falhou").length,
      by_audience: ["candidato", "embaixador", "admissoes"].map((a) => ({ audience: a, count: ns.filter((n) => (aud[n.template_code] || "candidato") === a).length })),
      by_template: Object.entries(by).map(([code, count]) => ({ code, name: names[code] || code, audience: aud[code] || "candidato", count })).sort((a, b) => b.count - a.count) };
  }

  function weekly(from, to, bs) {
    const monday = (ds) => addDays(ds, -weekdayOf(ds));
    const out = [];
    for (let w = monday(from); w <= to; w = addDays(w, 7)) {
      const [s] = dayBounds(w), e = s + 7 * D;
      const inW = bs.filter((b) => parse(b.slot_start) >= s && parse(b.slot_start) < e);
      out.push({ week_start: w, bookings: inW.length, realized: inW.filter((b) => b.outcome === "realizado").length });
    }
    return out;
  }
  function ambassadorStats(aid) {
    const gs = DB.groups.filter((g) => g.ambassador_id === aid);
    const done = gs.filter((g) => g.status === "realizado");
    const monthStart = todayLocal().slice(0, 8) + "01";
    const since = nowMs() - 90 * D;
    const invs = DB.invitations.filter((i) => i.ambassador_id === aid && i.rank > 0 && i.sent_at && parse(i.sent_at) >= since && i.status !== "enviado");
    const accepted = invs.filter((i) => ["aceito", "desistiu"].includes(i.status));
    const gids = new Set(gs.map((g) => g.id));
    const myBookings = DB.bookings.filter((b) => gids.has(b.tour_group_id));
    const ratings = DB.nps.filter((n) => n.ambassador_rating && gids.has(byId("bookings", n.booking_id).tour_group_id)).map((n) => +n.ambassador_rating);
    return {
      tours_total: done.length,
      tours_month: done.filter((g) => lp(parse(g.slot_start)).date >= monthStart).length,
      upcoming: gs.filter((g) => g.status === "com_embaixador" && parse(g.slot_start) > nowMs()).length,
      people_total: myBookings.filter((b) => b.outcome === "realizado").reduce((s, b) => s + b.party_size, 0),
      accept_rate: invs.length ? Math.round(100 * accepted.length / invs.length) : null,
      fast_accepts: accepted.filter((i) => parse(i.responded_at) - parse(i.sent_at) <= H).length,
      rating_avg: ratings.length ? Math.round(10 * ratings.reduce((a, b) => a + b, 0) / ratings.length) / 10 : null,
      five_stars: ratings.filter((r) => r === 5).length,
      foreign_tours: myBookings.filter((b) => b.outcome === "realizado" && b.language !== "Português").length,
      pending_presence: myBookings.filter((b) => b.status === "presenca_pendente").length,
      gifts_pending: DB.gifts.filter((g) => g.ambassador_id === aid && !g.collected_at).length,
      game: gamification(aid, done, accepted, gids),
    };
  }

  // Pontos do semestre (referência: Uber Pro), sequência semanal (Duolingo) e desafios do mês.
  // Horário em alta = quinta ou sexta, às 10h ou 15h (os mais procurados nos dados de Admissões).
  const isHot = (slot_start) => { const p = lp(parse(slot_start)); return [3, 4].includes(p.weekday) && ["10:00", "15:00"].includes(p.time); };
  const POINTS = { tour: 10, hot: 5, fast: 2, five: 3 };
  function gamification(aid, done, accepted, gids) {
    const since = nowMs() - 182 * D, monthStart = todayLocal().slice(0, 8) + "01";
    const sem = done.filter((g) => parse(g.slot_start) >= since);
    const fastAll = accepted.filter((i) => parse(i.responded_at) - parse(i.sent_at) <= H);
    const fiveSem = DB.nps.filter((n) => +n.ambassador_rating === 5 && parse(n.created_at) >= since && gids.has(byId("bookings", n.booking_id).tour_group_id)).length;
    const parts = { tours: sem.length * POINTS.tour, hot: sem.filter((g) => isHot(g.slot_start)).length * POINTS.hot,
      fast: fastAll.filter((i) => parse(i.responded_at) >= since).length * POINTS.fast, five: fiveSem * POINTS.five };
    // sequência: semanas seguidas com tour realizado ou confirmado (a semana atual conta se tiver tour)
    const monday = (ds) => addDays(ds, -weekdayOf(ds));
    const weeks = new Set(DB.groups.filter((g) => g.ambassador_id === aid && ["realizado", "com_embaixador"].includes(g.status)).map((g) => monday(lp(parse(g.slot_start)).date)));
    let w = monday(todayLocal()), streak = 0;
    const thisWeek = weeks.has(w);
    if (!thisWeek) w = addDays(w, -7);
    while (weeks.has(w)) { streak++; w = addDays(w, -7); }
    const month = done.filter((g) => lp(parse(g.slot_start)).date >= monthStart);
    const fastMonth = fastAll.filter((i) => lp(parse(i.responded_at)).date >= monthStart).length;
    return {
      points: Object.values(parts).reduce((a, b) => a + b, 0), parts, rules: POINTS, streak, this_week: thisWeek,
      challenges: [
        { id: "tours3", title: "Conduza 3 tours no mês", progress: month.length, goal: 3, reward: 15 },
        { id: "hot1", title: "Um tour em horário em alta", progress: month.filter((g) => isHot(g.slot_start)).length, goal: 1, reward: 5 },
        { id: "fast2", title: "Aceite 2 convites em até 1 h", progress: fastMonth, goal: 2, reward: 4 },
      ],
    };
  }

  // Oportunidades (referência: tela de corridas disponíveis do Uber): grupos que ficaram sem embaixador
  // e horários em alta onde falta gente.
  function ambassadorOpportunities(aid) {
    const a = byId("ambassadors", aid), out = { claimable: [], hot: [] };
    DB.groups.filter((g) => g.status === "aberto" && g.in_exception && parse(g.slot_start) > nowMs() + 2 * H)
      .sort((x, y) => parse(x.slot_start) - parse(y.slot_start)).forEach((g) => {
        if (busyAt(g.slot_start, g.id).has(aid)) return;
        const bs = groupBookings(g.id).map((b) => full(b.id));
        out.claimable.push({ group_id: g.id, slot_start: g.slot_start, people: bs.reduce((x, b) => x + b.party_size, 0),
          courses: [...new Set(bs.map((b) => b.course_interest))], hot: isHot(g.slot_start) });
      });
    const today = todayLocal();
    computeSlots(addDays(today, 1), addDays(today, 14), 1).filter((s) => isHot(s.slot_start) && !s.reason).forEach((s) => {
      if (ambassadorAvailable(a, s.date, s.time)) return;
      const st = slotState(s.slot_start);
      const booked = st.groups.reduce((x, g) => x + g.booked, 0);
      out.hot.push({ date: s.date, time: s.time, slot_start: s.slot_start, booked, ambassadors: slotState(s.slot_start).groups.length, remaining: s.remaining });
    });
    out.hot = out.hot.sort((x, y) => x.remaining - y.remaining || parse(x.slot_start) - parse(y.slot_start)).slice(0, 4);
    return out;
  }

  function claimGroup(gid, aid) {
    const g = byId("groups", gid);
    if (!g || g.status !== "aberto" || !g.in_exception) throw new DomainError("Este tour já foi assumido por outra pessoa.", "indisponivel", 409);
    if (busyAt(g.slot_start, gid).has(aid) || DB.groups.some((x) => x.slot_start === g.slot_start && x.ambassador_id === aid && x.status === "com_embaixador"))
      throw new DomainError("Você já tem um tour neste horário.", "conflito", 409);
    insert("invitations", { tour_group_id: gid, ambassador_id: aid, rank: 0, status: "aceito", sent_at: now(), responded_at: now(), created_at: now() });
    assign(gid, aid);
    logEvent("group", gid, "group.claimed", "ambassador", aid);
  }

  window.Backend = {
    get DB() { return DB; }, set DB(v) { DB = v; }, DomainError, ACTIVE, H, D,
    nowMs, now, iso, parse, lp, localSlot, slotKey, todayLocal, addDays, weekdayOf, fmtDate, fmtTime, firstName,
    blank, insert, byId, save, load, logEvent, enqueue, enqueueCandidate, ambassadorAvailable, allocate, computeSlots, slotState, full,
    ambLabel, candVars, safeProfile, groupBookings, groupPeople, busyAt, cpfValid, createBooking, accept, decline, withdraw, resolveException,
    cancel, reschedule, markAttendance, submitNps, runJobs, dashboard, ambassadorStats, ambassadorOpportunities, claimGroup, openException, startAllocation, TEMPLATES, DEFAULT_CONFIG, STORE_KEY,
  };
})();

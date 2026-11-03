/* Dados de exemplo, simulador de cenários e a API REST (seção 14) atendida localmente pelo Backend. */
(function () {
  const B = window.Backend;
  const { H, D } = B;

  // ------------------------------------------------------------ gerador aleatório com semente
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
  const weighted = (r, xs, ws) => { const tot = ws.reduce((a, b) => a + b, 0); let x = r() * tot; for (let i = 0; i < xs.length; i++) { x -= ws[i]; if (x <= 0) return xs[i]; } return xs[xs.length - 1]; };
  function makeCpf(r) {
    const d = Array.from({ length: 9 }, () => Math.floor(r() * 10));
    for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i); d.push((s * 10) % 11 % 10); }
    const c = d.join("");
    return B.cpfValid(c) ? c : makeCpf(r);
  }

  const COURSES = ["Administração", "Economia", "Direito", "Ciência da Computação", "Engenharia de Computação", "Engenharia Mecânica", "Engenharia Mecatrônica", "Ainda não decidi"];
  const AMBS = [["Lucas Martins", "Economia", ["Português", "Inglês"]], ["Mariana Costa", "Administração", ["Português"]], ["Pedro Almeida", "Engenharia de Computação", ["Português", "Inglês"]],
    ["Julia Ferreira", "Direito", ["Português", "Espanhol"]], ["Gabriel Rocha", "Ciência da Computação", ["Português"]], ["Beatriz Nunes", "Economia", ["Português"]],
    ["Rafael Teixeira", "Engenharia Mecânica", ["Português", "Inglês"]], ["Larissa Gomes", "Administração", ["Português"]], ["Thiago Ribeiro", "Engenharia Mecatrônica", ["Português"]],
    ["Camila Duarte", "Direito", ["Português", "Inglês"]], ["Felipe Barros", "Economia", ["Português"]], ["Isabela Moura", "Ciência da Computação", ["Português", "Espanhol"]]];
  const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Fernando", "Giovana", "Henrique", "Isadora", "João", "Kátia", "Leonardo", "Manuela", "Nicolas", "Olívia", "Paulo", "Rafaela", "Samuel", "Tatiana", "Vinícius", "Yasmin", "Arthur", "Helena", "Miguel"];
  const LAST = ["Andrade", "Barbosa", "Cardoso", "Dias", "Esteves", "Freitas", "Guimarães", "Hoffmann", "Lacerda", "Macedo", "Nogueira", "Pacheco", "Queiroz", "Siqueira", "Toledo", "Vasconcelos"];
  const QUESTIONS = ["", "", "", "Quero conhecer os laboratórios.", "Como funciona o intercâmbio?", "Tenho interesse nas ligas e entidades.", "Quero saber sobre bolsas."];
  const TIMES_W = [["15:00", "10:00", "17:00", "14:00", "16:00"], [5, 4, 3, 2, 1.5]]; // horários mais procurados (Marcelo)
  const DAY_W = { 4: 5, 3: 4, 0: 3, 1: 2.5, 2: 2 }; // sexta > quinta > segunda > terça > quarta
  const deaccent = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let personCounter = 0;
  function person(r) {
    const f = pick(r, FIRST), l = pick(r, LAST);
    personCounter++;
    return { full_name: `${f} ${pick(r, LAST)} ${l}`, email: deaccent(`${f}.${l}${personCounter}@exemplo.com`).toLowerCase() };
  }
  function form(r, slot_start) {
    const p = person(r), comp = pick(r, [0, 0, 1, 1, 1, 2, 2, 3]);
    return Object.assign(p, { email_confirm: p.email, cpf: makeCpf(r), phone: `119${Math.floor(10000000 + r() * 89999999)}`, course_interest: pick(r, COURSES.slice(0, 7).concat(COURSES.slice(0, 3))),
      is_treineiro: r() < 0.3, companions: comp, companions_names: [], mobility_restriction: r() < 0.05, mobility_notes: "", language: r() < 0.05 ? "Inglês" : "Português",
      questions: pick(r, QUESTIONS), privacy_accepted: true, whatsapp_opt_in: r() < 0.6, slot_start });
  }

  function seed() {
    B.DB = B.blank();
    const DB = B.DB, r = rng(42), now = B.now();
    COURSES.forEach((c, i) => B.insert("courses", { name: c, active: true, ord: i }));
    [["Beatriz Lima", "beatriz.admissoes@exemplo.com"], ["Carlos Souza", "carlos.admissoes@exemplo.com"]].forEach(([name, email]) => B.insert("users", { name, email, role: "admissions", created_at: now }));
    AMBS.forEach(([name, course, langs]) => {
      const u = B.insert("users", { name, email: deaccent(name.toLowerCase().replace(" ", ".")) + "@exemplo.com", role: "ambassador", created_at: now });
      const a = B.insert("ambassadors", { user_id: u.id, display_name: name, course, languages: langs, phone: "", active: true, availability_updated_at: B.iso(B.nowMs() - pick(r, [2, 5, 12, 40]) * D), created_at: now });
      const w = { 4: 0.75, 3: 0.65, 0: 0.5, 1: 0.4, 2: 0.35 };
      DB.config.weekdays.forEach((wd) => DB.config.start_times.forEach((t) => { if (r() < w[wd]) B.insert("rules", { ambassador_id: a.id, weekday: wd, start_time: t }); }));
    });
    const year = B.lp(B.nowMs()).year;
    B.insert("blackouts", { date: `${year}-11-15`, start_time: null, reason: "Feriado — Proclamação da República" });
    B.insert("blackouts", { date: `${year}-11-20`, start_time: null, reason: "Feriado — Dia da Consciência Negra" });
    // histórico: 60 agendamentos nos últimos 30 dias, criados pelo fluxo real com o relógio no passado
    const realOffset = DB.clockOffset;
    const today = B.todayLocal();
    const past = [];
    for (let i = 1; i <= 30; i++) { const d = B.addDays(today, -i); if (DB.config.weekdays.includes(B.weekdayOf(d))) past.push(d); }
    // os pedidos são criados em ordem cronológica, para o relógio da simulação só andar para a frente
    const plan = Array.from({ length: 90 }, () => {
      const d = weighted(r, past, past.map((x) => DAY_W[B.weekdayOf(x)]));
      const slotMs = B.localSlot(d, weighted(r, TIMES_W[0], TIMES_W[1]));
      return { slotMs, createMs: slotMs - (2 + r() * 10) * D };
    }).sort((a, b) => a.createMs - b.createMs);
    let made = 0;
    for (const p of plan) {
      if (made >= 60) break;
      DB.clockOffset = realOffset + (p.createMs - (Date.now() + realOffset * 1000)) / 1000;
      try { B.createBooking(form(r, B.iso(p.slotMs))); made++; } catch (e) { /* horário cheio */ }
      respondAll(r, { accept: 0.8 });
    }
    // os tours passados acontecem: presença, faltas, cancelamentos e NPS
    const pastBookings = DB.bookings.map((b) => B.full(b.id)).sort((a, b) => B.parse(a.slot_start) - B.parse(b.slot_start));
    for (const b of pastBookings) {
      const slotMs = B.parse(b.slot_start);
      const bk = B.byId("bookings", b.id);
      if (!B.ACTIVE.includes(bk.status)) continue;
      const x = r();
      if (x < 0.08) { DB.clockOffset = realOffset + (slotMs - pick(r, [3, 30, 72, 120]) * H - Date.now() - realOffset * 1000) / 1000; try { B.cancel(b.id, "candidate", null, "não poderei ir"); } catch (e) { /* ignora */ } continue; }
      if (x < 0.10) { DB.clockOffset = realOffset + (slotMs - 30 * H - Date.now() - realOffset * 1000) / 1000; try { B.cancel(b.id, "admissions", 1, "cancelado por Admissões"); } catch (e) { /* ignora */ } continue; }
      const g = B.byId("groups", bk.tour_group_id);
      if (!g.ambassador_id && !g.handled_by_admissions) {
        DB.clockOffset = realOffset + (slotMs - 20 * H - Date.now() - realOffset * 1000) / 1000;
        if (!g.in_exception) B.openException(g.id, "Nenhum embaixador disponível aceitou o convite.");
        B.resolveException(g.id, "admissoes_conduz", 1);
      }
      if (slotMs - B.parse(bk.created_at) >= 24 * H) { // lembrete D-1 às 10h da véspera
        const p = B.lp(slotMs - D);
        DB.clockOffset = realOffset + (B.localSlot(p.date, "10:00") - Date.now() - realOffset * 1000) / 1000;
        const fb = B.full(b.id);
        if (["confirmado", "aguardando_embaixador", "excecao"].includes(fb.status)) { bk.reminder_sent_at = B.now(); B.enqueueCandidate(fb, "M3", B.candVars(fb), fb.slot_start); }
      }
      if (x > 0.97) continue; // presença pendente
      DB.clockOffset = realOffset + (slotMs + H - Date.now() - realOffset * 1000) / 1000;
      const attended = x < 0.83;
      B.markAttendance(g.id, [{ booking_id: b.id, attended }], "system");
      if (attended && r() < 0.7) {
        DB.clockOffset += r() * 20 * 3600;
        B.submitNps(b.id, { score: weighted(r, [0, 3, 5, 6, 7, 8, 9, 10], [0.3, 0.5, 0.5, 1, 2, 5, 9, 14]), highlight: pick(r, ["A conversa com o embaixador.", "Os laboratórios.", "A biblioteca.", ""]), ambassador_rating: pick(r, [4, 5, 5, 3]) });
      }
    }
    DB.clockOffset = realOffset;
    B.runJobs();
    // agenda futura: 40 agendamentos nos próximos 14 dias
    simulateDemand(40, 14, rng(7), { ignoreWindow: true });
    const r2 = rng(9);
    const open = DB.groups.filter((g) => g.status === "aberto" && !g.in_exception);
    open.forEach((g, i) => {
      const inv = DB.invitations.find((x) => x.tour_group_id === g.id && x.status === "enviado");
      if (!inv) return;
      if (i === 1 || i === 4) { B.openException(g.id, "Nenhum embaixador disponível aceitou o convite."); return; }
      const x = r2();
      if (x < 0.15) B.decline(inv.id, inv.ambassador_id, "Tenho aula neste horário");
      else if (x < 0.75) B.accept(inv.id, inv.ambassador_id);
    });
    DB.session = { userId: null, persona: "candidato" };
    B.save();
  }

  // ------------------------------------------------------------ simulador de cenários
  function simulateDemand(n, days, r, opts = {}) {
    r = r || rng(Date.now() % 100000);
    const DB = B.DB, today = B.todayLocal();
    const days_ = [];
    for (let i = 1; i <= days; i++) { const d = B.addDays(today, i); if (DB.config.weekdays.includes(B.weekdayOf(d))) days_.push(d); }
    let made = 0, full = 0, tries = 0;
    while (made < n && tries < n * 10) {
      tries++;
      const d = weighted(r, days_, days_.map((x) => DAY_W[B.weekdayOf(x)]));
      const t = weighted(r, TIMES_W[0], TIMES_W[1]);
      try { B.createBooking(form(r, B.iso(B.localSlot(d, t))), { ignoreWindow: opts.ignoreWindow }); made++; } catch (e) { if (e.code === "esgotado") full++; }
    }
    return { made, full };
  }
  function respondAll(r, { accept = 0.75, decline = 0.15 } = {}) {
    r = r || rng(Date.now() % 100000);
    let a = 0, d = 0, guard = 0;
    for (;;) {
      const invs = B.DB.invitations.filter((i) => i.status === "enviado");
      if (!invs.length || guard++ > 500) break;
      let progressed = false;
      for (const inv of invs) {
        const x = r();
        if (x < accept) { try { B.accept(inv.id, inv.ambassador_id); a++; progressed = true; } catch (e) { /* ignora */ } }
        else if (x < accept + decline) { B.decline(inv.id, inv.ambassador_id, "Não posso neste horário"); d++; progressed = true; }
        else inv._skip = true;
      }
      if (!progressed || B.DB.invitations.filter((i) => i.status === "enviado" && !i._skip).length === 0) break;
    }
    B.DB.invitations.forEach((i) => { delete i._skip; });
    return { accepted: a, declined: d };
  }
  function simulateTourDay(r, noShow = 0.15, npsRate = 0.6) {
    r = r || rng(Date.now() % 100000);
    const DB = B.DB, nowMs = B.nowMs();
    let marked = 0, answered = 0;
    DB.groups.filter((g) => ["com_embaixador"].includes(g.status) && B.parse(g.slot_start) <= nowMs - 30 * 60e3).forEach((g) => {
      const marks = B.groupBookings(g.id, false).filter((b) => ["confirmado", "presenca_pendente"].includes(b.status)).map((b) => ({ booking_id: b.id, attended: r() >= noShow }));
      if (!marks.length) return;
      B.markAttendance(g.id, marks, "system");
      marked += marks.length;
      marks.filter((m) => m.attended && r() < npsRate).forEach((m) => {
        try { B.submitNps(m.booking_id, { score: weighted(r, [5, 6, 7, 8, 9, 10], [0.5, 1, 2, 5, 9, 14]), ambassador_rating: pick(r, [4, 5, 5]) }); answered++; } catch (e) { /* ignora */ }
      });
    });
    return { marked, answered };
  }

  // ------------------------------------------------------------ API local
  const routes = [];
  const route = (method, pattern, role, fn) => routes.push([method, new RegExp("^" + pattern + "$"), role, fn]);
  const me = () => B.DB.session && B.DB.session.userId ? B.byId("users", B.DB.session.userId) : null;
  const myAmb = () => { const u = me(); const a = u && B.DB.ambassadors.find((x) => x.user_id === u.id); if (!a) throw new B.DomainError("Escolha um embaixador na barra de simulação.", "nao_encontrado", 404); return a; };
  const tokenOf = (id) => `${id}-${B.byId("bookings", id).token}`;
  const fromToken = (tok) => { const [id, t] = String(tok).split("-"); const b = B.byId("bookings", +id); if (!b || b.token !== t) throw new B.DomainError("Link inválido ou expirado.", "token_invalido", 404); return b; };
  const ACTIVE = B.ACTIVE;

  function publicView(f) {
    const cfg = B.DB.config, ms = B.parse(f.slot_start), active = ACTIVE.includes(f.status);
    const canChange = active && ms - B.nowMs() >= cfg.cancel_cutoff_hours * H;
    const labels = { aguardando_embaixador: "Agendada — aguardando confirmação do embaixador", confirmado: "Confirmada", excecao: "Agendada — estamos confirmando o embaixador",
      cancelado_candidato: "Cancelada", cancelado_admissoes: "Cancelada por Admissões", realizado: "Realizada", encerrado: "Realizada", nao_compareceu: "Não compareceu", presenca_pendente: "Realizada (presença em registro)" };
    return { protocol: f.protocol, status: f.status, status_label: labels[f.status] || f.status, first_name: B.firstName(f.full_name), slot_start: f.slot_start,
      date_label: B.fmtDate(ms), time_label: B.fmtTime(ms), party_size: f.party_size, party: f.party_size,
      ambassador: f.status === "confirmado" || f.group_status === "realizado" ? B.ambLabel(f) : "", meeting_point: cfg.meeting_point, what_to_bring: cfg.what_to_bring,
      can_cancel: canChange, can_reschedule: canChange && f.reschedule_count < cfg.max_reschedules, reschedules_left: Math.max(0, cfg.max_reschedules - f.reschedule_count),
      presence_confirmed: !!f.presence_confirmed_at, cancel_cutoff_hours: cfg.cancel_cutoff_hours, token: tokenOf(f.id),
      nps_open: ["realizado"].includes(f.status) || (["confirmado", "presenca_pendente"].includes(f.status) && ms <= B.nowMs()),
      nps_answered: B.DB.nps.some((n) => n.booking_id === f.id) };
  }

  route("GET", "/api/public/config", null, () => {
    const c = B.DB.config;
    return { courses: B.DB.courses.filter((x) => x.active).sort((a, b) => a.ord - b.ord).map((x) => x.name), languages: c.languages, group_capacity: c.group_capacity,
      hidden_fields: c.hidden_fields, meeting_point: c.meeting_point, what_to_bring: c.what_to_bring, privacy_url: c.privacy_url, virtual_tour_url: c.virtual_tour_url,
      max_days_ahead: c.max_days_ahead, min_lead_hours: c.min_lead_hours, today: B.todayLocal(), now: B.now() };
  });
  route("GET", "/api/public/slots", null, (q) => {
    const c = B.DB.config, today = B.todayLocal();
    const party = Math.max(1, Math.min(c.group_capacity, +q.party || 1));
    const exclude = q.token ? fromToken(q.token).id : null;
    return { party, slots: B.computeSlots(q.from || today, q.to || B.addDays(today, c.max_days_ahead), party, exclude) };
  });
  route("POST", "/api/public/bookings", null, (q, body) => {
    const f = B.createBooking(body);
    B.byId("bookings", f.id).mine = true; // aparece em "Minhas visitas" na visão do candidato
    const inv = B.DB.invitations.find((i) => i.tour_group_id === f.tour_group_id && i.status === "enviado");
    return Object.assign(publicView(B.full(f.id)), { invited: inv ? B.byId("ambassadors", inv.ambassador_id).display_name : null });
  });
  route("GET", "/api/public/bookings/(?<tok>[\\w-]+)", null, (q, b, p) => publicView(B.full(fromToken(p.tok).id)));
  route("POST", "/api/public/bookings/(?<tok>[\\w-]+)/reschedule", null, (q, body, p) => publicView(B.reschedule(fromToken(p.tok).id, body.slot_start)));
  route("POST", "/api/public/bookings/(?<tok>[\\w-]+)/cancel", null, (q, body, p) => publicView(B.cancel(fromToken(p.tok).id, "candidate", null, body.reason)));
  route("POST", "/api/public/bookings/(?<tok>[\\w-]+)/confirm-attendance", null, (q, body, p) => {
    const bk = fromToken(p.tok);
    if (!ACTIVE.includes(bk.status)) throw new B.DomainError("Esta visita não está ativa.", "estado_invalido", 409);
    bk.presence_confirmed_at = B.now(); B.logEvent("booking", bk.id, "booking.presence_confirmed", "candidate");
    return publicView(B.full(bk.id));
  });
  route("GET", "/api/public/nps/(?<tok>[\\w-]+)", null, (q, b, p) => {
    const f = B.full(fromToken(p.tok).id), ms = B.parse(f.slot_start);
    return { first_name: B.firstName(f.full_name), answered: B.DB.nps.some((n) => n.booking_id === f.id), date_label: B.fmtDate(ms), ambassador: B.ambLabel(f), open: ms <= B.nowMs() };
  });
  route("POST", "/api/public/nps/(?<tok>[\\w-]+)", null, (q, body, p) => { B.submitNps(fromToken(p.tok).id, body); return { ok: true }; });
  route("GET", "/api/public/my-bookings", null, () => {
    // atalho do simulador: "sou candidato" lista as visitas criadas neste navegador e as de exemplo
    return { items: B.DB.bookings.slice().reverse().slice(0, 80).map((b) => { const f = B.full(b.id); return { token: tokenOf(b.id), protocol: f.protocol, name: f.full_name, status: f.status, slot_start: f.slot_start, mine: !!b.mine }; }) };
  });

  // embaixador
  function groupForAmb(g, ambId) {
    const ms = B.parse(g.slot_start);
    const people = B.groupBookings(g.id, false).filter((b) => !b.status.startsWith("cancelado")).map((b) => {
      const p = B.safeProfile(B.full(b.id)); const a = B.DB.attendance.find((x) => x.booking_id === b.id);
      p.attended = a ? !!a.attended : null; return p;
    });
    const gift = B.DB.gifts.find((x) => x.tour_group_id === g.id && x.ambassador_id === ambId);
    return { group_id: g.id, slot_start: g.slot_start, date_label: B.fmtDate(ms), time_label: B.fmtTime(ms), status: g.status,
      people_count: people.filter((p) => p.status !== "nao_compareceu").reduce((s, p) => s + p.party_size, 0), people,
      gift_collected: !!(gift && gift.collected_at), has_gift: !!gift, is_today: B.lp(ms).date === B.todayLocal(), is_past: ms < B.nowMs(), can_mark: ms - 30 * 60e3 <= B.nowMs() };
  }
  route("GET", "/api/ambassador/me", "ambassador", () => {
    const a = myAmb(), u = me();
    const stale = !a.availability_updated_at || B.parse(a.availability_updated_at) < B.nowMs() - 30 * D;
    return { ambassador: a, availability_stale: stale, grid: { weekdays: B.DB.config.weekdays, start_times: B.DB.config.start_times },
      courses: B.DB.courses.filter((c) => c.active).map((c) => c.name), languages: B.DB.config.languages, email: u.email };
  });
  route("GET", "/api/ambassador/stats", "ambassador", () => B.ambassadorStats(myAmb().id));
  route("GET", "/api/ambassador/opportunities", "ambassador", () => B.ambassadorOpportunities(myAmb().id));
  route("POST", "/api/ambassador/opportunities/(?<id>\\d+)/claim", "ambassador", (q, b, p) => { B.claimGroup(+p.id, myAmb().id); return { ok: true }; });
  route("POST", "/api/ambassador/availability/add", "ambassador", (q, body) => {
    const a = myAmb();
    B.DB.exceptions = B.DB.exceptions.filter((e) => !(e.ambassador_id === a.id && e.date === body.date && e.start_time === body.start_time));
    B.insert("exceptions", { ambassador_id: a.id, date: body.date, start_time: body.start_time, available: true });
    a.availability_updated_at = B.now();
    return { ok: true };
  });
  route("PUT", "/api/ambassador/profile", "ambassador", (q, body) => { const a = myAmb(); Object.assign(a, { course: body.course || null, languages: body.languages || ["Português"], phone: body.phone || "" }); return { ok: true }; });
  route("GET", "/api/ambassador/availability", "ambassador", () => {
    const a = myAmb(), today = B.todayLocal();
    return { rules: B.DB.rules.filter((r) => r.ambassador_id === a.id), exceptions: B.DB.exceptions.filter((e) => e.ambassador_id === a.id && e.date >= today), updated_at: a.availability_updated_at };
  });
  route("PUT", "/api/ambassador/availability", "ambassador", (q, body) => {
    const a = myAmb(), today = B.todayLocal();
    B.DB.rules = B.DB.rules.filter((r) => r.ambassador_id !== a.id);
    (body.rules || []).forEach((r) => B.insert("rules", { ambassador_id: a.id, weekday: +r.weekday, start_time: r.start_time }));
    B.DB.exceptions = B.DB.exceptions.filter((e) => !(e.ambassador_id === a.id && e.date >= today));
    (body.exceptions || []).forEach((e) => B.insert("exceptions", { ambassador_id: a.id, date: e.date, start_time: e.start_time || null, available: !!e.available }));
    a.availability_updated_at = B.now();
    B.logEvent("ambassador", a.id, "availability.updated", "ambassador", a.id);
    return { ok: true };
  });
  route("GET", "/api/ambassador/invitations", "ambassador", () => {
    const a = myAmb();
    const invitations = B.DB.invitations.filter((i) => i.ambassador_id === a.id && i.status === "enviado").map((i) =>
      Object.assign(groupForAmb(B.byId("groups", i.tour_group_id), a.id), { invitation_id: i.id, expires_at: i.expires_at }));
    const recent = B.DB.invitations.filter((i) => i.ambassador_id === a.id && ["recusado", "expirado", "aceito", "desistiu"].includes(i.status)).slice(-10).reverse()
      .map((i) => ({ status: i.status, responded_at: i.responded_at, slot_start: B.byId("groups", i.tour_group_id).slot_start }));
    return { invitations, recent, now: B.now() };
  });
  route("POST", "/api/ambassador/invitations/(?<id>\\d+)/accept", "ambassador", (q, b, p) => { B.accept(+p.id, myAmb().id); return { ok: true }; });
  route("POST", "/api/ambassador/invitations/(?<id>\\d+)/decline", "ambassador", (q, body, p) => { B.decline(+p.id, myAmb().id, body.reason); return { ok: true }; });
  route("GET", "/api/ambassador/tours", "ambassador", () => {
    const a = myAmb(), start = B.localSlot(B.todayLocal(), "00:00");
    const gs = B.DB.groups.filter((g) => g.ambassador_id === a.id && ["com_embaixador", "realizado"].includes(g.status)).sort((x, y) => B.parse(x.slot_start) - B.parse(y.slot_start));
    const upcoming = gs.filter((g) => B.parse(g.slot_start) >= start).map((g) => groupForAmb(g, a.id));
    const past = gs.filter((g) => B.parse(g.slot_start) < start).map((g) => groupForAmb(g, a.id)).reverse();
    return { upcoming, past: past.slice(0, 30), pending_attendance: past.filter((t) => t.people.some((p) => p.status === "presenca_pendente")) };
  });
  const ambGroup = (id) => { const a = myAmb(), g = B.byId("groups", +id); if (!g || g.ambassador_id !== a.id) throw new B.DomainError("Tour não encontrado.", "nao_encontrado", 404); return [a, g]; };
  route("POST", "/api/ambassador/tours/(?<id>\\d+)/attendance", "ambassador", (q, body, p) => { const [a, g] = ambGroup(p.id); B.markAttendance(g.id, body.marks || [], "ambassador", a.id); return { ok: true }; });
  route("POST", "/api/ambassador/tours/(?<id>\\d+)/gift-collected", "ambassador", (q, body, p) => {
    const [a, g] = ambGroup(p.id); const gift = B.DB.gifts.find((x) => x.tour_group_id === g.id && x.ambassador_id === a.id);
    if (gift) gift.collected_at = body.collected ? B.now() : null;
    return { ok: true };
  });
  route("POST", "/api/ambassador/tours/(?<id>\\d+)/withdraw", "ambassador", (q, body, p) => { const [a, g] = ambGroup(p.id); B.withdraw(g.id, a.id, body.reason); return { ok: true }; });
  route("GET", "/api/ambassador/tours/(?<id>\\d+)/nps-group", "ambassador", (q, b, p) => {
    const [, g] = ambGroup(p.id);
    return { date_label: B.fmtDate(B.parse(g.slot_start)), people: B.groupBookings(g.id, false).filter((x) => ["confirmado", "realizado", "presenca_pendente", "encerrado"].includes(x.status))
      .map((x) => ({ first_name: B.firstName(B.full(x.id).full_name), token: tokenOf(x.id), answered: B.DB.nps.some((n) => n.booking_id === x.id) })) };
  });

  // Admissões
  function adminGroup(g) {
    const ms = B.parse(g.slot_start);
    const bs = B.groupBookings(g.id, false).filter((b) => !b.status.startsWith("cancelado")).map((b) => B.full(b.id));
    const amb = g.ambassador_id && B.byId("ambassadors", g.ambassador_id);
    const inv = B.DB.invitations.find((i) => i.tour_group_id === g.id && i.status === "enviado");
    return { id: g.id, slot_start: g.slot_start, date_label: B.fmtDate(ms), time_label: B.fmtTime(ms), status: g.status, in_exception: !!g.in_exception,
      handled_by_admissions: !!g.handled_by_admissions, capacity: g.capacity, people: bs.reduce((s, b) => s + b.party_size, 0), ambassador: amb ? amb.display_name : null,
      ambassador_id: g.ambassador_id, pending_invite: inv ? { ambassador: B.byId("ambassadors", inv.ambassador_id).display_name, expires_at: inv.expires_at } : null,
      bookings: bs.map((b) => ({ id: b.id, protocol: b.protocol, name: b.full_name, party_size: b.party_size, status: b.status, course: b.course_interest })) };
  }
  route("GET", "/api/admin/dashboard", "admissions", (q) => {
    const d = B.dashboard(q.from, q.to), today = B.todayLocal(), s = B.localSlot(today, "00:00");
    d.today = B.DB.groups.filter((g) => B.parse(g.slot_start) >= s && B.parse(g.slot_start) < s + D && g.status !== "cancelado").sort((a, b) => B.parse(a.slot_start) - B.parse(b.slot_start)).map(adminGroup);
    d.alerts = { open_exceptions: B.DB.groups.filter((g) => g.in_exception && g.status === "aberto").length, presence_pending: B.DB.bookings.filter((b) => b.status === "presenca_pendente").length,
      invites_expiring: B.DB.invitations.filter((i) => i.status === "enviado" && B.parse(i.expires_at) - B.nowMs() < 6 * H).length };
    return d;
  });
  route("GET", "/api/admin/agenda", "admissions", (q) => {
    const s = B.localSlot(q.from, "00:00"), e = B.localSlot(B.addDays(q.to, 1), "00:00");
    return { from: q.from, to: q.to, groups: B.DB.groups.filter((g) => B.parse(g.slot_start) >= s && B.parse(g.slot_start) < e && g.status !== "cancelado").map(adminGroup),
      slots: B.computeSlots(q.from, q.to, 1, null, true), start_times: B.DB.config.start_times, weekdays: B.DB.config.weekdays };
  });
  function bookingRow(b) {
    const f = B.full(b.id), amb = f.ambassador_id && B.byId("ambassadors", f.ambassador_id);
    return Object.assign(f, { ambassador_name: f.handled_by_admissions ? "Admissões" : amb ? amb.display_name : null,
      date_label: new Date(B.parse(f.slot_start)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), time_label: B.fmtTime(B.parse(f.slot_start)) });
  }
  function filterBookings(q) {
    let items = B.DB.bookings.map(bookingRow);
    const term = (q.q || "").trim().toLowerCase(), digits = term.replace(/\D/g, "");
    if (term) items = items.filter((b) => (digits.length === 11 ? b.cpf === digits : [b.full_name, b.email, b.protocol].some((x) => x.toLowerCase().includes(term))));
    if (q.status) items = items.filter((b) => b.status === q.status);
    if (q.course) items = items.filter((b) => b.course_interest === q.course);
    if (q.treineiro === "1" || q.treineiro === "0") items = items.filter((b) => !!b.is_treineiro === (q.treineiro === "1"));
    if (q.from) items = items.filter((b) => B.parse(b.slot_start) >= B.localSlot(q.from, "00:00"));
    if (q.to) items = items.filter((b) => B.parse(b.slot_start) < B.localSlot(B.addDays(q.to, 1), "00:00"));
    return items.sort((a, b) => B.parse(b.slot_start) - B.parse(a.slot_start));
  }
  route("GET", "/api/admin/bookings", "admissions", (q) => ({ items: filterBookings(q).slice(0, 500) }));
  route("GET", "/api/admin/bookings/(?<id>\\d+)", "admissions", (q, b, p) => {
    const r = bookingRow(B.byId("bookings", +p.id));
    const ms = B.parse(r.slot_start);
    return Object.assign(r, { cpf: r.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"), date_label: B.fmtDate(ms), time_label: B.fmtTime(ms), token: tokenOf(r.id),
      events: B.DB.events.filter((e) => (e.entity_type === "booking" && e.entity_id === r.id) || (e.entity_type === "group" && e.entity_id === r.tour_group_id)),
      notifications: B.DB.notifications.filter((n) => n.booking_id === r.id), crm: B.DB.crm.filter((c) => c.booking_id === r.id),
      nps: B.DB.nps.find((n) => n.booking_id === r.id) || null, group: adminGroup(B.byId("groups", r.tour_group_id)) });
  });
  route("PATCH", "/api/admin/bookings/(?<id>\\d+)", "admissions", (q, body, p) => {
    const id = +p.id, uid = me().id;
    if (body.action === "reschedule") B.reschedule(id, body.slot_start, "admissions", uid);
    else if (body.action === "cancel") B.cancel(id, "admissions", uid, body.reason);
    else if (body.action === "resend") { const f = B.full(id); B.enqueueCandidate(f, body.template_code || "M1", B.candVars(f), "reenvio:" + B.now()); B.logEvent("booking", id, "message.resent", "admissions", uid, { template: body.template_code }); }
    else if (body.action === "attendance") B.markAttendance(B.byId("bookings", id).tour_group_id, [{ booking_id: id, attended: !!body.attended }], "admissions", uid);
    else throw new B.DomainError("Ação desconhecida.", "validacao", 422);
    return { ok: true };
  });
  route("GET", "/api/admin/exceptions", "admissions", () => ({ items: B.DB.groups.filter((g) => g.in_exception && g.status === "aberto").sort((a, b) => B.parse(a.slot_start) - B.parse(b.slot_start)).map((g) => {
    const it = adminGroup(g); const ev = B.DB.events.filter((e) => e.entity_type === "group" && e.entity_id === g.id && e.type === "group.exception_opened").pop();
    it.reason = ev ? ev.payload.motivo : ""; it.hours_left = Math.round(10 * (B.parse(g.slot_start) - B.nowMs()) / H) / 10; return it;
  }) }));
  route("GET", "/api/admin/groups/(?<id>\\d+)/available-ambassadors", "admissions", (q, b, p) => {
    const g = B.byId("groups", +p.id), [ds, t] = B.slotKey(g.slot_start), busy = B.busyAt(g.slot_start, g.id);
    return { items: B.DB.ambassadors.filter((a) => a.active).map((a) => ({ id: a.id, name: a.display_name, course: a.course, available: B.ambassadorAvailable(a, ds, t), busy: busy.has(a.id) }))
      .sort((x, y) => (x.available === y.available ? 0 : x.available ? -1 : 1) || (x.busy - y.busy) || x.name.localeCompare(y.name)) };
  });
  route("POST", "/api/admin/exceptions/(?<id>\\d+)/resolve", "admissions", (q, body, p) => { B.resolveException(+p.id, body.action, me().id, body.ambassador_id ? +body.ambassador_id : null); return { ok: true }; });
  route("GET", "/api/admin/ambassadors", "admissions", () => {
    const since = B.nowMs() - 90 * D;
    return { items: B.DB.ambassadors.map((a) => {
      const invs = B.DB.invitations.filter((i) => i.ambassador_id === a.id && i.sent_at && i.rank > 0 && B.parse(i.sent_at) >= since);
      const ratings = B.DB.nps.filter((n) => n.ambassador_rating && B.byId("groups", B.byId("bookings", n.booking_id).tour_group_id).ambassador_id === a.id).map((n) => +n.ambassador_rating);
      return Object.assign({}, a, { email: B.byId("users", a.user_id).email, availability: B.DB.rules.filter((r) => r.ambassador_id === a.id),
        availability_stale: !a.availability_updated_at || B.parse(a.availability_updated_at) < B.nowMs() - 30 * D,
        stats: { tours: B.DB.groups.filter((g) => g.ambassador_id === a.id && g.status === "realizado").length, invites: invs.length,
          accepted: invs.filter((i) => ["aceito", "desistiu"].includes(i.status)).length, declined: invs.filter((i) => i.status === "recusado").length,
          expired: invs.filter((i) => i.status === "expirado").length, nps_avg: ratings.length ? ratings.reduce((x, y) => x + y, 0) / ratings.length : null,
          gifts_pending: B.DB.gifts.filter((g) => g.ambassador_id === a.id && !g.collected_at).length } });
    }).sort((x, y) => x.display_name.localeCompare(y.display_name)) };
  });
  route("POST", "/api/admin/ambassadors", "admissions", (q, body) => {
    const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
    if (name.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) throw new B.DomainError("Informe nome e e-mail válidos.", "validacao", 422);
    if (B.DB.users.some((u) => u.email === email)) throw new B.DomainError("Já existe um usuário com este e-mail.", "duplicado", 409);
    const u = B.insert("users", { name, email, role: "ambassador", created_at: B.now() });
    B.insert("ambassadors", { user_id: u.id, display_name: name, course: body.course || null, languages: ["Português"], phone: "", active: true, availability_updated_at: null, created_at: B.now() });
    return { ok: true };
  });
  route("PATCH", "/api/admin/ambassadors/(?<id>\\d+)", "admissions", (q, body, p) => {
    const a = B.byId("ambassadors", +p.id);
    if ("active" in body) a.active = !!body.active;
    if ("gift_group_id" in body) { const g = B.DB.gifts.find((x) => x.tour_group_id === +body.gift_group_id); if (g) g.collected_at = body.collected ? B.now() : null; }
    return { ok: true };
  });
  route("GET", "/api/admin/gifts", "admissions", () => ({ items: B.DB.gifts.map((x) => { const g = B.byId("groups", x.tour_group_id), ms = B.parse(g.slot_start);
    return Object.assign({}, x, { display_name: B.byId("ambassadors", x.ambassador_id).display_name, slot_start: g.slot_start, status: g.status,
      date_label: new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " " + B.fmtTime(ms) }); }).sort((a, b) => B.parse(b.slot_start) - B.parse(a.slot_start)) }));
  route("GET", "/api/admin/config", "admissions", () => ({ config: B.DB.config, blackouts: B.DB.blackouts, courses: B.DB.courses }));
  route("PUT", "/api/admin/config", "admissions", (q, body) => {
    for (const k of Object.keys(body)) if (k in B.DEFAULT_CONFIG) B.DB.config[k] = body[k];
    B.DB.config.start_times = [...new Set(B.DB.config.start_times)].sort();
    return { ok: true };
  });
  route("POST", "/api/admin/blackouts", "admissions", (q, body) => { if (!body.date) throw new B.DomainError("Informe a data.", "validacao", 422); B.insert("blackouts", { date: body.date, start_time: body.start_time || null, reason: body.reason || "" }); return { ok: true }; });
  route("DELETE", "/api/admin/blackouts/(?<id>\\d+)", "admissions", (q, b, p) => { B.DB.blackouts = B.DB.blackouts.filter((x) => x.id !== +p.id); return { ok: true }; });
  route("POST", "/api/admin/courses", "admissions", (q, body) => { if (!body.name) throw new B.DomainError("Informe o nome do curso.", "validacao", 422); B.insert("courses", { name: body.name, active: true, ord: B.DB.courses.length }); return { ok: true }; });
  route("PATCH", "/api/admin/courses/(?<id>\\d+)", "admissions", (q, body, p) => { const c = B.byId("courses", +p.id); if ("active" in body) c.active = !!body.active; return { ok: true }; });
  route("GET", "/api/admin/templates", "admissions", () => ({ items: B.DB.templates }));
  route("PUT", "/api/admin/templates/(?<code>\\w+)", "admissions", (q, body, p) => { Object.assign(B.DB.templates.find((t) => t.code === p.code), { subject: body.subject, body: body.body, active: !!body.active }); return { ok: true }; });
  route("POST", "/api/admin/templates/(?<code>\\w+)/reset", "admissions", (q, b, p) => {
    const d = B.TEMPLATES.find((t) => t[0] === p.code); Object.assign(B.DB.templates.find((t) => t.code === p.code), { subject: d[3], body: d[4], active: true }); return { ok: true };
  });
  route("GET", "/api/admin/export/(?<kind>\\w+)", "admissions", (q, b, p) => {
    const rows = [];
    if (p.kind === "bookings") {
      rows.push(["protocolo", "data", "hora", "status", "nome", "email", "curso", "treineiro", "pessoas", "embaixador"]);
      filterBookings(q).forEach((x) => rows.push([x.protocol, x.date_label, x.time_label, x.status, x.full_name, x.email, x.course_interest, x.is_treineiro ? "sim" : "não", x.party_size, x.ambassador_name || ""]));
    } else if (p.kind === "nps") {
      rows.push(["protocolo", "nota", "o_que_marcou", "o_que_melhorar", "nota_embaixador"]);
      B.DB.nps.forEach((n) => rows.push([B.byId("bookings", n.booking_id).protocol, n.score, n.highlight, n.improvement, n.ambassador_rating || ""]));
    } else {
      const d = B.dashboard(q.from, q.to);
      rows.push(["indicador", "valor"], ["Realizados ÷ agendados (%)", d.realized_rate.gross], ["Realizados ÷ agendados ajustado (%)", d.realized_rate.adjusted],
        ["Tempo até 1ª confirmação (s)", d.first_confirmation_seconds.avg], ["Tarefas manuais por tour", d.manual_tasks_per_tour.value], ["Exceções", d.exceptions.count],
        ["Aceite dos embaixadores (%)", d.ambassador_acceptance.rate], ["NPS", d.nps.score]);
    }
    return { csv: rows.map((r) => r.map((c) => /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(";")).join("\n") };
  });

  // simulação
  route("GET", "/api/sim/state", null, () => ({ now: B.now(), offset_hours: Math.round(B.DB.clockOffset / 360) / 10, jobs: B.DB.jobRuns.slice(-12).reverse() }));
  route("POST", "/api/sim/clock", null, (q, body) => {
    if (body.reset) B.DB.clockOffset = 0;
    else if (body.to_next_tour) {
      const next = B.DB.groups.filter((g) => g.status === "com_embaixador" && B.parse(g.slot_start) > B.nowMs() && (!body.ambassador_id || g.ambassador_id === body.ambassador_id)).sort((a, b) => B.parse(a.slot_start) - B.parse(b.slot_start))[0];
      if (!next) throw new B.DomainError("Não há tour confirmado pela frente.", "vazio", 409);
      B.DB.clockOffset += (B.parse(next.slot_start) + 70 * 60e3 - B.nowMs()) / 1000;
    } else B.DB.clockOffset += (+body.hours || 0) * 3600;
    B.DB.clockOffset = Math.max(0, B.DB.clockOffset);
    return { now: B.now(), results: B.runJobs() };
  });
  route("POST", "/api/sim/jobs", null, () => ({ results: B.runJobs() }));
  route("POST", "/api/sim/demand", null, (q, body) => simulateDemand(Math.min(500, +body.count || 20), Math.min(60, +body.days || 14), null, { ignoreWindow: false }));
  route("POST", "/api/sim/respond", null, (q, body) => respondAll(null, { accept: (+body.accept || 75) / 100, decline: (+body.decline || 15) / 100 }));
  route("POST", "/api/sim/tour-day", null, (q, body) => simulateTourDay(null, (+body.no_show || 15) / 100, (+body.nps || 60) / 100));
  route("POST", "/api/sim/reset", null, () => { seed(); return { ok: true }; });
  route("POST", "/api/sim/persona", null, (q, body) => { B.DB.session = { userId: body.userId || null, persona: body.persona }; return { ok: true }; });
  route("GET", "/api/dev/inbox", null, (q) => ({ items: B.DB.notifications.filter((n) => !q.to || n.recipient.includes(q.to)).slice(-300).reverse() }));
  route("GET", "/api/sim/users", null, () => ({ admissions: B.DB.users.filter((u) => u.role === "admissions"),
    ambassadors: B.DB.ambassadors.map((a) => ({ id: a.id, user_id: a.user_id, name: a.display_name, active: a.active, pending: B.DB.invitations.filter((i) => i.ambassador_id === a.id && i.status === "enviado").length })) }));

  async function api(method, url, body) {
    const [path, qs] = url.split("?");
    const q = Object.fromEntries(new URLSearchParams(qs || ""));
    for (const [m, rx, role, fn] of routes) {
      if (m !== method) continue;
      const match = path.match(rx);
      if (!match) continue;
      if (role) {
        const u = me();
        if (!u || u.role !== role) { const e = new Error(role === "admissions" ? "Entre como Admissões na barra de simulação." : "Escolha um embaixador na barra de simulação."); e.status = 401; e.code = "nao_autenticado"; e.fields = {}; throw e; }
      }
      try {
        const snapshot = method === "GET" ? null : JSON.stringify(B.DB);
        try {
          const res = fn(q, body || {}, match.groups || {});
          if (method !== "GET") B.save();
          return JSON.parse(JSON.stringify(res));
        } catch (e) {
          if (snapshot && !(e instanceof B.DomainError && e.code === "duplicado")) B.DB = JSON.parse(snapshot); // rollback da "transação"
          else if (snapshot) B.save();
          throw e;
        }
      } catch (e) {
        if (!(e instanceof B.DomainError)) { console.error(e); const err = new Error("Erro interno do simulador: " + e.message); err.status = 500; err.fields = {}; throw err; }
        throw e;
      }
    }
    const e = new Error("Rota não encontrada: " + method + " " + path); e.status = 404; e.fields = {}; throw e;
  }

  function boot() {
    if (!B.load() || !B.DB || B.DB.version !== 1) seed();
    B.runJobs();
    B.save();
  }

  window.MockAPI = { api, boot, seed, me };
})();

/* Casca do simulador: barra de papéis e relógio, navegação entre telas, mensagens enviadas e painel de simulação. */
(function () {
  const { h, clear, toast, dialog, fmt, tag } = T;
  const api = (m, u, b) => window.MockAPI.api(m, u, b);
  const view = document.getElementById("view");
  const bar = document.getElementById("simbar");
  let current = { path: "/", search: "", tab: null };
  const tabs = {};

  // ------------------------------------------------------------ navegação
  const ROUTES = [
    [/^\/$/, candidateHome, "lp"],
    [/^\/candidato$/, candidateHome, "lp"],
    [/^\/agendar$/, "agendar", "wrap"],
    [/^\/minha-visita\/[\w-]+$/, "minha-visita", "wrap narrow"],
    [/^\/nps\/(grupo\/)?[\w-]+$/, "nps", "wrap narrow"],
    [/^\/embaixador$/, "embaixador", "wrap", "ambassador"],
    [/^\/admin$/, "admin", "app", "admissions"],
    [/^\/mensagens$/, inbox, "wrap"],
  ];
  const PERSONA_OF = { "/embaixador": "embaixador", "/admin": "admissoes", "/mensagens": "mensagens" };

  function nav(url) {
    const [path, qs] = url.split("?");
    current = { path, search: qs ? "?" + qs : "", tab: tabs[path] || null, setTab: (id) => { tabs[path] = id; current.tab = id; } };
    const r = ROUTES.find(([rx]) => rx.test(path)) || ROUTES[0];
    const [, page, layout, role] = r;
    const user = window.MockAPI.me();
    if (role && (!user || user.role !== role)) {
      if (role === "admissions") return setPersona("admissoes");
      return setPersona("embaixador");
    }
    clear(view);
    const top = h("div", { id: "top" });
    if (layout === "app") view.append(top, h("div", { class: "app" }, h("nav", { class: "side", id: "side", "aria-label": "Seções do painel" }), h("main", { id: "conteudo", class: "main" })));
    else view.append(top, h("main", { id: "conteudo", class: layout === "lp" ? "lp" : layout }, h("div", { id: "app" })));
    window.scrollTo(0, 0);
    try { history.replaceState(null, "", "#" + (PERSONA_OF[path] || "candidato")); } catch (e) { /* ignora */ }
    if (typeof page === "function") page(current);
    else window.Pages[page](current);
    drawBar();
  }
  window.nav = nav;
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (href.startsWith("/")) { e.preventDefault(); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); nav(href); }
  });

  // ------------------------------------------------------------ barra de simulação
  let users = null;
  async function setPersona(p, ambId) {
    users = users || await api("GET", "/api/sim/users");
    if (p === "admissoes") { await window.MockAPI.api("POST", "/api/sim/persona", { persona: p, userId: users.admissions[0].id }); return nav("/admin"); }
    if (p === "embaixador") {
      const sess = window.Backend.DB.session || {};
      const chosen = ambId || (sess.persona === "embaixador" && sess.ambId) || (users.ambassadors.find((a) => a.pending) || users.ambassadors[0]).id;
      const a = users.ambassadors.find((x) => x.id === +chosen);
      await window.MockAPI.api("POST", "/api/sim/persona", { persona: p, userId: a.user_id });
      window.Backend.DB.session.ambId = a.id;
      return nav("/embaixador");
    }
    await window.MockAPI.api("POST", "/api/sim/persona", { persona: p, userId: null });
    nav(p === "mensagens" ? "/mensagens" : "/");
  }

  async function drawBar() {
    users = await api("GET", "/api/sim/users");
    const st = await api("GET", "/api/sim/state");
    const sess = window.Backend.DB.session || {};
    const persona = sess.persona && sess.persona !== "inicio" ? sess.persona : "candidato";
    const btn = (id, label) => h("button", { type: "button", "aria-pressed": persona === id ? "true" : "false", onclick: () => setPersona(id) }, label);
    const ambSel = h("select", { id: "sim-amb", "aria-label": "Embaixador simulado", onchange: (e) => setPersona("embaixador", +e.target.value) },
      users.ambassadors.filter((a) => a.active).map((a) => h("option", { value: a.id, selected: sess.ambId === a.id ? true : null }, `${a.name}${a.pending ? ` · ${a.pending} convite${a.pending > 1 ? "s" : ""}` : ""}`)));
    const pendingTotal = users.ambassadors.reduce((s, a) => s + a.pending, 0);
    const clock = async (body, msg) => {
      try { const r = await api("POST", "/api/sim/clock", body); toast(`${msg} Agora: ${fmt.dateTime(r.now)}.`); nav(current.path + current.search); }
      catch (e) { toast(e.message, true); }
    };
    clear(bar).append(h("div", { class: "simbar-inner" },
      h("div", { class: "sim-label" }, h("strong", {}, "Simulador"), h("span", {}, "dados fictícios, salvos só neste navegador")),
      h("div", { class: "seg sim-personas", role: "group", "aria-label": "Ver a plataforma como" },
        btn("candidato", "Candidato"), btn("embaixador", `Embaixador${pendingTotal ? ` (${pendingTotal})` : ""}`), btn("admissoes", "Admissões"), btn("mensagens", "Mensagens")),
      persona === "embaixador" ? ambSel : null,
      persona === "candidato" ? h("button", { class: "btn small", onclick: visitsDialog }, T.icon("list", 16), "Abrir uma visita") : null,
      persona === "embaixador" ? h("button", { class: "btn small", onclick: groupNpsDialog }, T.icon("qr", 16), "Escanear QR do NPS") : null,
      h("button", { class: "btn small", onclick: scenariosDialog }, T.icon("play", 16), "Cenários"),
      h("button", { class: "btn small", onclick: howToDialog }, "Como testar"),
      h("div", { class: "sim-clock" },
        h("span", { class: "clock", title: "Relógio da simulação" }, fmt.dateTime(st.now), st.offset_hours ? h("small", {}, ` +${fmt.num(st.offset_hours)} h`) : null),
        h("button", { class: "btn small", onclick: () => clock({ hours: 1 }, "Relógio +1 hora.") }, "+1 h"),
        h("button", { class: "btn small", onclick: () => clock({ hours: 24 }, "Relógio +1 dia.") }, "+1 dia"),
        h("button", { class: "btn small", onclick: () => clock({ to_next_tour: true, ambassador_id: persona === "embaixador" ? sess.ambId : null }, persona === "embaixador" ? "Pulou para o fim do seu próximo tour." : "Pulou para o fim do próximo tour.") }, "Próximo tour"),
        st.offset_hours ? h("button", { class: "btn small ghost", onclick: () => clock({ reset: true }, "Relógio voltou para agora.") }, "Agora") : null)));
  }
  // atalho de teste: no sistema real o candidato chega à "Minha visita" pelo link do e-mail
  async function visitsDialog() {
    const r = await api("GET", "/api/public/my-bookings");
    const mine = r.items.filter((x) => x.mine);
    const examples = r.items.filter((x) => !x.mine && ["aguardando_embaixador", "confirmado", "excecao", "realizado", "presenca_pendente"].includes(x.status)).slice(0, 8);
    const list = (items) => h("div", { class: "list" }, items.map((b) => h("a", { class: "li", href: `/minha-visita/${b.token}` },
      T.icon("calendar", 20), h("span", {}, `${fmt.dateLong(b.slot_start)}, ${fmt.time(b.slot_start)}`, h("small", {}, `${b.name} · ${b.protocol}`)),
      h("span", { class: "btns", style: "gap:10px;flex-wrap:nowrap" }, tag(b.status), T.icon("arrow", 18)))));
    dialog("Abrir uma visita", h("div", {},
      h("p", { class: "muted" }, "Na plataforma real, o candidato abre a própria visita pelo link do e-mail."),
      h("h3", { style: "font-family:var(--sans);font-size:15px" }, "Criadas por você"),
      mine.length ? list(mine) : h("div", { class: "empty" }, "Você ainda não agendou nesta simulação."),
      examples.length ? [h("h3", { style: "font-family:var(--sans);font-size:15px;margin-top:20px" }, "Exemplos"), list(examples)] : null));
  }

  // atalho de teste: faz o papel do celular do candidato que lê o QR mostrado pelo embaixador
  async function groupNpsDialog() {
    const r = await api("GET", "/api/ambassador/tours");
    const tours = r.upcoming.concat(r.past).filter((t) => t.is_past);
    dialog("Escanear QR do NPS", h("div", {},
      h("p", { class: "muted" }, "Abre a avaliação como se o grupo tivesse lido o QR no fim do tour. Só aparecem tours que já começaram."),
      tours.length ? h("div", { class: "list" }, tours.slice(0, 10).map((t) => h("a", { class: "li", href: `/nps/grupo/${t.group_id}` },
        T.icon("qr", 20), h("span", {}, `${t.date_label.split(",")[0]}, ${t.time_label}`, h("small", {}, `${t.date_label.split(",").slice(1).join(",").trim()} · ${t.people_count} pessoa(s)`)), T.icon("arrow", 18))))
        : h("div", { class: "empty" }, "Nenhum tour começou ainda. Use Próximo tour na barra para avançar o relógio.")));
  }

  function scenariosDialog() {
    const body = h("div", {}, h("p", { class: "loading" }, "Carregando…"));
    dialog("Cenários de simulação", body);
    const tmp = h("div");
    window.secSimulacao(tmp).then(() => clear(body).append(...tmp.childNodes));
  }

  const origApi = window.MockAPI.api;
  window.MockAPI.api = async (method, url, body) => {
    const r = await origApi(method, url, body);
    if (method !== "GET" && !url.startsWith("/api/sim/persona")) setTimeout(drawBar, 0);
    return r;
  };

  // ------------------------------------------------------------ página do candidato (início)
  // Fotos do site do Insper. No arquivo aberto no Chrome elas carregam do site; onde imagens externas
  // são bloqueadas, o bloco fica na cor da marca.
  const IMG_BASE = "https://www.insper.edu.br/content/dam/insper-portal/imagens/";
  const IMGS = {
    hero: "campus/novo-pr%C3%A9dio/Predio%20Novo%20Fachada%20013bx.jpg",
    aula: "campus/_FSC3866.JPG",
    lab: "laborat%C3%B3rios/DSC_6134.jpg",
    biblio: "campus/Insper%20Alunos%20080.jpg",
    conv: "campus/DSC_7395bx.jpg",
    aereo: "campus/campus-insper-22.jpg",
  };
  const photo = (key, alt) => h("img", { src: IMG_BASE + IMGS[key], alt, loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.target.remove() });

  function candidateHome() {
    const I = T.icon;
    document.getElementById("top").append(T.topbar("Visite o campus", [h("a", { href: "/agendar" }, "Agendar visita")]));
    const app = document.getElementById("app");
    const fact = (ic, text) => h("span", { class: "fact" }, I(ic, 16), text);
    const place = (key, title, text) => h("figure", { class: "place" }, h("div", { class: "ph" }, photo(key, title)), h("figcaption", {}, h("strong", {}, title), h("span", {}, text)));
    const stepCard = (n, ic, title, text) => h("li", { class: "lp-step" }, h("span", { class: "chip-ico" + (n === 1 ? " red" : "") }, I(ic, 22)), h("span", { class: "num" }, `0${n}`), h("strong", {}, title), h("span", {}, text));
    const faq = (q, a) => h("details", { class: "faq" }, h("summary", {}, q, I("arrow", 16)), h("p", {}, a));
    app.append(
      h("section", { class: "lp-hero" }, photo("hero", "Fachada do Insper, com o letreiro na entrada"),
        h("div", { class: "lp-hero-in" },
          h("p", { class: "eyebrow" }, "Visite o Insper"),
          h("h1", {}, "Conheça o campus antes de tomar sua decisão."),
          h("p", { class: "lead" }, "Um aluno embaixador guia você pelas salas, laboratórios, biblioteca, restaurantes e o tobogã. Escolha um horário com vaga e receba a confirmação na hora."),
          h("div", { class: "btns" }, h("a", { class: "btn primary big", href: "/agendar" }, "Agendar minha visita", I("arrow", 18)),
            h("a", { class: "btn glass", href: "https://www.youtube.com/watch?v=d_xUY4s5KCA", target: "_blank", rel: "noopener" }, I("play", 16), "Tour virtual")),
          h("div", { class: "facts" }, fact("clock", "Cerca de 1 hora"), fact("calendar", "Segunda a sexta"), fact("users", "Até 10 pessoas"), fact("shield", "Sem inscrição no vestibular")))),
      h("section", { class: "lp-sec" },
        h("div", { class: "lp-head" }, h("p", { class: "eyebrow" }, "Durante o tour"), h("h2", {}, "Veja de perto onde a graduação acontece.")),
        h("div", { class: "places" },
          place("aula", "Salas de aula", "Os ambientes onde acontecem as aulas da graduação."),
          place("lab", "Laboratórios", "De uma prancha de surfe a um robô."),
          place("biblio", "Biblioteca Telles", "Espaços de estudo e apoio à pesquisa."),
          place("conv", "Convivência", "Áreas para estudar e conviver entre as aulas."))),
      h("section", { class: "lp-sec" },
        h("div", { class: "lp-head" }, h("p", { class: "eyebrow" }, "Como agendar"), h("h2", {}, "Quatro passos. Menos de dois minutos.")),
        h("ol", { class: "lp-steps" },
          stepCard(1, "calendar", "Escolha dia e horário", "Só aparecem horários com vaga para o seu grupo."),
          stepCard(2, "user", "Preencha seus dados", "Nome, CPF, contato e curso de interesse."),
          stepCard(3, "zap", "Confirmação na hora", "Protocolo e convite de calendário no seu e-mail."),
          stepCard(4, "award", "Um aluno recebe você", "O nome do embaixador chega antes da visita."))),
      h("section", { class: "lp-cta" }, photo("aereo", "Vista do campus do Insper na Vila Olímpia"),
        h("div", { class: "lp-cta-in" }, h("h2", {}, "Sua visita, no seu horário."),
          h("p", {}, "Reagende ou cancele pelo link do e-mail quando precisar."),
          h("a", { class: "btn primary big", href: "/agendar" }, "Agendar minha visita", I("arrow", 18)))),
      h("section", { class: "lp-sec lp-faq" },
        h("div", { class: "lp-head" }, h("p", { class: "eyebrow" }, "Dúvidas"), h("h2", {}, "Antes de vir")),
        h("div", { class: "faqs" },
          faq("Preciso estar inscrito no vestibular?", "Não. Qualquer pessoa interessada na graduação pode agendar."),
          faq("Posso levar acompanhantes?", "Sim. Informe quantas pessoas vêm no agendamento. Cada grupo tem até 10 pessoas."),
          faq("E se eu não puder ir?", "Use o link do e-mail para reagendar ou cancelar. A vaga é liberada na hora."),
          faq("O que preciso levar?", "Um documento com foto de cada pessoa do grupo."),
          faq("Onde é o encontro?", "Na recepção do Insper: Rua Quatá, 300, Vila Olímpia, São Paulo."))),
      h("footer", { class: "foot" }, "Protótipo acadêmico da plataforma de agendamento de tours. Não é um site oficial do Insper."));
  }

  // roteiro de teste (fica na barra do simulador)
  function howToDialog() {
    const li = (n, title, text) => h("li", {}, h("strong", {}, title), " ", text);
    dialog("Como testar", h("div", {},
      h("p", { class: "muted" }, "Tudo roda neste navegador, com dados fictícios. Use a barra escura para trocar de papel e avançar o relógio."),
      h("ol", { class: "steps-list" },
        li(1, "Agende como candidato.", "Escolha um horário e preencha o formulário."),
        li(2, "Troque para Embaixador.", "A barra mostra quem recebeu o convite. Aceite o tour."),
        li(3, "Abra Mensagens.", "Veja a confirmação (M1), o convite (M7) e o aviso com o nome do embaixador (M2)."),
        li(4, "Clique em Próximo tour.", "Marque a presença e use “Escanear QR do NPS” para avaliar."),
        li(5, "Entre como Admissões.", "Acompanhe metas e exceções. Em Cenários, gere demanda e avance dias."))));
  }

  // ------------------------------------------------------------ mensagens
  async function inbox() {
    document.getElementById("top").append(T.topbar("Mensagens enviadas"));
    const app = document.getElementById("app");
    const filter = h("input", { type: "search", id: "inbox-filter", placeholder: "Filtrar por destinatário ou assunto", "aria-label": "Filtrar mensagens" });
    const list = h("div", { class: "list", role: "list" });
    const detail = h("div", {}, h("div", { class: "empty" }, "Escolha uma mensagem."));
    let items = [];
    const draw = () => {
      const q = filter.value.trim().toLowerCase();
      clear(list);
      const shown = items.filter((n) => !q || n.recipient.toLowerCase().includes(q) || n.subject.toLowerCase().includes(q)).slice(0, 200);
      if (!shown.length) list.append(h("div", { class: "empty" }, "Nenhuma mensagem."));
      shown.forEach((n) => {
        const b = h("button", { class: "item", role: "listitem", onclick: () => {
          list.querySelectorAll(".item").forEach((x) => x.removeAttribute("aria-current")); b.setAttribute("aria-current", "true");
          clear(detail).append(h("article", { class: "card" }, h("h2", {}, n.subject),
            h("p", { class: "muted" }, `Para ${n.recipient} · ${n.channel === "whatsapp" ? "WhatsApp (simulado)" : "E-mail"} · ${n.template_code} · ${fmt.dateTime(n.sent_at)}`),
            h("div", { class: "mail-body" }, n.body_text)));
        } }, h("span", { class: "item-head" }, h("strong", {}, n.recipient), h("span", { class: "tag" + (n.channel === "whatsapp" ? " info" : "") }, n.channel === "whatsapp" ? "WhatsApp" : n.template_code)),
          h("span", {}, n.subject), h("small", {}, fmt.dateTime(n.sent_at)));
        list.append(b);
      });
    };
    filter.addEventListener("input", draw);
    app.append(h("div", { class: "section-title" }, h("h1", {}, "Mensagens enviadas"), filter),
      h("p", { class: "muted" }, "Na plataforma real, estes e-mails saem pelo servidor do Insper. O WhatsApp aparece como simulado até a conta oficial ser aprovada."),
      h("div", { class: "inbox" }, list, detail));
    items = (await api("GET", "/api/dev/inbox")).items;
    draw();
  }

  // ------------------------------------------------------------ painel de simulação (seção de Admissões)
  window.secSimulacao = async function (el) {
    const st = await api("GET", "/api/sim/state");
    const num = (id, label, value, min, max) => h("div", { class: "field" }, h("label", { for: id }, label), h("input", { type: "number", id, value, min, max }));
    const run = async (url, body, msg) => {
      try { const r = await api("POST", url, body); toast(msg(r)); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); nav(current.path + current.search); }
      catch (e) { toast(e.message, true); }
    };
    const v = (id) => +document.getElementById(id).value;
    el.append(
      h("p", { class: "muted" }, "Gere cenários para testar a plataforma com volume. Base AS-IS (Marcelo, até 19/10/2026): 767 agendamentos, 63% realizados, cerca de 50 embaixadores, até 10 pessoas por tour. Demanda distribuída como nos dados: sexta > quinta > segunda > terça > quarta; 15h > 10h > 17h > 14h > 16h."),
      h("div", { class: "grid2", style: "gap:16px" },
        h("section", { class: "card" }, h("h2", {}, "1. Gerar demanda"), h("p", { class: "muted" }, "Cria agendamentos de candidatos fictícios pelo fluxo real (vagas, grupos, convites e e-mails)."),
          h("div", { class: "toolbar" }, num("sim-n", "Agendamentos", 30, 1, 500), num("sim-days", "Nos próximos (dias)", 14, 2, 60),
            h("button", { class: "btn primary", onclick: () => run("/api/sim/demand", { count: v("sim-n"), days: v("sim-days") }, (r) => `${r.made} agendamentos criados${r.full ? ` · ${r.full} tentativas em horários esgotados` : ""}.`) }, "Gerar"))),
        h("section", { class: "card" }, h("h2", {}, "2. Embaixadores respondem"), h("p", { class: "muted" }, "Cada convite em aberto é aceito, recusado (passa ao próximo da fila) ou fica sem resposta (expira com o relógio)."),
          h("div", { class: "toolbar" }, num("sim-acc", "Aceitam (%)", 70, 0, 100), num("sim-dec", "Recusam (%)", 15, 0, 100),
            h("button", { class: "btn primary", onclick: () => run("/api/sim/respond", { accept: v("sim-acc"), decline: v("sim-dec") }, (r) => `${r.accepted} aceites e ${r.declined} recusas.`) }, "Responder convites"))),
        h("section", { class: "card" }, h("h2", {}, "3. Tours acontecem"), h("p", { class: "muted" }, "Para os tours que já começaram no relógio da simulação: marca presença com a taxa de faltas e responde o NPS."),
          h("div", { class: "toolbar" }, num("sim-ns", "Faltas (%)", 15, 0, 100), num("sim-nps", "Respondem o NPS (%)", 60, 0, 100),
            h("button", { class: "btn primary", onclick: () => run("/api/sim/tour-day", { no_show: v("sim-ns"), nps: v("sim-nps") }, (r) => r.marked ? `${r.marked} presenças marcadas e ${r.answered} NPS respondidos.` : "Nenhum tour começou ainda. Avance o relógio.") }, "Simular tours"))),
        h("section", { class: "card" }, h("h2", {}, "4. Relógio e jobs"), h("p", { class: "muted" }, `Agora na simulação: ${fmt.dateTime(st.now)}${st.offset_hours ? ` (+${fmt.num(st.offset_hours)} h)` : ""}. Cada avanço roda os jobs automáticos.`),
          h("div", { class: "btns" },
            [[6, "+6 h"], [24, "+1 dia"], [72, "+3 dias"], [168, "+7 dias"]].map(([hrs, l]) => h("button", { class: "btn", onclick: () => run("/api/sim/clock", { hours: hrs }, (r) => `Agora: ${fmt.dateTime(r.now)}.`) }, l)),
            h("button", { class: "btn ghost", onclick: () => run("/api/sim/clock", { reset: true }, () => "Relógio voltou para agora.") }, "Voltar para agora")))),
      h("h2", { style: "margin-top:28px" }, "Últimas execuções dos jobs"),
      st.jobs.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Job"), h("th", {}, "Quando"), h("th", {}, "Situação"), h("th", { class: "num" }, "Resultado"))),
        h("tbody", {}, st.jobs.map((j) => h("tr", {}, h("td", {}, h("code", {}, j.job)), h("td", {}, fmt.dateTime(j.started_at)), h("td", {}, tag(j.status === "ok" ? "ok" : "falhou")), h("td", { class: "num" }, j.detail))))))
        : h("div", { class: "empty" }, "Nenhuma execução ainda."),
      h("section", { class: "card danger-zone", style: "margin-top:28px" }, h("h2", {}, "Reiniciar dados"),
        h("p", { class: "muted" }, "Apaga tudo o que foi feito neste navegador e recria os dados de exemplo: 12 embaixadores, 60 agendamentos no último mês e 40 nas próximas duas semanas."),
        h("button", { class: "btn danger", onclick: async () => {
          if (!(await T.confirmDialog("Reiniciar dados", "Apagar a simulação deste navegador e recriar os dados de exemplo?", "Reiniciar", true))) return;
          await api("POST", "/api/sim/reset"); toast("Dados recriados."); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); setPersona("candidato");
        } }, "Reiniciar dados")));
  };

  // ------------------------------------------------------------ calendário e CSV (downloads ficam bloqueados no artifact: mostramos o conteúdo para copiar)
  function copyBox(title, text, note) {
    const ta = h("textarea", { id: "copy-box", rows: "12", readonly: true, style: "font-family:ui-monospace,Menlo,monospace;font-size:13px" }, text);
    const dlg = dialog(title, h("div", {}, note ? h("p", { class: "muted" }, note) : null, ta), [
      h("button", { class: "btn primary", onclick: async () => {
        try { await navigator.clipboard.writeText(text); toast("Copiado."); } catch (e) { ta.select(); toast("Selecionado. Use Ctrl+C / Cmd+C para copiar."); }
      } }, "Copiar"), h("button", { class: "btn", onclick: () => dlg.close() }, "Fechar")]);
  }
  window.showIcs = (v) => {
    const s = new Date(v.slot_start), e = new Date(+s + 60 * 60e3), f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    copyBox("Convite de calendário (.ics)", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Insper//Agendamento de Tour//PT-BR", "BEGIN:VEVENT", `UID:${v.protocol}@tour.insper`,
      `DTSTART:${f(s)}`, `DTEND:${f(e)}`, "SUMMARY:Visita ao campus do Insper", `LOCATION:${v.meeting_point}`, `DESCRIPTION:Protocolo ${v.protocol}. Leve um documento com foto.`, "END:VEVENT", "END:VCALENDAR"].join("\n"),
    "Na plataforma real, o e-mail de confirmação traz este arquivo anexado e o botão baixa o .ics.");
  };
  window.showCsv = async (kind, params) => {
    const r = await api("GET", `/api/admin/export/${kind}?${params || ""}`);
    copyBox("Exportação CSV", r.csv, "Na plataforma real, o botão baixa o arquivo .csv. Aqui, copie e cole numa planilha (separador: ponto e vírgula).");
  };

  // ------------------------------------------------------------ início
  window.MockAPI.boot();
  setInterval(() => { try { window.Backend.runJobs(); window.Backend.save(); } catch (e) { /* ignora */ } }, 60000);
  const start = (location.hash || "").slice(1);
  const sess = window.Backend.DB.session || {};
  if (start === "admissoes") setPersona("admissoes");
  else if (start === "embaixador") setPersona("embaixador");
  else if (start === "mensagens") setPersona("mensagens");
  else if (start === "candidato") setPersona("candidato");
  else if (sess.persona && sess.persona !== "inicio" && start !== "inicio") setPersona(sess.persona === "admissoes" ? "admissoes" : sess.persona, sess.ambId);
  else setPersona("candidato");
})();

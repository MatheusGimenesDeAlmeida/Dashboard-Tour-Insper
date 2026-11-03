/* /nps/{token} e /nps/grupo/{token} (QR mostrado pelo embaixador ao fim do tour). */
(function () {
  const { api, h, clear, toast } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Avalie sua visita"));
  const parts = location.pathname.split("/").filter(Boolean);

  function thanks() {
    clear(app).append(h("h1", { tabindex: "-1", id: "t" }, "Obrigado!"),
      h("p", {}, "Sua resposta ajuda o Insper a melhorar a visita para os próximos candidatos."),
      h("a", { class: "btn", href: "https://www.insper.edu.br/" }, "Ir para o site do Insper"));
    document.getElementById("t").focus();
  }

  async function group(token) {
    const data = await api("GET", `/api/public/nps-group/${token}`);
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
})();

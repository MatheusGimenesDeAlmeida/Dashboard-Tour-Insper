/* /login — link mágico por e-mail. Em desenvolvimento, mostra acesso rápido com usuários fictícios. */
(function () {
  const { api, h, clear, toast } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Tours no campus"));
  const params = new URLSearchParams(location.search);

  const email = h("input", { type: "email", id: "email", autocomplete: "email", required: true });
  const msg = h("div", { "aria-live": "polite" });
  app.append(
    h("h1", {}, "Entrar"),
    h("p", { class: "muted" }, "Para embaixadores e equipe de Admissões. Enviamos um link de acesso para o seu e-mail."),
    params.get("erro") ? h("div", { class: "notice error" }, "O link de acesso expirou ou é inválido. Peça um novo.") : null,
    h("form", { class: "card", onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api("POST", "/api/auth/magic-link", { email: email.value });
        clear(msg).append(h("div", { class: "notice ok", style: "margin-top:16px" }, r.message));
      } catch (err) { toast(err.message, true); }
    } },
      h("div", { class: "field" }, h("label", { for: "email" }, "E-mail institucional"), email),
      h("div", { class: "btns" }, h("button", { class: "btn primary", type: "submit" }, "Enviar link de acesso"),
        h("span", { class: "muted", style: "font-size:14px" }, "SSO Microsoft: a configurar com a TI.")), msg));

  api("GET", "/api/auth/dev-users").then((r) => {
    if (!r.users.length) return;
    const next = params.get("next");
    app.append(h("div", { class: "card", style: "margin-top:24px" },
      h("h2", {}, "Acesso rápido (demonstração)"),
      h("p", { class: "muted" }, "Disponível só em ambiente de desenvolvimento. Os links de acesso enviados por e-mail ficam na ",
        h("a", { href: "/caixa-de-entrada" }, "caixa de entrada local"), "."),
      h("div", { class: "btns" }, r.users.map((u) => h("button", { class: "btn small" + (u.role === "admissions" ? " dark" : ""), onclick: async () => {
        const res = await api("POST", "/api/auth/dev-login", { email: u.email });
        location.href = next && next.startsWith("/") && ((u.role === "admissions") === next.startsWith("/admin")) ? next : res.redirect;
      } }, `${u.name} · ${u.role === "admissions" ? "Admissões" : "Embaixador"}`)))));
  });
})();

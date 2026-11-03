/* /caixa-de-entrada — substitui o Mailpit em desenvolvimento: mostra todo e-mail e WhatsApp (simulado) enviado. */
(function () {
  const { api, h, clear, fmt } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Caixa de entrada (desenvolvimento)", [
    h("a", { href: "/agendar" }, "Agendar"), h("a", { href: "/embaixador" }, "Embaixador"), h("a", { href: "/admin" }, "Admissões")]));
  const filter = h("input", { type: "search", placeholder: "Filtrar por destinatário", "aria-label": "Filtrar por destinatário",
    value: new URLSearchParams(location.search).get("to") || "", oninput: () => { clearTimeout(t); t = setTimeout(load, 250); } });
  let t;
  const list = h("div", { class: "list", role: "list" });
  const view = h("div", {}, h("div", { class: "empty" }, "Escolha uma mensagem."));
  app.append(h("div", { class: "section-title" }, h("h1", {}, "Caixa de entrada"),
    h("div", { class: "btns" }, filter, h("button", { class: "btn small", onclick: load }, "Atualizar"))),
    h("p", { class: "muted" }, "Nada aqui sai de verdade para a internet. Configure SMTP_HOST para enviar e-mails reais."),
    h("div", { class: "inbox" }, list, view));

  async function open(id, btn) {
    list.querySelectorAll(".item").forEach((b) => b.removeAttribute("aria-current"));
    btn.setAttribute("aria-current", "true");
    const n = await api("GET", `/api/dev/inbox/${id}`);
    const frame = h("iframe", { title: n.subject, sandbox: "allow-popups allow-top-navigation-by-user-activation" });
    const htmlBody = n.body_html || `<pre style="font:14px Inter,Arial;white-space:pre-wrap;padding:16px">${(n.body_text || "").replace(/</g, "&lt;")}</pre>`;
    frame.srcdoc = htmlBody.replace(/<a /g, '<a target="_top" ');
    clear(view).append(h("div", { class: "card", style: "margin-bottom:12px" },
      h("div", {}, h("strong", {}, n.subject)),
      h("div", { class: "muted", style: "font-size:14px" }, `Para: ${n.recipient} · ${n.channel === "whatsapp" ? "WhatsApp (simulado)" : "E-mail"} · ${n.template_code} · ${fmt.dateTime(n.sent_at || n.created_at)}`),
      n.attachments.length ? h("div", { style: "margin-top:8px" }, n.attachments.map((a) => h("a", { class: "btn small", href: `/api/dev/inbox/${id}/attachment/${a.index}` }, "📎 " + a.filename))) : null),
      frame);
  }

  async function load() {
    const r = await api("GET", "/api/dev/inbox?to=" + encodeURIComponent(filter.value));
    clear(list);
    if (!r.items.length) list.append(h("div", { class: "empty" }, "Nenhuma mensagem."));
    for (const n of r.items) {
      const btn = h("button", { class: "item", role: "listitem", onclick: () => open(n.id, btn) },
        h("div", { style: "display:flex;justify-content:space-between;gap:8px" }, h("strong", { style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, n.recipient),
          h("span", { class: "tag" + (n.channel === "whatsapp" ? " info" : "") }, n.channel === "whatsapp" ? "WhatsApp" : n.template_code)),
        h("div", {}, n.subject), h("small", {}, fmt.dateTime(n.sent_at || n.created_at)));
      list.append(btn);
    }
  }
  load();
})();

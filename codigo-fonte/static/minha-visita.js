/* /minha-visita/{token} — ver, confirmar presença, reagendar ou cancelar. */
(function () {
  const { api, h, clear, toast, dialog } = T;
  const app = document.getElementById("app");
  document.getElementById("top").appendChild(T.topbar("Minha visita", [h("a", { href: "/agendar" }, "Agendar")]));
  const token = location.pathname.split("/").filter(Boolean)[1];

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
        h("div", { class: "btns", style: "margin-top:14px" }, h("a", { class: "btn ghost", href: v.ics_url }, "Adicionar ao calendário"))] : null,
      v.nps_link ? h("div", { class: "notice", style: "margin-top:20px" }, "Como foi sua visita? ", h("a", { href: v.nps_link }, "Responda em menos de 1 minuto"), ".") : null,
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
})();

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
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
      const err = new Error((data && data.error) || "Algo deu errado. Tente novamente.");
      err.status = res.status; err.code = data && data.code; err.fields = (data && data.fields) || {};
      if (res.status === 401 && !url.startsWith("/api/public")) location.href = "/login?next=" + encodeURIComponent(location.pathname);
      throw err;
    }
    return data;
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
    await api("POST", "/api/auth/logout");
    location.href = "/login";
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

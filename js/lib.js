// Shared helpers: escaping, dates (Cairo time), formatting, UI primitives.

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// ── Dates. The programme runs on Cairo time; dates are stored as YYYY-MM-DD. ──
export const TZ = "Africa/Cairo";
export function todayISO(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const addDays = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
export const dow = (s) => new Date(utc(s)).getUTCDay(); // 0 Sunday
export const startOfWeek = (s, first = 6) => addDays(s, -((dow(s) - first + 7) % 7)); // weeks start Saturday in Egypt
export const startOfMonth = (s) => s.slice(0, 8) + "01";
export function fmtDate(s, opts = { weekday: "short", day: "numeric", month: "short" }) {
  if (!isISO(s)) return "Not scheduled";
  return new Date(utc(s)).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}
export const fmtLong = (s) => fmtDate(s, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtMonth = (s) => new Date(utc(s)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${ap}`;
}
export function relDays(s, today = todayISO()) {
  if (!isISO(s)) return "";
  const n = daysBetween(today, s);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
// Local Cairo date+time → ISO timestamp with offset (Cairo uses +02:00 in winter, +03:00 in summer).
export function cairoToISO(dateISO, time = "09:00") {
  const guess = new Date(`${dateISO}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(guess);
  const off = (parts.find((p) => p.type === "timeZoneName")?.value || "GMT+2").replace("GMT", "") || "+0";
  const m = off.match(/([+-])(\d{1,2})(?::(\d{2}))?/);
  const sign = m ? m[1] : "+"; const hh = m ? m[2].padStart(2, "0") : "02"; const mm = m?.[3] ?? "00";
  return `${dateISO}T${time}:00${sign}${hh}:${mm}`;
}
export function isoToCairo(ts) {
  const d = new Date(ts);
  const date = todayISO(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time };
}

export const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : null);
export const fmtPct = (v) => (v == null ? "—" : `${v}%`);
export function fmtMinutes(m) {
  if (m == null) return "—";
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}
export const fmtBytes = (b) => (b == null ? "" : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
export const initials = (s) => (s || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("");
export function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ── UI primitives ──
export function toast(msg, kind = "") {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 5200 : 2600);
}
export function errToast(e, fallback = "Something went wrong") {
  console.error(e);
  const msg = (e && (e.message || e.error_description)) || fallback;
  toast(/failed to fetch|networkerror|load failed|network request failed/i.test(msg) ? "Couldn't reach the server. Check your internet connection and try again." : msg, "err");
}

let lastFocus = null;
function trap(container, close) {
  lastFocus = document.activeElement;
  const onKey = (ev) => {
    if (ev.key === "Tab") {
      const f = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', container).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
    }
  };
  // Listen on the document so Escape still works after the panel re-renders and focus falls to <body>.
  const onDoc = (ev) => { if (container.id === "drawer" && !document.getElementById("modal").hidden) return; if (ev.key === "Escape" && !container.hidden) { ev.preventDefault(); close(); } else if (container.contains(ev.target)) onKey(ev); };
  document.addEventListener("keydown", onDoc);
  return () => document.removeEventListener("keydown", onDoc);
}

// Side drawer. render(bodyEl) fills the body; returns close().
export function openDrawer(title, render, { subtitle = "", onClose } = {}) {
  const host = $("#drawer");
  host.innerHTML = `<div class="scrim" data-close></div>
    <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
      <div class="drawer-head"><div style="flex:1;min-width:0"><h2 id="drawerTitle">${esc(title)}</h2>${subtitle ? `<div class="muted small">${subtitle}</div>` : ""}</div>
      <button class="icon-btn" data-close aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="drawer-body"></div></div>`;
  host.hidden = false;
  let untrap = () => {};
  const close = () => { host.hidden = true; host.innerHTML = ""; untrap(); onClose && onClose(); lastFocus && lastFocus.focus && lastFocus.focus(); };
  host.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  untrap = trap(host, close);
  render($(".drawer-body", host), close);
  setTimeout(() => $(".drawer-panel button[data-close]", host)?.focus(), 30);
  return close;
}
export const closeDrawer = () => { const h = $("#drawer"); if (!h.hidden) h.querySelector("[data-close]")?.click(); };

// Modal dialog. render(body, foot, close).
export function openModal(title, render, { wide = false } = {}) {
  const host = $("#modal");
  host.innerHTML = `<div class="scrim" data-close></div>
    <div class="modal-panel ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head"><h2 id="modalTitle">${esc(title)}</h2>
      <button class="icon-btn" data-close aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="modal-body"></div><div class="modal-foot"></div></div>`;
  host.hidden = false;
  let untrap = () => {};
  const close = () => { host.hidden = true; host.innerHTML = ""; untrap(); lastFocus && lastFocus.focus && lastFocus.focus(); };
  host.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  untrap = trap(host, close);
  render($(".modal-body", host), $(".modal-foot", host), close);
  setTimeout(() => ($("input,select,textarea", $(".modal-body", host)) || $("button", host))?.focus(), 30);
  return close;
}

export function confirmDialog(message, { ok = "Delete", danger = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const close = openModal("Please confirm", (body, foot, close) => {
      body.innerHTML = `<p>${esc(message)}</p>`;
      foot.innerHTML = `<button class="btn" data-no>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(ok)}</button>`;
      foot.querySelector("[data-no]").onclick = () => { done = true; close(); resolve(false); };
      foot.querySelector("[data-yes]").onclick = () => { done = true; close(); resolve(true); };
    });
    const obs = new MutationObserver(() => { if ($("#modal").hidden) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe($("#modal"), { attributes: true });
    void close;
  });
}

// Form helpers: read named fields into an object.
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "number") out[el.name] = el.value === "" ? null : Number(el.value);
    else out[el.name] = el.value.trim() === "" ? null : el.value.trim();
  }
  return out;
}

export function download(name, content, type = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function toCSV(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (v) => { const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\n");
}

// Only web links are rendered as clickable; anything else (javascript:, data:) becomes inert.
export const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? "").trim()) ? String(u).trim() : "#");

export function md(text) {
  const raw = window.marked ? window.marked.parse(text || "", { breaks: true }) : esc(text).replace(/\n/g, "<br>");
  return window.DOMPurify ? window.DOMPurify.sanitize(raw) : esc(text);
}

// Load an external script once (pdf.js, mammoth) only when needed.
const loaded = {};
export function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); });
  return loaded[src];
}

export const icon = {
  dash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 4v16"/></svg>',
  cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  tasks: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/></svg>',
  docs: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  chart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
  data: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  cohort: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
};

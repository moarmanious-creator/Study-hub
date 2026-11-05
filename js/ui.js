// Shared view components: the progress ledger, labels, charts, info-required blocks.
import { esc, fmtDate, fmtTime, isISO } from "./lib.js?v=202611051410";
import { S, course, source, lecturerName, courseSessions } from "./store.js?v=202611051410";
import { sessionState, isStudyTracked, CORE, ATT, DELIVERY } from "./metrics.js?v=202611051410";

// Theme-aware course colour: the CSS token for known courses (adjusted for dark mode), else the stored hex.
export const cvar = (cid) => `--course:var(--c-${String(cid).replace(/[^\w-]/g, "")}, ${course(cid)?.color || "var(--nile)"})`;
export const courseName = (cid) => course(cid)?.short_name || course(cid)?.name || "No course";

export function coursePill(cid) {
  if (!cid) return `<span class="pill">Personal</span>`;
  const c = course(cid);
  return `<span class="pill" style="${cvar(cid)}"><span class="sw" style="background:var(--course)"></span>${esc(c?.short_name || c?.name || cid)}</span>`;
}
export const deliveryTag = (d) => `<span class="delivery d-${esc(d)}">${esc(DELIVERY[d] || d)}</span>`;
export function sessionLabel(s) {
  return s.label || (s.kind === "lecture" ? `Lecture ${s.seq}` : `${s.kind[0].toUpperCase() + s.kind.slice(1)} ${s.seq}`);
}
export const sessionName = (s) => (sessionLabel(s) === s.title ? s.title : `${sessionLabel(s)}: ${s.title}`);
export function sessionWhen(s) {
  if (!isISO(s.scheduled_date)) return "No date given";
  const t = s.start_time ? ` · ${fmtTime(s.start_time.slice(0, 5))}${s.end_time ? "–" + fmtTime(s.end_time.slice(0, 5)) : ""}` : "";
  return fmtDate(s.scheduled_date) + t;
}
export function attPill(status) {
  const cls = { physical: "ok", online: "ok", recording: "ok", partial: "warn", absent: "bad", not_yet: "" }[status] || "";
  return `<span class="pill ${cls}">${esc(ATT[status] || "Not yet attended")}</span>`;
}
export function studyPill(st) {
  if (st.fully) return `<span class="pill ok">Studied</span>`;
  if (st.core > 0) return `<span class="pill info">${st.core} of ${CORE.length}</span>`;
  return `<span class="pill">Not started</span>`;
}
export function srcRef(id) {
  if (!id) return "";
  const d = source(id);
  return `<div class="src" title="${esc(d?.title || id)}">${esc(d?.title || id)}${d?.file_name ? ` (${esc(d.file_name)})` : ""}</div>`;
}
export function infoRequired(items, title = "Information required") {
  if (!items || !items.length) return "";
  return `<div class="info-req" role="note"><strong>${esc(title)}</strong><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
}

// The progress ledger: one cell per session. Top half = attendance, bottom half = study depth.
export function ledgerCells(cid, { mini = false } = {}) {
  const today = S.today;
  const sess = courseSessions(cid).filter((s) => !s.cancelled).sort((a, b) => (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999") || a.seq - b.seq);
  if (mini) {
    return `<span class="mini-ledger" style="${cvar(cid)}" aria-hidden="true">${sess.filter(isStudyTracked).map((s) => {
      const st = sessionState(s, S, today);
      return `<i class="${st.fully ? "done" : st.core ? "half" : ""}"></i>`;
    }).join("")}</span>`;
  }
  return `<div class="cells" style="${cvar(cid)}">${sess.map((s) => {
    const st = sessionState(s, S, today);
    const a = st.attended >= 1 ? "a-full" : st.attended > 0 ? "a-half" : st.missed && st.status === "absent" ? "a-miss" : "";
    const lvl = isStudyTracked(s) ? (st.fully ? 3 : st.core >= 3 ? 2 : st.core > 0 ? 1 : 0) : 0;
    const label = `${sessionLabel(s)}: ${s.title}. ${ATT[st.status]}. ${isStudyTracked(s) ? (st.fully ? "Fully studied" : `${st.core} of 5 study steps`) : "Not a study lecture"}. ${s.scheduled_date ? fmtDate(s.scheduled_date) : "No date"}`;
    return `<button class="cell ${st.future ? "future" : ""} ${s.scheduled_date === today ? "today" : ""}" data-open-session="${s.id}" title="${esc(label)}" aria-label="${esc(label)}"><span class="a ${a}"></span><span class="s s-p${lvl}"></span></button>`;
  }).join("")}</div>`;
}
export const ledgerKey = () => `<div class="ledger-key" aria-hidden="true">
  <span><i style="background:var(--nile)"></i>Top: attended or watched</span>
  <span><i style="background:linear-gradient(90deg,var(--nile) 50%,transparent 50%)"></i>Partly attended</span>
  <span><i style="background:repeating-linear-gradient(135deg,var(--brick) 0 3px,transparent 3px 7px)"></i>Absent</span>
  <span><i style="background:color-mix(in srgb,var(--nile) 30%,transparent)"></i><i style="background:color-mix(in srgb,var(--nile) 60%,transparent)"></i><i style="background:var(--nile)"></i>Bottom: study depth</span>
  <span><i style="border-style:dashed"></i>Upcoming</span></div>`;

// ── Charts (Chart.js). Colours come from CSS tokens so both themes work. ──
const charts = new Map();
export function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export function chart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el || !window.Chart) return;
  charts.get(canvasId)?.destroy();
  const ink2 = css("--ink-2"), rule = css("--rule-2");
  window.Chart.defaults.font.family = css("--sans") || "system-ui";
  window.Chart.defaults.color = ink2;
  const base = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    plugins: { legend: { labels: { boxWidth: 12, boxHeight: 12, usePointStyle: false } }, tooltip: { backgroundColor: css("--ink"), titleColor: css("--paper"), bodyColor: css("--paper") } },
    scales: config.type === "doughnut" ? undefined : {
      x: { grid: { display: false }, ticks: { color: ink2 }, border: { color: rule } },
      y: { grid: { color: rule }, ticks: { color: ink2 }, border: { display: false }, beginAtZero: true },
    },
  };
  const merged = { ...config, options: deepMerge(base, config.options || {}) };
  charts.set(canvasId, new window.Chart(el, merged));
}
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? deepMerge(a[k], v) : v;
  return out;
}
export const courseColor = (cid) => css(`--c-${cid}`) || course(cid)?.color || css("--nile");
export const courseColorsResolved = () => S.courses.map((c) => courseColor(c.id));
export function rateRow(label, value, formula) {
  return `<div class="rate-row"><span>${esc(label)}</span><div class="meter" role="img" aria-label="${esc(label)} ${value ?? "not available"}${value != null ? "%" : ""}"><i style="width:${value ?? 0}%"></i></div><span class="num">${value == null ? "—" : value + "%"}</span>${formula ? `<div class="formula">${esc(formula)}</div>` : ""}</div>`;
}

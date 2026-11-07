// Notifications: a bell in the top bar listing what needs attention (assignments due before
// the course's next lecture, project and other deadlines, assignments or announcements newly
// added for the class), plus optional system notifications on this phone or computer.
// System notifications appear while the Hub is open or running in the background; there is
// no server push, so nothing arrives while the browser is fully closed.
import { esc, fmtDate, relDays, daysBetween, isISO, $ } from "../lib.js?v=202611070657";
import { S, allAssignments, allProjects, isProject, courseSessions } from "../store.js?v=202611070657";
import { taskStatus, DONE_TASK } from "../metrics.js?v=202611070657";
import { coursePill, cvar, courseName } from "../ui.js?v=202611070657";

const k = (name) => `mlea_${name}_${S.user?.id || "anon"}`;
const load = (name, def) => { try { return JSON.parse(localStorage.getItem(k(name)) || "null") ?? def; } catch { return def; } };
const save = (name, v) => { try { localStorage.setItem(k(name), JSON.stringify(v)); } catch { /* private mode */ } };
const tkey = (t) => t.id || "a:" + t.assessment_id;

// First run on a device: everything that already exists counts as seen, so only later additions show as "new".
function knownSets() {
  let known = load("known", null);
  if (!known) { known = { a: S.assessments.map((a) => a.id), n: S.announcements.map((a) => a.id) }; save("known", known); }
  return { a: new Set(known.a), n: new Set(known.n) };
}
export function markAllKnown() { save("known", { a: S.assessments.map((a) => a.id), n: S.announcements.map((a) => a.id) }); }

// The current alerts, most urgent first. Each has a stable key so it is only announced once a day.
export function alerts() {
  const out = [];
  const today = S.today;
  const known = knownSets();
  for (const t of [...allAssignments(), ...allProjects()]) {
    if (!isISO(t.due_date) || DONE_TASK.has(taskStatus(t, today))) continue;
    const d = daysBetween(today, t.due_date);
    const kind = isProject(t) ? "Project" : "Assignment";
    const next = t.course_id ? courseSessions(t.course_id).find((s) => !s.cancelled && s.scheduled_date && s.scheduled_date > today) : null;
    const open = `data-open-task="${esc(tkey(t))}"`;
    if (d < 0) out.push({ key: `over:${tkey(t)}`, level: 3, title: `${kind} overdue: ${t.title}`, body: `It was due ${fmtDate(t.due_date)}.`, t, open });
    else if (next && t.due_date <= next.scheduled_date) out.push({ key: `before:${tkey(t)}:${next.id}`, level: d <= 2 ? 3 : 2, title: `${kind} due before your next ${courseName(t.course_id)} lecture`, body: `${t.title}: due ${fmtDate(t.due_date)} (${relDays(t.due_date, today)}); next lecture ${fmtDate(next.scheduled_date)}.`, t, open });
    else if (d <= 7) out.push({ key: `soon:${tkey(t)}`, level: d <= 2 ? 3 : 1, title: `${kind} due ${relDays(t.due_date, today)}`, body: `${t.title}, ${fmtDate(t.due_date)}.`, t, open });
  }
  for (const a of S.assessments) {
    if (known.a.has(a.id) || a.type === "exam") continue;
    out.push({ key: `new:${a.id}`, level: 2, title: `New ${a.type.replace("_", " ")} for ${courseName(a.course_id)}`, body: `${a.title}${a.due_date ? `, due ${fmtDate(a.due_date)}` : ""}. Added for the whole class.`, t: { course_id: a.course_id }, open: `data-open-task="a:${a.id}"`, isNew: true });
  }
  for (const n of S.announcements) {
    if (known.n.has(n.id)) continue;
    out.push({ key: `ann:${n.id}`, level: 1, title: `Announcement: ${n.title}`, body: String(n.body || "").slice(0, 140), t: { course_id: n.course_id }, open: `data-href="#/announcements"`, isNew: true });
  }
  return out.sort((a, b) => b.level - a.level);
}

export function initNotifications() {
  const btn = $("#bellBtn");
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener("click", (e) => { e.stopPropagation(); togglePanel(); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#bellPanel") && !e.target.closest("#bellBtn")) $("#bellPanel").hidden = true; });
  refreshBell();
  announce();
  setInterval(() => { refreshBell(); announce(); }, 30 * 60 * 1000);
  window.addEventListener("hub:changed", refreshBell);
}

export function refreshBell() {
  const list = alerts();
  const seen = new Set(load("seen", []));
  const unseen = list.filter((a) => !seen.has(a.key)).length;
  const badge = $("#bellBtn .badge");
  if (badge) { badge.textContent = unseen > 9 ? "9+" : String(unseen); badge.hidden = !unseen; }
  $("#bellBtn")?.setAttribute("aria-label", unseen ? `Notifications, ${unseen} new` : "Notifications");
  if (!$("#bellPanel").hidden) drawPanel(list);
}

function togglePanel() {
  const p = $("#bellPanel");
  p.hidden = !p.hidden;
  if (!p.hidden) {
    const list = alerts();
    drawPanel(list);
    save("seen", list.map((a) => a.key));
    refreshBell();
  }
}

function drawPanel(list) {
  const p = $("#bellPanel");
  const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  p.innerHTML = `<div class="bp-head"><h2>Notifications</h2>${list.some((a) => a.isNew) ? `<button class="btn ghost sm" data-clearnew>Clear new</button>` : ""}</div>
    ${list.length ? `<ul class="bp-list">${list.map((a) => `<li class="lv${a.level}" style="${a.t?.course_id ? cvar(a.t.course_id) : ""}"><button ${a.open}><b>${esc(a.title)}</b><span>${esc(a.body)}</span>${a.t?.course_id ? coursePill(a.t.course_id) : ""}</button></li>`).join("")}</ul>`
      : `<div class="empty"><strong>You're all caught up.</strong>No deadlines in the next week.</div>`}
    <div class="bp-foot">${perm === "granted" ? `<span class="small muted">Notifications are on for this device.</span>`
      : perm === "denied" ? `<span class="small muted">Notifications are blocked in this browser's settings.</span>`
      : perm === "unsupported" ? `<span class="small muted">On iPhone, add the Hub to your Home Screen to get notifications.</span>`
      : `<button class="btn sm primary" data-enable>Turn on notifications on this device</button>`}</div>`;
  $("[data-enable]", p)?.addEventListener("click", async () => {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
    drawPanel(alerts()); announce(true);
  });
  $("[data-clearnew]", p)?.addEventListener("click", () => { markAllKnown(); refreshBell(); drawPanel(alerts()); });
  p.querySelectorAll("button[data-open-task],button[data-href]").forEach((b) => b.addEventListener("click", () => { p.hidden = true; }, { capture: true }));
}

// System notifications: each alert at most once a day per device.
async function announce(force = false) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const fired = load("fired", {});
  const today = S.today;
  const list = alerts().filter((a) => a.level >= 2 && (force || fired[a.key] !== today)).slice(0, 4);
  for (const a of list) {
    fired[a.key] = today;
    await showSystem(a.title, a.body, a.key);
  }
  for (const key of Object.keys(fired)) if (fired[key] < today && daysBetween(fired[key], today) > 30) delete fired[key];
  save("fired", fired);
}

let swReg = null;
export async function registerWorker() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return null;
  try { swReg = await navigator.serviceWorker.register("sw.js"); } catch { swReg = null; }
  return swReg;
}
export async function showSystem(title, body, tag) {
  const opts = { body, tag, icon: "icon.svg", badge: "icon.svg" };
  try {
    const reg = swReg || (await navigator.serviceWorker?.getRegistration?.());
    if (reg) return await reg.showNotification(title, opts); // phones need the service worker route
  } catch { /* fall back below */ }
  try { new Notification(title, opts); } catch { /* not allowed here */ }
}

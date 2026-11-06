// Shared pieces for the welcome screen, Dashboard and Study page.
import { esc, isISO, relDays, addDays, errToast } from "../lib.js?v=202611061403";
import { S, saveProgress, allAssignments, allProjects } from "../store.js?v=202611061403";
import { sessionState, isStudyTracked, CORE, taskStatus, DONE_TASK } from "../metrics.js?v=202611061403";
import { cvar, coursePill, sessionName, deliveryTag } from "../ui.js?v=202611061403";

export const CREST = (size = 44) => `<svg class="crest" viewBox="0 0 40 46" width="${size}" height="${Math.round(size * 1.15)}" aria-hidden="true"><path d="M20 2 37 8v14c0 11-7.4 18.6-17 22C10.4 40.6 3 33 3 22V8z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M20 6.5 33 11v11c0 8.6-5.6 14.6-13 17.6C12.6 36.6 7 30.6 7 22V11z" fill="currentColor" opacity=".12"/><path d="M11 15.5h18M11 15.5v13M29 15.5v13M11 28.5c3-1.6 6-1.6 9 0 3-1.6 6-1.6 9 0M20 15.5v13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

export const firstName = () => (S.profile?.full_name || "").trim().split(/\s+/)[0] || "";

// Greeting by the hour in Cairo.
export function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Cairo" }).format(new Date()));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// Lectures that have taken place but aren't fully studied yet, oldest first.
export function pendingLectures() {
  return S.sessions
    .filter((s) => isStudyTracked(s))
    .map((s) => ({ s, st: sessionState(s, S, S.today) }))
    .filter(({ s, st }) => st.held && !st.fully && isISO(s.scheduled_date))
    .sort((a, b) => a.s.scheduled_date.localeCompare(b.s.scheduled_date));
}

// Deadlines in the next `days` days (assignments and projects), soonest first.
export function dueSoon(days = 14) {
  return [...allAssignments(), ...allProjects()]
    .filter((t) => isISO(t.due_date) && !DONE_TASK.has(taskStatus(t, S.today)) && t.due_date >= S.today && t.due_date <= addDays(S.today, days))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function pendingItem({ s, st }) {
  const why = st.core > 0 ? `${st.core} of 5 study steps done` : st.recordingPending ? "Recording not watched yet" : "Not studied yet";
  return `<li style="${cvar(s.course_id)}" data-pending="${s.id}"><span class="bar"></span>
    <div><div class="t">${esc(sessionName(s))}</div><div class="d">${coursePill(s.course_id)} · ${esc(relDays(s.scheduled_date, S.today))} · ${esc(why)} · ${deliveryTag(s.delivery)}</div></div>
    <div class="acts"><button class="btn sm" data-open-session="${s.id}">Open</button><button class="btn sm primary" data-studied="${s.id}">Mark studied</button></div></li>`;
}

// "Mark studied" ticks the five core checklist steps, which is what "fully studied" means.
export async function markStudied(sessionId) {
  const patch = Object.fromEntries(CORE.map((k) => [k, true]));
  await saveProgress(sessionId, patch);
}

// Wires the Mark studied buttons inside `root`.
export function wirePending(root, { onDone } = {}) {
  root.querySelectorAll("[data-studied]").forEach((b) => b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    b.disabled = true;
    try {
      await markStudied(b.dataset.studied);
      const li = b.closest("li"); li?.classList.add("done"); b.textContent = "Studied";
      onDone && onDone(b.dataset.studied);
    } catch (er) { b.disabled = false; errToast(er); }
  }));
}

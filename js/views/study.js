// Study: lectures waiting to be studied, one card per course, and the study plan.
import { esc, $ } from "../lib.js?v=202611061403";
import { S, courseSessions } from "../store.js?v=202611061403";
import { courseStats, isStudyTracked } from "../metrics.js?v=202611061403";
import { cvar, sessionName, sessionWhen, deliveryTag } from "../ui.js?v=202611061403";
import { renderPlan } from "./analytics.js?v=202611061403";
import { pendingLectures, pendingItem, wirePending } from "./common.js?v=202611061403";

const SHOW = { all: false };
export function renderStudy(view) {
  const pending = pendingLectures();
  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Study</p>
      <h2>Your lectures</h2>
      <p>Every lecture that has taken place, until you've studied it. "Mark studied" ticks the five core steps; open a lecture to tick them one by one, add notes or ask the assistant about it.</p>
    </header>

    <section class="section sheet">
      <div class="section-head"><div><h2>Waiting to be studied</h2><p>${pending.length ? `${pending.length} lecture${pending.length === 1 ? "" : "s"}, oldest first.` : "Nothing pending."}</p></div></div>
      ${pending.length ? `<ul class="pending">${pending.slice(0, SHOW.all ? 999 : 8).map(pendingItem).join("")}</ul>${pending.length > 8 && !SHOW.all ? `<button class="btn sm" style="margin-top:10px" data-showall>Show all ${pending.length}</button>` : ""}` : `<div class="empty"><strong>You're up to date.</strong>Every lecture so far is studied. Revise or read ahead below.</div>`}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Courses</h2><p>Open a course for its lectures, materials, readings and assessments.</p></div></div>
      <div class="course-cards">${S.courses.map(courseCard).join("") || `<div class="empty">No courses yet.</div>`}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Study plan</h2><p>What to study next, ranked by urgency, and a seven-day plan you can add to your calendar.</p></div></div>
      <div id="studyPlan"></div>
    </section>`;
  $("[data-showall]", view)?.addEventListener("click", () => { SHOW.all = true; renderStudy(view); });
  wirePending(view, { onDone: () => window.dispatchEvent(new CustomEvent("hub:changed")) });
  renderPlan($("#studyPlan", view));
}

function courseCard(c) {
  const st = courseStats(c.id, S, S.today);
  const next = courseSessions(c.id).find((s) => !s.cancelled && s.scheduled_date && s.scheduled_date >= S.today);
  const total = courseSessions(c.id).filter(isStudyTracked).length;
  const pct = st.rates?.overall ?? 0;
  return `<a class="ccard" href="#/course/${esc(c.id)}" style="${cvar(c.id)}">
    <div><h3>${esc(c.short_name || c.name)}</h3><div class="small muted" style="margin-top:4px">${st.studied ?? 0} of ${total} lectures studied</div></div>
    <div class="ring" style="--p:${pct}"><span>${st.rates?.overall == null ? "—" : pct + "%"}</span></div>
    <div class="meta">${next ? `Next: ${esc(sessionName(next))} · ${esc(sessionWhen(next))} · ${deliveryTag(next.delivery)}` : "No more lectures scheduled."}</div>
  </a>`;
}

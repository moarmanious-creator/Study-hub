// Study: lectures waiting to be studied, one card per course, and the study plan.
import { esc, toast, errToast, $, $$ } from "../lib.js?v=202611061458";
import { S, sb, courseSessions, isStaff } from "../store.js?v=202611061458";
import { createNote } from "./notes.js?v=202611061458";
import { courseStats, isStudyTracked } from "../metrics.js?v=202611061458";
import { cvar, sessionName, sessionWhen, deliveryTag, coursePill } from "../ui.js?v=202611061458";
import { renderPlan } from "./analytics.js?v=202611061458";
import { pendingLectures, pendingItem, wirePending } from "./common.js?v=202611061458";

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
      <div class="section-head"><div><h2>Study notes</h2><p>A one-page, handwritten-style revision sheet for each lecture, made by the AI from its slides and shared with the whole class.</p></div>${isStaff() ? `<button class="btn" data-allnotes>Create missing notes</button>` : ""}</div>
      <div class="sheet flush"><div class="table-wrap" id="notesList"><div class="loading">Loading…</div></div></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Study plan</h2><p>What to study next, ranked by urgency, and a seven-day plan you can add to your calendar.</p></div></div>
      <div id="studyPlan"></div>
    </section>`;
  $("[data-showall]", view)?.addEventListener("click", () => { SHOW.all = true; renderStudy(view); });
  wirePending(view, { onDone: () => window.dispatchEvent(new CustomEvent("hub:changed")) });
  renderPlan($("#studyPlan", view));
  drawNotes(view);
}

const heldLectures = () => S.sessions.filter((s) => isStudyTracked(s) && !s.cancelled && s.scheduled_date && s.scheduled_date <= S.today)
  .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));

async function drawNotes(view) {
  const box = $("#notesList", view);
  if (!box) return;
  const { data, error } = await sb.from("lecture_notes").select("session_id, source");
  if (error) { box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  const have = new Map((data || []).map((n) => [n.session_id, n.source]));
  const list = heldLectures();
  box.innerHTML = list.length ? `<table class="data"><thead><tr><th>Lecture</th><th>Course</th><th>Note</th><th></th></tr></thead><tbody>${list.map((s) => `<tr>
    <td><strong>${esc(sessionName(s))}</strong></td><td>${coursePill(s.course_id)}</td>
    <td>${have.has(s.id) ? `<span class="pill ok">Ready</span>${have.get(s.id) === "topics" ? ` <span class="small muted">from topics</span>` : ""}` : `<span class="pill">Not created yet</span>`}</td>
    <td style="text-align:right"><button class="btn sm ${have.has(s.id) ? "primary" : ""}" data-study-note="${s.id}">${have.has(s.id) ? "Open" : "Create"}</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">No lectures have taken place yet.</div>`;
  $("[data-allnotes]", view)?.addEventListener("click", async (e) => {
    const missing = list.filter((s) => !have.has(s.id));
    if (!missing.length) return toast("Every lecture so far has a note.");
    const b = e.currentTarget; b.disabled = true;
    let done = 0;
    for (const s of missing) {
      b.textContent = `Creating ${done + 1} of ${missing.length}…`;
      try { await createNote(s.id); done++; } catch (er) { errToast(er); break; }
      await new Promise((r) => setTimeout(r, 2500)); // stay well inside the free AI rate limits
    }
    toast(`${done} study note${done === 1 ? "" : "s"} created`);
    drawNotes(view);
    b.disabled = false; b.textContent = "Create missing notes";
  });
  void $$;
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

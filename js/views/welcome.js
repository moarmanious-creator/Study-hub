// Welcome page (#/welcome): the first page each day. A personal greeting, what's waiting to be
// studied, the next deadlines and the latest alerts, with one tap to each part of the Hub.
import { esc, fmtDate, fmtLong, relDays, icon, $ } from "../lib.js?v=202611070657";
import { S } from "../store.js?v=202611070657";
import { coursePill, cvar } from "../ui.js?v=202611070657";
import { CREST, firstName, greeting, pendingLectures, pendingItem, dueSoon, wirePending } from "./common.js?v=202611070657";
import { alerts } from "./notify.js?v=202611070657";

const key = (k) => `mlea_${k}_${S.user?.id || "anon"}`;
const read = (k) => { try { return localStorage.getItem(key(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(key(k), v); } catch { /* private mode */ } };

// On the first visit of the day, open the Welcome page (unless a specific page was linked to).
export function maybeWelcome() {
  if (window.__HUB_NO_WELCOME) return;
  if (read("welcome_day") === S.today) return;
  const h = location.hash.replace(/^#\/?/, "");
  if (!h || h === "dashboard") location.hash = "#/welcome";
}
export const showWelcome = () => { location.hash = "#/welcome"; };

export function renderWelcome(view) {
  const firstTime = !read("welcomed");
  write("welcome_day", S.today);
  write("welcomed", "1");
  const name = firstName();
  const pending = pendingLectures();
  const shown = pending.slice(0, 5);
  const due = dueSoon(14).slice(0, 4);
  const notes = alerts().filter((a) => a.isNew || a.level >= 2).slice(0, 3);
  view.innerHTML = `
  <section class="welcome-page">
    <div class="wp-hero">
      ${CREST(46)}
      <p class="eyebrow">${esc(fmtLong(S.today))}</p>
      <h2>${firstTime ? `Welcome to Student Hub${name ? `, ${esc(name)}` : ""}.` : `${greeting()}${name ? `, ${esc(name)}` : ""}.`}</h2>
      <p class="lead">${firstTime
        ? "Your private study portal: every lecture, slide, assignment, project and file for the programme in one place, with an AI study assistant beside you."
        : pending.length ? `You have ${pending.length} lecture${pending.length === 1 ? "" : "s"} waiting to be studied${due.length ? ` and ${due.length} deadline${due.length === 1 ? "" : "s"} in the next two weeks` : ""}.` : "You're fully up to date with every lecture so far."}</p>
      <div class="wp-actions">
        ${shown.length ? `<a class="btn gold" href="#/lecture/${shown[0].s.id}">Start with the first lecture</a>` : `<a class="btn gold" href="#/study">Go to Study</a>`}
        <a class="btn" href="#/dashboard">My dashboard</a>
        <button class="btn" type="button" data-ai-open>Ask the AI assistant</button>
      </div>
    </div>

    ${notes.length ? `<div class="wp-alerts">${notes.map((a) => `<button class="wp-alert lv${a.level}" ${a.open}><b>${esc(a.title)}</b><span>${esc(a.body)}</span></button>`).join("")}</div>` : ""}

    <div class="wp-grid">
      <section class="sheet">
        <div class="section-head"><div><h2>Waiting for you</h2><p>${pending.length ? "Lectures that have taken place and aren't fully studied yet, oldest first." : "Nothing pending."}</p></div>${pending.length > shown.length ? `<a class="btn sm" href="#/study">All ${pending.length}</a>` : ""}</div>
        ${shown.length ? `<ul class="pending">${shown.map(pendingItem).join("")}</ul>` : `<p style="margin:0">Well done. Use the time to revise or read ahead.</p>`}
      </section>
      <section class="sheet">
        <div class="section-head"><div><h2>Coming deadlines</h2><p>Assignments and projects in the next two weeks.</p></div></div>
        ${due.length ? `<ul class="pending">${due.map((t) => `<li style="${t.course_id ? cvar(t.course_id) : ""}"><span class="bar"></span><div><div class="t">${esc(t.title)}</div><div class="d">${coursePill(t.course_id)} · ${esc(fmtDate(t.due_date))} · ${esc(relDays(t.due_date, S.today))}</div></div><div class="acts"><button class="btn sm" data-open-task="${esc(t.id || "a:" + t.assessment_id)}">Open</button></div></li>`).join("")}</ul>` : `<p class="muted" style="margin:0">No deadlines in the next two weeks.</p>`}
      </section>
    </div>

    ${firstTime ? `<div class="wp-intro">
      <div>${icon.study}<b>Study</b>Open a lecture, read the slides and it ticks itself off.</div>
      <div>${icon.tasks}<b>Assignments &amp; projects</b>Deadlines, reminders, and one-tap submission to the instructor.</div>
      <div>${icon.spark}<b>AI assistant</b>Explanations, summaries, quizzes and handwritten-style study notes.</div>
    </div>` : ""}

    <section class="tiles" aria-label="Quick access" style="margin-top:22px">
      <a class="tile" href="#/study">${icon.study}<b>Study</b><span>Lectures, slides and notes</span></a>
      <a class="tile" href="#/assignments">${icon.tasks}<b>Assignments</b><span>Coursework and deadlines</span></a>
      <a class="tile" href="#/projects">${icon.project}<b>Projects</b><span>Presentations and papers</span></a>
      <a class="tile" href="#/documents">${icon.docs}<b>Documents &amp; materials</b><span>Readings and your files</span></a>
      <a class="tile" href="#/calendar">${icon.cal}<b>Calendar</b><span>Lectures and deadlines by date</span></a>
    </section>
  </section>`;
  $("[data-ai-open]", view).addEventListener("click", () => window.dispatchEvent(new CustomEvent("hub:ai", { detail: {} })));
  wirePending(view, { onDone: () => window.dispatchEvent(new CustomEvent("hub:changed")) });
}

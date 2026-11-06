// Main student dashboard: ledger, figures, charts, priorities, upcoming items.
import { esc, fmtDate, fmtLong, fmtMinutes, relDays, daysBetween, addDays, isISO, md, icon } from "../lib.js?v=202611061458";
import { S, allTasks, allProjects } from "../store.js?v=202611061458";
import { greeting, firstName, pendingLectures, dueSoon } from "./common.js?v=202611061458";

import { programmeStats, priorities, recommendations, weeklyActivity, taskStatus, FORMULAS, TASK_STATUS } from "../metrics.js?v=202611061458";
import { courseName, cvar, ledgerCells, ledgerKey, sessionLabel, sessionName, coursePill, deliveryTag, chart, courseColor, css, sessionWhen } from "../ui.js?v=202611061458";

export function priorityItem(p) {
  const s = p.session, t = p.task;
  const cid = s ? s.course_id : t.course_id;
  const title = s ? sessionName(s) : t.title;
  const open = s ? `data-open-session="${s.id}"` : `data-open-task="${esc(t.id || "a:" + t.assessment_id)}"`;
  const reasons = p.reasons ? p.reasons.join(" · ") : p.reason;
  return `<li style="${cvar(cid)}"><span class="bar"></span><div><button class="t" ${open}>${esc(title)}</button><div class="d">${esc(reasons)}</div></div>${coursePill(cid)}</li>`;
}

export function renderDashboard(view) {
  const today = S.today;
  const tasks = allTasks();
  const st = programmeStats(S, today);
  const prio = priorities(S, today, tasks);
  const next = recommendations(S, today, tasks, 3);
  const name = firstName();

  const upcomingSessions = S.sessions.filter((s) => !s.cancelled && isISO(s.scheduled_date) && s.scheduled_date >= today && s.scheduled_date <= addDays(today, 14))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const upcomingTasks = tasks.filter((t) => isISO(t.due_date) && t.due_date >= today && !["completed", "submitted"].includes(t.status))
    .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);
  const todays = upcomingSessions.filter((s) => s.scheduled_date === today);
  const pendingAssign = tasks.filter((t) => t.official?.type !== "exam" && t.official?.type !== "presentation" && !["completed", "submitted"].includes(t.status)).length;
  const pendingPres = tasks.filter((t) => t.official?.type === "presentation" && !["completed", "submitted"].includes(t.status)).length;
  const pinned = S.announcements.slice(0, 2);

  const lead = todays.length
    ? `Today: ${todays.map((s) => `${esc(s.title)} (${esc(courseName(s.course_id))}, ${deliveryTag(s.delivery)})`).join("; ")}.`
    : upcomingSessions.length ? `Next lecture: ${esc(upcomingSessions[0].title)}, ${esc(relDays(upcomingSessions[0].scheduled_date, today))}.` : "No lectures scheduled in the next two weeks.";

  const pending = pendingLectures().length;
  const due = dueSoon(14).length;
  const projActive = allProjects().filter((t) => !["completed", "submitted"].includes(t.status));
  view.innerHTML = `
  <section class="hero">
    <p class="eyebrow">${esc(fmtLong(today))}</p>
    <h2>${esc(greeting())}${name ? `, ${esc(name)}` : ""}.</h2>
    <p>${lead}</p>
    <div class="hero-stats">
      <a class="hs ${pending ? "alert" : ""}" href="#/study"><b>${pending}</b><span>lecture${pending === 1 ? "" : "s"} to study</span></a>
      <a class="hs ${due ? "alert" : ""}" href="#/assignments"><b>${due}</b><span>deadline${due === 1 ? "" : "s"} in 14 days</span></a>
      <a class="hs" href="#/projects"><b>${projActive.length}</b><span>project${projActive.length === 1 ? "" : "s"} in progress</span></a>
      <a class="hs" href="#/analytics"><b>${st.overall == null ? "—" : st.overall + "%"}</b><span>overall progress</span></a>
    </div>
  </section>

  <section class="section tiles" aria-label="Quick access">
    <a class="tile" href="#/study">${icon.study}<b>Study</b><span>Lectures to study and your plan</span></a>
    <a class="tile" href="#/assignments">${icon.tasks}<b>Assignments</b><span>Coursework and deadlines</span></a>
    <a class="tile" href="#/projects">${icon.project}<b>Projects</b><span>Presentations and papers</span></a>
    <a class="tile" href="#/documents">${icon.docs}<b>Documents &amp; materials</b><span>Readings, slides, your files and notes</span></a>
    <button class="tile" type="button" data-ai-open>${icon.spark}<b>AI Study Assistant</b><span>Explain, summarise, quiz me</span></button>
  </section>

  ${pinned.length ? `<section class="section">${pinned.map((a) => `<div class="sheet" style="margin-bottom:10px"><div class="spread"><h3>${esc(a.title)}</h3>${a.course_id ? coursePill(a.course_id) : `<span class="pill info">Programme</span>`}</div><div class="small" style="margin-top:6px">${md(a.body)}</div><div class="muted small">${fmtDate(a.created_at.slice(0, 10))}</div></div>`).join("")}</section>` : ""}

  <section class="section">
    <div class="section-head"><div><h2>Progress ledger</h2><p>One cell per session. Top half: did you attend or watch it. Bottom half: how far you've studied it. Select a cell to update it.</p></div></div>
    <div class="sheet"><div class="ledger">
      ${S.courses.map((c) => {
        const cs = st.per[c.id];
        return `<div class="ledger-row" style="${cvar(c.id)}">
          <a class="lr-name" href="#/course/${c.id}">${esc(c.short_name || c.name)}<small>${cs.studied} of ${cs.total} lectures studied</small></a>
          ${ledgerCells(c.id)}
          <div class="lr-fig"><b>${cs.rates.overall ?? "—"}${cs.rates.overall != null ? "%" : ""}</b><br>overall</div></div>`;
      }).join("")}
    </div>${ledgerKey()}</div>
  </section>

  <details class="section more"><summary>All figures and how they're calculated</summary>
    <div class="figs" role="list" style="margin-top:10px">
      ${[["Courses", st.courses], ["Scheduled sessions", st.sessions], ["Sessions held so far", st.held], ["Attended", fmtN(st.attended)], ["Watched as recording", st.recWatched],
         ["Missed or not marked", st.missed, st.missed > 0], ["Fully studied", st.studied], ["In progress", st.inProgress], ["Not studied yet", st.notStudied, st.notStudied > 0],
         ["Pending assignments", pendingAssign], ["Pending presentations", pendingPres], ["Study time left (est.)", fmtMinutes(st.remaining)], ["Overall progress", st.overall == null ? "—" : st.overall + "%"]]
        .map(([l, v, alert]) => `<div class="fig ${alert ? "alert" : ""}" role="listitem"><b>${v}</b><span>${l}</span></div>`).join("")}
    </div>
    <p class="muted small" style="margin-top:10px">${esc(FORMULAS.attendance)}<br>${esc(FORMULAS.study)}<br>${esc(FORMULAS.overall)}<br>${esc(FORMULAS.remaining)}</p>
  </details>

  <div class="grid side-r section">
    <section class="sheet">
      <div class="section-head"><h2>My academic priorities</h2><a class="btn sm" href="#/plan">Open study plan</a></div>
      ${prio.length ? `<ul class="plist">${prio.slice(0, 8).map(priorityItem).join("")}</ul>${prio.length > 8 ? `<p class="muted small" style="margin-top:8px">${prio.length - 8} more on the study plan page.</p>` : ""}`
        : `<div class="empty"><strong>Nothing overdue.</strong>You're up to date with every lecture that has taken place.</div>`}
    </section>
    <section class="sheet">
      <div class="section-head"><h2>What should I study next?</h2></div>
      ${next.length ? `<ol class="plist">${next.map(priorityItem).join("")}</ol>` : `<div class="empty">Nothing pressing. Use the time to revise or read ahead.</div>`}
      <hr class="hr">
      <h3 style="margin-bottom:8px">Coming up</h3>
      <ul class="plist">
        ${upcomingSessions.slice(0, 5).map((s) => `<li style="${cvar(s.course_id)}"><span class="bar"></span><div><button class="t" data-open-session="${s.id}">${esc(s.title)}</button><div class="d">${esc(sessionWhen(s))} · ${deliveryTag(s.delivery)}</div></div><span class="muted small">${esc(relDays(s.scheduled_date, today))}</span></li>`).join("")}
        ${upcomingTasks.map((t) => `<li style="${cvar(t.course_id)}"><span class="bar"></span><div><button class="t" data-open-task="${esc(t.id || "a:" + t.assessment_id)}">${esc(t.title)}</button><div class="d">Deadline ${fmtDate(t.due_date)} · ${esc(TASK_STATUS[taskStatus(t, today)])}</div></div><span class="muted small">${esc(relDays(t.due_date, today))}</span></li>`).join("")}
        ${!upcomingSessions.length && !upcomingTasks.length ? `<li><span></span><div class="muted">Nothing in the next two weeks.</div><span></span></li>` : ""}
      </ul>
    </section>
  </div>

  <section class="section">
    <div class="section-head"><h2>Charts</h2></div>
    <div class="grid two">
      <div class="sheet"><h3>Progress by course</h3><p class="muted small">Attendance, study completion and overall progress side by side, so attending is never mistaken for studying.</p><div class="chart-box"><canvas id="chProgress" role="img" aria-label="Attendance, study completion and overall progress by course"></canvas></div></div>
      <div class="sheet"><h3>Remaining workload</h3><p class="muted small">Lectures not yet fully studied, and estimated hours to finish them.</p><div class="chart-box"><canvas id="chRemain" role="img" aria-label="Remaining lectures and hours by course"></canvas></div></div>
      <div class="sheet"><h3>Weekly study activity</h3><p class="muted small">Hours you logged per week (weeks start Saturday). Log time from any lecture.</p><div class="chart-box"><canvas id="chWeekly" role="img" aria-label="Hours studied per week"></canvas></div></div>
      <div class="sheet"><h3>Study completion by course</h3><p class="muted small">Fully studied, in progress and not started lectures.</p><div class="chart-box"><canvas id="chStudy" role="img" aria-label="Study completion by course"></canvas></div></div>
    </div>
  </section>`;

  const labels = S.courses.map((c) => c.short_name || c.name);
  const nile = css("--nile"), brass = css("--brass"), sage = css("--sage"), rule = css("--rule"), ink3 = css("--ink-3");
  chart("chProgress", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Attendance", data: S.courses.map((c) => st.per[c.id].rates.attendance ?? 0), backgroundColor: ink3, borderRadius: 3 },
      { label: "Study completion", data: S.courses.map((c) => st.per[c.id].rates.study ?? 0), backgroundColor: S.courses.map((c) => courseColor(c.id)), borderRadius: 3 },
      { label: "Overall progress", data: S.courses.map((c) => st.per[c.id].rates.overall ?? 0), backgroundColor: brass, borderRadius: 3 },
    ] },
    options: { scales: { y: { max: 100, ticks: { callback: (v) => v + "%" } } } },
  });
  chart("chRemain", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Lectures left", data: S.courses.map((c) => st.per[c.id].total - st.per[c.id].studied), backgroundColor: S.courses.map((c) => courseColor(c.id)), borderRadius: 3, yAxisID: "y" },
      { label: "Hours left (est.)", data: S.courses.map((c) => Math.round(st.per[c.id].remaining / 60)), backgroundColor: rule, borderColor: ink3, borderWidth: 1, borderRadius: 3, yAxisID: "y1" },
    ] },
    options: { scales: { y1: { position: "right", beginAtZero: true, grid: { display: false } } } },
  });
  const weeks = weeklyActivity(S.logs, today, 8);
  chart("chWeekly", {
    type: "line",
    data: { labels: weeks.map((w) => fmtDate(w.start, { day: "numeric", month: "short" })), datasets: [{ label: "Hours", data: weeks.map((w) => +(w.minutes / 60).toFixed(1)), borderColor: nile, backgroundColor: nile, tension: .25, pointRadius: 3 }] },
    options: { plugins: { legend: { display: false } } },
  });
  chart("chStudy", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Fully studied", data: S.courses.map((c) => st.per[c.id].studied), backgroundColor: sage, borderRadius: 2 },
      { label: "In progress", data: S.courses.map((c) => st.per[c.id].inProgress), backgroundColor: brass, borderRadius: 2 },
      { label: "Not started", data: S.courses.map((c) => st.per[c.id].notStudied), backgroundColor: rule, borderRadius: 2 },
    ] },
    options: { indexAxis: "y", scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } } },
  });
  view.querySelector("[data-ai-open]")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("hub:ai", { detail: {} })));
  void daysBetween;
}
const fmtN = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

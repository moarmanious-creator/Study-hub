// Personal progress analytics and the "What should I study next?" plan.
import { esc, fmtDate, fmtMinutes, toast, errToast, cairoToISO, $, $$ } from "../lib.js?v=202611061458";
import { S, allTasks, saveEvent } from "../store.js?v=202611061458";
import { programmeStats, recoveryPlan, recommendations, FORMULAS, weeklyActivity } from "../metrics.js?v=202611061458";
import { cvar, rateRow, chart, courseColor, css, sessionLabel, sessionName, coursePill } from "../ui.js?v=202611061458";
import { priorityItem } from "./dashboard.js?v=202611061458";

export function renderAnalytics(view) {
  const st = programmeStats(S, S.today);
  view.innerHTML = `
    <section class="section"><div class="section-head"><div><h2>Per-course figures</h2><p>All counts come from your own records. Attendance and study are measured separately.</p></div></div>
      <div class="sheet flush"><div class="table-wrap"><table class="data">
        <thead><tr><th>Course</th><th>Lectures</th><th>Attended</th><th>Missed</th><th>Recordings watched</th><th>Studied</th><th>Not studied</th><th>Assignments done</th><th>Pending</th><th>Revision done</th><th>Time left</th></tr></thead>
        <tbody>${S.courses.map((c) => { const x = st.per[c.id]; return `<tr style="${cvar(c.id)}"><td><a href="#/course/${c.id}/progress"><strong>${esc(c.short_name || c.name)}</strong></a></td><td class="num">${x.total}</td><td class="num">${fmt(x.attended)}</td><td class="num">${x.missed}</td><td class="num">${x.recWatched}</td><td class="num">${x.studied}</td><td class="num">${x.notStudied + x.inProgress}</td><td class="num">${x.assessDone}</td><td class="num">${x.assessPending}</td><td class="num">${x.revision}</td><td class="num">${fmtMinutes(x.remaining)}</td></tr>`; }).join("")}</tbody>
      </table></div></div></section>
    <div class="grid two section">
      ${S.courses.map((c) => { const r = st.per[c.id].rates; return `<div class="sheet" style="${cvar(c.id)}"><h3 style="margin-bottom:8px">${esc(c.short_name || c.name)}</h3>${rateRow("Attendance", r.attendance)}${rateRow("Study completion", r.study)}${rateRow("Study depth", r.depth)}${rateRow("Assignments", r.assessments)}${rateRow("Revision", r.revision)}<hr class="hr">${rateRow("Overall", r.overall)}</div>`; }).join("")}
    </div>
    <div class="grid two section">
      <div class="sheet"><h3>Attendance vs study, by course</h3><div class="chart-box"><canvas id="anAtt" role="img" aria-label="Attendance and study completion by course"></canvas></div></div>
      <div class="sheet"><h3>Study minutes logged per course</h3><div class="chart-box"><canvas id="anTime" role="img" aria-label="Minutes logged per course"></canvas></div></div>
    </div>
    <section class="sheet section"><h3>How each figure is calculated</h3><dl class="small" style="margin:10px 0 0">${Object.entries({ "Attendance rate": FORMULAS.attendance, "Study completion rate": FORMULAS.study, "Assignment completion rate": FORMULAS.assessments, "Revision completion rate": FORMULAS.revision, "Overall course progress": FORMULAS.overall, "Remaining time": FORMULAS.remaining }).map(([k, v]) => `<dt style="font-weight:600;margin-top:8px">${k}</dt><dd style="margin:2px 0 0">${esc(v)}</dd>`).join("")}</dl></section>`;
  const labels = S.courses.map((c) => c.short_name || c.name);
  chart("anAtt", { type: "bar", data: { labels, datasets: [
    { label: "Attendance rate", data: S.courses.map((c) => st.per[c.id].rates.attendance ?? 0), backgroundColor: css("--ink-3"), borderRadius: 3 },
    { label: "Study completion rate", data: S.courses.map((c) => st.per[c.id].rates.study ?? 0), backgroundColor: S.courses.map((c) => courseColor(c.id)), borderRadius: 3 }] },
    options: { scales: { y: { max: 100, ticks: { callback: (v) => v + "%" } } } } });
  chart("anTime", { type: "bar", data: { labels, datasets: [{ label: "Minutes", data: S.courses.map((c) => S.logs.filter((l) => l.course_id === c.id).reduce((a, l) => a + l.minutes, 0)), backgroundColor: S.courses.map((c) => courseColor(c.id)), borderRadius: 3 }] },
    options: { plugins: { legend: { display: false } } } });
}
const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

// ── Plan page ──
const capKey = "hub-weekly-minutes";
const getCap = () => { try { return Number(localStorage.getItem(capKey)) || 390; } catch { return 390; } };
const setCap = (v) => { try { localStorage.setItem(capKey, String(v)); } catch { /* per-device convenience only */ } };

export function renderPlan(view) {
  const tasks = allTasks();
  const weekly = getCap();
  const recs = recommendations(S, S.today, tasks, 12);
  const plan = recoveryPlan(S, S.today, tasks, { weeklyMinutes: weekly });
  const weeks = weeklyActivity(S.logs, S.today, 4);
  const avg = Math.round(weeks.reduce((a, w) => a + w.minutes, 0) / weeks.length);
  view.innerHTML = `
    <div class="grid side-r">
      <section class="sheet"><div class="section-head"><div><h2>What should I study next?</h2><p>Ranked from your own attendance, checklist and tasks: overdue and missed lectures first, then near deadlines, unwatched recordings, unfinished notes and revision.</p></div></div>
        ${recs.length ? `<ol class="plist">${recs.map(priorityItem).join("")}</ol>` : `<div class="empty"><strong>You're up to date.</strong>Read ahead for the next lecture or revise an older one.</div>`}
      </section>
      <section class="sheet"><h3>Your weekly study time</h3>
        <label class="field" style="margin-top:10px"><span>Hours available per week: <output>${(weekly / 60).toFixed(1)}</output></span><input type="range" min="60" max="1800" step="30" value="${weekly}" data-cap style="width:100%"></label>
        <p class="small muted">Over the last four weeks you logged ${fmtMinutes(avg)} a week on average. This setting stays on this device.</p>
        <hr class="hr"><p class="small"><strong>Backlog:</strong> ${fmtMinutes(plan.totalMinutes)} of study${plan.weeksNeeded ? `, about ${plan.weeksNeeded} week${plan.weeksNeeded > 1 ? "s" : ""} at this pace` : ""}.</p>
        <p class="small muted">${esc(FORMULAS.remaining)}</p>
      </section>
    </div>
    <section class="section" style="margin-top:22px"><div class="section-head"><div><h2>Seven-day recovery plan</h2><p>About ${fmtMinutes(plan.perDay)} a day, most urgent first. Add it to your calendar to get reminders.</p></div><button class="btn primary" data-addplan ${plan.days.some((d) => d.items.length) ? "" : "disabled"}>Add plan to my calendar</button></div>
      <div class="grid three">${plan.days.map((d) => `<div class="sheet"><h3 style="font-family:var(--sans);font-size:.95rem">${fmtDate(d.date)}${d.date === S.today ? " · today" : ""}</h3>
        ${d.items.length ? `<ul class="plist">${d.items.map((it) => { const s = it.rec.session; const t = it.rec.task; const cid = s ? s.course_id : t.course_id; return `<li style="${cvar(cid)}"><span class="bar"></span><div><button class="t" ${s ? `data-open-session="${s.id}"` : `data-open-task="${esc(t.id || "a:" + t.assessment_id)}"`}>${esc(s ? sessionName(s) : t.title)}</button><div class="d">${esc(it.rec.reasons[0])}${it.part ? " (part)" : ""}</div></div><span class="small num">${fmtMinutes(it.minutes)}</span></li>`; }).join("")}</ul>` : `<p class="muted small">Free</p>`}</div>`).join("")}</div>
      ${plan.leftover.length ? `<p class="small muted" style="margin-top:10px">Doesn't fit this week: ${plan.leftover.slice(0, 6).map((l) => esc(l.rec.session ? sessionLabel(l.rec.session) + " (" + (S.courses.find((c) => c.id === l.rec.session.course_id)?.short_name || "") + ")" : l.rec.task.title)).join(", ")}${plan.leftover.length > 6 ? ` and ${plan.leftover.length - 6} more` : ""}. Raise your weekly hours or carry them into next week.</p>` : ""}
    </section>`;
  $("[data-cap]", view).addEventListener("input", (e) => { $("output", view).textContent = (e.target.value / 60).toFixed(1); });
  $("[data-cap]", view).addEventListener("change", (e) => { setCap(Number(e.target.value)); renderPlan(view); });
  $("[data-addplan]", view)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    let n = 0;
    try {
      for (const d of plan.days) {
        let start = 19 * 60; // default evening slot, 7 pm Cairo
        for (const it of d.items) {
          const s = it.rec.session;
          const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          await saveEvent({ title: s ? `Study: ${sessionLabel(s)} — ${s.title}` : `Work on: ${it.rec.task.title}`, kind: it.rec.type === "recording" ? "recording_target" : it.rec.type === "revise" ? "revision" : "study",
            course_id: s ? s.course_id : it.rec.task.course_id, session_id: s?.id || null, starts_at: cairoToISO(d.date, hh(start)), ends_at: cairoToISO(d.date, hh(Math.min(start + it.minutes, 23 * 60 + 59))), reminder_minutes: 30 });
          start = Math.min(start + it.minutes + 10, 23 * 60);
          n++;
        }
      }
      toast(`${n} study sessions added to your calendar`);
      location.hash = "#/calendar";
    } catch (er) { errToast(er); e.target.disabled = false; }
  });
  void coursePill; void $$;
}

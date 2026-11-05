// Progress calculations. Pure functions: they take the data and return numbers, so the
// formulas shown to students are exactly the ones used here (see FORMULAS) and can be tested.
import { daysBetween, addDays, isISO } from "./lib.js?v=202611051410";

export const ATT = {
  physical: "Attended physically",
  online: "Attended online",
  recording: "Watched recording",
  partial: "Partially attended",
  absent: "Absent",
  not_yet: "Not yet attended",
};
export const DELIVERY = {
  physical: "Physical", online: "Online", recorded: "Recorded", online_or_recorded: "Online or recorded", tbc: "To be confirmed",
};
export const CHECKLIST = [
  ["attended_or_watched", "Attended or watched"],
  ["reviewed_slides", "Reviewed lecture slides"],
  ["read_materials", "Read assigned materials"],
  ["prepared_notes", "Prepared study notes"],
  ["understood_concepts", "Understood key concepts"],
  ["completed_exercises", "Completed exercises"],
  ["completed_revision", "Completed revision"],
  ["exam_ready", "Ready for examination"],
];
// A lecture counts as fully studied when the first five items are done.
export const CORE = CHECKLIST.slice(0, 5).map(([k]) => k);
export const TASK_STATUS = { not_started: "Not started", in_progress: "In progress", completed: "Completed", submitted: "Submitted", overdue: "Overdue" };
export const DONE_TASK = new Set(["completed", "submitted"]);
export const DEFAULTS = { studyMinutes: 120, recordingMinutes: 180 };
export const WEIGHTS = { study: 50, revision: 20, assessments: 20, attendance: 10 };

export const FORMULAS = {
  attendance: "Attendance rate = (lectures attended physically, online or by recording + ½ × partially attended) ÷ applicable lectures × 100. Applicable = sessions whose date has passed, plus undated recorded sessions you have marked.",
  study: "Study completion rate = fully studied lectures ÷ all lectures in the course × 100. Fully studied = the first five checklist items are ticked: attended or watched, reviewed slides, read materials, prepared notes, understood key concepts.",
  assessments: "Assignment completion rate = official assignments, papers and presentations marked Completed or Submitted ÷ all of them × 100. Exams are excluded.",
  revision: "Revision completion rate = lectures with 'Completed revision' ticked ÷ all lectures × 100.",
  overall: `Overall course progress = weighted average of study depth (${WEIGHTS.study}%), revision (${WEIGHTS.revision}%), assignments (${WEIGHTS.assessments}%) and attendance (${WEIGHTS.attendance}%). Study depth = average share of the five core checklist items done across all lectures, so partial work counts. A component with nothing to measure yet is left out and the rest are re-weighted. This is a study indicator, not a university grade.`,
  remaining: `Remaining study time is an estimate: your own estimate for a lecture if you set one, otherwise ${DEFAULTS.studyMinutes / 60} hours of study per lecture plus ${DEFAULTS.recordingMinutes / 60} hours for an unwatched recording, minus time you have logged.`,
};

const r0 = (x) => Math.round(x);
export const isStudyTracked = (s) => !s.cancelled && (s.kind === "lecture" || s.kind === "review");
export const attValue = (st) => (st === "physical" || st === "online" || st === "recording" ? 1 : st === "partial" ? 0.5 : 0);
export const coreDone = (p) => (p ? CORE.filter((k) => p[k]).length : 0);
export const isFullyStudied = (p) => coreDone(p) === CORE.length;
export const isHeld = (s, today) => isISO(s.scheduled_date) && s.scheduled_date <= today;
export function isApplicable(s, att, today) {
  if (s.cancelled) return false;
  if (isHeld(s, today)) return true;
  return !s.scheduled_date && !!att && att.status !== "not_yet";
}
export const isRecordedDelivery = (s) => s.delivery === "recorded";
export const watched = (att) => !!att && (att.status === "recording" || att.recording_watched);

// Per-session state used by the ledger, tables and priorities.
export function sessionState(s, data, today) {
  const att = data.attendance.get(s.id);
  const p = data.progress.get(s.id);
  const status = att?.status || "not_yet";
  const core = coreDone(p);
  const held = isHeld(s, today);
  return {
    status, core, held,
    applicable: isApplicable(s, att, today),
    attended: attValue(status),
    fully: core === CORE.length,
    started: core > 0 || (p && CHECKLIST.some(([k]) => p[k])),
    missed: held && (status === "absent" || (status === "not_yet" && !isRecordedDelivery(s))),
    recordingPending: isRecordedDelivery(s) && (held || !s.scheduled_date) && !watched(att) && status !== "physical" && status !== "online",
    revision: !!p?.completed_revision,
    examReady: !!p?.exam_ready,
    future: isISO(s.scheduled_date) && s.scheduled_date > today,
    progress: p, att,
  };
}

export function remainingMinutes(s, st) {
  if (!isStudyTracked(s) || st.fully) return 0;
  const p = st.progress;
  const logged = p?.actual_minutes || 0;
  if (p?.est_minutes != null) return Math.max(0, p.est_minutes - logged);
  const share = 1 - st.core / CORE.length;
  let m = DEFAULTS.studyMinutes * share;
  if (st.recordingPending) m += DEFAULTS.recordingMinutes;
  return Math.max(0, r0(m - logged));
}

export function courseStats(courseId, data, today) {
  const sessions = data.sessions.filter((s) => s.course_id === courseId && !s.cancelled);
  const lectures = sessions.filter(isStudyTracked);
  let applicable = 0, attended = 0, missed = 0, recWatched = 0, recPending = 0, studied = 0, inProgress = 0, notStudied = 0,
    revision = 0, examReady = 0, depthSum = 0, remaining = 0, absent = 0, notMarked = 0;
  for (const s of sessions) {
    const st = sessionState(s, data, today);
    if (st.applicable) { applicable++; attended += st.attended; }
    if (st.missed) { missed++; if (st.status === "absent") absent++; else notMarked++; }
    if (watched(st.att)) recWatched++;
    if (st.recordingPending) recPending++;
    if (isStudyTracked(s)) {
      depthSum += st.core / CORE.length;
      if (st.fully) studied++;
      else if (st.started) inProgress++;
      else notStudied++;
      if (st.revision) revision++;
      if (st.examReady) examReady++;
      remaining += remainingMinutes(s, st);
    }
  }
  const assess = data.assessments.filter((a) => a.course_id === courseId && a.type !== "exam");
  const tasksFor = (a) => data.tasks.find((t) => t.assessment_id === a.id);
  const assessDone = assess.filter((a) => DONE_TASK.has(tasksFor(a)?.status)).length;
  const n = lectures.length;
  const rates = {
    attendance: applicable ? r0((100 * attended) / applicable) : null,
    study: n ? r0((100 * studied) / n) : null,
    depth: n ? r0((100 * depthSum) / n) : null,
    revision: n ? r0((100 * revision) / n) : null,
    assessments: assess.length ? r0((100 * assessDone) / assess.length) : null,
  };
  const parts = [[rates.depth, WEIGHTS.study], [rates.revision, WEIGHTS.revision], [rates.assessments, WEIGHTS.assessments], [rates.attendance, WEIGHTS.attendance]]
    .filter(([v]) => v != null);
  const wsum = parts.reduce((a, [, w]) => a + w, 0);
  rates.overall = wsum ? r0(parts.reduce((a, [v, w]) => a + v * w, 0) / wsum) : null;
  return {
    total: n, sessions: sessions.length, applicable, attended, missed, absent, notMarked, recWatched, recPending, studied, inProgress, notStudied,
    revision, examReady, assessTotal: assess.length, assessDone, assessPending: assess.length - assessDone, remaining, rates,
  };
}

export function programmeStats(data, today) {
  const per = Object.fromEntries(data.courses.map((c) => [c.id, courseStats(c.id, data, today)]));
  const sum = (k) => Object.values(per).reduce((a, s) => a + s[k], 0);
  const lectures = sum("total");
  const overallVals = Object.values(per).map((s) => s.rates.overall).filter((v) => v != null);
  return {
    per,
    courses: data.courses.length,
    lectures,
    sessions: sum("sessions"),
    held: data.sessions.filter((s) => !s.cancelled && isHeld(s, today)).length,
    attended: sum("attended"),
    recWatched: sum("recWatched"),
    missed: sum("missed"),
    studied: sum("studied"),
    inProgress: sum("inProgress"),
    notStudied: sum("notStudied"),
    remaining: sum("remaining"),
    overall: overallVals.length ? r0(overallVals.reduce((a, b) => a + b, 0) / overallVals.length) : null,
  };
}

export function taskStatus(t, today) {
  if (DONE_TASK.has(t.status)) return t.status;
  if (isISO(t.due_date) && t.due_date < today) return "overdue";
  return t.status;
}

// "My academic priorities": things that need attention now, each with a reason.
export function priorities(data, today, tasks) {
  const out = [];
  for (const s of data.sessions) {
    if (s.cancelled) continue;
    const st = sessionState(s, data, today);
    const age = s.scheduled_date ? daysBetween(s.scheduled_date, today) : null;
    if (st.missed && st.status === "absent") out.push({ type: "missed", session: s, score: 60 + Math.min(age, 30), reason: "Missed — catch up from the recording or a classmate's notes" });
    else if (st.missed) out.push({ type: "unmarked", session: s, score: 40 + Math.min(age, 30), reason: "Date has passed and attendance isn't recorded" });
    if (st.recordingPending) out.push({ type: "recording", session: s, score: 55 + (age ? Math.min(age, 30) : 5), reason: "Recording not watched yet" });
    if (isStudyTracked(s) && st.held && !st.fully) {
      if (st.attended > 0) out.push({ type: "attended_not_studied", session: s, score: 50 + Math.min(age, 30), reason: `Attended but not fully studied (${st.core} of 5 core steps)` });
      else if (!st.recordingPending && !st.missed) out.push({ type: "overdue", session: s, score: 45 + Math.min(age, 30), reason: "Past lecture not yet studied" });
    }
    if (isStudyTracked(s) && st.started && !st.fully && !st.held) out.push({ type: "incomplete", session: s, score: 20, reason: `Topic in progress (${st.core} of 5 core steps)` });
  }
  for (const t of tasks) {
    const status = taskStatus(t, today);
    if (DONE_TASK.has(status) || !isISO(t.due_date)) continue;
    const d = daysBetween(today, t.due_date);
    if (d < 0) out.push({ type: "task_overdue", task: t, score: 95, reason: `Overdue by ${-d} day${d === -1 ? "" : "s"}` });
    else if (d <= 14) out.push({ type: "task_due", task: t, score: 90 - d * 4, reason: d === 0 ? "Due today" : `Due in ${d} day${d === 1 ? "" : "s"}` });
  }
  return out.sort((a, b) => b.score - a.score);
}

// "What should I study next?" — one entry per session/task, highest urgency first.
export function recommendations(data, today, tasks, limit = 12) {
  const bySession = new Map();
  for (const p of priorities(data, today, tasks)) {
    const key = p.session ? p.session.id : "t:" + (p.task.id || p.task.assessment_id);
    const cur = bySession.get(key);
    if (!cur) bySession.set(key, { ...p, reasons: [p.reason] });
    else { cur.score = Math.max(cur.score, p.score) + 5; cur.reasons.push(p.reason); }
  }
  // Prepare for lectures in the next 3 days.
  for (const s of data.sessions) {
    if (s.cancelled || !isISO(s.scheduled_date)) continue;
    const d = daysBetween(today, s.scheduled_date);
    if (d >= 0 && d <= 3 && !bySession.has(s.id)) {
      const st = sessionState(s, data, today);
      if (!st.progress?.read_materials && (s.readings || s.topics?.length)) {
        bySession.set(s.id, { type: "prepare", session: s, score: 35 - d * 3, reasons: [d === 0 ? "Lecture today — skim the readings first" : `Lecture ${d === 1 ? "tomorrow" : "in " + d + " days"} — prepare the readings`] });
      }
    }
  }
  // Revision for lectures studied more than two weeks ago.
  for (const s of data.sessions) {
    if (!isStudyTracked(s) || bySession.has(s.id)) continue;
    const st = sessionState(s, data, today);
    if (st.fully && !st.revision && s.scheduled_date && daysBetween(s.scheduled_date, today) >= 14) {
      bySession.set(s.id, { type: "revise", session: s, score: 15, reasons: ["Studied over two weeks ago — schedule a revision"] });
    }
  }
  return [...bySession.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function itemMinutes(rec, data, today) {
  if (rec.task) return 120;
  const s = rec.session;
  const st = sessionState(s, data, today);
  if (rec.type === "prepare") return 45;
  if (rec.type === "revise") return 60;
  const m = remainingMinutes(s, st);
  return m || (st.recordingPending ? DEFAULTS.recordingMinutes : 60);
}

// Spread the backlog over the next 7 days within the weekly study budget.
export function recoveryPlan(data, today, tasks, { weeklyMinutes = 390, studyDays = [0, 1, 2, 3, 4, 5, 6] } = {}) {
  const recs = recommendations(data, today, tasks, 60);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = addDays(today, i); const wd = new Date(d + "T12:00:00Z").getUTCDay(); if (studyDays.includes(wd)) days.push({ date: d, cap: 0, items: [], used: 0 }); }
  const perDay = days.length ? Math.floor(weeklyMinutes / days.length) : 0;
  days.forEach((d) => (d.cap = perDay));
  const queue = recs.map((r) => ({ rec: r, left: itemMinutes(r, data, today) }));
  const total = queue.reduce((a, q) => a + q.left, 0);
  let di = 0;
  for (const q of queue) {
    while (q.left > 0 && di < days.length) {
      const day = days[di];
      const free = day.cap - day.used;
      if (free < 20) { di++; continue; }
      const take = Math.min(free, q.left);
      day.items.push({ rec: q.rec, minutes: take, part: q.left > take || day.items.some((x) => x.rec === q.rec) });
      day.used += take; q.left -= take;
      if (day.cap - day.used < 20) di++;
    }
  }
  const leftover = queue.filter((q) => q.left > 0).map((q) => ({ rec: q.rec, minutes: q.left }));
  const weeksNeeded = weeklyMinutes ? Math.max(1, Math.ceil(total / weeklyMinutes)) : null;
  return { days, leftover, totalMinutes: total, weeksNeeded, perDay };
}

// Weekly study minutes for the last n weeks (weeks start Saturday).
export function weeklyActivity(logs, today, n = 8, firstDow = 6) {
  const start = addDays(today, -((new Date(today + "T12:00:00Z").getUTCDay() - firstDow + 7) % 7));
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) weeks.push({ start: addDays(start, -7 * i), minutes: 0 });
  for (const l of logs) for (const w of weeks) if (l.log_date >= w.start && l.log_date < addDays(w.start, 7)) w.minutes += l.minutes;
  return weeks;
}

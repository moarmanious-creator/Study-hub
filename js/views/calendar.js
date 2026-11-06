// Academic calendar: official sessions and deadlines (read-only for students) plus
// personal study events. Month, week, day and agenda views; filters; reminders; .ics export.
import { esc, fmtDate, fmtLong, fmtMonth, fmtTime, addDays, startOfWeek, startOfMonth, isISO, openModal, readForm, toast, errToast, cairoToISO, isoToCairo, download, confirmDialog, $, $$ } from "../lib.js?v=202611061458";
import { S, course, allTasks, saveEvent, deleteEvent, saveTask, isStaff } from "../store.js?v=202611061458";
import { taskStatus, DELIVERY } from "../metrics.js?v=202611061458";
import { cvar, sessionLabel, sessionName, courseName } from "../ui.js?v=202611061458";
import { openSession } from "./course.js?v=202611061458";

const UI = { view: "month", cursor: null, course: "all", types: new Set(["lecture", "deadline", "exam", "study", "done"]) };
const TYPES = [["lecture", "Lectures"], ["deadline", "Deadlines"], ["exam", "Exams"], ["study", "Study sessions"], ["done", "Completed"]];

export function calendarItems() {
  const items = [];
  for (const s of S.sessions) {
    if (s.cancelled || !isISO(s.scheduled_date)) continue;
    items.push({ id: "s:" + s.id, date: s.scheduled_date, time: s.start_time?.slice(0, 5) || null, end: s.end_time?.slice(0, 5) || null, type: "lecture", course_id: s.course_id,
      title: sessionName(s), sub: `${courseName(s.course_id)} · ${DELIVERY[s.delivery]}${s.location ? " · " + s.location : ""}`, session: s, official: true });
  }
  for (const t of allTasks()) {
    if (!isISO(t.due_date)) continue;
    const isExam = t.official?.type === "exam";
    const st = taskStatus(t, S.today);
    items.push({ id: "t:" + (t.id || t.assessment_id), date: t.due_date, time: null, type: isExam ? "exam" : "deadline", course_id: t.course_id,
      title: `${isExam ? "Exam" : "Due"}: ${t.title}`, task: t, done: ["completed", "submitted"].includes(st), official: !!t.official });
  }
  for (const e of S.events) {
    const { date, time } = isoToCairo(e.starts_at);
    items.push({ id: "e:" + e.id, date, time, end: e.ends_at ? isoToCairo(e.ends_at).time : null, type: "study", course_id: e.course_id, title: e.title, event: e, done: e.completed });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99"));
}

function visible(items) {
  return items.filter((i) => (UI.course === "all" || i.course_id === UI.course) && UI.types.has(i.type) && (!i.done || UI.types.has("done")));
}

function evButton(i) {
  const cls = [i.type === "exam" ? "exam" : i.type === "deadline" ? "deadline" : i.type === "study" ? "study" : "", i.done ? "done" : ""].join(" ");
  return `<button class="ev ${cls}" style="${i.course_id ? cvar(i.course_id) : ""}" data-ev="${esc(i.id)}" title="${esc(i.title)}${i.sub ? " — " + esc(i.sub) : ""}${i.time ? " · " + fmtTime(i.time) : ""}">${i.time ? `<span class="num">${fmtTime(i.time)}</span> ` : ""}${esc(i.title)}</button>`;
}

export function renderCalendar(view) {
  UI.cursor = UI.cursor || S.today;
  const items = visible(calendarItems());
  const byDate = new Map();
  for (const i of items) { if (!byDate.has(i.date)) byDate.set(i.date, []); byDate.get(i.date).push(i); }
  const title = UI.view === "month" ? fmtMonth(UI.cursor) : UI.view === "week" ? `Week of ${fmtDate(startOfWeek(UI.cursor), { day: "numeric", month: "long" })}` : UI.view === "day" ? fmtLong(UI.cursor) : "Agenda";

  view.innerHTML = `
    <div class="cal-toolbar">
      <div class="row"><button class="btn sm" data-nav="-1" aria-label="Previous">‹</button><button class="btn sm" data-nav="0">Today</button><button class="btn sm" data-nav="1" aria-label="Next">›</button></div>
      <h2>${esc(title)}</h2>
      <div class="seg" role="group" aria-label="Calendar view">${["month", "week", "day", "agenda"].map((v) => `<button data-view="${v}" aria-pressed="${UI.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div>
      <span style="flex:1"></span>
      <button class="btn primary" data-add>Add study session</button>
    </div>
    <div class="row" style="margin-bottom:14px">
      <label class="field" style="min-width:200px"><span class="sr">Course</span><select class="input" data-course><option value="all">All courses</option>${S.courses.map((c) => `<option value="${c.id}" ${UI.course === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select></label>
      <div class="row" role="group" aria-label="Event types">${TYPES.map(([k, l]) => `<button class="chip" data-type="${k}" aria-pressed="${UI.types.has(k)}">${l}</button>`).join("")}</div>
      <span style="flex:1"></span>
      <button class="btn sm" data-ics>Export to phone calendar</button>
      <button class="btn sm" data-notify>${typeof Notification !== "undefined" && Notification.permission === "granted" ? "Reminders on" : "Turn on reminders"}</button>
    </div>
    <div id="calBody"></div>
    <p class="muted small" style="margin-top:12px">Lecture dates and deadlines come from the official documents and can only be changed by the programme admin. ${isStaff() ? "You can edit them under Academic data." : ""}</p>`;

  const body = $("#calBody", view);
  if (UI.view === "month") body.innerHTML = month(byDate);
  else if (UI.view === "week") body.innerHTML = week(byDate);
  else if (UI.view === "day") body.innerHTML = day(byDate);
  else body.innerHTML = agenda(items);

  $$("[data-nav]", view).forEach((b) => b.addEventListener("click", () => {
    const n = Number(b.dataset.nav);
    if (n === 0) UI.cursor = S.today;
    else if (UI.view === "month") { const d = new Date(UI.cursor + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n, 1); UI.cursor = d.toISOString().slice(0, 10); }
    else UI.cursor = addDays(UI.cursor, n * (UI.view === "week" ? 7 : UI.view === "day" ? 1 : 30));
    renderCalendar(view);
  }));
  $$("[data-view]", view).forEach((b) => b.addEventListener("click", () => { UI.view = b.dataset.view; renderCalendar(view); }));
  $("[data-course]", view).addEventListener("change", (e) => { UI.course = e.target.value; renderCalendar(view); });
  $$("[data-type]", view).forEach((b) => b.addEventListener("click", () => { const k = b.dataset.type; UI.types.has(k) ? UI.types.delete(k) : UI.types.add(k); renderCalendar(view); }));
  $("[data-add]", view).addEventListener("click", () => editEvent({ date: UI.view === "day" ? UI.cursor : S.today }, () => renderCalendar(view)));
  $("[data-ics]", view).addEventListener("click", exportICS);
  $("[data-notify]", view).addEventListener("click", async () => {
    if (typeof Notification === "undefined") return toast("This browser doesn't support notifications. Use the phone-calendar export instead.", "err");
    const p = await Notification.requestPermission();
    toast(p === "granted" ? "Reminders on while the Hub is open. For reminders when it's closed, use the phone-calendar export." : "Reminders were not allowed");
    renderCalendar(view);
  });
  $$("[data-day]", view).forEach((b) => b.addEventListener("click", () => { UI.cursor = b.dataset.day; UI.view = "day"; renderCalendar(view); }));
  const all = calendarItems();
  $$("[data-ev]", view).forEach((b) => b.addEventListener("click", () => openItem(all.find((i) => i.id === b.dataset.ev), () => renderCalendar(view))));
}

const DOW = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
function month(byDate) {
  const first = startOfMonth(UI.cursor);
  const start = startOfWeek(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.slice(0, 7) !== first.slice(0, 7)) break;
    const list = byDate.get(d) || [];
    cells.push(`<div class="day ${d.slice(0, 7) !== first.slice(0, 7) ? "other" : ""} ${d === S.today ? "today" : ""}">
      <button class="dn" data-day="${d}" aria-label="${fmtLong(d)}, ${list.length} items">${Number(d.slice(8))}</button>
      ${list.slice(0, 4).map(evButton).join("")}${list.length > 4 ? `<button class="ev more" data-day="${d}">+${list.length - 4} more</button>` : ""}</div>`);
  }
  return `<div class="month">${DOW.map((d) => `<div class="dow">${d}</div>`).join("")}${cells.join("")}</div>`;
}
function week(byDate) {
  const start = startOfWeek(UI.cursor);
  return `<div class="week">${Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => `<div class="wd ${d === S.today ? "today" : ""}"><h3><button class="dn btn ghost sm" data-day="${d}">${fmtDate(d)}</button></h3>${(byDate.get(d) || []).map(evButton).join("") || `<span class="muted small">Free</span>`}</div>`).join("")}</div>`;
}
function day(byDate) {
  const list = byDate.get(UI.cursor) || [];
  return `<div class="sheet">${list.length ? list.map((i) => `<div class="agenda-day" style="grid-template-columns:90px 1fr"><div class="ad num">${i.time ? fmtTime(i.time) + (i.end ? `<small>to ${fmtTime(i.end)}</small>` : "") : "All day"}</div><div>${evButton(i)}${i.sub ? `<div class="small muted">${esc(i.sub)}</div>` : ""}</div></div>`).join("") : `<div class="empty"><strong>Nothing scheduled.</strong>Add a study session to use the time.</div>`}</div>`;
}
function agenda(items) {
  const from = addDays(S.today, -7);
  const list = items.filter((i) => i.date >= from);
  const groups = new Map();
  for (const i of list) { if (!groups.has(i.date)) groups.set(i.date, []); groups.get(i.date).push(i); }
  return `<div class="sheet">${[...groups].map(([d, l]) => `<div class="agenda-day"><div class="ad">${fmtDate(d)}<small>${d === S.today ? "Today" : d < S.today ? "Past" : ""}</small></div><div>${l.map(evButton).join("")}</div></div>`).join("") || `<div class="empty">Nothing from last week onwards.</div>`}</div>`;
}

function openItem(i, rerender) {
  if (!i) return;
  if (i.session) return openSession(i.session.id, { onChange: rerender });
  if (i.task) return window.dispatchEvent(new CustomEvent("hub:task", { detail: i.task }));
  if (i.event) return editEvent(i.event, rerender);
}

export function editEvent(ev = {}, after) {
  const isNew = !ev.id;
  const start = ev.starts_at ? isoToCairo(ev.starts_at) : { date: ev.date || S.today, time: "19:00" };
  const end = ev.ends_at ? isoToCairo(ev.ends_at) : null;
  openModal(isNew ? "Add study session" : "Study session", (body, foot, close) => {
    const sessOpts = (cid) => S.sessions.filter((s) => s.course_id === cid && !s.cancelled).map((s) => `<option value="${s.id}" ${ev.session_id === s.id ? "selected" : ""}>${esc(sessionName(s))}</option>`).join("");
    body.innerHTML = `<form class="form-grid">
      <label class="field wide"><span>Title</span><input class="input" name="title" required value="${esc(ev.title || "")}" placeholder="e.g. Revise consumer behavior"></label>
      <label class="field"><span>Type</span><select class="input" name="kind">${[["study", "Study session"], ["revision", "Revision session"], ["recording_target", "Watch a recording"], ["personal", "Personal"]].map(([k, l]) => `<option value="${k}" ${ev.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field"><span>Course</span><select class="input" name="course_id"><option value="">None</option>${S.courses.map((c) => `<option value="${c.id}" ${ev.course_id === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select></label>
      <label class="field wide"><span>Lecture (optional)</span><select class="input" name="session_id"><option value="">None</option>${ev.course_id ? sessOpts(ev.course_id) : ""}</select></label>
      <label class="field"><span>Date</span><input class="input" type="date" name="date" required value="${start.date}"></label>
      <label class="field"><span>Start</span><input class="input" type="time" name="start" required value="${start.time}"></label>
      <label class="field"><span>End</span><input class="input" type="time" name="end" value="${end?.time || ""}"></label>
      <label class="field"><span>Reminder</span><select class="input" name="reminder">${[["", "None"], ["10", "10 minutes before"], ["30", "30 minutes before"], ["60", "1 hour before"], ["1440", "1 day before"]].map(([k, l]) => `<option value="${k}" ${String(ev.reminder_minutes ?? "") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field wide"><span>Notes</span><textarea class="input" name="notes" style="min-height:60px">${esc(ev.notes || "")}</textarea></label>
      ${isNew ? "" : `<label class="check wide"><input type="checkbox" name="completed" ${ev.completed ? "checked" : ""}> Completed</label>`}
    </form>`;
    const form = $("form", body);
    form.course_id.addEventListener("change", () => { form.session_id.innerHTML = `<option value="">None</option>${form.course_id.value ? sessOpts(form.course_id.value) : ""}`; });
    foot.innerHTML = `${isNew ? "" : `<button class="btn danger" data-del style="margin-right:auto">Delete</button>`}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>${isNew ? "Add session" : "Save changes"}</button>`;
    foot.querySelector("[data-close]").onclick = close;
    foot.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this study session?"))) return;
      try { await deleteEvent(ev.id); toast("Deleted"); after && after(); } catch (e) { errToast(e); }
    });
    foot.querySelector("[data-save]").onclick = async () => {
      if (!form.reportValidity()) return;
      const f = readForm(form);
      if (f.end && f.end <= f.start) return toast("End time must be after the start time", "err");
      try {
        await saveEvent({ id: ev.id, title: f.title, kind: f.kind, course_id: f.course_id, session_id: f.session_id, starts_at: cairoToISO(f.date, f.start),
          ends_at: f.end ? cairoToISO(f.date, f.end) : null, reminder_minutes: f.reminder ? Number(f.reminder) : null, notes: f.notes, completed: !!f.completed });
        toast(isNew ? "Study session added" : "Saved"); close(); after && after();
        window.dispatchEvent(new CustomEvent("hub:changed"));
      } catch (e) { errToast(e); }
    };
  });
}

// ── Reminders while the Hub is open ──
const fired = new Set();
export function startReminders() {
  setInterval(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = Date.now();
    for (const e of S.events) {
      if (e.completed || e.reminder_minutes == null) continue;
      const at = new Date(e.starts_at).getTime() - e.reminder_minutes * 60000;
      if (now >= at && now < at + 120000 && !fired.has(e.id)) { fired.add(e.id); new Notification("Study reminder", { body: `${e.title} at ${isoToCairo(e.starts_at).time}`, icon: "icon.svg" }); }
    }
  }, 30000);
}

// ── Export: every official session, deadline and personal event, with reminders ──
function exportICS() {
  const esc2 = (s) => String(s || "").replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Student Hub//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Student Hub", "X-WR-TIMEZONE:Africa/Cairo"];
  const utcStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  for (const i of calendarItems()) {
    lines.push("BEGIN:VEVENT", `UID:${i.id.replace(/[^\w:-]/g, "")}@student-hub`, `DTSTAMP:${stamp}`, `SUMMARY:${esc2(i.title)}`);
    if (i.time) {
      lines.push(`DTSTART:${utcStamp(cairoToISO(i.date, i.time))}`);
      lines.push(`DTEND:${utcStamp(cairoToISO(i.date, i.end || addMinutes(i.time, 60)))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${i.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(i.date, 1).replace(/-/g, "")}`);
    }
    const loc = i.session?.location; if (loc) lines.push(`LOCATION:${esc2(loc)}`);
    if (i.sub) lines.push(`DESCRIPTION:${esc2(i.sub)}`);
    const before = i.event?.reminder_minutes ?? (i.type === "lecture" ? 60 : i.type === "deadline" || i.type === "exam" ? 1440 * 2 : null);
    if (before != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc2(i.title)}`, `TRIGGER:-PT${before}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  download("study-calendar.ics", lines.join("\r\n"), "text/calendar");
  toast("Calendar file downloaded. Open it to add the events to your phone or computer.");
}
function addMinutes(t, m) { const [h, mm] = t.split(":").map(Number); const x = h * 60 + mm + m; return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; }
void course; void saveTask;

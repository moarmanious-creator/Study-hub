// Lecture page: everything for one lecture on one simple page. Opening a slide marks
// "slides read", opening a reading marks "readings done", opening a recording marks it watched.
import { esc, fmtDate, relDays, fmtMinutes, fmtBytes, toast, errToast, debounce, safeUrl, isISO, confirmDialog, $, $$ } from "../lib.js?v=202611070657";
import { S, session as getSession, course as getCourse, courseSessions, saveProgress, saveAttendance, logStudy, isStaff, allAssignments, allProjects, lecturerName,
  uploadAttachment, addLink, deleteAttachment, uploadOfficialMaterial, addOfficialLink, deleteOfficialMaterial } from "../store.js?v=202611070657";
import { sessionState, CHECKLIST, CORE, ATT, isStudyTracked, taskStatus, DONE_TASK } from "../metrics.js?v=202611070657";
import { sessionLabel, sessionWhen, deliveryTag, cvar, infoRequired } from "../ui.js?v=202611070657";
import { openSession } from "./course.js?v=202611070657";
import { materialKind } from "./materials.js?v=202611070657";

// What each kind of material ticks when it's opened.
const KIND = {
  slides: { label: "Slides", mark: "reviewed_slides", done: "Read", icon: "▤" },
  reading: { label: "Reading", mark: "read_materials", done: "Read", icon: "📖" },
  recording: { label: "Recording", mark: "recording", done: "Watched", icon: "▶" },
  assignment: { label: "Assignment brief", mark: null, done: "Opened", icon: "✎" },
};

const openedKey = () => `mlea_opened_${S.user?.id || "anon"}`;
const opened = () => { try { return new Set(JSON.parse(localStorage.getItem(openedKey()) || "[]")); } catch { return new Set(); } };
const remember = (k) => { try { const o = opened(); o.add(k); localStorage.setItem(openedKey(), JSON.stringify([...o].slice(-2000))); } catch { /* private mode */ } };

// Called (via a delegated click handler) whenever a lecture material is opened anywhere in the Hub.
export async function markOpened(el) {
  const sid = el.dataset.sid, kind = el.dataset.mark, key = el.dataset.key;
  if (key) remember(key);
  const s = getSession(sid);
  if (!s || !KIND[kind]) return;
  try {
    const st = sessionState(s, S, S.today);
    if (kind === "recording") {
      if (!(st.att?.recording_watched)) { await saveAttendance(sid, { recording_watched: true, status: (st.att?.status || "not_yet") === "not_yet" ? "recording" : st.att.status }); toast("Recording marked as watched"); }
    } else if (KIND[kind].mark && !st.progress?.[KIND[kind].mark]) {
      await saveProgress(sid, { [KIND[kind].mark]: true });
      toast(kind === "slides" ? "Slides marked as read" : "Reading marked as done");
    }
    window.dispatchEvent(new CustomEvent("hub:changed"));
  } catch (e) { errToast(e); }
}

// Materials for a lecture: official files/links, the session's own links and its recording.
export function lectureMaterials(s) {
  const list = S.materials.filter((m) => m.session_id === s.id && !m.assessment_id).map((m) => ({
    key: `m:${m.id}`, title: m.title, kind: materialKind(m.title, m.kind), url: m.url, fileId: m.url ? null : m.id, required: m.required,
  }));
  (s.links || []).forEach((l, i) => list.push({ key: `l:${s.id}:${i}`, title: l.label || "Link", kind: materialKind(l.label), url: l.url }));
  if (s.recording_url) list.push({ key: `r:${s.id}`, title: "Lecture recording", kind: "recording", url: s.recording_url });
  const order = { slides: 0, recording: 1, reading: 2, assignment: 3 };
  return list.sort((a, b) => order[a.kind] - order[b.kind]);
}

export function materialLink(s, m, cls = "mat") {
  const attrs = `data-mark="${m.kind}" data-sid="${s.id}" data-key="${esc(m.key)}"`;
  return m.url
    ? `<a class="${cls}" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener" ${attrs}>`
    : `<a class="${cls}" href="#" data-official-file="${m.fileId}" ${attrs}>`;
}

const ATTACH = { who: "all" }; // admins: share new uploads with all students by default

const STEPS = [["attended_or_watched", "Attended or watched"], ["reviewed_slides", "Slides read"], ["read_materials", "Readings done"], ["prepared_notes", "Notes made"], ["understood_concepts", "Understood"]];

export function renderLecture(view, id) {
  const s = getSession(id);
  if (!s) { view.innerHTML = `<div class="empty"><strong>Lecture not found.</strong><a href="#/study">Back to Study</a></div>`; return; }
  const c = getCourse(s.course_id);
  const st = sessionState(s, S, S.today);
  const p = st.progress || {};
  const att = st.att || { status: "not_yet", recording_watched: false };
  const list = courseSessions(s.course_id).filter((x) => !x.cancelled);
  const i = list.findIndex((x) => x.id === s.id);
  const prev = list[i - 1], next = list[i + 1];
  const tracked = isStudyTracked(s);
  const done = CORE.filter((k) => p[k]).length;
  const mats = lectureMaterials(s);
  const mine = S.attachments.filter((a) => a.session_id === s.id);
  const shared = S.materials.filter((m) => m.session_id === s.id && !m.assessment_id);
  const seen = opened();
  // Deadlines for this course up to the next lecture (or the next two weeks if there's none).
  const nextLecture = list.find((x) => x.scheduled_date && x.scheduled_date > S.today);
  const limit = nextLecture?.scheduled_date || null;
  const due = [...allAssignments(), ...allProjects()].filter((t) => t.course_id === s.course_id && isISO(t.due_date) && !DONE_TASK.has(taskStatus(t, S.today)) && (!limit || t.due_date <= limit))
    .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4);

  view.innerHTML = `
  <div class="lecture-page" style="${cvar(s.course_id)}">
    <nav class="lp-crumbs small"><a href="#/course/${esc(s.course_id)}">${esc(c?.short_name || c?.name || "Course")}</a> · <a href="#/study">Study</a></nav>
    <header class="lp-head">
      <div>
        <p class="eyebrow">${esc(sessionLabel(s))} · ${esc(c?.short_name || "")}</p>
        <h2>${esc(s.title)}</h2>
        <div class="lp-meta">${esc(sessionWhen(s))} · ${deliveryTag(s.delivery)}${lecturerName(s.lecturer_id) ? ` · ${esc(lecturerName(s.lecturer_id))}` : ""}${s.location ? ` · ${esc(s.location)}` : ""}</div>
      </div>
      ${tracked ? `<div class="lp-status ${done === 5 ? "ok" : done ? "mid" : ""}"><b>${done === 5 ? "Studied" : done ? `${done} of 5` : "Not started"}</b><span>${done === 5 ? "Well done" : "study steps"}</span></div>` : ""}
    </header>
    ${s.info_required?.length ? infoRequired(s.info_required) : ""}

    ${tracked ? `<section class="lp-steps" aria-label="Study steps">
      ${STEPS.map(([k, l], n) => `<label class="step ${p[k] ? "on" : ""}"><input type="checkbox" data-chk="${k}" ${p[k] ? "checked" : ""}><span class="n">${p[k] ? "✓" : n + 1}</span><span>${l}</span></label>`).join("")}
      ${done < 5 ? `<button class="btn primary" data-allstudied>Mark as studied</button>` : ""}
    </section>
    <p class="small muted lp-hint">Opening the slides ticks "Slides read" for you; opening a reading ticks "Readings done"; opening the recording counts as watched.</p>` : ""}

    <div class="lp-grid">
      <div class="lp-main">
        <section class="sheet">
          <h3>Slides &amp; materials</h3>
          ${mats.length ? `<div class="mats">${mats.map((m) => {
            const k = KIND[m.kind];
            const isDone = m.kind === "slides" ? p.reviewed_slides && seen.has(m.key) : m.kind === "reading" ? p.read_materials && seen.has(m.key) : m.kind === "recording" ? att.recording_watched || att.status === "recording" : seen.has(m.key);
            return `${materialLink(s, m)}<span class="mi" aria-hidden="true">${k.icon}</span><span class="mt"><b>${esc(m.title)}</b><small>${k.label}${m.required ? " · required" : ""}</small></span><span class="pill ${isDone ? "ok" : ""}">${isDone ? k.done : "Open"}</span></a>`;
          }).join("")}</div>` : `<p class="muted small" style="margin:0">No slides or materials shared for this lecture yet.${isStaff() ? " Add them below with “Attach files & links”." : ""}</p>`}
          ${s.topics?.length ? `<h3 style="margin-top:16px">Topics</h3><ul class="lp-topics">${s.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
          ${s.readings ? `<p class="small" style="margin:8px 0 0"><strong>Readings:</strong> ${esc(s.readings)}</p>` : ""}
        </section>

        <section class="sheet lp-attach" data-drop>
          <h3>Attach files &amp; links</h3>
          <p class="small muted" style="margin:4px 0 10px">Word, PDF, PowerPoint, Excel, images or any link (Google Drive, YouTube, articles). Drag files here or use the buttons.</p>
          ${isStaff() ? `<div class="seg" role="group" aria-label="Who can see it" style="margin-bottom:10px"><button type="button" data-who="all" aria-pressed="${ATTACH.who === "all"}">Share with all students</button><button type="button" data-who="me" aria-pressed="${ATTACH.who === "me"}">Only me</button></div>` : ""}
          <div class="row">
            <label class="btn primary">⬆ Upload files<input type="file" multiple hidden data-attach-file accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.heic,.txt,.md"></label>
            <button class="btn" type="button" data-attach-link>🔗 Add a link</button>
          </div>
          <form class="form-grid" data-linkform hidden style="margin-top:10px">
            <label class="field wide"><span>Link</span><input class="input" type="url" name="url" required placeholder="https://"></label>
            <label class="field wide"><span>Name</span><input class="input" name="name" maxlength="160" placeholder="e.g. Lecture slides, Week 3 reading"></label>
            <div class="row wide"><button class="btn primary sm" type="submit">Save link</button><button class="btn sm" type="button" data-linkcancel>Cancel</button></div>
          </form>
          <div class="small muted" data-attach-status style="margin-top:8px"></div>
          ${mine.length ? `<h3 style="margin-top:14px;font-size:1rem">My files for this lecture <span class="muted small">(only you can see these)</span></h3>
          <ul class="plist">${mine.map((a) => `<li><span class="bar"></span><div><button class="t" data-my-file="${a.id}">${esc(a.name)}</button><div class="d">${a.kind === "link" ? "Link" : fmtBytes(a.size_bytes)}</div></div><button class="btn ghost sm danger" data-del-mine="${a.id}" aria-label="Delete ${esc(a.name)}">Delete</button></li>`).join("")}</ul>` : ""}
          ${isStaff() && shared.length ? `<details style="margin-top:12px"><summary class="small">Remove a shared file or link (${shared.length})</summary>
          <ul class="plist">${shared.map((m) => `<li><span class="bar"></span><div><div class="t">${esc(m.title)}</div><div class="d">${m.url ? "Link" : fmtBytes(m.size_bytes)} · all students</div></div><button class="btn ghost sm danger" data-del-shared="${m.id}">Remove</button></li>`).join("")}</ul></details>` : ""}
        </section>

        ${tracked ? `<section class="sheet lp-note">
          <div><h3>Study notes</h3><p class="small muted" style="margin:2px 0 0">Full notes you can study from instead of the slides, and a one-page revision sheet.</p></div>
          <div class="row"><button class="btn gold" data-study-note="${s.id}" data-part="full">Full notes</button><button class="btn" data-study-note="${s.id}" data-part="sheet">One-page sheet</button></div>
        </section>` : ""}

        <section class="sheet">
          <h3>My notes</h3>
          <textarea class="input" data-f="study_notes" placeholder="Key points, definitions, questions to ask" style="min-height:140px;margin-top:8px">${esc(p.study_notes || "")}</textarea>
          <div class="row" style="margin-top:8px"><span class="small muted" data-saved>${p.study_notes ? "Saved" : ""}</span><span style="flex:1"></span>
            <span class="small">Time logged: <strong>${fmtMinutes(p.actual_minutes || 0)}</strong></span>
            <input class="input" type="number" min="5" max="600" step="5" value="30" aria-label="Minutes to log" style="width:84px" data-logmin><button class="btn sm" data-log>Log time</button></div>
        </section>
      </div>

      <aside class="lp-side">
        <section class="sheet">
          <h3>Attendance</h3>
          <div class="att-pick" role="group" aria-label="Attendance">${["physical", "online", "recording", "absent"].map((k) => `<button type="button" data-att="${k}" aria-pressed="${att.status === k}">${esc(ATT[k])}</button>`).join("")}</div>
          <p class="small muted" style="margin:8px 0 0">Attending doesn't count as studying; tick the study steps too.</p>
        </section>

        <section class="sheet">
          <h3>AI study assistant</h3>
          <div class="ai-quick">
            <button class="btn sm" data-ai="explain">Explain this lecture</button>
            <button class="btn sm" data-ai="summarize">Summarise the slides</button>
            <button class="btn sm" data-ai="mcq">Quiz me</button>
            <button class="btn sm" data-ai="exam">Exam questions</button>
          </div>
        </section>

        <section class="sheet">
          <h3>Due ${limit ? `before the next lecture` : "soon"}</h3>
          ${due.length ? `<ul class="pending">${due.map((t) => `<li style="${cvar(t.course_id)}"><span class="bar"></span><div><div class="t">${esc(t.title)}</div><div class="d">${esc(fmtDate(t.due_date))} · ${esc(relDays(t.due_date, S.today))}</div></div><div class="acts"><button class="btn sm" data-open-task="${esc(t.id || "a:" + t.assessment_id)}">Open</button></div></li>`).join("")}</ul>`
            : `<p class="small muted" style="margin:0">Nothing due for this course${limit ? ` before ${esc(fmtDate(limit))}` : ""}.</p>`}
        </section>

        ${tracked ? `<details class="sheet lp-more"><summary>After studying</summary>
          ${CHECKLIST.slice(5).map(([k, l]) => `<label class="check"><input type="checkbox" data-chk="${k}" ${p[k] ? "checked" : ""}> ${esc(l)}</label>`).join("")}
        </details>` : ""}
        <button class="btn ghost sm" data-manage>More details (time, revision date)</button>
      </aside>
    </div>

    <nav class="lp-pager">
      ${prev ? `<a class="btn" href="#/lecture/${prev.id}">← ${esc(sessionLabel(prev))}</a>` : "<span></span>"}
      ${next ? `<a class="btn" href="#/lecture/${next.id}">${esc(sessionLabel(next))} →</a>` : "<span></span>"}
    </nav>
  </div>`;

  const again = () => renderLecture(view, id);
  $$("[data-chk]", view).forEach((b) => b.addEventListener("change", async () => {
    try { await saveProgress(s.id, { [b.dataset.chk]: b.checked }); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (e) { errToast(e); b.checked = !b.checked; }
  }));
  $("[data-allstudied]", view)?.addEventListener("click", async () => {
    try { await saveProgress(s.id, Object.fromEntries(CORE.map((k) => [k, true]))); toast("Marked as studied"); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (e) { errToast(e); }
  });
  $$("[data-att]", view).forEach((b) => b.addEventListener("click", async () => {
    try { await saveAttendance(s.id, { status: b.dataset.att, recording_watched: b.dataset.att === "recording" ? true : att.recording_watched }); toast("Attendance saved"); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (e) { errToast(e); }
  }));
  const saveNotes = debounce(async (v) => {
    try { await saveProgress(s.id, { study_notes: v || null }); const m = $("[data-saved]", view); if (m) m.textContent = "Saved"; } catch (e) { errToast(e); }
  }, 700);
  $("[data-f=study_notes]", view)?.addEventListener("input", (e) => { const m = $("[data-saved]", view); if (m) m.textContent = "Saving…"; saveNotes(e.target.value); });
  $("[data-log]", view).addEventListener("click", async () => {
    const m = Number($("[data-logmin]", view).value);
    if (!(m > 0 && m <= 600)) return toast("Enter between 5 and 600 minutes", "err");
    try { await logStudy({ minutes: m, course_id: s.course_id, session_id: s.id }); toast(`Logged ${fmtMinutes(m)}`); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (e) { errToast(e); }
  });
  $$("[data-ai]", view).forEach((b) => b.addEventListener("click", () => window.dispatchEvent(new CustomEvent("hub:ai", { detail: {
    course_id: s.course_id, session_id: s.id, mode: b.dataset.ai,
    prompt: { explain: `Explain ${sessionLabel(s)} (${s.title}) in simple English.`, summarize: `Summarise the slides of ${sessionLabel(s)} (${s.title}) as a structured outline.`, mcq: `Quiz me with 8 multiple-choice questions on ${sessionLabel(s)} (${s.title}).`, exam: `Write exam-style practice questions with model answers for ${sessionLabel(s)} (${s.title}).` }[b.dataset.ai],
  } }))));
  $("[data-manage]", view).addEventListener("click", () => openSession(s.id, { onChange: again }));

  // Attach files & links: admins choose all students or only me; students' files are private.
  const status = (t) => { const el = $("[data-attach-status]", view); if (el) el.textContent = t; };
  const forAll = () => isStaff() && ATTACH.who === "all";
  const upload = async (files) => {
    let done = 0;
    for (const f of files) {
      if (f.size > 50 * 1048576) { toast(`${f.name} is over 50 MB`, "err"); continue; }
      status(`Uploading ${f.name}…`);
      try {
        if (forAll()) await uploadOfficialMaterial(f, { course_id: s.course_id, session_id: s.id, title: f.name });
        else await uploadAttachment(f, { course_id: s.course_id, session_id: s.id });
        done++;
      } catch (er) { errToast(er); }
    }
    status("");
    if (done) toast(forAll() ? `${done === 1 ? "File" : done + " files"} shared with all students` : `${done === 1 ? "File" : done + " files"} added`);
    window.dispatchEvent(new CustomEvent("hub:changed"));
  };
  $$("[data-who]", view).forEach((b) => b.addEventListener("click", () => { ATTACH.who = b.dataset.who; again(); }));
  $("[data-attach-file]", view).addEventListener("change", (e) => { const fl = [...e.target.files]; e.target.value = ""; upload(fl); });
  const drop = $("[data-drop]", view);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer?.files?.length) upload([...e.dataTransfer.files]); });
  const lf = $("[data-linkform]", view);
  $("[data-attach-link]", view).addEventListener("click", () => { lf.hidden = false; lf.url.focus(); });
  $("[data-linkcancel]", view).addEventListener("click", () => { lf.hidden = true; });
  lf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = lf.url.value.trim(), name = lf.name.value.trim() || "Lecture link";
    if (!/^https?:\/\//i.test(url)) return toast("Links must start with http:// or https://", "err");
    try {
      if (forAll()) await addOfficialLink({ course_id: s.course_id, session_id: s.id, url, title: name });
      else await addLink({ name, url, course_id: s.course_id, session_id: s.id });
      toast(forAll() ? "Link shared with all students" : "Link added");
      window.dispatchEvent(new CustomEvent("hub:changed"));
    } catch (er) { errToast(er); }
  });
  $$("[data-del-mine]", view).forEach((b) => b.addEventListener("click", async () => {
    const a = S.attachments.find((x) => x.id === b.dataset.delMine); if (!a) return;
    if (!(await confirmDialog(`Delete "${a.name}"?`))) return;
    try { await deleteAttachment(a); toast("Deleted"); again(); } catch (er) { errToast(er); }
  }));
  $$("[data-del-shared]", view).forEach((b) => b.addEventListener("click", async () => {
    const m = S.materials.find((x) => x.id === b.dataset.delShared); if (!m) return;
    if (!(await confirmDialog(`Remove "${m.title}" for every student?`, { ok: "Remove", danger: true }))) return;
    try { await deleteOfficialMaterial(m); toast("Removed"); again(); } catch (er) { errToast(er); }
  }));
}

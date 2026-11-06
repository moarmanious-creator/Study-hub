// Course dashboards (one per course) and the lecture drawer where students record
// attendance, the study checklist, notes, time and attachments.
import { esc, fmtDate, fmtLong, fmtMinutes, fmtBytes, isISO, openDrawer, toast, errToast, debounce, $, $$, md, safeUrl, confirmDialog } from "../lib.js?v=202611061403";
import {
  S, course, session, lecturer, lecturerName, courseSessions, saveAttendance, saveProgress, logStudy, uploadAttachment, addLink,
  signedUrl, allTasks, isStaff, uploadOfficialMaterial, addOfficialLink, deleteOfficialMaterial,
} from "../store.js?v=202611061403";
import { courseStats, sessionState, isStudyTracked, CHECKLIST, ATT, FORMULAS, taskStatus, TASK_STATUS, remainingMinutes } from "../metrics.js?v=202611061403";
import { cvar, ledgerCells, ledgerKey, sessionLabel, sessionName, sessionWhen, deliveryTag, attPill, studyPill, srcRef, infoRequired, rateRow, coursePill } from "../ui.js?v=202611061403";

let currentTab = "lectures";

export function renderCourse(view, cid, tab) {
  const c = course(cid);
  if (!c) { view.innerHTML = `<div class="empty"><strong>Course not found.</strong><a href="#/dashboard">Back to the dashboard</a></div>`; return; }
  if (tab) currentTab = tab;
  const st = courseStats(cid, S, S.today);
  const lecs = S.courseLecturers.filter((x) => x.course_id === cid).map((x) => ({ ...x, l: lecturer(x.lecturer_id) })).filter((x) => x.l);
  view.innerHTML = `
    <div class="course-head" style="${cvar(cid)}">
      <span class="stripe"></span>
      <div><h2>${esc(c.name)}</h2>
        <div class="meta">${esc(c.term || "")}${lecs.length ? " · " + lecs.map((x) => esc(lecturerName(x.l.id))).join(", ") : ""}</div>
        <div class="row" style="margin-top:10px">${["physical", "online", "recorded", "online_or_recorded"].map((d) => { const n = courseSessions(cid).filter((s) => s.delivery === d).length; return n ? `<span class="small">${deliveryTag(d)} ${n}</span>` : ""; }).join(" ")}</div>
      </div>
      <div class="ring" style="--p:${st.rates.overall ?? 0}" role="img" aria-label="Overall course progress ${st.rates.overall ?? 0}%"><span>${st.rates.overall ?? "—"}${st.rates.overall != null ? "%" : ""}<small>overall</small></span></div>
    </div>
    <div class="sheet section" style="${cvar(cid)}">
      ${ledgerCells(cid)}${ledgerKey()}
    </div>
    <div class="tabs" role="tablist">
      ${[["lectures", "Lecture tracker"], ["progress", "Progress"], ["overview", "Overview"], ["assessments", "Assessments"], ["materials", "Materials"]]
        .map(([k, l]) => `<button class="tab" role="tab" aria-selected="${currentTab === k}" data-tab="${k}">${l}</button>`).join("")}
    </div>
    <div id="courseTab"></div>`;
  $$(".tab", view).forEach((b) => b.addEventListener("click", () => { currentTab = b.dataset.tab; location.hash = `#/course/${cid}/${currentTab}`; }));
  const host = $("#courseTab", view);
  ({ lectures: tabLectures, progress: tabProgress, overview: tabOverview, assessments: tabAssessments, materials: tabMaterials }[currentTab] || tabLectures)(host, c, st);
}

function tabLectures(host, c) {
  const sess = courseSessions(c.id).filter((s) => !s.cancelled).sort((a, b) => (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999") || a.seq - b.seq);
  host.innerHTML = `<div class="sheet flush"><div class="table-wrap"><table class="data">
    <thead><tr><th>Session</th><th>Date</th><th>Lecturer</th><th>Format</th><th>Attendance</th><th>Recording</th><th>Study</th><th>Notes</th><th>Exercises</th><th>Files</th><th>Updated</th></tr></thead>
    <tbody>${sess.map((s) => {
      const st = sessionState(s, S, S.today);
      const files = S.attachments.filter((a) => a.session_id === s.id).length;
      const rec = s.delivery === "recorded" || s.recording_url || (s.links || []).length
        ? (st.att?.recording_watched || st.status === "recording" ? `<span class="pill ok">Watched</span>` : s.recording_url || (s.links || []).length ? `<span class="pill warn">Available</span>` : `<span class="pill">Link not given</span>`) : `<span class="muted">—</span>`;
      const upd = [st.att?.updated_at, st.progress?.updated_at].filter(Boolean).sort().pop();
      return `<tr class="clickable" data-open-session="${s.id}" tabindex="0">
        <td><strong>${esc(sessionLabel(s))}</strong><div class="small">${esc(s.title)}</div>${s.info_required?.length ? `<span class="pill warn" title="${esc(s.info_required.join(" "))}">Information required</span>` : ""}</td>
        <td class="num" style="white-space:nowrap">${isISO(s.scheduled_date) ? fmtDate(s.scheduled_date) : `<span class="muted">Not given</span>`}</td>
        <td class="small">${esc(lecturerName(s.lecturer_id) || "Not stated")}</td>
        <td>${deliveryTag(s.delivery)}</td>
        <td>${attPill(st.status)}</td>
        <td>${rec}</td>
        <td>${isStudyTracked(s) ? studyPill(st) : `<span class="muted small">n/a</span>`}</td>
        <td>${st.progress?.prepared_notes ? "✓" : `<span class="muted">—</span>`}</td>
        <td>${st.progress?.completed_exercises ? "✓" : `<span class="muted">—</span>`}</td>
        <td class="num">${files || `<span class="muted">0</span>`}</td>
        <td class="small muted">${upd ? fmtDate(upd.slice(0, 10), { day: "numeric", month: "short" }) : "—"}</td></tr>`;
    }).join("")}</tbody></table></div></div>`;
  $$("tr[data-open-session]", host).forEach((tr) => tr.addEventListener("keydown", (e) => { if (e.key === "Enter") openSession(tr.dataset.openSession); }));
}

function tabProgress(host, c, st) {
  const r = st.rates;
  const remaining = courseSessions(c.id).filter((s) => isStudyTracked(s) && !s.cancelled).map((s) => ({ s, st: sessionState(s, S, S.today) })).filter((x) => !x.st.fully);
  host.innerHTML = `<div class="grid two">
    <div class="sheet"><h3 style="margin-bottom:10px">Rates</h3>
      ${rateRow("Attendance rate", r.attendance, FORMULAS.attendance)}
      ${rateRow("Study completion rate", r.study, FORMULAS.study)}
      ${rateRow("Study depth", r.depth, "Average share of the five core study steps done, across all lectures.")}
      ${rateRow("Assignment completion", r.assessments, FORMULAS.assessments)}
      ${rateRow("Revision completion", r.revision, FORMULAS.revision)}
      <hr class="hr">${rateRow("Overall course progress", r.overall, FORMULAS.overall)}
    </div>
    <div class="sheet"><h3 style="margin-bottom:10px">Counts</h3>
      <table class="data"><tbody>
        ${[["Lectures in the course", st.total], ["Sessions held so far (incl. tutorials)", st.applicable], ["Attended (physical, online or recording)", st.attended], ["Missed: absent", st.absent], ["Missed: date passed, not marked", st.notMarked],
           ["Recordings watched", st.recWatched], ["Recordings still to watch", st.recPending], ["Lectures fully studied", st.studied], ["Lectures in progress", st.inProgress], ["Lectures not started", st.notStudied],
           ["Revision completed", st.revision], ["Exam-ready lectures", st.examReady], ["Assignments done", `${st.assessDone} of ${st.assessTotal}`], ["Study time left (estimate)", fmtMinutes(st.remaining)]]
          .map(([k, v]) => `<tr><td>${k}</td><td class="num" style="text-align:right;font-weight:600">${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v}</td></tr>`).join("")}
      </tbody></table>
      <p class="muted small" style="margin-top:8px">${esc(FORMULAS.remaining)}</p>
    </div></div>
    <div class="sheet" style="margin-top:18px"><h3 style="margin-bottom:8px">What remains in this course</h3>
      ${remaining.length ? `<ul class="plist">${remaining.map(({ s, st: x }) => `<li style="${cvar(c.id)}"><span class="bar"></span><div><button class="t" data-open-session="${s.id}">${esc(sessionName(s))}</button><div class="d">${esc(CHECKLIST.slice(0, 5).filter(([k]) => !x.progress?.[k]).map(([, l]) => l).join(", "))}</div></div><span class="small muted">${fmtMinutes(remainingMinutes(s, x))}</span></li>`).join("")}</ul>`
        : `<div class="empty"><strong>Every lecture is fully studied.</strong>Tick revision and exam readiness as you go.</div>`}
    </div>`;
}

function tabOverview(host, c) {
  const lecs = S.courseLecturers.filter((x) => x.course_id === c.id).map((x) => ({ ...x, l: lecturer(x.lecturer_id) })).filter((x) => x.l);
  const nLect = courseSessions(c.id).filter(isStudyTracked).length;
  const nMat = S.materials.filter((m) => m.course_id === c.id).length;
  host.innerHTML = `<div class="grid side-r">
    <div class="stack">
      ${infoRequired(c.info_required)}
      <div class="sheet"><h3>Description</h3><p style="margin-top:6px">${esc(c.description || "Not given in the syllabus.")}</p>${srcRef(c.source_ref)}</div>
      <div class="sheet"><h3>Learning objectives</h3>${(c.objectives || []).length ? `<ol style="margin:8px 0 0;padding-left:20px">${c.objectives.map((o) => `<li style="margin-bottom:4px">${esc(o)}</li>`).join("")}</ol>` : `<p class="muted" style="margin-top:6px">Not listed in the syllabus.</p>`}</div>
      <div class="sheet"><h3>Teaching format</h3><p style="margin-top:6px">${esc(c.teaching_format || "Not stated.")}</p></div>
    </div>
    <div class="stack">
      <div class="sheet"><h3>Teaching staff</h3>${lecs.map((x) => `<p style="margin:8px 0 0"><strong>${esc(lecturerName(x.l.id))}</strong><br><span class="small muted">${esc(x.role)}${x.l.affiliation ? " · " + esc(x.l.affiliation) : ""}</span>${x.l.email ? `<br><a class="small" href="mailto:${esc(x.l.email)}">${esc(x.l.email)}</a>` : ""}</p>`).join("") || `<p class="muted">Not stated.</p>`}</div>
      <div class="sheet"><h3>At a glance</h3><table class="data" style="margin-top:6px"><tbody>
        <tr><td>Scheduled lectures</td><td class="num" style="text-align:right">${nLect}</td></tr>
        <tr><td>Study materials</td><td class="num" style="text-align:right">${nMat}</td></tr></tbody></table></div>
      <div class="sheet"><h3>Assessment</h3><p style="margin-top:6px">${esc(c.assessment_summary || "Not stated.")}</p><h3 style="margin-top:12px">Examination</h3><p style="margin-top:6px">${esc(c.exam_info || "Not stated.")}</p></div>
      <div class="sheet"><h3>Core reading</h3>${(c.core_readings || []).length ? `<ul style="margin:8px 0 0;padding-left:18px">${c.core_readings.map((r) => `<li class="small" style="margin-bottom:4px">${esc(r)}</li>`).join("")}</ul>` : `<p class="muted">Not listed.</p>`}</div>
    </div></div>`;
}

function tabAssessments(host, c) {
  const tasks = allTasks().filter((t) => t.official?.course_id === c.id);
  host.innerHTML = tasks.length ? `<div class="stack">${tasks.map((t) => {
    const a = t.official;
    const status = taskStatus(t, S.today);
    return `<div class="sheet"><div class="spread"><div><h3>${esc(a.title)}</h3><div class="muted small">${esc(a.type.replace("_", " "))} · ${esc(a.weight || "weight not stated")}${a.is_group ? ` · group of up to ${a.max_group_size ?? "?"}` : ""}</div></div>
      <div class="row"><span class="pill ${status === "overdue" ? "bad" : ["completed", "submitted"].includes(status) ? "ok" : ""}">${esc(TASK_STATUS[status])}</span>${a.type !== "exam" ? `<button class="btn sm" data-open-task="${esc(t.id || "a:" + a.id)}">Track</button>` : ""}</div></div>
      <p style="margin:8px 0">${esc(a.description || "")}</p>
      <div class="small"><strong>Deadline:</strong> ${a.due_date ? fmtLong(a.due_date) : `<span class="muted">Not stated</span>`}</div>
      ${S.materials.filter((m) => m.assessment_id === a.id).length ? `<details class="more small" style="margin-top:8px"><summary>Papers to choose from (${S.materials.filter((m) => m.assessment_id === a.id).length})</summary><ol style="padding-left:18px">${S.materials.filter((m) => m.assessment_id === a.id).map((m) => `<li style="margin:4px 0">${esc(m.title)}</li>`).join("")}</ol></details>` : ""}
      <div style="margin-top:10px">${infoRequired(a.info_required)}</div>${srcRef(a.source_ref)}</div>`;
  }).join("")}</div>` : `<div class="empty"><strong>No assessments listed.</strong>The admin adds them from the official syllabus.</div>`;
}

function tabMaterials(host, c) {
  const mats = S.materials.filter((m) => m.course_id === c.id);
  const mine = S.attachments.filter((a) => a.course_id === c.id);
  const links = courseSessions(c.id).flatMap((s) => (s.links || []).map((l) => ({ ...l, s })).concat(s.recording_url ? [{ label: "Recording", url: s.recording_url, s }] : []));
  host.innerHTML = `<div class="grid two">
    <div class="sheet"><h3>Official materials</h3><p class="muted small">Shared with every student by the programme. ${isStaff() ? `Upload new files from <a href="#/documents">Documents</a>.` : ""}</p>
      ${mats.length ? `<ul class="plist">${mats.map((m) => `<li><span class="bar"></span><div><div class="t">${m.url ? `<a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">${esc(m.title)}</a>` : m.storage_path ? `<button class="t" data-official-file="${m.id}">${esc(m.title)}</button>` : esc(m.title)}</div><div class="d">${esc({ paper: "Presentation paper", link: "Link", file: "File", reading: "Reading" }[m.kind])}${m.session_id ? " · " + esc(sessionLabel(session(m.session_id))) : ""}${m.size_bytes ? " · " + fmtBytes(m.size_bytes) : ""}</div></div><span></span></li>`).join("")}</ul>` : `<p class="muted">None uploaded yet.</p>`}
      ${links.length ? `<h3 style="margin-top:14px">Recording and lecture links</h3><ul class="plist">${links.map((l) => `<li><span class="bar"></span><div><a class="t" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)}</a><div class="d">${esc(sessionLabel(l.s))}</div></div><span></span></li>`).join("")}</ul>` : ""}
    </div>
    <div class="sheet"><h3>My files for this course</h3><p class="muted small">Private to you.</p>
      ${mine.length ? `<ul class="plist">${mine.map((a) => `<li><span class="bar"></span><div><button class="t" data-my-file="${a.id}">${esc(a.name)}</button><div class="d">${a.session_id ? esc(sessionLabel(session(a.session_id))) : "Course"}${a.size_bytes ? " · " + fmtBytes(a.size_bytes) : ""}</div></div><span></span></li>`).join("")}</ul>` : `<p class="muted">No files yet. Add them from a lecture or the Documents page.</p>`}
    </div></div>`;
}

// ── Lecture drawer ──
export function openSession(id, { onChange } = {}) {
  const s = session(id);
  if (!s) return;
  const c = course(s.course_id);
  const refresh = () => { onChange ? onChange() : window.dispatchEvent(new CustomEvent("hub:changed")); };
  openDrawer(sessionName(s), (body) => draw(body), { subtitle: `${esc(c?.name || "")} · ${esc(sessionWhen(s))}` });

  function draw(body) {
    const st = sessionState(s, S, S.today);
    const p = st.progress || {};
    const att = st.att || { status: "not_yet", recording_watched: false };
    const files = S.attachments.filter((a) => a.session_id === s.id);
    const official = S.materials.filter((m) => m.session_id === s.id);
    const links = [...(s.recording_url ? [{ label: "Recording", url: s.recording_url }] : []), ...(s.links || [])];
    body.innerHTML = `
      <div class="block row">${deliveryTag(s.delivery)}${s.location ? `<span class="small muted">${esc(s.location)}</span>` : ""}<span class="small muted">${esc(lecturerName(s.lecturer_id) || "Lecturer not stated")}</span>${coursePill(s.course_id)}</div>
      ${s.info_required?.length ? `<div class="block">${infoRequired(s.info_required)}</div>` : ""}
      ${s.topics?.length || s.readings ? `<div class="block"><h3>Topics</h3>${s.topics?.length ? `<ul style="margin:0;padding-left:18px">${s.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}${s.readings ? `<p class="small" style="margin-top:8px"><strong>Readings:</strong> ${esc(s.readings)}</p>` : ""}${srcRef(s.source_ref)}</div>` : `<div class="block">${srcRef(s.source_ref)}</div>`}
      ${links.length ? `<div class="block"><h3>Links</h3>${links.map((l) => `<a class="btn sm" style="margin:0 6px 6px 0" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div>` : ""}

      <div class="block"><h3>Attendance</h3>
        <div class="seg" role="group" aria-label="Attendance status">${Object.entries(ATT).map(([k, l]) => `<button type="button" data-att="${k}" aria-pressed="${att.status === k}">${l}</button>`).join("")}</div>
        <label class="check" style="margin-top:8px"><input type="checkbox" data-rec ${att.recording_watched || att.status === "recording" ? "checked" : ""}> I have watched the recording</label>
        <p class="muted small">Attendance is recorded separately from studying: attending a lecture doesn't mark it as studied.</p>
      </div>

      ${isStudyTracked(s) ? `<div class="block"><h3>Study checklist</h3>
        ${CHECKLIST.map(([k, l], i) => `<label class="check"><input type="checkbox" data-chk="${k}" ${p[k] ? "checked" : ""}> <span>${l}${i < 5 ? "" : ` <span class="muted small">(after studying)</span>`}</span></label>`).join("")}
        <div style="margin-top:6px">${studyPill(st)} <span class="small muted">Fully studied when the first five are ticked.</span></div>
      </div>` : ""}

      <div class="block"><h3>Notes and time</h3>
        <div class="form-grid">
          <label class="field wide"><span>Study notes</span><textarea class="input" data-f="study_notes" placeholder="Key points, definitions, questions to ask">${esc(p.study_notes || "")}</textarea></label>
          <label class="field wide"><span>Personal comments</span><textarea class="input" data-f="comments" style="min-height:60px">${esc(p.comments || "")}</textarea></label>
          <label class="field"><span>Revision date</span><input class="input" type="date" data-f="revision_date" value="${esc(p.revision_date || "")}"></label>
          <label class="field"><span>Estimated study time (minutes)</span><input class="input" type="number" min="0" max="6000" step="15" data-f="est_minutes" value="${p.est_minutes ?? ""}" placeholder="e.g. 120"></label>
        </div>
        <div class="row" style="margin-top:10px"><span class="small">Time logged: <strong>${fmtMinutes(p.actual_minutes || 0)}</strong></span>
          <input class="input" type="number" min="5" max="600" step="5" value="30" aria-label="Minutes to log" style="width:90px" data-logmin>
          <button class="btn sm" data-log>Log study time</button></div>
        <p class="muted small" data-saved></p>
      </div>

      ${isStaff() ? `<div class="block staff-block"><h3>Shared with all students</h3>
        <p class="small muted" style="margin-top:0">Slides, readings and links you add here appear on this lecture for every student, and the assistant can read uploaded PDFs, Word and PowerPoint files.</p>
        <ul class="plist">${official.map((m) => `<li><span class="bar"></span><div><div class="t">${esc(m.title)}</div><div class="d">${m.url ? "Link" : fmtBytes(m.size_bytes)}</div></div><button class="btn sm ghost danger" data-odel="${m.id}">Remove</button></li>`).join("") || `<li><span></span><span class="muted small">Nothing shared for this lecture yet.</span></li>`}</ul>
        <div class="row" style="margin-top:8px"><label class="btn sm primary">Upload slides or files<input type="file" multiple hidden data-oupload accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.md"></label><button class="btn sm" data-olink>Add a link for everyone</button></div>
        <form data-olinkform hidden class="form-grid" style="margin-top:10px"><label class="field wide"><span>Link (https://…)</span><input class="input" name="url" type="url" required placeholder="https://"></label><label class="field wide"><span>Name shown to students</span><input class="input" name="title" placeholder="e.g. Lecture recording"></label><div class="row wide"><button class="btn sm primary" type="submit">Share link</button><button class="btn sm" type="button" data-olinkcancel>Cancel</button></div></form>
      </div>` : ""}

      <div class="block"><h3>Files</h3>
        ${official.length ? `<p class="small muted">Official</p><ul class="plist">${official.map((m) => `<li><span class="bar"></span><div>${m.url ? `<a class="t" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">${esc(m.title)}</a>` : `<button class="t" data-official-file="${m.id}">${esc(m.title)}</button>`}</div><span></span></li>`).join("")}</ul>` : ""}
        <ul class="plist">${files.map((a) => `<li><span class="bar"></span><div><button class="t" data-my-file="${a.id}">${esc(a.name)}</button><div class="d">${a.kind === "link" ? "Link" : fmtBytes(a.size_bytes)}</div></div><span></span></li>`).join("") || `<li><span></span><span class="muted small">No personal files for this lecture.</span><span></span></li>`}</ul>
        <div class="row" style="margin-top:8px"><label class="btn sm">Upload files<input type="file" multiple hidden data-upload accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.heic,.txt,.md"></label><button class="btn sm" data-addlink>Add a link</button></div>
      </div>

      <div class="block row"><button class="btn" data-ai="explain">Explain this lecture with the AI assistant</button><button class="btn ghost" data-ai="exam">Practice questions</button></div>`;

    $$("[data-att]", body).forEach((b) => b.addEventListener("click", async () => {
      try { await saveAttendance(s.id, { status: b.dataset.att, recording_watched: b.dataset.att === "recording" ? true : att.recording_watched }); toast("Attendance saved"); draw(body); refresh(); } catch (e) { errToast(e); }
    }));
    $("[data-rec]", body).addEventListener("change", async (e) => {
      try { await saveAttendance(s.id, { recording_watched: e.target.checked, status: e.target.checked && att.status === "not_yet" ? "recording" : att.status }); draw(body); refresh(); } catch (er) { errToast(er); }
    });
    $$("[data-chk]", body).forEach((b) => b.addEventListener("change", async () => {
      try { await saveProgress(s.id, { [b.dataset.chk]: b.checked }); draw(body); refresh(); } catch (e) { errToast(e); b.checked = !b.checked; }
    }));
    const saveField = debounce(async (k, v) => {
      try { await saveProgress(s.id, { [k]: v }); const el = $("[data-saved]", body); if (el) el.textContent = "Saved"; refresh(); } catch (e) { errToast(e); }
    }, 700);
    $$("[data-f]", body).forEach((el) => el.addEventListener("input", () => {
      const k = el.dataset.f;
      const v = el.type === "number" ? (el.value === "" ? null : Math.max(0, Math.min(6000, Number(el.value)))) : el.value || null;
      const m = $("[data-saved]", body); if (m) m.textContent = "Saving…";
      saveField(k, v);
    }));
    $("[data-log]", body).addEventListener("click", async () => {
      const m = Number($("[data-logmin]", body).value);
      if (!(m > 0 && m <= 600)) return toast("Enter between 5 and 600 minutes", "err");
      try { await logStudy({ minutes: m, course_id: s.course_id, session_id: s.id }); toast(`Logged ${fmtMinutes(m)}`); draw(body); refresh(); } catch (e) { errToast(e); }
    });
    $("[data-upload]", body).addEventListener("change", async (e) => {
      const fl = [...e.target.files];
      for (const f of fl) {
        if (f.size > 50 * 1048576) { toast(`${f.name} is over 50 MB`, "err"); continue; }
        try { toast(`Uploading ${f.name}…`); const r = await uploadAttachment(f, { course_id: s.course_id, session_id: s.id }); toast(r.searchable ? `${f.name} uploaded and readable by the assistant` : `${f.name} uploaded`); } catch (er) { errToast(er); }
      }
      draw(body); refresh();
    });
    $("[data-addlink]", body).addEventListener("click", async () => {
      const url = prompt("Paste the link (recording, notes, article)");
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) return toast("Links must start with http:// or https://", "err");
      const name = prompt("Name for this link", "Lecture link") || "Lecture link";
      try { await addLink({ name, url, course_id: s.course_id, session_id: s.id }); draw(body); refresh(); } catch (e) { errToast(e); }
    });
    if (isStaff()) {
      $("[data-oupload]", body).addEventListener("change", async (e) => {
        const fl = [...e.target.files]; e.target.value = ""; let done = 0;
        for (const f of fl) {
          if (f.size > 50 * 1048576) { toast(`${f.name} is over 50 MB`, "err"); continue; }
          try { toast(`Uploading ${f.name} for all students…`); await uploadOfficialMaterial(f, { course_id: s.course_id, session_id: s.id, title: f.name }); done++; } catch (er) { errToast(er); }
        }
        if (done) toast(done === 1 ? "Shared with all students" : `${done} files shared with all students`);
        draw(body); refresh();
      });
      const lf = $("[data-olinkform]", body);
      $("[data-olink]", body).addEventListener("click", () => { lf.hidden = false; lf.url.focus(); });
      $("[data-olinkcancel]", body).addEventListener("click", () => { lf.hidden = true; });
      lf.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await addOfficialLink({ course_id: s.course_id, session_id: s.id, url: lf.url.value.trim(), title: lf.title.value.trim() }); toast("Link shared with all students"); draw(body); refresh(); } catch (er) { errToast(er); }
      });
      $$("[data-odel]", body).forEach((b) => b.addEventListener("click", async () => {
        const m = S.materials.find((x) => x.id === b.dataset.odel); if (!m) return;
        if (!(await confirmDialog(`Remove "${m.title}" for every student?`, { ok: "Remove", danger: true }))) return;
        try { await deleteOfficialMaterial(m); toast("Removed"); draw(body); refresh(); } catch (er) { errToast(er); }
      }));
    }
    $$("[data-ai]", body).forEach((b) => b.addEventListener("click", () => window.dispatchEvent(new CustomEvent("hub:ai", { detail: { course_id: s.course_id, session_id: s.id, mode: b.dataset.ai,
      prompt: b.dataset.ai === "explain" ? `Explain ${sessionLabel(s)} (${s.title}) in simple English.` : `Write exam-style practice questions with model answers for ${sessionLabel(s)} (${s.title}).` } }))));
  }
}

export async function openFile(kind, id) {
  try {
    if (kind === "official") {
      const m = S.materials.find((x) => x.id === id);
      if (m?.url) return window.open(safeUrl(m.url), "_blank", "noopener");
      const w = window.open("", "_blank"); // opened during the tap, so iPhone Safari doesn't block it
      const url = await signedUrl("official", m.storage_path);
      if (w) { w.opener = null; w.location.href = url; } else location.href = url;
      return;
    }
    const a = S.attachments.find((x) => x.id === id);
    if (!a) return;
    if (a.kind === "link") return window.open(a.url, "_blank", "noopener");
    window.dispatchEvent(new CustomEvent("hub:preview", { detail: a }));
  } catch (e) { errToast(e); }
}
void md;

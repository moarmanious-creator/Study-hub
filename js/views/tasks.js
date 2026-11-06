// Assignments and personal tasks: Kanban board and list view. Presentations and papers live on Projects.
// Official items come from the syllabus; a student's progress on them is stored privately.
import { esc, fmtDate, fmtLong, isISO, relDays, openModal, readForm, toast, errToast, confirmDialog, icon, safeUrl, $, $$ } from "../lib.js?v=202611061520";
import { openSubmission } from "./submit.js?v=202611061520";
import { S, allTasks, allAssignments, saveTask, deleteTask, uploadAttachment, isStaff, loadOfficial } from "../store.js?v=202611061520";
import { editAssessment } from "./admin.js?v=202611061520";
import { taskStatus, TASK_STATUS, DONE_TASK } from "../metrics.js?v=202611061520";
import { cvar, coursePill, infoRequired, srcRef } from "../ui.js?v=202611061520";

const UI = { mode: "board", course: "all", sort: "due" };
const COLS = ["overdue", "not_started", "in_progress", "completed", "submitted"];
const PRI = { urgent: ["Urgent", "bad"], high: ["High", "warn"], medium: ["Medium", ""], low: ["Low", ""] };

const tkey = (t) => t.id || "a:" + t.assessment_id;
export const findTask = (key) => allTasks().find((t) => tkey(t) === key);

export function renderTasks(view) {
  const today = S.today;
  const tasks = allAssignments().filter((t) => UI.course === "all" || t.course_id === UI.course);
  const exams = allTasks().filter((t) => t.official?.type === "exam" && (UI.course === "all" || t.course_id === UI.course));
  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Assignments</p>
      <h2>Assignments &amp; coursework</h2>
      <p>Official assignments from the syllabi plus anything you add yourself. Drag a card or use its menu to change status. Presentations and papers are on the <a href="#/projects">Projects</a> page.</p>
      <div class="actions">${isStaff() ? `<button class="btn primary" data-publish>Add assignment for all students</button><button class="btn" data-new>Add a personal one</button>` : `<button class="btn primary" data-new>Add assignment</button>`}</div>
    </header>
    <div class="cal-toolbar">
      <div class="seg" role="group" aria-label="Task view"><button data-mode="board" aria-pressed="${UI.mode === "board"}">Board</button><button data-mode="list" aria-pressed="${UI.mode === "list"}">List</button></div>
      <select class="input" data-course style="width:auto" aria-label="Course"><option value="all">All courses</option>${S.courses.map((c) => `<option value="${c.id}" ${UI.course === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select>
    </div>
    <div id="tasksBody"></div>
    <section class="section" style="margin-top:26px"><div class="section-head"><div><h2>Examinations</h2><p>From the official syllabi. Exam dates are set by the faculty.</p></div></div>
      <div class="sheet flush"><table class="data"><thead><tr><th>Course</th><th>Exam</th><th>Weight</th><th>Date</th></tr></thead><tbody>
      ${exams.map((t) => `<tr><td>${coursePill(t.course_id)}</td><td>${esc(t.title)}<div class="small muted">${esc(t.official?.description || "")}</div></td><td class="small">${esc(t.official?.weight || "—")}</td><td>${t.due_date ? fmtDate(t.due_date) : `<span class="pill warn">Information required</span>`}</td></tr>`).join("")}
      </tbody></table></div></section>`;
  const body = $("#tasksBody", view);
  if (UI.mode === "board") {
    body.innerHTML = `<div class="kanban">${COLS.map((col) => {
      const list = tasks.filter((t) => taskStatus(t, today) === col);
      return `<div class="kcol" data-col="${col}"><h3>${TASK_STATUS[col]}<span class="muted">${list.length}</span></h3>${list.map((t) => card(t, today)).join("") || `<p class="muted small" style="padding:4px">${col === "overdue" ? "Nothing overdue." : "Empty"}</p>`}</div>`;
    }).join("")}</div><p class="muted small">Drag a card to change its status, or open it to edit. A task past its deadline moves to Overdue until you mark it completed or submitted.</p>`;
    let dragKey = null;
    $$(".kcard", body).forEach((c) => {
      c.addEventListener("dragstart", (e) => { dragKey = c.dataset.task; e.dataTransfer.effectAllowed = "move"; });
    });
    $$(".kcol", body).forEach((col) => {
      col.addEventListener("dragover", (e) => { if (col.dataset.col !== "overdue") { e.preventDefault(); col.classList.add("drop"); } });
      col.addEventListener("dragleave", () => col.classList.remove("drop"));
      col.addEventListener("drop", async (e) => {
        e.preventDefault(); col.classList.remove("drop");
        const t = findTask(dragKey); if (!t) return;
        try { await saveTask(t, { status: col.dataset.col, completion: col.dataset.col === "in_progress" ? Math.max(t.completion || 0, 10) : t.completion }); toast(`Moved to ${TASK_STATUS[col.dataset.col]}`); renderTasks(view); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (er) { errToast(er); }
      });
    });
  } else {
    const sorted = [...tasks].sort((a, b) => UI.sort === "due" ? (a.due_date || "9999").localeCompare(b.due_date || "9999") : UI.sort === "course" ? (a.course_id || "").localeCompare(b.course_id || "") : (b.completion || 0) - (a.completion || 0));
    body.innerHTML = `<div class="sheet flush"><div class="table-wrap"><table class="data"><thead><tr>
      <th><button class="btn ghost sm" data-sort="course">Course</button></th><th>Task</th><th><button class="btn ghost sm" data-sort="due">Deadline</button></th><th>Status</th><th>Priority</th><th><button class="btn ghost sm" data-sort="done">Done</button></th></tr></thead><tbody>
      ${sorted.map((t) => { const st = taskStatus(t, today); return `<tr class="clickable" data-open-task="${esc(tkey(t))}" tabindex="0"><td>${coursePill(t.course_id)}</td><td><strong>${esc(t.title)}</strong>${t.official ? ` <span class="pill info">Official</span>` : ""}</td><td>${t.due_date ? `${fmtDate(t.due_date)}<div class="small muted">${relDays(t.due_date, today)}</div>` : `<span class="muted small">Not stated</span>`}</td><td><span class="pill ${st === "overdue" ? "bad" : DONE_TASK.has(st) ? "ok" : ""}">${TASK_STATUS[st]}</span></td><td><span class="pill ${PRI[t.priority]?.[1] || ""}">${PRI[t.priority]?.[0] || t.priority}</span></td><td style="min-width:110px"><div class="meter"><i style="width:${t.completion || 0}%"></i></div><span class="small muted">${t.completion || 0}%</span></td></tr>`; }).join("") || `<tr><td colspan="6"><div class="empty">No tasks.</div></td></tr>`}
      </tbody></table></div></div>`;
    $$("[data-sort]", body).forEach((b) => b.addEventListener("click", () => { UI.sort = b.dataset.sort; renderTasks(view); }));
    $$("tr[data-open-task]", body).forEach((tr) => tr.addEventListener("keydown", (e) => { if (e.key === "Enter") openTask(findTask(tr.dataset.openTask)); }));
  }
  $$("[data-mode]", view).forEach((b) => b.addEventListener("click", () => { UI.mode = b.dataset.mode; renderTasks(view); }));
  $("[data-course]", view).addEventListener("change", (e) => { UI.course = e.target.value; renderTasks(view); });
  $("[data-new]", view).addEventListener("click", () => openTask({ kind: "task", status: "not_started", priority: "medium", completion: 0, course_id: UI.course === "all" ? null : UI.course }, () => renderTasks(view)));
  $("[data-publish]", view)?.addEventListener("click", () => editAssessment({ type: "assignment", course_id: UI.course === "all" ? null : UI.course }, async () => { await loadOfficial(); renderTasks(view); window.dispatchEvent(new CustomEvent("hub:changed")); }));
}

function card(t, today) {
  const st = taskStatus(t, today);
  return `<div class="kcard" draggable="true" data-task="${esc(tkey(t))}" style="${t.course_id ? cvar(t.course_id) : ""}">
    <div class="kt"><button class="t" style="background:none;border:0;padding:0;text-align:left;font:inherit;cursor:pointer;color:inherit" data-open-task="${esc(tkey(t))}">${esc(t.title)}</button></div>
    <div class="km">${coursePill(t.course_id)}${t.due_date ? `<span class="${st === "overdue" ? "pill bad" : ""}">${fmtDate(t.due_date, { day: "numeric", month: "short" })}</span>` : `<span>No deadline</span>`}<span class="pill ${PRI[t.priority]?.[1] || ""}">${PRI[t.priority]?.[0] || ""}</span></div>
    ${t.completion ? `<div class="meter" style="margin-top:8px"><i style="width:${t.completion}%"></i></div>` : ""}
    <button class="btn ghost sm" style="margin-top:6px;padding:3px 8px" data-submit-task="${esc(tkey(t))}" title="Prepare submission: make the file and email it to the instructor">${icon.send} Submit</button>
    <label class="sr" for="mv-${esc(tkey(t))}">Move to</label>
    <select id="mv-${esc(tkey(t))}" class="input" style="margin-top:8px;padding:4px 6px;font-size:.8rem" data-move="${esc(tkey(t))}">${["not_started", "in_progress", "completed", "submitted"].map((s) => `<option value="${s}" ${t.status === s ? "selected" : ""}>${TASK_STATUS[s]}</option>`).join("")}</select>
  </div>`;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-submit-task]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const t = findTask(b.dataset.submitTask);
  if (t) openSubmission(t, () => window.dispatchEvent(new CustomEvent("hub:changed")));
});

// Delegated handler for the per-card status menu (works on phones without drag and drop).
document.addEventListener("change", async (e) => {
  const sel = e.target.closest?.("[data-move]");
  if (!sel) return;
  const t = findTask(sel.dataset.move);
  if (!t) return;
  try { await saveTask(t, { status: sel.value }); toast(`Moved to ${TASK_STATUS[sel.value]}`); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (er) { errToast(er); }
});

export function openTask(t, after) {
  if (!t) return;
  const a = t.official;
  const isNew = !t.id && !a;
  openModal(a ? a.title : isNew ? "Add assignment" : "Edit assignment", (body, foot, close) => {
    const files = S.attachments.filter((x) => x.task_id && x.task_id === t.id);
    body.innerHTML = `
      ${a ? `<div class="stack" style="margin-bottom:14px"><div class="row">${coursePill(a.course_id)}<span class="pill info">Official</span><span class="small muted">${esc(a.weight || "")}</span></div><p style="margin:0">${esc(a.description || "")}</p><div class="small"><strong>Deadline:</strong> ${a.due_date ? fmtLong(a.due_date) : "Not stated in the official documents"}</div>${infoRequired(a.info_required)}${S.materials.filter((m) => m.assessment_id === a.id && m.url).map((m) => `<a class="btn sm" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">${esc(m.title)}</a>`).join(" ")}${srcRef(a.source_ref)}</div>` : ""}
      <form class="form-grid">
        ${a ? "" : `<label class="field wide"><span>Title</span><input class="input" name="title" required value="${esc(t.title || "")}"></label>
        <label class="field"><span>Course</span><select class="input" name="course_id"><option value="">None</option>${S.courses.map((c) => `<option value="${c.id}" ${t.course_id === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Deadline</span><input class="input" type="date" name="due_date" value="${esc(t.due_date || "")}"></label>
        <label class="field"><span>Assigned on</span><input class="input" type="date" name="assigned_date" value="${esc(t.assigned_date || "")}"></label>
        <label class="field wide"><span>Description</span><textarea class="input" name="description" style="min-height:60px">${esc(t.description || "")}</textarea></label>`}
        <label class="field"><span>Status</span><select class="input" name="status">${["not_started", "in_progress", "completed", "submitted"].map((s) => `<option value="${s}" ${t.status === s ? "selected" : ""}>${TASK_STATUS[s]}</option>`).join("")}</select></label>
        <label class="field"><span>Priority</span><select class="input" name="priority">${Object.entries(PRI).map(([k, [l]]) => `<option value="${k}" ${t.priority === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field wide"><span>Completion: <output>${t.completion || 0}</output>%</span><input type="range" name="completion" min="0" max="100" step="5" value="${t.completion || 0}" style="width:100%"></label>
        <label class="field wide"><span>Required attachments</span><input class="input" name="required_attachments" value="${esc(t.required_attachments || "")}" placeholder="e.g. Slides (PDF) + reaction paper (Word)"></label>
        <label class="field wide"><span>Personal notes</span><textarea class="input" name="notes" style="min-height:70px">${esc(t.notes || "")}</textarea></label>
      </form>
      ${t.id ? `<div style="margin-top:12px"><h3 style="font-size:.95rem">Files</h3>${files.map((f) => `<div class="small"><button class="btn ghost sm" data-my-file="${f.id}">${esc(f.name)}</button></div>`).join("") || `<p class="muted small">None yet.</p>`}<label class="btn sm">Attach files<input type="file" multiple hidden data-taskfiles></label></div>` : `<p class="muted small" style="margin-top:10px">Save first to attach files.</p>`}`;
    const form = $("form", body);
    form.completion.addEventListener("input", () => { $("output", form).textContent = form.completion.value; });
    $("[data-taskfiles]", body)?.addEventListener("change", async (e) => {
      for (const f of e.target.files) { try { await uploadAttachment(f, { course_id: t.course_id, task_id: t.id }); toast(`${f.name} attached`); } catch (er) { errToast(er); } }
      close(); openTask(findTask(tkey(t)) || t, after);
    });
    foot.innerHTML = `${t.id && !a ? `<button class="btn danger" data-del style="margin-right:auto">Delete</button>` : ""}<button class="btn" data-cancel>Cancel</button>${isNew ? "" : `<button class="btn" data-submit title="Make a Word, PDF or PowerPoint file and email it to the instructor">${icon.send} Prepare submission</button>`}<button class="btn primary" data-save>${isNew ? "Add assignment" : "Save changes"}</button>`;
    foot.querySelector("[data-cancel]").onclick = close;
    foot.querySelector("[data-submit]")?.addEventListener("click", () => { close(); openSubmission(findTask(tkey(t)) || t, after); });
    foot.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this assignment?"))) return;
      try { await deleteTask(t.id); close(); toast("Task deleted"); after && after(); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (e) { errToast(e); }
    });
    foot.querySelector("[data-save]").onclick = async () => {
      if (!form.reportValidity()) return;
      const f = readForm(form);
      f.completion = Number(form.completion.value);
      try { await saveTask(t, f); toast(isNew ? "Assignment added" : "Saved"); close(); after && after(); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (e) { errToast(e); }
    };
  });
}
void isISO;

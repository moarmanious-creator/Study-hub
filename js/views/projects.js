// Projects: long pieces of work with milestones. Official presentations and research papers
// from the syllabi appear here automatically; students add their own, and admins can publish
// a project to the whole class.
import { esc, fmtDate, fmtLong, relDays, isISO, openModal, readForm, toast, errToast, confirmDialog, icon, $, $$ } from "../lib.js?v=202611070657";
import { openSubmission } from "./submit.js?v=202611070657";
import { S, allProjects, saveTask, deleteTask, isStaff, loadOfficial } from "../store.js?v=202611070657";
import { taskStatus, TASK_STATUS, DONE_TASK } from "../metrics.js?v=202611070657";
import { cvar, coursePill, infoRequired } from "../ui.js?v=202611070657";
import { editAssessment } from "./admin.js?v=202611070657";

const TYPE = { presentation: "Presentation", research_paper: "Research paper" };
const tkey = (t) => t.id || "a:" + t.assessment_id;
const ms = (t) => (Array.isArray(t.milestones) ? t.milestones : []);
export const projectProgress = (t) => {
  if (DONE_TASK.has(t.status)) return 100;
  const m = ms(t);
  return m.length ? Math.round((100 * m.filter((x) => x.done).length) / m.length) : t.completion || 0;
};

export function renderProjects(view) {
  const list = allProjects().sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const active = list.filter((t) => !DONE_TASK.has(t.status));
  const done = list.filter((t) => DONE_TASK.has(t.status));
  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Projects</p>
      <h2>Presentations, papers and longer work</h2>
      <p>Break each project into milestones and tick them off; progress updates as you go. Official presentations and papers from the syllabi are already here.</p>
      <div class="actions"><button class="btn primary" data-new>New project</button>${isStaff() ? `<button class="btn" data-publish>Add project for all students</button>` : ""}</div>
    </header>
    ${active.length ? `<div class="proj-grid">${active.map(card).join("")}</div>` : `<div class="sheet empty"><strong>No projects in progress.</strong>Add one with "New project".</div>`}
    ${done.length ? `<section class="section" style="margin-top:28px"><div class="section-head"><h2>Completed</h2></div><div class="proj-grid">${done.map(card).join("")}</div></section>` : ""}`;
  $("[data-new]", view).addEventListener("click", () => openProject({ kind: "project", status: "not_started", priority: "medium", milestones: [] }, () => renderProjects(view)));
  $("[data-publish]", view)?.addEventListener("click", () => editAssessment({ type: "research_paper" }, async () => { await loadOfficial(); window.dispatchEvent(new CustomEvent("hub:changed")); }));
  $$("[data-edit]", view).forEach((b) => b.addEventListener("click", () => openProject(find(b.dataset.edit), () => renderProjects(view))));
  $$("[data-submit-proj]", view).forEach((b) => b.addEventListener("click", () => openSubmission(find(b.dataset.submitProj), () => renderProjects(view))));
  $$("[data-ms]", view).forEach((cb) => cb.addEventListener("change", async () => {
    const t = find(cb.dataset.ms); const i = Number(cb.dataset.i);
    const m = ms(t).map((x, j) => (j === i ? { ...x, done: cb.checked } : x));
    const allDone = m.length && m.every((x) => x.done);
    try {
      await saveTask(t, { milestones: m, status: allDone ? "completed" : t.status === "not_started" ? "in_progress" : DONE_TASK.has(t.status) ? "in_progress" : t.status, completion: m.length ? Math.round((100 * m.filter((x) => x.done).length) / m.length) : t.completion });
      if (allDone) toast("All milestones done. Project marked completed.");
      renderProjects(view);
    } catch (e) { cb.checked = !cb.checked; errToast(e); }
  }));
}

const find = (key) => allProjects().find((t) => tkey(t) === key);

function card(t) {
  const a = t.official;
  const st = taskStatus(t, S.today);
  const p = projectProgress(t);
  return `<article class="proj" style="${t.course_id ? cvar(t.course_id) : ""}">
    <div class="pm">${t.course_id ? coursePill(t.course_id) : ""}<span class="pill ${a ? "info" : ""}">${a ? `Official · ${esc(TYPE[a.type] || a.type)}` : "My project"}</span>${a?.is_group || t.members ? `<span class="pill">Group</span>` : ""}</div>
    <h3>${esc(t.title)}</h3>
    <div class="pm">${isISO(t.due_date) ? `<span class="${st === "overdue" ? "pill bad" : ""}">Due ${esc(fmtDate(t.due_date))} · ${esc(relDays(t.due_date, S.today))}</span>` : `<span>Deadline not set</span>`}<span>${esc(TASK_STATUS[st])}</span></div>
    ${a?.weight ? `<div class="small muted">${esc(a.weight)}</div>` : ""}
    ${t.members ? `<div class="small"><strong>Team:</strong> ${esc(t.members)}</div>` : ""}
    <div><div class="meter"><i style="width:${p}%"></i></div><div class="small muted" style="margin-top:4px">${p}% done${ms(t).length ? ` · ${ms(t).filter((x) => x.done).length} of ${ms(t).length} milestones` : ""}</div></div>
    ${ms(t).length ? `<ul class="ms">${ms(t).map((m, i) => `<li class="${m.done ? "done" : ""}"><label><input type="checkbox" data-ms="${esc(tkey(t))}" data-i="${i}" ${m.done ? "checked" : ""}><span>${esc(m.t)}</span></label></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">No milestones yet. Edit the project to add steps such as "Choose topic", "Draft", "Slides", "Rehearse".</p>`}
    <div class="foot"><button class="btn sm" data-edit="${esc(tkey(t))}">${a ? "Open" : "Edit"}</button><button class="btn sm" data-submit-proj="${esc(tkey(t))}" title="Make a Word, PDF or PowerPoint file and email it to the instructor">${icon.send} Prepare submission</button></div>
  </article>`;
}

export function openProject(t, after) {
  if (!t) return;
  const a = t.official;
  const isNew = !t.id && !a;
  openModal(a ? a.title : isNew ? "New project" : "Edit project", (body, foot, close) => {
    body.innerHTML = `
      ${a ? `<div class="stack" style="margin-bottom:14px"><div class="row">${coursePill(a.course_id)}<span class="pill info">Official</span><span class="small muted">${esc(a.weight || "")}</span></div>${a.description ? `<p style="margin:0">${esc(a.description)}</p>` : ""}<div class="small"><strong>Deadline:</strong> ${a.due_date ? fmtLong(a.due_date) : "Not stated in the official documents"}</div>${a.is_group ? `<div class="small"><strong>Group work</strong>${a.max_group_size ? `, up to ${a.max_group_size} people` : ""}</div>` : ""}${infoRequired(a.info_required)}</div>` : ""}
      <form class="form-grid">
        ${a ? "" : `<label class="field wide"><span>Project title</span><input class="input" name="title" required maxlength="200" value="${esc(t.title || "")}" placeholder="e.g. Research paper on competition law"></label>
        <label class="field"><span>Course</span><select class="input" name="course_id"><option value="">None</option>${S.courses.map((c) => `<option value="${c.id}" ${t.course_id === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Deadline</span><input class="input" type="date" name="due_date" value="${esc(t.due_date || "")}"></label>
        <label class="field wide"><span>Description</span><textarea class="input" name="description" style="min-height:60px">${esc(t.description || "")}</textarea></label>`}
        <label class="field wide"><span>Team members (optional)</span><input class="input" name="members" maxlength="500" value="${esc(t.members || "")}" placeholder="e.g. Sara, Omar, Lana"></label>
        <label class="field wide"><span>Milestones, one per line</span><textarea class="input" name="milestones" style="min-height:110px" placeholder="Choose topic&#10;Collect sources&#10;First draft&#10;Slides&#10;Rehearse">${esc(ms(t).map((m) => m.t).join("\n"))}</textarea></label>
        <label class="field"><span>Status</span><select class="input" name="status">${["not_started", "in_progress", "completed", "submitted"].map((s) => `<option value="${s}" ${t.status === s ? "selected" : ""}>${TASK_STATUS[s]}</option>`).join("")}</select></label>
        <label class="field wide"><span>Notes</span><textarea class="input" name="notes" style="min-height:60px">${esc(t.notes || "")}</textarea></label>
      </form>`;
    const form = $("form", body);
    foot.innerHTML = `${t.id && !a ? `<button class="btn danger" data-del style="margin-right:auto">Delete</button>` : ""}<button class="btn" data-cancel>Cancel</button>${a ? `<button class="btn" data-ai>Ask the assistant</button>` : ""}<button class="btn primary" data-save>${isNew ? "Add project" : "Save"}</button>`;
    foot.querySelector("[data-cancel]").onclick = close;
    foot.querySelector("[data-ai]")?.addEventListener("click", () => { close(); window.dispatchEvent(new CustomEvent("hub:ai", { detail: { course_id: a.course_id, mode: "", prompt: `Help me plan "${a.title}": suggest milestones, a timeline and what a strong submission looks like.` } })); });
    foot.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this project?"))) return;
      try { await deleteTask(t.id); close(); toast("Project deleted"); after && after(); } catch (e) { errToast(e); }
    });
    foot.querySelector("[data-save]").onclick = async () => {
      if (!form.reportValidity()) return;
      const f = readForm(form);
      const old = new Map(ms(t).map((m) => [m.t, m.done]));
      const milestones = String(f.milestones || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 50).map((x) => ({ t: x.slice(0, 200), done: !!old.get(x) }));
      delete f.milestones;
      try {
        await saveTask(t, { ...f, kind: "project", milestones, completion: milestones.length ? Math.round((100 * milestones.filter((m) => m.done).length) / milestones.length) : t.completion || 0 });
        toast(isNew ? "Project added" : "Saved"); close(); after && after();
      } catch (e) { errToast(e); }
    };
  });
}

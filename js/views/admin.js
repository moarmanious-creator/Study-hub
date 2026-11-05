// Staff areas: Students & access (admin), Academic data (admin + coordinator),
// Announcements, Cohort dashboard and exports. Personal student records are never shown here;
// cohort figures come from an aggregate database function.
import { esc, fmtDate, toast, errToast, openModal, confirmDialog, readForm, download, toCSV, md, $, $$ } from "../lib.js?v=202611051410";
import { S, sb, isAdmin, isStaff, callFunction, loadOfficial, course, lecturerName, extractText, chunk, exportOfficial } from "../store.js?v=202611051410";
import { DELIVERY } from "../metrics.js?v=202611051410";
import { coursePill, sessionLabel, chart, css, courseColor, infoRequired } from "../ui.js?v=202611051410";

const notAllowed = (view) => { view.innerHTML = `<div class="empty"><strong>Staff only.</strong>This page is for the programme admin and coordinators.</div>`; };

// ───────────── Students & access ─────────────
export async function renderStudents(view) {
  if (!isAdmin()) return notAllowed(view);
  view.innerHTML = `<div class="loading">Loading accounts…</div>`;
  let data;
  try { data = await callFunction("hub-admin", { action: "list" }); }
  catch (e) {
    view.innerHTML = `<div class="info-req"><strong>The account service isn't reachable.</strong> Deploy the <code>hub-admin</code> function (see the deployment guide). Error: ${esc(e.message)}</div>`;
    return;
  }
  const roleSel = (a) => `<select class="input" data-role="${a.id}" style="width:auto;padding:4px 8px" ${a.id === S.user.id ? "disabled" : ""} aria-label="Role for ${esc(a.email)}">${["student", "coordinator", "admin"].map((r) => `<option ${a.role === r ? "selected" : ""} value="${r}">${r[0].toUpperCase() + r.slice(1)}</option>`).join("")}</select>`;
  view.innerHTML = `
    <section class="section"><div class="section-head"><div><h2>Add students</h2><p>Paste all the emails at once: one per line, or copied straight from an email's To line. <strong>Create accounts now</strong> makes every account immediately with a temporary password and sends no emails; each person must choose their own password the first time they sign in. <strong>Send invitation emails</strong> only suits a few people at a time, because Supabase's free email sender allows only a few emails per hour.</p></div></div>
      <div class="sheet"><form class="form-grid" data-invite>
        <label class="field wide"><span>Emails</span><textarea class="input" name="emails" required placeholder="student1@example.com&#10;student2@gmail.com"></textarea></label>
        <label class="field"><span>Role</span><select class="input" name="role"><option value="student">Student</option><option value="coordinator">Academic coordinator</option><option value="admin">Admin</option></select></label>
        <div class="field" style="align-self:end"><div class="row"><button class="btn primary" type="submit" data-how="create">Create accounts now</button><button class="btn" type="submit" data-how="email">Send invitation emails</button></div></div>
      </form><div data-results class="small" style="margin-top:10px"></div></div></section>
    <section class="section"><div class="section-head"><h2>Accounts (${data.accounts.length})</h2></div>
      <div class="sheet flush"><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
      ${data.accounts.map((a) => `<tr><td>${esc(a.full_name || "—")}</td><td class="small">${esc(a.email)}</td><td>${roleSel(a)}</td>
        <td>${a.active ? `<span class="pill ok">Active</span>` : `<span class="pill bad">Deactivated</span>`}${a.confirmed === false ? ` <span class="pill warn">Email not confirmed</span>` : ""}</td>
        <td class="small muted">${a.last_sign_in_at ? fmtDate(a.last_sign_in_at.slice(0, 10)) : "Never"}</td>
        <td><div class="row">${a.id === S.user.id ? `<span class="muted small">You</span>` : `<button class="btn sm" data-active="${a.id}" data-to="${!a.active}">${a.active ? "Deactivate" : "Reactivate"}</button>`}<button class="btn sm ghost" data-reset="${esc(a.email)}">Send password reset</button></div></td></tr>`).join("")}
      </tbody></table></div></div></section>
    ${data.pending.length ? `<section class="section"><div class="section-head"><h2>Invited, not signed up yet (${data.pending.length})</h2></div><div class="sheet flush"><table class="data"><tbody>${data.pending.map((p) => `<tr><td>${esc(p.email)}</td><td class="small">${esc(p.role)}</td><td class="small muted">Added ${fmtDate(p.added_at.slice(0, 10))}</td><td><div class="row"><button class="btn sm" data-reinvite="${esc(p.email)}" data-r="${esc(p.role)}">Resend invitation</button><button class="btn sm ghost danger" data-unlist="${esc(p.email)}">Remove</button></div></td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <p class="muted small">Deactivating an account blocks sign-in and hides all programme data from that person, but keeps their records. To delete an account and its private records permanently, remove the user in Supabase under Authentication → Users.</p>`;

  $("[data-invite]", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const how = e.submitter?.dataset.how || "create";
    const f = readForm(e.target);
    const emails = parseEmails(f.emails);
    if (!emails.length) return toast("No email addresses found in the box", "err");
    const btns = $$("button[type=submit]", e.target); btns.forEach((b) => (b.disabled = true));
    const label = e.submitter?.textContent; if (e.submitter) e.submitter.textContent = how === "create" ? `Creating ${emails.length}…` : "Sending…";
    try {
      if (how === "create") {
        const r = await callFunction("hub-admin", { action: "create_accounts", emails, role: f.role });
        showCredentials(r.results, view);
      } else {
        const r = await callFunction("hub-admin", { action: "invite", emails, role: f.role });
        $("[data-results]", view).innerHTML = r.results.map((x) => `<div>${x.ok ? "✓" : "✗"} ${esc(x.email)} — ${esc(x.message)}</div>`).join("");
        toast("Invitations processed");
        setTimeout(() => renderStudents(view), 1800);
      }
    } catch (er) { errToast(er); btns.forEach((b) => (b.disabled = false)); if (e.submitter) e.submitter.textContent = label; }
  });
  $$("[data-active]", view).forEach((b) => b.addEventListener("click", async () => {
    const to = b.dataset.to === "true";
    if (!to && !(await confirmDialog("Deactivate this account? They will be signed out and lose access until reactivated.", { ok: "Deactivate" }))) return;
    try { await callFunction("hub-admin", { action: "set_active", user_id: b.dataset.active, active: to }); toast(to ? "Reactivated" : "Deactivated"); renderStudents(view); } catch (e) { errToast(e); }
  }));
  $$("[data-role]", view).forEach((s) => s.addEventListener("change", async () => {
    try { await callFunction("hub-admin", { action: "set_role", user_id: s.dataset.role, role: s.value }); toast("Role updated"); } catch (e) { errToast(e); renderStudents(view); }
  }));
  $$("[data-reset]", view).forEach((b) => b.addEventListener("click", async () => {
    try { await callFunction("hub-admin", { action: "reset_password", email: b.dataset.reset }); toast("Password reset email sent"); } catch (e) { errToast(e); }
  }));
  $$("[data-reinvite]", view).forEach((b) => b.addEventListener("click", async () => {
    try { const r = await callFunction("hub-admin", { action: "invite", emails: [b.dataset.reinvite], role: b.dataset.r }); toast(r.results[0]?.message || "Done"); } catch (e) { errToast(e); }
  }));
  $$("[data-unlist]", view).forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog(`Remove ${b.dataset.unlist} from the programme list?`, { ok: "Remove" }))) return;
    try { await callFunction("hub-admin", { action: "remove_pending", email: b.dataset.unlist }); renderStudents(view); } catch (e) { errToast(e); }
  }));
}

// ───────────── Academic data ─────────────
const ADM = { tab: "sessions", course: null };
export function renderAcademicData(view) {
  if (!isStaff()) return notAllowed(view);
  ADM.course = ADM.course || S.courses[0]?.id;
  const allReq = [
    ...S.courses.flatMap((c) => (c.info_required || []).map((r) => ({ c: c.id, where: "Course", r }))),
    ...S.sessions.flatMap((s) => (s.info_required || []).map((r) => ({ c: s.course_id, where: sessionLabel(s), r }))),
    ...S.assessments.flatMap((a) => (a.info_required || []).map((r) => ({ c: a.course_id, where: a.title, r }))),
  ];
  view.innerHTML = `
    <div class="tabs" role="tablist">${[["sessions", "Lectures & dates"], ["assessments", "Assessments"], ["courses", "Courses"], ["import", "Import & source documents"], ["missing", `Information required (${allReq.length})`], ["log", "Change log"]]
      .map(([k, l]) => `<button class="tab" role="tab" aria-selected="${ADM.tab === k}" data-tab="${k}">${l}</button>`).join("")}</div>
    ${["sessions", "assessments", "courses"].includes(ADM.tab) ? `<div class="row" style="margin-bottom:14px"><select class="input" data-course style="width:auto" aria-label="Course">${S.courses.map((c) => `<option value="${c.id}" ${ADM.course === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>${ADM.tab !== "courses" ? `<button class="btn primary" data-add>Add ${ADM.tab === "sessions" ? "session" : "assessment"}</button>` : ""}</div>` : ""}
    <div id="admBody"></div>`;
  $$(".tab", view).forEach((b) => b.addEventListener("click", () => { ADM.tab = b.dataset.tab; renderAcademicData(view); }));
  $("[data-course]", view)?.addEventListener("change", (e) => { ADM.course = e.target.value; renderAcademicData(view); });
  const body = $("#admBody", view);
  const again = async () => { await loadOfficial(); renderAcademicData(view); };
  $("[data-add]", view)?.addEventListener("click", () => ADM.tab === "sessions" ? editSession({ course_id: ADM.course, kind: "lecture", delivery: "tbc", seq: Math.max(0, ...S.sessions.filter((s) => s.course_id === ADM.course).map((s) => s.seq)) + 1 }, again) : editAssessment({ course_id: ADM.course, type: "assignment" }, again));

  if (ADM.tab === "sessions") {
    const list = S.sessions.filter((s) => s.course_id === ADM.course).sort((a, b) => (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999") || a.seq - b.seq);
    body.innerHTML = `<div class="sheet flush"><div class="table-wrap"><table class="data"><thead><tr><th>Session</th><th>Date</th><th>Time</th><th>Format</th><th>Lecturer</th><th>Flags</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr${s.cancelled ? ' style="opacity:.55"' : ""}><td><strong>${esc(sessionLabel(s))}</strong><div class="small">${esc(s.title)}</div></td><td class="num">${s.scheduled_date ? fmtDate(s.scheduled_date) : "—"}</td><td class="small">${s.start_time ? s.start_time.slice(0, 5) + (s.end_time ? "–" + s.end_time.slice(0, 5) : "") : "—"}</td><td class="small">${esc(DELIVERY[s.delivery])}</td><td class="small">${esc(lecturerName(s.lecturer_id) || "—")}</td><td>${s.cancelled ? `<span class="pill bad">Cancelled</span>` : ""}${s.info_required?.length ? `<span class="pill warn">${s.info_required.length} to confirm</span>` : ""}</td><td><button class="btn sm" data-edit="${s.id}">Edit</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
    $$("[data-edit]", body).forEach((b) => b.addEventListener("click", () => editSession(S.sessions.find((s) => s.id === b.dataset.edit), again)));
  } else if (ADM.tab === "assessments") {
    const list = S.assessments.filter((a) => a.course_id === ADM.course);
    body.innerHTML = `<div class="sheet flush"><table class="data"><thead><tr><th>Assessment</th><th>Type</th><th>Weight</th><th>Deadline</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td><strong>${esc(a.title)}</strong>${a.info_required?.length ? ` <span class="pill warn">${a.info_required.length} to confirm</span>` : ""}</td><td class="small">${esc(a.type.replace("_", " "))}</td><td class="small">${esc(a.weight || "—")}</td><td>${a.due_date ? fmtDate(a.due_date) : "—"}</td><td><button class="btn sm" data-edit="${a.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`;
    $$("[data-edit]", body).forEach((b) => b.addEventListener("click", () => editAssessment(S.assessments.find((a) => a.id === b.dataset.edit), again)));
  } else if (ADM.tab === "courses") {
    editCourseInline(body, course(ADM.course), again);
  } else if (ADM.tab === "import") {
    importTab(body, again);
  } else if (ADM.tab === "missing") {
    body.innerHTML = `<p class="muted small">Everything the official documents leave open or contradict. Students see these flags too, so they don't rely on unconfirmed details. Remove a flag by editing the item once the programme confirms it.</p>
      <div class="sheet flush"><table class="data"><tbody>${allReq.map((x) => `<tr><td>${coursePill(x.c)}</td><td class="small"><strong>${esc(x.where)}</strong></td><td class="small">${esc(x.r)}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (ADM.tab === "log") {
    body.innerHTML = `<div class="loading">Loading…</div>`;
    sb.from("change_log").select("id, table_name, record_id, action, changed_by, changed_at, new_data, old_data").order("id", { ascending: false }).limit(100).then(({ data, error }) => {
      if (error) return (body.innerHTML = `<div class="empty">${esc(error.message)}</div>`);
      body.innerHTML = `<div class="sheet flush"><div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>What</th><th>Change</th></tr></thead><tbody>${(data || []).map((r) => {
        const n = r.new_data || {}, o = r.old_data || {};
        const changed = r.action === "UPDATE" ? Object.keys(n).filter((k) => !["updated_at"].includes(k) && JSON.stringify(n[k]) !== JSON.stringify(o[k])) : [];
        return `<tr><td class="small num">${new Date(r.changed_at).toLocaleString("en-GB", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td class="small">${esc(r.action.toLowerCase())} ${esc(r.table_name)}<div class="muted">${esc(n.title || n.name || o.title || o.name || r.record_id)}</div></td><td class="small">${changed.length ? changed.map((k) => `<div><strong>${esc(k)}</strong>: ${esc(short(o[k]))} → ${esc(short(n[k]))}</div>`).join("") : r.action === "UPDATE" ? "<span class='muted'>No field changes</span>" : ""}</td></tr>`;
      }).join("")}</tbody></table></div></div>`;
    });
  }
}
const short = (v) => { const s = v == null ? "∅" : typeof v === "string" ? v : JSON.stringify(v); return s.length > 80 ? s.slice(0, 77) + "…" : s; };
const lines = (v) => (v || "").split("\n").map((x) => x.trim()).filter(Boolean);

function editSession(s, after) {
  const isNew = !s.id;
  openModal(isNew ? "Add session" : `Edit ${sessionLabel(s)}`, (body, foot, close) => {
    body.innerHTML = `<form class="form-grid">
      <label class="field"><span>Kind</span><select class="input" name="kind">${["lecture", "review", "tutorial", "presentation"].map((k) => `<option ${s.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label class="field"><span>Number</span><input class="input" type="number" name="seq" required value="${s.seq ?? ""}"></label>
      <label class="field wide"><span>Label (as written in the official document)</span><input class="input" name="label" value="${esc(s.label || "")}" placeholder="e.g. Lecture 4"></label>
      <label class="field wide"><span>Title</span><input class="input" name="title" required value="${esc(s.title || "")}"></label>
      <label class="field"><span>Date</span><input class="input" type="date" name="scheduled_date" value="${esc(s.scheduled_date || "")}"></label>
      <label class="field"><span>Format</span><select class="input" name="delivery">${Object.entries(DELIVERY).map(([k, l]) => `<option value="${k}" ${s.delivery === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field"><span>Start time</span><input class="input" type="time" name="start_time" value="${esc(s.start_time?.slice(0, 5) || "")}"></label>
      <label class="field"><span>End time</span><input class="input" type="time" name="end_time" value="${esc(s.end_time?.slice(0, 5) || "")}"></label>
      <label class="field"><span>Location</span><input class="input" name="location" value="${esc(s.location || "")}"></label>
      <label class="field"><span>Lecturer</span><select class="input" name="lecturer_id"><option value="">Not stated</option>${S.lecturers.map((l) => `<option value="${l.id}" ${s.lecturer_id === l.id ? "selected" : ""}>${esc(lecturerName(l.id))}</option>`).join("")}</select></label>
      <label class="field wide"><span>Topics (one per line)</span><textarea class="input" name="topics">${esc((s.topics || []).join("\n"))}</textarea></label>
      <label class="field wide"><span>Readings</span><input class="input" name="readings" value="${esc(s.readings || "")}"></label>
      <label class="field wide"><span>Recording link</span><input class="input" type="url" name="recording_url" value="${esc(s.recording_url || "")}"></label>
      <label class="field wide"><span>Information required (one per line — clear once confirmed)</span><textarea class="input" name="info_required" style="min-height:60px">${esc((s.info_required || []).join("\n"))}</textarea></label>
      <label class="field"><span>Source document</span><select class="input" name="source_ref"><option value="">None</option>${S.sources.map((d) => `<option value="${d.id}" ${s.source_ref === d.id ? "selected" : ""}>${esc(d.id)}</option>`).join("")}</select></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="cancelled" ${s.cancelled ? "checked" : ""}> Cancelled</label>
    </form>`;
    const form = $("form", body);
    foot.innerHTML = `${isNew ? "" : `<button class="btn danger" data-del style="margin-right:auto">Delete</button>`}<button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Save for all students</button>`;
    foot.querySelector("[data-c]").onclick = close;
    foot.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this session for everyone? Students' attendance and progress for it will also be deleted. Consider marking it Cancelled instead."))) return;
      const { error } = await sb.from("sessions").delete().eq("id", s.id);
      if (error) return errToast(error);
      close(); toast("Session deleted"); after();
    });
    foot.querySelector("[data-s]").onclick = async () => {
      if (!form.reportValidity()) return;
      const f = readForm(form);
      const row = { course_id: s.course_id, kind: f.kind, seq: f.seq, label: f.label, title: f.title, scheduled_date: f.scheduled_date, delivery: f.delivery,
        start_time: f.start_time, end_time: f.end_time, location: f.location, lecturer_id: f.lecturer_id, topics: lines(f.topics), readings: f.readings,
        recording_url: f.recording_url, info_required: lines(f.info_required), source_ref: f.source_ref, cancelled: !!f.cancelled };
      const { error } = isNew ? await sb.from("sessions").insert(row) : await sb.from("sessions").update(row).eq("id", s.id);
      if (error) return errToast(error);
      close(); toast("Saved. Every student sees the change."); after();
    };
  }, { wide: true });
}

function editAssessment(a, after) {
  const isNew = !a.id;
  openModal(isNew ? "Add assessment" : `Edit ${a.title}`, (body, foot, close) => {
    body.innerHTML = `<form class="form-grid">
      <label class="field wide"><span>Title</span><input class="input" name="title" required value="${esc(a.title || "")}"></label>
      <label class="field"><span>Type</span><select class="input" name="type">${["assignment", "presentation", "exam", "reflection_paper", "research_paper", "quiz", "participation"].map((k) => `<option value="${k}" ${a.type === k ? "selected" : ""}>${k.replace("_", " ")}</option>`).join("")}</select></label>
      <label class="field"><span>Weight (as stated)</span><input class="input" name="weight" value="${esc(a.weight || "")}"></label>
      <label class="field"><span>Assigned on</span><input class="input" type="date" name="assigned_date" value="${esc(a.assigned_date || "")}"></label>
      <label class="field"><span>Deadline or exam date</span><input class="input" type="date" name="due_date" value="${esc(a.due_date || "")}"></label>
      <label class="check"><input type="checkbox" name="is_group" ${a.is_group ? "checked" : ""}> Group work</label>
      <label class="field"><span>Max group size</span><input class="input" type="number" name="max_group_size" value="${a.max_group_size ?? ""}"></label>
      <label class="field wide"><span>Description</span><textarea class="input" name="description">${esc(a.description || "")}</textarea></label>
      <label class="field wide"><span>Information required (one per line)</span><textarea class="input" name="info_required" style="min-height:60px">${esc((a.info_required || []).join("\n"))}</textarea></label>
      <label class="field"><span>Source document</span><select class="input" name="source_ref"><option value="">None</option>${S.sources.map((d) => `<option value="${d.id}" ${a.source_ref === d.id ? "selected" : ""}>${esc(d.id)}</option>`).join("")}</select></label>
    </form>`;
    const form = $("form", body);
    foot.innerHTML = `${isNew ? "" : `<button class="btn danger" data-del style="margin-right:auto">Delete</button>`}<button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Save for all students</button>`;
    foot.querySelector("[data-c]").onclick = close;
    foot.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this assessment for everyone? Students' tracking for it will also be deleted."))) return;
      const { error } = await sb.from("assessments").delete().eq("id", a.id); if (error) return errToast(error);
      close(); after();
    });
    foot.querySelector("[data-s]").onclick = async () => {
      if (!form.reportValidity()) return;
      const f = readForm(form);
      const row = { course_id: a.course_id, title: f.title, type: f.type, weight: f.weight, assigned_date: f.assigned_date, due_date: f.due_date, is_group: !!f.is_group,
        max_group_size: f.max_group_size, description: f.description, info_required: lines(f.info_required), source_ref: f.source_ref };
      const { error } = isNew ? await sb.from("assessments").insert(row) : await sb.from("assessments").update(row).eq("id", a.id);
      if (error) return errToast(error);
      close(); toast("Saved"); after();
    };
  }, { wide: true });
}

function editCourseInline(body, c, after) {
  body.innerHTML = `<div class="sheet"><form class="form-grid">
    <label class="field wide"><span>Course name</span><input class="input" name="name" required value="${esc(c.name)}"></label>
    <label class="field"><span>Short name</span><input class="input" name="short_name" value="${esc(c.short_name || "")}"></label>
    <label class="field"><span>Term</span><input class="input" name="term" value="${esc(c.term || "")}"></label>
    <label class="field"><span>Colour</span><input class="input" type="color" name="color" value="${esc(c.color)}" style="height:40px"></label>
    <label class="field wide"><span>Description</span><textarea class="input" name="description">${esc(c.description || "")}</textarea></label>
    <label class="field wide"><span>Learning objectives (one per line)</span><textarea class="input" name="objectives">${esc((c.objectives || []).join("\n"))}</textarea></label>
    <label class="field wide"><span>Teaching format</span><textarea class="input" name="teaching_format" style="min-height:60px">${esc(c.teaching_format || "")}</textarea></label>
    <label class="field wide"><span>Assessment requirements</span><textarea class="input" name="assessment_summary" style="min-height:60px">${esc(c.assessment_summary || "")}</textarea></label>
    <label class="field wide"><span>Examination information</span><textarea class="input" name="exam_info" style="min-height:60px">${esc(c.exam_info || "")}</textarea></label>
    <label class="field wide"><span>Core readings (one per line)</span><textarea class="input" name="core_readings">${esc((c.core_readings || []).join("\n"))}</textarea></label>
    <label class="field wide"><span>Information required (one per line)</span><textarea class="input" name="info_required">${esc((c.info_required || []).join("\n"))}</textarea></label>
    <div class="wide"><button class="btn primary" type="submit">Save course</button></div></form></div>`;
  $("form", body).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const { error } = await sb.from("courses").update({ name: f.name, short_name: f.short_name, term: f.term, color: f.color, description: f.description, objectives: lines(f.objectives),
      teaching_format: f.teaching_format, assessment_summary: f.assessment_summary, exam_info: f.exam_info, core_readings: lines(f.core_readings), info_required: lines(f.info_required) }).eq("id", c.id);
    if (error) return errToast(error);
    toast("Course saved"); after();
  });
}

function importTab(body, after) {
  body.innerHTML = `<div class="grid two">
    <div class="sheet"><h3>Load or update the academic structure</h3>
      <p class="small">Import a structured file in the Hub course-data format. Existing courses, sessions and assessments are matched and updated; student progress is kept. Every change is written to the change log.</p>
      <div class="row" style="margin:10px 0"><button class="btn primary" data-bundled>Load the 2026/27 first-semester data</button><label class="btn">Choose a JSON file<input type="file" accept=".json,application/json" hidden data-json></label><button class="btn ghost" type="button" data-dljson>Download the current file</button></div>
      <p class="small muted">The bundled file was extracted from the four syllabi and the Microeconomics timetable, with every gap flagged as Information required. To change the structure in bulk, download it, edit it, and import it again.</p>
      <div data-out class="small"></div></div>
    <div class="sheet"><h3>Source documents</h3>
      <p class="small">Upload the official PDFs (syllabi, timetables, programme emails). They are stored for staff and students to consult, and their text becomes searchable for the AI assistant.</p>
      <ul class="plist">${S.sources.map((d) => `<li><span class="bar"></span><div><div class="t">${esc(d.title)}</div><div class="d">${esc(d.id)}${d.file_name ? " · " + esc(d.file_name) : ""} · ${d.storage_path ? "file uploaded" : `<span style="color:var(--brass)">file not uploaded yet</span>`}</div></div><label class="btn sm">Upload PDF<input type="file" hidden accept=".pdf,.docx,.txt" data-src="${esc(d.id)}"></label></li>`).join("")}</ul>
      <button class="btn sm" data-newsrc style="margin-top:10px">Add another source document</button></div></div>`;
  const out = $("[data-out]", body);
  const run = async (json) => {
    try {
      const dry = await sb.rpc("import_official", { data: json, dry_run: true });
      let preview = null;
      if (dry.error && dry.error.message === "DRY_RUN") preview = JSON.parse(dry.error.details || "{}");
      else if (dry.error) throw dry.error;
      const ok = await confirmDialog(`This will create or update ${preview?.courses ?? "?"} courses, ${preview?.sessions ?? "?"} sessions, ${preview?.assessments ?? "?"} assessments and ${preview?.materials ?? "?"} materials for every student.${preview?.warnings?.length ? " Warnings: " + preview.warnings.join("; ") : ""}`, { ok: "Import", danger: false });
      if (!ok) return;
      const { data, error } = await sb.rpc("import_official", { data: json });
      if (error) throw error;
      out.innerHTML = `<div class="info-req" style="border-color:var(--sage);background:var(--sage-2)"><strong style="color:var(--sage)">Imported.</strong> ${esc(JSON.stringify(data))}</div>`;
      toast("Academic data imported"); after();
    } catch (e) { errToast(e); out.textContent = e.message; }
  };
  $("[data-bundled]", body).addEventListener("click", () => {
    if (window.__HUB_OFFICIAL_DATA) return run(window.__HUB_OFFICIAL_DATA);
    if (S.courses.length) return toast(`The 2026/27 data is already loaded (${S.courses.length} courses, ${S.sessions.length} sessions). To change it, use Download current file, edit it, then Choose a JSON file.`);
    toast("The bundled data isn't included in this copy. Import a JSON file instead.", "err");
  });
  $("[data-dljson]", body).addEventListener("click", async () => {
    try { download(`student-hub-course-data-${S.today}.json`, JSON.stringify(exportOfficial(), null, 2), "application/json"); toast("Downloaded the current academic data"); } catch (e) { errToast(e); }
  });
  $("[data-json]", body).addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    let json; try { json = JSON.parse(await f.text()); } catch { return toast("That file isn't valid JSON", "err"); }
    run(json);
  });
  $$("[data-src]", body).forEach((inp) => inp.addEventListener("change", async () => {
    const file = inp.files[0]; const id = inp.dataset.src;
    try {
      const path = `sources/${id}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await sb.storage.from("official").upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
      if (up.error) throw up.error;
      const text = await extractText(file);
      const { error } = await sb.from("source_documents").update({ storage_path: path, file_name: file.name, extracted_text: text ? text.slice(0, 500000) : null, imported_by: S.user.id, imported_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await sb.from("doc_chunks").delete().eq("source_doc_id", id);
      if (text) {
        const rows = chunk(text).map((c, i) => ({ source_doc_id: id, title: S.sources.find((d) => d.id === id)?.title || id, chunk_index: i, content: c }));
        for (let i = 0; i < rows.length; i += 100) { const r = await sb.from("doc_chunks").insert(rows.slice(i, i + 100)); if (r.error) throw r.error; }
      }
      toast(text ? "Uploaded and made searchable" : "Uploaded (no text could be read)"); after();
    } catch (e) { errToast(e); }
  }));
  $("[data-newsrc]", body).addEventListener("click", () => openModal("Add source document", (b, foot, close) => {
    b.innerHTML = `<form class="form-grid"><label class="field"><span>Reference ID</span><input class="input" name="id" required pattern="[A-Z0-9\\-]+" placeholder="SRC-EMAIL-1103"></label><label class="field"><span>File name</span><input class="input" name="file_name"></label><label class="field wide"><span>Title</span><input class="input" name="title" required placeholder="Programme email, 3 Nov 2026: exam dates"></label></form>`;
    foot.innerHTML = `<button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Add</button>`;
    foot.querySelector("[data-c]").onclick = close;
    foot.querySelector("[data-s]").onclick = async () => {
      const form = $("form", b); if (!form.reportValidity()) return;
      const { error } = await sb.from("source_documents").insert(readForm(form)); if (error) return errToast(error);
      close(); after();
    };
  }));
}

// ───────────── Announcements ─────────────
export function renderAnnouncements(view) {
  const staff = isStaff();
  view.innerHTML = `${staff ? `<div class="sheet section"><h3>New announcement</h3><form class="form-grid" style="margin-top:10px" data-ann>
      <label class="field wide"><span>Title</span><input class="input" name="title" required></label>
      <label class="field"><span>Course</span><select class="input" name="course_id"><option value="">Whole programme</option>${S.courses.map((c) => `<option value="${c.id}">${esc(c.short_name || c.name)}</option>`).join("")}</select></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="pinned"> Pin to everyone's dashboard</label>
      <label class="field wide"><span>Message (Markdown works)</span><textarea class="input" name="body" required></textarea></label>
      <div class="wide"><button class="btn primary">Publish to all students</button></div></form></div>` : ""}
    <div class="stack">${S.announcements.map((a) => `<div class="sheet"><div class="spread"><h3>${esc(a.title)}</h3><div class="row">${a.course_id ? coursePill(a.course_id) : `<span class="pill info">Programme</span>`}${a.pinned ? `<span class="pill warn">Pinned</span>` : ""}${staff ? `<button class="btn sm ghost danger" data-del="${a.id}">Delete</button>` : ""}</div></div><div class="small muted">${fmtDate(a.created_at.slice(0, 10))}</div><div style="margin-top:8px">${md(a.body)}</div></div>`).join("") || `<div class="empty">No announcements yet.</div>`}</div>`;
  $("[data-ann]", view)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const { error } = await sb.from("announcements").insert({ ...f, pinned: !!f.pinned, created_by: S.user.id });
    if (error) return errToast(error);
    await loadOfficial(); toast("Published"); renderAnnouncements(view);
  });
  $$("[data-del]", view).forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmDialog("Delete this announcement?"))) return;
    const { error } = await sb.from("announcements").delete().eq("id", b.dataset.del); if (error) return errToast(error);
    await loadOfficial(); renderAnnouncements(view);
  }));
}

// ───────────── Cohort dashboard ─────────────
export async function renderCohort(view) {
  if (!isStaff()) return notAllowed(view);
  view.innerHTML = `<div class="loading">Calculating cohort figures…</div>`;
  const { data, error } = await sb.rpc("cohort_overview");
  if (error) { view.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  const students = data.students || [];
  const avg = (k) => { const v = students.filter((s) => s.active && s[k] != null).map((s) => s[k]); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const follow = students.filter((s) => s.active && ((s.attendance_rate ?? 100) < 50 || (s.study_rate ?? 100) < 25 || s.tasks_overdue > 0 || !s.last_seen_at));
  const showNames = isAdmin();
  view.innerHTML = `
    <p class="muted small" style="margin-bottom:14px">Aggregates only. Individual notes, files, checklists and comments stay private to each student and are never shown here.</p>
    <div class="figs section">${[["Registered students", data.students_total], ["Active", data.students_active], ["Sessions held", `${data.sessions_held}`], ["Average attendance", avg("attendance_rate") == null ? "—" : avg("attendance_rate") + "%"], ["Average study completion", avg("study_rate") == null ? "—" : avg("study_rate") + "%"], ["Need follow-up", follow.length]].map(([l, v]) => `<div class="fig"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
    <div class="grid two section">
      <div class="sheet"><h3>By course (cohort average)</h3><div class="chart-box"><canvas id="coCourse" role="img" aria-label="Average attendance and study completion by course"></canvas></div></div>
      <div class="sheet"><h3>Upcoming official deadlines</h3>${(data.upcoming || []).length ? `<ul class="plist">${data.upcoming.map((u) => `<li><span class="bar"></span><div><div class="t">${esc(u.title)}</div><div class="d">${fmtDate(u.date)} · ${esc(u.type)}</div></div>${coursePill(u.course_id)}</li>`).join("")}</ul>` : `<p class="muted">No dated deadlines in the official data yet.</p>`}</div>
    </div>
    <section class="section"><div class="section-head"><div><h2>Students requiring follow-up</h2><p>Attendance under 50%, study completion under 25%, an overdue task, or never signed in.</p></div><div class="row"><button class="btn sm" data-csv>Export cohort report (CSV)</button><button class="btn sm" data-sched>Export official schedule (CSV)</button></div></div>
      <div class="sheet flush"><div class="table-wrap"><table class="data"><thead><tr><th>Student</th><th>Attendance</th><th>Study completion</th><th>Assignments done</th><th>Overdue tasks</th><th>Last seen</th></tr></thead><tbody>
      ${(showNames ? follow : follow.map((s, i) => ({ ...s, name: `Student ${i + 1}`, email: "" }))).map((s) => `<tr><td>${esc(s.name)}<div class="small muted">${esc(s.email)}</div></td><td class="num">${s.attendance_rate ?? "—"}${s.attendance_rate != null ? "%" : ""}</td><td class="num">${s.study_rate ?? "—"}${s.study_rate != null ? "%" : ""}</td><td class="num">${s.tasks_done}</td><td class="num">${s.tasks_overdue}</td><td class="small muted">${s.last_seen_at ? fmtDate(s.last_seen_at.slice(0, 10)) : "Never"}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">No one needs follow-up right now.</div></td></tr>`}
      </tbody></table></div></div>${showNames ? "" : `<p class="muted small">Coordinators see anonymised rows. Names are visible to admins only.</p>`}</section>`;
  chart("coCourse", { type: "bar", data: { labels: (data.courses || []).map((c) => c.short_name), datasets: [
    { label: "Attendance", data: data.courses.map((c) => c.attendance_rate ?? 0), backgroundColor: css("--ink-3"), borderRadius: 3 },
    { label: "Study completion", data: data.courses.map((c) => c.study_rate ?? 0), backgroundColor: data.courses.map((c) => courseColor(c.course_id)), borderRadius: 3 }] },
    options: { scales: { y: { max: 100, ticks: { callback: (v) => v + "%" } } } } });
  $("[data-csv]", view).addEventListener("click", () => download(`student-hub-cohort-${S.today}.csv`, toCSV(students.map((s, i) => ({ student: showNames ? s.name : `Student ${i + 1}`, email: showNames ? s.email : "", active: s.active, attendance_rate: s.attendance_rate, study_rate: s.study_rate, tasks_done: s.tasks_done, tasks_overdue: s.tasks_overdue, last_seen: s.last_seen_at }))), "text/csv"));
  $("[data-sched]", view).addEventListener("click", () => download(`student-hub-schedule-${S.today}.csv`, toCSV(S.sessions.map((s) => ({ course: course(s.course_id)?.name, session: sessionLabel(s), title: s.title, date: s.scheduled_date, start: s.start_time, end: s.end_time, format: DELIVERY[s.delivery], location: s.location, lecturer: lecturerName(s.lecturer_id), source: s.source_ref, information_required: s.info_required }))), "text/csv"));
  void infoRequired;
}

// Pulls every address out of pasted text, e.g. a whole "To:" line copied from an email.
export function parseEmails(text) {
  const found = String(text || "").toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
  return [...new Set(found)];
}

// Shows the temporary passwords once. They are not stored anywhere, so the admin copies or downloads them now.
function showCredentials(results, view) {
  const made = results.filter((x) => x.password);
  const rows = results.map((x) => `<li style="padding:10px 0;border-bottom:1px solid var(--rule);overflow-wrap:anywhere"><div class="small">${esc(x.email)}</div>${x.password ? `<div style="margin-top:2px"><code style="font-size:15px;user-select:all">${esc(x.password)}</code></div>` : `<div class="small" ${x.ok ? 'style="color:var(--ink-3)"' : 'style="color:var(--brick)"'}>${esc(x.message)}</div>`}</li>`).join("");
  const site = location.origin + location.pathname;
  const text = made.map((x) => `${x.email}\t${x.password}`).join("\n");
  openModal(`Accounts created: ${made.length} of ${results.length}`, (body, _foot, close) => {
    body.innerHTML = `
      <div class="info-req"><strong>Copy or download these passwords now.</strong> They are shown only once and are not saved anywhere. Each person signs in at ${esc(site)} with their email and this temporary password, then must choose their own password.</div>
      <div class="row" style="margin:12px 0">${made.length ? `<button class="btn primary" data-copy>Copy all</button><button class="btn" data-csv>Download CSV</button>` : ""}<button class="btn ghost" data-done>Done</button></div>
      <ul style="list-style:none;margin:0;padding:0">${rows}</ul>`;
    $("[data-copy]", body)?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(`Sign in at ${site}\n\n${text}`); toast("Copied"); } catch { toast("Copy didn't work here; use Download CSV", "err"); }
    });
    $("[data-csv]", body)?.addEventListener("click", () => download(`student-hub-accounts-${S.today}.csv`, toCSV(made.map((x) => ({ email: x.email, temporary_password: x.password, sign_in_at: site }))), "text/csv"));
    $("[data-done]", body).addEventListener("click", () => { close(); renderStudents(view); });
  }, { wide: true });
}

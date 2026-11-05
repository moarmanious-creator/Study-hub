// Personal document repository (private) and official course materials (shared), plus saved notes.
import { esc, fmtDate, fmtBytes, openModal, toast, errToast, confirmDialog, readForm, md, $, $$, safeUrl } from "../lib.js?v=202611051508";
import { S, isStaff, uploadAttachment, addLink, updateAttachment, deleteAttachment, signedUrl, uploadOfficialMaterial, deleteOfficialMaterial, saveNote, deleteNote, session, course } from "../store.js?v=202611051508";
import { coursePill, sessionLabel, sessionName } from "../ui.js?v=202611051508";

const UI = { tab: "mine", q: "", course: "all", folder: "all" };
const EXT_COLOR = { PDF: "#a8432f", DOC: "#2f5d8a", DOCX: "#2f5d8a", PPT: "#a3561d", PPTX: "#a3561d", XLS: "#3f7a52", XLSX: "#3f7a52", PNG: "#7a4e9a", JPG: "#7a4e9a", JPEG: "#7a4e9a", LINK: "#1f5c7a" };
const ext = (a) => (a.kind === "link" ? "LINK" : (a.name.split(".").pop() || "").toUpperCase().slice(0, 4));

export function renderDocuments(view) {
  view.innerHTML = `
    <div class="tabs" role="tablist">${[["mine", "My files"], ["official", "Official materials"], ["notes", "My notes"]].map(([k, l]) => `<button class="tab" role="tab" aria-selected="${UI.tab === k}" data-tab="${k}">${l}</button>`).join("")}</div>
    <div class="cal-toolbar">
      <label class="search" style="width:280px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-q placeholder="Search names and descriptions" value="${esc(UI.q)}" aria-label="Search documents"></label>
      <select class="input" data-course style="width:auto" aria-label="Filter by course"><option value="all">All courses</option>${S.courses.map((c) => `<option value="${c.id}" ${UI.course === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}<option value="none" ${UI.course === "none" ? "selected" : ""}>No course</option></select>
      ${UI.tab === "mine" ? `<select class="input" data-folder style="width:auto" aria-label="Filter by folder"><option value="all">All folders</option>${[...new Set(S.attachments.map((a) => a.folder).filter(Boolean))].map((f) => `<option ${UI.folder === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>` : ""}
    </div>
    <div id="docBody"></div>`;
  $$(".tab", view).forEach((b) => b.addEventListener("click", () => { UI.tab = b.dataset.tab; renderDocuments(view); }));
  $("[data-q]", view).addEventListener("input", (e) => { UI.q = e.target.value; draw(); });
  $("[data-course]", view).addEventListener("change", (e) => { UI.course = e.target.value; draw(); });
  $("[data-folder]", view)?.addEventListener("change", (e) => { UI.folder = e.target.value; draw(); });
  const body = $("#docBody", view);
  const draw = () => (UI.tab === "mine" ? mine(body) : UI.tab === "official" ? official(body) : notes(body));
  draw();
}

const match = (txt) => !UI.q || txt.toLowerCase().includes(UI.q.toLowerCase());
const courseOk = (cid) => UI.course === "all" || (UI.course === "none" ? !cid : cid === UI.course);

function mine(body) {
  const list = S.attachments.filter((a) => courseOk(a.course_id) && (UI.folder === "all" || a.folder === UI.folder) && match(`${a.name} ${a.description || ""} ${a.folder || ""}`));
  body.innerHTML = `
    <div class="dropzone" data-drop><p style="margin:0 0 8px"><strong>Drop files here</strong> or choose them. PDF, Word, PowerPoint, Excel, images or text, up to 50 MB each.</p>
      <div class="row" style="justify-content:center"><label class="btn primary">Choose files<input type="file" multiple hidden data-files accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.heic,.webp,.txt,.md,.csv"></label><button class="btn" data-link>Add a link</button></div>
      <p class="small" style="margin:8px 0 0">Text in PDFs, Word and PowerPoint files is made searchable for your AI assistant. Only you can see your files.</p></div>
    <div class="doc-grid" style="margin-top:16px">${list.map(docCard).join("") || `<div class="empty" style="grid-column:1/-1"><strong>No files${UI.q ? " match your search" : " yet"}.</strong>Upload lecture notes, slides or handwritten notes (photos work).</div>`}</div>`;
  const dz = $("[data-drop]", body);
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); askMeta([...e.dataTransfer.files], () => mine(body)); });
  $("[data-files]", body).addEventListener("change", (e) => askMeta([...e.target.files], () => mine(body)));
  $("[data-link]", body).addEventListener("click", () => linkForm(() => mine(body)));
  $$("[data-act]", body).forEach((b) => b.addEventListener("click", () => act(b.dataset.act, S.attachments.find((a) => a.id === b.dataset.id), () => mine(body))));
}

function docCard(a) {
  const e = ext(a);
  return `<div class="doc">
    <div class="row" style="align-items:flex-start;flex-wrap:nowrap"><span class="dt" style="background:${EXT_COLOR[e] || "var(--ink-3)"}">${esc(e || "FILE")}</span><div style="min-width:0"><div class="dn">${esc(a.name)}</div><div class="small muted">${a.kind === "link" ? "Link" : fmtBytes(a.size_bytes)} · ${fmtDate(a.created_at.slice(0, 10), { day: "numeric", month: "short" })}</div></div></div>
    ${a.description ? `<div class="small">${esc(a.description)}</div>` : ""}
    <div class="row small">${a.course_id ? coursePill(a.course_id) : ""}${a.session_id && session(a.session_id) ? `<span class="pill">${esc(sessionLabel(session(a.session_id)))}</span>` : ""}${a.folder ? `<span class="pill">${esc(a.folder)}</span>` : ""}</div>
    <div class="row" style="margin-top:auto"><button class="btn sm" data-act="open" data-id="${a.id}">${a.kind === "link" ? "Open" : "Preview"}</button>${a.kind === "file" ? `<button class="btn sm ghost" data-act="download" data-id="${a.id}">Download</button>` : ""}<button class="btn sm ghost" data-act="edit" data-id="${a.id}">Edit</button><button class="btn sm ghost danger" data-act="delete" data-id="${a.id}" aria-label="Delete ${esc(a.name)}">Delete</button></div>
  </div>`;
}

function metaFields(m = {}) {
  const folders = [...new Set(S.attachments.map((a) => a.folder).filter(Boolean))];
  return `<label class="field"><span>Course</span><select class="input" name="course_id"><option value="">None</option>${S.courses.map((c) => `<option value="${c.id}" ${m.course_id === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select></label>
    <label class="field"><span>Lecture</span><select class="input" name="session_id"><option value="">None</option>${m.course_id ? sessOpts(m.course_id, m.session_id) : ""}</select></label>
    <label class="field"><span>Task or assignment</span><select class="input" name="task_id"><option value="">None</option>${S.tasks.map((t) => `<option value="${t.id}" ${m.task_id === t.id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select></label>
    <label class="field"><span>Personal folder</span><input class="input" name="folder" list="folderList" value="${esc(m.folder || "")}" placeholder="e.g. Exam revision"><datalist id="folderList">${folders.map((f) => `<option value="${esc(f)}">`).join("")}</datalist></label>
    <label class="field wide"><span>Description</span><input class="input" name="description" value="${esc(m.description || "")}"></label>`;
}
const sessOpts = (cid, sel) => S.sessions.filter((s) => s.course_id === cid && !s.cancelled).map((s) => `<option value="${s.id}" ${sel === s.id ? "selected" : ""}>${esc(sessionName(s))}</option>`).join("");
function wireCourse(form) { form.course_id.addEventListener("change", () => { form.session_id.innerHTML = `<option value="">None</option>${form.course_id.value ? sessOpts(form.course_id.value) : ""}`; }); }

function askMeta(files, after) {
  const ok = files.filter((f) => f.size <= 50 * 1048576);
  if (ok.length < files.length) toast("Files over 50 MB were skipped", "err");
  if (!ok.length) return;
  openModal(`Upload ${ok.length} file${ok.length > 1 ? "s" : ""}`, (body, foot, close) => {
    body.innerHTML = `<p class="small muted">${ok.map((f) => esc(f.name)).join("<br>")}</p><form class="form-grid">${metaFields({ course_id: UI.course !== "all" && UI.course !== "none" ? UI.course : null })}</form>`;
    const form = $("form", body); wireCourse(form);
    foot.innerHTML = `<button class="btn" data-c>Cancel</button><button class="btn primary" data-u>Upload</button>`;
    foot.querySelector("[data-c]").onclick = close;
    foot.querySelector("[data-u]").onclick = async (e) => {
      e.target.disabled = true;
      const meta = readForm(form);
      let n = 0, done = 0;
      for (const f of ok) { try { e.target.textContent = `Uploading ${++n} of ${ok.length}…`; await uploadAttachment(f, meta); done++; } catch (er) { errToast(er); } }
      close();
      if (done === ok.length) toast(done === 1 ? "Uploaded" : `${done} files uploaded`);
      else if (done) toast(`${done} of ${ok.length} files uploaded`, "err");
      after();
    };
  });
}

function linkForm(after) {
  openModal("Add a link", (body, foot, close) => {
    body.innerHTML = `<form class="form-grid"><label class="field wide"><span>Address</span><input class="input" name="url" type="url" required placeholder="https://"></label><label class="field wide"><span>Name</span><input class="input" name="name" required></label>${metaFields()}</form>`;
    const form = $("form", body); wireCourse(form);
    foot.innerHTML = `<button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Add link</button>`;
    foot.querySelector("[data-c]").onclick = close;
    foot.querySelector("[data-s]").onclick = async () => {
      if (!form.reportValidity()) return;
      const f = readForm(form);
      if (!/^https?:\/\//i.test(f.url)) return toast("Links must start with http:// or https://", "err");
      try { await addLink(f); close(); toast("Link added"); after(); } catch (e) { errToast(e); }
    };
  });
}

async function act(kind, a, after) {
  if (!a) return;
  try {
    if (kind === "open") return a.kind === "link" ? (safeUrl(a.url) !== "#" && window.open(safeUrl(a.url), "_blank", "noopener")) : preview(a);
    if (kind === "download") { const w = window.open("", "_blank"); const u = await signedUrl("private", a.storage_path, true); if (w) { w.opener = null; w.location.href = u; } else location.href = u; return; }
    if (kind === "delete") { if (!(await confirmDialog(`Delete "${a.name}"? This can't be undone.`))) return; await deleteAttachment(a); toast("Deleted"); return after(); }
    if (kind === "edit") {
      openModal("Edit file details", (body, foot, close) => {
        body.innerHTML = `<form class="form-grid"><label class="field wide"><span>Name</span><input class="input" name="name" required value="${esc(a.name)}"></label>${metaFields(a)}</form>`;
        const form = $("form", body); wireCourse(form);
        foot.innerHTML = `<button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Save changes</button>`;
        foot.querySelector("[data-c]").onclick = close;
        foot.querySelector("[data-s]").onclick = async () => {
          if (!form.reportValidity()) return;
          const f = readForm(form);
          try { await updateAttachment(a.id, f); close(); toast("Saved"); after(); } catch (e) { errToast(e); }
        };
      });
    }
  } catch (e) { errToast(e); }
}

export async function preview(a) {
  try {
    const url = await signedUrl("private", a.storage_path);
    const isPdf = /pdf/.test(a.mime || "") || /\.pdf$/i.test(a.name);
    const isImg = /^image\//.test(a.mime || "");
    openModal(a.name, (body, foot, close) => {
      body.innerHTML = isPdf ? `<iframe class="preview-frame" src="${esc(url)}" title="${esc(a.name)}"></iframe>`
        : isImg ? `<img src="${esc(url)}" alt="${esc(a.name)}" style="max-width:100%;border-radius:8px">`
        : `<div class="empty"><strong>No preview for this file type.</strong>Download it to open it in its app.</div>`;
      foot.innerHTML = `<button class="btn" data-c>Close</button><a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener" download>Download</a>`;
      foot.querySelector("[data-c]").onclick = close;
    }, { wide: true });
  } catch (e) { errToast(e); }
}

function official(body) {
  const list = S.materials.filter((m) => courseOk(m.course_id) && match(`${m.title} ${m.description || ""}`));
  const groups = S.courses.map((c) => [c, list.filter((m) => m.course_id === c.id)]).filter(([, l]) => l.length);
  body.innerHTML = `
    ${isStaff() ? `<div class="dropzone" data-odrop><p style="margin:0 0 8px"><strong>Upload official course material</strong> for every student. Students can view and download it but can't change it.</p><label class="btn primary">Choose files<input type="file" multiple hidden data-ofiles></label></div>` : `<p class="muted small">Shared by the programme. Read-only.</p>`}
    ${groups.map(([c, l]) => `<section class="section" style="margin-top:16px"><h3 style="margin-bottom:8px">${esc(c.name)}</h3><div class="sheet flush"><table class="data"><tbody>${l.map((m) => `<tr><td><strong>${m.url ? `<a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">${esc(m.title)}</a>` : m.storage_path ? `<button class="btn ghost sm" data-official-file="${m.id}">${esc(m.title)}</button>` : esc(m.title)}</strong>${m.description ? `<div class="small muted">${esc(m.description)}</div>` : ""}</td><td class="small">${esc({ paper: "Presentation paper", link: "Link", file: "File", reading: "Reading" }[m.kind])}${m.session_id && session(m.session_id) ? " · " + esc(sessionLabel(session(m.session_id))) : ""}</td><td class="small muted">${fmtBytes(m.size_bytes)}</td>${isStaff() ? `<td><button class="btn sm ghost danger" data-odel="${m.id}">Delete</button></td>` : ""}</tr>`).join("")}</tbody></table></div></section>`).join("") || `<div class="empty" style="margin-top:16px"><strong>No official materials${UI.q ? " match" : " yet"}.</strong></div>`}`;
  $("[data-ofiles]", body)?.addEventListener("change", (e) => {
    const files = [...e.target.files];
    openModal("Upload official material", (b, foot, close) => {
      b.innerHTML = `<p class="small muted">${files.map((f) => esc(f.name)).join("<br>")}</p><form class="form-grid"><label class="field"><span>Course</span><select class="input" name="course_id" required>${S.courses.map((c) => `<option value="${c.id}">${esc(c.short_name || c.name)}</option>`).join("")}</select></label><label class="field"><span>Lecture</span><select class="input" name="session_id"><option value="">None</option>${sessOpts(S.courses[0]?.id)}</select></label><label class="field wide"><span>Description</span><input class="input" name="description"></label><label class="check wide"><input type="checkbox" name="required"> Required reading</label></form>`;
      const form = $("form", b); wireCourse(form);
      foot.innerHTML = `<button class="btn" data-c>Cancel</button><button class="btn primary" data-u>Upload for all students</button>`;
      foot.querySelector("[data-c]").onclick = close;
      foot.querySelector("[data-u]").onclick = async (ev) => {
        ev.target.disabled = true; const meta = readForm(form);
        let done = 0;
        for (const f of files) { try { await uploadOfficialMaterial(f, { ...meta, title: f.name }); done++; } catch (er) { errToast(er); } }
        close(); if (done) toast(done === files.length ? "Uploaded for all students" : `${done} of ${files.length} uploaded for all students`, done === files.length ? undefined : "err"); official(body);
      };
    });
  });
  $$("[data-odel]", body).forEach((b) => b.addEventListener("click", async () => {
    const m = S.materials.find((x) => x.id === b.dataset.odel);
    if (!(await confirmDialog(`Delete "${m.title}" for every student?`))) return;
    try { await deleteOfficialMaterial(m); toast("Deleted"); official(body); } catch (e) { errToast(e); }
  }));
}

function notes(body) {
  const list = S.notes.filter((n) => courseOk(n.course_id) && match(`${n.title} ${n.body}`));
  body.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn primary" data-new>New note</button><span class="muted small">Notes you save from the AI assistant appear here too.</span></div>
    <div class="stack">${list.map((n) => `<div class="sheet"><div class="spread"><h3>${esc(n.title)}</h3><div class="row">${n.course_id ? coursePill(n.course_id) : ""}${n.source === "ai" ? `<span class="pill info">From assistant</span>` : ""}<button class="btn sm ghost" data-edit="${n.id}">Edit</button><button class="btn sm ghost danger" data-del="${n.id}">Delete</button></div></div><div class="small muted">${fmtDate(n.created_at.slice(0, 10))}${n.session_id && session(n.session_id) ? " · " + esc(sessionLabel(session(n.session_id))) : ""}</div><details class="more" style="margin-top:8px"><summary>Show note</summary><div style="margin-top:8px">${md(n.body)}</div></details></div>`).join("") || `<div class="empty"><strong>No notes yet.</strong></div>`}</div>`;
  $("[data-new]", body).addEventListener("click", () => noteForm({}, () => notes(body)));
  $$("[data-edit]", body).forEach((b) => b.addEventListener("click", () => noteForm(S.notes.find((n) => n.id === b.dataset.edit), () => notes(body))));
  $$("[data-del]", body).forEach((b) => b.addEventListener("click", async () => { if (!(await confirmDialog("Delete this note?"))) return; try { await deleteNote(b.dataset.del); notes(body); } catch (e) { errToast(e); } }));
}
export function noteForm(n, after) {
  openModal(n.id ? "Edit note" : "New note", (body, foot, close) => {
    body.innerHTML = `<form class="form-grid"><label class="field wide"><span>Title</span><input class="input" name="title" required value="${esc(n.title || "")}"></label>
      <label class="field"><span>Course</span><select class="input" name="course_id"><option value="">None</option>${S.courses.map((c) => `<option value="${c.id}" ${n.course_id === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Lecture</span><select class="input" name="session_id"><option value="">None</option>${n.course_id ? sessOpts(n.course_id, n.session_id) : ""}</select></label>
      <label class="field wide"><span>Note (Markdown works)</span><textarea class="input" name="body" style="min-height:240px">${esc(n.body || "")}</textarea></label></form>`;
    const form = $("form", body); wireCourse(form);
    foot.innerHTML = `<button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Save note</button>`;
    foot.querySelector("[data-c]").onclick = close;
    foot.querySelector("[data-s]").onclick = async () => {
      if (!form.reportValidity()) return;
      try { await saveNote({ ...n, ...readForm(form) }); close(); toast("Note saved"); after && after(); } catch (e) { errToast(e); }
    };
  }, { wide: true });
}
void course;

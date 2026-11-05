// Data layer: Supabase client, loading, and every write the app makes.
// All reads and writes go through row-level security; nothing personal is kept in the browser.
import { todayISO, loadScript, uid } from "./lib.js?v=202611051410";

const cfg = window.MLEA_CONFIG || {};
export const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
export const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
// Sign-in emails link back to wherever the Hub is open (must be in Supabase → Auth → Redirect URLs).
// Sign-in emails must link to a real web address; a copy opened from a file falls back to the public Hub.
export const siteUrl = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : (cfg.HUB_SITE_URL || "https://moarmanious-creator.github.io/Study-hub/"));

export const S = {
  user: null, profile: null,
  // official
  courses: [], lecturers: [], courseLecturers: [], sessions: [], assessments: [], materials: [], announcements: [], sources: [],
  // personal
  attendance: new Map(), progress: new Map(), tasks: [], events: [], logs: [], attachments: [], notes: [],
  loaded: false, today: todayISO(),
};

export const isStaff = () => ["admin", "coordinator"].includes(S.profile?.role);
export const isAdmin = () => S.profile?.role === "admin";
export const course = (id) => S.courses.find((c) => c.id === id);
export const session = (id) => S.sessions.find((s) => s.id === id);
export const lecturer = (id) => S.lecturers.find((l) => l.id === id);
export const source = (id) => S.sources.find((s) => s.id === id);
export const lecturerName = (id) => { const l = lecturer(id); return l ? `${l.title && !/professor/i.test(l.title) ? l.title + " " : ""}${l.name}` : null; };
export const courseColor = (id) => course(id)?.color || "var(--nile)";
export const courseSessions = (cid) => S.sessions.filter((s) => s.course_id === cid).sort(sessionOrder);
export function sessionOrder(a, b) {
  const da = a.scheduled_date || "9999", db = b.scheduled_date || "9999";
  if (a.course_id !== b.course_id) return 0;
  // Lectures in number order; tutorials/presentations by date after their lecture peers.
  if (a.kind === b.kind) return a.seq - b.seq;
  return da < db ? -1 : da > db ? 1 : a.seq - b.seq;
}

function check({ data, error }) { if (error) throw error; return data; }

export async function loadOfficial() {
  const [courses, lecturers, cl, sessions, assessments, materials, announcements, sources] = await Promise.all([
    sb.from("courses").select("*").order("sort_order"),
    sb.from("lecturers").select("*"),
    sb.from("course_lecturers").select("*"),
    sb.from("sessions").select("*").order("course_id").order("seq"),
    sb.from("assessments").select("*"),
    sb.from("shared_materials").select("*").order("created_at"),
    sb.from("announcements").select("*").order("created_at", { ascending: false }).limit(50),
    sb.from("source_documents").select("id, title, file_name, storage_path, description, imported_at"),
  ]);
  S.courses = check(courses); S.lecturers = check(lecturers); S.courseLecturers = check(cl);
  S.sessions = check(sessions); S.assessments = check(assessments); S.materials = check(materials);
  S.announcements = check(announcements); S.sources = check(sources);
}

export async function loadPersonal() {
  const uidv = S.user.id;
  const [att, prog, tasks, events, logs, files, notes] = await Promise.all([
    sb.from("attendance_records").select("*").eq("user_id", uidv),
    sb.from("study_progress").select("*").eq("user_id", uidv),
    sb.from("study_tasks").select("*").eq("user_id", uidv).order("due_date", { nullsFirst: false }),
    sb.from("calendar_events").select("*").eq("user_id", uidv).order("starts_at"),
    sb.from("study_log").select("*").eq("user_id", uidv).order("log_date"),
    sb.from("student_attachments").select("*").eq("user_id", uidv).order("created_at", { ascending: false }),
    sb.from("student_notes").select("*").eq("user_id", uidv).order("created_at", { ascending: false }),
  ]);
  S.attendance = new Map(check(att).map((r) => [r.session_id, r]));
  S.progress = new Map(check(prog).map((r) => [r.session_id, r]));
  S.tasks = check(tasks); S.events = check(events); S.logs = check(logs);
  S.attachments = check(files); S.notes = check(notes);
}

export async function loadAll() {
  S.today = todayISO();
  await Promise.all([loadOfficial(), loadPersonal()]);
  S.loaded = true;
  sb.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", S.user.id).then(() => {});
}

export async function loadProfile() {
  const { data, error } = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
  if (error) throw error;
  S.profile = data;
  return data;
}

// ── Attendance & study progress (one row per student per session) ──
export async function saveAttendance(sessionId, patch) {
  const prev = S.attendance.get(sessionId) || { session_id: sessionId, status: "not_yet", recording_watched: false };
  const row = { ...prev, ...patch, user_id: S.user.id, session_id: sessionId };
  delete row.updated_at;
  const data = check(await sb.from("attendance_records").upsert(row, { onConflict: "user_id,session_id" }).select().single());
  S.attendance.set(sessionId, data);
  // Attending or watching ticks the first checklist item automatically.
  if (["physical", "online", "recording"].includes(data.status) || data.recording_watched) {
    const p = S.progress.get(sessionId);
    if (!p?.attended_or_watched) await saveProgress(sessionId, { attended_or_watched: true });
  }
  return data;
}

export async function saveProgress(sessionId, patch) {
  const prev = S.progress.get(sessionId) || { session_id: sessionId };
  const row = { ...prev, ...patch, user_id: S.user.id, session_id: sessionId };
  delete row.updated_at;
  const data = check(await sb.from("study_progress").upsert(row, { onConflict: "user_id,session_id" }).select().single());
  S.progress.set(sessionId, data);
  return data;
}

export async function logStudy({ minutes, course_id = null, session_id = null, note = null, log_date = todayISO() }) {
  const data = check(await sb.from("study_log").insert({ minutes, course_id, session_id, note, log_date }).select().single());
  S.logs.push(data);
  if (session_id) {
    const p = S.progress.get(session_id);
    await saveProgress(session_id, { actual_minutes: (p?.actual_minutes || 0) + minutes });
  }
  return data;
}

// ── Tasks. Official assessments become a task row the first time a student changes them. ──
export function taskForAssessment(a) {
  return S.tasks.find((t) => t.assessment_id === a.id) || {
    id: null, assessment_id: a.id, course_id: a.course_id, title: a.title, description: a.description,
    assigned_date: a.assigned_date, due_date: a.due_date, status: "not_started", priority: a.type === "exam" ? "high" : "medium",
    completion: 0, notes: null, virtual: true,
  };
}
export function allTasks() {
  const official = S.assessments.map(taskForAssessment).map((t) => (t.virtual ? t : { ...t }));
  const personal = S.tasks.filter((t) => !t.assessment_id);
  // Keep official due dates authoritative even if a task row exists.
  for (const t of official) { const a = S.assessments.find((x) => x.id === t.assessment_id); if (a) { t.due_date = a.due_date; t.official = a; } }
  return [...official, ...personal];
}
export async function saveTask(task, patch) {
  const base = { ...task, ...patch };
  const row = {
    assessment_id: base.assessment_id || null, course_id: base.course_id || null, title: base.title, description: base.description || null,
    assigned_date: base.assigned_date || null, due_date: base.assessment_id ? null : base.due_date || null, status: base.status || "not_started",
    priority: base.priority || "medium", completion: base.completion ?? 0, required_attachments: base.required_attachments || null, notes: base.notes || null,
  };
  if (row.status === "completed" || row.status === "submitted") row.completion = 100;
  let data;
  if (task.id) data = check(await sb.from("study_tasks").update(row).eq("id", task.id).select().single());
  else if (row.assessment_id) data = check(await sb.from("study_tasks").upsert({ ...row, user_id: S.user.id }, { onConflict: "user_id,assessment_id" }).select().single());
  else data = check(await sb.from("study_tasks").insert(row).select().single());
  const i = S.tasks.findIndex((t) => t.id === data.id);
  if (i >= 0) S.tasks[i] = data; else S.tasks.push(data);
  return data;
}
export async function deleteTask(id) {
  check(await sb.from("study_tasks").delete().eq("id", id));
  S.tasks = S.tasks.filter((t) => t.id !== id);
}

// ── Personal calendar events ──
export async function saveEvent(ev) {
  const row = { course_id: ev.course_id || null, session_id: ev.session_id || null, title: ev.title, kind: ev.kind || "study",
    starts_at: ev.starts_at, ends_at: ev.ends_at || null, completed: !!ev.completed, reminder_minutes: ev.reminder_minutes ?? null, notes: ev.notes || null };
  const data = ev.id
    ? check(await sb.from("calendar_events").update(row).eq("id", ev.id).select().single())
    : check(await sb.from("calendar_events").insert(row).select().single());
  const i = S.events.findIndex((e) => e.id === data.id);
  if (i >= 0) S.events[i] = data; else S.events.push(data);
  S.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return data;
}
export async function deleteEvent(id) {
  check(await sb.from("calendar_events").delete().eq("id", id));
  S.events = S.events.filter((e) => e.id !== id);
}

// ── Notes ──
export async function saveNote(n) {
  const row = { course_id: n.course_id || null, session_id: n.session_id || null, title: n.title, body: n.body || "", source: n.source || "manual" };
  const data = n.id ? check(await sb.from("student_notes").update(row).eq("id", n.id).select().single())
    : check(await sb.from("student_notes").insert(row).select().single());
  const i = S.notes.findIndex((x) => x.id === data.id);
  if (i >= 0) S.notes[i] = data; else S.notes.unshift(data);
  return data;
}
export async function deleteNote(id) { check(await sb.from("student_notes").delete().eq("id", id)); S.notes = S.notes.filter((n) => n.id !== id); }

// ── Files ──
const safeName = (n) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);

// Extract readable text so the AI assistant can search the document. Best effort.
export async function extractText(file) {
  try {
    const name = file.name.toLowerCase();
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const out = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 150); i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        out.push(tc.items.map((x) => x.str).join(" "));
      }
      return out.join("\n\n");
    }
    if (name.endsWith(".docx")) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
      const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return r.value;
    }
    if (name.endsWith(".pptx") || name.endsWith(".xlsx")) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const files = Object.keys(zip.files).filter((f) => name.endsWith(".pptx") ? /^ppt\/slides\/slide\d+\.xml$/.test(f) : /^xl\/sharedStrings\.xml$/.test(f))
        .sort((a, b) => (parseInt(a.match(/\d+/)?.[0]) || 0) - (parseInt(b.match(/\d+/)?.[0]) || 0));
      const out = [];
      for (const f of files) { const xml = await zip.files[f].async("string"); out.push((xml.match(/<a:t>([^<]*)<\/a:t>|<t[^>]*>([^<]*)<\/t>/g) || []).map((m) => m.replace(/<[^>]+>/g, "")).join(" ")); }
      return out.join("\n\n");
    }
    if (/^text\//.test(file.type) || /\.(txt|md|csv)$/.test(name)) return await file.text();
  } catch (e) { console.warn("text extraction failed", e); }
  return "";
}
export function chunk(text, size = 1600, overlap = 200) {
  const clean = text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const out = [];
  for (let i = 0; i < clean.length && out.length < 400; i += size - overlap) out.push(clean.slice(i, i + size));
  return out.filter((c) => c.trim().length > 40);
}


// Uploads go through Supabase's resumable (TUS) endpoint in 6 MB pieces, retrying each piece,
// so a large PDF on a weak mobile connection resumes instead of failing with "Failed to fetch".
const TUS_SRC = "https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js";
async function storageUpload(bucket, path, file, contentType) {
  const plain = async () => {
    const up = await sb.storage.from(bucket).upload(path, file, { contentType, upsert: false });
    if (up.error) throw up.error;
  };
  try { await loadScript(TUS_SRC); } catch { return plain(); }
  if (!window.tus || !window.tus.isSupported) return plain();
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again, then retry the upload.");
  await new Promise((resolve, reject) => {
    const u = new window.tus.Upload(file, {
      endpoint: `${cfg.SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: cfg.SUPABASE_ANON_KEY, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: "3600" },
      onError: (err) => {
        const status = err?.originalResponse?.getStatus?.();
        const body = err?.originalResponse?.getBody?.() || "";
        if (status === 413 || /too large|exceeded the maximum/i.test(body)) reject(new Error(`${file.name} is larger than the 50 MB limit.`));
        else if (status === 403 || /row-level security|unauthori/i.test(body)) reject(new Error("You don't have permission to upload here. Sign out and in again."));
        else if (!status) reject(new Error(`The connection dropped while uploading ${file.name}. Check your internet and try again.`));
        else reject(new Error(`Upload failed (${status}). ${body.slice(0, 160)}`));
      },
      onSuccess: () => resolve(),
    });
    u.findPreviousUploads().then((prev) => { if (prev.length) u.resumeFromPreviousUpload(prev[0]); u.start(); }).catch(() => u.start());
  });
}

export async function uploadAttachment(file, meta = {}) {
  const path = `${S.user.id}/${uid()}-${safeName(file.name)}`;
  await storageUpload("private", path, file, file.type || "application/octet-stream");
  const row = check(await sb.from("student_attachments").insert({
    name: file.name, kind: "file", storage_path: path, mime: file.type || null, size_bytes: file.size,
    course_id: meta.course_id || null, session_id: meta.session_id || null, task_id: meta.task_id || null,
    folder: meta.folder || null, description: meta.description || null,
  }).select().single());
  S.attachments.unshift(row);
  const text = await extractText(file);
  if (text) {
    const rows = chunk(text).map((c, i) => ({ user_id: S.user.id, attachment_id: row.id, course_id: row.course_id, session_id: row.session_id, title: row.name, chunk_index: i, content: c }));
    for (let i = 0; i < rows.length; i += 100) { const r = await sb.from("doc_chunks").insert(rows.slice(i, i + 100)); if (r.error) console.warn(r.error); }
  }
  row.searchable = !!text;
  return row;
}
export async function addLink(meta) {
  const row = check(await sb.from("student_attachments").insert({ kind: "link", name: meta.name, url: meta.url, description: meta.description || null,
    course_id: meta.course_id || null, session_id: meta.session_id || null, task_id: meta.task_id || null, folder: meta.folder || null }).select().single());
  S.attachments.unshift(row);
  return row;
}
export async function updateAttachment(id, patch) {
  const data = check(await sb.from("student_attachments").update(patch).eq("id", id).select().single());
  const i = S.attachments.findIndex((a) => a.id === id); if (i >= 0) S.attachments[i] = data;
  return data;
}
export async function deleteAttachment(a) {
  if (a.storage_path) { const r = await sb.storage.from("private").remove([a.storage_path]); if (r.error) throw r.error; }
  check(await sb.from("student_attachments").delete().eq("id", a.id));
  S.attachments = S.attachments.filter((x) => x.id !== a.id);
}
export async function signedUrl(bucket, path, download = false) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 600, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

// ── Official materials (staff) ──
export async function uploadOfficialMaterial(file, meta) {
  const path = `${meta.course_id || "programme"}/${uid()}-${safeName(file.name)}`;
  await storageUpload("official", path, file, file.type || "application/octet-stream");
  const row = check(await sb.from("shared_materials").insert({ course_id: meta.course_id || null, session_id: meta.session_id || null, kind: "file",
    title: meta.title || file.name, description: meta.description || null, storage_path: path, mime: file.type || null, size_bytes: file.size,
    required: !!meta.required, uploaded_by: S.user.id }).select().single());
  S.materials.push(row);
  const text = await extractText(file);
  if (text) {
    const rows = chunk(text).map((c, i) => ({ material_id: row.id, course_id: row.course_id, session_id: row.session_id, title: row.title, chunk_index: i, content: c }));
    for (let i = 0; i < rows.length; i += 100) { const r = await sb.from("doc_chunks").insert(rows.slice(i, i + 100)); if (r.error) console.warn(r.error); }
  }
  return { row, searchable: !!text };
}
export async function addOfficialLink(meta) {
  if (!/^https?:\/\//i.test(meta.url || "")) throw new Error("Links must start with http:// or https://");
  const row = check(await sb.from("shared_materials").insert({ course_id: meta.course_id || null, session_id: meta.session_id || null, kind: "link",
    title: meta.title || meta.url, description: meta.description || null, url: meta.url, uploaded_by: S.user.id }).select().single());
  S.materials.push(row);
  return row;
}
// The current official structure from the database, in the same format the importer reads.
export function exportOfficial() {
  const hm = (t) => (t ? String(t).slice(0, 5) : undefined);
  const sessKey = (id) => { const x = S.sessions.find((s) => s.id === id); return x ? [x.kind, x.seq] : undefined; };
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)));
  return {
    format: "mlea-hub-official/1",
    notes: `Exported from the Hub on ${S.today}.`,
    source_documents: S.sources.map((d) => clean({ id: d.id, title: d.title, file_name: d.file_name, description: d.description })),
    lecturers: S.lecturers.map((l) => clean({ id: l.id, name: l.name, title: l.title, email: l.email, affiliation: l.affiliation, source_ref: l.source_ref })),
    courses: [...S.courses].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((c) => clean({
      id: c.id, code: c.code, short_name: c.short_name, sort_order: c.sort_order, color: c.color, name: c.name, term: c.term,
      lecturers: S.courseLecturers.filter((x) => x.course_id === c.id).map((x) => [x.lecturer_id, x.role]),
      description: c.description, objectives: c.objectives, teaching_format: c.teaching_format, assessment_summary: c.assessment_summary,
      exam_info: c.exam_info, core_readings: c.core_readings, source_ref: c.source_ref, info_required: c.info_required,
      sessions: S.sessions.filter((s) => s.course_id === c.id).sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : a.seq - b.seq)).map((s) => clean({
        seq: s.seq, kind: s.kind === "lecture" ? undefined : s.kind, label: s.label, title: s.title, topics: s.topics, readings: s.readings,
        date: s.scheduled_date, start: hm(s.start_time), end: hm(s.end_time), delivery: s.delivery, location: s.location, lecturer: s.lecturer_id,
        recording_url: s.recording_url, links: s.links, source_ref: s.source_ref, info_required: s.info_required })),
      assessments: S.assessments.filter((a) => a.course_id === c.id).map((a) => clean({
        type: a.type, title: a.title, weight: a.weight, description: a.description, assigned_date: a.assigned_date, due_date: a.due_date,
        is_group: a.is_group || undefined, max_group_size: a.max_group_size, session: a.session_id ? sessKey(a.session_id) : undefined,
        source_ref: a.source_ref, info_required: a.info_required })),
      materials: S.materials.filter((m) => m.course_id === c.id && !m.storage_path).map((m) => clean({
        kind: m.kind, title: m.title, description: m.description, url: m.url, required: m.required || undefined,
        session: m.session_id ? sessKey(m.session_id) : undefined,
        assessment: m.assessment_id ? S.assessments.find((a) => a.id === m.assessment_id)?.title : undefined })),
    })),
  };
}

export async function deleteOfficialMaterial(m) {
  if (m.storage_path) await sb.storage.from("official").remove([m.storage_path]);
  check(await sb.from("shared_materials").delete().eq("id", m.id));
  S.materials = S.materials.filter((x) => x.id !== m.id);
}

// Account
export async function updateMyName(full_name) {
  check(await sb.from("profiles").update({ full_name }).eq("id", S.user.id));
  S.profile.full_name = full_name;
}

// Edge functions
export async function callFunction(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body: { redirect_to: siteUrl(), ...body } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data;
}

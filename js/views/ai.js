// AI Study Assistant: floating panel on every page. Conversations are stored per student
// (private), the API key never reaches the browser, and answers label where each part comes from.
import { esc, md, toast, errToast, $, $$ } from "../lib.js?v=202611070657";
import { S, sb, callFunction, uploadAttachment, saveNote, session } from "../store.js?v=202611070657";
import { sessionLabel, sessionName } from "../ui.js?v=202611070657";

const MODES = [["", "Ask anything"], ["explain", "Explain a lecture"], ["simplify", "Simplify a concept"], ["summarize", "Summarize materials"], ["notes", "Study notes"],
  ["exam", "Exam questions"], ["mcq", "MCQs"], ["model_answers", "Model answers"], ["maths", "Maths step by step"], ["compare", "Compare concepts"], ["gaps", "What am I missing?"], ["revision", "Revision plan"]];
const A = { open: false, conv: null, convs: [], msgs: [], course: "", session: "", mode: "", files: [], busy: false, list: false };

export function initAI() {
  const fab = $("#aiFab");
  fab.hidden = false;
  fab.addEventListener("click", () => toggle(true));
  window.addEventListener("hub:ai", (e) => {
    const d = e.detail || {};
    A.course = d.course_id || A.course; A.session = d.session_id || ""; A.mode = d.mode || ""; A.conv = null; A.msgs = [];
    toggle(true);
    if (d.prompt) { const ta = $("#aiText"); if (ta) { ta.value = d.prompt; ta.focus(); } }
  });
}

function toggle(open) {
  A.open = open;
  const p = $("#aiPanel");
  p.hidden = !open; $("#aiFab").hidden = open;
  if (open) { if (!A.course) { const m = location.hash.match(/#\/course\/([\w-]+)/); if (m) A.course = m[1]; } draw(); setTimeout(() => $("#aiText")?.focus(), 30); }
}

async function loadConvs() {
  const { data } = await sb.from("ai_conversations").select("id, title, course_id, session_id, updated_at").eq("user_id", S.user.id).order("updated_at", { ascending: false }).limit(40);
  A.convs = data || [];
}
async function loadMsgs(id) {
  const { data } = await sb.from("ai_messages").select("id, role, content, attachment_ids, created_at").eq("conversation_id", id).order("id");
  A.msgs = data || [];
}

function draw() {
  const p = $("#aiPanel");
  const enabled = window.MLEA_CONFIG?.HUB_AI_ENABLED !== false;
  const sessOpts = A.course ? S.sessions.filter((s) => s.course_id === A.course && !s.cancelled).map((s) => `<option value="${s.id}" ${A.session === s.id ? "selected" : ""}>${esc(sessionName(s))}</option>`).join("") : "";
  p.innerHTML = `
    <div class="ai-head"><h2>AI Study Assistant</h2>
      <button class="btn sm ghost" data-list>${A.list ? "Back" : "History"}</button><button class="btn sm ghost" data-new>New chat</button>
      <button class="icon-btn" data-close aria-label="Close assistant"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    ${A.list ? `<div class="ai-msgs">${A.convs.map((c) => `<button class="btn" style="justify-content:flex-start;white-space:normal;text-align:left" data-conv="${c.id}">${esc(c.title)}<span class="muted small" style="margin-left:auto">${new Date(c.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></button>`).join("") || `<div class="empty">No conversations yet.</div>`}</div>` : `
    <div class="ai-ctx">
      <select class="input" data-course aria-label="Course"><option value="">All courses</option>${S.courses.map((c) => `<option value="${c.id}" ${A.course === c.id ? "selected" : ""}>${esc(c.short_name || c.name)}</option>`).join("")}</select>
      <select class="input" data-session aria-label="Lecture" ${A.course ? "" : "disabled"}><option value="">Any lecture</option>${sessOpts}</select>
    </div>
    <div class="ai-modes" role="group" aria-label="What kind of help">${MODES.map(([k, l]) => `<button class="chip" data-mode="${k}" aria-pressed="${A.mode === k}">${l}</button>`).join("")}</div>
    <div class="ai-msgs" id="aiMsgs" aria-live="polite">
      ${!enabled ? `<div class="info-req"><strong>The assistant is switched off.</strong> The programme admin needs to add the AI key on the server and turn it on.</div>` : ""}
      ${A.msgs.length ? A.msgs.map(msgHTML).join("") : `<div class="muted small" style="padding:6px">
        <p>Ask about any lecture, concept or uploaded file. Pick a course and lecture above for answers grounded in that material.</p>
        <p>Each part of an answer is labelled: <strong>From course materials</strong> (your files and official uploads), <strong>From official programme data</strong> (syllabus and timetable), or <strong>General explanation</strong>. The assistant won't guess dates, deadlines or exam rules that aren't in the official documents.</p></div>`}
      ${A.busy ? `<div class="typing">Thinking…</div>` : ""}
    </div>
    <div class="ai-input">
      ${A.files.length ? `<div class="ai-files">${A.files.map((f, i) => `<span class="pill info">${esc(f.name)}<button class="btn ghost sm" style="padding:0 4px" data-unfile="${i}" aria-label="Remove ${esc(f.name)}">×</button></span>`).join("")}</div>` : ""}
      <textarea id="aiText" class="input" placeholder="e.g. Explain the substitution effect with a graph described in words" aria-label="Your question" ${A.busy ? "disabled" : ""}></textarea>
      <div class="row"><label class="btn sm">Attach files<input type="file" multiple hidden data-attach accept=".pdf,.docx,.pptx,.txt,.md"></label><span class="muted small" style="flex:1">Enter to send · Shift+Enter for a new line</span><button class="btn primary" data-send ${A.busy ? "disabled" : ""}>Send</button></div>
    </div>`}`;

  $("[data-close]", p).onclick = () => toggle(false);
  $("[data-new]", p).onclick = () => { A.conv = null; A.msgs = []; A.list = false; A.files = []; draw(); };
  $("[data-list]", p).onclick = async () => { A.list = !A.list; if (A.list) await loadConvs(); draw(); };
  $$("[data-conv]", p).forEach((b) => b.addEventListener("click", async () => {
    A.conv = b.dataset.conv; const c = A.convs.find((x) => x.id === A.conv); A.course = c?.course_id || ""; A.session = c?.session_id || ""; A.list = false;
    await loadMsgs(A.conv); draw(); scroll();
  }));
  if (A.list) return;
  $("[data-course]", p).onchange = (e) => { A.course = e.target.value; A.session = ""; draw(); };
  $("[data-session]", p).onchange = (e) => { A.session = e.target.value; };
  $$("[data-mode]", p).forEach((b) => b.addEventListener("click", () => { A.mode = b.dataset.mode; draw(); }));
  $$("[data-unfile]", p).forEach((b) => b.addEventListener("click", () => { A.files.splice(Number(b.dataset.unfile), 1); draw(); }));
  $("[data-attach]", p).onchange = async (e) => {
    for (const f of e.target.files) {
      if (f.size > 50 * 1048576) { toast(`${f.name} is over 50 MB`, "err"); continue; }
      try { toast(`Reading ${f.name}…`); const row = await uploadAttachment(f, { course_id: A.course || null, session_id: A.session || null, folder: "Assistant uploads" }); if (!row.searchable) toast(`${f.name} was saved, but no text could be read from it (scanned PDF or image).`, "err"); A.files.push(row); } catch (er) { errToast(er); }
    }
    draw();
  };
  const ta = $("#aiText", p);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  $("[data-send]", p).onclick = send;
  $$("[data-savenote]", p).forEach((b) => b.addEventListener("click", async () => {
    const m = A.msgs[Number(b.dataset.savenote)];
    const title = prompt("Title for this note", (A.session && session(A.session) ? sessionLabel(session(A.session)) + " — " : "") + "Assistant notes");
    if (!title) return;
    try { await saveNote({ title, body: m.content, course_id: A.course || null, session_id: A.session || null, source: "ai" }); toast("Saved to My notes"); } catch (e) { errToast(e); }
  }));
  $$("[data-copy]", p).forEach((b) => b.addEventListener("click", () => { navigator.clipboard?.writeText(A.msgs[Number(b.dataset.copy)].content); toast("Copied"); }));
  scroll();
}

function msgHTML(m, i) {
  if (m.role === "user") return `<div class="msg user">${esc(m.content)}</div>`;
  return `<div class="msg assistant">${md(m.content)}${m.sources?.length ? `<div class="srcs">Sources searched: ${m.sources.map((s) => `${esc(s.ref)} ${esc(s.label)}`).join("; ")}</div>` : ""}
    ${m.error ? "" : `<div class="msg-actions"><button class="btn sm" data-savenote="${i}">Save as note</button><button class="btn sm ghost" data-copy="${i}">Copy</button></div>`}</div>`;
}
const scroll = () => { const el = $("#aiMsgs"); if (el) el.scrollTop = el.scrollHeight; };

async function send() {
  const ta = $("#aiText");
  const text = ta.value.trim();
  if (!text || A.busy) return;
  A.msgs.push({ role: "user", content: text });
  A.busy = true; draw(); scroll();
  try {
    const r = await callFunction("hub-ai", { conversation_id: A.conv, message: text, course_id: A.course || null, session_id: A.session || null, attachment_ids: A.files.map((f) => f.id), mode: A.mode || undefined });
    A.conv = r.conversation_id;
    A.msgs.push({ role: "assistant", content: r.text + (r.truncated ? "\n\n*(Answer cut short — ask me to continue.)*" : ""), sources: r.sources });
    A.files = [];
    if (r.remaining != null && r.remaining < 10) toast(`${r.remaining} assistant messages left this month`);
  } catch (e) {
    A.msgs.push({ role: "assistant", content: `**Couldn't get an answer.** ${e.message}`, error: true });
  }
  A.busy = false; draw(); scroll();
}

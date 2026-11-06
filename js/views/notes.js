// Lecture study notes: a one-page, handwritten-style revision sheet per lecture, built by the
// AI from the lecture's slides (or its syllabus topics when no slides are available).
// One note per lecture is shared by the whole class; admins can regenerate it.
import { esc, openModal, toast, errToast, loadScript, $ } from "../lib.js?v=202611061458";
import { S, sb, callFunction, session as getSession, isStaff } from "../store.js?v=202611061458";
import { sessionName, courseName } from "../ui.js?v=202611061458";

const H2C = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@4.1.0/dist/jspdf.umd.min.js";
const cache = new Map(); // session_id -> note row (or null when there is none yet)

let fontsLoaded = false;
function loadFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Patrick+Hand&display=swap";
  document.head.appendChild(l);
}

export async function getNote(sessionId) {
  if (cache.has(sessionId)) return cache.get(sessionId);
  const { data, error } = await sb.from("lecture_notes").select("content, source, generated_at").eq("session_id", sessionId).maybeSingle();
  if (error) throw error;
  cache.set(sessionId, data || null);
  return data || null;
}
export async function createNote(sessionId, regenerate = false) {
  const r = await callFunction("hub-ai", { task: "study_note", session_id: sessionId, regenerate });
  cache.set(sessionId, r.note);
  return r.note;
}

const HL = ["#ffe58a", "#ffc2d1", "#b9dcff", "#c7efb8", "#ffd2a6"]; // highlighter colours
// Box border and fill for each highlighter (plain rgba: the image export can't read color-mix()).
const BOX = [["#d9b84a", "rgba(255,229,138,.16)"], ["#d98aa1", "rgba(255,194,209,.16)"], ["#86aedb", "rgba(185,220,255,.18)"], ["#93c486", "rgba(199,239,184,.18)"], ["#e0a26a", "rgba(255,210,166,.18)"]];
const circ = (n) => `<span class="hw-num">${n}</span>`;

// Renders the note as HTML (also used for the image and PDF downloads).
export function noteSheet(content, s) {
  const secs = content.sections || [];
  const sec = (x, i) => {
    const head = `<div class="hw-head">${circ(i + 1)}<span class="hw-hl" style="--hl:${HL[i % HL.length]}">${esc(x.heading)}</span></div>`;
    let body = "";
    if (x.type === "compare") {
      body = `<table class="hw-cmp"><thead><tr><th></th><th class="l">${esc(x.left)}</th><th class="r">${esc(x.right)}</th></tr></thead><tbody>${(x.rows || []).map((r) => `<tr><th>${esc(r[0])}</th><td class="l">${esc(r[1])}</td><td class="r">${esc(r[2])}</td></tr>`).join("")}</tbody></table>`;
    } else if (x.type === "flow") {
      body = `<div class="hw-flow-wrap"><div class="hw-flow">${(x.steps || []).map((st, j) => `${j ? `<span class="hw-arrow" aria-hidden="true">↓</span>` : ""}<span class="hw-step">${esc(st)}</span>`).join("")}</div>${x.question ? `<div class="hw-q"><b>Question:</b> “${esc(x.question)}”</div>` : ""}</div>`;
    } else if (x.type === "terms") {
      body = `<dl class="hw-terms">${(x.items || []).map((t) => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.def)}</dd></div>`).join("")}</dl>`;
    } else if (x.type === "example") {
      body = `${x.text ? `<p class="hw-p">${esc(x.text)}</p>` : ""}<ol class="hw-steps">${(x.steps || []).map((st) => `<li>${esc(st)}</li>`).join("")}</ol>`;
    } else {
      body = `${x.text ? `<p class="hw-p hw-quote">“${esc(x.text)}”</p>` : ""}<ul class="hw-ul">${(x.bullets || []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
    }
    const wide = x.type === "compare" || x.type === "flow" || (x.type === "example" && (x.steps || []).length > 3);
    return `<section class="hw-sec ${wide ? "wide" : ""} t-${esc(x.type)}" style="--hl:${HL[i % HL.length]};--hlb:${BOX[i % BOX.length][0]};--hlf:${BOX[i % BOX.length][1]}">${head}<div class="hw-box">${body}</div></section>`;
  };
  return `<article class="hw-note">
    <header class="hw-title"><h1><span class="a">${esc(content.title || s?.title || "Study note")}</span></h1>
      <p>${esc(content.subtitle || (s ? `${courseName(s.course_id)} · ${sessionName(s)}` : ""))}</p></header>
    <div class="hw-grid">${secs.map(sec).join("")}</div>
    <footer class="hw-foot">
      ${(content.remember || []).length ? `<div class="hw-remember"><span class="bulb" aria-hidden="true">💡</span><div><b>Remember:</b>${content.remember.map((r) => `<div>${esc(r)}</div>`).join("")}</div></div>` : ""}
      ${content.one_line ? `<div class="hw-oneline"><b>One-line rule:</b> “${esc(content.one_line)}”</div>` : ""}
    </footer>
  </article>`;
}

export async function openStudyNote(sessionId) {
  loadFonts();
  const s = getSession(sessionId);
  if (!s) return;
  openModal(`Study note · ${sessionName(s)}`, async (body, foot, close) => {
    body.innerHTML = `<div class="loading">Opening the study note…</div>`;
    foot.innerHTML = `<button class="btn" data-close-note>Close</button>`;
    foot.querySelector("[data-close-note]").onclick = close;
    let note;
    try { note = await getNote(sessionId); } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const show = (n) => {
      body.innerHTML = `<div class="hw-scroll">${noteSheet(n.content, s)}</div>
        <p class="small muted" style="margin:10px 0 0">${n.source === "slides" ? "Made by the AI from this lecture's slides." : "Made by the AI from the syllabus topics (the slides weren't available). Check it against your lecture notes."} Shared with the whole class.</p>`;
      foot.innerHTML = `${isStaff() ? `<button class="btn" data-regen style="margin-right:auto">Regenerate</button>` : ""}
        <button class="btn" data-ask>Ask the assistant</button><button class="btn" data-png>Save image</button><button class="btn primary" data-pdf>Download PDF</button>`;
      foot.querySelector("[data-png]").onclick = (e) => exportNote(body, s, "png", e.currentTarget);
      foot.querySelector("[data-pdf]").onclick = (e) => exportNote(body, s, "pdf", e.currentTarget);
      foot.querySelector("[data-ask]").onclick = () => { close(); window.dispatchEvent(new CustomEvent("hub:ai", { detail: { course_id: s.course_id, session_id: s.id, mode: "explain" } })); };
      foot.querySelector("[data-regen]")?.addEventListener("click", () => make(true));
    };
    const make = async (regenerate) => {
      body.innerHTML = `<div class="loading"><strong>Writing the study note…</strong><br>Reading the slides and laying out the page. This takes about 20–40 seconds.</div>`;
      foot.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try { show(await createNote(sessionId, regenerate)); toast("Study note ready"); window.dispatchEvent(new CustomEvent("hub:changed")); }
      catch (e) { errToast(e); note ? show(note) : empty(); }
    };
    const empty = () => {
      body.innerHTML = `<div class="empty" style="padding:30px 10px"><strong>No study note for this lecture yet.</strong>
        The AI reads this lecture's slides (or its syllabus topics if the slides aren't available) and writes a one-page handwritten-style revision sheet: the basic idea, comparisons, a step-by-step flow, key terms, an example and a one-line rule. It's shared with the whole class, so it only needs creating once.</div>`;
      foot.innerHTML = `<button class="btn" data-x>Close</button><button class="btn primary" data-make>Create study note</button>`;
      foot.querySelector("[data-x]").onclick = close;
      foot.querySelector("[data-make]").onclick = () => make(false);
    };
    note ? show(note) : empty();
  }, { wide: true });
}

// Saves the rendered note as a PNG image or an A4 PDF (the page is split if it's long).
async function exportNote(root, s, kind, btn) {
  const el = $(".hw-note", root);
  if (!el) return;
  btn.disabled = true;
  try {
    await loadScript(H2C);
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true });
    const name = `Study note - ${(s.label || "Lecture")} - ${courseName(s.course_id)}`.replace(/[^\w\s.-]+/g, "").trim();
    if (kind === "png") {
      const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `${name}.png`; a.click();
    } else {
      await loadScript(JSPDF);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pw = 210, ph = 297, m = 8, w = pw - 2 * m;
      const pageHpx = Math.floor(((ph - 2 * m) / w) * canvas.width);
      for (let y = 0, i = 0; y < canvas.height; y += pageHpx, i++) {
        const part = document.createElement("canvas");
        part.width = canvas.width; part.height = Math.min(pageHpx, canvas.height - y);
        part.getContext("2d").drawImage(canvas, 0, -y);
        if (i) pdf.addPage();
        pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", m, m, w, (part.height / canvas.width) * w);
      }
      pdf.save(`${name}.pdf`);
    }
  } catch (e) { errToast(e, "Couldn't create the file"); }
  finally { btn.disabled = false; }
}

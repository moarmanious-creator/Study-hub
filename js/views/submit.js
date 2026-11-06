// Prepare a submission for an assignment or project: build a Word, PDF or PowerPoint file
// from the student's own text, draft the email to the instructor (template or AI), then send
// it with the file attached through the device's share sheet, or download it and open an
// email that's already filled in. All free: nothing is sent through a paid mail service.
import { esc, fmtLong, openModal, readForm, toast, errToast, loadScript, $ } from "../lib.js?v=202611061458";
import { S, saveTask, uploadAttachment, callFunction, course as getCourse } from "../store.js?v=202611061458";
import { TASK_STATUS } from "../metrics.js?v=202611061458";

const LIB = {
  docx: "https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js",
  pptx: "https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js",
  pdf: "https://cdn.jsdelivr.net/npm/jspdf@4.1.0/dist/jspdf.umd.min.js",
  h2c: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
};
const FMT = { docx: ["Word", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], pdf: ["PDF", "pdf", "application/pdf"], pptx: ["PowerPoint", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"] };
const RTL = /[֐-ࣿ]/;
const KIND = { presentation: "presentation", research_paper: "research paper", reflection_paper: "reflection paper", assignment: "assignment", quiz: "quiz" };

// Instructors for a course, with emails where the programme data has them.
function instructors(courseId) {
  return S.courseLecturers.filter((x) => x.course_id === courseId).map((x) => S.lecturers.find((l) => l.id === x.lecturer_id)).filter(Boolean);
}
const lecName = (l) => `${l.title && !/professor/i.test(l.title) ? l.title + " " : l.title ? "Prof. " : ""}${l.name}`.trim();

// Turns the text into blocks: "# Heading", "- bullet", or paragraph.
export function parseContent(text) {
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ t: "p", text: para.join(" ") }); para = []; } };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#{1,3}\s+/.test(line)) { flush(); blocks.push({ t: "h", text: line.replace(/^#{1,3}\s+/, "") }); }
    else if (/^[-*•]\s+/.test(line)) { flush(); blocks.push({ t: "li", text: line.replace(/^[-*•]\s+/, "") }); }
    else para.push(line);
  }
  flush();
  return blocks;
}

export function openSubmission(t, after) {
  const a = t.official;
  const c = getCourse(t.course_id);
  const lecs = instructors(t.course_id);
  const withEmail = lecs.filter((l) => l.email);
  const me = S.profile?.full_name || S.user.email;
  const kind = a ? KIND[a.type] || "assignment" : t.kind === "project" ? "project" : "assignment";
  const defFmt = a?.type === "presentation" ? "pptx" : "docx";
  openModal(`Prepare submission · ${t.title}`, (body, foot, close) => {
    body.innerHTML = `<form class="sub-grid" autocomplete="off">
      <div>
        <h3>1. Your document</h3>
        <div class="fmt-pick" role="radiogroup" aria-label="File format">${Object.entries(FMT).map(([k, [l]]) => `<label><input type="radio" name="fmt" value="${k}" ${k === defFmt ? "checked" : ""}> ${l}</label>`).join("")}</div>
        <div class="form-grid" style="margin-top:12px">
          <label class="field wide"><span>Title</span><input class="input" name="title" required maxlength="200" value="${esc(t.title)}"></label>
          <label class="field"><span>Your name</span><input class="input" name="student" required maxlength="120" value="${esc(me)}"></label>
          <label class="field"><span>Course</span><input class="input" name="course" maxlength="160" value="${esc(c?.name || "")}"></label>
          <label class="field wide"><span>Your work</span><textarea class="input" name="content" required placeholder="Write or paste your work here.&#10;&#10;# Introduction&#10;Start a line with # for a heading (a new slide in PowerPoint).&#10;- Start a line with - for a bullet point.">${esc(t.notes || "")}</textarea></label>
        </div>
        <p class="small muted" style="margin:6px 0 0">The file gets a cover page with the title, your name, the course, the instructor and today's date.</p>
      </div>
      <div>
        <h3>2. Email to the instructor</h3>
        <div class="form-grid">
          <label class="field wide"><span>Instructor</span><select class="input" name="lec">${lecs.map((l, i) => `<option value="${i}">${esc(lecName(l))}${l.email ? ` (${esc(l.email)})` : " (no email on file)"}</option>`).join("")}<option value="other">Someone else</option></select></label>
          <label class="field wide"><span>To</span><input class="input" type="email" name="to" multiple placeholder="instructor@example.com" value="${esc(withEmail[0]?.email || lecs.find((l) => l.email)?.email || "")}"></label>
          <label class="field wide"><span>Subject</span><input class="input" name="subject" maxlength="200"></label>
          <label class="field wide"><span>Message</span><textarea class="input" name="email_body"></textarea></label>
        </div>
        <label class="field" style="margin-top:10px"><span>Anything the email should mention? (optional)</span><input class="input" name="mention" maxlength="600" placeholder="e.g. I used the Varian textbook; sorry for the late submission"></label>
        <div class="row" style="margin-top:8px"><button class="btn sm" type="button" data-ai-email>Write the email with AI</button><span class="small muted">The AI writes the email only; your document stays exactly as you wrote it.</span></div>
        <label class="check" style="margin-top:10px"><input type="checkbox" name="keep" checked> Save a copy in this ${kind}'s files</label>
      </div>
    </form>`;
    const form = $("form", body);
    const lecOf = () => (form.lec.value === "other" ? null : lecs[Number(form.lec.value)]);
    const fmt = () => form.querySelector("input[name=fmt]:checked").value;
    const template = () => {
      const l = lecOf();
      form.subject.value = `${c?.short_name || c?.name || "Course"}: ${form.title.value.trim()} (${form.student.value.trim()})`;
      form.email_body.value = `Dear ${l ? lecName(l) : "Professor"},\n\nPlease find attached my ${kind}, "${form.title.value.trim()}", for ${form.course.value.trim() || "the course"}.\n\nThank you for your time. I would be glad to answer any questions.\n\nKind regards,\n${form.student.value.trim()}`;
    };
    template();
    form.lec.addEventListener("change", () => { const l = lecOf(); if (l?.email) form.to.value = l.email; else if (l) form.to.value = ""; template(); });
    $("[data-ai-email]", body).addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "Writing…";
      try {
        const l = lecOf();
        const r = await callFunction("hub-ai", { task: "email_draft", email: { title: form.title.value, course: form.course.value, instructor: l ? lecName(l) : "", student: form.student.value, kind, format: FMT[fmt()][0], note: form.mention.value.trim() } });
        form.subject.value = r.subject; form.email_body.value = r.body; toast("Email written. Check it before sending.");
      } catch (er) { errToast(er); }
      finally { b.disabled = false; b.textContent = "Write the email with AI"; }
    });

    foot.innerHTML = `<button class="btn" data-x style="margin-right:auto">Cancel</button><button class="btn" data-dl>Download file only</button><button class="btn" data-gmail>Open in Gmail</button><button class="btn primary" data-send>Send by email</button>`;
    foot.querySelector("[data-x]").onclick = close;
    const build = async () => {
      if (!form.reportValidity()) return null;
      const f = readForm(form);
      const l = lecOf();
      const meta = { title: f.title, student: f.student, course: f.course || "", instructor: l ? lecName(l) : "", date: fmtLong(S.today) };
      const blob = await makeFile(fmt(), meta, f.content);
      const name = `${(c?.short_name || "Submission")} - ${f.title} - ${f.student}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").slice(0, 120) + "." + FMT[fmt()][1];
      return { file: new File([blob], name, { type: FMT[fmt()][2] }), f };
    };
    const keepCopy = async (file) => {
      if (!form.keep.checked) return;
      try {
        let task = t;
        if (!task.id) { await saveTask(t, {}); task = S.tasks.find((x) => x.assessment_id === t.assessment_id) || t; }
        await uploadAttachment(file, { course_id: t.course_id, task_id: task.id });
      } catch (er) { console.warn(er); toast("The file was made, but saving a copy in your files failed.", "err"); }
    };
    const busy = (on) => foot.querySelectorAll("button").forEach((b) => { b.disabled = on; });
    const download = (file) => { const u = URL.createObjectURL(file); const x = document.createElement("a"); x.href = u; x.download = file.name; x.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
    const finish = (how) => {
      foot.innerHTML = `<span class="small" style="margin-right:auto">${esc(how)}</span><button class="btn" data-x>Close</button>${t.status !== "submitted" ? `<button class="btn primary" data-sub>Mark as ${TASK_STATUS.submitted.toLowerCase()}</button>` : ""}`;
      foot.querySelector("[data-x]").onclick = () => { close(); after && after(); };
      foot.querySelector("[data-sub]")?.addEventListener("click", async () => {
        try { await saveTask(t, { status: "submitted" }); toast("Marked as submitted"); close(); after && after(); window.dispatchEvent(new CustomEvent("hub:changed")); } catch (er) { errToast(er); }
      });
    };

    foot.querySelector("[data-dl]").onclick = async () => {
      busy(true);
      try { const r = await build(); if (!r) return; download(r.file); await keepCopy(r.file); toast(`${r.file.name} downloaded`); } catch (er) { errToast(er, "Couldn't create the file"); }
      finally { busy(false); }
    };
    foot.querySelector("[data-gmail]").onclick = async () => {
      busy(true);
      // Open the tab first (browsers block pop-ups opened after a delay), then fill it in.
      const win = window.open("", "_blank");
      try {
        const r = await build(); if (!r) { win?.close(); return; }
        download(r.file); await keepCopy(r.file);
        const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(r.f.to || "")}&su=${encodeURIComponent(r.f.subject || "")}&body=${encodeURIComponent(r.f.email_body || "")}`;
        if (win) win.location.href = url; else window.open(url, "_blank");
        finish(`Gmail opened with the email filled in. Attach "${r.file.name}" from your Downloads (paperclip icon), then press Send.`);
      } catch (er) { win?.close(); errToast(er, "Couldn't create the file"); busy(false); }
    };
    foot.querySelector("[data-send]").onclick = async () => {
      busy(true);
      try {
        const r = await build(); if (!r) { busy(false); return; }
        if (!r.f.to) { busy(false); return errToast(new Error("Enter the instructor's email address first.")); }
        await keepCopy(r.file);
        const text = `To: ${r.f.to}\nSubject: ${r.f.subject}\n\n${r.f.email_body}`;
        if (navigator.canShare && navigator.canShare({ files: [r.file] })) {
          try {
            await navigator.share({ files: [r.file], title: r.f.subject, text });
            return finish("Shared. In your email app, check the recipient and subject, then send.");
          } catch (er) { if (er?.name === "AbortError") { busy(false); return; } }
        }
        download(r.file);
        location.href = `mailto:${encodeURIComponent(r.f.to).replace(/%40/g, "@").replace(/%2C/gi, ",")}?subject=${encodeURIComponent(r.f.subject || "")}&body=${encodeURIComponent(r.f.email_body || "")}`;
        finish(`Your email app opened with the message filled in. Attach "${r.file.name}" from your Downloads, then send.`);
      } catch (er) { errToast(er, "Couldn't create the file"); busy(false); }
    };
  }, { wide: true });
}

// ── File builders ─────────────────────────────────────────
export async function makeFile(kind, meta, content) {
  const blocks = parseContent(content);
  if (kind === "docx") return makeDocx(meta, blocks);
  if (kind === "pptx") return makePptx(meta, blocks);
  return makePdf(meta, blocks);
}

async function makeDocx(meta, blocks) {
  await loadScript(LIB.docx);
  const d = window.docx;
  const P = (text, o = {}) => new d.Paragraph({ bidirectional: RTL.test(text), ...o, children: [new d.TextRun({ text, ...(o.run || {}) })] });
  const cover = [
    P("", { spacing: { before: 2400 } }),
    P(meta.title, { heading: d.HeadingLevel.TITLE, alignment: d.AlignmentType.CENTER }),
    P(meta.course, { alignment: d.AlignmentType.CENTER, spacing: { before: 400 }, run: { size: 28 } }),
    P(`Submitted by: ${meta.student}`, { alignment: d.AlignmentType.CENTER, spacing: { before: 800 }, run: { size: 24 } }),
    ...(meta.instructor ? [P(`Submitted to: ${meta.instructor}`, { alignment: d.AlignmentType.CENTER, run: { size: 24 } })] : []),
    P(meta.date, { alignment: d.AlignmentType.CENTER, run: { size: 24 } }),
  ];
  const main = blocks.map((b) => b.t === "h" ? P(b.text, { heading: d.HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } })
    : b.t === "li" ? P(b.text, { bullet: { level: 0 } })
    : P(b.text, { spacing: { after: 160 }, alignment: RTL.test(b.text) ? d.AlignmentType.RIGHT : d.AlignmentType.JUSTIFIED }));
  const doc = new d.Document({
    creator: meta.student, title: meta.title,
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children: cover }, { properties: { type: d.SectionType.NEXT_PAGE }, children: main }],
  });
  return d.Packer.toBlob(doc);
}

async function makePptx(meta, blocks) {
  await loadScript(LIB.pptx);
  const pres = new window.PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = meta.title; pres.author = meta.student;
  const NAVY = "14203A", GOLD = "B8913A", INK = "1F2A44";
  const s0 = pres.addSlide();
  s0.background = { color: NAVY };
  s0.addShape(pres.ShapeType.rect, { x: 0.8, y: 3.55, w: 1.2, h: 0.05, fill: { color: GOLD }, line: { color: GOLD } });
  s0.addText(meta.title, { x: 0.8, y: 1.4, w: 11.5, h: 2, fontFace: "Georgia", fontSize: 38, color: "F7F2E7", bold: true, valign: "bottom", rtlMode: RTL.test(meta.title) });
  s0.addText([meta.course, meta.instructor ? `Instructor: ${meta.instructor}` : "", `${meta.student} · ${meta.date}`].filter(Boolean).join("\n"), { x: 0.8, y: 3.8, w: 11.5, h: 1.8, fontFace: "Calibri", fontSize: 18, color: "D9DBE3", valign: "top" });
  // One slide per "# Heading"; without headings, about six lines per slide.
  const slides = [];
  let cur = null;
  for (const b of blocks) {
    if (b.t === "h" || !cur || (cur.items.length >= 6 && !cur.fromHeading)) { cur = { title: b.t === "h" ? b.text : cur?.title || meta.title, items: [], fromHeading: b.t === "h" }; slides.push(cur); if (b.t === "h") continue; }
    cur.items.push(b);
  }
  for (const sl of slides) {
    const s = pres.addSlide();
    s.background = { color: "FDFBF6" };
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: NAVY }, line: { color: NAVY } });
    s.addText(sl.title, { x: 0.7, y: 0.4, w: 11.9, h: 0.9, fontFace: "Georgia", fontSize: 28, bold: true, color: NAVY, rtlMode: RTL.test(sl.title) });
    s.addShape(pres.ShapeType.rect, { x: 0.7, y: 1.3, w: 1, h: 0.04, fill: { color: GOLD }, line: { color: GOLD } });
    const runs = sl.items.map((b) => ({ text: b.text, options: { bullet: b.t === "li" ? { indent: 18 } : false, breakLine: true, paraSpaceAfter: 8, rtlMode: RTL.test(b.text) } }));
    if (runs.length) s.addText(runs, { x: 0.7, y: 1.55, w: 11.9, h: 5.4, fontFace: "Calibri", fontSize: sl.items.reduce((n, b) => n + b.text.length, 0) > 700 ? 14 : 18, color: INK, valign: "top", fit: "shrink" });
    s.addText(`${meta.student} · ${meta.course}`, { x: 0.7, y: 7.0, w: 11.9, h: 0.3, fontSize: 10, color: "8C92A5" });
  }
  return pres.write({ outputType: "blob" });
}

async function makePdf(meta, blocks) {
  await loadScript(LIB.pdf);
  const { jsPDF } = window.jspdf;
  // The built-in PDF fonts have no Arabic letters, so Arabic text is laid out as an image of the page.
  if (blocks.some((b) => RTL.test(b.text)) || RTL.test(meta.title)) return pdfFromHtml(meta, blocks, jsPDF);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const L = 22, W = 166, BOTTOM = 275;
  pdf.setFont("times", "bold"); pdf.setFontSize(24);
  pdf.text(pdf.splitTextToSize(meta.title, W), 105, 90, { align: "center" });
  pdf.setFont("times", "normal"); pdf.setFontSize(14);
  [meta.course, "", `Submitted by: ${meta.student}`, meta.instructor ? `Submitted to: ${meta.instructor}` : "", meta.date].filter((x, i) => x || i === 1)
    .forEach((line, i) => pdf.text(line, 105, 125 + i * 9, { align: "center" }));
  pdf.addPage();
  let y = 25;
  const need = (h) => { if (y + h > BOTTOM) { pdf.addPage(); y = 25; } };
  for (const b of blocks) {
    if (b.t === "h") { pdf.setFont("times", "bold"); pdf.setFontSize(15); const ls = pdf.splitTextToSize(b.text, W); need(ls.length * 7 + 4); y += 3; pdf.text(ls, L, y); y += ls.length * 7 + 2; continue; }
    pdf.setFont("times", "normal"); pdf.setFontSize(12);
    const ls = pdf.splitTextToSize(b.t === "li" ? b.text : b.text, b.t === "li" ? W - 6 : W);
    for (const [i, ln] of ls.entries()) { need(6); if (b.t === "li" && i === 0) pdf.text("•", L + 1, y); pdf.text(ln, b.t === "li" ? L + 6 : L, y); y += 6; }
    y += b.t === "li" ? 1 : 4;
  }
  const n = pdf.getNumberOfPages();
  for (let i = 2; i <= n; i++) { pdf.setPage(i); pdf.setFontSize(9); pdf.setTextColor(120); pdf.text(`${meta.student} · ${meta.title}`, L, 288); pdf.text(`${i - 1} / ${n - 1}`, 188, 288, { align: "right" }); pdf.setTextColor(0); }
  return pdf.output("blob");
}

async function pdfFromHtml(meta, blocks, jsPDF) {
  await loadScript(LIB.h2c);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;font:16px/1.6 'Segoe UI',Tahoma,Arial,sans-serif;padding:60px 70px;";
  host.innerHTML = `<div style="text-align:center;margin:120px 0 180px"><h1 style="font:700 30px/1.3 Georgia,serif">${esc(meta.title)}</h1><p>${esc(meta.course)}</p><p style="margin-top:60px">Submitted by: ${esc(meta.student)}</p>${meta.instructor ? `<p>Submitted to: ${esc(meta.instructor)}</p>` : ""}<p>${esc(meta.date)}</p></div>` +
    blocks.map((b) => b.t === "h" ? `<h2 dir="auto" style="font:700 20px/1.4 Georgia,serif;margin:22px 0 8px">${esc(b.text)}</h2>` : b.t === "li" ? `<div dir="auto" style="padding-inline-start:18px">• ${esc(b.text)}</div>` : `<p dir="auto" style="text-align:justify">${esc(b.text)}</p>`).join("");
  document.body.appendChild(host);
  try {
    const canvas = await window.html2canvas(host, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageH = Math.floor(canvas.width * 297 / 210);
    for (let y = 0, i = 0; y < canvas.height; y += pageH, i++) {
      const part = document.createElement("canvas"); part.width = canvas.width; part.height = Math.min(pageH, canvas.height - y);
      part.getContext("2d").drawImage(canvas, 0, -y);
      if (i) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, part.height * 210 / canvas.width);
    }
    return pdf.output("blob");
  } finally { host.remove(); }
}

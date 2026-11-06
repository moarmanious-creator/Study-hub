// Welcome screen: shown once a day on opening the Hub. A personal greeting, then one simple
// list of lectures that have taken place but aren't studied yet, and the next deadlines.
import { esc, fmtDate, fmtLong, relDays, $ } from "../lib.js?v=202611061458";
import { S } from "../store.js?v=202611061458";
import { coursePill, cvar } from "../ui.js?v=202611061458";
import { CREST, firstName, greeting, pendingLectures, pendingItem, dueSoon, wirePending } from "./common.js?v=202611061458";

const key = (k) => `mlea_${k}_${S.user?.id || "anon"}`;
const read = (k) => { try { return localStorage.getItem(key(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(key(k), v); } catch { /* private mode */ } };

// Shows the screen unless it was already shown today on this device (or `force`).
export function maybeWelcome({ force = false } = {}) {
  if (window.__HUB_NO_WELCOME && !force) return;
  if (!force && read("welcome_day") === S.today) return;
  showWelcome();
}

export function showWelcome() {
  const firstTime = !read("welcomed");
  const name = firstName();
  const pending = pendingLectures();
  const due = dueSoon(14).slice(0, 3);
  const shown = pending.slice(0, 5);
  const host = document.createElement("div");
  host.className = "welcome";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-labelledby", "welcomeTitle");
  host.innerHTML = `<div class="welcome-inner">
    ${CREST(48)}
    <p class="eyebrow">${esc(fmtLong(S.today))}</p>
    <h1 id="welcomeTitle">${firstTime ? `Welcome to Student Hub${name ? `, ${esc(name)}` : ""}.` : `${greeting()}${name ? `, ${esc(name)}` : ""}.`}</h1>
    <p class="lead">${firstTime
      ? "Your private study portal: every lecture, assignment, project and file for the programme in one place, with an AI study assistant beside you."
      : pending.length ? `You have ${pending.length} lecture${pending.length === 1 ? "" : "s"} waiting to be studied.` : "You're fully up to date with every lecture so far."}</p>
    ${firstTime ? `<div class="intro">
      <div><b>Study</b>Tick off each lecture as you study it. The Hub tracks what's left.</div>
      <div><b>Assignments &amp; projects</b>Official deadlines are already in. Add your own any time.</div>
      <div><b>AI assistant</b>Ask about any lecture, get summaries, practice questions and study notes.</div>
    </div>` : ""}
    <div class="card">
      <h2>Waiting for you</h2>
      <p class="sub">${pending.length ? "Lectures that have taken place and aren't fully studied yet, oldest first." : "Nothing pending."}</p>
      ${shown.length ? `<ul class="pending">${shown.map(pendingItem).join("")}</ul>${pending.length > shown.length ? `<p class="small muted" style="margin:10px 0 0">and ${pending.length - shown.length} more on the <a href="#/study" data-go>Study page</a>.</p>` : ""}`
        : `<p style="margin:6px 0 0">Well done. Use the time to revise or read ahead for the next lecture.</p>`}
      ${due.length ? `<hr class="hr"><h2 style="font-size:1.25rem">Coming deadlines</h2><ul class="pending" style="margin-top:4px">${due.map((t) => `<li style="${t.course_id ? cvar(t.course_id) : ""}"><span class="bar"></span><div><div class="t">${esc(t.title)}</div><div class="d">${coursePill(t.course_id)} · ${esc(fmtDate(t.due_date))} · ${esc(relDays(t.due_date, S.today))}</div></div><div class="acts"><button class="btn sm" data-open-task="${esc(t.id || "a:" + t.assessment_id)}">Open</button></div></li>`).join("")}</ul>` : ""}
    </div>
    <div class="w-actions">
      <button class="btn gold" data-enter>Enter my dashboard</button>
      ${shown.length ? `<button class="btn" data-start="${shown[0].s.id}">Start with the first lecture</button>` : ""}
      <button class="btn" data-ai>Ask the AI assistant</button>
    </div>
  </div>`;
  document.body.appendChild(host);
  write("welcome_day", S.today);
  write("welcomed", "1");
  const prevFocus = document.activeElement;
  const close = () => { host.remove(); document.removeEventListener("keydown", onKey); window.dispatchEvent(new CustomEvent("hub:changed")); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  $("[data-enter]", host).addEventListener("click", () => { close(); location.hash = "#/dashboard"; });
  $("[data-go]", host)?.addEventListener("click", () => close());
  $("[data-ai]", host).addEventListener("click", () => { close(); window.dispatchEvent(new CustomEvent("hub:ai", { detail: {} })); });
  $("[data-start]", host)?.addEventListener("click", (e) => { close(); window.dispatchEvent(new CustomEvent("hub:open-session", { detail: e.currentTarget.dataset.start })); });
  // "Open" buttons use the app's delegated handlers; close the welcome screen first so the drawer is visible.
  host.querySelectorAll("[data-open-session],[data-open-task],[data-study-note]").forEach((b) => b.addEventListener("click", () => close(), { capture: true }));
  wirePending(host);
  setTimeout(() => $("[data-enter]", host)?.focus({ preventScroll: true }), 30);
}

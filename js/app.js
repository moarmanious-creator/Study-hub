// Student Hub — app shell: session handling, navigation, routing, global search.
import { esc, $, $$, icon, initials, toast, errToast, todayISO, closeDrawer } from "./lib.js?v=202611061520";
import { S, sb, configured, loadAll, loadProfile, loadPersonal, isAdmin, isStaff, courseSessions, isProject } from "./store.js?v=202611061520";
import { renderAuth, hideAuth } from "./views/auth.js?v=202611061520";
import { renderDashboard } from "./views/dashboard.js?v=202611061520";
import { renderCourse, openSession, openFile } from "./views/course.js?v=202611061520";
import { renderCalendar, startReminders } from "./views/calendar.js?v=202611061520";
import { renderTasks, openTask, findTask } from "./views/tasks.js?v=202611061520";
import { renderDocuments, preview } from "./views/documents.js?v=202611061520";
import { renderAnalytics } from "./views/analytics.js?v=202611061520";
import { renderStudents, renderAcademicData, renderAnnouncements, renderCohort } from "./views/admin.js?v=202611061520";
import { renderAccount } from "./views/account.js?v=202611061520";
import { initAI } from "./views/ai.js?v=202611061520";
import { renderStudy } from "./views/study.js?v=202611061520";
import { renderProjects, openProject } from "./views/projects.js?v=202611061520";
import { maybeWelcome, renderWelcome } from "./views/welcome.js?v=202611061520";
import { renderLecture, markOpened } from "./views/lecture.js?v=202611061520";
import { initNotifications, registerWorker } from "./views/notify.js?v=202611061520";
import { pendingLectures } from "./views/common.js?v=202611061520";
import { openStudyNote } from "./views/notes.js?v=202611061520";
import { ledgerCells } from "./ui.js?v=202611061520";
import { isStudyTracked } from "./metrics.js?v=202611061520";

const ROUTES = {
  welcome: ["Welcome", renderWelcome],
  dashboard: ["Dashboard", renderDashboard],
  study: ["Study", renderStudy],
  assignments: ["Assignments", renderTasks],
  projects: ["Projects", renderProjects],
  documents: ["Documents & materials", renderDocuments],
  calendar: ["Academic calendar", renderCalendar],
  analytics: ["My progress", renderAnalytics],
  announcements: ["Announcements", renderAnnouncements],
  account: ["Account", renderAccount],
  students: ["Students & access", renderStudents],
  data: ["Academic data", renderAcademicData],
  cohort: ["Cohort dashboard", renderCohort],
};

const ALIASES = { tasks: "assignments", plan: "study" };

function nav() {
  const r = currentRoute();
  const link = (href, label, ic, extra = "") => `<a class="nav-link" href="#/${href}" ${r.path === href ? 'aria-current="page"' : ""}>${ic}<span>${label}</span>${extra}</a>`;
  const courseLinks = S.courses.map((c) => {
    const n = courseSessions(c.id).filter(isStudyTracked).length;
    return `<a class="nav-link nav-course" href="#/course/${c.id}" ${r.path === "course/" + c.id ? 'aria-current="page"' : ""}><span class="dot" style="background:var(--c-${c.id}, ${esc(c.color)});margin-top:6px"></span><span style="min-width:0"><span class="nc-name">${esc(c.short_name || c.name)}</span>${ledgerCells(c.id, { mini: true })}</span><span class="count">${n}</span></a>`;
  }).join("");
  const pending = pendingLectures().length;
  $("#nav").innerHTML = `
    ${link("welcome", "Welcome", icon.next)}
    ${link("dashboard", "Dashboard", icon.dash)}
    ${link("study", "Study", icon.study, pending ? `<span class="count hot" title="Lectures waiting to be studied">${pending}</span>` : "")}
    ${link("assignments", "Assignments", icon.tasks)}
    ${link("projects", "Projects", icon.project)}
    ${link("documents", "Documents & materials", icon.docs)}
    ${link("calendar", "Calendar", icon.cal)}
    ${link("announcements", "Announcements", icon.bell, S.announcements.length ? `<span class="count">${S.announcements.length}</span>` : "")}
    ${link("analytics", "My progress", icon.chart)}
    <button class="nav-link ai-link" type="button" data-ai-nav>${icon.spark}<span>AI Study Assistant</span></button>

    <div class="nav-group">Courses</div>${courseLinks || `<span class="muted small" style="padding:0 10px">No courses yet</span>`}
    ${isStaff() ? `<div class="nav-group">Programme admin</div>${isAdmin() ? link("students", "Students & access", icon.users) : ""}${link("data", "Academic data", icon.data)}${link("cohort", "Cohort dashboard", icon.cohort)}` : ""}`;
  $("#sideFoot").innerHTML = `<a class="who nav-link" href="#/account"><span class="avatar">${esc(initials(S.profile?.full_name || S.user.email))}</span><span style="min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(S.profile?.full_name || S.user.email)}</span>${S.profile?.role !== "student" ? `<span class="role-tag">${esc(S.profile.role)}</span>` : ""}</span></a>`;
}

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  let [a, b, c] = h.split("/");
  if (a === "course" && b) return { path: `course/${b}`, course: b, tab: c };
  if (a === "lecture" && b) return { path: `lecture/${b}`, lecture: b };
  a = ALIASES[a] || a; // old links keep working
  return { path: ROUTES[a] ? a : "dashboard" };
}

let rendering = false;
function render() {
  if (!S.loaded || rendering) return;
  rendering = true;
  try {
    const r = currentRoute();
    const view = $("#view");
    if (r.lecture) {
      const s = S.sessions.find((x) => x.id === r.lecture);
      const c = s && S.courses.find((x) => x.id === s.course_id);
      $("#pageTitle").textContent = c ? c.short_name || c.name : "Lecture";
      document.title = `${s?.title || "Lecture"} · Student Hub`;
      renderLecture(view, r.lecture);
    } else if (r.course) {
      const c = S.courses.find((x) => x.id === r.course);
      $("#pageTitle").textContent = c ? c.short_name || c.name : "Course";
      document.title = `${c?.short_name || "Course"} · Student Hub`;
      renderCourse(view, r.course, r.tab);
    } else {
      const [title, fn] = ROUTES[r.path];
      $("#pageTitle").textContent = title;
      document.title = `${title} · Student Hub`;
      fn(view);
    }
    nav();
    closeMenu();
  } catch (e) { errToast(e); console.error(e); }
  finally { rendering = false; }
}
const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };

function closeMenu() { $("#side").classList.remove("open"); $("#menuBtn").setAttribute("aria-expanded", "false"); $(".scrim.menu")?.remove(); }
function wireShell() {
  $("#menuBtn").addEventListener("click", () => {
    const side = $("#side");
    side.classList.add("open"); $("#menuBtn").setAttribute("aria-expanded", "true");
    const scrim = document.createElement("div"); scrim.className = "scrim menu"; scrim.addEventListener("click", closeMenu); document.body.appendChild(scrim);
  });
  $("#themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("hub-theme", document.documentElement.dataset.theme); } catch { /* ignore */ }
    rerender();
  });
  window.addEventListener("hashchange", () => { closeDrawer(); render(); $("#view").focus({ preventScroll: true }); window.scrollTo(0, 0); });
  window.addEventListener("hub:changed", () => { if ($("#drawer").hidden && $("#modal").hidden) rerender(); else pendingRerender = true; });
  // Projects open in their own editor wherever they're linked from.
  const openAny = (t) => (t && isProject(t) ? openProject(t, rerender) : openTask(t, rerender));
  window.addEventListener("hub:task", (e) => openAny(e.detail));
  window.addEventListener("hub:open-session", (e) => { location.hash = `#/lecture/${e.detail}`; });
  window.addEventListener("hub:preview", (e) => preview(e.detail));
  // Re-render after a drawer or dialog closes if something changed underneath it.
  let pendingRerender = false;
  new MutationObserver(() => { if (pendingRerender && $("#drawer").hidden && $("#modal").hidden) { pendingRerender = false; rerender(); } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

  // Delegated openers used across views.
  document.addEventListener("click", (e) => {
    const mk = e.target.closest("[data-mark]");
    if (mk) markOpened(mk); // the link or file still opens below / by default
    const s = e.target.closest("[data-open-session]");
    if (s) { e.preventDefault(); closeDrawer(); location.hash = `#/lecture/${s.dataset.openSession}`; return; }
    const sn = e.target.closest("[data-study-note]");
    if (sn) { e.preventDefault(); closeDrawer(); return openStudyNote(sn.dataset.studyNote, sn.dataset.part || "sheet"); }
    const t = e.target.closest("[data-open-task]");
    if (t) { e.preventDefault(); return openAny(findTask(t.dataset.openTask)); }
    if (e.target.closest("[data-ai-nav]")) { closeMenu(); return window.dispatchEvent(new CustomEvent("hub:ai", { detail: {} })); }

    const of = e.target.closest("[data-official-file]");
    if (of) { e.preventDefault(); return openFile("official", of.dataset.officialFile); }
    const mf = e.target.closest("[data-my-file]");
    if (mf) { e.preventDefault(); return openFile("mine", mf.dataset.myFile); }
  });

  // Global search across lectures, tasks, files and notes.
  const input = $("#globalSearch"), box = $("#searchResults");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.hidden = true; return; }
    const hit = (s) => (s || "").toLowerCase().includes(q);
    const res = [
      ...S.sessions.filter((s) => hit(s.title) || (s.topics || []).some(hit) || hit(s.label)).map((s) => ({ kind: "Lecture", label: `${S.courses.find((c) => c.id === s.course_id)?.short_name}: ${s.label || ""} ${s.title}`, attr: `data-open-session="${s.id}"` })),
      ...S.assessments.filter((a) => hit(a.title)).map((a) => ({ kind: "Assessment", label: a.title, attr: `data-open-task="a:${a.id}"` })),
      ...S.tasks.filter((t) => !t.assessment_id && hit(t.title)).map((t) => ({ kind: "Task", label: t.title, attr: `data-open-task="${t.id}"` })),
      ...S.attachments.filter((a) => hit(a.name) || hit(a.description)).map((a) => ({ kind: "My file", label: a.name, attr: `data-my-file="${a.id}"` })),
      ...S.materials.filter((m) => hit(m.title)).map((m) => ({ kind: "Course material", label: m.title, attr: m.storage_path ? `data-official-file="${m.id}"` : `data-url="${esc(m.url || "")}"` })),
      ...S.notes.filter((n) => hit(n.title) || hit(n.body)).map(() => ({ kind: "Note", label: "Open My notes", attr: `data-href="#/documents"` })),
    ].slice(0, 14);
    box.innerHTML = res.length ? res.map((r) => `<a href="#" ${r.attr}><span class="kind">${esc(r.kind)}</span><br>${esc(r.label)}</a>`).join("") : `<div class="muted small" style="padding:10px">No matches.</div>`;
    box.hidden = false;
  });
  box.addEventListener("click", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    if (a.dataset.url) { e.preventDefault(); window.open(a.dataset.url, "_blank", "noopener"); }
    if (a.dataset.href) { e.preventDefault(); location.hash = a.dataset.href; }
    box.hidden = true; input.value = "";
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search") && !e.target.closest("#searchResults")) box.hidden = true; });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { box.hidden = true; input.blur(); } });

  // Keep "today" right if the tab stays open past midnight; refresh personal data when returning.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !S.loaded) return;
    const t = todayISO();
    try { await loadPersonal(); } catch { /* offline: keep what we have */ }
    if (t !== S.today) S.today = t;
    if ($("#drawer").hidden && $("#modal").hidden) rerender();
  });
}

const signOutBtn = `<p style="margin-top:14px"><button class="btn" type="button" onclick="window.__hubSignOut()">Sign out</button></p>`;
// Local sign-out works even when the account was deleted on the server; the page then reloads to the sign-in screen.
async function signOutTo(note = "") {
  try { if (note) sessionStorage.setItem("mlea_auth_note", note); } catch { /* storage blocked */ }
  try { await sb.auth.signOut({ scope: "local" }); } catch { /* already signed out */ }
  location.hash = ""; location.reload();
}
window.__hubSignOut = () => signOutTo();

function showBanner(html) { const b = $("#banner"); b.innerHTML = html; b.hidden = false; }

async function start(session) {
  S.user = session.user;
  hideAuth();
  $("#shell").hidden = false;
  $("#view").innerHTML = `<div class="loading">Loading your records…</div>`;
  try {
    const p = await loadProfile();
    if (!p) {
      // The saved sign-in can outlive its account (deleted by an admin). Ask the server; if the account is gone, sign out quietly.
      const { data: u, error: ue } = await sb.auth.getUser();
      if (ue || !u?.user) return signOutTo("That account no longer exists. Sign in with another account, or tap \"Create an account\".");
      // A brand-new account's profile is written by a database trigger; give it a moment once.
      await new Promise((r) => setTimeout(r, 1500));
      if (!(await loadProfile())) {
        $("#view").innerHTML = `<div class="empty"><strong>Your account isn't fully set up yet.</strong>Sign out and sign in again. If this keeps happening, tell the programme admin.${signOutBtn}</div>`;
        return;
      }
      return start(session);
    }
    if (!p.active) { $("#view").innerHTML = `<div class="empty"><strong>This account has been deactivated.</strong>Contact the programme admin to restore access.${signOutBtn}</div>`; return; }
    await loadAll();
    if (!S.courses.length) showBanner(isStaff() ? `No academic data yet. Open <a href="#/data">Academic data → Import</a> and load the 2026/27 data.` : "The programme hasn't published the courses yet. Check back soon.");
    render();
    initAI();
    registerWorker();
    initNotifications();
    maybeWelcome();
    startReminders();
  } catch (e) {
    console.error(e);
    const m = String(e.message || e);
    $("#view").innerHTML = /relation .* does not exist|schema cache|Could not find the table/i.test(m)
      ? `<div class="info-req"><strong>The database hasn't been set up for the Hub yet.</strong> The programme admin needs to run <code>supabase/hub_setup.sql</code> in the Supabase SQL Editor (see DEPLOY.md).</div>`
      : `<div class="empty"><strong>Couldn't load your records.</strong>${esc(m)}<br><button class="btn" onclick="location.reload()" style="margin-top:10px">Try again</button></div>`;
  }
}

async function boot() {
  if (!configured) {
    const web = "https://moarmanious-creator.github.io/Study-hub/";
    // A file preview (phone file viewers, mail and chat apps) blocks the sign-in service; point people to the web address.
    document.body.innerHTML = window.supabase
      ? `<div class="empty" style="padding:60px"><strong>The Hub isn't connected to its database.</strong>Set SUPABASE_URL and SUPABASE_ANON_KEY in config.js.</div>`
      : `<div class="empty" style="padding:48px 24px;max-width:520px;margin:0 auto"><strong>Open the Hub in your browser</strong>This preview can't connect to the sign-in service. Open the link below in Safari or Chrome, then use Share → Add to Home Screen to keep it like an app.<p style="margin-top:16px"><a class="btn primary" href="${web}" target="_blank" rel="noopener">Open Student Hub</a></p><p class="small muted" style="word-break:break-all">${web}</p><p class="small muted" dir="rtl" lang="ar">المعاينة دي مش بتتصل بالسيرفر. افتح الرابط في Safari أو Chrome، وبعدها مشاركة ← إضافة إلى الشاشة الرئيسية.</p></div>`;
    return;
  }
  wireShell();
  let started = false;
  // Accounts created by an admin with a temporary password must choose their own before using the Hub.
  const mustSetPw = (s) => window.__authLinkType === "invite" || window.__authLinkType === "recovery" || s?.user?.user_metadata?.must_change_password === true;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { $("#shell").hidden = true; renderAuth("setpw"); return; }
    if (event === "SIGNED_OUT") { location.reload(); return; }
    if (event === "SIGNED_IN" && session && !started) {
      if (mustSetPw(session)) { $("#shell").hidden = true; renderAuth("setpw"); return; }
      started = true; start(session);
    }
  });
  const { data: { session } } = await sb.auth.getSession();
  if (session && !started) {
    if (mustSetPw(session)) { renderAuth("setpw"); return; }
    started = true; start(session);
  } else if (!session) {
    const err = new URLSearchParams(location.hash.slice(1)).get("error_description");
    let note = "";
    try { note = sessionStorage.getItem("mlea_auth_note") || ""; sessionStorage.removeItem("mlea_auth_note"); } catch { /* storage blocked */ }
    renderAuth("signin", err ? "!" + err.replace(/\+/g, " ") : note ? "!" + note : "");
  }
}
boot().catch((e) => { console.error(e); toast("The Hub failed to start. Reload the page.", "err"); });

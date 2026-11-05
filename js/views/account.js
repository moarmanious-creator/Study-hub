// Account: name, password, data export, sign-out.
import { esc, toast, errToast, download, readForm, $ } from "../lib.js?v=202611051410";
import { S, sb, updateMyName } from "../store.js?v=202611051410";

export function renderAccount(view) {
  view.innerHTML = `<div class="grid two">
    <div class="sheet"><h3>Your details</h3><form class="stack" style="margin-top:10px" data-name>
      <label class="field"><span>Full name</span><input class="input" name="full_name" value="${esc(S.profile?.full_name || "")}" required></label>
      <label class="field"><span>Email</span><input class="input" value="${esc(S.user.email)}" disabled></label>
      <p class="small muted">Role: ${esc(S.profile?.role)}</p>
      <button class="btn primary" type="submit">Save name</button></form></div>
    <div class="sheet"><h3>Change password</h3><form class="stack" style="margin-top:10px" data-pw>
      <label class="field"><span>New password (at least 8 characters)</span><input class="input" type="password" name="pw" minlength="8" required autocomplete="new-password"></label>
      <label class="field"><span>Repeat it</span><input class="input" type="password" name="pw2" minlength="8" required autocomplete="new-password"></label>
      <button class="btn" type="submit">Change password</button></form></div>
    <div class="sheet"><h3>Your data</h3><p class="small">Download everything you've recorded: attendance, study progress, tasks, events, study log, notes, AI conversations and the list of your files.</p>
      <button class="btn" data-export>Download my data (JSON)</button>
      <p class="small muted" style="margin-top:10px">Only you can see these records. The programme admin sees cohort averages, never your notes, files or comments. To delete your account, ask the admin.</p></div>
    <div class="sheet"><h3>Sign out</h3><p class="small">Your records are saved online, so you can sign in again from any device.</p><button class="btn" data-out>Sign out</button></div>
  </div>`;
  $("[data-name]", view).addEventListener("submit", async (e) => { e.preventDefault(); try { await updateMyName(readForm(e.target).full_name); toast("Saved"); } catch (er) { errToast(er); } });
  $("[data-pw]", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    if (f.pw !== f.pw2) return toast("The two passwords don't match", "err");
    const { error } = await sb.auth.updateUser({ password: f.pw });
    if (error) return errToast(error);
    e.target.reset(); toast("Password changed");
  });
  $("[data-export]", view).addEventListener("click", async () => {
    const [conv, msgs] = await Promise.all([sb.from("ai_conversations").select("*").eq("user_id", S.user.id), sb.from("ai_messages").select("*").eq("user_id", S.user.id)]);
    const out = { exported_at: new Date().toISOString(), profile: S.profile, attendance: [...S.attendance.values()], study_progress: [...S.progress.values()], tasks: S.tasks, calendar_events: S.events,
      study_log: S.logs, notes: S.notes, files: S.attachments.map(({ storage_path, ...a }) => a), ai_conversations: conv.data || [], ai_messages: msgs.data || [] };
    download(`student-hub-my-data-${S.today}.json`, JSON.stringify(out, null, 2), "application/json");
  });
  $("[data-out]", view).addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); });
}

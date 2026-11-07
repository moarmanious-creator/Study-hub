// Sign-in, account creation (open to anyone with the link), password reset and set-password screens.
import { esc, $ } from "../lib.js?v=202611070657";
import { sb, siteUrl } from "../store.js?v=202611070657";

const art = () => {
  const rows = [[1, 1, .5, 1, 0, .3, 0, 0], [1, .5, 1, 1, 1, 0, 0, 0], [1, 1, 1, .5, .3, 0, 0, 0], [0, 1, 1, 1, 0, 0, 0, 0]];
  const st = [[1, .6, .3, .2, 0, .2, 0, 0], [.6, .3, .6, .3, .2, 0, 0, 0], [1, 1, .6, .3, 0, 0, 0, 0], [0, .6, .3, .2, 0, 0, 0, 0]];
  return `<div class="art-ledger" aria-hidden="true">${rows.map((r, i) => `<div>${r.map((a, j) => `<span style="--a:${a * .85};--s:${st[i][j] * .85}"></span>`).join("")}</div>`).join("")}</div>`;
};

function friendly(e) {
  const m = (e?.message || String(e || "")).toLowerCase();
  if (m.includes("invalid login")) return "Email or password is incorrect.";
  if (m.includes("email not confirmed")) return "Confirm your email first: open the link we sent you, then sign in.";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists")) return "This email already has an account. Sign in, or use \"Forgot password?\" if you don't remember the password.";
  if (m.includes("database error")) return "The account couldn't be created just now. Wait a minute and try again; if it keeps happening, tell the programme admin.";
  if (m.includes("failed to fetch") || m.includes("network")) return "No connection to the sign-in service. Check your internet and try again.";
  if (m.includes("password should be")) return "Use a password of at least 8 characters.";
  if (m.includes("rate limit")) return "The Hub can't send more emails right now (free email limit). Try again in an hour, or ask the programme admin to create your account.";
  if (m.includes("banned") || m.includes("user is banned")) return "This account has been deactivated. Contact the programme admin.";
  return e?.message || "Something went wrong. Try again.";
}

export function renderAuth(mode = "signin", note = "") {
  const host = $("#auth");
  host.hidden = false;
  const forms = {
    signin: `<h2>Sign in</h2>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Sign in</button>
      <div class="row small"><button type="button" class="btn ghost sm" data-mode="forgot">Forgot password?</button><button type="button" class="btn ghost sm" data-mode="signup">Create an account</button></div>`,
    signup: `<h2>Create your account</h2>
      <p class="muted small">Use the email the programme admin added to the programme list.</p>
      <label class="field"><span>Full name</span><input class="input" name="full_name" autocomplete="name" required></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password (at least 8 characters)</span><input class="input" name="password" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn primary" type="submit">Create account</button>
      <button type="button" class="btn ghost sm" data-mode="signin">I already have an account</button>`,
    forgot: `<h2>Reset your password</h2>
      <p class="muted small">We'll email you a link to choose a new password.</p>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <button class="btn primary" type="submit">Send reset link</button>
      <button type="button" class="btn ghost sm" data-mode="signin">Back to sign in</button>`,
    setpw: `<h2>Choose your password</h2>
      <p class="muted small">You'll use it with your email to sign in from any device.</p>
      <label class="field"><span>New password (at least 8 characters)</span><input class="input" name="password" type="password" minlength="8" autocomplete="new-password" required></label>
      <label class="field"><span>Repeat the password</span><input class="input" name="password2" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn primary" type="submit">Save password</button>`,
  };
  host.innerHTML = `<div class="auth">
    <div class="auth-art">
      <div><h1>Student Hub</h1><p style="margin-top:14px">Your lectures, attendance, study progress and deadlines for your master's programme, in one place. Each student's records are private to them.</p></div>
      ${art()}
      <p class="small" style="opacity:.8">Independent student tool. Not affiliated with or endorsed by any university.</p>
    </div>
    <div class="auth-form"><form novalidate>${note ? `<div class="auth-msg ${note.startsWith("!") ? "err" : ""}">${esc(note.replace(/^!/, ""))}</div>` : ""}${forms[mode]}</form></div>
  </div>`;
  const form = $("form", host);
  host.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => renderAuth(b.dataset.mode)));
  setTimeout(() => $("input", form)?.focus(), 20);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw error;
      } else if (mode === "signup") {
        if ((f.password || "").length < 8) throw new Error("Password should be at least 8 characters");
        const { data, error } = await sb.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.full_name.trim() }, emailRedirectTo: siteUrl() } });
        if (error) throw error;
        if (!data.session) return renderAuth("signin", "Check your inbox and open the confirmation link, then sign in.");
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: siteUrl() });
        if (error) throw error;
        return renderAuth("signin", "If that email is registered, a reset link is on its way.");
      } else if (mode === "setpw") {
        if (f.password !== f.password2) throw new Error("The two passwords don't match.");
        if ((f.password || "").length < 8) throw new Error("Password should be at least 8 characters");
        const { error } = await sb.auth.updateUser({ password: f.password, data: { must_change_password: false } });
        if (error) throw error;
        window.__authLinkType = null;
        history.replaceState(null, "", location.pathname + "#/dashboard");
        location.reload();
      }
    } catch (e) {
      btn.disabled = false;
      const msg = $(".auth-msg", form) || form.insertAdjacentElement("afterbegin", Object.assign(document.createElement("div"), { className: "auth-msg err" }));
      msg.className = "auth-msg err";
      msg.textContent = friendly(e);
    }
  });
}
export const hideAuth = () => { const h = $("#auth"); h.hidden = true; h.innerHTML = ""; };

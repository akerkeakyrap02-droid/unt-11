import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, USERNAME_EMAIL_DOMAIN } from "./config.js";

const app = document.getElementById("app");
const configured = SUPABASE_URL && !SUPABASE_URL.includes("YOUR-PROJECT");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let profile = null;
let flash = "";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Theme ---------- */
function storedTheme() {
  try { return localStorage.getItem("etp-theme"); } catch { return null; }
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("etp-theme", t); } catch { /* private mode */ }
}
document.documentElement.dataset.theme =
  storedTheme() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const toggleTheme = () =>
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

/* ---------- Helpers ---------- */
const toAuthEmail = (id) => {
  const v = id.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${USERNAME_EMAIL_DOMAIN}`;
};
const isSyntheticEmail = (e) => !!e && e.endsWith(`@${USERNAME_EMAIL_DOMAIN}`);

function friendly(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Wrong username/email or password.";
  if (m.includes("database error")) return "Could not create the account. That username or email may already be taken.";
  if (m.includes("already registered")) return "That username or email is already registered. Try logging in.";
  if (m.includes("password")) return error.message;
  if (m.includes("fetch") || m.includes("network")) return "No connection. Check your internet and try again.";
  return error?.message || "Something went wrong. Try again.";
}

function setMsg(text, kind = "error") {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${text ? kind : ""}`;
}

/* ---------- Views ---------- */
function authShell(inner) {
  app.innerHTML = `
    <main class="auth">
      <section class="auth-hero" aria-label="About English Test Prep">
        <h1>English Test Prep</h1>
        <p class="sample">She is interested <span class="gap" aria-label="in"></span> music.</p>
        <ul class="chips" aria-hidden="true">
          <li class="right">A) in</li><li>B) on</li><li>C) at</li><li>D) for</li>
        </ul>
      </section>
      <section class="auth-panel">${inner}</section>
    </main>`;
}

function renderSetup() {
  authShell(`
    <h2>Connect your database</h2>
    <p>Open <strong>js/config.js</strong> and paste your Supabase project URL and anon key. The README has the full steps.</p>`);
}

function renderLogin() {
  authShell(`
    <h2>Log in</h2>
    <form id="login" novalidate>
      <div class="field">
        <label for="id">Username or email</label>
        <input id="id" name="id" autocomplete="username" autocapitalize="none" required>
      </div>
      <div class="field">
        <label for="pw">Password</label>
        <input id="pw" name="pw" type="password" autocomplete="current-password" required>
      </div>
      <p id="msg" class="msg" role="alert"></p>
      <button class="btn block" type="submit">Log in</button>
    </form>
    <p class="switch">New here? <a href="#/signup">Create an account</a></p>`);

  if (flash) { setMsg(flash); flash = ""; }

  document.getElementById("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const id = e.target.id.value.trim();
    const pw = e.target.pw.value;
    if (!id || !pw) return setMsg("Enter your username or email and your password.");
    btn.disabled = true; setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: toAuthEmail(id), password: pw });
    if (error) { setMsg(friendly(error)); btn.disabled = false; }
  });
}

async function renderSignup() {
  authShell(`
    <h2>Create your account</h2>
    <form id="signup" novalidate>
      <div class="field"><label for="name">Full name</label>
        <input id="name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="group">Group / class</label>
        <select id="group" name="group" required><option value="">Loading...</option></select></div>
      <div class="field"><label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" autocapitalize="none" required>
        <p class="hint">3-30 characters: letters, numbers, dot, dash, underscore.</p></div>
      <div class="field"><label for="email">Email (optional)</label>
        <input id="email" name="email" type="email" autocomplete="email">
        <p class="hint">If you add an email, log in with the email. Otherwise log in with your username.</p></div>
      <div class="field"><label for="pw">Password</label>
        <input id="pw" name="pw" type="password" autocomplete="new-password" minlength="8" required>
        <p class="hint">At least 8 characters.</p></div>
      <p id="msg" class="msg" role="alert"></p>
      <button class="btn block" type="submit">Sign up</button>
    </form>
    <p class="switch">Already have an account? <a href="#/login">Log in</a></p>`);

  const select = document.getElementById("group");
  const { data: groups, error } = await supabase.from("groups").select("id,name").order("name");
  if (error || !groups?.length) {
    select.innerHTML = `<option value="">No groups yet</option>`;
    setMsg(error ? friendly(error) : "Your teacher has not created any groups yet. Ask them to add yours.");
  } else {
    select.innerHTML = `<option value="">Choose your group</option>` +
      groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("");
  }

  document.getElementById("signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector("button");
    const name = f.name.value.trim();
    const username = f.username.value.trim().toLowerCase();
    const email = f.email.value.trim().toLowerCase();
    if (!name) return setMsg("Enter your full name.");
    if (!f.group.value) return setMsg("Choose your group.");
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return setMsg("Username must be 3-30 characters: letters, numbers, dot, dash, underscore.");
    if (f.pw.value.length < 8) return setMsg("Password must be at least 8 characters.");

    btn.disabled = true; setMsg("");
    const { data, error } = await supabase.auth.signUp({
      email: email || toAuthEmail(username),
      password: f.pw.value,
      options: { data: { name, username, group_id: f.group.value } },
    });
    if (error) { setMsg(friendly(error)); btn.disabled = false; return; }
    if (!data.session) {
      setMsg("Account created. Check your email to confirm it, then log in.", "ok");
      btn.disabled = false;
    }
    // With a session, onAuthStateChange takes the student to the home screen.
  });
}

async function renderAccount() {
  const isTeacher = profile.role === "teacher";
  const showEmail = profile.email && !isSyntheticEmail(profile.email);

  app.innerHTML = `
    <header class="topbar">
      <span class="brand">English Test Prep</span>
      <button class="btn ghost small" id="theme" type="button">Light / dark</button>
      <button class="btn ghost small" id="out" type="button">Log out</button>
    </header>
    <main class="page">
      <h1>Hello, ${esc(profile.name.split(" ")[0])}</h1>
      <div class="card">
        <h2>Your account</h2>
        <dl class="facts">
          <dt>Role</dt><dd>${isTeacher ? "Teacher" : "Student"}</dd>
          <dt>Username</dt><dd>${esc(profile.username || "-")}</dd>
          ${showEmail ? `<dt>Email</dt><dd>${esc(profile.email)}</dd>` : ""}
          <dt>Group</dt><dd>${esc(profile.groups?.name || "Not set")}</dd>
        </dl>
      </div>
      <div class="card" id="db"><h2>Database</h2><p>Checking connection...</p></div>
    </main>`;

  document.getElementById("theme").addEventListener("click", toggleTheme);
  document.getElementById("out").addEventListener("click", () => supabase.auth.signOut());

  const { count, error } = await supabase.from("topic_cards").select("id", { count: "exact", head: true });
  document.getElementById("db").innerHTML = error
    ? `<h2>Database</h2><p class="msg error">Could not read topics: ${esc(error.message)}</p>`
    : `<h2>Database</h2><p><span class="badge">Connected</span> ${count} topic cards found.</p>
       <p class="hint">${isTeacher
         ? "Teacher access confirmed. Test creation arrives in step 3."
         : "Topic cards arrive in step 2."}</p>`;
}

/* ---------- Router ---------- */
async function loadProfile(id) {
  const { data, error } = await supabase.from("profiles").select("*, groups(name)").eq("id", id).single();
  return error ? null : data;
}

async function route() {
  if (!configured) return renderSetup();
  const { data: { session } } = await supabase.auth.getSession();
  const path = (location.hash || "#/").slice(1);

  if (!session) {
    profile = null;
    return path === "/signup" ? renderSignup() : renderLogin();
  }
  if (!profile || profile.id !== session.user.id) profile = await loadProfile(session.user.id);

  if (!profile) {
    flash = "Your profile could not be loaded. Log in again.";
    await supabase.auth.signOut();
    return;
  }
  if (!profile.active) {
    flash = "This account is deactivated. Ask your teacher.";
    profile = null;
    await supabase.auth.signOut();
    return;
  }
  renderAccount();
}

if (configured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") route();
  });
}
addEventListener("hashchange", route);
route();

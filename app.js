import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, USERNAME_EMAIL_DOMAIN } from "./config.js";

const app = document.getElementById("app");
const configured = SUPABASE_URL && !SUPABASE_URL.includes("YOUR-PROJECT");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let profile = null;
let flash = "";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const isNew = (d) => !!d && Date.now() - new Date(d).getTime() < 7 * 86400000;
const pct = (score, max) => (Number(max) > 0 ? Math.round((Number(score) / Number(max)) * 100) : null);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

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

/* ---------- Auth helpers ---------- */
const toAuthEmail = (id) => {
  const v = id.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${USERNAME_EMAIL_DOMAIN}`;
};

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

/* ---------- Auth screens ---------- */
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
    <p>Open <strong>config.js</strong> and paste your Supabase project URL and key.</p>`);
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
  });
}

/* ---------- App shell ---------- */
const isTeacher = () => profile?.role === "teacher";

function topbar() {
  return `
    <header class="topbar">
      <a class="brand" href="#/">English Test Prep</a>
      ${isTeacher() ? `<span class="badge plain">Teacher</span>` : ""}
      <button class="btn ghost small" id="theme" type="button">Light / dark</button>
      <button class="btn ghost small" id="out" type="button">Log out</button>
    </header>`;
}
function bindTopbar() {
  document.getElementById("theme").addEventListener("click", toggleTheme);
  document.getElementById("out").addEventListener("click", () => supabase.auth.signOut());
}
function showPage(inner, wide = true) {
  app.innerHTML = `${topbar()}<main class="page${wide ? " wide" : ""}">${inner}</main>`;
  bindTopbar();
}

/* ---------- Home: newest tests + topic cards ---------- */
let cards = [];

function cardHtml(c, best) {
  const teacher = isTeacher();
  const available = c.published_tests > 0;
  const target = c.target_question_count;
  const fresh = isNew(c.latest_live_at);

  let stats;
  if (teacher) {
    const q = c.published_questions;
    stats = target
      ? `<strong>${q}/${target}</strong> questions published
         <span class="bar" role="img" aria-label="${q} of ${target} questions"><i style="width:${Math.min(100, Math.round((q / target) * 100))}%"></i></span>`
      : `<strong>${q}</strong> questions published`;
    stats += `<br>${plural(c.published_tests, "published test", "published tests")}`;
  } else if (available) {
    stats = `${plural(c.published_tests, "test", "tests")} &middot; ${plural(c.published_questions, "question", "questions")}`;
    stats += best != null ? `<br>Best score: <strong>${best}%</strong>` : `<br>Not attempted yet`;
  } else {
    stats = `New tests are added regularly.`;
  }

  const tools = teacher ? `
    <div class="tools" data-id="${esc(c.id)}">
      <button class="btn ghost tiny" data-act="up" aria-label="Move up">&uarr;</button>
      <button class="btn ghost tiny" data-act="down" aria-label="Move down">&darr;</button>
      <button class="btn ghost tiny" data-act="rename">Rename</button>
      <button class="btn ghost tiny" data-act="target">Target</button>
      <button class="btn ghost tiny" data-act="hide">${c.hidden ? "Show" : "Hide"}</button>
      <button class="btn ghost tiny danger" data-act="delete">Delete</button>
    </div>` : "";

  return `
    <li class="topic ${available ? "available" : "soon"}${c.hidden ? " is-hidden" : ""}">
      <a class="topic-link" href="#/topic/${esc(c.id)}">
        <h3>${esc(c.title)}</h3>
        <div class="topic-line">
          <span class="status">${available ? "Available" : "Coming soon"}</span>
          ${fresh ? `<span class="badge">New</span>` : ""}
          ${c.hidden ? `<span class="badge plain">Hidden from students</span>` : ""}
        </div>
        <p class="stats">${stats}</p>
      </a>
      ${tools}
    </li>`;
}

async function renderHome() {
  showPage(`<h1>Practice by topic</h1><p class="empty">Loading...</p>`);
  const teacher = isTeacher();

  const [cardsRes, newestRes, attRes] = await Promise.all([
    supabase.from("topic_cards").select("*").order("sort_order"),
    supabase.from("live_tests").select("id,title,topic_id,live_since,question_count")
      .order("live_since", { ascending: false }).limit(5),
    teacher
      ? Promise.resolve({ data: [] })
      : supabase.from("attempts").select("score,max_score,tests(topic_id)")
          .eq("user_id", profile.id).not("submitted_at", "is", null),
  ]);

  if (cardsRes.error) {
    return showPage(`<h1>Practice by topic</h1><p class="msg error">Could not load topics: ${esc(cardsRes.error.message)}</p>`);
  }
  cards = cardsRes.data || [];
  const titleById = Object.fromEntries(cards.map((c) => [c.id, c.title]));

  const bestByTopic = {};
  for (const a of attRes.data || []) {
    const tid = a.tests?.topic_id;
    const p = pct(a.score, a.max_score);
    if (tid && p != null) bestByTopic[tid] = Math.max(bestByTopic[tid] ?? 0, p);
  }

  const newest = newestRes.data || [];
  const newestHtml = newest.length
    ? `<ul class="newest">${newest.map((t) => `
        <li><a href="#/topic/${esc(t.topic_id)}">
          <span class="t">${esc(t.title)}</span>
          ${isNew(t.live_since) ? `<span class="badge">New</span>` : ""}
          <span class="sub">${esc(titleById[t.topic_id] || "")} &middot; ${plural(t.question_count, "question", "questions")}</span>
        </a></li>`).join("")}</ul>`
    : `<p class="empty">No tests yet. New tests are added regularly.</p>`;

  showPage(`
    <h1>Practice by topic</h1>
    <div class="section-head"><h2>Newest tests</h2></div>
    ${newestHtml}
    <div class="section-head">
      <h2>All topics</h2>
      ${teacher ? `<button class="btn small" id="add-topic" type="button">Add topic</button>` : ""}
    </div>
    ${cards.length
      ? `<ul class="grid" id="grid">${cards.map((c) => cardHtml(c, bestByTopic[c.id])).join("")}</ul>`
      : `<p class="empty">${teacher ? "No topics yet. Click Add topic." : "No topics yet. Check back soon."}</p>`}
  `);

  if (teacher) bindTeacherTools();
}

/* ---------- Teacher: manage topic cards ---------- */
function bindTeacherTools() {
  document.getElementById("add-topic")?.addEventListener("click", async () => {
    const title = prompt("Name of the new topic:");
    if (!title?.trim()) return;
    const next = (cards.reduce((m, c) => Math.max(m, c.sort_order), 0) || 0) + 1;
    const { error } = await supabase.from("topics").insert({ title: title.trim(), sort_order: next });
    if (error) alert(error.message);
    renderHome();
  });

  document.getElementById("grid")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".tools").dataset.id;
    const idx = cards.findIndex((c) => c.id === id);
    const c = cards[idx];
    if (!c) return;
    let error = null;

    switch (btn.dataset.act) {
      case "up":
      case "down": {
        const other = cards[idx + (btn.dataset.act === "up" ? -1 : 1)];
        if (!other) return;
        // If two cards share a sort_order, spread them first so the swap is visible.
        const a = c.sort_order, b = other.sort_order;
        const aNew = a === b ? a + (btn.dataset.act === "up" ? -1 : 1) : b;
        const r1 = await supabase.from("topics").update({ sort_order: aNew }).eq("id", c.id);
        const r2 = a === b ? { error: null } : await supabase.from("topics").update({ sort_order: a }).eq("id", other.id);
        error = r1.error || r2.error;
        break;
      }
      case "rename": {
        const title = prompt("New name:", c.title);
        if (!title?.trim() || title.trim() === c.title) return;
        ({ error } = await supabase.from("topics").update({ title: title.trim() }).eq("id", id));
        break;
      }
      case "target": {
        const v = prompt("Target number of questions (leave empty for none):", c.target_question_count ?? "");
        if (v === null) return;
        const n = v.trim() === "" ? null : parseInt(v, 10);
        if (n !== null && (Number.isNaN(n) || n < 0)) return alert("Enter a whole number, or leave it empty.");
        ({ error } = await supabase.from("topics").update({ target_question_count: n }).eq("id", id));
        break;
      }
      case "hide":
        ({ error } = await supabase.from("topics").update({ hidden: !c.hidden }).eq("id", id));
        break;
      case "delete":
        if (!confirm(`Delete "${c.title}"?\n\nThis also deletes its tests, questions and all student attempts. This cannot be undone.`)) return;
        ({ error } = await supabase.from("topics").delete().eq("id", id));
        break;
    }
    if (error) alert(error.message);
    renderHome();
  });
}

/* ---------- Topic page ---------- */
async function renderTopic(id) {
  showPage(`<a class="back" href="#/">&larr; All topics</a><p class="empty">Loading...</p>`, false);
  const teacher = isTeacher();

  const { data: topic } = await supabase.from("topics").select("*").eq("id", id).maybeSingle();
  if (!topic) {
    return showPage(`<a class="back" href="#/">&larr; All topics</a><h1>Topic not found</h1><p>This topic is not available.</p>`, false);
  }

  const { data: tests } = await supabase.from("live_tests")
    .select("id,title,question_count,live_since").eq("topic_id", id).order("created_at");
  const list = tests || [];

  let attempts = [];
  if (!teacher && list.length) {
    const r = await supabase.from("attempts").select("id,test_id,score,max_score,submitted_at")
      .eq("user_id", profile.id).in("test_id", list.map((t) => t.id))
      .not("submitted_at", "is", null).order("submitted_at", { ascending: false });
    attempts = r.data || [];
  }
  const titleByTest = Object.fromEntries(list.map((t) => [t.id, t.title]));
  const bestByTest = {};
  for (const a of attempts) {
    const p = pct(a.score, a.max_score);
    if (p != null) bestByTest[a.test_id] = Math.max(bestByTest[a.test_id] ?? 0, p);
  }

  const study = topic.study_content?.trim()
    ? `<div class="card"><h2>Study</h2><div class="study">${esc(topic.study_content)}</div></div>` : "";

  const testsHtml = list.length
    ? list.map((t) => `
        <div class="test-row">
          <div class="grow">
            <strong>${esc(t.title)}</strong> ${isNew(t.live_since) ? `<span class="badge">New</span>` : ""}
            <span class="sub">${plural(t.question_count, "question", "questions")}${
              bestByTest[t.id] != null ? ` &middot; Best score: ${bestByTest[t.id]}%` : ""}</span>
          </div>
          <button class="btn small" type="button" disabled>Start</button>
        </div>`).join("") +
      `<p class="hint">Starting a test arrives in step 4.</p>`
    : `<p class="empty">Coming soon. New tests are added regularly.</p>`;

  const historyHtml = teacher ? "" : `
    <div class="card">
      <h2>Your attempts</h2>
      ${attempts.length
        ? `<ul class="history">${attempts.map((a) => `
            <li><span>${esc(titleByTest[a.test_id] || "Test")} <span class="hint">${fmtDate(a.submitted_at)}</span></span>
            <strong>${pct(a.score, a.max_score) ?? 0}%</strong></li>`).join("")}</ul>`
        : `<p class="empty">No attempts yet.</p>`}
    </div>`;

  showPage(`
    <a class="back" href="#/">&larr; All topics</a>
    <h1>${esc(topic.title)}</h1>
    ${study}
    <div class="card"><h2>Tests</h2>${testsHtml}</div>
    ${historyHtml}
  `, false);
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

  const m = path.match(/^\/topic\/([0-9a-f-]{36})$/i);
  if (m) return renderTopic(m[1]);
  return renderHome();
}

if (configured) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") route();
    // Ignore the extra SIGNED_IN events some browsers fire when the tab regains focus.
    else if (event === "SIGNED_IN" && !(profile && session?.user?.id === profile.id)) route();
  });
}
addEventListener("hashchange", route);
route();

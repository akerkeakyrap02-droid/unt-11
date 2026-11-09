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
      ${teacher ? `<div class="row"><a class="btn small" href="#/new-test">New test</a><button class="btn small ghost" id="add-topic" type="button">Add topic</button></div>` : ""}
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

  if (teacher) return renderTeacherTopic(topic);

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
          <a class="btn small" href="#/test/${esc(t.id)}">Start</a>
        </div>`).join("")
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

/* ---------- Teacher: question parser ---------- */
// PARSER START
const TYPES = ["single", "multiple", "matching", "fill_blank", "short_text", "sentence_correction"];

function parseQuestions(text) {
  const out = [];
  let cur = null, passage = "", inPassage = false;
  const flush = () => { if (cur) out.push(finishQuestion(cur, out.length + 1)); cur = null; };
  for (const raw of String(text).replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^passage\s*:\s*(.*)$/i))) {
      flush();
      passage = /^none$/i.test(m[1].trim()) ? "" : m[1].trim();
      inPassage = !!passage;
    } else if ((m = line.match(/^Q(?:uestion)?\s*\d*\s*[:.)]\s*(.*)$/i))) {
      flush(); inPassage = false;
      cur = { text: m[1], title: "", items: [], options: [], answer: "", explanation: "", type: "", points: 1, field: "text", passage };
    } else if (inPassage) {
      passage += " " + line;
    } else if (!cur) {
      continue;
    } else if ((m = line.match(/^(?:answer|ans|correct)\s*:\s*(.*)$/i))) {
      cur.answer = m[1].trim(); cur.field = "answer";
    } else if ((m = line.match(/^(?:explanation|expl|why)\s*:\s*(.*)$/i))) {
      cur.explanation = m[1].trim(); cur.field = "explanation";
    } else if ((m = line.match(/^title\s*:\s*(.*)$/i))) {
      cur.title = m[1].trim();
    } else if ((m = line.match(/^type\s*:\s*(.*)$/i))) {
      cur.type = m[1].trim().toLowerCase().replace(/[\s-]+/g, "_");
    } else if ((m = line.match(/^points?\s*:\s*([\d.]+)/i))) {
      cur.points = parseFloat(m[1]);
    } else if (!cur.options.length && cur.field !== "answer" && (m = line.match(/^\d+[).]\s+(.+)$/))) {
      cur.items.push(m[1].trim()); cur.field = "items";
    } else if (/^[A-H][).]\s/i.test(line)) {
      const re = /([A-H])[).]\s+(.+?)(?=\s+[A-H][).]\s|$)/gi;
      let o;
      while ((o = re.exec(line))) cur.options.push({ k: o[1].toUpperCase(), t: o[2].trim() });
      cur.field = "options";
    } else if (cur.field === "text") cur.text += " " + line;
    else if (cur.field === "explanation") cur.explanation += " " + line;
  }
  flush();
  return out;
}

function finishQuestion(c, n) {
  const errors = [];
  const ans = c.answer;
  const letters = c.options.map((o) => o.k);
  let type = c.type ||
    (c.items.length ? "matching"
      : c.options.length ? (/[,&;]|\band\b|^[A-H]{2,}$/i.test(ans) ? "multiple" : "single")
      : (c.text.includes("___") ? "fill_blank" : "short_text"));
  if (!TYPES.includes(type)) { errors.push(`Unknown type "${type}"`); type = "single"; }
  const head = c.text.trim();
  const q = { n, type, text: c.title ? `${c.title.trim()}\n${head}` : head, passage: c.passage || "",
              options: null, correct: null, explanation: c.explanation.trim(),
              points: c.points > 0 ? c.points : 1, errors };
  if (!head) errors.push("Question text is empty");
  if (!ans) errors.push("Missing Answer: line");

  if (type === "matching") {
    q.options = c.options.map((o) => o.t);
    q.text = [head, ...c.items.map((t, i) => `${i + 1}. ${t}`)].join("\n");
    if (!c.items.length) errors.push("Add numbered items, like: 1. Infinitive of purpose");
    if (q.options.length < 2) errors.push("Needs lettered options, like: A) ...  B) ...");
    const map = {};
    for (const part of ans.split(/[,;]+/)) {
      const mm = part.trim().match(/^(\d+)\s*[-\u2013:=]\s*([A-H])$/i);
      if (mm) map[+mm[1]] = mm[2].toUpperCase();
      else if (part.trim()) errors.push(`Cannot read "${part.trim()}". Write answers like: 1-A, 2-C`);
    }
    q.correct = c.items.map((_, i) => map[i + 1] ?? null);
    q.correct.forEach((k, i) => { if (!k) errors.push(`Item ${i + 1} has no answer`); else if (!letters.includes(k)) errors.push(`Item ${i + 1}: "${k}" is not one of the options`); });
  } else if (type === "single" || type === "multiple") {
    q.options = c.options.map((o) => o.t);
    if (q.options.length < 2) errors.push("Needs at least two options, like: A) in  B) on");
    const picked = ans.replace(/\band\b/gi, ",").split(/[\s,;&]+/).filter(Boolean)
      .flatMap((t) => (/^[A-H]+$/i.test(t) ? t.toUpperCase().split("") : [t]));
    for (const p of picked) if (!letters.includes(p)) errors.push(`Answer "${p}" is not one of the options`);
    if (type === "single" && picked.length > 1) errors.push("Single choice must have one answer");
    q.correct = type === "single" ? picked[0] : [...new Set(picked)];
  } else {
    q.correct = ans.split("|").map((s) => s.trim()).filter(Boolean);
  }
  return q;
}

// Task title + sentence (+ matching items) rendering, shared by preview, test and results.
const matchItems = (q) => String(q.text).split("\n").slice(1).map((r) => r.replace(/^\d+[.)]\s*/, ""));
function stem(q) {
  const [h, ...rest] = String(q.text).split("\n");
  if (q.type === "matching") return { head: `<h3 class="qtext">${blankHtml(h)}</h3>`, body: "" };
  if (rest.length) return { head: `<h3 class="qtext">${blankHtml(h)}</h3>`, body: `<p class="sentence">${blankHtml(rest.join(" "))}</p>` };
  if (/_{3,}/.test(h)) return { head: `<span class="qlabel">Complete the sentence</span>`, body: `<p class="sentence">${blankHtml(h)}</p>` };
  return { head: `<h3 class="qtext">${blankHtml(h)}</h3>`, body: "" };
}
// PARSER END

const SAMPLE = `Q: She is interested ___ music.
A) in  B) on  C) at  D) for
Answer: A
Explanation: interested in + noun

Q: We arrived ___ the airport at six.
A) in  B) at  C) to  D) on
Answer: B
Explanation: arrive at + a specific place

Q: She is good ___ chess.
Answer: at
Explanation: good at + noun`;

const fmtDateTime = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function previewHtml(qs) {
  if (!qs.length) return `<p class="empty">Your questions will appear here as you type.</p>`;
  let lastPass = "";
  return qs.map((q) => {
    const s = stem(q);
    const keyOf = (L) => (Array.isArray(q.correct) ? q.correct.includes(L) : q.correct === L);
    const pass = q.passage && q.passage !== lastPass ? `<div class="passage">${esc(q.passage)}</div>` : "";
    lastPass = q.passage;
    const items = q.type === "matching"
      ? `<ol class="mitems">${matchItems(q).map((t, i) => `<li class="mrow"><span class="mtext">${i + 1}. ${esc(t)}</span><b>&rarr; ${esc(q.correct?.[i] || "?")}</b></li>`).join("")}</ol>` : "";
    const opts = q.options
      ? `<div class="optgrid">${q.options.map((o, i) => {
          const L = "ABCDEFGH"[i];
          const ok = keyOf(L);
          return `<div class="opt static${ok ? " ok" : ""}"><span class="chip">${L}</span><span>${esc(o)}${ok ? " &#10003;" : ""}</span></div>`;
        }).join("")}</div>`
      : `<p class="ans">Accepted: <b>${esc((q.correct || []).join("  |  "))}</b></p>`;
    return `${pass}<section class="qcard${q.errors.length ? " bad" : ""}">
      <div class="qhead"><span class="qnum">${q.n}</span>${s.head}<span class="hint">${q.type.replace("_", " ")} &middot; ${q.points} pt</span></div>
      ${s.body}${items}${opts}
      ${q.explanation ? `<p class="hint">Explanation: ${esc(q.explanation)}</p>` : ""}
      ${q.errors.map((e) => `<p class="msg error">${esc(e)}</p>`).join("")}</section>`;
  }).join("");
}

/* ---------- Teacher: new test page ---------- */
async function renderNewTest(presetTopic) {
  showPage(`<a class="back" href="#/">&larr; All topics</a><p class="empty">Loading...</p>`, false);
  const { data: topics } = await supabase.from("topics").select("id,title").order("sort_order");
  showPage(`
    <a class="back" href="#/">&larr; All topics</a>
    <h1>New test</h1>
    <div class="card">
      <div class="field"><label for="nt-topic">Topic</label>
        <select id="nt-topic">${(topics || []).map((t) =>
          `<option value="${esc(t.id)}"${t.id === presetTopic ? " selected" : ""}>${esc(t.title)}</option>`).join("")}</select></div>
      <div class="field"><label for="nt-title">Test title</label>
        <input id="nt-title" placeholder="Prepositions - Test 2" autocomplete="off"></div>
      <div class="field"><label for="nt-time">Time limit in minutes (optional)</label>
        <input id="nt-time" type="number" min="1" inputmode="numeric"></div>
      <label class="check"><input type="checkbox" id="nt-sq"> Shuffle questions</label>
      <label class="check"><input type="checkbox" id="nt-so"> Shuffle options</label>
    </div>
    <div class="card">
      <h2>Paste questions</h2>
      <p class="hint">Start each question with <b>Q:</b>. Options go on one line, then <b>Answer:</b> and <b>Explanation:</b>.
        Two correct options: <b>Answer: A, C</b>. Task title above a sentence: <b>Title:</b>. Shared reading text: <b>Passage:</b>. Matching: numbered lines, then <b>Answer: 1-A, 2-C</b>. No options: type the answer, and use <b>|</b> between accepted answers.</p>
      <textarea id="nt-paste" rows="12" spellcheck="false" placeholder="Q: She is interested ___ music.&#10;A) in  B) on  C) at  D) for&#10;Answer: A&#10;Explanation: interested in"></textarea>
      <button class="btn ghost small" id="nt-sample" type="button">Insert example</button>
      <h2 class="gap-top" id="nt-count">Preview</h2>
      <div id="nt-preview"></div>
    </div>
    <p id="msg" class="msg" role="alert"></p>
    <div class="actions">
      <button class="btn" data-save="draft" type="button">Save as draft</button>
      <button class="btn" data-save="publish" type="button">Publish now</button>
      <div class="schedule"><input type="datetime-local" id="nt-when" aria-label="Publish date and time">
        <button class="btn ghost" data-save="schedule" type="button">Publish on date</button></div>
    </div>`, false);

  const $ = (id) => document.getElementById(id);
  const refresh = () => {
    const qs = parseQuestions($("nt-paste").value);
    $("nt-count").textContent = qs.length ? `Preview: ${plural(qs.length, "question", "questions")}` : "Preview";
    $("nt-preview").innerHTML = previewHtml(qs);
    return qs;
  };
  $("nt-paste").addEventListener("input", refresh);
  $("nt-sample").addEventListener("click", () => { $("nt-paste").value = SAMPLE; refresh(); });
  refresh();

  document.querySelector(".actions").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-save]");
    if (!btn) return;
    const mode = btn.dataset.save;
    const qs = refresh();
    const title = $("nt-title").value.trim();
    let publishAt = null;
    if (!$("nt-topic").value) return setMsg("Choose a topic.");
    if (!title) return setMsg("Enter a test title.");
    if (!qs.length) return setMsg("Paste at least one question.");
    const bad = qs.find((q) => q.errors.length);
    if (bad) return setMsg(`Fix question ${bad.n} first: ${bad.errors[0]}.`);
    if (mode === "schedule") {
      if (!$("nt-when").value) return setMsg("Pick a date and time first.");
      publishAt = new Date($("nt-when").value);
      if (publishAt <= new Date()) return setMsg("Pick a time in the future.");
      publishAt = publishAt.toISOString();
    }

    const all = document.querySelectorAll(".actions button");
    all.forEach((b) => (b.disabled = true));
    setMsg("Saving...", "ok");
    const topicId = $("nt-topic").value;
    const fail = async (err, testId) => {
      if (testId) await supabase.from("tests").delete().eq("id", testId);
      setMsg(`Could not save: ${err.message}`);
      all.forEach((b) => (b.disabled = false));
    };

    const { data: t, error } = await supabase.from("tests").insert({
      topic_id: topicId, title, status: mode === "draft" ? "draft" : "published", publish_at: publishAt,
      time_limit_minutes: parseInt($("nt-time").value, 10) || null,
      shuffle_questions: $("nt-sq").checked, shuffle_options: $("nt-so").checked,
    }).select("id").single();
    if (error) return fail(error);

    const { data: ins, error: e2 } = await supabase.from("questions").insert(
      qs.map((q, i) => ({ test_id: t.id, sort_order: i + 1, type: q.type, text: q.text, options: q.options, points: q.points, passage: q.passage || null }))
    ).select("id,sort_order");
    if (e2) return fail(e2, t.id);

    const { error: e3 } = await supabase.from("question_keys").insert(
      ins.map((r) => ({ question_id: r.id, correct_answer: qs[r.sort_order - 1].correct, explanation: qs[r.sort_order - 1].explanation || null }))
    );
    if (e3) return fail(e3, t.id);

    location.hash = `#/topic/${topicId}`;
  });
}

/* ---------- Teacher: topic page with all tests ---------- */
async function renderTeacherTopic(topic) {
  const { data: tests } = await supabase.from("tests")
    .select("id,title,status,publish_at,questions(count)").eq("topic_id", topic.id).order("created_at");
  const rows = (tests || []).map((t) => {
    const n = t.questions?.[0]?.count ?? 0;
    const sched = t.status === "published" && t.publish_at && new Date(t.publish_at) > new Date();
    const label = t.status === "draft" ? "Draft" : sched ? `Scheduled for ${fmtDateTime(t.publish_at)}` : "Published";
    return `<div class="test-row" data-id="${esc(t.id)}">
      <div class="grow"><strong>${esc(t.title)}</strong>
        <span class="badge ${t.status === "draft" || sched ? "plain" : ""}">${label}</span>
        <span class="sub">${plural(n, "question", "questions")}</span></div>
      ${t.status === "draft"
        ? `<button class="btn small" data-act="publish" type="button">Publish</button>`
        : `<button class="btn ghost small" data-act="unpublish" type="button">Unpublish</button>`}
      <button class="btn ghost small danger" data-act="delete" type="button">Delete</button></div>`;
  }).join("");

  showPage(`
    <a class="back" href="#/">&larr; All topics</a>
    <div class="section-head"><h1>${esc(topic.title)}</h1><a class="btn small" href="#/new-test/${esc(topic.id)}">New test</a></div>
    <div class="card"><h2>Tests</h2>${rows || `<p class="empty">No tests yet. Click New test.</p>`}</div>`, false);

  document.querySelector(".card").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".test-row").dataset.id;
    btn.disabled = true;
    let r;
    if (btn.dataset.act === "publish") r = await supabase.from("tests").update({ status: "published", publish_at: null }).eq("id", id);
    else if (btn.dataset.act === "unpublish") r = await supabase.from("tests").update({ status: "draft", publish_at: null }).eq("id", id);
    else {
      if (!confirm("Delete this test with its questions and all student attempts? This cannot be undone.")) { btn.disabled = false; return; }
      r = await supabase.from("tests").delete().eq("id", id);
    }
    if (r.error) alert(r.error.message);
    renderTopic(topic.id);
  });
}

/* ---------- Student: take a test ---------- */
let activeTimer = null;

function seeded(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rnd) {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const hasAnswer = (v) => (Array.isArray(v) ? v.some((x) => x != null && x !== "") : v != null && String(v).trim() !== "");
const PARTS = {
  single: ["One correct answer", "You are offered the test items with one correct answer from four proposed ones."],
  reading: ["Reading comprehension", "You are offered the test items on the base of text with one correct answer from four proposed ones. Read the text attentively and do the items."],
  multiple: ["One or more correct answers", "You are offered the test tasks with one or more correct answers from multiple choices. In the test tasks with one or more correct answers there can be up to three correct answers."],
  matching: ["Matching", "You are offered the questions and answers which should be matched. In these tasks there are two correct answers."],
  fill_blank: ["Fill in the blank", "Type the missing word or words."],
  short_text: ["Short answer", "Type your answer."],
  sentence_correction: ["Sentence correction", "Rewrite the sentence correctly."],
};
const gk = (q) => (q.passage ? `reading|${q.passage}` : q.type);
const blankHtml = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/_{3,}/g, `<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`);

async function renderTest(testId) {
  showPage(`<a class="back" href="#/">&larr; All topics</a><p class="empty">Loading...</p>`, false);
  const { data: test } = await supabase.from("live_tests").select("*").eq("id", testId).maybeSingle();
  if (!test) return showPage(`<a class="back" href="#/">&larr; All topics</a><h1>Test not available</h1>`, false);
  const { data: qrows } = await supabase.from("questions").select("id,sort_order,type,text,options,points,passage")
    .eq("test_id", testId).order("sort_order");
  if (!qrows?.length) return showPage(`<a class="back" href="#/topic/${esc(test.topic_id)}">&larr; Back</a><h1>${esc(test.title)}</h1><p>This test has no questions yet.</p>`, false);

  // Resume an unfinished attempt, or start a new one.
  let { data: att } = await supabase.from("attempts").select("id,started_at").eq("test_id", testId)
    .eq("user_id", profile.id).is("submitted_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!att) {
    const r = await supabase.from("attempts").insert({ test_id: testId }).select("id,started_at").single();
    if (r.error) return showPage(`<a class="back" href="#/">&larr; Back</a><p class="msg error">Could not start: ${esc(r.error.message)}</p>`, false);
    att = r.data;
  }

  const answers = {}, flagged = new Set(), dirty = new Set();
  const { data: saved } = await supabase.from("attempt_answers").select("question_id,answer,flagged").eq("attempt_id", att.id);
  for (const r of saved || []) { answers[r.question_id] = r.answer; if (r.flagged) flagged.add(r.question_id); }
  const lsKey = `etp-attempt-${att.id}`;
  try {  // answers typed while offline survive a refresh
    const local = JSON.parse(localStorage.getItem(lsKey) || "null");
    if (local) {
      for (const [id, v] of Object.entries(local.answers || {})) if (JSON.stringify(answers[id] ?? null) !== JSON.stringify(v)) { answers[id] = v; dirty.add(id); }
      for (const id of local.flagged || []) if (!flagged.has(id)) { flagged.add(id); dirty.add(id); }
    }
  } catch { /* ignore */ }

  // Order: grouped by type; shuffles are seeded by the attempt so a refresh keeps the same order.
  const rnd = seeded(att.id);
  const groupKeys = [...new Set(qrows.map(gk))];
  const ordered = groupKeys.flatMap((key) => {
    const g = qrows.filter((q) => gk(q) === key);
    return test.shuffle_questions ? shuffled(g, rnd) : g;
  });
  const opts = {}, byId = {};
  for (const q of ordered) {
    byId[q.id] = q;
    if (q.options) {
      const o = q.options.map((t, i) => ({ k: "ABCDEFGH"[i], t }));
      opts[q.id] = test.shuffle_options ? shuffled(o, rnd) : o;
    }
  }

  let n = 0, part = 0, html = "";
  for (const key of groupKeys) {
    const g = ordered.filter((q) => gk(q) === key);
    const kind = key.split("|")[0];
    const pts = [...new Set(g.map((q) => Number(q.points)))];
    part++;
    html += `<div class="part-head"><p class="part">Part ${part} &middot; items ${n + 1}-${n + g.length}${pts.length === 1 ? ` &middot; ${pts[0]} point${pts[0] === 1 ? "" : "s"} each` : ""}</p>
      <h2>${PARTS[kind][0]}</h2><p class="instr"><em>Instruction:</em> ${PARTS[kind][1]}</p></div>`;
    if (g[0].passage) html += `<div class="passage">${esc(g[0].passage)}</div>`;
    for (const q of g) {
      n++; q.idx = n;
      const s = stem(q);
      const letterOf = (k) => "ABCDEFGH"[opts[q.id].findIndex((o) => o.k === k)];
      const staticOpts = q.options
        ? `<div class="optgrid">${opts[q.id].map((o, i) => `<div class="opt static"><span class="chip">${"ABCDEFGH"[i]}</span><span>${esc(o.t)}</span></div>`).join("")}</div>` : "";
      let body;
      if (q.type === "matching") {
        body = `<ol class="mitems">${matchItems(q).map((t, i) => `<li class="mrow"><span class="mtext">${i + 1}. ${esc(t)}</span><span class="mpick">${
          opts[q.id].map((o, j) => `<button type="button" class="mchip" data-i="${i}" data-k="${o.k}" aria-pressed="false" aria-label="Item ${i + 1}: option ${"ABCDEFGH"[j]}">${"ABCDEFGH"[j]}</button>`).join("")}</span></li>`).join("")}</ol>${staticOpts}`;
      } else if (opts[q.id]) {
        body = `<div class="optgrid">${opts[q.id].map((o, i) => `<button type="button" class="opt" data-k="${o.k}" aria-pressed="false"><span class="chip">${"ABCDEFGH"[i]}</span><span>${esc(o.t)}</span></button>`).join("")}</div>`;
      } else {
        body = `<input class="qinput" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Your answer">`;
      }
      html += `<section class="qcard" id="q-${q.id}" data-q="${q.id}">
        <div class="qhead"><span class="qnum">${n}</span>${s.head}
          <button type="button" class="flagbtn" data-flag aria-pressed="false" title="Flag for review" aria-label="Flag for review">&#9873;</button></div>
        ${s.body}${body}</section>`;
    }
  }

  const total = ordered.length;
  app.innerHTML = `
    <header class="testbar">
      <a class="btn ghost small" href="#/topic/${esc(test.topic_id)}">Exit</a>
      <span class="ttl">${esc(test.title)}</span>
      <div class="prog"><div class="bar"><i id="pbar"></i></div></div>
      <span class="meta" id="pcount"></span>
      <span class="meta">Time <span id="clock">00:00</span></span>
    </header>
    <div class="test-wrap">
      <aside class="qmap"><p class="label">Question map</p>
        <div class="qmap-grid">${ordered.map((q) => `<button type="button" data-goto="${q.id}" aria-label="Question ${q.idx}">${q.idx}</button>`).join("")}</div>
        <p class="legend"><span class="k done"></span> Answered <span class="k"></span> Not answered <span class="k fl"></span> Flagged</p>
        <p class="hint" id="save-status" role="status"></p></aside>
      <main id="qs">${html}</main>
    </div>
    <div class="submitbar"><div><span id="left"></span><button class="btn" id="submit" type="button">Submit test</button></div></div>`;

  const $ = (id) => document.getElementById(id);
  for (const q of ordered) {
    const inp = $(`q-${q.id}`).querySelector(".qinput");
    if (inp && hasAnswer(answers[q.id])) inp.value = answers[q.id];
  }

  const persist = () => { try { localStorage.setItem(lsKey, JSON.stringify({ answers, flagged: [...flagged] })); } catch { /* ignore */ } };
  const status = (t) => { $("save-status").textContent = t; };
  function paint() {
    let done = 0;
    for (const q of ordered) {
      const a = answers[q.id], ok = hasAnswer(a);
      if (ok) done++;
      const card = $(`q-${q.id}`);
      card.querySelectorAll(".opt").forEach((b) => b.setAttribute("aria-pressed", String(Array.isArray(a) ? a.includes(b.dataset.k) : a === b.dataset.k)));
      card.querySelectorAll(".mchip").forEach((b) => b.setAttribute("aria-pressed", String(Array.isArray(a) && a[+b.dataset.i] === b.dataset.k)));
      card.querySelector("[data-flag]").setAttribute("aria-pressed", String(flagged.has(q.id)));
      const m = document.querySelector(`[data-goto="${q.id}"]`);
      m.classList.toggle("done", ok); m.classList.toggle("fl", flagged.has(q.id));
    }
    $("pbar").style.width = `${Math.round((done / total) * 100)}%`;
    $("pcount").textContent = `${done} / ${total} answered`;
    $("left").textContent = `${plural(total - done, "question", "questions")} left.`;
    return done;
  }

  async function flush() {
    if (!dirty.size) return true;
    const ids = [...dirty]; dirty.clear();
    const { error } = await supabase.from("attempt_answers").upsert(
      ids.map((id) => ({ attempt_id: att.id, question_id: id, answer: answers[id] ?? null, flagged: flagged.has(id) })),
      { onConflict: "attempt_id,question_id" });
    if (error) { ids.forEach((i) => dirty.add(i)); status("Not saved yet. Check your connection."); return false; }
    status("All answers saved."); return true;
  }
  let timer = null;
  const queueSave = () => { clearTimeout(timer); timer = setTimeout(flush, 500); };
  const setAnswer = (id, v) => { answers[id] = hasAnswer(v) ? v : null; dirty.add(id); paint(); persist(); queueSave(); };

  $("qs").addEventListener("click", (e) => {
    const card = e.target.closest(".qcard");
    if (!card) return;
    const id = card.dataset.q, opt = e.target.closest(".opt"), mc = e.target.closest(".mchip");
    if (mc) {
      const cur = answers[id] || [], i = +mc.dataset.i;
      const next = Array.from({ length: matchItems(byId[id]).length }, (_, j) => cur[j] ?? null);
      next[i] = next[i] === mc.dataset.k ? null : mc.dataset.k;
      setAnswer(id, next);
    } else if (opt) {
      const k = opt.dataset.k;
      if (byId[id].type === "multiple") {
        const cur = new Set(answers[id] || []);
        cur.has(k) ? cur.delete(k) : cur.add(k);
        setAnswer(id, [...cur].sort());
      } else setAnswer(id, answers[id] === k ? null : k);
    } else if (e.target.closest("[data-flag]")) {
      flagged.has(id) ? flagged.delete(id) : flagged.add(id);
      dirty.add(id); paint(); persist(); queueSave();
    }
  });
  $("qs").addEventListener("input", (e) => {
    if (e.target.classList.contains("qinput")) setAnswer(e.target.closest(".qcard").dataset.q, e.target.value);
  });
  document.querySelector(".qmap-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-goto]");
    if (b) $(`q-${b.dataset.goto}`).scrollIntoView({ behavior: "smooth", block: "start" });
  });
  addEventListener("online", flush);
  window.onbeforeunload = () => (dirty.size ? "Your latest answers are still saving." : undefined);

  let submitting = false;
  async function submit(auto) {
    if (submitting) return;
    const left = total - paint();
    if (!auto && !confirm(left ? `You have ${plural(left, "unanswered question", "unanswered questions")}. Submit anyway?` : "Submit your test?")) return;
    submitting = true; $("submit").disabled = true; clearTimeout(timer);
    const saved = await flush();
    if (!saved && !auto) { submitting = false; $("submit").disabled = false; return; }
    const { error } = await supabase.rpc("submit_attempt", { p_attempt: att.id });
    if (error) { submitting = false; $("submit").disabled = false; status(error.message); return; }
    try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
    clearInterval(activeTimer); window.onbeforeunload = null;
    location.hash = `#/result/${att.id}`;
  }
  $("submit").addEventListener("click", () => submit(false));

  const limit = test.time_limit_minutes ? test.time_limit_minutes * 60 : null;
  const tick = () => {
    const el = Math.max(0, Math.floor((Date.now() - new Date(att.started_at).getTime()) / 1000));
    const t = limit ? Math.max(0, limit - el) : el;
    $("clock").textContent = clock(t);
    if (limit && t === 0) { clearInterval(activeTimer); submit(true); }
  };
  clearInterval(activeTimer);
  activeTimer = setInterval(tick, 1000);
  tick(); paint();
  if (dirty.size) flush();
}

/* ---------- Results ---------- */
function showAns(r, v) {
  if (!hasAnswer(v)) return "No answer";
  if (r.type === "matching") return [].concat(v).map((k, i) => `${i + 1}-${esc(k ?? "?")}`).join(", ");
  if (r.type === "single" || r.type === "multiple") {
    return [].concat(v).map((k) => `${k}) ${esc(r.options?.["ABCDEFGH".indexOf(k)] ?? "")}`).join(", ");
  }
  return esc(Array.isArray(v) ? v.join("  |  ") : v);
}

async function renderResult(attemptId) {
  showPage(`<p class="empty">Loading...</p>`, false);
  const { data: att } = await supabase.from("attempts")
    .select("id,score,max_score,time_spent_seconds,submitted_at,tests(title,topic_id)").eq("id", attemptId).maybeSingle();
  if (!att?.submitted_at) return showPage(`<a class="back" href="#/">&larr; All topics</a><h1>Result not found</h1>`, false);
  const { data: rows, error } = await supabase.rpc("get_attempt_review", { p_attempt: attemptId });
  const p = pct(att.score, att.max_score) ?? 0;
  const right = (rows || []).filter((r) => r.is_correct).length;

  showPage(`
    <a class="back" href="#/topic/${esc(att.tests?.topic_id)}">&larr; Back to topic</a>
    <h1>${esc(att.tests?.title || "Result")}</h1>
    <div class="card score">
      <p class="big">${p}%</p>
      <p><strong>${Number(att.score)} / ${Number(att.max_score)}</strong> points &middot; ${right} of ${(rows || []).length} correct
        &middot; time ${clock(att.time_spent_seconds || 0)}</p>
    </div>
    ${error ? `<p class="msg error">${esc(error.message)}</p>` : ""}
    ${(rows || []).map((r, i) => `
      <section class="qcard ${r.is_correct ? "right" : "wrong"}">
        <div class="qhead"><span class="qnum">${i + 1}</span>${stem({ text: r.q_text, type: r.type }).head}
          <span class="verdict">${r.is_correct ? "&#10003; Correct" : "&#10007; Wrong"}</span></div>
        ${stem({ text: r.q_text, type: r.type }).body}${r.type === "matching" ? `<ol class="mitems">${matchItems({ text: r.q_text }).map((t, i) => `<li>${i + 1}. ${esc(t)}</li>`).join("")}</ol>` : ""}
        <p class="ans">Your answer: <b>${showAns(r, r.answer)}</b></p>
        ${r.is_correct ? "" : `<p class="ans">Correct answer: <b>${showAns(r, r.correct_answer)}</b></p>`}
        ${r.explanation ? `<p class="hint">${esc(r.explanation)}</p>` : ""}
        ${r.teacher_comment ? `<p class="hint">Teacher: ${esc(r.teacher_comment)}</p>` : ""}
      </section>`).join("")}
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

  clearInterval(activeTimer); window.onbeforeunload = null;
  const tm = path.match(/^\/test\/([0-9a-f-]{36})$/i);
  if (tm && !isTeacher()) return renderTest(tm[1]);
  const rm = path.match(/^\/result\/([0-9a-f-]{36})$/i);
  if (rm) return renderResult(rm[1]);

  const nt = path.match(/^\/new-test(?:\/([0-9a-f-]{36}))?$/i);
  if (nt && isTeacher()) return renderNewTest(nt[1]);

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

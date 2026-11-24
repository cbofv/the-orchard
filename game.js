/* The Orchard: Long Shot.
   Name a correct answer to the prompt. The fewer people who would think of
   it, the more it's worth: from a Windfall (everyone says it) to a Golden
   Apple (almost nobody does).
   - Daily: 7 prompts, the same for everyone that day, 20 seconds each, once a day.
   - Unlimited: endless prompts, 3 lives, pick a category, optional relaxed mode.
   Results are saved to your account (doc "longshot"); today's score is shared
   with friends through Social if you share your stats. */
(function () {
  "use strict";
  const view = document.getElementById("view-longshot");
  if (!view) return;

  /* ---------- constants ---------- */
  const TIERS = [
    { n: "Miss", p: 0, c: "var(--ink-faint)", sq: "⬛", d: "No answer" },
    { n: "Windfall", p: 10, c: "#a8a08a", sq: "⬜", d: "Nearly everyone says this" },
    { n: "Picked", p: 20, c: "#7fb069", sq: "🟩", d: "A popular answer" },
    { n: "Ripe", p: 35, c: "#e0604f", sq: "🟥", d: "A good, less obvious pick" },
    { n: "Rare", p: 55, c: "#5b9bd5", sq: "🟦", d: "Not many people say this" },
    { n: "Heirloom", p: 75, c: "#a77bd6", sq: "🟪", d: "A really unusual answer" },
    { n: "Golden Apple", p: 100, c: "#e5b422", sq: "🟨", d: "Almost nobody thinks of this" },
  ];
  const DAILY_COUNT = 7, SECONDS = 20, LIVES = 3;
  const GROUPS = {
    all: { label: "Everything", subjects: null },
    science: { label: "Science", subjects: ["Chemistry", "Biology", "Physics"] },
    maths: { label: "Maths", subjects: ["Maths"] },
    english: { label: "English", subjects: ["English"] },
    humanities: { label: "Humanities", subjects: ["Religious Studies", "Geography", "Psychology"] },
    spanish: { label: "Spanish", subjects: ["Spanish"] },
    general: { label: "General knowledge", subjects: ["General"] },
  };
  const LOCAL = "orchard-longshot";

  /* ---------- helpers ---------- */
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => iso(new Date());
  const reduce = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const cap = s => s.replace(/(^|[\s(-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  const show = s => /^[0-9]/.test(s) || /^[a-z]{2,4}$/.test(s) && /^(dna|rna|uv|ir|led|ldr|tmv|hiv|ocd|ptsd|adhd|sad|gad|bdd|bpd|did|drc|uae|uk|usa|vw|mg|ds|gmc|abs|pla|ptfe|pvc|lpg|fsh|lh|adh|tsh|acth|hcg|epo|tb|mrsa|hpv|iqr|bsl|dlr|bmx|stm|ltm)$/.test(s) ? s.toUpperCase() : cap(s);

  function norm(s, drop) {
    let k = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[’'`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9\s-]/g, " ").replace(/-/g, " ")
      .replace(/\s+/g, " ").trim().replace(/^(the|a|an) /, "");
    if (drop) k = (" " + k + " ").replace(drop, " ").replace(/\s+/g, " ").trim();
    return k;
  }
  const single = k => k.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/([^s])s$/, "$1");
  function dist(a, b) { // Damerau–Levenshtein (optimal string alignment)
    const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }

  /* ---------- prompts ---------- */
  let PROMPTS = null;
  function parse(raw) {
    return raw.map(([subject, q, list, opt]) => {
      const drop = opt && opt.drop ? new RegExp(" (" + opt.drop.trim().split(/\s+/).join("|") + ") ", "g") : null;
      const answers = list.split("|").map(item => {
        const at = item.lastIndexOf(":"), names = item.slice(0, at).split("/").map(x => x.trim()).filter(Boolean);
        const keys = [...new Set(names.map(x => norm(x, drop)).filter(Boolean))];
        return { names, keys, singles: keys.map(single), tier: +item.slice(at + 1), label: show(names[0]) };
      });
      return { id: hash(q).toString(36), subject, q, answers, drop };
    });
  }
  function loadPrompts() {
    if (PROMPTS) return Promise.resolve(PROMPTS);
    if (window.LS_PROMPTS) { PROMPTS = parse(window.LS_PROMPTS); return Promise.resolve(PROMPTS); }
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = view.dataset.src || "game-prompts.js";
      s.onload = () => { PROMPTS = parse(window.LS_PROMPTS || []); res(PROMPTS); };
      s.onerror = () => rej(new Error("Couldn’t load the prompts. Check your connection and try again."));
      document.head.appendChild(s);
    });
  }
  // Returns { answer } for a correct answer, { near: label } if it's very close to one, or null
  function judge(prompt, text) {
    const k = norm(text, prompt.drop);
    if (!k) return null;
    const ks = single(k);
    for (const a of prompt.answers) if (a.keys.includes(k) || a.singles.includes(ks)) return { answer: a };
    if (/^\d+$/.test(k)) return null;
    const allow = k.length >= 9 ? 2 : k.length >= 5 ? 1 : 0;
    if (!allow) return null;
    let best = null, bestD = 9, tie = false;
    for (const a of prompt.answers) for (const key of a.keys) {
      if (/^\d+$/.test(key)) continue;
      const dd = dist(k, key);
      if (dd < bestD) { best = a; bestD = dd; tie = false; } else if (dd === bestD && best !== a) tie = true;
    }
    return best && bestD <= allow && !tie ? { answer: best, fuzzy: true } : null;
  }
  function dailyPrompts(day) {
    const ranked = PROMPTS.map(p => ({ p, h: hash(day + "|" + p.q) })).sort((a, b) => a.h - b.h);
    const out = [], per = {};
    for (const { p } of ranked) {
      if ((per[p.subject] || 0) >= 2) continue;
      per[p.subject] = (per[p.subject] || 0) + 1; out.push(p);
      if (out.length === DAILY_COUNT) break;
    }
    return out;
  }

  /* ---------- saved data ---------- */
  let data = { days: {}, best: 0, golden: 0, runs: 0, answered: 0 };
  let docRef = null, ready = false;
  function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL) || "null"); } catch (e) { return null; } }
  function writeLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(data)); } catch (e) {} }
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    const days = { ...a.days };
    Object.entries(b.days || {}).forEach(([d, v]) => { const x = days[d]; if (!x || (v.done && !x.done) || (v.p || []).length > (x.p || []).length) days[d] = v; });
    return { days, best: Math.max(a.best || 0, b.best || 0), golden: Math.max(a.golden || 0, b.golden || 0), runs: Math.max(a.runs || 0, b.runs || 0), answered: Math.max(a.answered || 0, b.answered || 0) };
  }
  function trim() { const keys = Object.keys(data.days).sort(); keys.slice(0, Math.max(0, keys.length - 120)).forEach(k => delete data.days[k]); }
  let saveTimer = null;
  function save(now) {
    trim(); writeLocal();
    clearTimeout(saveTimer);
    const go = () => { if (docRef) docRef.set(data).catch(() => {}); };
    if (now) go(); else saveTimer = setTimeout(go, 600);
  }
  async function initStore() {
    data = merge(data, readLocal()) || data;
    try {
      const me = await window.orchardAuth.me();
      const db = await window.claude.use("db");
      docRef = db.doc(`data/users/${me.id}/longshot`);
      const snap = await docRef.get();
      if (snap.exists) data = merge(data, snap.data());
    } catch (e) {}
    // A daily left half-played (page closed mid-prompt): that prompt counts as a miss
    Object.values(data.days).forEach(d => (d.p || []).forEach(x => { if (x.pending) { delete x.pending; x.t = 0; x.a = null; } }));
    ready = true; writeLocal();
    if (S.screen === "lobby") render();
  }
  function streak() {
    const d = new Date(); let n = 0;
    if (!(data.days[iso(d)] || {}).done) d.setDate(d.getDate() - 1);
    while ((data.days[iso(d)] || {}).done) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  window.orchardLongShot = {
    forFriends: () => { const t = data.days[today()]; return t && t.done ? { d: today(), s: t.s, streak: streak(), t: (t.p || []).map(x => x.t || 0).join("") } : null; },
  };

  /* ---------- game state ---------- */
  const S = { screen: "lobby", mode: null, list: [], i: 0, score: 0, lives: LIVES, group: "all", relaxed: false, prompt: null, guesses: [], result: null, ends: 0, timer: null, recent: [], err: null };
  try { const pref = JSON.parse(localStorage.getItem(LOCAL + "-prefs") || "{}"); if (GROUPS[pref.group]) S.group = pref.group; S.relaxed = !!pref.relaxed; } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(LOCAL + "-prefs", JSON.stringify({ group: S.group, relaxed: S.relaxed })); } catch (e) {} };

  async function start(mode) {
    S.err = null;
    try { await loadPrompts(); } catch (e) { S.err = e.message; render(); return; }
    S.mode = mode; S.score = 0; S.i = 0; S.lives = LIVES;
    if (mode === "daily") {
      const day = today();
      const rec = data.days[day] || (data.days[day] = { s: 0, p: [], done: false });
      if (rec.done) { S.screen = "lobby"; render(); return; }
      S.list = dailyPrompts(day);
      S.i = rec.p.length; S.score = rec.s || 0;
      if (S.i >= S.list.length) { finishDaily(); return; }
    } else {
      try { S.recent = JSON.parse(localStorage.getItem(LOCAL + "-recent") || "[]"); } catch (e) { S.recent = []; }
      S.list = [];
    }
    next();
  }
  function pool() {
    const subs = GROUPS[S.group].subjects;
    return PROMPTS.filter(p => !subs || subs.includes(p.subject));
  }
  function next() {
    stopTimer();
    if (S.mode === "unlimited") {
      const all = pool(), fresh = all.filter(p => !S.recent.includes(p.id) && !S.list.includes(p));
      const from = fresh.length ? fresh : all.filter(p => p !== S.prompt);
      const p = from[Math.floor(Math.random() * from.length)];
      S.list.push(p); S.i = S.list.length - 1;
      S.recent = [p.id, ...S.recent.filter(x => x !== p.id)].slice(0, Math.min(60, Math.floor(all.length * .7)));
      try { localStorage.setItem(LOCAL + "-recent", JSON.stringify(S.recent)); } catch (e) {}
    }
    S.prompt = S.list[S.i]; S.guesses = []; S.result = null; S.screen = "play";
    if (S.mode === "daily") { const rec = data.days[today()]; rec.p.push({ q: S.prompt.id, a: null, t: 0, pending: true }); save(true); }
    render();
    if (!(S.mode === "unlimited" && S.relaxed)) startTimer();
    setTimeout(() => view.querySelector(".ls-input")?.focus({ preventScroll: true }), 30);
  }
  function startTimer() {
    S.ends = Date.now() + SECONDS * 1000;
    const tick = () => {
      const left = Math.max(0, S.ends - Date.now());
      const bar = view.querySelector(".ls-time i"), num = view.querySelector(".ls-time b");
      if (bar) bar.style.transform = `scaleX(${left / (SECONDS * 1000)})`;
      if (num) num.textContent = Math.ceil(left / 1000);
      view.querySelector(".ls-time")?.classList.toggle("low", left < 5000);
      if (!left) { stopTimer(); resolve(null); return; }
      S.timer = requestAnimationFrame(tick);
    };
    S.timer = requestAnimationFrame(tick);
  }
  function stopTimer() { if (S.timer) cancelAnimationFrame(S.timer); S.timer = null; }

  function guess(text) {
    if (S.screen !== "play" || S.result) return;
    text = text.trim(); if (!text) return;
    const r = judge(S.prompt, text);
    if (r) { resolve(r.answer, text, r.fuzzy); return; }
    S.guesses.unshift(text);
    const fb = view.querySelector(".ls-fb");
    if (fb) { fb.textContent = `“${text}” isn’t on our list. Try another.`; fb.classList.remove("shake"); void fb.offsetWidth; fb.classList.add("shake"); }
    const g = view.querySelector(".ls-guesses");
    if (g) g.innerHTML = S.guesses.slice(0, 6).map(x => `<span>${escH(x)}</span>`).join("");
  }
  function pass() { if (S.screen === "play" && !S.result) resolve(null); }

  function resolve(answer, typed, fuzzy) {
    stopTimer();
    const tier = answer ? answer.tier : 0, pts = TIERS[tier].p;
    S.result = { answer, tier, pts, typed, fuzzy };
    S.score += pts;
    if (tier === 6) data.golden = (data.golden || 0) + 1;
    if (answer) data.answered = (data.answered || 0) + 1;
    if (S.mode === "daily") {
      const rec = data.days[today()], x = rec.p[rec.p.length - 1];
      Object.assign(x, { a: answer ? answer.label : null, t: tier }); delete x.pending;
      rec.s = S.score;
      save(true);
    } else {
      if (!answer) S.lives--;
      save();
    }
    render();
    if (tier >= 5 && !reduce()) burst(tier);
    setTimeout(() => view.querySelector(".ls-next")?.focus({ preventScroll: true }), 40);
  }
  function advance() {
    if (S.mode === "daily") { if (S.i + 1 >= S.list.length) finishDaily(); else { S.i++; next(); } return; }
    if (S.lives <= 0) { finishRun(); return; }
    next();
  }
  function finishDaily() {
    stopTimer();
    const rec = data.days[today()]; rec.done = true; rec.s = rec.p.reduce((a, x) => a + TIERS[x.t || 0].p, 0); rec.at = Date.now();
    save(true);
    S.screen = "daily-done"; render();
    try { window.orchardSocial && window.orchardSocial.shareNow && window.orchardSocial.shareNow(); } catch (e) {}
  }
  function finishRun() {
    S.newBest = S.score > (data.best || 0);
    if (S.newBest) data.best = S.score;
    data.runs = (data.runs || 0) + 1;
    save(true);
    S.screen = "run-done"; render();
  }
  function quit() {
    stopTimer();
    if (S.mode === "daily" && !S.result) {
      // Leaving mid-prompt counts that prompt as a miss (so a hard one can't be skipped and retried)
      const rec = data.days[today()], x = rec && rec.p[rec.p.length - 1];
      if (x && x.pending) { delete x.pending; x.t = 0; x.a = null; save(true); }
    }
    if (S.mode === "unlimited" && S.list.length > 1 && S.score) { finishRun(); return; }
    S.screen = "lobby"; render();
  }

  /* ---------- share ---------- */
  function shareText(day) {
    const rec = data.days[day]; if (!rec) return "";
    const d = new Date(day + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const golds = rec.p.filter(x => x.t === 6).length;
    return `Long Shot · ${d}\n${rec.s} points${golds ? ` · ${golds} Golden Apple${golds > 1 ? "s" : ""}` : ""}\n${rec.p.map(x => TIERS[x.t || 0].sq).join("")}\nPlayed on The Orchard`;
  }
  async function share() {
    const text = shareText(today());
    try {
      if (navigator.share && window.orchardIsPhone && window.orchardIsPhone()) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      if (typeof toast === "function") toast("Result copied. Paste it anywhere.");
    } catch (e) { if (e && e.name !== "AbortError" && typeof toast === "function") toast("Couldn’t copy. Select the result and copy it yourself."); }
  }

  /* ---------- drawing ---------- */
  const tierChip = (t, big) => `<span class="ls-tier t${t}${big ? " big" : ""}" style="--t:${TIERS[t].c}">${t ? appleSVG(t) : ""}${TIERS[t].n}</span>`;
  function appleSVG(t) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2c-1.6-1.2-5.6-1.2-6.2 3-.5 3.6 2.3 7.6 4.3 7.6.9 0 1.2-.5 1.9-.5s1 .5 1.9.5c2 0 4.8-4 4.3-7.6-.6-4.2-4.6-4.2-6.2-3z"${t >= 6 ? ' class="gold"' : ""}/><path d="M12 8V5.5c0-1 .6-2 1.6-2.3"/></svg>`;
  }
  function countdown() {
    const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((m - n) / 1000));
    return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, "0")}m`;
  }
  function head() {
    return `<div class="page-head ls-head"><p class="eyebrow">Game</p><h1 class="page-title">Long Shot</h1>
      <p class="page-sub">Name a correct answer. The fewer people who’d think of it, the more it’s worth.</p></div>`;
  }
  function ladder() {
    return `<section class="o-card ls-ladder"><h3>How scoring works</h3>
      <ol>${TIERS.slice(1).reverse().map((t, i) => `<li>${tierChip(6 - i)}<b>${t.p}</b><span>${t.d}</span></li>`).join("")}</ol>
      <p class="o-dim o-small">Keep guessing until the clock runs out: wrong answers cost nothing but time. Small typos are forgiven.</p></section>`;
  }
  function friendsBox() {
    let list = null;
    try { list = window.orchardSocial && window.orchardSocial.longShot ? window.orchardSocial.longShot() : null; } catch (e) {}
    if (!list) return "";
    const mine = data.days[today()];
    const rows = [...list, ...(mine && mine.done ? [{ id: "you", name: "You", score: mine.s, picks: mine.p.map(x => x.t || 0).join(""), you: true }] : [])].sort((a, b) => b.score - a.score);
    return `<section class="o-card ls-friends"><h3>Friends today</h3>${rows.length ? `<ol>${rows.map((r, i) => `<li class="${r.you ? "me" : ""}"><span class="ls-pos">${i + 1}</span>${r.avatar || ""}<span class="ls-fname">${escH(r.name)}</span><span class="ls-sq">${String(r.picks || "").split("").map(t => TIERS[+t] ? TIERS[+t].sq : "").join("")}</span><b>${r.score}</b></li>`).join("")}</ol>` : `<p class="o-dim">No friends have played today yet${mine && mine.done ? "" : ". Be the first"}.</p>`}</section>`;
  }
  function lobby() {
    const day = today(), rec = data.days[day], done = rec && rec.done, partial = rec && !done && rec.p && rec.p.length;
    const st = streak(), played = Object.values(data.days).filter(d => d.done), bestDay = played.reduce((a, d) => Math.max(a, d.s || 0), 0);
    const nice = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    return `${head()}
      ${S.err ? `<p class="ls-err" role="alert">${escH(S.err)}</p>` : ""}
      <div class="ls-lobby">
        <section class="o-card ls-mode ls-daily${done ? " done" : ""}">
          <div class="ls-mode-top"><span class="ls-mode-ic">${appleSVG(6)}</span><div><p class="eyebrow">Daily</p><h2>Today’s seven</h2><p class="o-dim">${nice}</p></div></div>
          ${done ? `<div class="ls-daily-res"><b class="ls-big">${rec.s}</b><span class="o-dim">points</span><div class="ls-sqs">${rec.p.map(x => `<i style="--t:${TIERS[x.t || 0].c}" title="${escH(x.a || "Miss")} · ${TIERS[x.t || 0].n}"></i>`).join("")}</div></div>
              <div class="ls-row"><button type="button" class="primary" data-ls="share">Share result</button><button type="button" class="chip" data-ls="review">See answers</button></div>
              <p class="o-dim o-small">Next daily in <span data-ls-count>${countdown()}</span></p>`
            : `<p>Seven prompts, ${SECONDS} seconds each. Everyone gets the same ones today, and you get one go.</p>
              <div class="ls-row"><button type="button" class="primary" data-ls="daily">${partial ? "Carry on" : "Play today’s"}</button>${partial ? `<span class="o-dim o-small">${rec.p.length} of ${DAILY_COUNT} done</span>` : ""}</div>`}
        </section>
        <section class="o-card ls-mode ls-unl">
          <div class="ls-mode-top"><span class="ls-mode-ic alt">${appleSVG(3)}</span><div><p class="eyebrow">Unlimited</p><h2>Keep going</h2><p class="o-dim">${PROMPTS ? PROMPTS.length : "140+"} prompts · ${LIVES} lives</p></div></div>
          <div class="chips ls-groups" role="group" aria-label="Category">${Object.entries(GROUPS).map(([k, g]) => `<button type="button" class="chip sm" data-group="${k}" aria-pressed="${S.group === k}">${g.label}</button>`).join("")}</div>
          <label class="ls-relax"><input type="checkbox" data-ls="relaxed" ${S.relaxed ? "checked" : ""}><span><b>Relaxed</b> <span class="o-dim">No timer. A miss is when you pass.</span></span></label>
          <div class="ls-row"><button type="button" class="primary" data-ls="unlimited">Start</button>${data.best ? `<span class="o-dim o-small">Best run: <b>${data.best}</b></span>` : ""}</div>
        </section>
        <section class="o-card ls-stats">
          <h3>Your Long Shot</h3>
          <div class="ls-stat-grid">
            <div><b>${st}</b><span>Day streak</span></div>
            <div><b>${played.length}</b><span>Dailies played</span></div>
            <div><b>${bestDay || "–"}</b><span>Best daily</span></div>
            <div><b>${data.golden || 0}</b><span>Golden Apples</span></div>
          </div>
        </section>
        ${friendsBox()}
        ${ladder()}
      </div>`;
  }
  function play() {
    const p = S.prompt, r = S.result, timed = !(S.mode === "unlimited" && S.relaxed);
    const progress = S.mode === "daily"
      ? `<span class="ls-prog">${S.list.map((_, i) => `<i class="${i < S.i ? "done" : i === S.i ? "now" : ""}"></i>`).join("")}</span><span class="o-dim">${S.i + 1} of ${S.list.length}</span>`
      : `<span class="ls-lives" aria-label="${S.lives} lives left">${Array.from({ length: LIVES }, (_, i) => `<i class="${i < S.lives ? "on" : ""}">${appleSVG(3)}</i>`).join("")}</span><span class="o-dim">Prompt ${S.list.length}</span>`;
    return `<div class="ls-play">
      <div class="ls-bar">${progress}<span class="ls-score">${S.score}<span class="o-dim"> pts</span></span><button type="button" class="icon-btn" data-ls="quit" aria-label="${S.mode === "daily" ? "Back (your progress is saved)" : "End run"}" title="${S.mode === "daily" ? "Back (progress saved)" : "End run"}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <section class="o-card ls-card">
        <p class="ls-subj">${escH(p.subject)}</p>
        <h2 class="ls-q">${escH(p.q)}</h2>
        ${!r ? `${timed ? `<div class="ls-time" aria-hidden="true"><i></i><b>${SECONDS}</b></div>` : ""}
          <form class="ls-form" autocomplete="off"><input class="input ls-input" type="text" enterkeyhint="go" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="80" placeholder="Type an answer…" aria-label="Your answer"><button class="primary" type="submit">Go</button></form>
          <p class="ls-fb" role="status" aria-live="polite"></p>
          <div class="ls-guesses">${S.guesses.slice(0, 6).map(x => `<span>${escH(x)}</span>`).join("")}</div>
          <div class="ls-row end"><button type="button" class="chip sm" data-ls="pass">Pass</button></div>`
        : reveal(p, r)}
      </section></div>`;
  }
  function reveal(p, r) {
    const golden = p.answers.filter(a => a.tier === 6), heir = p.answers.filter(a => a.tier === 5);
    const pickFrom = (arr, n) => { const c = [...arr]; const out = []; while (c.length && out.length < n) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return out; };
    const top = pickFrom(golden.filter(a => a !== r.answer), 3);
    if (top.length < 3) top.push(...pickFrom(heir.filter(a => a !== r.answer), 3 - top.length));
    const common = p.answers.filter(a => a.tier === 1).slice(0, 3);
    const last = S.mode === "daily" ? S.i + 1 >= S.list.length : S.lives <= 0;
    return `<div class="ls-reveal t${r.tier}" style="--t:${TIERS[r.tier].c}">
        ${r.answer ? `<p class="ls-you">You said <b>${escH(r.answer.label)}</b>${r.fuzzy && r.typed ? ` <span class="o-dim">(you typed “${escH(r.typed)}”)</span>` : ""}</p>
          <div class="ls-verdict">${tierChip(r.tier, true)}<span class="ls-pts">+${r.pts}</span></div>
          <p class="o-dim">${TIERS[r.tier].d}.</p>`
        : `<p class="ls-you">${S.guesses.length ? "Out of time" : "No answer"}</p><div class="ls-verdict">${tierChip(0, true)}<span class="ls-pts">+0</span></div>
          ${S.mode === "unlimited" ? `<p class="o-dim">${S.lives > 0 ? `${S.lives} ${S.lives === 1 ? "life" : "lives"} left.` : "That was your last life."}</p>` : ""}`}
        ${top.length ? `<div class="ls-could"><p class="ls-could-h">Long shots you could have tried</p><div class="ls-could-list">${top.map(a => `<span>${tierChip(a.tier)}<b>${escH(a.label)}</b></span>`).join("")}</div></div>` : ""}
        <p class="o-dim o-small">Most people say ${common.map(a => `<b>${escH(a.label)}</b>`).join(" or ")}. ${p.answers.length} answers accepted.</p>
        <div class="ls-row end"><button type="button" class="primary ls-next" data-ls="next">${last ? (S.mode === "daily" ? "See today’s score" : "See your run") : "Next prompt"}</button></div>
      </div>`;
  }
  function dailyDone() {
    const rec = data.days[today()];
    const rows = rec.p.map((x, i) => { const p = PROMPTS && PROMPTS.find(q => q.id === x.q); return `<li><span class="ls-q-s">${escH(p ? p.q : `Prompt ${i + 1}`)}</span><span class="ls-a">${x.a ? escH(x.a) : `<span class="o-dim">No answer</span>`}</span>${tierChip(x.t || 0)}<b>${TIERS[x.t || 0].p}</b></li>`; }).join("");
    return `${head()}<div class="ls-done">
      <section class="o-card ls-final">
        <p class="eyebrow">Today’s score</p><b class="ls-big">${rec.s}</b>
        <div class="ls-sqs lg">${rec.p.map(x => `<i style="--t:${TIERS[x.t || 0].c}"></i>`).join("")}</div>
        <p class="o-dim">${streak() > 1 ? `${streak()}-day streak. ` : ""}Next daily in <span data-ls-count>${countdown()}</span>.</p>
        <div class="ls-row"><button type="button" class="primary" data-ls="share">Share result</button><button type="button" class="chip" data-ls="unlimited">Play unlimited</button><button type="button" class="chip" data-ls="lobby">Done</button></div>
      </section>
      <section class="o-card ls-review"><h3>Your answers</h3><ol>${rows}</ol></section>
      ${friendsBox()}</div>`;
  }
  function runDone() {
    return `${head()}<div class="ls-done"><section class="o-card ls-final">
      <p class="eyebrow">${S.newBest ? "New best run" : "Run over"}</p><b class="ls-big">${S.score}</b>
      <p class="o-dim">${S.list.length} prompt${S.list.length === 1 ? "" : "s"} · ${GROUPS[S.group].label}${S.relaxed ? " · relaxed" : ""} · best ${data.best}</p>
      <div class="ls-row"><button type="button" class="primary" data-ls="unlimited">Play again</button><button type="button" class="chip" data-ls="lobby">Back</button></div>
    </section></div>`;
  }
  function render() {
    if (S.screen === "play") view.innerHTML = play();
    else if (S.screen === "daily-done") view.innerHTML = dailyDone();
    else if (S.screen === "run-done") view.innerHTML = runDone();
    else view.innerHTML = lobby();
    view.dataset.screen = S.screen;
  }

  function burst(tier) {
    const card = view.querySelector(".ls-verdict"); if (!card) return;
    const box = document.createElement("div"); box.className = "ls-burst"; box.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 18; i++) { const s = document.createElement("i"); const a = (i / 18) * Math.PI * 2; s.style.setProperty("--x", Math.cos(a) * (60 + Math.random() * 50) + "px"); s.style.setProperty("--y", Math.sin(a) * (40 + Math.random() * 40) + "px"); s.style.background = TIERS[tier].c; box.appendChild(s); }
    card.appendChild(box); setTimeout(() => box.remove(), 1200);
  }

  /* ---------- events ---------- */
  view.addEventListener("submit", e => {
    if (!e.target.closest(".ls-form")) return;
    e.preventDefault();
    const inp = view.querySelector(".ls-input"); const v = inp.value; inp.value = ""; guess(v); inp.focus({ preventScroll: true });
  });
  view.addEventListener("click", e => {
    const g = e.target.closest("[data-group]");
    if (g) { S.group = g.dataset.group; savePrefs(); view.querySelectorAll("[data-group]").forEach(b => b.setAttribute("aria-pressed", String(b === g))); return; }
    const b = e.target.closest("[data-ls]"); if (!b) return;
    const act = b.dataset.ls;
    if (act === "daily") start("daily");
    else if (act === "unlimited") start("unlimited");
    else if (act === "pass") pass();
    else if (act === "next") advance();
    else if (act === "quit") quit();
    else if (act === "share") share();
    else if (act === "review") { loadPrompts().then(() => { S.screen = "daily-done"; render(); }).catch(() => {}); }
    else if (act === "lobby") { S.screen = "lobby"; render(); scrollTo(0, 0); }
  });
  view.addEventListener("change", e => { if (e.target.matches('[data-ls="relaxed"]')) { S.relaxed = e.target.checked; savePrefs(); } });
  addEventListener("keydown", e => {
    if (document.body.dataset.view !== "longshot") return;
    if (e.key === "Enter" && S.screen === "play" && S.result && !e.target.closest("input, textarea, button")) { e.preventDefault(); advance(); }
  });
  // Leaving the page pauses nothing: a timed prompt keeps running, like the real clock
  addEventListener("hashchange", () => {
    if (location.hash === "#longshot") { if (S.screen === "lobby") { render(); loadPrompts().then(() => { if (S.screen === "lobby") render(); }).catch(() => {}); } }
  });
  setInterval(() => { view.querySelectorAll("[data-ls-count]").forEach(x => (x.textContent = countdown())); }, 30000);

  render();
  if (location.hash === "#longshot") loadPrompts().then(() => { if (S.screen === "lobby") render(); }).catch(() => {});
  initStore();
})();

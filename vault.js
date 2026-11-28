/* The Orchard: The Vault — past papers you answer on the site, marked question by question.

   Papers live in vault/papers/<subject>/<id>.json and are listed in vault/index.json
   (built by tools/vault_build.py; the format is in vault/README.md).

   Routes (all under the "vault" tab):
     #vault                       browse, filter and search
     #vault/paper/<paperId>       a paper's cover and questions
     #vault/check                 checks every paper's topic tags against the site

   Saved per person (account docs, or this device when signed out):
     data/users/<uid>/vault/attempts/<paperId>   status, answers, marks
     data/users/<uid>/vault/prefs                feedback mode and other choices */
(function () {
  "use strict";
  const view = document.getElementById("view-vault");
  if (!view) return;

  /* ---------- small helpers ---------- */
  const H = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => (typeof toast === "function" ? toast(m) : console.log(m));
  const CHEV = '<svg class="vt-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  };
  const TYPE_LABEL = { mcq: "Multiple choice", short: "Short answer", calc: "Calculation", extended: "Extended response", diagram: "Diagram or graph" };
  const STATUS_LABEL = { new: "Not started", going: "In progress", done: "Completed" };

  /* Question text uses a tiny, safe markup: **bold**, *italic*, x^{2}, CO_{2},
     a blank line for a new paragraph and a single line break for <br>. */
  function inline(s) {
    return H(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\^\{(.+?)\}/g, "<sup>$1</sup>")
      .replace(/_\{(.+?)\}/g, "<sub>$1</sub>")
      .replace(/(^|[\s(])\*(?=\S)(.+?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
      .replace(/\n/g, "<br>");
  }
  const fmt = s => String(s || "").split(/\n{2,}/).map(p => `<p>${inline(p)}</p>`).join("");
  const plain = s => String(s || "").replace(/\*\*|\*|\^\{|_\{|\}/g, "").replace(/\s+/g, " ").trim();
  const mins = m => m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} mins` : ""}` : `${m} mins`;
  const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  /* ---------- the site's topics (shared with every subject page) ---------- */
  let TOPICS = null;
  function topics() {
    if (TOPICS) return TOPICS;
    TOPICS = new Map();
    (typeof ALL_SUBS !== "undefined" ? ALL_SUBS : []).forEach(s => TOPICS.set(s.key, {
      key: s.key, name: s.name, group: s.group, topic: s.topic.name, topicId: s.topic.id,
      subject: s.topic.def.subject, view: s.topic.def.view,
    }));
    return TOPICS;
  }
  const subjectDef = name => (typeof SUBJECTS !== "undefined" ? SUBJECTS : []).find(d => d.subject === name);
  const subjectColour = name => { const d = subjectDef(name); return (d && typeof O_SUBJECT_COLOURS !== "undefined" && O_SUBJECT_COLOURS[d.view]) || "var(--ink-faint)"; };
  const subjectOrder = name => { const i = (typeof SUBJECTS !== "undefined" ? SUBJECTS : []).findIndex(d => d.subject === name); return i < 0 ? 99 : i; };

  /* ---------- papers ---------- */
  const V = { index: null, indexErr: null, papers: new Map(), loading: new Map() };
  function loadIndex() {
    if (V.index || V.indexLoading) return V.indexLoading || Promise.resolve(V.index);
    V.indexLoading = fetch("vault/index.json", { cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(j => { V.index = j.papers || []; V.indexErr = null; return V.index; })
      .catch(() => { V.indexErr = "Couldn’t load the list of papers. Check your connection and try again."; V.indexLoading = null; return null; });
    return V.indexLoading;
  }
  const meta = id => (V.index || []).find(p => p.id === id);
  function loadPaper(id) {
    if (V.papers.has(id)) return Promise.resolve(V.papers.get(id));
    if (V.loading.has(id)) return V.loading.get(id);
    const m = meta(id);
    if (!m) return Promise.resolve(null);
    const p = fetch(m.file, { cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { prepare(d); V.papers.set(id, d); V.loading.delete(id); return d; })
      .catch(e => { V.loading.delete(id); throw e; });
    V.loading.set(id, p);
    return p;
  }
  /* Flat list of markable parts, each knowing its question */
  function prepare(d) {
    d.parts = [];
    d.questions.forEach(q => q.parts.forEach((p, i) => { p.q = q; p.first = i === 0; d.parts.push(p); }));
  }

  /* ---------- saved progress ---------- */
  const S = { mode: "loading", attempts: {}, prefs: {}, col: null, prefsDoc: null, db: null, base: "" };
  let A = null; // the paper open for answering
  const LS_ATT = "orchard-vault-attempts", LS_PREFS = "orchard-vault-prefs";
  const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function useLocal() {
    if (S.mode !== "loading") return;
    S.mode = "local";
    S.attempts = readLS(LS_ATT, {});
    S.prefs = readLS(LS_PREFS, {});
    render();
  }
  async function initStore() {
    const fallback = setTimeout(useLocal, 10000);
    try {
      if (!window.claude || typeof window.claude.use !== "function") throw new Error("no runtime");
      const db = await window.claude.use("db"), user = db ? await window.claude.use("user") : null;
      const uid = user ? await user.id() : null;
      if (!db || !uid) throw new Error("no store");
      S.db = db; S.base = `data/users/${uid}/vault`;
      S.col = db.collection(`${S.base}/attempts`);
      S.prefsDoc = db.doc(`${S.base}/prefs`);
      S.prefsDoc.onSnapshot(snap => { S.prefs = (snap.exists && snap.data()) || {}; }, () => {});
      S.col.onSnapshot(snap => {
        clearTimeout(fallback);
        const first = S.mode !== "db";
        S.mode = "db";
        S.attempts = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
        /* While a paper is open for answering, its working copy wins and the page isn't redrawn */
        if (A) S.attempts[A.id] = A.att;
        if (A && !first) return;
        render();
      }, () => { clearTimeout(fallback); S.col = null; useLocal(); });
    } catch (e) { clearTimeout(fallback); useLocal(); }
  }
  /* Saves throw on failure, so callers can retry */
  async function saveAttempt(id, data) {
    data.updatedAt = Date.now();
    S.attempts[id] = data;
    if (S.mode === "db" && S.col) await S.col.doc(id).set(data);
    else writeLS(LS_ATT, S.attempts);
  }
  function savePrefs(patch) {
    Object.assign(S.prefs, patch);
    if (S.mode === "db" && S.prefsDoc) S.prefsDoc.set({ ...S.prefs }).catch(() => {});
    else writeLS(LS_PREFS, S.prefs);
  }
  /* Handwriting: one doc per answer, so typing doesn't re-upload drawings */
  const inkPath = (id, part) => `${id}--${part}`;
  async function loadInk(id, part) {
    if (S.mode === "db" && S.db) { const snap = await S.db.doc(`${S.base}/ink/${inkPath(id, part)}`).get(); return snap.exists ? snap.data() : null; }
    return readLS("orchard-vault-ink:" + inkPath(id, part), null);
  }
  async function saveInk(id, part, data) {
    if (S.mode === "db" && S.db) await S.db.doc(`${S.base}/ink/${inkPath(id, part)}`).set(data);
    else { try { localStorage.setItem("orchard-vault-ink:" + inkPath(id, part), JSON.stringify(data)); } catch (e) { throw new Error("This device is out of space for drawings."); } }
  }
  const isAnswered = x => !!(x && (String(x.text || "").trim() || String(x.final || "").trim() || (x.choice && x.choice.length) || x.ink > 0));

  /* Status of a paper for this person */
  function statusOf(m) {
    const a = S.attempts[m.id];
    if (!a) return { key: "new", label: STATUS_LABEL.new };
    if (a.status === "completed") {
      const score = a.score ?? 0, total = a.total ?? m.totalMarks;
      return { key: "done", label: `${score}/${total}`, pct: total ? Math.round(score / total * 100) : 0, score, total };
    }
    const answered = Object.values(a.answers || {}).filter(isAnswered).length;
    return { key: "going", label: `${answered}/${m.parts.length} answered`, pct: Math.round(answered / m.parts.length * 100) };
  }
  const statusPill = st => `<span class="vt-status" data-s="${st.key}"><i aria-hidden="true"></i>${st.key === "done" ? `Completed · <b>${H(st.label)}</b>` : H(st.key === "going" ? `In progress · ${st.label}` : st.label)}</span>`;

  /* ---------- browse state ---------- */
  const UI_KEY = "orchard-vault-ui";
  const ui = Object.assign({ subject: "all", status: "all", year: "all", tier: "all", board: "all", q: "" }, readLS(UI_KEY, {}));
  const saveUI = () => writeLS(UI_KEY, { subject: ui.subject, status: ui.status, year: ui.year, tier: ui.tier, board: ui.board });

  /* ---------- routing ---------- */
  function parse() {
    const parts = (location.hash || "").slice(1).split("/");
    if (parts[0] !== "vault") return null;
    if (parts[1] === "paper" && parts[2]) return { page: parts[3] === "answer" ? "answer" : "paper", id: decodeURIComponent(parts[2]), part: parts[4] ? decodeURIComponent(parts[4]) : null };
    if (parts[1] === "check") return { page: "check" };
    return { page: "home" };
  }
  function crumbs(r, extra) {
    const c = document.querySelector(".o-crumbs");
    if (!c) return;
    c.innerHTML = r.page === "home"
      ? `<span>The Orchard</span><i aria-hidden="true"></i><b>The Vault</b>`
      : `<a href="#vault">The Vault</a><i aria-hidden="true"></i><b>${H(extra || "")}</b>`;
  }

  let lastRoute = "";
  function render() {
    const r = parse();
    if (!r) return;
    const key = location.hash;
    const fresh = key !== lastRoute;
    lastRoute = key;
    if (!V.index && !V.indexErr) { view.innerHTML = skeleton(); loadIndex().then(render); return; }
    if (V.indexErr) { view.innerHTML = head() + `<p class="empty">${H(V.indexErr)} <button type="button" class="chip sm" data-vt="retry">Try again</button></p>`; crumbs(r); return; }
    if (r.page === "answer") return renderAnswer(r);
    if (A) closeAnswer();
    if (r.page === "paper") return renderPaper(r, fresh);
    if (r.page === "check") return renderCheck(r);
    renderHome(r, fresh);
  }
  const head = () => `<div class="page-head"><h1 class="page-title">The Vault</h1><p class="page-sub">Past papers you answer here, marked question by question.</p></div>`;
  const skeleton = () => head() + `<div class="vt-skel" aria-hidden="true"><i></i><i></i><i></i></div>`;

  /* ---------- browse ---------- */
  function haystack(m) {
    if (m._hay) return m._hay;
    const T = topics();
    const tnames = [...new Set(m.parts.flatMap(p => p.topics))].map(k => T.get(k)).filter(Boolean).flatMap(t => [t.name, t.group, t.topic]);
    m._hay = fold([m.subject, m.board, m.spec, m.tier, m.series, m.year, m.paper, m.title, ...tnames].join(" "));
    m.parts.forEach(p => { p._hay = fold(p.text + " " + p.topics.map(k => (T.get(k) || {}).name || "").join(" ")); });
    return m._hay;
  }
  function search(list, q) {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return list.map(m => ({ m, hits: [] }));
    const out = [];
    list.forEach(m => {
      const hay = haystack(m);
      const hits = m.parts.filter(p => words.every(w => p._hay.includes(w)));
      if (words.every(w => hay.includes(w) || m.parts.some(p => p._hay.includes(w))) || hits.length) {
        const paperMatch = words.every(w => hay.includes(w));
        out.push({ m, hits: paperMatch && !hits.length ? [] : hits });
      }
    });
    return out;
  }

  function renderHome(r, fresh) {
    const all = V.index;
    const subjects = [...new Set(all.map(m => m.subject))].sort((a, b) => subjectOrder(a) - subjectOrder(b));
    const years = [...new Set(all.map(m => m.year).filter(Boolean))].sort((a, b) => b - a);
    const boards = [...new Set(all.map(m => m.board))].sort();
    const tiers = [...new Set(all.map(m => m.tier).filter(Boolean))];
    if (ui.subject !== "all" && !subjects.includes(ui.subject)) ui.subject = "all";

    const sts = all.map(statusOf);
    const done = all.filter((m, i) => sts[i].key === "done"), going = sts.filter(s => s.key === "going").length;
    const avg = done.length ? Math.round(done.reduce((a, m) => a + statusOf(m).pct, 0) / done.length) : null;

    let list = all.filter(m =>
      (ui.subject === "all" || m.subject === ui.subject) &&
      (ui.status === "all" || statusOf(m).key === ui.status) &&
      (ui.year === "all" || String(m.year) === ui.year) &&
      (ui.board === "all" || m.board === ui.board) &&
      (ui.tier === "all" || m.tier === ui.tier || !m.tier));
    const found = search(list, ui.q);

    const chip = (k, v, label, extra) => `<button type="button" class="chip sm" data-f="${k}" data-v="${H(v)}" aria-pressed="${ui[k] === v}">${extra || ""}${H(label)}</button>`;
    const sel = (k, label, opts) => opts.length > 1 ? `<label class="vt-select"><span class="sr-only">${label}</span><select class="input" data-f="${k}">${[["all", label], ...opts].map(([v, l]) => `<option value="${H(v)}"${ui[k] === v ? " selected" : ""}>${H(l)}</option>`).join("")}</select></label>` : "";

    view.innerHTML = head() + `
      <div class="stats four vt-hero">
        <div class="stat"><span class="v">${all.length}</span><span class="k">Papers in the Vault</span></div>
        <div class="stat"><span class="v">${done.length}</span><span class="k">Completed</span></div>
        <div class="stat"><span class="v">${going}</span><span class="k">In progress</span></div>
        <div class="stat"><span class="v">${avg === null ? "–" : avg + "%"}</span><span class="k">Average score</span></div>
      </div>
      <div class="vt-tools">
        <div class="vt-search" role="search">${ICON.search}
          <input id="vt-q" type="search" placeholder="Search papers, questions and topics" autocomplete="off" spellcheck="false" aria-label="Search the Vault" value="${H(ui.q)}">
          <button type="button" class="icon-btn vt-q-clear" data-vt="clear" aria-label="Clear search"${ui.q ? "" : " hidden"}>${ICON.x}</button>
        </div>
        <div class="chips vt-chips" role="group" aria-label="Subject">${chip("subject", "all", "All subjects")}${subjects.map(s => chip("subject", s, s, `<i class="vt-dot" style="--c:${subjectColour(s)}"></i>`)).join("")}</div>
        <div class="vt-row">
          <div class="chips vt-chips" role="group" aria-label="Status">${["all", "new", "going", "done"].map(s => chip("status", s, s === "all" ? "Any status" : STATUS_LABEL[s])).join("")}</div>
          <div class="vt-selects">${sel("year", "All years", years.map(y => [String(y), String(y)]))}${sel("board", "All exam boards", boards.map(b => [b, b]))}${sel("tier", "Both tiers", tiers.map(t => [t, t + " tier"]))}</div>
        </div>
      </div>
      <div id="vt-list" aria-live="polite">${listHTML(found)}</div>
      <p class="vt-foot">Every paper is marked against its mark scheme. Orchard practice papers follow the exam board’s format but aren’t official papers. <a href="#vault/check">Check papers</a></p>`;
    crumbs(r);
  }

  function listHTML(found) {
    if (!found.length) {
      const any = ui.q || ui.subject !== "all" || ui.status !== "all" || ui.year !== "all" || ui.board !== "all" || ui.tier !== "all";
      return `<p class="empty">${any ? `No papers match. <button type="button" class="chip sm" data-vt="reset">Clear filters</button>` : "No papers in the Vault yet."}</p>`;
    }
    const T = topics();
    const bySub = new Map();
    found.forEach(f => { if (!bySub.has(f.m.subject)) bySub.set(f.m.subject, []); bySub.get(f.m.subject).push(f); });
    return [...bySub.entries()].sort((a, b) => subjectOrder(a[0]) - subjectOrder(b[0])).map(([sub, fs]) => {
      const groups = new Map();
      fs.forEach(f => { const k = [f.m.board, f.m.spec, f.m.tier].join("|"); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
      const nDone = fs.filter(f => statusOf(f.m).key === "done").length;
      return `<section class="vt-subj" style="--c:${subjectColour(sub)}">
        <header class="vt-subj-head"><i class="vt-dot" aria-hidden="true"></i><h2>${H(sub)}</h2><span>${fs.length} ${fs.length === 1 ? "paper" : "papers"}${nDone ? ` · ${nDone} completed` : ""}</span></header>
        ${[...groups.values()].map(g => {
          const m0 = g[0].m;
          const series = new Map();
          g.forEach(f => { const k = `${f.m.year || ""}|${f.m.series}`; if (!series.has(k)) series.set(k, []); series.get(k).push(f); });
          return `<div class="vt-board">
            <p class="vt-board-h">${H([m0.qualification, m0.board, m0.spec, m0.tier && m0.tier + " tier"].filter(Boolean).join(" · "))}</p>
            ${[...series.values()].map(sf => `<div class="vt-series">
              <h3 class="vt-series-h">${H(sf[0].m.series)}${sf[0].m.year && !String(sf[0].m.series).includes(String(sf[0].m.year)) ? ` <span>${sf[0].m.year}</span>` : ""}${sf[0].m.official ? "" : ` <span class="vt-badge">Practice</span>`}</h3>
              ${sf.map(f => paperRow(f, T)).join("")}
            </div>`).join("")}
          </div>`;
        }).join("")}
      </section>`;
    }).join("");
  }

  function paperRow(f, T) {
    const m = f.m, st = statusOf(m);
    const facts = [mins(m.minutes), `${m.totalMarks} marks`, m.calculator === false ? "No calculator" : m.calculator ? "Calculator" : ""].filter(Boolean);
    const hits = f.hits.slice(0, 3).map(p => {
      const t = T.get(p.topics[0]);
      return `<a class="vt-hit" href="#vault/paper/${encodeURIComponent(m.id)}/answer/${encodeURIComponent(p.id)}"><b>${H(p.label)}</b><span>${H(p.text)}</span>${t ? `<em>${H(t.name)}</em>` : ""}</a>`;
    }).join("");
    return `<div class="vt-paper-wrap">
      <a class="vt-paper glass" href="#vault/paper/${encodeURIComponent(m.id)}" data-s="${st.key}">
        <span class="vt-pnum">${H(m.paper)}</span>
        <span class="vt-pmain"><b>${H(m.title)}</b><small>${facts.map(H).join(" · ")}</small></span>
        <span class="vt-pside">${statusPill(st)}${st.key !== "new" ? `<span class="vt-meter" aria-hidden="true"><i style="width:${st.pct}%"></i></span>` : ""}</span>
        ${CHEV}
      </a>
      ${hits ? `<div class="vt-hits"><p>${f.hits.length} matching ${f.hits.length === 1 ? "question" : "questions"}</p>${hits}${f.hits.length > 3 ? `<a class="vt-hit vt-more" href="#vault/paper/${encodeURIComponent(m.id)}">and ${f.hits.length - 3} more</a>` : ""}</div>` : ""}
    </div>`;
  }

  /* ---------- a paper ---------- */
  function figuresHTML(figs) {
    return (figs || []).map(f => {
      if (f.type === "image") return `<figure class="vt-fig${f.lineArt ? " line-art" : ""}"><img src="${H(f.src)}" alt="${H(f.alt)}" loading="lazy" decoding="async">${f.caption ? `<figcaption>${H(f.caption)}</figcaption>` : ""}</figure>`;
      if (f.type === "table") return `<figure class="vt-fig">${f.caption ? `<figcaption>${H(f.caption)}</figcaption>` : ""}<div class="vt-table-wrap"><table class="vt-table">${f.head ? `<thead><tr>${f.head.map(c => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${f.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></figure>`;
      if (f.type === "text") return `<figure class="vt-fig vt-extract">${f.caption ? `<figcaption>${H(f.caption)}</figcaption>` : ""}<div class="vt-extract-body">${fmt(f.body)}</div></figure>`;
      return "";
    }).join("");
  }
  function tagHTML(key) {
    const t = topics().get(key);
    if (!t) return `<span class="vt-tag unknown" title="This topic tag isn’t on the site: ${H(key)}">Unknown topic</span>`;
    return `<span class="vt-tag" title="${H(`${t.subject} › ${t.topic} › ${t.group}`)}"><span class="vt-tag-t">${H(t.topic)}</span>${H(t.name)}</span>`;
  }
  /* ---------- questions ---------- */
  const words = s => (String(s || "").match(/\S+/g) || []).length;
  const defaultMode = p => p.type === "diagram" ? "ink" : (S.prefs.inputMode === "ink" ? "ink" : "type");
  const sourceHTML = x => `<aside class="vt-source glass" id="vt-src-${H(x.id)}" aria-label="${H(x.title)}"><p class="vt-k">${H(x.title)}</p>${fmt(x.body)}${figuresHTML(x.figures)}</aside>`;

  function answerHTML(p, a) {
    if (p.type === "mcq") {
      const ch = a.choice || [];
      return `<div class="vt-opts vt-opts-ans" role="group" aria-label="Options${p.pick > 1 ? `, choose ${p.pick}` : ""}">${p.options.map(o => `<button type="button" class="vt-opt" data-opt="${H(o.key)}" aria-pressed="${ch.includes(o.key)}"><span class="vt-opt-k">${H(o.key)}</span><span class="vt-opt-t">${inline(o.text)}</span></button>`).join("")}</div>${p.pick > 1 ? `<p class="vt-pick">Choose ${p.pick}.</p>` : ""}`;
    }
    const mode = a.mode || defaultMode(p), calc = p.type === "calc";
    const long = p.type === "extended" || (p.lines || 0) >= 6 || p.marks >= 4;
    const rows = Math.max(2, Math.min(16, p.lines || (calc ? 3 : p.marks * 2)));
    return `<div class="vt-ans" data-mode="${mode}">
      <div class="vt-ans-top">
        <div class="vt-mode" role="group" aria-label="Answer by"><button type="button" data-mode="type" aria-pressed="${mode === "type"}">Type</button><button type="button" data-mode="ink" aria-pressed="${mode === "ink"}">Write</button></div>
        ${calc ? `<span class="vt-ans-k">Working</span>` : ""}
      </div>
      <div class="vt-pane-type"><textarea class="vt-ta" rows="${rows}" placeholder="${calc ? "Show your working" : "Type your answer"}" aria-label="${calc ? "Working" : "Answer"} for ${H(p.label)}"${calc ? ' spellcheck="false" autocapitalize="off" autocorrect="off"' : ""}>${H(a.text || "")}</textarea>${long ? `<p class="vt-wc" aria-live="polite">${words(a.text)} words</p>` : ""}</div>
      <div class="vt-pane-ink"></div>
      ${calc ? `<label class="vt-final"><span>Answer</span>${p.prefix ? `<i>${H(p.prefix)}</i>` : ""}<input class="input" data-final autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${H(a.final || "")}" aria-label="Final answer for ${H(p.label)}">${p.units ? `<i>${H(p.units)}</i>` : ""}</label>` : ""}
    </div>`;
  }
  function partHTML(p, a) {
    return `<div class="vt-part" id="vt-p-${H(p.id)}" data-part="${H(p.id)}">
      <div class="vt-part-top"><span class="vt-label">${H(p.label)}</span><div class="vt-text">${fmt(p.text)}</div><span class="vt-marks">${p.marks} ${p.marks === 1 ? "mark" : "marks"}</span></div>
      ${figuresHTML(p.figures)}
      <div class="vt-part-foot">${p.topics.map(tagHTML).join("")}<span class="vt-type">${TYPE_LABEL[p.type] || ""}</span></div>
      ${answerHTML(p, a || {})}
    </div>`;
  }

  /* ---------- a paper's cover ---------- */
  function renderPaper(r) {
    const m = meta(r.id);
    if (!m) { view.innerHTML = `<a class="vt-back" href="#vault">${ICON.back}The Vault</a><p class="empty">That paper isn’t in the Vault.</p>`; crumbs(r, "Not found"); return; }
    const d = V.papers.get(r.id);
    crumbs(r, `${m.subject} ${m.paper}`);
    if (!d) return waitForPaper(r, renderPaper);
    const st = statusOf(m), T = topics(), ans = (S.attempts[m.id] || {}).answers || {};
    const facts = [mins(d.minutes), `${d.totalMarks} marks`, d.calculator === false ? "No calculator" : d.calculator ? "Calculator allowed" : "", `${d.parts.length} questions`].filter(Boolean);
    const byTopic = new Map();
    d.parts.forEach(p => { const t = T.get(p.topics[0]); const k = t ? t.topic : "Other"; byTopic.set(k, (byTopic.get(k) || 0) + p.marks); });
    const action = st.key === "done" ? "Review paper" : st.key === "going" ? "Continue paper" : "Start paper";
    const go = p => `#vault/paper/${encodeURIComponent(d.id)}/answer/${encodeURIComponent(p.id)}`;

    view.innerHTML = `<a class="vt-back" href="#vault">${ICON.back}The Vault</a>
      <header class="vt-cover paper-head glass" style="--c:${subjectColour(d.subject)}">
        <p class="eyebrow">${H([d.qualification || "GCSE", d.board, d.spec, d.tier && d.tier + " tier"].filter(Boolean).join(" · "))}</p>
        <h1 class="vt-title"><i class="vt-dot" aria-hidden="true"></i>${H(d.subject)} ${H(d.paper)}</h1>
        <p class="vt-subtitle">${H(d.title)}</p>
        <div class="paper-meta">${facts.map(f => `<span class="tag">${H(f)}</span>`).join("")}<span class="tag">${H(d.series)}${d.year && !d.series.includes(String(d.year)) ? " " + d.year : ""}</span>${d.official ? "" : `<span class="tag">Practice paper</span>`}</div>
        <div class="vt-cover-foot">${statusPill(st)}<button type="button" class="primary" data-vt="start">${action}</button></div>
      </header>
      <div class="vt-cols">
        <div class="vt-info glass">
          <p class="vt-k">Instructions</p>
          <ul class="vt-instr">${(d.instructions || []).map(i => `<li>${inline(i)}</li>`).join("")}</ul>
          ${d.boundaries ? `<p class="vt-k">Grade boundaries</p><div class="vt-bounds">${Object.entries(d.boundaries.grades).sort((a, b) => b[0] - a[0]).map(([g, mk]) => `<span><b>${H(g)}</b>${mk}</span>`).join("")}</div>${d.boundaries.note ? `<p class="vt-note">${H(d.boundaries.note)}</p>` : ""}` : ""}
        </div>
        <div class="vt-info glass">
          <p class="vt-k">What it covers</p>
          <ul class="vt-cover-topics">${[...byTopic.entries()].sort((a, b) => b[1] - a[1]).map(([t, mk]) => `<li><span>${H(t)}</span><span class="vt-bar"><i style="width:${Math.round(mk / Math.max(...byTopic.values()) * 100)}%"></i></span><b>${mk}</b></li>`).join("")}</ul>
        </div>
      </div>
      <p class="block-label vt-qhead">Questions</p>
      <ol class="vt-qlist glass">${d.parts.map(p => {
        const t = T.get(p.topics[0]), done = isAnswered(ans[p.id]);
        return `<li><a href="${go(p)}"><span class="vt-label">${H(p.label)}</span><span class="vt-ql-t"><span>${H(plain((p.first && p.q.stem && !/^(This question|Read )/.test(p.q.stem) ? p.q.stem + " " : "") + p.text))}</span>${t ? `<small>${H(t.name)}</small>` : ""}</span><span class="vt-ql-m">${p.marks}</span><i class="vt-ql-dot" data-on="${done}" aria-label="${done ? "Answered" : "Not answered"}"></i></a></li>`;
      }).join("")}</ol>`;
  }
  function waitForPaper(r, then) {
    view.innerHTML = `<a class="vt-back" href="#vault">${ICON.back}The Vault</a><div class="vt-skel" aria-hidden="true"><i></i><i></i></div>`;
    loadPaper(r.id).then(() => { if (parse()?.id === r.id) render(); })
      .catch(() => { if (parse()?.id === r.id) view.innerHTML = `<a class="vt-back" href="#vault">${ICON.back}The Vault</a><p class="empty">Couldn’t load this paper. Check your connection and try again.</p>`; });
  }

  /* ---------- answering ----------
     A = the paper open for answering: { id, d, att, inks: Map(partId → canvas) }.
     Typed answers save to the attempt doc; each drawing saves to its own doc. */
  const SAVE = { attempt: 0, ink: new Map(), failed: false };
  function setSaveState() {
    const el = document.getElementById("vt-save");
    if (!el) return;
    const pending = SAVE.attempt || SAVE.ink.size;
    const s = SAVE.failed ? "error" : pending ? "saving" : "saved";
    el.dataset.s = s;
    el.textContent = s === "error" ? "Not saved yet, retrying" : s === "saving" ? "Saving…" : S.mode === "db" ? "Saved" : "Saved on this device";
  }
  function answerOf(pid) { const a = A.att.answers; return a[pid] || (a[pid] = {}); }
  function touched(pid) {
    answerOf(pid).at = Date.now();
    clearTimeout(SAVE.attempt);
    SAVE.attempt = setTimeout(flushAttempt, 700);
    setSaveState(); updateProgress();
  }
  async function flushAttempt() {
    clearTimeout(SAVE.attempt); SAVE.attempt = 0;
    if (!A) return;
    try { await saveAttempt(A.id, A.att); SAVE.failed = false; }
    catch (e) { SAVE.failed = true; SAVE.attempt = setTimeout(flushAttempt, 5000); }
    setSaveState();
  }
  function inkChanged(pid, api) {
    const a = answerOf(pid);
    a.ink = api.count();
    touched(pid);
    clearTimeout(SAVE.ink.get(pid));
    SAVE.ink.set(pid, setTimeout(() => flushInk(pid), 1200));
    setSaveState();
  }
  async function flushInk(pid) {
    clearTimeout(SAVE.ink.get(pid)); SAVE.ink.delete(pid);
    if (!A || !A.inks.get(pid)) return;
    try { await saveInk(A.id, pid, A.inks.get(pid).data()); SAVE.failed = false; }
    catch (e) { SAVE.failed = true; SAVE.ink.set(pid, setTimeout(() => flushInk(pid), 5000)); if (/space/.test(e.message)) say(e.message); }
    setSaveState();
  }
  function flushAll() {
    if (!A) return Promise.resolve();
    const jobs = [...SAVE.ink.keys()].map(flushInk);
    if (SAVE.attempt) jobs.push(flushAttempt());
    return Promise.all(jobs);
  }
  function closeAnswer() {
    flushAll();
    A.inks.forEach(x => x.destroy());
    A = null;
  }
  async function mountInk(pid) {
    if (!A || A.inks.has(pid)) return;
    const host = view.querySelector(`#vt-p-${CSS.escape(pid)} .vt-pane-ink`);
    if (!host) return;
    const p = A.d.parts.find(x => x.id === pid), id = A.id;
    A.inks.set(pid, null);
    host.innerHTML = `<div class="vt-skel" aria-hidden="true"><i></i></div>`;
    let data = null;
    if (answerOf(pid).ink > 0) { try { data = await loadInk(id, pid); } catch (e) { say("Couldn’t load your drawing. Check your connection."); } }
    if (!A || A.id !== id || !host.isConnected) return;
    host.innerHTML = "";
    const lines = p.lines || (p.type === "diagram" ? 12 : p.marks * 2 + 2);
    const api = VaultInk.mount(host, { data, background: p.background || (p.type === "diagram" ? "grid" : "lined"), height: Math.max(260, Math.min(1400, lines * 44 + 40)), label: `Handwritten answer for ${p.label}`, onChange: x => inkChanged(pid, x) });
    A.inks.set(pid, api);
  }
  function updateProgress() {
    if (!A) return;
    const n = A.d.parts.filter(p => isAnswered(A.att.answers[p.id])).length;
    const el = document.getElementById("vt-progress");
    if (el) el.textContent = `${n} of ${A.d.parts.length} answered`;
    const bar = document.getElementById("vt-progress-bar");
    if (bar) bar.style.width = Math.round(n / A.d.parts.length * 100) + "%";
    view.querySelectorAll(".vt-jump [data-jump]").forEach(b => b.dataset.on = String(isAnswered(A.att.answers[b.dataset.jump])));
  }
  /* Late layout (fonts, figures, canvases) can move the question after the jump,
     so keep it in place for a moment, unless the student scrolls first. */
  let settle = 0;
  function scrollToPart(pid, smooth) {
    const el = document.getElementById("vt-p-" + pid);
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    if (smooth) return;
    const run = ++settle, until = performance.now() + 1500, margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const stop = () => { settle++; ["wheel", "touchstart", "keydown", "pointerdown"].forEach(t => removeEventListener(t, stop, true)); };
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach(t => addEventListener(t, stop, { capture: true, passive: true }));
    (function check() {
      if (run !== settle || !el.isConnected) return;
      if (performance.now() > until) return stop();
      const top = el.getBoundingClientRect().top;
      if (Math.abs(top - margin) > 4 && scrollY + innerHeight < document.documentElement.scrollHeight - 2 || top - margin < -4) scrollTo(0, scrollY + top - margin);
      requestAnimationFrame(check);
    })();
  }

  function renderAnswer(r) {
    const m = meta(r.id);
    if (!m) return renderPaper(r);
    crumbs(r, `${m.subject} ${m.paper}`);
    if (!V.papers.get(r.id)) return waitForPaper(r);
    if (S.mode === "loading") { view.innerHTML = `<div class="vt-skel" aria-hidden="true"><i></i><i></i><i></i></div>`; return; }
    /* Same paper already open: just move to the question */
    if (A && A.id === r.id && view.querySelector(".vt-sit")) { if (r.part) requestAnimationFrame(() => scrollToPart(r.part)); return; }
    if (A) closeAnswer();
    const d = V.papers.get(r.id);
    const saved = S.attempts[r.id];
    A = { id: r.id, d, inks: new Map(), att: saved ? JSON.parse(JSON.stringify(saved)) : { paperId: r.id, status: "in-progress", startedAt: Date.now(), answers: {}, total: d.totalMarks } };
    A.att.answers = A.att.answers || {};
    const src = new Map((d.sources || []).map(s => [s.id, s])), shown = new Set();
    view.innerHTML = `<div class="vt-sit">
      <div class="vt-tbar glass" role="toolbar" aria-label="Paper tools">
        <a class="icon-btn vt-tbar-back" href="#vault/paper/${encodeURIComponent(d.id)}" aria-label="Back to the paper’s cover">${ICON.back}</a>
        <div class="vt-tbar-t"><b>${H(d.subject)} ${H(d.paper)}</b><small><span id="vt-progress"></span> · <span id="vt-save" class="vt-save" data-s="saved"></span></small></div>
        ${(d.sources || []).map(s => `<button type="button" class="chip sm" data-vt="source" data-src="${H(s.id)}" aria-expanded="false">${H(s.title)}</button>`).join("")}
        <button type="button" class="chip sm" data-vt="jump" aria-expanded="false" aria-controls="vt-jump">Questions</button>
        <span class="vt-tbar-prog" aria-hidden="true"><i id="vt-progress-bar"></i></span>
      </div>
      <nav class="vt-jump glass" id="vt-jump" aria-label="Go to a question" hidden>${d.parts.map(p => `<button type="button" data-jump="${H(p.id)}">${H(p.label)}</button>`).join("")}</nav>
      <div class="vt-questions">${d.questions.map(q => {
        let s = "";
        if (q.source && src.has(q.source) && !shown.has(q.source)) { shown.add(q.source); s = sourceHTML(src.get(q.source)); }
        return `${s}<section class="vt-q glass" aria-label="Question ${H(q.n)}">
          ${q.stem || (q.figures && q.figures.length) ? `<div class="vt-stem"><span class="vt-qn">${H(q.n)}</span><div>${fmt(q.stem)}${figuresHTML(q.figures)}</div></div>` : ""}
          ${q.parts.map(p => partHTML(p, A.att.answers[p.id])).join("")}
        </section>`;
      }).join("")}</div>
      <div class="vt-end glass"><p><b>End of paper.</b> Your answers save as you go, so you can stop and come back on any device.</p><a class="chip" href="#vault/paper/${encodeURIComponent(d.id)}">Back to the cover</a></div>
      <aside class="vt-srcpanel glass" id="vt-srcpanel" hidden aria-label="Source"><div class="vt-srcpanel-head"><b></b><button type="button" class="icon-btn" data-vt="source-close" aria-label="Close">${ICON.x}</button></div><div class="vt-srcpanel-body"></div></aside>
    </div>`;
    view.querySelectorAll(".vt-ta").forEach(grow);
    d.parts.forEach(p => { if (p.type !== "mcq" && (A.att.answers[p.id]?.mode || defaultMode(p)) === "ink") mountInk(p.id); });
    updateProgress(); setSaveState();
    if (r.part) requestAnimationFrame(() => scrollToPart(r.part));
  }
  function grow(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; }

  /* ---------- checking papers against the site's topics ---------- */
  function edits(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
    }
    return d[b.length];
  }
  /* Up to two real tags close to a mistyped one: same subtopic name anywhere, else the nearest spelling in the same subject */
  function closest(key, keys) {
    const last = key.split("/").pop(), subj = key.split("/")[0];
    const same = keys.filter(x => x.endsWith("/" + last));
    if (same.length) return same.slice(0, 2);
    return keys.filter(x => x.startsWith(subj + "/"))
      .map(x => [x, Math.min(edits(key, x), edits(last, x.split("/").pop()) + 2)])
      .filter(([, n]) => n <= Math.max(3, Math.round(last.length / 4)))
      .sort((a, b) => a[1] - b[1]).slice(0, 2).map(([x]) => x);
  }
  function renderCheck(r) {
    crumbs(r, "Check papers");
    view.innerHTML = `<a class="vt-back" href="#vault">${ICON.back}The Vault</a><div class="page-head"><h1 class="page-title">Check papers</h1><p class="page-sub">Makes sure every topic tag matches a subtopic on the site.</p></div><div id="vt-check"><div class="vt-skel" aria-hidden="true"><i></i></div></div>`;
    const T = topics();
    Promise.all(V.index.map(m => loadPaper(m.id).then(d => [m, d], () => [m, null]))).then(rows => {
      const out = rows.map(([m, d]) => {
        const errs = [];
        if (!d) errs.push("The paper file couldn’t be loaded.");
        else {
          const def = subjectDef(d.subject);
          if (!def) errs.push(`“${d.subject}” isn’t a subject on the site.`);
          d.parts.forEach(p => p.topics.forEach(k => {
            if (!T.has(k)) {
              const near = closest(k, [...T.keys()]);
              errs.push(`${p.label}: unknown topic tag <code>${H(k)}</code>${near.length ? ` (did you mean ${near.map(n => `<code>${H(n)}</code>`).join(" or ")}?)` : ""}`);
            } else if (def && !k.startsWith(def.id + "/")) errs.push(`${p.label}: <code>${H(k)}</code> is a ${H(T.get(k).subject)} topic, not ${H(d.subject)}.`);
          }));
          const total = d.parts.reduce((a, p) => a + p.marks, 0);
          if (total !== m.totalMarks) errs.push("The catalogue is out of date. Run <code>python3 tools/vault_build.py</code>.");
        }
        return `<div class="vt-check-row glass" data-ok="${!errs.length}"><b>${H(`${m.subject} ${m.paper}`)}</b><span>${H(m.series)} · <code>${H(m.file)}</code></span>${errs.length ? `<ul>${errs.map(e => `<li>${e}</li>`).join("")}</ul>` : `<p>All ${d.parts.length} questions are tagged with real subtopics.</p>`}</div>`;
      });
      const box = document.getElementById("vt-check");
      if (box) box.innerHTML = out.join("");
    });
  }

  /* ---------- events ---------- */
  function openSource(id, btn) {
    const panel = document.getElementById("vt-srcpanel"), x = (A.d.sources || []).find(s => s.id === id);
    if (!panel || !x) return;
    const open = panel.hidden || panel.dataset.src !== id;
    view.querySelectorAll('[data-vt="source"]').forEach(b => b.setAttribute("aria-expanded", String(open && b === btn)));
    panel.hidden = !open; panel.dataset.src = id;
    if (open) { panel.querySelector(".vt-srcpanel-head b").textContent = x.title; panel.querySelector(".vt-srcpanel-body").innerHTML = fmt(x.body) + figuresHTML(x.figures); }
    view.classList.toggle("vt-src-open", open);
  }
  function choose(btn) {
    const partEl = btn.closest(".vt-part"), pid = partEl.dataset.part, p = A.d.parts.find(x => x.id === pid), a = answerOf(pid);
    const ch = new Set(a.choice || []), k = btn.dataset.opt;
    if (ch.has(k)) ch.delete(k);
    else if (p.pick > 1 && ch.size >= p.pick) { say(`You can choose ${p.pick}. Untick one first.`); return; }
    else { if (p.pick <= 1) ch.clear(); ch.add(k); }
    a.choice = p.options.map(o => o.key).filter(x => ch.has(x));
    partEl.querySelectorAll(".vt-opt").forEach(o => o.setAttribute("aria-pressed", String(ch.has(o.dataset.opt))));
    touched(pid);
  }
  function setMode(btn) {
    const partEl = btn.closest(".vt-part"), pid = partEl.dataset.part, p = A.d.parts.find(x => x.id === pid), mode = btn.dataset.mode;
    const box = partEl.querySelector(".vt-ans");
    if (box.dataset.mode === mode) return;
    box.dataset.mode = mode;
    box.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    answerOf(pid).mode = mode;
    if (p.type !== "diagram" && S.prefs.inputMode !== mode) savePrefs({ inputMode: mode });
    if (mode === "ink") mountInk(pid); else { const ta = box.querySelector(".vt-ta"); if (ta) { grow(ta); ta.focus({ preventScroll: true }); } }
    touched(pid);
  }

  view.addEventListener("click", e => {
    const f = e.target.closest("[data-f]");
    if (f && f.tagName === "BUTTON") {
      ui[f.dataset.f] = ui[f.dataset.f] === f.dataset.v && f.dataset.v !== "all" ? "all" : f.dataset.v;
      saveUI(); render(); return;
    }
    if (A) {
      const opt = e.target.closest(".vt-opt"); if (opt) return choose(opt);
      const md = e.target.closest(".vt-mode [data-mode]"); if (md) return setMode(md);
      const j = e.target.closest("[data-jump]");
      if (j) { document.getElementById("vt-jump").hidden = true; view.querySelector('[data-vt="jump"]').setAttribute("aria-expanded", "false"); scrollToPart(j.dataset.jump, true); return; }
    }
    const b = e.target.closest("[data-vt]");
    if (b) {
      const act = b.dataset.vt;
      if (act === "clear") { ui.q = ""; render(); document.getElementById("vt-q")?.focus(); }
      if (act === "reset") { Object.assign(ui, { subject: "all", status: "all", year: "all", tier: "all", board: "all", q: "" }); saveUI(); render(); }
      if (act === "retry") { V.indexErr = null; render(); }
      if (act === "start") startPaper(parse().id);
      if (act === "jump") { const n = document.getElementById("vt-jump"); n.hidden = !n.hidden; b.setAttribute("aria-expanded", String(!n.hidden)); }
      if (act === "source") openSource(b.dataset.src, b);
      if (act === "source-close") openSource(document.getElementById("vt-srcpanel").dataset.src, null);
    }
  });
  view.addEventListener("change", e => {
    const s = e.target.closest("select[data-f]");
    if (s) { ui[s.dataset.f] = s.value; saveUI(); render(); }
  });
  let qTimer;
  view.addEventListener("input", e => {
    const t = e.target;
    if (A && t.closest(".vt-part")) {
      const partEl = t.closest(".vt-part"), pid = partEl.dataset.part;
      if (t.classList.contains("vt-ta")) {
        answerOf(pid).text = t.value; grow(t);
        const wc = partEl.querySelector(".vt-wc"); if (wc) { const n = words(t.value); wc.textContent = `${n} ${n === 1 ? "word" : "words"}`; }
        touched(pid);
      } else if (t.matches("[data-final]")) { answerOf(pid).final = t.value; touched(pid); }
      return;
    }
    if (t.id !== "vt-q") return;
    ui.q = t.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      const box = document.getElementById("vt-list");
      if (!box) return;
      const list = V.index.filter(m => (ui.subject === "all" || m.subject === ui.subject) && (ui.status === "all" || statusOf(m).key === ui.status) && (ui.year === "all" || String(m.year) === ui.year) && (ui.board === "all" || m.board === ui.board) && (ui.tier === "all" || m.tier === ui.tier || !m.tier));
      box.innerHTML = listHTML(search(list, ui.q));
      view.querySelector(".vt-q-clear").hidden = !ui.q;
    }, 120);
  });
  view.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.matches && e.target.matches("[data-final]")) e.target.blur();
    if (e.key === "Escape" && A) { const n = document.getElementById("vt-jump"); if (n && !n.hidden) { n.hidden = true; view.querySelector('[data-vt="jump"]').setAttribute("aria-expanded", "false"); } }
  });
  /* Save straight away when the page is hidden: switching apps, locking the iPad or closing the tab */
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
  addEventListener("pagehide", () => flushAll());
  /* Re-fit answer boxes when the iPad rotates */
  addEventListener("resize", () => { if (A) view.querySelectorAll(".vt-ta").forEach(grow); });

  async function startPaper(id) {
    const m = meta(id);
    if (!m) return;
    if (!S.attempts[id]) { try { await saveAttempt(id, { paperId: id, status: "in-progress", startedAt: Date.now(), answers: {}, total: m.totalMarks }); } catch (e) { say("Couldn’t save to your account. Your answers will save once you’re back online."); } }
    location.hash = `#vault/paper/${encodeURIComponent(id)}/answer`;
  }

  addEventListener("hashchange", () => { if (parse()) render(); else if (A) closeAnswer(); });
  if (parse()) render();
  loadIndex().then(() => { if (parse()) render(); });
  initStore();

  /* For later stages and for testing */
  window.orchardVault = { loadIndex, loadPaper, statusOf: id => meta(id) && statusOf(meta(id)), attempts: () => S.attempts, topics, flush: flushAll, open: () => A, mode: () => S.mode };
})();

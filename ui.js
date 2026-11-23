/* The Orchard: interface chrome.
   Adds the header breadcrumb, search button, account avatar, sidebar account
   card, page footer and keyboard shortcuts. Purely additive: it reads the
   app's own TABS list and buttons, and never changes saved data. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const el = (tag, attrs, html) => { const e = document.createElement(tag); Object.assign(e, attrs || {}); if (html != null) e.innerHTML = html; return e; };
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const tabs = typeof TABS !== "undefined" ? TABS : [];

  /* ---------- Header: breadcrumb ---------- */
  const topbar = $(".topbar"), dock = $(".dock");
  const crumbs = el("div", { className: "o-crumbs", ariaLive: "polite" });
  topbar.insertBefore(crumbs, dock);
  function updateCrumbs() {
    const id = (location.hash || "#home").slice(1);
    const t = tabs.find(x => x.id === id) || tabs[0] || { label: "Home" };
    const group = t.group || "The Orchard";
    crumbs.innerHTML = `<span>${escH(group)}</span><i aria-hidden="true"></i><b>${escH(t.label)}</b>`;
  }
  addEventListener("hashchange", updateCrumbs);
  updateCrumbs();

  /* ---------- Header: search button (⌘K) ---------- */
  const search = el("button", { type: "button", className: "o-search", title: "Search all subjects" },
    `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span>Search topics, quotes, terms…</span><kbd>${isMac ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd>`);
  dock.insertBefore(search, dock.firstChild);
  function openSearch() {
    const q = document.getElementById("nav-q");
    if (!q) return;
    if (!matchMedia("(min-width: 1024px)").matches) document.getElementById("menu-btn")?.click();
    setTimeout(() => { q.focus(); q.select(); }, 30);
  }
  search.addEventListener("click", openSearch);

  /* ---------- Settings / account helpers ---------- */
  function openAccount() {
    document.getElementById("prefs-btn")?.click();
    setTimeout(() => document.getElementById("acct")?.scrollIntoView({ block: "start" }), 80);
  }

  /* ---------- Header avatar + sidebar account card ---------- */
  const avatar = el("button", { type: "button", className: "o-avatar", title: "Your account", ariaLabel: "Your account" }, "·");
  dock.appendChild(avatar);
  avatar.addEventListener("click", openAccount);

  const drawer = document.getElementById("drawer");
  const foot = el("div", { className: "o-side-foot" },
    `<button type="button" class="o-acct" aria-label="Your account"><span class="o-avatar" aria-hidden="true">·</span><span class="o-acct-who"><b>Your account</b><span>Signed in</span></span></button>`);
  drawer.appendChild(foot);
  foot.querySelector(".o-acct").addEventListener("click", openAccount);

  function showMe(me) {
    if (!me) return;
    const initials = me.name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
    document.querySelectorAll(".o-avatar").forEach(a => (a.textContent = initials));
    avatar.title = `${me.name} · ${me.email}`;
    foot.querySelector(".o-acct-who").innerHTML = `<b>${escH(me.name)}</b><span>${escH(me.email)}</span>`;
  }
  if (window.orchardAuth) window.orchardAuth.me().then(showMe).catch(() => {});
  // Keep in step when the name changes in Settings
  new MutationObserver(() => {
    const n = document.getElementById("acct-name");
    if (n && window.orchardAuth) window.orchardAuth.me().then(me => { me.name = n.textContent; showMe(me); });
  }).observe(document.getElementById("prefs") || document.body, { subtree: true, characterData: true, childList: true });

  /* ---------- Home: date under the greeting ---------- */
  const greet = document.getElementById("greeting");
  if (greet) {
    const d = el("p", { className: "o-date" });
    d.textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    greet.after(d);
  }

  /* ---------- Home: group the calendar and grade cards into a side rail ---------- */
  const home = document.getElementById("view-home");
  if (home) {
    const secs = [...home.children].filter(c => c.classList.contains("section"));
    const cal = secs.find(s => s.querySelector("#week"));
    const grade = home.querySelector(".grade-hero");
    const insights = secs.find(s => s.querySelector("#stats"));
    const more = secs.find(s => s.querySelector("#drops"));
    if (insights) insights.classList.add("o-insights");
    if (more) more.classList.add("o-more");
    if (cal && grade) {
      const rail = el("aside", { className: "o-rail", ariaLabel: "This week and grades" });
      cal.before(rail);
      rail.append(cal, grade);
    }
  }

  /* ---------- Footer ---------- */
  const main = document.querySelector("main");
  const year = new Date().getFullYear();
  const footer = el("footer", { className: "o-foot" },
    `<span><b>The Orchard</b> · GCSE revision planner</span>
     <span class="o-sync"><i aria-hidden="true"></i>Saved to your account</span>
     <span class="o-foot-r">
       <button type="button" data-o="keys">Keyboard shortcuts <kbd>?</kbd></button>
       <button type="button" data-o="settings">Settings</button>
       <span>© ${year}</span>
     </span>`);
  main.appendChild(footer);
  footer.querySelector('[data-o="settings"]').addEventListener("click", () => document.getElementById("prefs-btn")?.click());

  /* ---------- Keyboard shortcuts ---------- */
  const mod = isMac ? "⌘" : "Ctrl";
  const keys = el("div", { className: "o-keys", hidden: true, role: "dialog", ariaModal: "true", ariaLabel: "Keyboard shortcuts" },
    `<div class="o-keys-box">
       <h2>Keyboard shortcuts</h2>
       <dl>
         <dt>Search everything</dt><dd><kbd>${mod}</kbd><kbd>K</kbd> or <kbd>/</kbd></dd>
         <dt>Go to Home</dt><dd><kbd>G</kbd><kbd>H</kbd></dd>
         <dt>Go to Calendar</dt><dd><kbd>G</kbd><kbd>C</kbd></dd>
         <dt>Go to Study log</dt><dd><kbd>G</kbd><kbd>L</kbd></dd>
         <dt>Go to Grades</dt><dd><kbd>G</kbd><kbd>G</kbd></dd>
         <dt>Settings</dt><dd><kbd>${mod}</kbd><kbd>,</kbd></dd>
         <dt>Show this list</dt><dd><kbd>?</kbd></dd>
         <dt>Close a panel</dt><dd><kbd>Esc</kbd></dd>
       </dl>
     </div>`);
  document.body.appendChild(keys);
  const showKeys = on => { keys.hidden = !on; };
  keys.addEventListener("click", e => { if (e.target === keys) showKeys(false); });
  footer.querySelector('[data-o="keys"]').addEventListener("click", () => showKeys(true));

  const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  let gPending = 0;
  const GO = { h: "home", c: "calendar", l: "study-log", g: "grades", e: "exams", p: "past-papers", q: "quests" };
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); document.getElementById("prefs-btn")?.click(); return; }
    if (e.key === "Escape" && !keys.hidden) { showKeys(false); return; }
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "?") { e.preventDefault(); showKeys(keys.hidden); return; }
    const k = e.key.toLowerCase();
    if (gPending && Date.now() - gPending < 1200 && GO[k]) { e.preventDefault(); location.hash = "#" + GO[k]; gPending = 0; return; }
    gPending = k === "g" ? Date.now() : 0;
  });
})();

/* ==========================================================================
   Sidebar: subject colours, live counts, collapsible groups
   ========================================================================== */
const O_SUBJECT_COLOURS = {
  "english-lit": "#b4632a", "religious-studies": "#7a5bc4", "psychology": "#c4517f", "spanish": "#c8463b",
  "geography": "#2f8f83", "maths": "#3b6fd1", "further-maths": "#5a55c9", "biology": "#4a8f3c",
  "chemistry": "#2b8aa6", "physics": "#d07a2a"
};
(function sidebar() {
  "use strict";
  const nav = document.getElementById("nav");
  const drawer = document.getElementById("drawer");
  if (!nav || !drawer) return;
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Brand: add the course line under the name */
  const title = drawer.querySelector(".drawer-title");
  if (title && !title.querySelector(".o-brand-sub")) {
    const name = [...title.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    const wrap = document.createElement("span");
    wrap.className = "o-brand-text";
    wrap.innerHTML = `<b>The Orchard</b><span class="o-brand-sub">GCSE · Summer 2027</span>`;
    if (name) name.replaceWith(wrap); else title.appendChild(wrap);
  }

  let collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem("orchard-nav-collapsed") || "{}") || {}; } catch (e) {}
  const saveCollapsed = () => { try { localStorage.setItem("orchard-nav-collapsed", JSON.stringify(collapsed)); } catch (e) {} };

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function meta(id) {
    try {
      if (O_SUBJECT_COLOURS[id] && typeof SUBJECTS !== "undefined" && typeof ragCounts === "function") {
        const def = SUBJECTS.find(d => d.view === id);
        if (def) { const c = ragCounts(def.subs); return c.rated ? `${c.score}%` : ""; }
      }
      if (id === "exams" && typeof nextExam === "function") {
        const x = nextExam(); if (!x) return "";
        const days = Math.ceil((x.start - new Date()) / 864e5);
        return days > 0 ? `${days}d` : "Today";
      }
      if (id === "study-log" && typeof store !== "undefined") {
        const m = store.sessions.filter(s => s.date === today()).reduce((a, s) => a + (+s.minutes || 0), 0);
        return m ? (typeof fmtTime === "function" ? fmtTime(m) : m + "m") : "";
      }
      if (id === "calendar" && typeof evStore !== "undefined") {
        const n = evStore.events.filter(e => e.date === today()).length;
        return n ? String(n) : "";
      }
      if (id === "social" && window.orchardSocial) return window.orchardSocial.badge() || "";
    } catch (e) {}
    return "";
  }

  let busy = false;
  function decorate() {
    if (busy) return;
    busy = true;
    let group = "";
    [...nav.children].forEach(el => {
      if (el.classList.contains("nav-label")) {
        group = el.dataset.nav || el.textContent;
        el.classList.add("o-group");
        el.classList.toggle("o-closed", !!collapsed[group]);
        if (!el.querySelector(".o-chev")) el.insertAdjacentHTML("beforeend", '<svg class="o-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>');
        el.setAttribute("role", "button");
        el.setAttribute("aria-expanded", String(!collapsed[group]));
        return;
      }
      if (el.tagName !== "A") return;
      const id = el.dataset.tab;
      el.classList.toggle("o-hidden", !!(group && collapsed[group]) && el.getAttribute("aria-current") !== "page");
      if (O_SUBJECT_COLOURS[id]) { el.classList.add("o-subj"); el.style.setProperty("--o-subj", O_SUBJECT_COLOURS[id]); }
      let m = el.querySelector(".o-meta");
      const v = meta(id);
      if (!m) { m = document.createElement("span"); m.className = "o-meta"; el.insertBefore(m, el.querySelector(".grip")); }
      if (m.textContent !== v) m.textContent = v;
    });
    busy = false;
  }
  nav.addEventListener("click", e => {
    const label = e.target.closest(".nav-label");
    if (!label) return;
    const g = label.dataset.nav || label.textContent;
    collapsed[g] = !collapsed[g];
    saveCollapsed(); decorate();
  });
  nav.addEventListener("keydown", e => {
    const label = e.target.closest(".nav-label");
    if (label && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); label.click(); }
  });
  new MutationObserver(() => { if (!busy) decorate(); }).observe(nav, { childList: true });
  addEventListener("hashchange", () => setTimeout(decorate, 0));
  decorate();
  setInterval(decorate, 20000);
  window.orchardNavRefresh = decorate;
})();

/* ==========================================================================
   Subject pages: richer header, side rail with exams, focus list and actions
   ========================================================================== */
(function subjects() {
  "use strict";
  if (typeof SUBJECTS === "undefined" || typeof renderSubject !== "function") return;
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RANK = { red: 3, amber: 2, "": 1, green: 0 };
  const LABEL = { red: "Struggled", amber: "Getting there", "": "Not rated", green: "Confident" };
  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmt = m => (typeof fmtTime === "function" ? fmtTime(m) : `${m}m`);

  function ensureChrome(def) {
    const root = def.el && def.el.root;
    if (!root || root.dataset.oDone) return;
    root.dataset.oDone = "1";
    root.style.setProperty("--o-subj", O_SUBJECT_COLOURS[def.view] || "var(--acc)");
    const head = root.querySelector(".s-main > .page-head");
    if (head) {
      head.classList.add("o-shead");
      const icon = typeof NAV_ICONS !== "undefined" ? NAV_ICONS[def.view] || "" : "";
      head.insertAdjacentHTML("afterbegin", `<span class="o-sicon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>`);
      head.insertAdjacentHTML("beforeend", `<div class="o-sactions">
        <button type="button" class="chip" data-o-act="log"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>Log a session</button>
      </div>`);
    }
    const topics = def.el.topics;
    if (topics) {
      topics.classList.add("o-stopics");
      const rail = document.createElement("aside");
      rail.className = "o-srail";
      rail.setAttribute("aria-label", `${def.title} at a glance`);
      topics.appendChild(rail);
      def.el.oRail = rail;
    }
    root.addEventListener("click", e => {
      const a = e.target.closest("[data-o-act]");
      if (!a) return;
      const act = a.dataset.oAct;
      if (act === "log") {
        location.hash = "#study-log";
        setTimeout(() => {
          const f = document.getElementById("f-subject");
          if (f) { f.value = def.subject; f.dispatchEvent(new Event("change")); document.getElementById("f-topic")?.focus(); }
        }, 60);
      } else if (act === "cards") {
        root.querySelector('.seg [data-seg="cards"]')?.click();
      }
    });
  }

  function renderRail(def) {
    const rail = def.el && def.el.oRail;
    if (!rail) return;
    const now = new Date();
    const exams = (typeof EXAMS !== "undefined" ? EXAMS : []).filter(x => x.subject === def.subject);
    const upcoming = exams.filter(x => x.end > now);
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6);
    const sess = (typeof store !== "undefined" ? store.sessions : []).filter(s => s.subject === def.subject);
    const week = sess.filter(s => s.date >= isoDay(weekAgo)).reduce((a, s) => a + (+s.minutes || 0), 0);
    const last = sess.map(s => s.date).sort().pop();
    const c = ragCounts(def.subs);
    const focus = def.subs
      .map((s, i) => ({ s, r: syl.ratings[s.key] || "", i }))
      .filter(x => x.r !== "green")
      .sort((a, b) => RANK[b.r] - RANK[a.r] || a.i - b.i)
      .slice(0, 5);

    const examHTML = upcoming.length ? upcoming.slice(0, 4).map((x, i) => {
      const days = Math.max(0, Math.ceil((x.start - now) / 864e5));
      const d = x.start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      return `<li class="${i === 0 ? "o-next" : ""}"><div><b>${escH(x.paper)}</b><span>${escH(x.title)}</span><span class="o-dim">${d} · ${x.s === "am" ? "Morning" : "Afternoon"} · ${escH(x.code)}</span></div><em>${days}<small>days</small></em></li>`;
    }).join("") : `<li class="o-dim">No more exams scheduled for ${escH(def.subject)}.</li>`;

    const breakdown = [["green", c.green], ["amber", c.amber], ["red", c.red], ["", c.total - c.rated]]
      .map(([k, n]) => `<li><i class="dot ${k || "none"}"></i>${LABEL[k]}<b>${n}</b></li>`).join("");

    rail.innerHTML = `
      <section class="o-card">
        <h3>Your exams</h3>
        <ul class="o-exams">${examHTML}</ul>
      </section>
      <section class="o-card">
        <h3>Progress</h3>
        <div class="o-prog">
          <div class="o-ring" style="--p:${c.score}"><span>${c.score}<small>%</small></span></div>
          <ul class="o-break">${breakdown}</ul>
        </div>
        <div class="o-kv"><span>This week</span><b>${week ? fmt(week) : "None yet"}</b></div>
        <div class="o-kv"><span>Last studied</span><b>${last ? new Date(last + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Not yet"}</b></div>
      </section>
      <section class="o-card">
        <h3>Focus next</h3>
        ${focus.length ? `<ul class="o-focus">${focus.map(x => `<li><button type="button" data-open="${escH(x.s.key)}"><i class="dot ${x.r || "none"}"></i><span><b>${escH(x.s.name)}</b><span>${escH(x.s.topic.name)} · ${LABEL[x.r]}</span></span></button></li>`).join("")}</ul>
          <p class="o-dim o-small">Rate subtopics red, amber or green and the weakest rise to the top.</p>`
        : `<p class="o-dim">Everything is rated confident. Keep it fresh with flashcards.</p>`}
      </section>`;
  }

  const original = renderSubject;
  renderSubject = function (def) {
    const out = original.apply(this, arguments);
    if (def && def.stale) return out;
    try { ensureChrome(def); renderRail(def); } catch (e) { console.error(e); }
    return out;
  };
  SUBJECTS.forEach(def => { try { ensureChrome(def); if (!def.stale) renderRail(def); } catch (e) {} });
  // Refresh when sessions or ratings change elsewhere
  addEventListener("hashchange", () => {
    const def = SUBJECTS.find(d => "#" + d.view === location.hash);
    if (def && !def.stale) renderRail(def);
  });
})();

/* ==========================================================================
   Installable app: service worker + Install button
   ========================================================================== */
(function installable() {
  "use strict";
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  let deferred = null;
  const dock = document.querySelector(".dock"), foot = document.querySelector(".o-foot .o-foot-r");
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "icon-btn o-install"; btn.hidden = true;
  btn.title = "Install The Orchard as an app"; btn.setAttribute("aria-label", "Install The Orchard as an app");
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/></svg>';
  if (dock) dock.insertBefore(btn, dock.querySelector("#focus-btn") || null);
  const link = document.createElement("button");
  link.type = "button"; link.textContent = "Install app"; link.hidden = true;
  if (foot) foot.insertBefore(link, foot.firstChild);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; if (!standalone()) { btn.hidden = false; link.hidden = false; } });
  async function install() {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; btn.hidden = link.hidden = true; if (r && r.outcome === "accepted" && typeof toast === "function") toast("Installed. Find The Orchard with your other apps."); return; }
    if (typeof toast === "function") toast(/iPhone|iPad/.test(navigator.userAgent) ? "On iPhone or iPad: tap Share, then Add to Home Screen." : "Use your browser menu and choose Install or Add to Home Screen.");
  }
  btn.addEventListener("click", install); link.addEventListener("click", install);
  // iPhone/iPad never fire beforeinstallprompt, so offer the instructions there
  if (/iPhone|iPad/.test(navigator.userAgent) && !standalone()) link.hidden = false;
  addEventListener("appinstalled", () => { btn.hidden = link.hidden = true; });
})();

/* ==========================================================================
   Plan my day: several focused sessions across subjects, in the
   "What should I do now?" sheet
   ========================================================================== */
(function dayPlan() {
  "use strict";
  if (typeof renderNow !== "function" || typeof subjectScores !== "function") return;
  const sheet = document.getElementById("now-sheet"); if (!sheet) return;
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const len = sheet.querySelector(".now-len");
  let mode = "now", hours = 2, plan = null;
  len.insertAdjacentHTML("beforebegin", `<div class="o-now-mode" role="tablist" aria-label="Plan type"><button type="button" role="tab" data-nowmode="now" aria-selected="true">Next session</button><button type="button" role="tab" data-nowmode="day" aria-selected="false">Plan my day</button></div>`);
  len.insertAdjacentHTML("afterend", `<div class="now-len o-day-len" hidden><span>How much time today?</span><div class="chips">${[1, 2, 3, 4].map(h => `<button type="button" class="chip" data-dayhours="${h}">${h} hour${h > 1 ? "s" : ""}</button>`).join("")}</div></div>`);
  const dayLen = sheet.querySelector(".o-day-len");
  const hhmm = d => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  function build() {
    const total = hours * 60, ranked = subjectScores();
    if (!ranked.length) return null;
    const slot = hours === 1 ? 25 : 45, brk = hours === 1 ? 5 : 10;
    const blocks = [];
    let due = 0;
    try { if (typeof deckCards === "function") due = deckCards("all:").filter(c => isDueCard(c)).length; } catch (e) {}
    let used = 0;
    if (due && total >= 90) { blocks.push({ kind: "cards", min: 15, title: `Flashcard review: ${due} due`, sub: "All subjects. Quick recall to warm up.", subject: null }); used += 15 + 5; blocks.push({ kind: "break", min: 5 }); }
    let i = 0;
    while (used + slot <= total) {
      const r = ranked[i % ranked.length], s = pickSub(r.def);
      const why = [r.ex ? `${r.ex.paper} in ${r.days} day${r.days === 1 ? "" : "s"}` : null, r.c.rated ? `${r.c.score}% confident` : "not rated yet", r.since === null ? "not studied yet" : r.since > 6 ? `last studied ${r.since} days ago` : null].filter(Boolean).join(" · ");
      blocks.push({ kind: "focus", min: slot, title: `${r.def.title}: ${s.name}`, sub: `${s.topic.name}${why ? " · " + why : ""}`, subject: r.def.subject, topic: s.name, key: s.key, view: r.def.view });
      used += slot; i++;
      if (used + brk + 15 <= total) { blocks.push({ kind: "break", min: brk }); used += brk; } else break;
    }
    const rest = total - used;
    if (rest >= 10 && blocks[blocks.length - 1].kind !== "cards") blocks.push({ kind: "cards", min: Math.min(rest, 20), title: "Lock it in: flashcards", sub: "Review what’s due, then rate today’s topics red, amber or green.", subject: null });
    let t = new Date(); t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
    blocks.forEach(b => { b.from = new Date(t); t = new Date(t.getTime() + b.min * 60000); b.to = new Date(t); });
    return blocks;
  }
  function renderDay() {
    plan = build();
    const body = document.getElementById("now-body");
    dayLen.querySelectorAll("[data-dayhours]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.dayhours === hours)));
    if (!plan) { body.innerHTML = '<p class="empty">Add a subject to get started.</p>'; return; }
    const focus = plan.filter(b => b.kind === "focus");
    body.innerHTML = `<p class="o-day-sum">${focus.length} focus session${focus.length === 1 ? "" : "s"} across ${new Set(focus.map(b => b.subject)).size} subject${new Set(focus.map(b => b.subject)).size === 1 ? "" : "s"}, chosen by how close your exams are and which topics need the most work.</p>
      <ol class="o-day">${plan.map((b, i) => b.kind === "break"
        ? `<li class="o-day-break"><span>${hhmm(b.from)}</span><em>${b.min}-minute break: away from screens</em></li>`
        : `<li class="o-day-item ${b.kind}"><span class="o-day-time">${hhmm(b.from)}<small>${b.min} min</small></span>
            <div class="o-day-main"><b>${escH(b.title)}</b><span>${escH(b.sub)}</span></div>
            <span class="o-day-act">${b.key ? `<button type="button" class="chip sm" data-dayopen="${i}">Open</button>` : ""}<button type="button" class="${i === plan.findIndex(x => x.kind !== "break") ? "primary" : "chip sm"}" data-daystart="${i}">Start</button></span></li>`).join("")}</ol>
      ${(() => { const end = plan[plan.length - 1].to, h = end.getHours() + end.getMinutes() / 60; return h >= 22.5 || h < 5 ? `<p class="o-day-late">This runs late. A shorter plan and a proper night’s sleep will help your memory more than extra hours now.</p>` : ""; })()}
      <div class="now-foot"><p class="muted">Finishes about ${hhmm(plan[plan.length - 1].to)}. Start each block when you’re ready; the timer logs it for you.</p>
        <button type="button" class="chip" data-dayadd>Add to calendar</button></div>`;
  }
  function setMode(m) {
    mode = m;
    sheet.querySelectorAll("[data-nowmode]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.nowmode === m)));
    len.hidden = m === "day"; dayLen.hidden = m !== "day";
    if (m === "day") renderDay(); else renderNow();
  }
  sheet.addEventListener("click", e => {
    const mb = e.target.closest("[data-nowmode]"); if (mb) { setMode(mb.dataset.nowmode); return; }
    const hb = e.target.closest("[data-dayhours]"); if (hb) { hours = +hb.dataset.dayhours; renderDay(); return; }
    const sb = e.target.closest("[data-daystart]");
    if (sb && plan) {
      const b = plan[+sb.dataset.daystart];
      if (b.kind === "cards") { closeNow(); if (typeof startStudy === "function") startStudy("all:", "cards", "due"); return; }
      if (ft.phase !== "idle" && !confirm("A focus timer is already running. Replace it?")) return;
      ft.subject = b.subject; ft.topic = b.topic; ft.len = b.min; ftSave(); ftStart("focus");
      closeNow(); if (typeof openFocus === "function") openFocus();
      if (typeof toast === "function") toast(`Focus started: ${b.min} minutes of ${b.subject}.`);
      return;
    }
    const ob = e.target.closest("[data-dayopen]");
    if (ob && plan) { const b = plan[+ob.dataset.dayopen]; closeNow(); if (typeof goToSub === "function") goToSub(b.key); return; }
    if (e.target.closest("[data-dayadd]") && plan && typeof addEvent === "function") {
      const d = new Date(), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      plan.filter(b => b.kind === "focus").forEach((b, i) => addEvent({ date, title: `${b.subject}: ${b.topic}`.slice(0, 80), type: "revision", subject: b.subject, time: hhmm(b.from), createdAt: Date.now() + i }));
      if (typeof toast === "function") toast("Added today’s sessions to your calendar.");
    }
  });
  const origOpen = openNow;
  openNow = function () { origOpen.apply(this, arguments); if (mode === "day") setMode("day"); };
  const nb = document.getElementById("now-btn");
  if (nb) { nb.removeEventListener("click", origOpen); nb.addEventListener("click", () => openNow()); }
})();

/* ==========================================================================
   Weekly recap on Home (Monday to Wednesday, or any time from Insights)
   ========================================================================== */
(function weeklyRecap() {
  "use strict";
  const home = document.getElementById("view-home");
  if (!home || typeof store === "undefined") return;
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtM = m => (typeof fmtTime === "function" ? fmtTime(m) : `${m}m`);
  const monday = off => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d; };
  const range = off => { const a = monday(off), b = new Date(a); b.setDate(a.getDate() + 6); return [isoD(a), isoD(b), a, b]; };
  let forced = false;
  const card = document.createElement("section");
  card.className = "o-recap"; card.hidden = true;
  const today = document.getElementById("today");
  (today || home.firstElementChild).before(card);
  function data() {
    const [a, b, A, B] = range(-1), [pa, pb] = range(-2);
    const sess = store.sessions.filter(s => s.date >= a && s.date <= b), prev = store.sessions.filter(s => s.date >= pa && s.date <= pb);
    const mins = sess.reduce((x, s) => x + (+s.minutes || 0), 0), pmins = prev.reduce((x, s) => x + (+s.minutes || 0), 0);
    const by = {}; sess.forEach(s => (by[s.subject] = (by[s.subject] || 0) + (+s.minutes || 0)));
    const top = Object.entries(by).sort((x, y) => y[1] - x[1]);
    const days = new Set(sess.map(s => s.date)).size;
    let cards = null;
    try { const cl = window.orchardSocial && window.orchardSocial.cardDays && window.orchardSocial.cardDays(); if (cl) cards = Object.entries(cl).filter(([k]) => k >= a && k <= b).reduce((x, [, n]) => x + n, 0); } catch (e) {}
    let conf = null;
    try { if (typeof ALL_SUBS !== "undefined" && typeof ragCounts === "function") conf = ragCounts(ALL_SUBS).score; } catch (e) {}
    let rank = null;
    try { rank = window.orchardSocial && window.orchardSocial.rank && window.orchardSocial.rank(); } catch (e) {}
    const now = new Date(), wk = new Date(now); wk.setDate(now.getDate() + 7);
    const ahead = [
      ...(typeof EXAMS !== "undefined" ? EXAMS.filter(x => x.start > now && x.start < wk).map(x => ({ d: x.start, t: `${x.subject} ${x.paper}`, k: "Exam" })) : []),
      ...(typeof evStore !== "undefined" ? evStore.events.filter(e => e.date >= isoD(now) && e.date <= isoD(wk) && e.type !== "revision").map(e => ({ d: new Date(e.date + "T12:00"), t: e.title, k: (typeof EV_TYPES !== "undefined" && EV_TYPES[e.type]) || "Event" })) : [])
    ].sort((x, y) => x.d - y.d).filter((x, i, arr) => arr.findIndex(y => y.t === x.t && +y.d === +x.d) === i).slice(0, 5);
    return { A, B, mins, pmins, sessions: sess.length, days, top, cards, conf, rank, ahead };
  }
  function render() {
    const wkKey = range(-1)[0];
    let dismissed = ""; try { dismissed = localStorage.getItem("orchard-recap-seen") || ""; } catch (e) {}
    const dow = (new Date().getDay() + 6) % 7;
    const show = forced || (dow <= 2 && dismissed !== wkKey);
    card.hidden = !show;
    if (!show) return;
    const d = data();
    const delta = d.pmins ? Math.round((d.mins - d.pmins) / d.pmins * 100) : null;
    const span = `${d.A.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${d.B.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    card.innerHTML = `<div class="o-recap-head"><div><p class="eyebrow">Weekly recap</p><h2>Your week, ${span}</h2></div><button type="button" class="icon-btn" data-recap-close aria-label="Close recap"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="o-recap-stats">
        <div><b>${d.mins ? fmtM(d.mins) : "0m"}</b><span>Studied${delta === null ? "" : ` · <em class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}%</em> vs week before`}</span></div>
        <div><b>${d.days}<small>/7</small></b><span>Days you studied · ${d.sessions} session${d.sessions === 1 ? "" : "s"}</span></div>
        <div><b>${d.cards === null ? "–" : d.cards.toLocaleString("en-GB")}</b><span>Flashcards reviewed</span></div>
        <div><b>${d.rank ? `#${d.rank.pos}<small> of ${d.rank.of}</small>` : d.conf === null ? "–" : d.conf + "%"}</b><span>${d.rank ? "Among your friends" : "Overall confidence"}</span></div>
      </div>
      <div class="o-recap-cols">
        <div><h3>Where your time went</h3>${d.top.length ? `<ul class="o-recap-bars">${d.top.slice(0, 5).map(([s, m]) => `<li><span>${escH(s)}</span><i style="--w:${Math.round(m / d.top[0][1] * 100)}%"></i><b>${fmtM(m)}</b></li>`).join("")}</ul>` : `<p class="o-dim">No sessions logged last week. This week is a fresh start.</p>`}</div>
        <div><h3>Coming up this week</h3>${d.ahead.length ? `<ul class="o-recap-ahead">${d.ahead.map(x => `<li><span>${x.d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span><b>${escH(x.t)}</b><em>${escH(x.k)}</em></li>`).join("")}</ul>` : `<p class="o-dim">Nothing in the calendar for the next 7 days.</p>`}
          <button type="button" class="chip sm" data-recap-plan>Plan today</button></div>
      </div>`;
  }
  card.addEventListener("click", e => {
    if (e.target.closest("[data-recap-close]")) { forced = false; try { localStorage.setItem("orchard-recap-seen", range(-1)[0]); } catch (x) {} render(); }
    if (e.target.closest("[data-recap-plan]")) { document.getElementById("now-btn")?.click(); setTimeout(() => document.querySelector('[data-nowmode="day"]')?.click(), 30); }
  });
  const ins = home.querySelector(".o-insights .section-head") || [...home.querySelectorAll(".section-head")].find(h => /Insights/.test(h.textContent));
  if (ins) { const b = document.createElement("button"); b.type = "button"; b.className = "o-linkbtn"; b.textContent = "Weekly recap"; b.addEventListener("click", () => { forced = true; render(); card.scrollIntoView({ behavior: "smooth", block: "start" }); }); ins.insertBefore(b, ins.lastElementChild); }
  render();
  setTimeout(render, 2500); setTimeout(render, 8000);
  addEventListener("hashchange", () => { if ((location.hash || "#home") === "#home") render(); });
})();

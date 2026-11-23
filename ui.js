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
         <dt>Go to AI tutor</dt><dd><kbd>G</kbd><kbd>A</kbd></dd>
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
  const GO = { h: "home", c: "calendar", l: "study-log", g: "grades", a: "ai", e: "exams", p: "past-papers", q: "quests" };
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
        <button type="button" class="chip" data-o-act="tutor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/></svg>Ask the tutor</button>
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
      } else if (act === "tutor") {
        location.hash = "#ai";
        setTimeout(() => {
          const i = document.getElementById("ai-input");
          if (i) { i.value = `I'm revising ${def.subject}. `; i.focus(); i.dispatchEvent(new Event("input")); }
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
    try { ensureChrome(def); renderRail(def); } catch (e) { console.error(e); }
    return out;
  };
  SUBJECTS.forEach(def => { try { ensureChrome(def); renderRail(def); } catch (e) {} });
  // Refresh when sessions or ratings change elsewhere
  addEventListener("hashchange", () => {
    const def = SUBJECTS.find(d => "#" + d.view === location.hash);
    if (def) renderRail(def);
  });
})();

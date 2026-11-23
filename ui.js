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

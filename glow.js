/* The Orchard: Glow style (see glow.css). Minimal and clean, with motion that
   responds to what you do:
   - Smooth page changes (the page cross-fades and slides when you switch)
   - A highlight that glides down the sidebar to the page you pick
   - A soft ripple where you click buttons, chips and links
   - Home's stat tiles flip over (click or tap) to show more detail
   - Cards light up and tilt towards the pointer; cards further down rise in as you scroll
   - Numbers count up when a page opens, and a thin scroll-progress line
   Nothing happens in Basic style. 3D follows Settings → 3D effects, and
   Reduced motion keeps everything still. */
(function () {
  "use strict";
  const root = document.documentElement;
  const on = () => root.dataset.style === "glow";
  const calm = () => root.classList.contains("reduce-motion");
  const moving = () => on() && !calm();
  const depth = () => moving() && root.dataset.depth !== "off";
  const fine = matchMedia("(pointer: fine)").matches;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- background: just soft light ---------- */
  const bg = document.createElement("div");
  bg.className = "gx-bg"; bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = '<div class="gx-orb gx-o1"></div><div class="gx-orb gx-o2"></div><div class="gx-orb gx-o3"></div>';
  document.body.prepend(bg);
  const prog = document.createElement("div");
  prog.className = "gx-prog"; prog.setAttribute("aria-hidden", "true");
  document.body.appendChild(prog);

  /* ---------- smooth page changes ---------- */
  const VIEW_IDS = typeof TABS !== "undefined" ? new Set(TABS.map(t => t.id)) : new Set();
  document.addEventListener("click", e => {
    if (!moving() || !document.startViewTransition || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    if (!VIEW_IDS.has(id) || ("#" + id) === (location.hash || "#home")) return;
    e.preventDefault();
    if (document.body.classList.contains("menu-open")) document.getElementById("close-btn")?.click();
    root.classList.add("gx-vt");
    const t = document.startViewTransition(() => { location.hash = id; if (typeof route === "function") route(); });
    t.finished.finally(() => root.classList.remove("gx-vt"));
  }, true);

  /* ---------- the sidebar highlight glides to the current page ---------- */
  const nav = document.getElementById("nav");
  let pill = null;
  function placePill() {
    if (!nav || !on()) { if (pill) pill.style.opacity = "0"; return; }
    if (!pill) { pill = document.createElement("span"); pill.className = "gx-navpill"; pill.setAttribute("aria-hidden", "true"); }
    if (pill.parentNode !== nav) nav.prepend(pill);
    const cur = nav.querySelector('a[aria-current="page"]');
    if (!cur || cur.offsetParent === null) { pill.style.opacity = "0"; return; }
    pill.style.opacity = "1";
    pill.style.transform = `translateY(${cur.offsetTop}px)`;
    pill.style.height = cur.offsetHeight + "px";
  }
  if (nav) {
    new MutationObserver(() => requestAnimationFrame(placePill)).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "class"] });
    addEventListener("resize", placePill);
    addEventListener("hashchange", () => requestAnimationFrame(placePill));
    setTimeout(placePill, 300);
  }

  /* ---------- a soft ripple where you click ---------- */
  const RIPPLE = ".primary, .chip, .stab, .icon-btn, .drawer nav a, .o-tab, .theme-card, .font-card, .mode-card, .pp-style, .pp-sw, .seg > button, .o-subcard, .deck-btn, .now-btn, .ls-form .primary";
  document.addEventListener("pointerdown", e => {
    if (!moving() || e.button > 0) return;
    const el = e.target.closest && e.target.closest(RIPPLE);
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const box = document.createElement("span");
    box.className = "gx-ripple-box";
    Object.assign(box.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: cs.borderRadius });
    const dot = document.createElement("i"), size = Math.max(r.width, r.height) * 2.2;
    Object.assign(dot.style, { width: size + "px", height: size + "px", left: e.clientX - r.left - size / 2 + "px", top: e.clientY - r.top - size / 2 + "px" });
    if (el.matches(".primary")) box.classList.add("light");
    box.appendChild(dot); document.body.appendChild(box);
    setTimeout(() => box.remove(), 650);
  }, { passive: true });

  /* ---------- Home's stat tiles flip over to show more ---------- */
  const fmt = m => (typeof fmtTime === "function" ? fmtTime(m) : `${m}m`);
  const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function details() {
    const ss = (typeof DATA !== "undefined" && DATA.sessions) || [];
    const byDay = {}, bySubj = {};
    ss.forEach(s => { byDay[s.date] = (byDay[s.date] || 0) + (+s.minutes || 0); bySubj[s.subject] = (bySubj[s.subject] || 0) + (+s.minutes || 0); });
    const week = typeof thisWeek === "function" ? thisWeek().map(isoD) : [];
    const wm = week.map(d => byDay[d] || 0), done = wm.filter(Boolean).length;
    const bestI = wm.indexOf(Math.max(...wm, 0)), names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days = Object.keys(byDay).filter(d => byDay[d] > 0).sort();
    let best = 0, run = 0, prev = null;
    days.forEach(d => { const t = new Date(d + "T12:00:00"); run = prev && (t - prev) / 864e5 < 1.5 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
    const now = new Date(), month = days.filter(d => (now - new Date(d + "T12:00:00")) / 864e5 < 30).length;
    const longest = ss.reduce((a, s) => Math.max(a, +s.minutes || 0), 0);
    const top = Object.entries(bySubj).sort((a, b) => b[1] - a[1])[0];
    const first = days[0] ? new Date(days[0] + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
    return {
      "This week": [["Daily average", done ? fmt(Math.round(wm.reduce((a, b) => a + b, 0) / 7)) : "–"], ["Best day", done ? `${names[bestI]}, ${fmt(wm[bestI])}` : "–"], ["Days studied", `${done} of 7`]],
      "Streak": [["Longest ever", best ? `${best} day${best === 1 ? "" : "s"}` : "–"], ["Last 30 days", `${month} day${month === 1 ? "" : "s"} studied`]],
      "Sessions logged": [["Longest session", longest ? fmt(longest) : "–"], ["Subjects covered", String(Object.keys(bySubj).length)]],
      "Total studied": [["Top subject", top ? `${top[0]}, ${fmt(top[1])}` : "–"], ["Since", first || "Your first session"]],
    };
  }
  function flipify() {
    const host = document.getElementById("stats");
    if (!host || !on()) return;
    const info = details();
    host.querySelectorAll(":scope > .stat").forEach(tile => {
      if (tile.querySelector(".gx-flipper")) return;
      const label = (tile.querySelector(".k")?.textContent || "").trim(), rows = info[label];
      if (!rows) return;
      const front = document.createElement("div"); front.className = "gx-face gx-front";
      while (tile.firstChild) front.appendChild(tile.firstChild);
      const back = document.createElement("div"); back.className = "gx-face gx-back";
      back.innerHTML = `<span class="gx-back-k">${esc(label)}</span>${rows.map(([k, v]) => `<span class="gx-row"><em>${esc(k)}</em><b>${esc(v)}</b></span>`).join("")}`;
      const flipper = document.createElement("div"); flipper.className = "gx-flipper";
      flipper.append(front, back);
      tile.appendChild(flipper);
      tile.insertAdjacentHTML("beforeend", '<span class="gx-fliphint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></span>');
      tile.classList.add("gx-flip");
      tile.tabIndex = 0; tile.setAttribute("role", "button"); tile.setAttribute("aria-pressed", "false");
      tile.setAttribute("aria-label", `${label}: ${front.querySelector(".v")?.textContent || ""}. Press to see more`);
    });
  }
  function flip(tile) {
    const onBack = !tile.classList.contains("is-flipped");
    tile.classList.toggle("is-flipped", onBack); tile.setAttribute("aria-pressed", String(onBack));
  }
  document.addEventListener("click", e => { const t = e.target.closest && e.target.closest("#stats .gx-flip"); if (t) flip(t); });
  document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#stats .gx-flip")) { e.preventDefault(); flip(e.target); } });
  if (typeof renderStats === "function") {
    const orig = renderStats;
    renderStats = function () { const out = orig.apply(this, arguments); try { flipify(); } catch (err) {} return out; };
  }
  const statsHost = document.getElementById("stats");
  if (statsHost) new MutationObserver(() => flipify()).observe(statsHost, { childList: true });
  setTimeout(flipify, 500);

  /* ---------- light under the pointer + 3D tilt ---------- */
  const CARD = ".o-card, .glass, .log-card, .icard, .paper-head, .res-tile, .qx-card, .mode-card, .gd-rule, .gd-try, .mx-card, .tc, .bl-card, .pp-card, .hud-tile, .ex-card, .ex-cell, .rp-card, .q-card, .q-quest, .es-card, .now-pick, .drop.topic, .stat, .theme-card, .font-card, .ls-mode, .o-subcard";
  const TILT = ".stat, .hud-tile, .ex-cell, .ex-card, .q-card, .q-quest, .mode-card, .theme-card, .font-card, .res-tile, .icard, .tc, .now-pick, .pp-card, .rp-card, .es-card, .gd-try, .ls-stat-grid > div, .o-recap-stats > div, .o-subcard, .pp-style, .ls-mode, .qx-card";
  let lit = null, tilt = null, px = 0, py = 0, queued = false;
  function frame() {
    queued = false;
    if (lit) { const r = lit.getBoundingClientRect(); lit.style.setProperty("--mx", px - r.left + "px"); lit.style.setProperty("--my", py - r.top + "px"); }
    if (tilt) {
      const r = tilt.getBoundingClientRect(), x = (px - r.left) / r.width - 0.5, y = (py - r.top) / r.height - 0.5, k = r.width > 520 ? 3 : 6;
      tilt.style.setProperty("--rx", (-y * k).toFixed(2) + "deg"); tilt.style.setProperty("--ry", (x * k).toFixed(2) + "deg");
    }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  function setTilt(el) {
    if (tilt === el) return;
    if (tilt) { tilt.classList.remove("gx-tilt"); tilt.style.removeProperty("--rx"); tilt.style.removeProperty("--ry"); }
    tilt = el; if (tilt) tilt.classList.add("gx-tilt");
  }
  if (fine) {
    addEventListener("pointermove", e => {
      if (!on()) return;
      px = e.clientX; py = e.clientY;
      const t = e.target.closest ? e.target : null, c = t && t.closest(CARD);
      if (c !== lit) { if (lit) lit.classList.remove("gx-lit"); lit = c && !c.closest(".study") ? c : null; if (lit) lit.classList.add("gx-lit"); }
      const tl = depth() && t ? t.closest(TILT) : null;
      setTilt(tl && !tl.querySelector("input, textarea, select") && !tl.closest(".study") ? tl : null);
      queue();
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (lit) { lit.classList.remove("gx-lit"); lit = null; } setTilt(null); });
  }

  /* ---------- cards further down rise in as you reach them ---------- */
  const REVEAL = ".o-card, .paper, .drop.topic, .log-card, .hud-tile, .ex-card, .q-card, .q-quest, .pp-card, .rp-card, .es-card, .bl-card, .gd-rule, .gd-try, .tc, .mx-card, .qx-card, .icard, .res-tile, .ls-mode, .ls-stats, .ls-ladder, .nb-lb, .section";
  const io = "IntersectionObserver" in window ? new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target; io.unobserve(el); el.classList.add("gx-in");
    setTimeout(() => el.classList.remove("gx-pre", "gx-in"), 1000);
  }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }) : null;
  function prepareReveal(view) {
    if (!io || !moving() || !view) return;
    const vh = innerHeight; let n = 0;
    view.querySelectorAll(REVEAL).forEach(el => {
      if (el.closest(".gx-pre") || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 || r.height > vh * 1.6) return;
      el.classList.add("gx-pre"); el.style.setProperty("--gx-d", (n++ % 3) * 60 + "ms"); io.observe(el);
    });
  }

  /* ---------- numbers count up when a page opens ---------- */
  const NUM = ".stat .v, .ls-stat-grid b, .o-recap-stats b, .hud-tile .v, .q-ring b, .mp-tiles .stat .v, .ls-big, .avg-num";
  function countUp(view) {
    if (!view || !moving()) return;
    view.querySelectorAll(NUM).forEach(el => {
      if (el.children.length > 1 || el.offsetParent === null || el.closest(".ex-cell, .ex-hud, [data-live]")) return;
      const text = el.textContent.trim(), m = /^(\d{1,3}(?:,\d{3})*|\d+)(\D{0,8})$/.exec(text);
      if (!m) return;
      const to = parseInt(m[1].replace(/,/g, ""), 10), suffix = m[2];
      if (!to || to > 99999) return;
      const t0 = performance.now(), dur = Math.min(1300, 550 + to * 8), f = n => (m[1].includes(",") ? n.toLocaleString("en-GB") : String(n)) + suffix;
      let shown = f(0); el.textContent = shown;
      const step = t => {
        if (el.textContent !== shown) return;
        const p = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 4)));
        shown = p < 1 ? f(v) : text; el.textContent = shown;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- when a page opens ---------- */
  function opened() {
    if (!on()) return;
    setTilt(null);
    const view = document.querySelector("main > .view:not([hidden])");
    document.querySelectorAll(".gx-pre").forEach(el => { if (io) io.unobserve(el); el.classList.remove("gx-pre", "gx-in"); });
    setTimeout(() => { prepareReveal(view); countUp(view); flipify(); }, 60);
  }
  addEventListener("hashchange", opened);
  addEventListener("load", () => setTimeout(opened, 400));

  /* ---------- scroll progress ---------- */
  let pq = false;
  function progress() {
    pq = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 40 ? Math.min(1, scrollY / max) : 0})`;
  }
  addEventListener("scroll", () => { if (!pq && on()) { pq = true; requestAnimationFrame(progress); } }, { passive: true });
  addEventListener("hashchange", () => setTimeout(progress, 50));
})();

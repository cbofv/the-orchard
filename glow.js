/* The Orchard: Glow style (see glow.css).
   - The background: drifting light, a faint grid, a moving 3D floor and slowly orbiting rings
   - Cards light up where the pointer is, and display cards tilt towards it in 3D
   - Pages swing into view in 3D, cards further down rise in as you scroll to them,
     and numbers count up when you open a page
   - A thin scroll-progress line
   Nothing happens in Basic style; 3D and motion follow Settings (3D effects, Motion). */
(function () {
  "use strict";
  const root = document.documentElement;
  const on = () => root.dataset.style === "glow";
  const calm = () => root.classList.contains("reduce-motion");
  const depth = () => on() && !calm() && root.dataset.depth !== "off";
  const fine = matchMedia("(pointer: fine)").matches;

  /* ---------- background layer ---------- */
  const bg = document.createElement("div");
  bg.className = "gx-bg"; bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = '<div class="gx-orb gx-o1"></div><div class="gx-orb gx-o2"></div><div class="gx-orb gx-o3"></div><div class="gx-grid"></div>' +
    '<div class="gx-floor"><i></i></div>' +
    '<div class="gx-gyro"><i></i><i></i><i></i><b></b></div>' +
    '<div class="gx-gyro small"><i></i><i></i><b></b></div>';
  document.body.prepend(bg);
  const prog = document.createElement("div");
  prog.className = "gx-prog"; prog.setAttribute("aria-hidden", "true");
  document.body.appendChild(prog);

  /* ---------- light under the pointer + 3D tilt ---------- */
  const CARD = ".o-card, .glass, .log-card, .icard, .paper-head, .res-tile, .qx-card, .mode-card, .gd-rule, .gd-try, .mx-card, .tc, .bl-card, .pp-card, .hud-tile, .ex-card, .ex-cell, .rp-card, .q-card, .q-quest, .es-card, .now-pick, .drop.topic, .stat, .theme-card, .font-card, .ls-mode, .o-subcard";
  // Only cards you look at (not ones you type into) tilt
  const TILT = ".stat, .hud-tile, .ex-cell, .ex-card, .q-card, .q-quest, .mode-card, .theme-card, .font-card, .res-tile, .icard, .tc, .now-pick, .pp-card, .rp-card, .es-card, .gd-try, .ls-stat-grid > div, .o-recap-stats > div, .o-subcard, .pp-style, .ls-mode, .qx-card";
  let lit = null, tilt = null, px = 0, py = 0, queued = false;
  function frame() {
    queued = false;
    if (lit) { const r = lit.getBoundingClientRect(); lit.style.setProperty("--mx", px - r.left + "px"); lit.style.setProperty("--my", py - r.top + "px"); }
    if (tilt) {
      const r = tilt.getBoundingClientRect(), x = (px - r.left) / r.width - 0.5, y = (py - r.top) / r.height - 0.5;
      const k = r.width > 520 ? 3 : 7; // big cards tilt less
      tilt.style.setProperty("--rx", (-y * k).toFixed(2) + "deg");
      tilt.style.setProperty("--ry", (x * k).toFixed(2) + "deg");
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
      const t = e.target.closest ? e.target : null;
      const c = t && t.closest(CARD);
      if (c !== lit) { if (lit) lit.classList.remove("gx-lit"); lit = c && !c.closest(".study") ? c : null; if (lit) lit.classList.add("gx-lit"); }
      const tl = depth() && t ? t.closest(TILT) : null;
      setTilt(tl && !tl.querySelector("input, textarea, select") && !tl.closest(".study") ? tl : null);
      queue();
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (lit) { lit.classList.remove("gx-lit"); lit = null; } setTilt(null); });
  }

  /* ---------- cards further down rise in as you reach them ---------- */
  const REVEAL = ".o-card, .paper, .drop.topic, .log-card, .hud-tile, .ex-card, .ex-cell, .q-card, .q-quest, .pp-card, .rp-card, .es-card, .bl-card, .gd-rule, .gd-try, .tc, .mx-card, .qx-card, .icard, .res-tile, .ls-mode, .ls-stats, .ls-ladder, .nb-lb";
  const io = "IntersectionObserver" in window ? new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target; io.unobserve(el);
    el.classList.add("gx-in");
    setTimeout(() => el.classList.remove("gx-pre", "gx-in"), 1100);
  }), { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }) : null;
  function prepareReveal(view) {
    if (!io || !depth() || !view) return;
    const vh = innerHeight;
    let n = 0;
    view.querySelectorAll(REVEAL).forEach(el => {
      if (el.closest(".gx-pre") || el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 || r.height > vh * 1.6) return; // already on screen, or too tall to hide
      el.classList.add("gx-pre"); el.style.setProperty("--gx-d", (n++ % 3) * 70 + "ms");
      io.observe(el);
    });
  }

  /* ---------- numbers count up when a page opens ---------- */
  // (Not the exam countdown, which ticks by itself)
  const NUM = ".stat .v, .ls-stat-grid b, .o-recap-stats b, .hud-tile .v, .q-ring b, .mp-tiles .stat .v, .ls-big, .avg-num";
  function countUp(view) {
    if (!view || calm() || !on()) return;
    view.querySelectorAll(NUM).forEach(el => {
      if (el.children.length > 1 || el.offsetParent === null || el.closest(".ex-cell, .ex-hud, [data-live]")) return;
      const text = el.textContent.trim(), m = /^(\d{1,3}(?:,\d{3})*|\d+)(\D{0,8})$/.exec(text);
      if (!m) return;
      const to = parseInt(m[1].replace(/,/g, ""), 10), suffix = m[2];
      if (!to || to > 99999) return;
      const t0 = performance.now(), dur = Math.min(1400, 600 + to * 8), fmt = n => (m[1].includes(",") ? n.toLocaleString("en-GB") : String(n)) + suffix;
      let shown = fmt(0); el.textContent = shown;
      const step = t => {
        if (el.textContent !== shown) return; // the app redrew it: leave it alone
        const p = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 4)));
        shown = p < 1 ? fmt(v) : text; el.textContent = shown;
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
    // Anything still waiting to rise in on the page you left is simply shown
    document.querySelectorAll(".gx-pre").forEach(el => { if (io) io.unobserve(el); el.classList.remove("gx-pre", "gx-in"); });
    setTimeout(() => { prepareReveal(view); countUp(view); }, 60);
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

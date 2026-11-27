/* The Orchard: Glow style (see glow.css). Adds the drifting background,
   the pointer spotlight, the light that follows your pointer across cards,
   and a thin scroll-progress line. Does nothing visible in Basic style. */
(function () {
  "use strict";
  const root = document.documentElement;
  const on = () => root.dataset.style === "glow";
  const calm = () => root.classList.contains("reduce-motion");
  const fine = matchMedia("(pointer: fine)").matches;

  const bg = document.createElement("div");
  bg.className = "gx-bg"; bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = '<div class="gx-orb gx-o1"></div><div class="gx-orb gx-o2"></div><div class="gx-orb gx-o3"></div><div class="gx-grid"></div><div class="gx-spot"></div>';
  document.body.prepend(bg);
  const prog = document.createElement("div");
  prog.className = "gx-prog"; prog.setAttribute("aria-hidden", "true");
  document.body.appendChild(prog);
  const spot = bg.querySelector(".gx-spot");

  // Cards that light up where the pointer is
  const CARD = ".o-card, .glass, .log-card, .icard, .paper-head, .res-tile, .qx-card, .mode-card, .gd-rule, .gd-try, .mx-card, .tc, .bl-card, .pp-card, .hud-tile, .ex-card, .ex-cell, .rp-card, .q-card, .q-quest, .es-card, .now-pick, .drop.topic, .stat, .theme-card, .font-card";
  let lit = null, px = 0, py = 0, sx = 0, sy = 0, queued = false;
  function frame() {
    queued = false;
    if (!on()) return;
    if (!calm()) { sx += (px - sx) * 0.18; sy += (py - sy) * 0.18; spot.style.transform = `translate(${sx}px, ${sy}px)`; if (Math.abs(px - sx) + Math.abs(py - sy) > 1) queue(); }
    if (lit) { const r = lit.getBoundingClientRect(); lit.style.setProperty("--mx", px - r.left + "px"); lit.style.setProperty("--my", py - r.top + "px"); }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  if (fine) {
    addEventListener("pointermove", e => {
      if (!on()) return;
      px = e.clientX; py = e.clientY; spot.classList.add("on");
      const c = e.target.closest && e.target.closest(CARD);
      if (c !== lit) { if (lit) lit.classList.remove("gx-lit"); lit = c && !c.closest(".study, .sheet-wrap[hidden]") ? c : null; if (lit) lit.classList.add("gx-lit"); }
      queue();
    }, { passive: true });
    document.addEventListener("pointerleave", () => { spot.classList.remove("on"); if (lit) { lit.classList.remove("gx-lit"); lit = null; } });
  }

  // Thin progress line showing how far down the page you are
  let pq = false;
  function progress() {
    pq = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 40 ? Math.min(1, scrollY / max) : 0})`;
  }
  addEventListener("scroll", () => { if (!pq && on()) { pq = true; requestAnimationFrame(progress); } }, { passive: true });
  addEventListener("hashchange", () => setTimeout(progress, 50));
})();

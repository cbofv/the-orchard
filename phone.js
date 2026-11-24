/* The Orchard: phone mode.
   Works out whether this is a phone (held upright or sideways) and, if so,
   adds a bottom tab bar (a side rail when sideways), a Subjects sheet and a
   compact header that tucks away as you scroll. Desktops and iPads are left
   exactly as they are: everything here is switched on by
   <html data-device="phone"> and styled in phone.css. */
(function () {
  "use strict";
  const root = document.documentElement;
  // Upright phone: narrow screen. Sideways phone: short screen with touch.
  // (iPads are at least 744px tall, so they never count as a sideways phone.)
  const UPRIGHT = matchMedia("(max-width: 600px)");
  const SIDEWAYS = matchMedia("(max-height: 500px) and (max-width: 1000px) and (pointer: coarse)");

  function detect() {
    const sideways = SIDEWAYS.matches, phone = sideways || UPRIGHT.matches;
    const device = phone ? "phone" : "wide", orient = sideways ? "landscape" : "portrait";
    if (root.dataset.device === device && root.dataset.orient === orient) return;
    root.dataset.device = device;
    root.dataset.orient = orient;
    dispatchEvent(new CustomEvent("orchard:device", { detail: { phone, sideways } }));
  }
  detect();
  [UPRIGHT, SIDEWAYS].forEach(q => (q.addEventListener ? q.addEventListener("change", detect) : q.addListener(detect)));
  addEventListener("orientationchange", () => setTimeout(detect, 120));
  addEventListener("resize", detect);
  window.orchardIsPhone = () => root.dataset.device === "phone";

  document.addEventListener("DOMContentLoaded", build); // build() does nothing outside the app page

  function build() {
    if (!document.querySelector(".topbar") || typeof TABS === "undefined") return;
    const $ = s => document.querySelector(s);
    const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const ICON = typeof NAV_ICONS !== "undefined" ? NAV_ICONS : {};
    const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d || ""}</svg>`;
    const SUBJECT_IDS = TABS.filter(t => t.group === "Subjects").map(t => t.id);
    const MAIN_IDS = ["home", "study-log", "social"];
    const I = {
      subjects: '<path d="M5 4.5h5.5a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 0-1.5-1.5H5z"/><path d="M19 4.5h-5.5A1.5 1.5 0 0 0 12 6v13.5a1.5 1.5 0 0 1 1.5-1.5H19z"/>',
      more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
    };

    /* ---------- Tab bar ---------- */
    const bar = document.createElement("nav");
    bar.className = "o-tabbar";
    bar.setAttribute("aria-label", "Main");
    const item = (id, label, icon, attrs) =>
      `<a class="o-tab" data-ptab="${id}" ${attrs}>${svg(icon)}<span>${label}</span></a>`;
    bar.innerHTML =
      item("home", "Home", ICON.home, 'href="#home"') +
      item("study-log", "Log", ICON["study-log"], 'href="#study-log"') +
      item("subjects", "Subjects", I.subjects, 'href="#subjects" role="button" aria-haspopup="dialog"') +
      item("social", "Social", ICON.social, 'href="#social"') +
      item("more", "More", I.more, 'href="#more" role="button" aria-haspopup="dialog" aria-controls="drawer"');
    document.body.appendChild(bar);

    function currentId() { return (location.hash || "#home").slice(1).split("/")[0] || "home"; }
    function markActive() {
      const id = currentId();
      const on = MAIN_IDS.includes(id) ? id : SUBJECT_IDS.includes(id) ? "subjects" : "more";
      bar.querySelectorAll(".o-tab").forEach(a => {
        const yes = a.dataset.ptab === on;
        a.classList.toggle("on", yes);
        if (yes && a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      // Title in the header (shown once the big page title has scrolled away)
      const t = TABS.find(x => x.id === id);
      title.innerHTML = `<span class="o-pt-brand"><i class="brand-mark"></i>The Orchard</span><span class="o-pt-page">${escH(t ? t.label : "The Orchard")}</span>`;
    }

    bar.addEventListener("click", e => {
      const a = e.target.closest(".o-tab"); if (!a) return;
      const id = a.dataset.ptab;
      if (id === "subjects") { e.preventDefault(); openSubjects(); return; }
      if (id === "more") { e.preventDefault(); closeSubjects(); $("#menu-btn")?.click(); return; }
      closeSubjects();
      if (document.body.classList.contains("menu-open")) $("#close-btn")?.click();
      // Tapping the tab you're already on scrolls back to the top
      if ("#" + id === (location.hash || "#home")) { e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); }
    });

    /* ---------- Header: page title + tuck away while scrolling ---------- */
    const title = document.createElement("div");
    title.className = "o-ptitle";
    title.setAttribute("aria-hidden", "true");
    const topbar = $(".topbar");
    topbar.insertBefore(title, topbar.querySelector(".dock"));

    let lastY = scrollY, ticking = false;
    function onScroll() {
      ticking = false;
      if (!window.orchardIsPhone()) { document.body.classList.remove("o-head-away", "o-scrolled"); return; }
      const y = Math.max(0, scrollY), dy = y - lastY;
      document.body.classList.toggle("o-scrolled", y > 72);
      const sheetOpen = document.body.classList.contains("menu-open") || !sheet.hidden;
      if (sheetOpen || y < 80) document.body.classList.remove("o-head-away");
      else if (dy > 6) document.body.classList.add("o-head-away");
      else if (dy < -6) document.body.classList.remove("o-head-away");
      if (Math.abs(dy) > 6 || y < 80) lastY = y;
    }
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    addEventListener("hashchange", () => { markActive(); document.body.classList.remove("o-head-away"); lastY = 0; });

    /* ---------- Subjects sheet ---------- */
    const sheet = document.createElement("div");
    sheet.className = "sheet-wrap o-subsheet";
    sheet.hidden = true;
    sheet.innerHTML = `<div class="sheet-scrim" data-sclose></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="o-subsheet-t">
        <div class="sheet-grab"></div>
        <div class="o-subsheet-head"><h2 id="o-subsheet-t">Subjects</h2><button type="button" class="icon-btn" data-sclose aria-label="Close">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
        <div class="o-subgrid" role="list"></div>
      </div>`;
    document.body.appendChild(sheet);
    const grid = sheet.querySelector(".o-subgrid"), panel = sheet.querySelector(".sheet");

    function confidence(id) {
      try {
        const def = SUBJECTS.find(d => d.view === id);
        if (def && typeof ragCounts === "function") return ragCounts(def.subs).score;
      } catch (e) {}
      return null;
    }
    function fillSubjects() {
      // Same order as the sidebar (which you can rearrange by dragging)
      const order = [...document.querySelectorAll("#nav a[data-tab]")].map(a => a.dataset.tab).filter(id => SUBJECT_IDS.includes(id));
      const ids = [...new Set(order.length ? order : SUBJECT_IDS)];
      const cur = currentId();
      grid.innerHTML = ids.map(id => {
        const t = TABS.find(x => x.id === id) || { label: id };
        const a = document.querySelector(`#nav a[data-tab="${id}"]`);
        const colour = (a && a.style.getPropertyValue("--o-subj")) || "var(--acc)";
        const pct = confidence(id);
        return `<a role="listitem" class="o-subcard${id === cur ? " on" : ""}" href="#${id}" style="--o-subj:${escH(colour)}"${id === cur ? ' aria-current="page"' : ""}>
          <span class="o-subicon">${svg(ICON[id])}</span>
          <span class="o-subname">${escH(t.label)}</span>
          ${pct == null ? "" : `<span class="o-subpct"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="o-subnum">${pct}% confident</span>`}
        </a>`;
      }).join("");
    }
    let lastFocus = null;
    function openSubjects() {
      if (document.body.classList.contains("menu-open")) $("#close-btn")?.click();
      fillSubjects();
      lastFocus = document.activeElement;
      sheet.hidden = false;
      panel.style.transform = "";
      document.body.classList.add("o-sheet-open");
      setTimeout(() => grid.querySelector(".on, a")?.focus({ preventScroll: true }), 60);
    }
    function closeSubjects() {
      if (sheet.hidden) return;
      sheet.hidden = true;
      document.body.classList.remove("o-sheet-open");
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    sheet.addEventListener("click", e => {
      if (e.target.closest("[data-sclose]")) { closeSubjects(); return; }
      if (e.target.closest(".o-subcard")) closeSubjects();
    });
    addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) closeSubjects(); });
    addEventListener("hashchange", closeSubjects);

    // Swipe a sheet down to close it (Subjects, settings and the focus timer)
    function swipeToClose(wrap, close) {
      const p = wrap.querySelector(".sheet"); if (!p) return;
      let y0 = null, dy = 0;
      p.addEventListener("touchstart", e => {
        if (!window.orchardIsPhone() || p.scrollTop > 0 || e.touches.length !== 1) { y0 = null; return; }
        y0 = e.touches[0].clientY; dy = 0; p.style.transition = "none";
      }, { passive: true });
      p.addEventListener("touchmove", e => {
        if (y0 == null) return;
        dy = Math.max(0, e.touches[0].clientY - y0);
        if (dy > 0 && p.scrollTop <= 0) p.style.transform = `translateY(${dy}px)`;
      }, { passive: true });
      p.addEventListener("touchend", () => {
        if (y0 == null) return;
        p.style.transition = "transform .25s var(--o-ease, ease)";
        if (dy > 110) { p.style.transform = "translateY(100%)"; setTimeout(() => { close(); p.style.transform = ""; p.style.transition = ""; }, 200); }
        else p.style.transform = "";
        y0 = null;
      });
    }
    swipeToClose(sheet, closeSubjects);
    const prefs = $("#prefs"), focus = $("#focus");
    if (prefs) swipeToClose(prefs, () => prefs.querySelector("[data-pclose]")?.click());
    if (focus) swipeToClose(focus, () => focus.querySelector("[data-fclose]")?.click());

    // Keep the bar honest when the sidebar order or subjects change
    const nav = $("#nav");
    if (nav) new MutationObserver(() => { if (!sheet.hidden) fillSubjects(); }).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

    addEventListener("orchard:device", () => { if (!window.orchardIsPhone()) closeSubjects(); onScroll(); });
    markActive();
  }
})();

/* The Orchard: extra settings (fonts, accent colour, layout, reading and behaviour).
   Loaded in <head> so choices apply before the page draws. Works with the app's
   own settings: everything lives in the same "orchard-prefs" store, and the
   Settings sheet's buttons use the same data-pref / data-val pattern. */
(function () {
  "use strict";
  const KEY = "orchard-prefs", root = document.documentElement;
  const GF = "https://fonts.googleapis.com/css2?";

  /* ---------- fonts ---------- */
  const FONTS = {
    default: { name: "Default", desc: "Geist throughout", d: "Geist" },
    editorial: { name: "Editorial", desc: "Playfair headings, Inter text", d: "Playfair Display", b: "Inter" },
    clean: { name: "Clean", desc: "Inter throughout", d: "Inter" },
    rounded: { name: "Rounded", desc: "Soft and friendly (Nunito)", d: "Nunito", q: "family=Nunito:wght@400;500;600;700" },
    lexend: { name: "Easy reading", desc: "Lexend, built for reading speed", d: "Lexend", q: "family=Lexend:wght@300;400;500;600;700" },
    atkinson: { name: "Hyperlegible", desc: "Atkinson, clear letter shapes", d: "Atkinson Hyperlegible", q: "family=Atkinson+Hyperlegible:wght@400;700" },
    book: { name: "Book", desc: "Literata, made for long reading", d: "Literata", q: "family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600" },
    classic: { name: "Classic", desc: "Garamond headings, Source Sans text", d: "EB Garamond", b: "Source Sans 3", q: "family=EB+Garamond:wght@400;500;600&family=Source+Sans+3:wght@400;500;600;700" },
    modern: { name: "Modern", desc: "DM Serif headings, DM Sans text", d: "DM Serif Display", b: "DM Sans", q: "family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700" },
    geometric: { name: "Geometric", desc: "Outfit, clean circles", d: "Outfit", q: "family=Outfit:wght@300;400;500;600;700" },
    grotesk: { name: "Techy", desc: "Space Grotesk", d: "Space Grotesk", q: "family=Space+Grotesk:wght@400;500;600;700" },
    mono: { name: "Typewriter", desc: "JetBrains Mono throughout", d: "JetBrains Mono", q: "family=JetBrains+Mono:wght@400;500;600;700" },
    notebook: { name: "Notebook", desc: "Handwritten headings (Caveat)", d: "Caveat", b: "Nunito", q: "family=Caveat:wght@500;600;700&family=Nunito:wght@400;500;600;700" },
  };
  window.ORCHARD_FONTS = FONTS;
  function loadFont(key) {
    const f = FONTS[key]; if (!f || !f.q) return;
    const id = "font-" + key;
    if (document.getElementById(id)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.id = id; l.href = GF + f.q + "&display=swap";
    document.head.appendChild(l);
  }

  /* ---------- the extra settings ---------- */
  const DEFAULTS = { accent: "theme", bold: "off", radius: "default", bg: "grain", density: "default", width: "full", leading: "normal", contrast: "standard", rag: "classic", celebrate: "on", start: "home", keys: "on" };
  const ATTRS = { accent: "theme", bold: "off", radius: "default", bg: "grain", density: "default", width: "full", leading: "normal", contrast: "standard", rag: "classic", celebrate: "on", keys: "on" };
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }

  window.orchardApplyExtras = function (p) {
    p = p || read();
    if (FONTS[p.font] && FONTS[p.font].q) { root.dataset.font = p.font; loadFont(p.font); }
    Object.entries(ATTRS).forEach(([k, def]) => {
      const v = p[k] || def;
      if (v === def) root.removeAttribute("data-" + k); else root.setAttribute("data-" + k, v);
    });
  };
  window.orchardApplyExtras();

  // Start page: where the app opens when you go to the site with no page chosen
  try {
    const p = read(), start = p.start || "home";
    if (!location.hash && /\/(index\.html)?$/.test(location.pathname)) {
      const want = start === "last" ? localStorage.getItem("orchard-last-page") : start;
      if (want && want !== "home" && /^[a-z-]+$/.test(want)) history.replaceState(null, "", "#" + want);
    }
  } catch (e) {}
  addEventListener("hashchange", () => { try { const h = (location.hash || "").slice(1); if (/^[a-z-]+$/.test(h)) localStorage.setItem("orchard-last-page", h); } catch (e) {} });

  // Keyboard shortcuts can be switched off (typing in boxes always works)
  addEventListener("keydown", e => {
    if (root.dataset.keys !== "off") return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    const single = e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    const cmdK = (e.ctrlKey || e.metaKey) && /^k$/i.test(e.key);
    if (single || cmdK) e.stopImmediatePropagation();
  }, true);

  /* ---------- Settings sheet ---------- */
  const THEMES_LIGHT = [
    ["sage", "Sage", "Pale sage with forest green"], ["rose", "Rose Paper", "Blush paper, plum ink"],
    ["lavender", "Lavender", "Soft lilac with violet"], ["apricot", "Apricot", "Warm cream with orange"],
    ["sky", "Sky", "Cool white with blue"], ["paper", "Paper", "Pure white, black ink"],
  ];
  const THEMES_DARK = [
    ["oak", "Oak", "Pure black and white"], ["midnight", "Midnight", "Deep navy with sky blue"],
    ["forest", "Forest", "Dark pine with fern"], ["plum", "Plum", "Dark purple with orchid"],
    ["ember", "Ember", "Charcoal with glowing orange"], ["slate", "Slate", "Blue-grey and steel"],
  ];
  const ACCENTS = [["theme", "Theme", ""], ["blue", "Blue", "#4f8cff"], ["teal", "Teal", "#22a99a"], ["green", "Green", "#3fae62"], ["lime", "Lime", "#97c03a"], ["amber", "Amber", "#e3a21c"], ["orange", "Orange", "#f07a3a"], ["red", "Red", "#e2504f"], ["pink", "Pink", "#e8559a"], ["purple", "Purple", "#8f63e8"], ["indigo", "Indigo", "#5b66e6"], ["mono", "Mono", "#8a8a8a"]];
  const PAGES = [["home", "Home"], ["last", "Where I left off"], ["study-log", "Study log"], ["calendar", "Calendar"], ["exams", "Exams"], ["longshot", "Long Shot"], ["social", "Social"]];

  const chips = (key, opts) => `<div class="chips">${opts.map(([v, l]) => `<button type="button" class="chip" data-pref="${key}" data-val="${v}" aria-pressed="false">${l}</button>`).join("")}</div>`;
  const group = (id, title, body, hint) => `<div class="pref-group pp-x" id="pp-${id}"><h3>${title}</h3>${body}${hint ? `<p class="pref-hint">${hint}</p>` : ""}</div>`;
  const section = (id, title) => `<h2 class="pp-sec" id="pp-sec-${id}" tabindex="-1">${title}</h2>`;

  function build() {
    const sheet = document.querySelector("#prefs .prefs-sheet");
    if (!sheet || sheet.dataset.ppDone || typeof prefs === "undefined") return;
    sheet.dataset.ppDone = "1";
    Object.entries(DEFAULTS).forEach(([k, v]) => { if (!(k in prefs)) prefs[k] = v; });

    // More themes
    const lists = sheet.querySelectorAll(".theme-cards");
    const card = ([v, n, d]) => `<button type="button" class="theme-card" data-pref="theme" data-val="${v}" aria-pressed="false"><span class="sw sw-${v}"></span><b>${n}</b><span>${d}</span></button>`;
    if (lists[0]) lists[0].insertAdjacentHTML("beforeend", THEMES_LIGHT.map(card).join(""));
    if (lists[1]) lists[1].insertAdjacentHTML("beforeend", THEMES_DARK.map(card).join(""));

    // More fonts (each previewed in its own typeface)
    const fontList = sheet.querySelector(".font-cards");
    if (fontList) fontList.insertAdjacentHTML("beforeend", Object.entries(FONTS).filter(([k]) => FONTS[k].q).map(([k, f]) =>
      `<button type="button" class="font-card" data-pref="font" data-val="${k}" aria-pressed="false"><span class="fc-big" style="font-family:'${f.d}'">Aa</span><b>${f.name}</b><span>${f.desc}</span></button>`).join(""));

    // Find the existing groups so the new ones can sit beside them
    const groups = [...sheet.querySelectorAll(".pref-group")];
    const byTitle = t => groups.find(g => (g.querySelector("h3")?.textContent || "").trim() === t);
    const gTheme = byTitle("Theme"), gFont = byTitle("Font"), gSize = byTitle("Text size"), gMotion = byTitle("Motion"), g3d = byTitle("3D effects"), gSide = byTitle("Sidebar");

    // Appearance
    gTheme?.insertAdjacentHTML("beforebegin", section("look", "Appearance"));
    gTheme?.insertAdjacentHTML("afterend", group("accent", "Accent colour",
      `<div class="pp-swatches">${ACCENTS.map(([v, l, c]) => `<button type="button" class="pp-sw" data-pref="accent" data-val="${v}" aria-pressed="false" title="${l}" aria-label="${l} accent"${c ? ` style="--c:${c}"` : ""}><i></i><span>${l}</span></button>`).join("")}</div>`,
      "Changes buttons, highlights and links. “Theme” uses the theme’s own colour."));
    gSize?.insertAdjacentHTML("beforeend", `<div class="pp-sub"><h4>Bold text</h4>${chips("bold", [["off", "Off"], ["on", "On"]])}</div>`);
    gSize?.insertAdjacentHTML("afterend",
      group("radius", "Corners", chips("radius", [["sharp", "Sharp"], ["default", "Default"], ["round", "Round"], ["pill", "Extra round"]])) +
      group("bg", "Background", chips("bg", [["plain", "Plain"], ["grain", "Fine grain"], ["dots", "Dots"], ["grid", "Grid"], ["lines", "Ruled paper"], ["glow", "Soft glow"]]), "A subtle texture behind every page."));

    // Layout
    const layout = section("layout", "Layout") +
      group("density", "Density", chips("density", [["compact", "Compact"], ["default", "Comfortable"], ["spacious", "Spacious"]]), "How much space there is around cards, lists and buttons.") +
      group("width", "Content width", chips("width", [["full", "Use the full screen"], ["comfortable", "Comfortable"], ["narrow", "Narrow"]]), "On wide screens, keep pages narrower and centred for easier reading.");
    sheet.querySelector("#pp-bg")?.insertAdjacentHTML("afterend", layout);

    // Reading and accessibility
    gMotion?.insertAdjacentHTML("beforebegin", section("reading", "Reading and accessibility") +
      group("leading", "Line spacing", chips("leading", [["tight", "Tight"], ["normal", "Normal"], ["relaxed", "Relaxed"], ["airy", "Extra (dyslexia friendly)"]]), "Extra adds space between lines, letters and words. Try it with the Easy reading or Hyperlegible font.") +
      group("contrast", "Contrast", chips("contrast", [["standard", "Standard"], ["high", "High"]]), "Makes faint text and borders stronger.") +
      group("rag", "Rating colours", `${chips("rag", [["classic", "Red, amber, green"], ["cb", "Colour-blind safe"], ["mono", "Shades of one colour"]])}<div class="pp-ragdemo"><span><i class="dot red"></i>Struggled</span><span><i class="dot amber"></i>Getting there</span><span><i class="dot green"></i>Confident</span></div>`, "Colour-blind safe uses orange, yellow and blue, which stay distinct with the common types of colour blindness."));
    g3d?.insertAdjacentHTML("afterend", group("celebrate", "Celebrations", chips("celebrate", [["on", "On"], ["off", "Off"]]), "Confetti and sparkles when you finish quests or find a Golden Apple."));

    // General
    gSide?.insertAdjacentHTML("beforebegin", section("general", "General") +
      group("start", "Start page", chips("start", PAGES), "Where The Orchard opens when you visit the site.") +
      group("keys", "Keyboard shortcuts", chips("keys", [["on", "On"], ["off", "Off"]]), "Single-key shortcuts like G then H, and / to search. Press ? to see them all."));
    gSide?.insertAdjacentHTML("afterend", `<div class="pref-group pp-x"><h3>Reset</h3><button type="button" class="chip" data-pp-reset>Reset all settings to default</button><p class="pref-hint">Puts every setting on this page back to how it started. Your study data isn’t touched.</p></div>`);

    // Sticky section tabs at the top of the sheet
    const head = sheet.querySelector(".prefs-head");
    if (head) {
      head.insertAdjacentHTML("afterend", `<nav class="pp-tabs" aria-label="Settings sections">${[["look", "Appearance"], ["layout", "Layout"], ["reading", "Reading"], ["general", "General"], ["acct", "Account"]].map(([id, l]) => `<button type="button" data-pp-go="${id}">${l}</button>`).join("")}</nav>`);
    }
    sheet.addEventListener("click", e => {
      const go = e.target.closest("[data-pp-go]");
      if (go) {
        const id = go.dataset.ppGo, el = id === "acct" ? document.getElementById("acct") : document.getElementById("pp-sec-" + id);
        if (el) { const scroller = sheet; scroller.scrollTo({ top: el.offsetTop - (sheet.querySelector(".pp-tabs")?.offsetHeight || 0) - 18, behavior: root.classList.contains("reduce-motion") ? "auto" : "smooth" }); }
        return;
      }
      if (e.target.closest("[data-pp-reset]")) {
        if (!confirm("Reset all settings to default?")) return;
        Object.keys(prefs).forEach(k => delete prefs[k]);
        Object.assign(prefs, { theme: "olive-noir", size: "m", motion: "auto", fx3d: "off", font: "default" }, DEFAULTS);
        try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (err) {}
        applyPrefs();
        if (typeof toast === "function") toast("Settings reset.");
      }
    });
    // Load a tiny "Aa" preview of every font when the sheet opens
    const preview = () => {
      if (document.getElementById("font-previews")) return;
      const fams = Object.values(FONTS).filter(f => f.q).map(f => f.q).join("&");
      const l = document.createElement("link"); l.rel = "stylesheet"; l.id = "font-previews"; l.href = GF + fams + "&text=Aa&display=swap";
      document.head.appendChild(l);
    };
    document.getElementById("prefs-btn")?.addEventListener("click", preview);
    new MutationObserver(() => { if (!document.getElementById("prefs").hidden) preview(); }).observe(document.getElementById("prefs"), { attributes: true, attributeFilter: ["hidden"] });

    applyPrefs();
  }
  document.addEventListener("DOMContentLoaded", build);
})();

/* The Orchard: The Vault's handwriting canvas, made for Apple Pencil.

   - Only a pen (or a mouse) draws. A finger scrolls the page, so a resting palm
     does nothing. Devices without a pen can turn on "Finger" drawing.
   - Strokes are stored as vectors on a page 1000 units wide, so they redraw
     exactly at any size: iPad portrait or landscape, laptop or phone.
   - Pressure changes the line width.

   VaultInk.mount(host, { data, background, onChange, label }) returns
   { data(), isEmpty(), count(), toPNG(), destroy() }. */
(function () {
  "use strict";
  const W = 1000;                       // logical page width
  const MIN_H = 260, MAX_H = 6000, GROW = 320;
  const COLOURS = [["ink", "Ink"], ["#2f6fed", "Blue"], ["#e5484d", "Red"], ["#2f9e5f", "Green"]];
  const SIZES = [[2.2, "Fine"], [3.6, "Medium"], [6.2, "Bold"]];
  const RULE = { lined: 44, grid: 25 };
  const ERASE_R = 12;
  const PEN_KEY = "orchard-vault-pen";

  const read = () => { try { return JSON.parse(localStorage.getItem(PEN_KEY) || "{}") || {}; } catch (e) { return {}; } };
  const tool = Object.assign({ colour: 0, size: 1, finger: false }, read(), { mode: "pen" });
  const saveTool = () => { try { localStorage.setItem(PEN_KEY, JSON.stringify(tool)); } catch (e) {} };
  const touchDevice = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  let penSeen = false;
  const instances = new Set();
  let lastUsed = null;

  /* ---------- strokes ---------- */
  // Saved form: { c: colour index, s: size index, p: [x*10, y*10, pressure*100, ...] }
  const decode = st => { const p = st.p || [], pts = []; for (let i = 0; i + 2 < p.length; i += 3) pts.push({ x: p[i] / 10, y: p[i + 1] / 10, pr: p[i + 2] / 100 }); return { c: st.c | 0, s: st.s | 0, pts }; };
  const encode = st => { const p = []; st.pts.forEach(q => p.push(Math.round(q.x * 10), Math.round(q.y * 10), Math.round(q.pr * 100))); return { c: st.c, s: st.s, p }; };
  const radius = (st, pr) => SIZES[st.s][0] * (0.45 + 0.9 * pr) / 2;

  /* A stroke is drawn as a union of circles joined by their outer tangents.
     Every piece is wound the same way, so one fill gives a smooth, solid line. */
  function outline(st) {
    const P = new Path2D(), pts = st.pts, r = pts.map(q => radius(st, q.pr));
    for (let i = 0; i < pts.length; i++) { P.moveTo(pts[i].x + r[i], pts[i].y); P.arc(pts[i].x, pts[i].y, r[i], 0, Math.PI * 2); }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], ra = r[i - 1], rb = r[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (!d || d <= Math.abs(ra - rb)) continue;
      const th = Math.atan2(dy, dx), al = Math.acos((ra - rb) / d);
      const q = [[a.x + ra * Math.cos(th + al), a.y + ra * Math.sin(th + al)], [b.x + rb * Math.cos(th + al), b.y + rb * Math.sin(th + al)],
                 [b.x + rb * Math.cos(th - al), b.y + rb * Math.sin(th - al)], [a.x + ra * Math.cos(th - al), a.y + ra * Math.sin(th - al)]];
      let area = 0; for (let k = 0; k < 4; k++) { const u = q[k], v = q[(k + 1) % 4]; area += u[0] * v[1] - v[0] * u[1]; }
      if (area < 0) q.reverse();
      P.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) P.lineTo(q[k][0], q[k][1]); P.closePath();
    }
    return P;
  }
  const pathOf = st => st.path || (st.path = outline(st));
  function bounds(st) {
    if (st.box) return st.box;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    st.pts.forEach(q => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    const r = SIZES[st.s][0];
    return (st.box = { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r });
  }
  /* Light smoothing once a stroke is finished; the ends stay put */
  function smooth(pts) {
    if (pts.length < 4) return pts;
    return pts.map((q, i) => i === 0 || i === pts.length - 1 ? q : { x: (pts[i - 1].x + 2 * q.x + pts[i + 1].x) / 4, y: (pts[i - 1].y + 2 * q.y + pts[i + 1].y) / 4, pr: q.pr });
  }
  function hits(st, x, y) {
    const b = bounds(st), R = ERASE_R;
    if (x < b.x0 - R || x > b.x1 + R || y < b.y0 - R || y > b.y1 + R) return false;
    const pts = st.pts, lim = R + SIZES[st.s][0] / 2;
    if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y) <= lim;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i], dx = c.x - a.x, dy = c.y - a.y, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0;
      if (Math.hypot(a.x + t * dx - x, a.y + t * dy - y) <= lim) return true;
    }
    return false;
  }

  /* ---------- toolbar ---------- */
  const I = {
    pen: '<path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M13.5 7l3.5 3.5"/>',
    eraser: '<path d="M8.5 19.5h11"/><path d="M4.6 14.6l8.7-8.7a2 2 0 0 1 2.8 0l2.9 2.9a2 2 0 0 1 0 2.8l-7.5 7.5a2 2 0 0 1-1.4.6H9.4a2 2 0 0 1-1.4-.6l-3.4-3.4a.8.8 0 0 1 0-1.1z"/><path d="M9 10.2l5.6 5.6"/>',
    undo: '<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="M15 14l4.5-4.5L15 5"/><path d="M19.5 9.5H9a5 5 0 0 0 0 10h3"/>',
    clear: '<path d="M5 7h14M10 7V4.8h4V7M7 7l.8 12.2a1 1 0 0 0 1 .8h6.4a1 1 0 0 0 1-.8L17 7"/>',
    finger: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v3.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L5 15.2a1.5 1.5 0 0 1 2.2-2L9 15"/>',
    more: '<path d="M12 5v14M5 12h14"/>',
  };
  const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
  function barHTML(bg) {
    return `<div class="vt-ink-bar" role="toolbar" aria-label="Writing tools">
      <div class="vt-ink-grp">
        <button type="button" class="vt-ib" data-ink="pen" aria-label="Pen" title="Pen">${ico("pen")}</button>
        <button type="button" class="vt-ib" data-ink="eraser" aria-label="Eraser: rubs out whole strokes" title="Eraser">${ico("eraser")}</button>
      </div>
      <div class="vt-ink-grp">${COLOURS.map(([c, n], i) => `<button type="button" class="vt-ib vt-sw" data-ink="colour" data-v="${i}" aria-label="${n}" title="${n}"><i style="--sw:${c === "ink" ? "var(--ink)" : c}"></i></button>`).join("")}</div>
      <div class="vt-ink-grp">${SIZES.map(([, n], i) => `<button type="button" class="vt-ib vt-sz" data-ink="size" data-v="${i}" aria-label="${n} line" title="${n}"><i style="--d:${3 + i * 3}px"></i></button>`).join("")}</div>
      <div class="vt-ink-grp">
        <button type="button" class="vt-ib" data-ink="undo" aria-label="Undo" title="Undo">${ico("undo")}</button>
        <button type="button" class="vt-ib" data-ink="redo" aria-label="Redo" title="Redo">${ico("redo")}</button>
        <button type="button" class="vt-ib" data-ink="clear" aria-label="Clear this answer" title="Clear">${ico("clear")}</button>
      </div>
      <div class="vt-ink-grp vt-ink-paper" role="group" aria-label="Paper">${["lined", "grid", "blank"].map(b => `<button type="button" class="vt-ib vt-txt" data-ink="bg" data-v="${b}" aria-pressed="${bg === b}">${b[0].toUpperCase() + b.slice(1)}</button>`).join("")}</div>
      ${touchDevice ? `<div class="vt-ink-grp"><button type="button" class="vt-ib" data-ink="finger" aria-label="Draw with your finger" title="Draw with your finger">${ico("finger")}</button></div>` : ""}
    </div>`;
  }
  function syncBars() {
    instances.forEach(x => {
      x.el.querySelectorAll("[data-ink]").forEach(b => {
        const k = b.dataset.ink;
        if (k === "pen" || k === "eraser") b.setAttribute("aria-pressed", String(tool.mode === k));
        if (k === "colour") b.setAttribute("aria-pressed", String(tool.colour === +b.dataset.v));
        if (k === "size") b.setAttribute("aria-pressed", String(tool.size === +b.dataset.v));
        if (k === "finger") b.setAttribute("aria-pressed", String(!!tool.finger));
      });
      x.el.classList.toggle("finger", !!tool.finger);
      x.el.classList.toggle("erasing", tool.mode === "eraser");
      x.syncHistory();
    });
  }

  /* ---------- one canvas ---------- */
  function mount(host, opts) {
    const d0 = opts.data || {};
    const S = {
      strokes: (d0.strokes || []).map(decode).filter(s => s.pts.length),
      h: Math.max(MIN_H, Math.min(MAX_H, d0.h || opts.height || MIN_H)),
      bg: d0.bg || opts.background || "lined",
      undo: [], redo: [], scale: 1, dpr: 1, cur: null, pid: null, erasedAny: false, raf: 0,
    };
    const el = document.createElement("div");
    el.className = "vt-ink";
    el.innerHTML = barHTML(S.bg) + `<div class="vt-ink-pad" aria-label="${opts.label || "Writing area"}" role="img">
        <canvas class="vt-ink-bg" aria-hidden="true"></canvas><canvas class="vt-ink-main" aria-hidden="true"></canvas><canvas class="vt-ink-live" aria-hidden="true"></canvas>
      </div>
      <div class="vt-ink-foot"><span class="vt-ink-hint">${touchDevice ? "Write with Apple Pencil. Scroll with your finger." : "Draw with your mouse or trackpad."}</span><button type="button" class="chip sm" data-ink="more">${ico("more")}More space</button></div>`;
    host.appendChild(el);
    const pad = el.querySelector(".vt-ink-pad");
    const [cBg, cMain, cLive] = ["bg", "main", "live"].map(n => el.querySelector(".vt-ink-" + n));
    const xBg = cBg.getContext("2d"), xMain = cMain.getContext("2d"), xLive = cLive.getContext("2d");

    const inkColour = () => getComputedStyle(el).color;
    const fillOf = i => (COLOURS[i] || COLOURS[0])[0] === "ink" ? inkColour() : COLOURS[i][0];

    function size() {
      const w = pad.clientWidth;
      if (!w) return;
      S.scale = w / W;
      // Keep the canvas inside Safari's size limits
      S.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16e6 / Math.max(1, w * S.h * S.scale)));
      const cssH = Math.round(S.h * S.scale);
      pad.style.height = cssH + "px";
      [cBg, cMain, cLive].forEach(c => { c.width = Math.round(w * S.dpr); c.height = Math.round(cssH * S.dpr); c.style.width = w + "px"; c.style.height = cssH + "px"; });
      drawBg(); drawMain(); xLive.setTransform(1, 0, 0, 1, 0, 0); xLive.clearRect(0, 0, cLive.width, cLive.height);
    }
    const toLogical = ctx => ctx.setTransform(S.scale * S.dpr, 0, 0, S.scale * S.dpr, 0, 0);
    function drawBg() {
      xBg.setTransform(1, 0, 0, 1, 0, 0); xBg.clearRect(0, 0, cBg.width, cBg.height);
      paintPaper(xBg, S.bg, S.h, inkColour(), S.scale * S.dpr);
    }
    function drawMain() {
      xMain.setTransform(1, 0, 0, 1, 0, 0); xMain.clearRect(0, 0, cMain.width, cMain.height);
      toLogical(xMain);
      S.strokes.forEach(st => { xMain.fillStyle = fillOf(st.c); xMain.fill(pathOf(st)); });
    }
    function drawLive() {
      S.raf = 0;
      xLive.setTransform(1, 0, 0, 1, 0, 0); xLive.clearRect(0, 0, cLive.width, cLive.height);
      if (!S.cur) return;
      toLogical(xLive); xLive.fillStyle = fillOf(S.cur.c); xLive.fill(outline(S.cur));
    }
    const ro = new ResizeObserver(() => size());
    ro.observe(pad);

    /* history */
    function remember() { S.undo.push(S.strokes.slice()); if (S.undo.length > 150) S.undo.shift(); S.redo = []; }
    function changed() { drawMain(); api.syncHistory(); opts.onChange && opts.onChange(api); }
    function grow(y) {
      if (y > S.h - 70 && S.h < MAX_H) { S.h = Math.min(MAX_H, S.h + GROW); size(); }
    }

    /* input */
    const posOf = e => { const r = cLive.getBoundingClientRect(); return { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale }; };
    const pressureOf = e => e.pointerType === "pen" ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;
    const draws = e => e.pointerType === "pen" || (e.pointerType === "mouse" && e.button === 0) || (e.pointerType === "touch" && tool.finger);

    // Safari: stop the Pencil from scrolling or selecting text; fingers still scroll
    cLive.addEventListener("touchstart", e => {
      if (tool.finger || [...e.touches].some(t => t.touchType === "stylus")) e.preventDefault();
    }, { passive: false });
    cLive.addEventListener("touchmove", e => {
      if (S.pid !== null || tool.finger) e.preventDefault();
    }, { passive: false });

    cLive.addEventListener("pointerdown", e => {
      if (S.pid !== null || !draws(e)) return;
      if (e.pointerType === "pen" && !penSeen) { penSeen = true; if (tool.finger) { tool.finger = false; saveTool(); syncBars(); } }
      e.preventDefault();
      try { cLive.setPointerCapture(e.pointerId); } catch (x) {}
      S.pid = e.pointerId; lastUsed = api;
      const p = posOf(e);
      if (tool.mode === "eraser") { S.before = S.strokes.slice(); S.erasedAny = false; erase(p); return; }
      S.cur = { c: tool.colour, s: tool.size, pts: [{ x: p.x, y: p.y, pr: pressureOf(e) }] };
      if (!S.raf) S.raf = requestAnimationFrame(drawLive);
    });
    cLive.addEventListener("pointermove", e => {
      if (e.pointerId !== S.pid) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const p = posOf(ev);
        if (tool.mode === "eraser") { erase(p); continue; }
        const last = S.cur.pts[S.cur.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 0.6) continue;
        const pr = last.pr * 0.55 + pressureOf(ev) * 0.45;
        S.cur.pts.push({ x: p.x, y: p.y, pr });
      }
      if (S.cur) { grow(S.cur.pts[S.cur.pts.length - 1].y); if (!S.raf) S.raf = requestAnimationFrame(drawLive); }
    });
    const end = e => {
      if (e.pointerId !== S.pid) return;
      S.pid = null;
      if (tool.mode === "eraser") {
        if (S.erasedAny) { S.undo.push(S.before); S.redo = []; changed(); }
        S.before = null; return;
      }
      const st = S.cur; S.cur = null;
      if (!S.raf) S.raf = requestAnimationFrame(drawLive);
      if (!st) return;
      st.pts = smooth(st.pts).map(q => ({ x: Math.max(0, Math.min(W, q.x)), y: Math.max(0, Math.min(S.h, q.y)), pr: q.pr }));
      remember(); S.strokes.push(st); changed();
    };
    cLive.addEventListener("pointerup", end);
    cLive.addEventListener("pointercancel", end);
    function erase(p) {
      const keep = S.strokes.filter(st => !hits(st, p.x, p.y));
      if (keep.length !== S.strokes.length) { S.strokes = keep; S.erasedAny = true; drawMain(); }
    }

    /* toolbar */
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-ink]");
      if (!b) return;
      const k = b.dataset.ink;
      lastUsed = api;
      if (k === "pen" || k === "eraser") tool.mode = k;
      if (k === "colour") { tool.colour = +b.dataset.v; tool.mode = "pen"; }
      if (k === "size") { tool.size = +b.dataset.v; tool.mode = "pen"; }
      if (k === "finger") tool.finger = !tool.finger;
      if (k === "undo") api.undo();
      if (k === "redo") api.redo();
      if (k === "clear" && S.strokes.length) { remember(); S.strokes = []; changed(); }
      if (k === "more") { S.h = Math.min(MAX_H, S.h + GROW); size(); opts.onChange && opts.onChange(api); }
      if (k === "bg") { S.bg = b.dataset.v; el.querySelectorAll('[data-ink="bg"]').forEach(x => x.setAttribute("aria-pressed", String(x === b))); drawBg(); opts.onChange && opts.onChange(api); }
      saveTool(); syncBars();
    });

    const api = {
      el,
      data: () => ({ v: 1, w: W, h: Math.round(S.h), bg: S.bg, strokes: S.strokes.map(encode) }),
      count: () => S.strokes.length,
      isEmpty: () => !S.strokes.length,
      undo() { if (!S.undo.length) return; S.redo.push(S.strokes); S.strokes = S.undo.pop(); changed(); },
      redo() { if (!S.redo.length) return; S.undo.push(S.strokes); S.strokes = S.redo.pop(); changed(); },
      syncHistory() {
        const u = el.querySelector('[data-ink="undo"]'), r = el.querySelector('[data-ink="redo"]'), c = el.querySelector('[data-ink="clear"]');
        if (u) u.disabled = !S.undo.length; if (r) r.disabled = !S.redo.length; if (c) c.disabled = !S.strokes.length;
      },
      redraw() { drawBg(); drawMain(); },
      /* A black-on-white picture of the answer, for marking. Cropped to what was written. */
      toPNG(maxW) { return renderPNG(api.data(), maxW); },
      destroy() { ro.disconnect(); instances.delete(api); if (lastUsed === api) lastUsed = null; el.remove(); },
    };
    instances.add(api);
    size(); syncBars();
    return api;
  }

  /* A saved drawing as a black-on-white PNG, without putting it on screen */
  function renderPNG(data, maxW = 1000) {
    const strokes = ((data && data.strokes) || []).map(decode).filter(st => st.pts.length);
    const bottom = strokes.reduce((m, st) => Math.max(m, bounds(st).y1), 0);
    const h = Math.max(120, Math.min((data && data.h) || MAX_H, bottom + 40)), k = maxW / W;
    const c = document.createElement("canvas"); c.width = maxW; c.height = Math.round(h * k);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    paintPaper(x, (data && data.bg) || "lined", h, "#000", k, .16);
    x.setTransform(k, 0, 0, k, 0, 0);
    strokes.forEach(st => { x.fillStyle = COLOURS[st.c] && COLOURS[st.c][0] !== "ink" ? COLOURS[st.c][0] : "#111"; x.fill(pathOf(st)); });
    return c.toDataURL("image/png");
  }

  /* Lined, grid or blank paper, in logical units */
  function paintPaper(ctx, bg, h, colour, k, alpha) {
    if (bg === "blank") return;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.strokeStyle = colour;
    const thin = 1 / k;
    if (bg === "lined") {
      ctx.globalAlpha = alpha || .14; ctx.lineWidth = Math.max(thin, 1.1);
      ctx.beginPath();
      for (let y = RULE.lined; y < h; y += RULE.lined) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    } else {
      const g = RULE.grid;
      for (const major of [false, true]) {
        ctx.globalAlpha = (alpha || .1) * (major ? 1.9 : 1); ctx.lineWidth = Math.max(thin, major ? 1.2 : .8);
        ctx.beginPath();
        for (let i = 1; i * g < W; i++) if ((i % 4 === 0) === major) { ctx.moveTo(i * g, 0); ctx.lineTo(i * g, h); }
        for (let i = 1; i * g < h; i++) if ((i % 4 === 0) === major) { ctx.moveTo(0, i * g); ctx.lineTo(W, i * g); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* Redraw when the theme changes (ink and paper follow it) */
  new MutationObserver(() => instances.forEach(x => x.redraw())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-tone", "class"] });
  /* ⌘Z / ⇧⌘Z for the canvas you last used, when you're not typing */
  document.addEventListener("keydown", e => {
    if (!lastUsed || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault(); e.shiftKey ? lastUsed.redo() : lastUsed.undo();
  });

  window.VaultInk = { mount, tool, W, renderPNG };
})();

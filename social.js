/* The Orchard: Social.
   Three pages under one tab: The Neighbourhood (a little park where you and
   your friends hang out), Friends, and Your neighbour (profile + avatar).
   Data lives in Supabase tables set up by supabase-social-setup.sql; the
   database rules make everything friends-only. */
(function () {
  "use strict";
  const root = document.getElementById("view-social");
  const A = window.orchardAuth;
  if (!root || !A || !A.client) return;
  const sb = A.client;

  /* ---------- helpers ---------- */
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => (typeof window.toast === "function" ? window.toast(m) : alert(m));
  const fmt = m => (typeof fmtTime === "function" ? fmtTime(m) : `${m}m`);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const reduce = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  function ago(t) {
    const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  const online = p => p && p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 5 * 60 * 1000;
  const missingTable = e => e && (/relation .* does not exist|Could not find the table|schema cache/i.test(e.message || "") || ["42P01", "PGRST205", "PGRST202"].includes(e.code));

  /* ---------- avatars (original "pebble" neighbours) ---------- */
  const COLOURS = ["#e8735a", "#f2b84b", "#7cc47f", "#4fb3a9", "#5b8def", "#9b7be0", "#e77fb1", "#a7856a", "#6d7b8c"];
  const EYES = ["Dots", "Happy", "Sleepy", "Wink", "Wide"];
  const MOUTHS = ["Smile", "Grin", "Oh", "Calm", "Cat"];
  const HATS = ["None", "Beanie", "Cap", "Headphones", "Sprout", "Grad cap", "Bow", "Glasses"];
  const DEFAULT_AV = { c: 4, e: 0, m: 0, h: 4 };
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const ch = i => Math.max(0, Math.min(255, Math.round(((n >> i) & 255) * f))); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  function avatarSVG(av, extraClass) {
    const a = { ...DEFAULT_AV, ...(av || {}) };
    const col = COLOURS[a.c % COLOURS.length] || COLOURS[0];
    const dark = shade(col, .72), light = shade(col, 1.18);
    const eye = ({
      0: `<circle cx="40" cy="52" r="4.2"/><circle cx="60" cy="52" r="4.2"/><circle cx="41.4" cy="50.6" r="1.3" fill="#fff"/><circle cx="61.4" cy="50.6" r="1.3" fill="#fff"/>`,
      1: `<path d="M35 53q5-6 10 0M55 53q5-6 10 0" fill="none" stroke="#2a2622" stroke-width="3" stroke-linecap="round"/>`,
      2: `<path d="M35 52q5 4 10 0M55 52q5 4 10 0" fill="none" stroke="#2a2622" stroke-width="3" stroke-linecap="round"/>`,
      3: `<circle cx="40" cy="52" r="4.2"/><path d="M55 53q5-5 10 0" fill="none" stroke="#2a2622" stroke-width="3" stroke-linecap="round"/>`,
      4: `<circle cx="40" cy="52" r="5.5" fill="#fff"/><circle cx="60" cy="52" r="5.5" fill="#fff"/><circle cx="41" cy="53" r="3"/><circle cx="61" cy="53" r="3"/>`
    })[a.e] || "";
    const mouth = ({
      0: `<path d="M44 63q6 5 12 0" fill="none" stroke="#2a2622" stroke-width="2.6" stroke-linecap="round"/>`,
      1: `<path d="M42 61h16q-1 9-8 9t-8-9z" fill="#2a2622"/><path d="M45 66q5 3 10 0" fill="#e9837c"/>`,
      2: `<ellipse cx="50" cy="65" rx="3.6" ry="4.2" fill="#2a2622"/>`,
      3: `<path d="M45 64h10" stroke="#2a2622" stroke-width="2.6" stroke-linecap="round"/>`,
      4: `<path d="M43 62q3.5 4 7 0q3.5 4 7 0" fill="none" stroke="#2a2622" stroke-width="2.4" stroke-linecap="round"/>`
    })[a.m] || "";
    const hat = ({
      1: `<path d="M22 36q2-26 28-27t28 27z" fill="${shade(COLOURS[(a.c + 4) % COLOURS.length], .95)}"/><rect x="20" y="31" width="60" height="9" rx="4.5" fill="${shade(COLOURS[(a.c + 4) % COLOURS.length], .75)}"/><circle cx="50" cy="8" r="5.5" fill="#fff"/>`,
      2: `<path d="M24 34q1-22 26-22t26 22z" fill="#2f3b52"/><path d="M60 31q20-1 26 5l-26 1z" fill="#24304a"/><circle cx="50" cy="13" r="2.5" fill="#24304a"/>`,
      3: `<path d="M20 50q0-36 30-36t30 36" fill="none" stroke="#2f3238" stroke-width="5" stroke-linecap="round"/><rect x="13" y="44" width="12" height="20" rx="5" fill="#2f3238"/><rect x="75" y="44" width="12" height="20" rx="5" fill="#2f3238"/>`,
      4: `<path d="M50 22v-9" stroke="#5c8a3a" stroke-width="3" stroke-linecap="round"/><path d="M50 15q-12-10-17 1q10 6 17-1zM50 13q10-11 17-2q-8 8-17 2z" fill="#79b552"/>`,
      5: `<path d="M18 22 50 10l32 12-32 12z" fill="#262a33"/><path d="M33 27v10q17 8 34 0V27l-17 7z" fill="#30353f"/><path d="M78 23v14" stroke="#e6b23a" stroke-width="2"/><circle cx="78" cy="38" r="3" fill="#e6b23a"/>`,
      6: `<path d="M50 23q-15-12-17 0q2 11 17 0zM50 23q15-12 17 0q-2 11-17 0z" fill="#e2566b"/><circle cx="50" cy="23" r="4.5" fill="#c43e55"/>`,
      7: `<g fill="none" stroke="#2a2622" stroke-width="2.4"><circle cx="40" cy="52" r="8"/><circle cx="60" cy="52" r="8"/><path d="M48 52h4M32 50l-8-3M68 50l8-3"/></g>`
    })[a.h] || "";
    return `<svg class="nb-av${extraClass ? " " + extraClass : ""}" viewBox="0 0 100 120" aria-hidden="true">
      <ellipse cx="50" cy="114" rx="30" ry="5" fill="rgb(0 0 0 / .14)"/>
      <ellipse cx="37" cy="108" rx="10" ry="6" fill="${dark}"/><ellipse cx="63" cy="108" rx="10" ry="6" fill="${dark}"/>
      <path d="M50 18c22 0 34 18 34 44 0 28-14 46-34 46S16 90 16 62c0-26 12-44 34-44z" fill="${col}"/>
      <path d="M50 18c22 0 34 18 34 44 0 6-.7 11.6-2 16.6C77 50 66 30 46 18.3c1.3-.2 2.6-.3 4-.3z" fill="${light}" opacity=".55"/>
      <ellipse cx="50" cy="88" rx="18" ry="14" fill="#fff" opacity=".18"/>
      <ellipse cx="31" cy="64" rx="5.5" ry="3.4" fill="#ff8a8a" opacity=".45"/><ellipse cx="69" cy="64" rx="5.5" ry="3.4" fill="#ff8a8a" opacity=".45"/>
      <g fill="#2a2622">${eye}</g>${mouth}${hat}
    </svg>`;
  }

  /* ---------- state ---------- */
  const S = {
    me: null, uid: null, profile: null, setup: false, loaded: false, loading: false,
    people: new Map(), requests: [], outgoing: [], notes: [], cheers: new Map(),
    seg: "hood", draft: null
  };
  try { S.seg = localStorage.getItem("orchard-social-seg") || "hood"; } catch (e) {}

  const friends = () => S.requests.filter(r => r.status === "accepted").map(r => S.people.get(r.from_id === S.uid ? r.to_id : r.from_id)).filter(Boolean);
  const incoming = () => S.requests.filter(r => r.status === "pending" && r.to_id === S.uid).map(r => ({ r, p: S.people.get(r.from_id) })).filter(x => x.p);

  /* ---------- your study stats (what friends see) ---------- */
  function myStats() {
    const sess = typeof store !== "undefined" ? store.sessions : [];
    const now = new Date(), week = new Date(now); week.setDate(now.getDate() - 6);
    const wk = iso(week), td = iso(now);
    let weekMins = 0, todayMins = 0; const bySubj = {};
    sess.forEach(s => {
      const m = +s.minutes || 0;
      if (s.date >= wk) { weekMins += m; bySubj[s.subject] = (bySubj[s.subject] || 0) + m; }
      if (s.date === td) todayMins += m;
    });
    const days = new Set(sess.map(s => s.date));
    let streak = 0; const d = new Date(now);
    if (!days.has(iso(d))) d.setDate(d.getDate() - 1);
    while (days.has(iso(d))) { streak++; d.setDate(d.getDate() - 1); }
    const top = Object.entries(bySubj).sort((a, b) => b[1] - a[1])[0];
    return { weekMins, todayMins, streak, top: top ? top[0] : null, at: new Date().toISOString() };
  }

  /* ---------- loading ---------- */
  async function load() {
    if (S.loading) return;
    S.loading = true;
    try {
      const me = await A.me(); S.me = me; S.uid = me.id;
      const pr = await sb.from("profiles").select("*");
      if (pr.error) { if (missingTable(pr.error)) { S.setup = true; S.loaded = true; render(); return; } throw pr.error; }
      S.setup = false;
      S.people = new Map(pr.data.map(p => [p.id, p]));
      S.profile = S.people.get(S.uid) || null;
      if (S.profile) {
        const [rq, out, nt] = await Promise.all([
          sb.from("friend_requests").select("*"),
          sb.rpc("my_outgoing"),
          sb.from("notes").select("id,user_id,body,created_at").order("created_at", { ascending: false }).limit(80)
        ]);
        S.requests = rq.data || [];
        S.outgoing = out.data || [];
        S.notes = (nt.data || []).filter(n => S.people.has(n.user_id));
        const ids = S.notes.map(n => n.id);
        S.cheers = new Map();
        if (ids.length) {
          const ch = await sb.from("cheers").select("note_id,user_id").in("note_id", ids);
          (ch.data || []).forEach(c => { const x = S.cheers.get(c.note_id) || { n: 0, mine: false, who: [] }; x.n++; if (c.user_id === S.uid) x.mine = true; x.who.push(c.user_id); S.cheers.set(c.note_id, x); });
        }
      }
      S.loaded = true;
      const sig = JSON.stringify([[...S.people.values()].map(p => [p.id, p.display_name, p.handle, p.avatar, p.status, p.share_stats, p.stats && p.stats.weekMins, p.stats && p.stats.streak, online(p)]), S.requests, S.outgoing, S.notes.map(n => n.id), [...S.cheers]]);
      if (sig !== S.sig || !root.querySelector(".page-head")) { S.sig = sig; render(); }
      heartbeat();
    } catch (e) {
      console.error(e);
      S.loaded = true;
      if (!S.profile) root.innerHTML = shell(`<div class="nb-empty"><h2>Couldn’t load Social</h2><p>${escH(e.message || "Please try again.")}</p><button class="primary" data-act="retry">Try again</button></div>`);
    } finally { S.loading = false; window.orchardNavRefresh && window.orchardNavRefresh(); }
  }

  /* Online status + shared stats, every couple of minutes while the app is open */
  let lastBeat = 0;
  async function heartbeat(force) {
    if (!S.profile || document.visibilityState !== "visible") return;
    if (!force && Date.now() - lastBeat < 110000) return;
    lastBeat = Date.now();
    const patch = { last_seen: new Date().toISOString(), stats: S.profile.share_stats ? myStats() : null };
    const r = await sb.from("profiles").update(patch).eq("id", S.uid);
    if (!r.error) Object.assign(S.profile, patch);
  }
  setInterval(() => heartbeat(), 60000);
  document.addEventListener("visibilitychange", () => heartbeat());

  /* ---------- page shell ---------- */
  const SEGS = [["hood", "The Neighbourhood"], ["friends", "Friends"], ["profile", "Your neighbour"]];
  function shell(body, withSegs) {
    const inc = S.profile ? incoming().length : 0;
    return `<div class="page-head">
        <p class="eyebrow">Community</p>
        <h1 class="page-title">Social</h1>
        <p class="page-sub">Revise alongside your friends. Share how it’s going, cheer each other on and keep your streaks alive together.</p>
      </div>
      ${withSegs ? `<div class="seg nb-seg" role="tablist" aria-label="Social sections">${SEGS.map(([id, l]) => `<button type="button" role="tab" data-seg="${id}" aria-selected="${S.seg === id}">${l}${id === "friends" && inc ? ` <span class="nb-count">${inc}</span>` : ""}</button>`).join("")}</div>` : ""}
      ${body}`;
  }

  function render() {
    if (!S.loaded) { root.innerHTML = shell(`<div class="nb-loading">Opening the gate…</div>`); return; }
    if (S.setup) {
      root.innerHTML = shell(`<div class="nb-empty"><h2>Social isn’t switched on yet</h2>
        <p>To turn it on, run <code>supabase-social-setup.sql</code> in your Supabase project (SQL Editor → New query → paste → Run), then reload this page.</p></div>`);
      return;
    }
    stopStage();
    if (!S.profile) { renderOnboarding(); return; }
    const body = S.seg === "friends" ? friendsHTML() : S.seg === "profile" ? profileHTML() : hoodHTML();
    root.innerHTML = shell(body, true);
    if (S.seg === "hood" && location.hash === "#social") startStage();
    if (S.seg === "profile") wireEditor(root.querySelector(".nb-editor"));
  }

  /* ---------- The Neighbourhood ---------- */
  const GUIDES = [
    { id: "g-hazel", display_name: "Hazel", handle: "guide", avatar: { c: 1, e: 1, m: 0, h: 5 }, guide: true,
      tips: ["Little and often beats one giant cram.", "Test yourself before you reread anything.", "Blurt a topic, then fill the gaps in a new colour."] },
    { id: "g-rowan", display_name: "Rowan", handle: "guide", avatar: { c: 3, e: 0, m: 4, h: 3 }, guide: true,
      tips: ["Phone in another room = twice the focus.", "25 minutes on, 5 off. Repeat.", "Past papers are the best revision there is."] },
    { id: "g-juniper", display_name: "Juniper", handle: "guide", avatar: { c: 6, e: 3, m: 1, h: 6 }, guide: true,
      tips: ["Sleep is when memories stick. Protect it.", "Explain it out loud like you’re the teacher.", "Red topics first. Future you will thank you."] }
  ];
  function residents() {
    const list = [{ ...S.profile, you: true }, ...friends()];
    if (list.length < 5) GUIDES.slice(0, Math.min(3, 5 - list.length)).forEach(g => list.push(g));
    return list;
  }
  const latestNote = id => S.notes.find(n => n.user_id === id && Date.now() - new Date(n.created_at).getTime() < 48 * 3600e3);

  function sceneSVG() {
    return `<svg class="nb-scene" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="nb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="nb-sky1"/><stop offset="1" class="nb-sky2"/></linearGradient>
        <linearGradient id="nb-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="nb-g1"/><stop offset="1" class="nb-g2"/></linearGradient>
        <radialGradient id="nb-sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" class="nb-sun1"/><stop offset="1" class="nb-sun2"/></radialGradient>
      </defs>
      <rect width="1200" height="520" fill="url(#nb-sky)"/>
      <circle class="nb-sunc" cx="980" cy="92" r="120" fill="url(#nb-sun)"/>
      <g class="nb-stars">${Array.from({ length: 36 }, (_, i) => `<circle cx="${(i * 137) % 1200}" cy="${(i * 53) % 220 + 10}" r="${i % 3 ? 1 : 1.6}"/>`).join("")}</g>
      <g class="nb-clouds"><g class="nb-cloud" style="--d:70s"><ellipse cx="180" cy="90" rx="70" ry="22"/><ellipse cx="225" cy="78" rx="45" ry="26"/><ellipse cx="140" cy="84" rx="38" ry="18"/></g>
        <g class="nb-cloud" style="--d:95s;--o:-40s"><ellipse cx="620" cy="60" rx="60" ry="18"/><ellipse cx="660" cy="50" rx="38" ry="22"/></g>
        <g class="nb-cloud" style="--d:85s;--o:-20s"><ellipse cx="900" cy="140" rx="55" ry="16"/><ellipse cx="935" cy="130" rx="34" ry="19"/></g></g>
      <path class="nb-hill2" d="M0 250C150 190 300 205 430 235S700 190 850 210 1100 180 1200 215V520H0z"/>
      <path class="nb-hill1" d="M0 285C180 245 330 270 520 265S860 240 1000 262 1150 255 1200 268V520H0z"/>
      <g class="nb-trees">${[[70, 262], [130, 255], [1080, 250], [1140, 262], [330, 262], [870, 255]].map(([x, y], i) => `<g transform="translate(${x} ${y}) scale(${.7 + (i % 3) * .12})"><rect x="-3" y="-6" width="6" height="16" rx="2" class="nb-trunk"/><circle cy="-18" r="17" class="nb-leaf${i % 2 ? "2" : ""}"/></g>`).join("")}</g>
      <path d="M0 300C200 288 400 296 600 296S1000 288 1200 300V520H0z" fill="url(#nb-grass)"/>
      <ellipse class="nb-plaza" cx="600" cy="400" rx="430" ry="88"/>
      <ellipse class="nb-plaza-in" cx="600" cy="400" rx="380" ry="70"/>
      <path class="nb-path" d="M560 488 590 452h20l30 36zM120 520C260 470 380 440 470 430l14 8C400 452 290 486 210 520zM1080 520C940 470 820 440 730 430l-14 8c84 14 194 48 274 82z"/>
      <g class="nb-flowers">${Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 97 + 40) % 1200}" cy="${330 + ((i * 41) % 170)}" r="${2 + (i % 3)}" class="nb-f${i % 4}"/>`).join("")}</g>
      <g class="nb-lamps">${[[250, 340], [950, 340], [330, 470], [870, 470]].map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-2" y="-56" width="4" height="56" class="nb-post"/><circle cy="-60" r="7" class="nb-bulb"/><circle cy="-60" r="22" class="nb-glow"/></g>`).join("")}</g>
    </svg>`;
  }
  function treeSVG() {
    return `<svg class="nb-tree" viewBox="0 0 300 300" aria-hidden="true">
      <ellipse cx="150" cy="282" rx="92" ry="12" fill="rgb(0 0 0 / .16)"/>
      <path class="nb-trunk" d="M136 284c4-30 3-60-6-92l20 6 20-6c-9 32-10 62-6 92z"/>
      <path class="nb-trunk" d="M140 210c-20-14-34-26-44-44l10-4c10 14 22 26 38 34zM160 206c18-12 30-26 38-42l-10-4c-8 14-18 26-32 34z"/>
      <circle class="nb-leaf2" cx="96" cy="134" r="58"/><circle class="nb-leaf2" cx="206" cy="132" r="60"/>
      <circle class="nb-leaf" cx="150" cy="96" r="76"/><circle class="nb-leaf" cx="104" cy="160" r="50"/><circle class="nb-leaf" cx="198" cy="160" r="50"/>
      <circle class="nb-leafhi" cx="128" cy="70" r="34"/>
      ${[[110, 112], [176, 84], [214, 150], [140, 170], [84, 150], [190, 120], [150, 130], [236, 118]].map(([x, y]) => `<circle class="nb-apple" cx="${x}" cy="${y}" r="9"/><path d="M${x} ${y - 9}q3-6 7-6" class="nb-stalk"/>`).join("")}
      <g transform="translate(150 246)"><rect x="-74" y="-17" width="148" height="30" rx="6" class="nb-sign"/><text y="3" text-anchor="middle" class="nb-sign-t">The Neighbourhood</text></g>
    </svg>`;
  }

  function hoodHTML() {
    const fr = friends();
    const me = S.profile;
    const people = [{ ...me, you: true }, ...fr];
    const board = [...people].sort((a, b) => ((b.stats && b.stats.weekMins) || 0) - ((a.stats && a.stats.weekMins) || 0));
    const onlineNow = fr.filter(online);
    return `
      <div class="nb-stage-wrap"><div class="nb-stage" id="nb-stage" role="region" aria-label="The Neighbourhood: you and your friends">
        ${sceneSVG()}
        <div class="nb-tree-wrap" style="z-index:330">${treeSVG()}</div>
        <div class="nb-actors" id="nb-actors"></div>
        <div class="nb-hud">
          <span class="nb-chip"><i class="nb-live"></i>${onlineNow.length ? `${onlineNow.length} friend${onlineNow.length === 1 ? "" : "s"} online` : "Your neighbourhood"}</span>
          <span class="nb-chip">${fr.length} friend${fr.length === 1 ? "" : "s"}</span>
        </div>
        ${fr.length ? "" : `<div class="nb-hint"><b>It’s quiet here.</b> Add friends by their @handle and they’ll move in. <button type="button" data-seg="friends">Add friends</button></div>`}
        <div class="nb-pop" id="nb-pop" hidden></div>
      </div></div>

      <div class="nb-cols">
        <section class="nb-board">
          <div class="section-head"><h2>Notice board</h2><span class="o-dim">Friends only</span></div>
          <form class="nb-compose" id="nb-compose">
            <span class="nb-mini">${avatarSVG(me.avatar)}</span>
            <div class="nb-compose-main">
              <textarea id="nb-note" maxlength="140" rows="2" placeholder="Share how revision’s going… (friends only)"></textarea>
              <div class="nb-compose-foot">
                <div class="nb-presets">${["Just smashed a past paper", "Who’s revising tonight?", "Flashcards done for today", "Need a study buddy"].map(t => `<button type="button" class="chip sm" data-preset="${escH(t)}">${escH(t)}</button>`).join("")}</div>
                <span class="nb-left" id="nb-left">140</span>
                <button class="primary" type="submit">Post</button>
              </div>
            </div>
          </form>
          <ul class="nb-feed">${S.notes.length ? S.notes.slice(0, 40).map(noteHTML).join("") : `<li class="nb-feed-empty">No notes yet. Post the first one!</li>`}</ul>
        </section>
        <aside class="nb-side">
          <section class="o-card">
            <h3>This week</h3>
            <ol class="nb-rank">${board.map((p, i) => {
              const st = p.stats || {};
              return `<li class="${p.you ? "me" : ""}"><span class="nb-pos">${i + 1}</span><span class="nb-mini">${avatarSVG(p.avatar)}</span><span class="nb-who"><b>${escH(p.display_name)}${p.you ? " (you)" : ""}</b><span>${p.share_stats === false || !p.stats ? "Stats hidden" : `${st.streak || 0}-day streak${st.top ? " · " + escH(st.top) : ""}`}</span></span><em>${p.share_stats === false || !p.stats ? "–" : fmt(st.weekMins || 0)}</em></li>`;
            }).join("")}</ol>
            ${fr.length ? "" : `<p class="o-dim o-small">Add friends to see how your week compares.</p>`}
          </section>
          <section class="o-card">
            <h3>Invite friends</h3>
            <p class="o-dim nb-inv">Friends can add you with your handle:</p>
            <div class="nb-handle"><b>@${escH(me.handle)}</b><button type="button" class="chip sm" data-act="copy">Copy invite</button></div>
          </section>
        </aside>
      </div>`;
  }
  function noteHTML(n) {
    const p = S.people.get(n.user_id); if (!p) return "";
    const c = S.cheers.get(n.id) || { n: 0, mine: false };
    const mine = n.user_id === S.uid;
    return `<li class="nb-note" data-note="${n.id}">
      <span class="nb-mini">${avatarSVG(p.avatar)}</span>
      <div class="nb-note-main">
        <div class="nb-note-head"><b>${escH(p.display_name)}</b><span>@${escH(p.handle)} · ${ago(n.created_at)}</span>
          ${mine ? `<button type="button" class="nb-x" data-act="del-note" data-id="${n.id}" aria-label="Delete note" title="Delete">×</button>` : ""}</div>
        <p>${escH(n.body)}</p>
        <button type="button" class="nb-cheer${c.mine ? " on" : ""}" data-act="cheer" data-id="${n.id}" aria-pressed="${c.mine}" ${mine ? "disabled title=\"You can’t cheer your own note\"" : ""}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-8c1.7 0 2.8 1.4 2.4 3l-.9 3.5H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>
          ${c.n ? `${c.n} cheer${c.n === 1 ? "" : "s"}` : "Cheer"}</button>
      </div></li>`;
  }

  /* --- walking around --- */
  let raf = 0, actors = [], bubbleTimer = 0, stageEl = null;
  const W = 1200, H = 520, CX = 600, CY = 400, RX = 400, RY = 78;
  const inPlaza = (x, y) => ((x - CX) / RX) ** 2 + ((y - CY) / RY) ** 2 <= 1 && !(Math.abs(x - CX) < 70 && y < CY - 30);
  function randomSpot() { for (let i = 0; i < 50; i++) { const x = CX + (Math.random() * 2 - 1) * RX, y = CY + (Math.random() * 2 - 1) * RY; if (inPlaza(x, y)) return { x, y }; } return { x: CX - 200, y: CY + 30 }; }
  function startStage() {
    stageEl = document.getElementById("nb-stage");
    const layer = document.getElementById("nb-actors");
    if (!stageEl || !layer) return;
    const list = residents();
    actors = list.map((p, i) => {
      const spot = randomSpot();
      const el = document.createElement("button");
      el.type = "button"; el.className = "nb-actor" + (p.you ? " you" : "") + (p.guide ? " guide" : "");
      el.dataset.id = p.id;
      el.setAttribute("aria-label", `${p.display_name}${p.you ? " (you)" : p.guide ? " (guide)" : ""}`);
      el.innerHTML = `<span class="nb-bubble" hidden></span><span class="nb-body">${avatarSVG(p.avatar)}</span><span class="nb-tag">${online(p) && !p.you ? '<i class="nb-dot"></i>' : ""}${escH(p.you ? "You" : p.display_name)}${p.guide ? '<em>Guide</em>' : ""}</span>`;
      layer.appendChild(el);
      return { p, el, x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, wait: 500 + Math.random() * 2500 + i * 300, dir: 1, walking: false };
    });
    let last = performance.now();
    const still = reduce();
    const step = t => {
      const dt = Math.min(64, t - last); last = t;
      actors.forEach(a => {
        if (!still) {
          if (a.wait > 0) { a.wait -= dt; if (a.wait <= 0) { const s = randomSpot(); a.tx = s.x; a.ty = s.y; } }
          else {
            const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy), v = 0.045 * dt;
            if (d < 2) { a.wait = 2500 + Math.random() * 5000; a.walking = false; }
            else { a.x += dx / d * Math.min(v, d); a.y += dy / d * Math.min(v, d); a.walking = true; if (Math.abs(dx) > 1) a.dir = dx > 0 ? 1 : -1; }
          }
        }
        const depth = 0.78 + (a.y - (CY - RY)) / (2 * RY) * 0.34;
        a.el.style.left = `${a.x / W * 100}%`;
        a.el.style.top = `${a.y / H * 100}%`;
        a.el.style.setProperty("--s", depth.toFixed(3));
        a.el.style.setProperty("--dir", a.dir);
        a.el.style.zIndex = String(Math.round(a.y));
        a.el.classList.toggle("walking", a.walking);
      });
      raf = still ? 0 : requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const wrap = stageEl.parentElement;
    if (wrap && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
    rotateBubbles();
    bubbleTimer = setInterval(rotateBubbles, 6500);
  }
  function stopStage() { cancelAnimationFrame(raf); raf = 0; clearInterval(bubbleTimer); actors = []; }
  let tipIdx = 0;
  function rotateBubbles() {
    if (!actors.length) return;
    tipIdx++;
    const talkers = actors.filter(a => a.p.guide || latestNote(a.p.id));
    const pick = new Set();
    for (let i = 0; i < Math.min(3, talkers.length); i++) pick.add(talkers[(tipIdx + i) % talkers.length]);
    actors.forEach(a => {
      const b = a.el.querySelector(".nb-bubble");
      if (pick.has(a)) {
        const text = a.p.guide ? a.p.tips[tipIdx % a.p.tips.length] : latestNote(a.p.id).body;
        b.textContent = text; b.hidden = false; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
      } else b.hidden = true;
    });
  }
  function showPop(id) {
    const pop = document.getElementById("nb-pop"); if (!pop) return;
    const a = actors.find(x => String(x.p.id) === String(id)); if (!a) return;
    const p = a.p, st = p.stats || {}, note = latestNote(p.id) || S.notes.find(n => n.user_id === p.id);
    const c = note ? S.cheers.get(note.id) || { n: 0, mine: false } : null;
    pop.innerHTML = `<button type="button" class="nb-pop-x" data-act="close-pop" aria-label="Close">×</button>
      <div class="nb-pop-top"><span class="nb-pop-av">${avatarSVG(p.avatar)}</span><div><b>${escH(p.display_name)}${p.you ? " (you)" : ""}</b>
        <span>${p.guide ? "Neighbourhood guide" : "@" + escH(p.handle)}${online(p) && !p.you ? ' · <i class="nb-dot"></i>Online' : ""}</span>
        ${p.status ? `<span class="nb-pop-status">${escH(p.status)}</span>` : ""}</div></div>
      ${p.guide ? `<p class="nb-pop-note">Guides keep the place lively until your friends move in. They share study tips. Add friends and they’ll make room.</p>`
        : `${p.share_stats === false || !p.stats ? `<p class="o-dim o-small">Study stats are hidden.</p>` : `<div class="nb-pop-stats"><div><b>${fmt(st.weekMins || 0)}</b><span>This week</span></div><div><b>${st.streak || 0}</b><span>Day streak</span></div><div><b>${escH(st.top || "–")}</b><span>Top subject</span></div></div>`}
          ${note ? `<p class="nb-pop-note">“${escH(note.body)}”<span>${ago(note.created_at)}</span></p>` : ""}
          ${p.you ? `<button type="button" class="chip sm" data-seg="profile">Edit your neighbour</button>` : note ? `<button type="button" class="nb-cheer${c.mine ? " on" : ""}" data-act="cheer" data-id="${note.id}" aria-pressed="${c.mine}">${c.mine ? "Cheered" : "Cheer them on"}</button>` : ""}`}`;
    const left = Math.min(Math.max(a.x / W * 100, 14), 86);
    pop.style.left = `${left}%`;
    pop.style.top = `${Math.max(8, a.y / H * 100 - 46)}%`;
    pop.hidden = false;
  }

  /* ---------- Friends ---------- */
  function friendsHTML() {
    const fr = friends(), inc = incoming();
    return `<div class="nb-friends">
      <section class="o-card nb-add">
        <h3>Add a friend</h3>
        <form id="nb-find" class="nb-find"><span class="nb-at">@</span><input class="input" name="h" placeholder="their handle" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="21" required><button class="primary" type="submit">Find</button></form>
        <div id="nb-found"></div>
        <p class="o-dim o-small">Your handle is <b>@${escH(S.profile.handle)}</b>. Only people you accept can see your notes and stats.</p>
      </section>
      ${inc.length ? `<section class="o-card"><h3>Requests <span class="nb-count">${inc.length}</span></h3><ul class="nb-list">${inc.map(({ r, p }) => personRow(p, `<button class="primary" data-act="accept" data-id="${r.id}">Accept</button><button class="chip" data-act="decline" data-id="${r.id}">Decline</button>`)).join("")}</ul></section>` : ""}
      ${S.outgoing.length ? `<section class="o-card"><h3>Sent</h3><ul class="nb-list">${S.outgoing.map(o => personRow(o, `<span class="o-dim o-small">Waiting</span><button class="chip" data-act="cancel" data-id="${o.request_id}">Cancel</button>`)).join("")}</ul></section>` : ""}
      <section class="o-card nb-flist"><h3>Friends <span class="o-dim">${fr.length}</span></h3>
        ${fr.length ? `<ul class="nb-grid">${fr.map(p => {
          const st = p.stats || {};
          return `<li class="nb-fcard"><span class="nb-fav">${avatarSVG(p.avatar)}</span><b>${online(p) ? '<i class="nb-dot"></i>' : ""}${escH(p.display_name)}</b><span class="o-dim">@${escH(p.handle)}</span>
            ${p.status ? `<span class="nb-fstatus">${escH(p.status)}</span>` : ""}
            <span class="nb-fstats">${p.share_stats === false || !p.stats ? "Stats hidden" : `${fmt(st.weekMins || 0)} this week · ${st.streak || 0}-day streak`}</span>
            <button type="button" class="nb-x nb-remove" data-act="remove" data-id="${p.id}" aria-label="Remove ${escH(p.display_name)}" title="Remove friend">×</button></li>`;
        }).join("")}</ul>` : `<p class="o-dim">No friends yet. Ask yours for their @handle, or send them yours.</p>`}
      </section></div>`;
  }
  const personRow = (p, actions) => `<li class="nb-row"><span class="nb-mini">${avatarSVG(p.avatar)}</span><span class="nb-who"><b>${escH(p.display_name)}</b><span>@${escH(p.handle)}</span></span><span class="nb-row-act">${actions}</span></li>`;

  /* ---------- Profile / avatar editor ---------- */
  function editorHTML(p, first) {
    const av = { ...DEFAULT_AV, ...((p && p.avatar) || {}) };
    S.draft = av;
    const row = (key, label, items, swatch) => `<div class="nb-opt"><span>${label}</span><div class="nb-opts" data-key="${key}">${items.map((it, i) => swatch
      ? `<button type="button" class="nb-sw" style="--c:${it}" data-v="${i}" aria-pressed="${av[key] === i}" aria-label="Colour ${i + 1}"></button>`
      : `<button type="button" class="chip sm" data-v="${i}" aria-pressed="${av[key] === i}">${it}</button>`).join("")}</div></div>`;
    return `<form class="nb-editor" novalidate>
      <div class="nb-ed-preview"><div class="nb-ed-stage">${avatarSVG(av, "big")}</div><button type="button" class="chip sm" data-act="shuffle">Shuffle</button></div>
      <div class="nb-ed-form">
        <div class="nb-ed-fields">
          <label class="field"><span>Name your friends see</span><input class="input" name="name" maxlength="40" required value="${escH(p ? p.display_name : (S.me.name || "").split(" ")[0])}"></label>
          <label class="field"><span>Handle</span><div class="nb-hwrap"><span>@</span><input class="input" name="handle" maxlength="20" required pattern="[a-z0-9_]{3,20}" autocapitalize="none" spellcheck="false" value="${escH(p ? p.handle : suggestHandle())}"></div></label>
          <label class="field nb-wide"><span>Status <em class="o-dim">optional</em></span><input class="input" name="status" maxlength="80" placeholder="e.g. Grinding through Chemistry Paper 1" value="${escH(p && p.status || "")}"></label>
        </div>
        ${row("c", "Colour", COLOURS, true)}${row("e", "Eyes", EYES)}${row("m", "Mouth", MOUTHS)}${row("h", "Extra", HATS)}
        <label class="nb-toggle"><input type="checkbox" name="share" ${!p || p.share_stats ? "checked" : ""}><span><b>Share my study stats with friends</b><span class="o-dim">Time this week, streak and top subject. Never your notes, grades or ratings.</span></span></label>
        <p class="acct-err nb-err" role="alert"></p>
        <div class="nb-ed-actions"><button class="primary" type="submit">${first ? "Move in" : "Save changes"}</button></div>
      </div></form>`;
  }
  function suggestHandle() { return ((S.me.name || "neighbour").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "neighbour") + Math.floor(Math.random() * 90 + 10); }
  function profileHTML() { return `<section class="o-card nb-profile"><h3>Your neighbour</h3>${editorHTML(S.profile)}</section>`; }
  function renderOnboarding() {
    root.innerHTML = shell(`<div class="nb-welcome">
      <div class="nb-welcome-art">${sceneSVG()}<div class="nb-tree-wrap">${treeSVG()}</div>
        ${GUIDES.map((g, i) => { const [x, y, d] = [[33, 84, 1], [64, 92, -1], [78, 78, -1]][i]; return `<span class="nb-actor nb-static" style="left:${x}%;top:${y}%;--s:${.85 + i * .05};--dir:${d};z-index:${y * 10}"><span class="nb-body">${avatarSVG(g.avatar)}</span><span class="nb-tag">${g.display_name}<em>Guide</em></span></span>`; }).join("")}
        <span class="nb-actor nb-static nb-ghost" style="left:50%;top:94%;--s:1;z-index:999"><span class="nb-body">${avatarSVG({ c: 4, e: 0, m: 0, h: 4 })}</span><span class="nb-tag">You?</span></span></div>
      <section class="o-card nb-welcome-card"><h2>Move into The Neighbourhood</h2>
        <p class="o-dim">Make your neighbour, pick a handle and you’re in. Friends add you by your handle, and only friends can see what you share.</p>
        ${editorHTML(null, true)}</section></div>`);
    wireEditor(root.querySelector(".nb-editor"), true);
  }
  function wireEditor(form, first) {
    if (!form) return;
    const prev = form.querySelector(".nb-ed-stage");
    const redraw = () => { prev.innerHTML = avatarSVG(S.draft, "big"); form.querySelectorAll(".nb-opts").forEach(g => g.querySelectorAll("[data-v]").forEach(b => b.setAttribute("aria-pressed", String(S.draft[g.dataset.key] === +b.dataset.v)))); };
    form.addEventListener("click", e => {
      const b = e.target.closest(".nb-opts [data-v]");
      if (b) { S.draft[b.closest(".nb-opts").dataset.key] = +b.dataset.v; redraw(); return; }
      if (e.target.closest('[data-act="shuffle"]')) { S.draft = { c: rnd(COLOURS.length), e: rnd(EYES.length), m: rnd(MOUTHS.length), h: rnd(HATS.length) }; redraw(); }
    });
    const hin = form.handle;
    hin.addEventListener("input", () => { const v = hin.value.toLowerCase().replace(/[^a-z0-9_]/g, ""); if (v !== hin.value) hin.value = v; });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const err = form.querySelector(".nb-err"), btn = form.querySelector('[type="submit"]');
      err.textContent = "";
      const name = form.name.value.trim().replace(/\s+/g, " ").slice(0, 40), handle = form.handle.value.trim().toLowerCase();
      if (!name) { err.textContent = "Add a name."; return; }
      if (!/^[a-z0-9_]{3,20}$/.test(handle)) { err.textContent = "Handles are 3–20 characters: lowercase letters, numbers and _."; return; }
      const row = { id: S.uid, display_name: name, handle, avatar: S.draft, status: form.status.value.trim().slice(0, 80) || null, share_stats: form.share.checked };
      if (row.share_stats) row.stats = myStats(); else row.stats = null;
      row.last_seen = new Date().toISOString();
      btn.disabled = true;
      const r = first ? await sb.from("profiles").insert(row) : await sb.from("profiles").update(row).eq("id", S.uid);
      btn.disabled = false;
      if (r.error) { err.textContent = /duplicate|unique/i.test(r.error.message) ? `@${handle} is taken. Try another.` : r.error.message; return; }
      say(first ? "Welcome to the neighbourhood!" : "Saved.");
      if (first) S.seg = "hood";
      await load();
    });
  }
  const rnd = n => Math.floor(Math.random() * n);

  /* ---------- actions ---------- */
  root.addEventListener("click", async e => {
    const seg = e.target.closest("[data-seg]");
    if (seg) { S.seg = seg.dataset.seg; try { localStorage.setItem("orchard-social-seg", S.seg); } catch (x) {} render(); window.scrollTo(0, 0); return; }
    const actor = e.target.closest(".nb-actor");
    if (actor) { showPop(actor.dataset.id); return; }
    const preset = e.target.closest("[data-preset]");
    if (preset) { const t = document.getElementById("nb-note"); t.value = preset.dataset.preset; t.dispatchEvent(new Event("input")); t.focus(); return; }
    const a = e.target.closest("[data-act]");
    if (!a) { if (!e.target.closest("#nb-pop")) { const p = document.getElementById("nb-pop"); if (p) p.hidden = true; } return; }
    const act = a.dataset.act, id = a.dataset.id;
    try {
      if (act === "retry") return load();
      if (act === "close-pop") { document.getElementById("nb-pop").hidden = true; return; }
      if (act === "copy") {
        const text = `Add me on The Orchard: @${S.profile.handle}`;
        try { await navigator.clipboard.writeText(text); say("Copied. Send it to a friend."); } catch (x) { say(text); }
        return;
      }
      if (act === "cheer") {
        const c = S.cheers.get(+id) || { n: 0, mine: false };
        const r = c.mine ? await sb.from("cheers").delete().eq("note_id", +id).eq("user_id", S.uid) : await sb.from("cheers").insert({ note_id: +id, user_id: S.uid });
        if (r.error) throw r.error;
        return load();
      }
      if (act === "del-note") { if (!confirm("Delete this note?")) return; const r = await sb.from("notes").delete().eq("id", +id); if (r.error) throw r.error; return load(); }
      if (act === "accept") { const r = await sb.rpc("accept_request", { req: +id }); if (r.error) throw r.error; say("You’re now friends."); return load(); }
      if (act === "decline" || act === "cancel") { const r = await sb.from("friend_requests").delete().eq("id", +id); if (r.error) throw r.error; return load(); }
      if (act === "remove") {
        const p = S.people.get(id);
        if (!confirm(`Remove ${p ? p.display_name : "this friend"}? They won’t see your notes or stats any more.`)) return;
        const rq = S.requests.find(r => r.status === "accepted" && (r.from_id === id || r.to_id === id));
        if (rq) { const r = await sb.from("friend_requests").delete().eq("id", rq.id); if (r.error) throw r.error; }
        return load();
      }
      if (act === "send") {
        const r = await sb.rpc("send_request", { target: id });
        if (r.error) throw r.error;
        say({ sent: "Request sent.", accepted: "They’d already asked you, so you’re now friends!", already_sent: "You’ve already asked them.", already_friends: "You’re already friends." }[r.data] || "Done.");
        document.getElementById("nb-found").innerHTML = "";
        return load();
      }
    } catch (x) { say(x.message || "Something went wrong."); }
  });
  root.addEventListener("input", e => {
    if (e.target.id === "nb-note") { const l = document.getElementById("nb-left"); if (l) { l.textContent = 140 - e.target.value.length; l.classList.toggle("low", e.target.value.length > 120); } }
  });
  root.addEventListener("keydown", e => {
    if (e.target.id === "nb-note" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.getElementById("nb-compose").requestSubmit(); }
  });
  root.addEventListener("submit", async e => {
    if (e.target.id === "nb-compose") {
      e.preventDefault();
      const t = document.getElementById("nb-note"), body = t.value.trim();
      if (!body) return;
      const btn = e.target.querySelector('[type="submit"]'); btn.disabled = true;
      const r = await sb.from("notes").insert({ body, user_id: S.uid });
      btn.disabled = false;
      if (r.error) { say(/row-level security/i.test(r.error.message) ? "You’ve posted a lot today. Try again tomorrow." : r.error.message); return; }
      t.value = ""; say("Posted to the board.");
      return load();
    }
    if (e.target.id === "nb-find") {
      e.preventDefault();
      const h = e.target.h.value.trim().replace(/^@/, "").toLowerCase(), out = document.getElementById("nb-found");
      if (!h) return;
      const r = await sb.rpc("find_profile", { h });
      const p = (r.data || [])[0];
      if (r.error) { out.innerHTML = `<p class="acct-err">${escH(r.error.message)}</p>`; return; }
      if (!p) { out.innerHTML = `<p class="o-dim nb-nf">No one has the handle @${escH(h)}. Check the spelling with your friend.</p>`; return; }
      if (p.id === S.uid) { out.innerHTML = `<p class="o-dim nb-nf">That’s you!</p>`; return; }
      const isF = friends().some(f => f.id === p.id);
      out.innerHTML = `<ul class="nb-list">${personRow(p, isF ? `<span class="o-dim o-small">Already friends</span>` : `<button class="primary" data-act="send" data-id="${p.id}">Send request</button>`)}</ul>`;
    }
  });

  /* ---------- lifecycle ---------- */
  let poll = 0;
  function onRoute() {
    const here = location.hash === "#social";
    clearInterval(poll);
    if (here) {
      if (!S.loaded) render();
      else if (S.profile && S.seg === "hood" && !actors.length) startStage();
      load();
      poll = setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector(".nb-editor:focus-within, #nb-compose:focus-within")) load(); }, 30000);
    } else stopStage();
  }
  addEventListener("hashchange", onRoute);
  onRoute();
  // Quietly load once in the background so the sidebar can show requests and stats stay fresh
  setTimeout(() => { if (!S.loaded) load(); }, 4000);

  window.orchardSocial = {
    badge: () => (S.profile ? (incoming().length ? String(incoming().length) : "") : ""),
    avatarSVG
  };
})();

/* The Orchard: Social.
   Pages under one tab: The Neighbourhood (a 3D plaza where friends gather
   around floating tiles), Messages, Leaderboards, Friends, Your neighbour,
   and Badges (admins only). Data lives in Supabase; the database rules in
   supabase-social-setup.sql and supabase-social-2.sql make it friends-only. */
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
  const dark = () => document.documentElement.dataset.theme !== "daylight";
  function ago(t) {
    const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  const clock = t => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const online = p => p && p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 5 * 60 * 1000;
  const missingTable = e => e && (/relation .* does not exist|Could not find the (table|function)|schema cache/i.test(e.message || "") || ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code));
  const ICON = {
    chat: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h0a2 2 0 0 1-2-2z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
    trophy: '<path d="M8 4.5h8v5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5.5a2.5 2.5 0 0 0 2.6 3.6M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3.6M12 13.5v3M9 19.5h6M10 16.5h4v3h-4z"/>',
    people: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="8" r="2.6"/><path d="M15.5 13.2c.4-.1.7-.1 1-.1 2.3 0 4.1 1.5 4.6 4.4"/>',
    smile: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9 10v.5M15 10v.5M8.5 14q3.5 3 7 0"/>',
    pin: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M8 9h8M8 12h8M8 15h5"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/>',
    cal: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    cards: '<rect x="6" y="4" width="12" height="16" rx="2.5"/><path d="M3.5 7.5v10a2.5 2.5 0 0 0 2.5 2.5M9 9.5h6M9 13h4"/>'
  };
  const icon = (k, cls) => `<svg class="${cls || "nb-ico"}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

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
    const dk = shade(col, .72), lt = shade(col, 1.18);
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
      <ellipse cx="37" cy="108" rx="10" ry="6" fill="${dk}"/><ellipse cx="63" cy="108" rx="10" ry="6" fill="${dk}"/>
      <path d="M50 18c22 0 34 18 34 44 0 28-14 46-34 46S16 90 16 62c0-26 12-44 34-44z" fill="${col}"/>
      <path d="M50 18c22 0 34 18 34 44 0 6-.7 11.6-2 16.6C77 50 66 30 46 18.3c1.3-.2 2.6-.3 4-.3z" fill="${lt}" opacity=".55"/>
      <ellipse cx="50" cy="88" rx="18" ry="14" fill="#fff" opacity=".18"/>
      <ellipse cx="31" cy="64" rx="5.5" ry="3.4" fill="#ff8a8a" opacity=".45"/><ellipse cx="69" cy="64" rx="5.5" ry="3.4" fill="#ff8a8a" opacity=".45"/>
      <g fill="#2a2622">${eye}</g>${mouth}${hat}
    </svg>`;
  }

  /* ---------- badges ---------- */
  const BADGES = {
    crown: { name: "Crown", desc: "Top of the class" },
    diamond: { name: "Diamond", desc: "Rare and brilliant" },
    star: { name: "Star", desc: "Outstanding effort" },
    laurel: { name: "Laurel", desc: "A true scholar" },
    flame: { name: "Flame", desc: "Unstoppable streak" },
    heart: { name: "Heart", desc: "Kindest neighbour" }
  };
  const BADGE_ORDER = ["crown", "diamond", "star", "laurel", "flame", "heart"];
  if (!document.getElementById("nb-badge-defs")) {
    document.body.insertAdjacentHTML("beforeend", `<svg id="nb-badge-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <linearGradient id="bd-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c2"/><stop offset=".45" stop-color="#f4c34f"/><stop offset="1" stop-color="#a8681a"/></linearGradient>
      <linearGradient id="bd-dia" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2fdff"/><stop offset=".45" stop-color="#8fe0ff"/><stop offset="1" stop-color="#2d6fd6"/></linearGradient>
      <linearGradient id="bd-leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f3c1"/><stop offset=".5" stop-color="#a9c55c"/><stop offset="1" stop-color="#4f7a26"/></linearGradient>
      <linearGradient id="bd-fire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a6"/><stop offset=".5" stop-color="#ff9a3d"/><stop offset="1" stop-color="#d4302a"/></linearGradient>
      <linearGradient id="bd-rose" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd3df"/><stop offset=".5" stop-color="#ff6a95"/><stop offset="1" stop-color="#b81d55"/></linearGradient>
      <radialGradient id="bd-disc" cx=".5" cy=".3" r=".75"><stop offset="0" stop-color="#3a4030"/><stop offset="1" stop-color="#0c0e09"/></radialGradient>
      <linearGradient id="bd-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe7a1"/><stop offset=".5" stop-color="#b8892f"/><stop offset="1" stop-color="#fbe7a1"/></linearGradient>
    </defs></svg>`);
  }
  const starPath = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; return `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`; }).join("") + "z";
  const laurel = () => { let s = ""; for (let i = 0; i < 5; i++) { const a = Math.PI * (0.62 + i * 0.13); [-1, 1].forEach(side => { const x = 16 + side * 8.6 * Math.cos(a), y = 30 - (8.6 * Math.sin(a) * -1 + 23); s += `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="1.7" ry="3.4" transform="rotate(${(side * (40 - i * 22)).toFixed(0)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`; }); } return s; };
  const BADGE_ART = {
    crown: `<path d="M8.5 21.5 7 12.5l5.2 4L16 9.5l3.8 7 5.2-4-1.5 9z" fill="url(#bd-gold)"/><rect x="8.5" y="21.8" width="15" height="2.6" rx="1" fill="url(#bd-gold)"/><circle cx="16" cy="9.2" r="1.3" fill="#fff6d0"/><circle cx="7" cy="12.2" r="1.1" fill="#fff6d0"/><circle cx="25" cy="12.2" r="1.1" fill="#fff6d0"/><circle cx="16" cy="18.6" r="1.3" fill="#e0405a"/>`,
    diamond: `<path d="M10.5 9.5h11l4 5-9.5 10.5L6.5 14.5z" fill="url(#bd-dia)"/><path d="M6.5 14.5h19M12.8 9.5l-2.3 5L16 25l5.5-10.5-2.3-5" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/><path d="M11 10l-2.5 3.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`,
    star: `<path d="${starPath(16, 16.5, 9, 4)}" fill="url(#bd-gold)"/><path d="M13 12.5l1.6-3" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`,
    laurel: `<g fill="url(#bd-leaf)">${laurel()}</g><circle cx="16" cy="11" r="2" fill="url(#bd-gold)"/>`,
    flame: `<path d="M16 6.5c1 4 6.5 6 6.5 12a6.5 6.5 0 0 1-13 0c0-3.2 2-4.4 2.2-7.4 2 1.2 2.2 3.4 2.2 3.4s2.6-3.8 2.1-8z" fill="url(#bd-fire)"/><path d="M16 15c.6 2.4 3 3.2 3 5.8a3 3 0 0 1-6 0c0-1.8 1.6-2.4 3-5.8z" fill="#fff3b0" opacity=".85"/>`,
    heart: `<path d="M16 24.5s-8-5-8-11a4.5 4.5 0 0 1 8-2.6 4.5 4.5 0 0 1 8 2.6c0 6-8 11-8 11z" fill="url(#bd-rose)"/><path d="M11.5 12.2q1-1.6 2.6-1.4" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`
  };
  const badgeSVG = (b, cls) => BADGE_ART[b] ? `<svg class="nb-badge ${cls || ""} nb-b-${b}" viewBox="0 0 32 32" role="img" aria-label="${BADGES[b].name} badge"><title>${BADGES[b].name}: ${BADGES[b].desc}</title><circle cx="16" cy="16" r="15" fill="url(#bd-disc)"/><circle cx="16" cy="16" r="14.2" fill="none" stroke="url(#bd-rim)" stroke-width="1.3"/>${BADGE_ART[b]}</svg>` : "";

  /* ---------- state ---------- */
  const S = {
    me: null, uid: null, profile: null, setup: false, setup2: true, loaded: false, loading: false,
    people: new Map(), requests: [], outgoing: [], notes: [], cheers: new Map(),
    messages: [], awards: [], isAdmin: false, adminAwards: [],
    seg: "hood", draft: null, thread: null, sig: ""
  };
  try { S.seg = localStorage.getItem("orchard-social-seg") || "hood"; } catch (e) {}
  const friends = () => S.requests.filter(r => r.status === "accepted").map(r => S.people.get(r.from_id === S.uid ? r.to_id : r.from_id)).filter(Boolean);
  const incoming = () => S.requests.filter(r => r.status === "pending" && r.to_id === S.uid).map(r => ({ r, p: S.people.get(r.from_id) })).filter(x => x.p);
  const unreadFrom = id => S.messages.filter(m => m.to_id === S.uid && !m.read_at && (!id || m.from_id === id)).length;
  const badgesOf = id => S.awards.filter(a => a.user_id === id).sort((a, b) => BADGE_ORDER.indexOf(a.badge) - BADGE_ORDER.indexOf(b.badge));
  const badgeRow = (id, n) => badgesOf(id).slice(0, n || 3).map(a => badgeSVG(a.badge, "sm")).join("");

  /* ---------- flashcard log: how many cards you review each day ---------- */
  const cardLog = { days: {}, doc: null };
  (async () => {
    try {
      const me = await A.me(), db = await window.claude.use("db");
      cardLog.doc = db.doc(`data/users/${me.id}/cardlog`);
      cardLog.doc.onSnapshot(s => { const d = s.exists ? s.data() : null; cardLog.days = (d && d.days) || {}; }, () => {});
    } catch (e) {}
  })();
  let cardTimer = 0;
  if (typeof setBox === "function") {
    const orig = setBox;
    setBox = function () {
      const out = orig.apply(this, arguments);
      const k = iso(new Date());
      cardLog.days[k] = (cardLog.days[k] || 0) + 1;
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => {
        const keep = {}; Object.keys(cardLog.days).sort().slice(-60).forEach(d => (keep[d] = cardLog.days[d]));
        cardLog.days = keep;
        if (cardLog.doc) cardLog.doc.set({ days: keep }).catch(() => {});
        lastBeat = 0; heartbeat();
      }, 1500);
      return out;
    };
  }

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
    const cardsWeek = Object.entries(cardLog.days).filter(([k]) => k >= wk).reduce((a, [, n]) => a + n, 0);
    const mastered = typeof syl !== "undefined" ? Object.values(syl.cards || {}).filter(b => b >= 3).length : 0;
    return { weekMins, todayMins, streak, top: top ? top[0] : null, cardsWeek, cardsToday: cardLog.days[td] || 0, mastered, at: new Date().toISOString() };
  }

  /* ---------- loading ---------- */
  async function load(quiet) {
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
        const [rq, out, nt, ms, aw, adm] = await Promise.all([
          sb.from("friend_requests").select("*"),
          sb.rpc("my_outgoing"),
          sb.from("notes").select("id,user_id,body,created_at").order("created_at", { ascending: false }).limit(80),
          sb.from("messages").select("*").order("created_at", { ascending: false }).limit(600),
          sb.from("awards").select("*"),
          sb.rpc("is_admin")
        ]);
        S.requests = rq.data || [];
        S.outgoing = out.data || [];
        S.notes = (nt.data || []).filter(n => S.people.has(n.user_id));
        S.setup2 = !(ms.error && missingTable(ms.error));
        S.messages = (ms.data || []).reverse();
        S.awards = aw.data || [];
        S.isAdmin = !!adm.data;
        if (S.isAdmin) { const x = await sb.rpc("admin_awards"); S.adminAwards = x.data || []; }
        const ids = S.notes.map(n => n.id);
        S.cheers = new Map();
        if (ids.length) {
          const ch = await sb.from("cheers").select("note_id,user_id").in("note_id", ids);
          (ch.data || []).forEach(c => { const x = S.cheers.get(c.note_id) || { n: 0, mine: false }; x.n++; if (c.user_id === S.uid) x.mine = true; S.cheers.set(c.note_id, x); });
        }
      }
      S.loaded = true;
      const sig = JSON.stringify([[...S.people.values()].map(p => [p.id, p.display_name, p.handle, p.avatar, p.status, p.share_stats, p.stats && [p.stats.weekMins, p.stats.streak, p.stats.cardsWeek, p.stats.mastered], online(p)]),
        S.requests, S.outgoing, S.notes.map(n => n.id), [...S.cheers], S.messages.map(m => [m.id, !!m.read_at]), S.awards.map(a => a.id), S.isAdmin, S.adminAwards.map(a => a.id)]);
      if (sig !== S.sig || !root.querySelector(".page-head")) { S.sig = sig; if (!quiet || location.hash === "#social") render(); }
      heartbeat();
    } catch (e) {
      console.error(e);
      S.loaded = true;
      if (!S.profile) root.innerHTML = shell(`<div class="nb-empty"><h2>Couldn’t load Social</h2><p>${escH(e.message || "Please try again.")}</p><button class="primary" data-act="retry">Try again</button></div>`);
    } finally { S.loading = false; window.orchardNavRefresh && window.orchardNavRefresh(); }
  }

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
  function segs() {
    const list = [["hood", "The Neighbourhood"], ["messages", "Messages"], ["boards", "Leaderboards"], ["friends", "Friends"], ["profile", "Your neighbour"]];
    if (S.isAdmin) list.push(["admin", "Badges"]);
    return list;
  }
  function shell(body, withSegs) {
    const inc = S.profile ? incoming().length : 0, un = S.profile ? unreadFrom() : 0;
    const count = n => (n ? ` <span class="nb-count">${n}</span>` : "");
    return `<div class="page-head nb-head">
        <div><p class="eyebrow">Community</p><h1 class="page-title">Social</h1>
        <p class="page-sub">Revise alongside your friends. Message them, climb the leaderboards and keep your streaks alive together.</p></div>
        ${S.profile ? `<div class="nb-me">${badgeRow(S.uid, 4)}<span class="nb-me-av">${avatarSVG(S.profile.avatar)}</span><span><b>${escH(S.profile.display_name)}</b><span>@${escH(S.profile.handle)}</span></span></div>` : ""}
      </div>
      ${withSegs ? `<div class="seg nb-seg" role="tablist" aria-label="Social sections">${segs().map(([id, l]) => `<button type="button" role="tab" data-seg="${id}" aria-selected="${S.seg === id}">${l}${id === "friends" ? count(inc) : id === "messages" ? count(un) : ""}</button>`).join("")}</div>` : ""}
      ${body}`;
  }
  function render() {
    stopPlaza();
    if (!S.loaded) { root.innerHTML = shell(`<div class="nb-loading">Opening the gate…</div>`); return; }
    if (S.setup) {
      root.innerHTML = shell(`<div class="nb-empty"><h2>Social isn’t switched on yet</h2>
        <p>To turn it on, run <code>supabase-social-setup.sql</code> and then <code>supabase-social-2.sql</code> in your Supabase project (SQL Editor → New query → paste → Run), then reload this page.</p></div>`);
      return;
    }
    if (!S.profile) { renderOnboarding(); return; }
    if (!segs().some(([id]) => id === S.seg)) S.seg = "hood";
    const body = { friends: friendsHTML, profile: profileHTML, messages: messagesHTML, boards: boardsHTML, admin: adminHTML }[S.seg] || hoodHTML;
    root.innerHTML = shell(body(), true);
    if (S.seg === "hood" && location.hash === "#social") startPlaza();
    if (S.seg === "profile") wireEditor(root.querySelector(".nb-editor"));
    if (S.seg === "messages") afterMessages();
  }
  const needs2 = what => `<div class="nb-empty"><h2>${what} need one more step</h2><p>Run <code>supabase-social-2.sql</code> in your Supabase project (SQL Editor → New query → paste → Run), then reload.</p></div>`;

  /* ==========================================================================
     THE NEIGHBOURHOOD — a 3D plaza
     ========================================================================== */
  const TILES = [
    { id: "messages", label: "Messages", icon: "chat", x: -560, z: 1640, go: "seg:messages", hue: "#7fb7ff" },
    { id: "boards", label: "Leaderboards", icon: "trophy", x: -190, z: 1700, go: "seg:boards", hue: "#f4c34f" },
    { id: "board", label: "Notice board", icon: "pin", x: 190, z: 1680, go: "notice", hue: "#ff9a6b" },
    { id: "friends", label: "Friends", icon: "people", x: 560, z: 1630, go: "seg:friends", hue: "#7ed08a" },
    { id: "study", label: "Study log", icon: "clock", x: -450, z: 1080, go: "#study-log", hue: "#c3d48f" },
    { id: "cards", label: "Flashcards", icon: "cards", x: -150, z: 1140, go: "seg:boards", hue: "#c59bff" },
    { id: "ai", label: "AI tutor", icon: "spark", x: 150, z: 1110, go: "#ai", hue: "#8fe0ff" },
    { id: "you", label: "Your neighbour", icon: "smile", x: 450, z: 1070, go: "seg:profile", hue: "#ff8fb1" }
  ];
  const GUIDES = [
    { id: "g-hazel", display_name: "Hazel", handle: "guide", avatar: { c: 1, e: 1, m: 0, h: 5 }, guide: true, home: "ai",
      tips: ["Little and often beats one giant cram.", "Test yourself before you reread anything.", "Blurt a topic, then fill the gaps."] },
    { id: "g-rowan", display_name: "Rowan", handle: "guide", avatar: { c: 3, e: 0, m: 4, h: 3 }, guide: true, home: "study",
      tips: ["Phone in another room = twice the focus.", "25 minutes on, 5 off. Repeat.", "Past papers are the best revision there is."] },
    { id: "g-juniper", display_name: "Juniper", handle: "guide", avatar: { c: 6, e: 3, m: 1, h: 6 }, guide: true, home: "cards",
      tips: ["Sleep is when memories stick.", "Explain it out loud like you’re the teacher.", "Red topics first. Future you says thanks."] }
  ];
  const latestNote = id => S.notes.find(n => n.user_id === id && Date.now() - new Date(n.created_at).getTime() < 48 * 3600e3);
  function homeTile(p) {
    if (p.guide) return p.home;
    if (p.you) return "you";
    const st = p.stats || {};
    if (unreadFrom(p.id)) return "messages";
    if (online(p) && st.todayMins) return "study";
    if (st.cardsToday) return "cards";
    if (latestNote(p.id)) return "board";
    const h = [...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
    return ["boards", "friends", "study", "board", "ai", "cards"][h % 6];
  }

  let P = null; // plaza runtime
  function hoodHTML() {
    const fr = friends(), me = S.profile;
    const people = [{ ...me, you: true }, ...fr];
    const top = [...people].sort((a, b) => ((b.stats && b.stats.weekMins) || 0) - ((a.stats && a.stats.weekMins) || 0)).slice(0, 5);
    const onlineNow = fr.filter(online);
    return `
      <div class="nb-plaza" id="nb-plaza" role="region" aria-label="The Neighbourhood plaza. Drag to look around.">
        <canvas class="nb-floor" id="nb-floor"></canvas>
        <div class="nb-world" id="nb-world"></div>
        <div class="nb-hud">
          <span class="nb-chip"><i class="nb-live"></i>${onlineNow.length ? `${onlineNow.length} online` : "The Neighbourhood"}</span>
          <span class="nb-chip">${fr.length} friend${fr.length === 1 ? "" : "s"}</span>
        </div>
        <div class="nb-zoom" role="group" aria-label="Zoom">
          <button type="button" data-zoom="-1" aria-label="Zoom out">−</button>
          <span class="nb-zoom-dots">${[0, 1, 2, 3].map(i => `<i data-zi="${i}"></i>`).join("")}</span>
          <button type="button" data-zoom="1" aria-label="Zoom in">+</button>
        </div>
        <button type="button" class="nb-recentre" data-act="recentre" aria-label="Recentre the view" title="Recentre"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg></button>
        ${fr.length ? "" : `<div class="nb-hint"><b>It’s quiet here.</b> Add friends by their @handle and they’ll join the crowd. <button type="button" data-seg="friends">Add friends</button></div>`}
        <div class="nb-pop" id="nb-pop" hidden></div>
      </div>

      <div class="nb-cols" id="nb-notice">
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
            <div class="nb-card-head"><h3>This week</h3><button type="button" class="nb-link" data-seg="boards">All leaderboards</button></div>
            <ol class="nb-rank">${top.map((p, i) => rankRow(p, i, p.stats ? fmt(p.stats.weekMins || 0) : "–")).join("")}</ol>
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
    const c = S.cheers.get(n.id) || { n: 0, mine: false }, mine = n.user_id === S.uid;
    return `<li class="nb-note" data-note="${n.id}">
      <span class="nb-mini">${avatarSVG(p.avatar)}</span>
      <div class="nb-note-main">
        <div class="nb-note-head"><b>${escH(p.display_name)}</b>${badgeRow(p.id, 2)}<span>@${escH(p.handle)} · ${ago(n.created_at)}</span>
          ${mine ? `<button type="button" class="nb-x" data-act="del-note" data-id="${n.id}" aria-label="Delete note" title="Delete">×</button>` : ""}</div>
        <p>${escH(n.body)}</p>
        <button type="button" class="nb-cheer${c.mine ? " on" : ""}" data-act="cheer" data-id="${n.id}" aria-pressed="${c.mine}" ${mine ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-8c1.7 0 2.8 1.4 2.4 3l-.9 3.5H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>
          ${c.n ? `${c.n} cheer${c.n === 1 ? "" : "s"}` : "Cheer"}</button>
      </div></li>`;
  }
  const hidden = p => p.share_stats === false || !p.stats;
  const rankRow = (p, i, val, sub) => `<li class="${p.you ? "me" : ""}${i < 3 ? " podium p" + (i + 1) : ""}"><span class="nb-pos">${i < 3 ? `<i>${i + 1}</i>` : i + 1}</span><span class="nb-mini">${avatarSVG(p.avatar)}</span><span class="nb-who"><b>${escH(p.display_name)}${p.you ? " (you)" : ""}${badgeRow(p.id, 3)}</b><span>${sub != null ? sub : hidden(p) ? "Stats hidden" : `${(p.stats || {}).streak || 0}-day streak`}</span></span><em>${hidden(p) ? "–" : val}</em></li>`;

  function startPlaza() {
    const wrap = document.getElementById("nb-plaza"), cv = document.getElementById("nb-floor"), world = document.getElementById("nb-world");
    if (!wrap || !cv) return;
    const ctx = cv.getContext("2d");
    let zoomI = 1; try { const z = localStorage.getItem("orchard-plaza-zoom"); if (z !== null) zoomI = +z; } catch (e) {}
    const Z = [0.82, 1, 1.18, 1.38];
    P = { wrap, cv, ctx, world, W: 0, H: 0, dpr: 1, pan: 0, panV: 0, zoomI, zoom: Z[zoomI], zoomT: Z[zoomI], tiles: [], actors: [], raf: 0, t0: performance.now(), drag: null };
    const tileMap = {};
    P.tiles = TILES.map((t, i) => {
      const el = document.createElement("button");
      el.type = "button"; el.className = "nb-tile"; el.dataset.go = t.go; el.style.setProperty("--hue", t.hue);
      const n = t.id === "messages" ? unreadFrom() : t.id === "friends" ? incoming().length : 0;
      el.innerHTML = `<span class="nb-tile-face">${icon(t.icon, "nb-tile-ico")}<span class="nb-tile-shine"></span></span><span class="nb-tile-label">${t.label}</span>${n ? `<span class="nb-tile-n">${n}</span>` : ""}`;
      el.setAttribute("aria-label", t.label + (n ? ` (${n} new)` : ""));
      world.appendChild(el);
      const o = { ...t, el, phase: i * 0.9 };
      tileMap[t.id] = o;
      return o;
    });
    const list = [{ ...S.profile, you: true }, ...friends()];
    if (list.length < 6) GUIDES.forEach(g => list.push(g));
    const bubbles = document.createElement("div");
    bubbles.className = "nb-bubbles"; wrap.appendChild(bubbles);
    const placed = {};
    P.actors = list.map((p, i) => {
      const home = tileMap[homeTile(p)] || P.tiles[i % P.tiles.length];
      const k = (placed[home.id] = (placed[home.id] || 0) + 1);
      const ang = (k * 2.39996) + (i % 2) * 0.6, rad = 120 + (k % 3) * 34;
      const x = home.x + Math.cos(ang) * rad, z = home.z + Math.sin(ang) * rad * 0.55;
      const el = document.createElement("button");
      el.type = "button"; el.className = "nb-person" + (p.you ? " you" : "") + (p.guide ? " guide" : "");
      el.dataset.id = p.id;
      el.setAttribute("aria-label", `${p.display_name}${p.you ? " (you)" : p.guide ? " (guide)" : ""}`);
      const top = !p.guide && badgesOf(p.id)[0];
      el.innerHTML = `${top ? `<span class="nb-halo">${badgeSVG(top.badge)}</span>` : ""}<span class="nb-body">${avatarSVG(p.avatar)}</span><span class="nb-tag">${online(p) && !p.you ? '<i class="nb-dot"></i>' : ""}${escH(p.you ? "You" : p.display_name)}${p.guide ? "<em>Guide</em>" : ""}</span>`;
      world.appendChild(el);
      const bubble = document.createElement("span");
      bubble.className = "nb-bubble"; bubble.hidden = true;
      bubbles.appendChild(bubble);
      return { p, el, bubble, home, x, z, tx: x, tz: z, dir: 1, walking: false, wait: 800 + Math.random() * 3000, roam: 20000 + Math.random() * 40000 };
    });
    size();
    P.ro = new ResizeObserver(size); P.ro.observe(wrap);
    wireDrag();
    zoomDots();
    rotateBubbles();
    P.bubbles = setInterval(rotateBubbles, 6500);
    P.raf = requestAnimationFrame(frame);
  }
  function stopPlaza() { if (!P) return; cancelAnimationFrame(P.raf); clearInterval(P.bubbles); if (P.ro) P.ro.disconnect(); P = null; }
  function size() {
    if (!P) return;
    const r = P.wrap.getBoundingClientRect();
    P.dpr = Math.min(2, devicePixelRatio || 1);
    P.W = r.width; P.H = r.height;
    P.cv.width = Math.round(P.W * P.dpr); P.cv.height = Math.round(P.H * P.dpr);
    P.cv.style.width = P.W + "px"; P.cv.style.height = P.H + "px";
  }
  // Camera: a gentle look down onto the floor
  const CAMH = 560, ZFAR = 2300;
  function proj(x, z, h) {
    // Frame so the front row stands near the bottom and the back row mid-way up
    const F0 = Math.min(P.H * 1.55, Math.max(P.W * 0.78, P.H * 1.15));
    const F = F0 * P.zoom;
    const HY = P.H * 0.8 - CAMH * F / 1000;
    const k = F / z;
    return { sx: P.W / 2 + (x - P.pan) * k, sy: HY + (CAMH - (h || 0)) * k, k };
  }
  function frame(t) {
    if (!P) return;
    const dt = Math.min(64, t - (P.last || t)); P.last = t;
    const still = reduce();
    P.zoom += (P.zoomT - P.zoom) * 0.12;
    if (!P.drag) { P.pan += P.panV; P.panV *= 0.9; }
    P.pan = Math.max(-500, Math.min(500, P.pan));
    const pop = document.getElementById("nb-pop");
    const held = pop && !pop.hidden ? pop.dataset.id : null;
    P.actors.forEach(a => {
      if (still) return;
      if (held && String(a.p.id) === held) { a.walking = false; a.wait = Math.max(a.wait, 1500); return; }
      a.roam -= dt;
      if (a.roam <= 0 && !a.p.you) {
        const next = P.tiles[Math.floor(Math.random() * P.tiles.length)];
        a.home = next; a.roam = 30000 + Math.random() * 50000; a.wait = 0;
        const ang = Math.random() * Math.PI * 2, rad = 100 + Math.random() * 80;
        a.tx = next.x + Math.cos(ang) * rad; a.tz = next.z + Math.sin(ang) * rad * 0.55;
      }
      if (a.wait > 0) {
        a.wait -= dt;
        if (a.wait <= 0) { const ang = Math.random() * Math.PI * 2, rad = 100 + Math.random() * 80; a.tx = a.home.x + Math.cos(ang) * rad; a.tz = a.home.z + Math.sin(ang) * rad * 0.55; }
      } else {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz), v = 0.11 * dt;
        if (d < 3) { a.walking = false; a.wait = 3000 + Math.random() * 6000; a.dir = a.home.x > a.x ? 1 : -1; }
        else { a.x += dx / d * Math.min(v, d); a.z += dz / d * Math.min(v, d); a.walking = true; if (Math.abs(dx) > 1) a.dir = dx > 0 ? 1 : -1; }
      }
    });
    draw(t, still);
    P.raf = requestAnimationFrame(frame);
  }
  function draw(t, still) {
    const { ctx, W, H, dpr } = P, dk = dark();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (dk) { g.addColorStop(0, "#050604"); g.addColorStop(.45, "#0c0f08"); g.addColorStop(1, "#151a0f"); }
    else { g.addColorStop(0, "#e9eae4"); g.addColorStop(.5, "#f4f4f0"); g.addColorStop(1, "#ffffff"); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const step = 100, zN = 600, zF = ZFAR;
    ctx.lineWidth = 1;
    const c = dk ? "169,183,124" : "120,124,110";
    for (let gx = -2000; gx <= 2000; gx += step) {
      const a = proj(gx, zN), b = proj(gx, zF);
      const lg = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
      lg.addColorStop(0, `rgba(${c},${dk ? .22 : .28})`); lg.addColorStop(1, `rgba(${c},0)`);
      ctx.strokeStyle = lg; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    for (let gz = zN; gz <= zF; gz += step) {
      const a = proj(-2000, gz), b = proj(2000, gz), f = 1 - (gz - zN) / (zF - zN);
      ctx.strokeStyle = `rgba(${c},${(dk ? 0.2 : 0.26) * f})`;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    P.tiles.forEach(tl => {
      const p = proj(tl.x, tl.z), r = 260 * p.k;
      ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.42);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, dk ? "rgba(169,183,124,.16)" : "rgba(255,255,255,.95)"); rg.addColorStop(1, dk ? "rgba(169,183,124,0)" : "rgba(255,255,255,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    const shadow = (x, z, w, a) => { const p = proj(x, z); ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.32); ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.arc(0, 0, w * p.k, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
    P.tiles.forEach(tl => shadow(tl.x, tl.z, 62, dk ? .55 : .12));
    P.actors.forEach(a => shadow(a.x, a.z, 26, dk ? .5 : .16));
    const vg = ctx.createRadialGradient(W / 2, H * .55, Math.min(W, H) * .35, W / 2, H * .55, Math.max(W, H) * .75);
    vg.addColorStop(0, dk ? "rgba(0,0,0,0)" : "rgba(80,84,70,0)"); vg.addColorStop(1, dk ? "rgba(0,0,0,.55)" : "rgba(80,84,70,.12)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    const tt = (t - P.t0) / 1000;
    P.tiles.forEach(tl => {
      const bob = still ? 0 : Math.sin(tt * 1.1 + tl.phase) * 9;
      const p = proj(tl.x, tl.z, 150 + bob);
      tl.el.style.transform = `translate(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px) translate(-50%, -50%) scale(${p.k.toFixed(3)})`;
      tl.el.style.zIndex = String(Math.round(5000 - tl.z + 60));
    });
    P.actors.forEach(a => {
      const p = proj(a.x, a.z);
      a.el.style.transform = `translate(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px) translate(-50%, -100%) scale(${p.k.toFixed(3)})`;
      a.el.style.setProperty("--k", p.k.toFixed(3));
      a.el.style.setProperty("--dir", a.dir);
      a.el.style.zIndex = String(Math.round(5000 - a.z));
      a.el.classList.toggle("walking", a.walking);
      a.sx = p.sx; a.sy = p.sy; a.k = p.k;
      if (!a.bubble.hidden) {
        const bw = a.bubble.offsetWidth, bh = a.bubble.offsetHeight;
        const bx = Math.min(Math.max(p.sx - bw / 2, 8), P.W - bw - 8);
        const by = Math.max(8, p.sy - 104 * p.k - (a.el.querySelector(".nb-halo") ? 30 * p.k : 0) - 8 - bh);
        a.bubble.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
        a.bubble.style.setProperty("--tail", `${Math.min(Math.max(p.sx - bx, 14), bw - 14).toFixed(0)}px`);
      }
    });
    const pop = document.getElementById("nb-pop");
    if (pop && !pop.hidden && pop.dataset.id) {
      const a = P.actors.find(x => String(x.p.id) === pop.dataset.id);
      if (a) {
        const pw = pop.offsetWidth, ph = pop.offsetHeight, head = a.sy - 110 * a.k;
        const above = head - ph - 10 >= 10;
        const top = above ? head - ph - 10 : Math.min(a.sy + 12, P.H - ph - 10);
        pop.style.left = `${Math.min(Math.max(a.sx - pw / 2, 10), P.W - pw - 10)}px`;
        pop.style.top = `${Math.max(10, top)}px`;
      }
    }
  }
  function wireDrag() {
    const w = P.wrap;
    w.addEventListener("pointerdown", e => {
      if (!P || e.target.closest("button, .nb-pop")) return;
      P.drag = { x: e.clientX, pan: P.pan, last: e.clientX };
      w.setPointerCapture(e.pointerId); w.classList.add("dragging");
    });
    w.addEventListener("pointermove", e => {
      if (!P || !P.drag) return;
      const k = proj(0, 1200).k;
      P.pan = P.drag.pan - (e.clientX - P.drag.x) / k;
      P.panV = -(e.clientX - P.drag.last) / k * 0.6; P.drag.last = e.clientX;
    });
    const end = () => { if (P) P.drag = null; w.classList.remove("dragging"); };
    w.addEventListener("pointerup", end); w.addEventListener("pointercancel", end);
    w.addEventListener("wheel", e => { if (!P || !(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(P.zoomI + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  }
  function setZoom(i) {
    if (!P) return;
    P.zoomI = Math.max(0, Math.min(3, i)); P.zoomT = [0.82, 1, 1.18, 1.38][P.zoomI];
    try { localStorage.setItem("orchard-plaza-zoom", P.zoomI); } catch (e) {}
    zoomDots();
  }
  const zoomDots = () => { if (P) document.querySelectorAll(".nb-zoom-dots i").forEach(d => d.classList.toggle("on", +d.dataset.zi === P.zoomI)); };
  let tipIdx = 0;
  function rotateBubbles() {
    if (!P) return;
    tipIdx++;
    const talkers = P.actors.filter(a => a.p.guide || latestNote(a.p.id));
    const pick = new Set();
    for (let i = 0; i < Math.min(P.W < 640 ? 1 : 3, talkers.length); i++) pick.add(talkers[(tipIdx + i) % talkers.length]);
    P.actors.forEach(a => {
      const b = a.bubble;
      if (pick.has(a)) { b.textContent = a.p.guide ? a.p.tips[tipIdx % a.p.tips.length] : latestNote(a.p.id).body; b.hidden = false; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
      else b.hidden = true;
    });
  }
  function showPop(id) {
    const pop = document.getElementById("nb-pop"); if (!pop || !P) return;
    const a = P.actors.find(x => String(x.p.id) === String(id)); if (!a) return;
    const p = a.p, st = p.stats || {}, note = latestNote(p.id) || S.notes.find(n => n.user_id === p.id);
    const c = note ? S.cheers.get(note.id) || { n: 0, mine: false } : null;
    const bs = p.guide ? [] : badgesOf(p.id);
    pop.dataset.id = String(p.id);
    pop.innerHTML = `<button type="button" class="nb-pop-x" data-act="close-pop" aria-label="Close">×</button>
      <div class="nb-pop-top"><span class="nb-pop-av">${avatarSVG(p.avatar)}</span><div><b>${escH(p.display_name)}${p.you ? " (you)" : ""}</b>
        <span>${p.guide ? "Neighbourhood guide" : "@" + escH(p.handle)}${online(p) && !p.you ? ' · <i class="nb-dot"></i>Online' : ""}</span>
        ${p.status ? `<span class="nb-pop-status">${escH(p.status)}</span>` : ""}</div></div>
      ${bs.length ? `<div class="nb-pop-badges">${bs.map(x => `<span title="${escH(x.note || BADGES[x.badge].desc)}">${badgeSVG(x.badge)}<b>${BADGES[x.badge].name}</b></span>`).join("")}</div>` : ""}
      ${p.guide ? `<p class="nb-pop-note">Guides keep the plaza lively until your friends move in. Add friends and they’ll join the crowd.</p>`
        : `${hidden(p) ? `<p class="o-dim o-small">Study stats are hidden.</p>` : `<div class="nb-pop-stats"><div><b>${fmt(st.weekMins || 0)}</b><span>This week</span></div><div><b>${st.streak || 0}</b><span>Day streak</span></div><div><b>${st.cardsWeek || 0}</b><span>Cards this week</span></div></div>`}
          ${note ? `<p class="nb-pop-note">“${escH(note.body)}”<span>${ago(note.created_at)}</span></p>` : ""}
          <div class="nb-pop-act">${p.you ? `<button type="button" class="chip sm" data-seg="profile">Edit your neighbour</button>` : `<button type="button" class="primary" data-act="dm" data-id="${p.id}">Message</button>${note ? `<button type="button" class="nb-cheer${c.mine ? " on" : ""}" data-act="cheer" data-id="${note.id}" aria-pressed="${c.mine}">${c.mine ? "Cheered" : "Cheer"}</button>` : ""}`}</div>`}`;
    pop.hidden = false;
  }

  /* ==========================================================================
     MESSAGES
     ========================================================================== */
  function convos() {
    return friends().map(p => {
      const msgs = S.messages.filter(m => m.from_id === p.id || m.to_id === p.id);
      return { p, last: msgs[msgs.length - 1], unread: unreadFrom(p.id) };
    }).sort((a, b) => (b.last ? b.last.created_at : "").localeCompare(a.last ? a.last.created_at : "") || a.p.display_name.localeCompare(b.p.display_name));
  }
  function messagesHTML() {
    if (!S.setup2) return needs2("Messages");
    const list = convos();
    if (!list.length) return `<div class="nb-empty"><h2>No one to message yet</h2><p>You can message friends once they’ve accepted your request.</p><button class="primary" data-seg="friends">Add friends</button></div>`;
    if (!S.thread || !list.some(c => c.p.id === S.thread)) S.thread = list[0].p.id;
    const p = S.people.get(S.thread);
    const msgs = S.messages.filter(m => m.from_id === p.id || m.to_id === p.id);
    let lastDay = "";
    const items = msgs.map(m => {
      const d = new Date(m.created_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      const sep = d !== lastDay ? `<li class="nb-day"><span>${d}</span></li>` : ""; lastDay = d;
      const mine = m.from_id === S.uid;
      return `${sep}<li class="nb-msg ${mine ? "mine" : "theirs"}" data-mid="${m.id}"><p>${escH(m.body).replace(/\n/g, "<br>")}</p><span>${clock(m.created_at)}${mine ? (m.read_at ? " · Seen" : " · Sent") : ""}</span>${mine ? `<button type="button" class="nb-unsend" data-act="unsend" data-id="${m.id}" title="Unsend">Unsend</button>` : ""}</li>`;
    }).join("");
    return `<div class="nb-dm">
      <aside class="nb-dm-list" aria-label="Conversations">
        ${list.map(c => `<button type="button" class="nb-dm-item${c.p.id === S.thread ? " on" : ""}" data-thread="${c.p.id}">
          <span class="nb-mini">${avatarSVG(c.p.avatar)}${online(c.p) ? '<i class="nb-dot nb-dot-av"></i>' : ""}</span>
          <span class="nb-who"><b>${escH(c.p.display_name)}${badgeRow(c.p.id, 2)}</b><span>${c.last ? `${c.last.from_id === S.uid ? "You: " : ""}${escH(c.last.body.slice(0, 48))}` : "Say hello"}</span></span>
          <span class="nb-dm-meta">${c.last ? `<span>${ago(c.last.created_at)}</span>` : ""}${c.unread ? `<span class="nb-count">${c.unread}</span>` : ""}</span>
        </button>`).join("")}
      </aside>
      <section class="nb-dm-thread" aria-label="Conversation with ${escH(p.display_name)}">
        <header class="nb-dm-head"><span class="nb-mini">${avatarSVG(p.avatar)}</span><span class="nb-who"><b>${escH(p.display_name)}${badgeRow(p.id, 3)}</b><span>${online(p) ? '<i class="nb-dot"></i> Online now' : p.last_seen ? `Active ${ago(p.last_seen)}` : "@" + escH(p.handle)}</span></span></header>
        <ol class="nb-dm-msgs" id="nb-dm-msgs">${items || `<li class="nb-dm-empty">This is the start of your conversation with ${escH(p.display_name)}.</li>`}</ol>
        <form class="nb-dm-compose" id="nb-dm-compose"><textarea id="nb-dm-text" rows="1" maxlength="500" placeholder="Message ${escH(p.display_name)}…" aria-label="Message ${escH(p.display_name)}"></textarea><button class="primary" type="submit">Send</button></form>
        <p class="nb-dm-note">Messages are private between you and ${escH(p.display_name)}. Be kind. Removing a friend stops messages.</p>
      </section></div>`;
  }
  async function afterMessages() {
    const box = document.getElementById("nb-dm-msgs"); if (box) box.scrollTop = box.scrollHeight;
    if (S.thread && unreadFrom(S.thread)) {
      const r = await sb.rpc("mark_read", { friend: S.thread });
      if (!r.error) {
        S.messages.forEach(m => { if (m.from_id === S.thread && m.to_id === S.uid && !m.read_at) m.read_at = new Date().toISOString(); });
        window.orchardNavRefresh && window.orchardNavRefresh();
        const seg = root.querySelector('.nb-seg [data-seg="messages"] .nb-count'); if (seg && !unreadFrom()) seg.remove();
        root.querySelector(`.nb-dm-item[data-thread="${S.thread}"] .nb-count`)?.remove();
      }
    }
  }

  /* ==========================================================================
     LEADERBOARDS
     ========================================================================== */
  function boardsHTML() {
    const people = [{ ...S.profile, you: true }, ...friends()];
    const board = (title, desc, val, show, sub) => {
      const sorted = [...people].sort((a, b) => (hidden(b) ? -1 : val(b)) - (hidden(a) ? -1 : val(a)));
      const leader = sorted.find(p => !hidden(p) && val(p) > 0);
      return `<section class="o-card nb-lb"><div class="nb-lb-head"><div><h3>${title}</h3><p class="o-dim">${desc}</p></div>${leader ? `<span class="nb-lb-lead" title="Leader">${badgeSVG("crown", "sm")}${escH(leader.you ? "You" : leader.display_name)}</span>` : ""}</div>
        <ol class="nb-rank">${sorted.map((p, i) => rankRow(p, i, show(p), sub ? sub(p) : undefined)).join("")}</ol></section>`;
    };
    const st = p => p.stats || {};
    return `<div class="nb-boards">
      ${board("Flashcards this week", "Cards reviewed in the last 7 days", p => st(p).cardsWeek || 0, p => (st(p).cardsWeek || 0).toLocaleString("en-GB"), p => hidden(p) ? "Stats hidden" : `${st(p).cardsToday || 0} today`)}
      ${board("Cards mastered", "Flashcards in box 3 or above", p => st(p).mastered || 0, p => (st(p).mastered || 0).toLocaleString("en-GB"), p => hidden(p) ? "Stats hidden" : `${st(p).cardsWeek || 0} reviewed this week`)}
      ${board("Study time this week", "From the Study log", p => st(p).weekMins || 0, p => fmt(st(p).weekMins || 0))}
      ${board("Longest streak", "Days in a row with study logged", p => st(p).streak || 0, p => `${st(p).streak || 0}d`, p => hidden(p) ? "Stats hidden" : (st(p).top ? escH(st(p).top) : "–"))}
    </div>
    <p class="o-dim o-small nb-lb-foot">Leaderboards show you and your friends. Stats update a couple of minutes after you study. Turn sharing off in Your neighbour.</p>`;
  }

  /* ==========================================================================
     BADGES (admins only)
     ========================================================================== */
  let awardTarget = null, awardBadge = "crown";
  function adminHTML() {
    if (!S.setup2) return needs2("Badges");
    return `<div class="nb-admin">
      <section class="o-card nb-give"><h3>Give a badge</h3>
        <form id="nb-award-find" class="nb-find"><span class="nb-at">@</span><input class="input" name="h" placeholder="their handle" autocomplete="off" autocapitalize="none" spellcheck="false" required value="${awardTarget ? escH(awardTarget.handle) : ""}"><button class="chip" type="submit">Find</button></form>
        <div id="nb-award-who">${awardTarget ? `<ul class="nb-list">${personRow(awardTarget, "")}</ul>` : ""}</div>
        <div class="nb-badge-pick" role="radiogroup" aria-label="Badge">${BADGE_ORDER.map(b => `<button type="button" role="radio" aria-checked="${awardBadge === b}" data-badge="${b}">${badgeSVG(b, "lg")}<b>${BADGES[b].name}</b><span>${BADGES[b].desc}</span></button>`).join("")}</div>
        <form id="nb-award" class="nb-award"><input class="input" name="note" maxlength="80" placeholder="Why? (optional, they’ll see this)"><button class="primary" type="submit" ${awardTarget ? "" : "disabled"}>Give ${BADGES[awardBadge].name}</button></form>
      </section>
      <section class="o-card"><h3>Badges given <span class="o-dim">${S.adminAwards.length}</span></h3>
        ${S.adminAwards.length ? `<ul class="nb-list">${S.adminAwards.map(a => `<li class="nb-row">${badgeSVG(a.badge, "md")}<span class="nb-who"><b>${escH(a.display_name)} <span class="o-dim">@${escH(a.handle)}</span></b><span>${BADGES[a.badge] ? BADGES[a.badge].name : escH(a.badge)}${a.note ? " · " + escH(a.note) : ""} · ${ago(a.created_at)}</span></span><span class="nb-row-act"><button class="chip sm" data-act="revoke" data-id="${a.id}">Take back</button></span></li>`).join("")}</ul>` : `<p class="o-dim">None yet.</p>`}
      </section></div>`;
  }

  /* ==========================================================================
     FRIENDS + PROFILE + ONBOARDING
     ========================================================================== */
  function friendsHTML() {
    const fr = friends(), inc = incoming();
    return `<div class="nb-friends">
      <section class="o-card nb-add">
        <h3>Add a friend</h3>
        <form id="nb-find" class="nb-find"><span class="nb-at">@</span><input class="input" name="h" placeholder="their handle" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="21" required><button class="primary" type="submit">Find</button></form>
        <div id="nb-found"></div>
        <p class="o-dim o-small">Your handle is <b>@${escH(S.profile.handle)}</b>. Only people you accept can see your notes, stats or message you.</p>
      </section>
      ${inc.length ? `<section class="o-card"><h3>Requests <span class="nb-count">${inc.length}</span></h3><ul class="nb-list">${inc.map(({ r, p }) => personRow(p, `<button class="primary" data-act="accept" data-id="${r.id}">Accept</button><button class="chip" data-act="decline" data-id="${r.id}">Decline</button>`)).join("")}</ul></section>` : ""}
      ${S.outgoing.length ? `<section class="o-card"><h3>Sent</h3><ul class="nb-list">${S.outgoing.map(o => personRow(o, `<span class="o-dim o-small">Waiting</span><button class="chip" data-act="cancel" data-id="${o.request_id}">Cancel</button>`)).join("")}</ul></section>` : ""}
      <section class="o-card nb-flist"><h3>Friends <span class="o-dim">${fr.length}</span></h3>
        ${fr.length ? `<ul class="nb-grid">${fr.map(p => {
          const st = p.stats || {};
          return `<li class="nb-fcard"><span class="nb-fav">${avatarSVG(p.avatar)}</span><b>${online(p) ? '<i class="nb-dot"></i>' : ""}${escH(p.display_name)}</b><span class="nb-fbadges">${badgeRow(p.id, 6)}</span><span class="o-dim">@${escH(p.handle)}</span>
            ${p.status ? `<span class="nb-fstatus">${escH(p.status)}</span>` : ""}
            <span class="nb-fstats">${hidden(p) ? "Stats hidden" : `${fmt(st.weekMins || 0)} this week · ${st.streak || 0}-day streak`}</span>
            <button type="button" class="chip sm nb-fmsg" data-act="dm" data-id="${p.id}">Message</button>
            <button type="button" class="nb-x nb-remove" data-act="remove" data-id="${p.id}" aria-label="Remove ${escH(p.display_name)}" title="Remove friend">×</button></li>`;
        }).join("")}</ul>` : `<p class="o-dim">No friends yet. Ask yours for their @handle, or send them yours.</p>`}
      </section></div>`;
  }
  const personRow = (p, actions) => `<li class="nb-row"><span class="nb-mini">${avatarSVG(p.avatar)}</span><span class="nb-who"><b>${escH(p.display_name)}</b><span>@${escH(p.handle)}</span></span><span class="nb-row-act">${actions}</span></li>`;

  function editorHTML(p, first) {
    const av = { ...DEFAULT_AV, ...((p && p.avatar) || {}) };
    S.draft = av;
    const row = (key, label, items, swatch) => `<div class="nb-opt"><span>${label}</span><div class="nb-opts" data-key="${key}">${items.map((it, i) => swatch
      ? `<button type="button" class="nb-sw" style="--c:${it}" data-v="${i}" aria-pressed="${av[key] === i}" aria-label="Colour ${i + 1}"></button>`
      : `<button type="button" class="chip sm" data-v="${i}" aria-pressed="${av[key] === i}">${it}</button>`).join("")}</div></div>`;
    const mine = p ? badgesOf(p.id) : [];
    return `<form class="nb-editor" novalidate>
      <div class="nb-ed-preview"><div class="nb-ed-stage">${avatarSVG(av, "big")}</div><button type="button" class="chip sm" data-act="shuffle">Shuffle</button>
        ${mine.length ? `<div class="nb-ed-badges">${mine.map(x => `<span title="${escH(x.note || BADGES[x.badge].desc)}">${badgeSVG(x.badge, "md")}<b>${BADGES[x.badge].name}</b></span>`).join("")}</div>` : ""}</div>
      <div class="nb-ed-form">
        <div class="nb-ed-fields">
          <label class="field"><span>Name your friends see</span><input class="input" name="name" maxlength="40" required value="${escH(p ? p.display_name : (S.me.name || "").split(" ")[0])}"></label>
          <label class="field"><span>Handle</span><div class="nb-hwrap"><span>@</span><input class="input" name="handle" maxlength="20" required pattern="[a-z0-9_]{3,20}" autocapitalize="none" spellcheck="false" value="${escH(p ? p.handle : suggestHandle())}"></div></label>
          <label class="field nb-wide"><span>Status <em class="o-dim">optional</em></span><input class="input" name="status" maxlength="80" placeholder="e.g. Grinding through Chemistry Paper 1" value="${escH(p && p.status || "")}"></label>
        </div>
        ${row("c", "Colour", COLOURS, true)}${row("e", "Eyes", EYES)}${row("m", "Mouth", MOUTHS)}${row("h", "Extra", HATS)}
        <label class="nb-toggle"><input type="checkbox" name="share" ${!p || p.share_stats ? "checked" : ""}><span><b>Share my study stats with friends</b><span class="o-dim">Time this week, streak, top subject and flashcard counts. Never your notes, grades or ratings.</span></span></label>
        <p class="acct-err nb-err" role="alert"></p>
        <div class="nb-ed-actions"><button class="primary" type="submit">${first ? "Move in" : "Save changes"}</button></div>
      </div></form>`;
  }
  function suggestHandle() { return ((S.me.name || "neighbour").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "neighbour") + Math.floor(Math.random() * 90 + 10); }
  function profileHTML() { return `<section class="o-card nb-profile"><h3>Your neighbour</h3>${editorHTML(S.profile)}</section>`; }
  function renderOnboarding() {
    root.innerHTML = shell(`<div class="nb-welcome">
      <div class="nb-welcome-art"><div class="nb-welcome-grid"></div>
        ${TILES.slice(0, 6).map((t, i) => `<span class="nb-tile nb-tile-static" style="--hue:${t.hue};left:${[14, 38, 62, 86, 26, 74][i]}%;top:${[28, 20, 20, 28, 58, 58][i]}%"><span class="nb-tile-face">${icon(t.icon, "nb-tile-ico")}<span class="nb-tile-shine"></span></span></span>`).join("")}
        ${GUIDES.map((g, i) => `<span class="nb-person nb-static" style="left:${[20, 50, 80][i]}%;top:${[94, 90, 94][i]}%"><span class="nb-body">${avatarSVG(g.avatar)}</span><span class="nb-tag">${g.display_name}<em>Guide</em></span></span>`).join("")}
      </div>
      <section class="o-card nb-welcome-card"><h2>Move into The Neighbourhood</h2>
        <p class="o-dim">Make your neighbour, pick a handle and you’re in. Friends add you by your handle, and only friends can see what you share or message you.</p>
        ${editorHTML(null, true)}</section></div>`);
    wireEditor(root.querySelector(".nb-editor"), true);
  }
  const rnd = n => Math.floor(Math.random() * n);
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
      row.stats = row.share_stats ? myStats() : null;
      row.last_seen = new Date().toISOString();
      btn.disabled = true;
      const r = first ? await sb.from("profiles").insert(row) : await sb.from("profiles").update(row).eq("id", S.uid);
      btn.disabled = false;
      if (r.error) { err.textContent = /duplicate|unique/i.test(r.error.message) ? `@${handle} is taken. Try another.` : r.error.message; return; }
      say(first ? "Welcome to the neighbourhood!" : "Saved.");
      if (first) S.seg = "hood";
      S.sig = ""; await load();
    });
  }

  /* ==========================================================================
     ACTIONS
     ========================================================================== */
  function go(seg) { S.seg = seg; try { localStorage.setItem("orchard-social-seg", seg); } catch (x) {} render(); window.scrollTo(0, 0); }
  root.addEventListener("click", async e => {
    const seg = e.target.closest("[data-seg]");
    if (seg) { go(seg.dataset.seg); return; }
    const tile = e.target.closest(".nb-tile[data-go]");
    if (tile) {
      const g = tile.dataset.go;
      if (g.startsWith("seg:")) go(g.slice(4));
      else if (g === "notice") document.getElementById("nb-notice")?.scrollIntoView({ behavior: reduce() ? "auto" : "smooth" });
      else location.hash = g;
      return;
    }
    const person = e.target.closest(".nb-person:not(.nb-static)");
    if (person) { showPop(person.dataset.id); return; }
    const zb = e.target.closest("[data-zoom]");
    if (zb && P) { setZoom(P.zoomI + +zb.dataset.zoom); return; }
    const th = e.target.closest("[data-thread]");
    if (th) { S.thread = th.dataset.thread; render(); return; }
    const pb = e.target.closest("[data-badge]");
    if (pb) { awardBadge = pb.dataset.badge; render(); return; }
    const preset = e.target.closest("[data-preset]");
    if (preset) { const t = document.getElementById("nb-note"); t.value = preset.dataset.preset; t.dispatchEvent(new Event("input", { bubbles: true })); t.focus(); return; }
    const a = e.target.closest("[data-act]");
    if (!a) { if (!e.target.closest("#nb-pop")) { const p = document.getElementById("nb-pop"); if (p) p.hidden = true; } return; }
    const act = a.dataset.act, id = a.dataset.id;
    try {
      if (act === "retry") return load();
      if (act === "close-pop") { document.getElementById("nb-pop").hidden = true; return; }
      if (act === "recentre") { if (P) { P.pan = 0; P.panV = 0; setZoom(1); } return; }
      if (act === "dm") { S.thread = id; go("messages"); setTimeout(() => document.getElementById("nb-dm-text")?.focus(), 50); return; }
      if (act === "copy") { const text = `Add me on The Orchard: @${S.profile.handle}`; try { await navigator.clipboard.writeText(text); say("Copied. Send it to a friend."); } catch (x) { say(text); } return; }
      if (act === "cheer") {
        const c = S.cheers.get(+id) || { n: 0, mine: false };
        const r = c.mine ? await sb.from("cheers").delete().eq("note_id", +id).eq("user_id", S.uid) : await sb.from("cheers").insert({ note_id: +id, user_id: S.uid });
        if (r.error) throw r.error; return load();
      }
      if (act === "del-note") { if (!confirm("Delete this note?")) return; const r = await sb.from("notes").delete().eq("id", +id); if (r.error) throw r.error; return load(); }
      if (act === "unsend") { if (!confirm("Unsend this message?")) return; const r = await sb.from("messages").delete().eq("id", +id); if (r.error) throw r.error; S.messages = S.messages.filter(m => m.id !== +id); render(); return; }
      if (act === "accept") { const r = await sb.rpc("accept_request", { req: +id }); if (r.error) throw r.error; say("You’re now friends."); return load(); }
      if (act === "decline" || act === "cancel") { const r = await sb.from("friend_requests").delete().eq("id", +id); if (r.error) throw r.error; return load(); }
      if (act === "remove") {
        const p = S.people.get(id);
        if (!confirm(`Remove ${p ? p.display_name : "this friend"}? They won’t see your notes or stats, and you won’t be able to message each other.`)) return;
        const rq = S.requests.find(r => r.status === "accepted" && (r.from_id === id || r.to_id === id));
        if (rq) { const r = await sb.from("friend_requests").delete().eq("id", rq.id); if (r.error) throw r.error; }
        return load();
      }
      if (act === "send") {
        const r = await sb.rpc("send_request", { target: id }); if (r.error) throw r.error;
        say({ sent: "Request sent.", accepted: "They’d already asked you, so you’re now friends!", already_sent: "You’ve already asked them.", already_friends: "You’re already friends." }[r.data] || "Done.");
        document.getElementById("nb-found").innerHTML = ""; return load();
      }
      if (act === "revoke") { if (!confirm("Take this badge back?")) return; const r = await sb.from("awards").delete().eq("id", +id); if (r.error) throw r.error; say("Badge taken back."); S.sig = ""; return load(); }
    } catch (x) { say(x.message || "Something went wrong."); }
  });
  root.addEventListener("input", e => {
    if (e.target.id === "nb-note") { const l = document.getElementById("nb-left"); if (l) { l.textContent = 140 - e.target.value.length; l.classList.toggle("low", e.target.value.length > 120); } }
    if (e.target.id === "nb-dm-text") { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }
  });
  root.addEventListener("keydown", e => {
    if (e.target.id === "nb-note" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.getElementById("nb-compose").requestSubmit(); }
    if (e.target.id === "nb-dm-text" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById("nb-dm-compose").requestSubmit(); }
  });
  root.addEventListener("submit", async e => {
    const id = e.target.id;
    if (id === "nb-compose") {
      e.preventDefault();
      const t = document.getElementById("nb-note"), body = t.value.trim(); if (!body) return;
      const btn = e.target.querySelector('[type="submit"]'); btn.disabled = true;
      const r = await sb.from("notes").insert({ body, user_id: S.uid }); btn.disabled = false;
      if (r.error) { say(/row-level security/i.test(r.error.message) ? "You’ve posted a lot today. Try again tomorrow." : r.error.message); return; }
      t.value = ""; say("Posted to the board."); return load();
    }
    if (id === "nb-dm-compose") {
      e.preventDefault();
      const t = document.getElementById("nb-dm-text"), body = t.value.trim(); if (!body || !S.thread) return;
      const btn = e.target.querySelector('[type="submit"]'); btn.disabled = true;
      const r = await sb.from("messages").insert({ from_id: S.uid, to_id: S.thread, body });
      btn.disabled = false;
      if (r.error) { say(/row-level security/i.test(r.error.message) ? "Couldn’t send. You can only message friends, and there’s a limit of 120 messages an hour." : r.error.message); return; }
      t.value = ""; await refreshMessages(true); document.getElementById("nb-dm-text")?.focus();
      return;
    }
    if (id === "nb-find" || id === "nb-award-find") {
      e.preventDefault();
      const h = e.target.h.value.trim().replace(/^@/, "").toLowerCase();
      const out = document.getElementById(id === "nb-find" ? "nb-found" : "nb-award-who");
      if (!h) return;
      const r = await sb.rpc("find_profile", { h });
      const p = (r.data || [])[0];
      if (r.error) { out.innerHTML = `<p class="acct-err">${escH(r.error.message)}</p>`; return; }
      if (!p) { out.innerHTML = `<p class="o-dim nb-nf">No one has the handle @${escH(h)}. Check the spelling.</p>`; if (id === "nb-award-find") { awardTarget = null; root.querySelector('#nb-award [type="submit"]').disabled = true; } return; }
      if (id === "nb-award-find") { awardTarget = p; out.innerHTML = `<ul class="nb-list">${personRow(p, "")}</ul>`; root.querySelector('#nb-award [type="submit"]').disabled = false; return; }
      if (p.id === S.uid) { out.innerHTML = `<p class="o-dim nb-nf">That’s you!</p>`; return; }
      const isF = friends().some(f => f.id === p.id);
      out.innerHTML = `<ul class="nb-list">${personRow(p, isF ? `<span class="o-dim o-small">Already friends</span>` : `<button class="primary" data-act="send" data-id="${p.id}">Send request</button>`)}</ul>`;
      return;
    }
    if (id === "nb-award") {
      e.preventDefault();
      if (!awardTarget) return;
      const note = e.target.note.value.trim().slice(0, 80) || null;
      const r = await sb.from("awards").insert({ user_id: awardTarget.id, badge: awardBadge, note, awarded_by: S.uid });
      if (r.error) { say(/duplicate|unique/i.test(r.error.message) ? `${awardTarget.display_name} already has that badge.` : r.error.message); return; }
      say(`${BADGES[awardBadge].name} given to ${awardTarget.display_name}.`);
      awardTarget = null; S.sig = ""; return load();
    }
  });
  async function refreshMessages(force) {
    if (!S.profile || !S.setup2) return;
    const ms = await sb.from("messages").select("*").order("created_at", { ascending: false }).limit(600);
    if (ms.error) return;
    const next = (ms.data || []).reverse();
    const changed = force || JSON.stringify(next.map(m => [m.id, !!m.read_at])) !== JSON.stringify(S.messages.map(m => [m.id, !!m.read_at]));
    S.messages = next;
    if (changed && S.seg === "messages" && location.hash === "#social") {
      const draft = document.getElementById("nb-dm-text"), txt = draft ? draft.value : "", focused = document.activeElement === draft;
      render();
      const d = document.getElementById("nb-dm-text"); if (d) { d.value = txt; if (focused) d.focus(); }
    }
    window.orchardNavRefresh && window.orchardNavRefresh();
  }

  /* ---------- lifecycle ---------- */
  let poll = 0, fast = 0;
  function onRoute() {
    const here = location.hash === "#social";
    clearInterval(poll); clearInterval(fast);
    if (here) {
      if (!S.loaded || !root.querySelector(".page-head")) render();
      else if (S.seg === "hood" && !P) startPlaza();
      load();
      poll = setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector(".nb-editor:focus-within, #nb-compose:focus-within, .nb-admin:focus-within, .nb-dm:focus-within")) load(true); }, 30000);
      fast = setInterval(() => { if (document.visibilityState === "visible" && S.seg === "messages") refreshMessages(); }, 6000);
    } else stopPlaza();
  }
  addEventListener("hashchange", onRoute);
  onRoute();
  setTimeout(() => { if (!S.loaded) load(true); }, 4000);
  setInterval(() => { if (location.hash !== "#social" && document.visibilityState === "visible" && S.profile) refreshMessages(); }, 45000);

  window.orchardSocial = {
    badge: () => { if (!S.profile) return ""; const n = incoming().length + unreadFrom(); return n ? String(n) : ""; },
    avatarSVG, badgeSVG
  };
})();

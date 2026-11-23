/* The Orchard: AI tutor page.
   Sends the conversation to the "ai-chat" Supabase Edge Function, which calls
   Claude with a key the browser never sees, and shows the reply as it streams in.
   The conversation is saved to the account (doc "aichat"). */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const log = $("ai-log"), form = $("ai-form"), input = $("ai-input"), send = $("ai-send");
  const start = $("ai-start"), left = $("ai-left");
  if (!log || !window.orchardAuth) return;

  const KEEP = 60; // messages kept in the saved chat
  let messages = [];
  let busy = false, chatDoc = null, saveTimer = null;

  /* ---------- small, safe markdown ---------- */
  const escH = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function inline(s) {
    return escH(s)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  }
  function md(text) {
    const out = [];
    let list = null, para = [];
    const flushPara = () => { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>` + list.items.map(i => "<li>" + inline(i) + "</li>").join("") + `</${list.tag}>`); list = null; } };
    for (const raw of text.split("\n")) {
      const line = raw.replace(/\s+$/, "");
      const ul = /^\s*[-*•]\s+(.*)$/.exec(line), ol = /^\s*\d+[.)]\s+(.*)$/.exec(line), h = /^#{1,6}\s+(.*)$/.exec(line);
      if (ul || ol) {
        flushPara();
        const tag = ul ? "ul" : "ol";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((ul || ol)[1]);
      } else if (!line.trim()) { flushPara(); flushList(); }
      else if (h) { flushPara(); flushList(); out.push("<p><strong>" + inline(h[1]) + "</strong></p>"); }
      else { flushList(); para.push(line); }
    }
    flushPara(); flushList();
    return out.join("");
  }

  /* ---------- drawing ---------- */
  function bubble(m) {
    const el = document.createElement("div");
    el.className = "ai-msg " + (m.role === "user" ? "me" : "bot") + (m.error ? " err" : "");
    el.innerHTML = m.role === "user" ? "<p>" + escH(m.content).replace(/\n/g, "<br>") + "</p>" : md(m.content);
    return el;
  }
  function render() {
    log.innerHTML = "";
    messages.forEach(m => log.appendChild(bubble(m)));
    start.hidden = messages.length > 0;
    log.hidden = messages.length === 0;
    scrollDown();
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }
  function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 200) + "px"; }
  function setBusy(b) { busy = b; send.disabled = b; }
  function showLeft(n) { if (typeof n === "number") left.textContent = n === 1 ? "1 message left today" : `${n} messages left today`; }

  /* ---------- saving to the account ---------- */
  async function initStore() {
    try {
      const me = await window.orchardAuth.me();
      const db = await window.claude.use("db");
      chatDoc = db.doc(`data/users/${me.id}/aichat`);
      chatDoc.onSnapshot(snap => {
        if (busy) return;
        const d = snap.exists ? snap.data() : null;
        const saved = (d && Array.isArray(d.messages)) ? d.messages : [];
        if (JSON.stringify(saved) !== JSON.stringify(messages)) { messages = saved; render(); }
      }, () => {});
    } catch (e) { render(); }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!chatDoc) return;
      const keep = messages.filter(m => !m.error).slice(-KEEP);
      chatDoc.set({ messages: keep, updatedAt: Date.now() }).catch(() => {});
    }, 400);
  }

  /* ---------- context the tutor gets ---------- */
  function context() {
    const today = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ctx = { today: iso(today) };
    try { if (typeof DATA !== "undefined") ctx.subjects = DATA.subjects.slice(0, 20); } catch (e) {}
    try {
      if (typeof evStore !== "undefined") {
        ctx.exams = evStore.events
          .filter(e => e.type === "exam" && e.date >= ctx.today)
          .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
          .slice(0, 8)
          .map(e => `${e.date}${e.time ? " " + e.time : ""} ${e.title || e.subject || "Exam"}`);
      }
    } catch (e) {}
    // What the tutor should know about where you are
    try {
      if (typeof ALL_SUBS !== "undefined" && typeof syl !== "undefined") {
        const rank = { red: 0, amber: 1 };
        ctx.weak = ALL_SUBS.filter(s => rank[syl.ratings[s.key]] !== undefined)
          .sort((a, b) => rank[syl.ratings[a.key]] - rank[syl.ratings[b.key]])
          .slice(0, 12).map(s => `${s.topic.def.subject}: ${s.name} (${s.topic.name}) – ${syl.ratings[s.key] === "red" ? "struggling" : "getting there"}`);
      }
      if (typeof store !== "undefined") {
        const wk = new Date(); wk.setDate(wk.getDate() - 6);
        const since = `${wk.getFullYear()}-${String(wk.getMonth() + 1).padStart(2, "0")}-${String(wk.getDate()).padStart(2, "0")}`;
        const by = {};
        store.sessions.filter(s => s.date >= since).forEach(s => (by[s.subject] = (by[s.subject] || 0) + (+s.minutes || 0)));
        ctx.recent = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, m]) => `${s} ${m} min`).join(", ");
      }
      if (typeof deckCards === "function" && typeof isDueCard === "function") ctx.due = deckCards("all:").filter(c => isDueCard(c)).length;
    } catch (e) {}
    return ctx;
  }

  /* ---------- talking to the tutor ---------- */
  async function ask(text) {
    if (busy) return;
    text = text.trim();
    if (!text) return;
    messages = messages.filter(m => !m.error);
    messages.push({ role: "user", content: text });
    const reply = { role: "assistant", content: "" };
    render();
    const el = bubble(reply);
    el.classList.add("typing");
    el.innerHTML = '<span class="ai-dots" aria-label="Thinking"><i></i><i></i><i></i></span>';
    log.appendChild(el); scrollDown();
    setBusy(true);

    const fail = msg => {
      el.remove();
      messages.push({ role: "assistant", content: msg, error: true });
      render();
    };
    try {
      const a = window.orchardAuth;
      const res = await fetch(`${a.url}/functions/v1/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await a.token()), apikey: a.key },
        body: JSON.stringify({ messages: messages.slice(-30).map(m => ({ role: m.role, content: m.content })), context: context() }),
      });
      if (!res.ok || !res.body) {
        let err = res.status === 404 ? "The AI tutor isn’t set up yet. The steps are in the README." : "The AI tutor couldn’t answer. Please try again.";
        try { const j = await res.json(); if (j.error) err = j.error; } catch (e) {}
        fail(err); return;
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", gotError = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
          if (ev.t) {
            reply.content += ev.t;
            el.classList.remove("typing");
            el.innerHTML = md(reply.content);
            const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
            if (nearBottom) scrollDown();
          }
          if (ev.error) gotError = ev.error;
          if (ev.done) showLeft(ev.remaining);
        }
      }
      if (gotError && !reply.content) { fail(gotError); return; }
      if (gotError) reply.content += "\n\n(" + gotError + ")";
      if (!reply.content) { fail("The AI tutor didn’t reply. Please try again."); return; }
      messages.push(reply);
      render(); save();
    } catch (e) {
      fail(/fetch|network/i.test(e.message) ? "Couldn’t reach the AI tutor. Check your connection." : "The AI tutor couldn’t answer. Please try again.");
    } finally {
      setBusy(false);
      if (document.body.dataset.view === "ai") input.focus({ preventScroll: true });
    }
  }

  form.addEventListener("submit", e => { e.preventDefault(); const t = input.value; input.value = ""; grow(); ask(t); });
  input.addEventListener("input", grow);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  $("ai-starters").addEventListener("click", e => { const c = e.target.closest(".chip"); if (c) ask(c.textContent); });
  $("ai-new").addEventListener("click", () => {
    if (busy) return;
    messages = []; render(); save(); input.focus();
  });

  render();
  initStore();
  // Lets other pages open the tutor with a question already asked
  window.orchardAsk = text => {
    location.hash = "#ai";
    setTimeout(() => { if (busy) { input.value = text; grow(); input.focus(); } else ask(text); }, 80);
  };
})();

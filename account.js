/* The Orchard — account bridge (Supabase).
   The app saves through window.claude.use("db") / use("user"). This file
   provides those, backed by Supabase and the signed-in account, and adds
   an Account panel to Settings. */
(function () {
  "use strict";

  const cfg = window.ORCHARD_CONFIG || {};
  const toLogin = q => location.replace("login.html" + (q || ""));
  if (!window.supabase || !/^https:\/\//.test(cfg.supabaseUrl || "") || !cfg.supabaseKey || /PASTE_/.test(cfg.supabaseKey + cfg.supabaseUrl)) { toLogin(); return; }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const toMe = u => ({ id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || u.email.split("@")[0] });

  const mePromise = sb.auth.getSession().then(({ data }) => {
    if (!data.session) { toLogin(); throw new Error("Signed out"); }
    return toMe(data.session.user);
  });
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") toLogin(); });

  /* For other parts of the app (the Social tab) that call Supabase directly */
  window.orchardAuth = {
    url: cfg.supabaseUrl.replace(/\/+$/, ""),
    key: cfg.supabaseKey,
    me: () => mePromise,
    client: sb,
    token: async () => { const { data } = await sb.auth.getSession(); if (!data.session) { toLogin(); throw new Error("Signed out"); } return data.session.access_token; },
  };

  /* ---------- talking to the docs table ---------- */
  let uid = null;
  const prefix = () => `data/users/${uid}/`;
  function rel(path) {
    if (!path.startsWith(prefix())) throw new Error("Bad path");
    return path.slice(prefix().length);
  }
  async function check(res) {
    if (res.error) {
      if (res.status === 401 || /JWT/i.test(res.error.message || "")) {
        const { data } = await sb.auth.getSession();
        if (!data.session) toLogin();
      }
      throw new Error(res.error.message || "Couldn’t reach your account.");
    }
    return res.data;
  }
  async function allRows(likePattern) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let qy = sb.from("docs").select("path,data").eq("user_id", uid).order("path").range(from, from + 999);
      if (likePattern) qy = qy.like("path", likePattern);
      const rows = await check(await qy);
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }
  async function fetchCol(path) {
    const r = rel(path);
    const like = r.replace(/[\\%_]/g, c => "\\" + c) + "/%";
    const rows = await allRows(like);
    return { docs: rows.filter(x => !x.path.slice(r.length + 1).includes("/")).map(x => ({ id: x.path.slice(r.length + 1), data: x.data })) };
  }
  async function fetchDoc(path) {
    const row = await check(await sb.from("docs").select("data").eq("user_id", uid).eq("path", rel(path)).maybeSingle());
    return row ? { exists: true, data: row.data } : { exists: false };
  }
  async function putDoc(path, data) {
    await check(await sb.from("docs").upsert({ user_id: uid, path: rel(path), data, updated_at: new Date().toISOString() }, { onConflict: "user_id,path" }));
  }
  async function delDoc(path) {
    await check(await sb.from("docs").delete().eq("user_id", uid).eq("path", rel(path)));
  }

  /* ---------- live-ish document store ---------- */
  const subs = new Map(); // key -> { kind, path, cbs:Set, state, sig }
  let pending = 0;

  const snapOf = (kind, path, state) => kind === "col"
    ? { docs: state.docs.map(d => ({ id: d.id, data: () => clone(d.data) })), get size() { return state.docs.length; }, get empty() { return !state.docs.length; } }
    : { id: path.split("/").pop(), exists: !!state.exists, data: () => (state.exists ? clone(state.data) : undefined) };

  function notify(sub) {
    const snap = snapOf(sub.kind, sub.path, sub.state);
    sub.cbs.forEach(c => { try { c.next(snap); } catch (e) { console.error(e); } });
  }
  async function refresh(sub, force) {
    try {
      const state = sub.kind === "col" ? await fetchCol(sub.path) : await fetchDoc(sub.path);
      if (pending && !force) return;
      const sig = JSON.stringify(state);
      if (!force && sig === sub.sig) return;
      sub.state = state; sub.sig = sig; notify(sub);
    } catch (e) {
      if (!sub.state) sub.cbs.forEach(c => c.error && c.error(e));
    }
  }
  function subscribe(kind, path, next, error) {
    const key = kind + ":" + path;
    let sub = subs.get(key);
    const entry = { next, error };
    if (!sub) { sub = { kind, path, cbs: new Set(), state: null, sig: null }; subs.set(key, sub); }
    sub.cbs.add(entry);
    if (sub.state) Promise.resolve().then(() => entry.next(snapOf(kind, path, sub.state)));
    else refresh(sub, true);
    return () => sub.cbs.delete(entry);
  }

  /* Show a change at once, then save it */
  function applyLocal(path, data) {
    const doc = subs.get("doc:" + path);
    if (doc && doc.state) { doc.state = data === null ? { exists: false } : { exists: true, data: clone(data) }; doc.sig = JSON.stringify(doc.state); notify(doc); }
    const i = path.lastIndexOf("/"), parent = path.slice(0, i), id = path.slice(i + 1);
    const col = subs.get("col:" + parent);
    if (col && col.state) {
      const docs = col.state.docs.filter(d => d.id !== id);
      if (data !== null) docs.push({ id, data: clone(data) });
      col.state = { docs }; col.sig = JSON.stringify(col.state); notify(col);
    }
  }
  async function write(path, data) {
    pending++;
    applyLocal(path, data);
    try { if (data === null) await delDoc(path); else await putDoc(path, data); }
    catch (e) { subs.forEach(s => refresh(s, true)); throw e; }
    finally { pending--; }
  }
  const newId = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join("");

  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      set: data => write(path, data),
      update: async patch => { const r = await fetchDoc(path); return write(path, { ...(r.data || {}), ...patch }); },
      delete: () => write(path, null),
      get: async () => snapOf("doc", path, await fetchDoc(path)),
      onSnapshot: (next, error) => subscribe("doc", path, next, error),
    };
  }
  function colRef(path) {
    return {
      path,
      doc: id => docRef(`${path}/${id || newId()}`),
      add: async data => { const ref = docRef(`${path}/${newId()}`); await ref.set(data); return ref; },
      get: async () => snapOf("col", path, await fetchCol(path)),
      onSnapshot: (next, error) => subscribe("col", path, next, error),
    };
  }
  const dbApi = { collection: colRef, doc: docRef };

  /* Pick up changes made on other devices */
  function refreshAll() { if (document.visibilityState === "visible" && !pending) subs.forEach(s => refresh(s)); }
  setInterval(refreshAll, 30000);
  document.addEventListener("visibilitychange", refreshAll);
  addEventListener("focus", refreshAll);

  window.claude = window.claude || {};
  window.claude.use = async function (name) {
    const me = await mePromise;
    uid = me.id;
    if (name === "db") return dbApi;
    if (name === "user") return { id: async () => me.id, name: async () => me.name, email: async () => me.email };
    return null;
  };

  /* ---------- account panel ---------- */
  const DATA_KEYS = ["orchard-sessions", "orchard-events", "orchard-grades", "orchard-papers", "orchard-ratings", "orchard-syl-extra", "orchard-goal", "orchard-targets", "orchard-timer", "orchard-last"];
  const clearLocal = () => { try { DATA_KEYS.forEach(k => localStorage.removeItem(k)); } catch (e) {} };
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = msg => (typeof window.toast === "function" ? window.toast(msg) : alert(msg));

  async function verifyPassword(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? "That password isn’t right." : error.message);
  }
  async function signOut() {
    clearLocal();
    try { await sb.auth.signOut(); } catch (e) {}
    toLogin();
  }
  async function exportData() {
    const rows = await allRows(null);
    const blob = new Blob([JSON.stringify({ app: "the-orchard", version: 1, exportedAt: new Date().toISOString(), docs: rows.map(r => ({ path: r.path, data: r.data })) }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `orchard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function importData(b) {
    if (!b || b.app !== "the-orchard" || !Array.isArray(b.docs)) throw new Error("That file isn’t an Orchard backup.");
    const rows = b.docs
      .filter(d => typeof d.path === "string" && /^[\w\-]+(\/[\w\-]+)*$/.test(d.path) && d.path.length <= 300 && d.data && typeof d.data === "object")
      .map(d => ({ user_id: uid, path: d.path, data: d.data, updated_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 200) {
      await check(await sb.from("docs").upsert(rows.slice(i, i + 200), { onConflict: "user_id,path" }));
    }
    return rows.length;
  }

  function panelHTML(me) {
    const initial = (me.name.trim()[0] || "?").toUpperCase();
    return `
      <h3>Account</h3>
      <div class="acct-card">
        <span class="acct-avatar" aria-hidden="true">${escH(initial)}</span>
        <div class="acct-who"><b id="acct-name">${escH(me.name)}</b><span>${escH(me.email)}</span></div>
        <button type="button" class="chip" id="acct-signout">Sign out</button>
      </div>
      <p class="pref-hint">Everything you log is saved to this account, so it follows you to any device you sign in on.</p>
      <div class="chips acct-actions">
        <button type="button" class="chip" data-acct="name" aria-expanded="false">Change name</button>
        <button type="button" class="chip" data-acct="password" aria-expanded="false">Change password</button>
        <button type="button" class="chip" id="acct-export">Download my data</button>
        <button type="button" class="chip" data-acct="import" aria-expanded="false">Restore a backup</button>
        <button type="button" class="chip acct-danger" data-acct="delete" aria-expanded="false">Delete account</button>
      </div>

      <form class="acct-form" data-form="name" hidden>
        <label class="field"><span>Your name</span><input class="input" name="name" autocomplete="name" maxlength="60" required value="${escH(me.name)}"></label>
        <p class="acct-err" role="alert"></p>
        <div class="acct-row"><button class="primary" type="submit">Save name</button><button class="chip" type="button" data-cancel>Cancel</button></div>
      </form>

      <form class="acct-form" data-form="password" hidden>
        <input type="email" name="username" autocomplete="username" value="${escH(me.email)}" hidden>
        <label class="field"><span>Current password</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>New password</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>
        <p class="acct-err" role="alert"></p>
        <div class="acct-row"><button class="primary" type="submit">Update password</button><button class="chip" type="button" data-cancel>Cancel</button></div>
        <p class="pref-hint">Your other devices will be signed out.</p>
      </form>

      <form class="acct-form" data-form="import" hidden>
        <label class="field"><span>Orchard backup file (.json)</span><input class="input" type="file" name="file" accept="application/json,.json" required></label>
        <p class="pref-hint">Items in the backup replace the matching items in your account. Nothing else is removed.</p>
        <p class="acct-err" role="alert"></p>
        <div class="acct-row"><button class="primary" type="submit">Restore</button><button class="chip" type="button" data-cancel>Cancel</button></div>
      </form>

      <form class="acct-form" data-form="delete" hidden>
        <p class="pref-hint acct-warn">This permanently deletes your account and everything in it: study sessions, grades, exams, past papers and revision progress. It can’t be undone. You might want to download your data first.</p>
        <label class="field"><span>Type your password to confirm</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <p class="acct-err" role="alert"></p>
        <div class="acct-row"><button class="primary acct-danger-btn" type="submit">Delete my account</button><button class="chip" type="button" data-cancel>Cancel</button></div>
      </form>`;
  }

  function mountPanel(me) {
    const head = document.querySelector("#prefs .prefs-head");
    if (!head || document.getElementById("acct")) return;
    const g = document.createElement("div");
    g.className = "pref-group"; g.id = "acct";
    g.innerHTML = panelHTML(me);
    head.after(g);

    const forms = g.querySelectorAll(".acct-form");
    const toggles = g.querySelectorAll("[data-acct]");
    const show = name => {
      forms.forEach(f => {
        const on = f.dataset.form === name && f.hidden;
        f.hidden = !on; f.querySelector(".acct-err").textContent = "";
        if (on) { const i = f.querySelector("input:not([hidden])"); if (i) i.focus(); }
      });
      toggles.forEach(t => t.setAttribute("aria-expanded", String(!g.querySelector(`[data-form="${t.dataset.acct}"]`).hidden)));
    };
    toggles.forEach(t => t.addEventListener("click", () => show(t.dataset.acct)));
    g.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => show(null)));
    g.querySelector("#acct-signout").addEventListener("click", signOut);
    g.querySelector("#acct-export").addEventListener("click", () => exportData().catch(e => say(e.message)));

    const handle = (name, fn) => {
      const f = g.querySelector(`[data-form="${name}"]`);
      f.addEventListener("submit", async e => {
        e.preventDefault();
        const btn = f.querySelector('[type="submit"]'), err = f.querySelector(".acct-err");
        btn.disabled = true; err.textContent = "";
        try { await fn(f); } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
      });
    };
    handle("name", async f => {
      const name = f.name.value.trim().replace(/\s+/g, " ").slice(0, 60);
      if (!name) throw new Error("Please enter your name.");
      const { error } = await sb.auth.updateUser({ data: { name } });
      if (error) throw new Error(error.message);
      me.name = name;
      g.querySelector("#acct-name").textContent = me.name;
      g.querySelector(".acct-avatar").textContent = (me.name[0] || "?").toUpperCase();
      greet(me); show(null); say("Name updated.");
    });
    handle("password", async f => {
      if (f.next.value.length < 8) throw new Error("Your new password needs at least 8 characters.");
      await verifyPassword(me.email, f.current.value).catch(() => { throw new Error("Your current password isn’t right."); });
      const { error } = await sb.auth.updateUser({ password: f.next.value });
      if (error) throw new Error(error.message);
      try { await sb.auth.signOut({ scope: "others" }); } catch (e) {}
      f.reset(); show(null); say("Password updated.");
    });
    handle("import", async f => {
      const file = f.file.files[0];
      if (!file) throw new Error("Choose a backup file first.");
      let data;
      try { data = JSON.parse(await file.text()); } catch (e) { throw new Error("That file isn’t an Orchard backup."); }
      const n = await importData(data);
      say(`Restored ${n} item${n === 1 ? "" : "s"}. Reloading…`);
      setTimeout(() => location.reload(), 900);
    });
    handle("delete", async f => {
      await verifyPassword(me.email, f.password.value);
      const { error } = await sb.rpc("delete_my_account");
      if (error) throw new Error(error.message);
      clearLocal();
      try { await sb.auth.signOut({ scope: "local" }); } catch (e) {}
      toLogin("?deleted=1");
    });
  }

  function greet(me) {
    const el = document.getElementById("greeting");
    if (!el) return;
    const base = el.dataset.base || el.textContent.replace(/,.*$/, "");
    el.dataset.base = base;
    const first = me.name.split(" ")[0];
    el.textContent = first ? `${base}, ${first}` : base;
  }

  const ready = new Promise(r => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", r) : r()));
  Promise.all([mePromise, ready]).then(([me]) => { mountPanel(me); greet(me); }).catch(() => {});
})();

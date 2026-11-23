/* The Orchard — account bridge.
   The app saves through window.claude.use("db") / use("user"). This file
   provides those, backed by this site's server and the signed-in account,
   and adds an Account panel to Settings. */
(function () {
  "use strict";

  /* ---------- server calls ---------- */
  function toLogin() { location.replace("/login"); }
  async function call(method, url, body) {
    const r = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json", "X-Orchard": "1" } : { "X-Orchard": "1" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && !/\/api\/(password|delete-account)$/.test(url)) { toLogin(); throw new Error("Signed out"); }
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: r.status });
    return j;
  }
  const enc = encodeURIComponent;
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  const mePromise = call("GET", "/api/me").then(j => j.user);

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
      const state = await call("GET", `/api/${sub.kind}?path=${enc(sub.path)}`);
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

  /* Apply a write to what's on screen at once, then save it */
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
    try {
      if (data === null) await call("DELETE", `/api/doc?path=${enc(path)}`);
      else await call("PUT", `/api/doc?path=${enc(path)}`, { data });
    } catch (e) {
      subs.forEach(s => refresh(s, true));
      throw e;
    } finally { pending--; }
  }
  const newId = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join("");

  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      set: data => write(path, data),
      update: async patch => { const r = await call("GET", `/api/doc?path=${enc(path)}`); return write(path, { ...(r.data || {}), ...patch }); },
      delete: () => write(path, null),
      get: async () => snapOf("doc", path, await call("GET", `/api/doc?path=${enc(path)}`)),
      onSnapshot: (next, error) => subscribe("doc", path, next, error),
    };
  }
  function colRef(path) {
    return {
      path,
      doc: id => docRef(`${path}/${id || newId()}`),
      add: async data => { const ref = docRef(`${path}/${newId()}`); await ref.set(data); return ref; },
      get: async () => snapOf("col", path, await call("GET", `/api/col?path=${enc(path)}`)),
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
    if (name === "db") return dbApi;
    if (name === "user") return { id: async () => me.id, name: async () => me.name, email: async () => me.email };
    return null;
  };

  /* ---------- account panel ---------- */
  const DATA_KEYS = ["orchard-sessions", "orchard-events", "orchard-grades", "orchard-papers", "orchard-ratings", "orchard-syl-extra", "orchard-goal", "orchard-targets", "orchard-timer", "orchard-last"];
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = msg => (typeof window.toast === "function" ? window.toast(msg) : alert(msg));

  async function signOut() {
    try { await call("POST", "/api/logout", {}); } catch (e) {}
    try { DATA_KEYS.forEach(k => localStorage.removeItem(k)); } catch (e) {}
    location.replace("/login");
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
    g.querySelector("#acct-export").addEventListener("click", () => { location.href = "/api/export"; });

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
      const j = await call("POST", "/api/profile", { name: f.name.value });
      me.name = j.user.name;
      g.querySelector("#acct-name").textContent = me.name;
      g.querySelector(".acct-avatar").textContent = (me.name[0] || "?").toUpperCase();
      greet(me); show(null); say("Name updated.");
    });
    handle("password", async f => {
      await call("POST", "/api/password", { current: f.current.value, next: f.next.value });
      f.reset(); show(null); say("Password updated.");
    });
    handle("import", async f => {
      const file = f.file.files[0];
      if (!file) throw new Error("Choose a backup file first.");
      let data;
      try { data = JSON.parse(await file.text()); } catch (e) { throw new Error("That file isn’t an Orchard backup."); }
      const j = await call("POST", "/api/import", data);
      say(`Restored ${j.imported} item${j.imported === 1 ? "" : "s"}. Reloading…`);
      setTimeout(() => location.reload(), 900);
    });
    handle("delete", async f => {
      await call("POST", "/api/delete-account", { password: f.password.value });
      try { DATA_KEYS.forEach(k => localStorage.removeItem(k)); } catch (e) {}
      location.replace("/login?deleted=1");
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

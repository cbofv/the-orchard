/* The Orchard — web server with accounts.
   No dependencies: Node 22.13+ (built-in http, crypto and sqlite). */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC = path.join(__dirname, "public");
const SESSION_DAYS = 30;
const MAX_BODY = 8 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "orchard.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    pass TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS docs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, path)
  );
`);

const q = {
  userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  userById: db.prepare("SELECT * FROM users WHERE id = ?"),
  addUser: db.prepare("INSERT INTO users (id, email, name, pass, created_at) VALUES (?, ?, ?, ?, ?)"),
  setPass: db.prepare("UPDATE users SET pass = ? WHERE id = ?"),
  setName: db.prepare("UPDATE users SET name = ? WHERE id = ?"),
  delUser: db.prepare("DELETE FROM users WHERE id = ?"),
  addSession: db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"),
  session: db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?"),
  delSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  delOtherSessions: db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?"),
  purgeSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
  getDoc: db.prepare("SELECT data, updated_at FROM docs WHERE user_id = ? AND path = ?"),
  putDoc: db.prepare(`INSERT INTO docs (user_id, path, data, updated_at) VALUES (?, ?, ?, ?)
                      ON CONFLICT (user_id, path) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  delDoc: db.prepare("DELETE FROM docs WHERE user_id = ? AND path = ?"),
  listCol: db.prepare("SELECT path, data FROM docs WHERE user_id = ? AND path LIKE ? ESCAPE '\\'"),
  allDocs: db.prepare("SELECT path, data, updated_at FROM docs WHERE user_id = ? ORDER BY path"),
};

/* ---------- passwords and sessions ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
function checkPassword(pw, stored) {
  const [kind, salt, key] = String(stored).split("$");
  if (kind !== "scrypt") return false;
  const want = Buffer.from(key, "base64");
  const got = crypto.scryptSync(pw, Buffer.from(salt, "base64"), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}
const tokenHash = t => crypto.createHash("sha256").update(t).digest("hex");

function startSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  q.addSession.run(tokenHash(token), userId, Date.now() + SESSION_DAYS * 864e5);
  setCookie(res, req, token, SESSION_DAYS * 86400);
  return token;
}
function setCookie(res, req, value, maxAge) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `orchard_sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
function readCookie(req) {
  const m = /(?:^|;\s*)orchard_sid=([^;]+)/.exec(req.headers.cookie || "");
  return m ? m[1] : null;
}
function currentUser(req) {
  const t = readCookie(req);
  if (!t) return null;
  const s = q.session.get(tokenHash(t), Date.now());
  if (!s) return null;
  const u = q.userById.get(s.user_id);
  return u ? { ...u, tokenHash: tokenHash(t) } : null;
}
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, createdAt: u.created_at });

/* Slow down repeated wrong passwords from one address */
const attempts = new Map();
function limited(ip) {
  const now = Date.now(), a = attempts.get(ip) || [];
  const recent = a.filter(t => now - t < 15 * 60e3);
  attempts.set(ip, recent);
  return recent.length >= 10;
}
function failed(ip) { (attempts.get(ip) || attempts.set(ip, []).get(ip)).push(Date.now()); }
setInterval(() => { q.purgeSessions.run(Date.now()); attempts.clear(); }, 6 * 3600e3).unref();

/* ---------- helpers ---------- */
function send(res, status, body, headers = {}) {
  const isObj = typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!size) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { reject(Object.assign(new Error("Bad JSON"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
const validEmail = e => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validPassword = p => typeof p === "string" && p.length >= 8 && p.length <= 200;
const cleanName = n => String(n || "").trim().replace(/\s+/g, " ").slice(0, 60);

/* Data paths are stored relative to the user, e.g. "sessions/items/abc".
   The page asks for "data/users/<uid>/..."; anything else is refused. */
function relPath(user, p) {
  if (typeof p !== "string") return null;
  const prefix = `data/users/${user.id}/`;
  if (!p.startsWith(prefix)) return null;
  const rel = p.slice(prefix.length);
  if (!rel || rel.length > 300 || !/^[\w\-]+(\/[\w\-]+)*$/.test(rel)) return null;
  return rel;
}

/* ---------- static files ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
function serveFile(res, file, extra = {}) {
  fs.readFile(path.join(PUBLIC, file), (err, buf) => {
    if (err) return send(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "SAMEORIGIN",
      ...extra,
    });
    res.end(buf);
  });
}

/* ---------- routes ---------- */
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;

  /* Changes need JSON + a custom header, which other sites can't send (CSRF guard) */
  if (req.method !== "GET" && req.headers["x-orchard"] !== "1") return send(res, 403, { error: "Missing request header." });

  if (route === "POST /api/signup") {
    const b = await readBody(req);
    const email = String(b.email || "").trim(), name = cleanName(b.name);
    if (!name) return send(res, 400, { error: "Please enter your name." });
    if (!validEmail(email)) return send(res, 400, { error: "Please enter a valid email address." });
    if (!validPassword(b.password)) return send(res, 400, { error: "Your password needs at least 8 characters." });
    if (q.userByEmail.get(email)) return send(res, 409, { error: "There’s already an account with that email. Try signing in." });
    const id = crypto.randomBytes(12).toString("hex");
    q.addUser.run(id, email, name, hashPassword(b.password), Date.now());
    startSession(res, req, id);
    return send(res, 201, { user: publicUser(q.userById.get(id)) });
  }

  if (route === "POST /api/login") {
    if (limited(ip)) return send(res, 429, { error: "Too many attempts. Please wait 15 minutes and try again." });
    const b = await readBody(req);
    const u = q.userByEmail.get(String(b.email || "").trim());
    if (!u || typeof b.password !== "string" || !checkPassword(b.password, u.pass)) {
      failed(ip);
      return send(res, 401, { error: "That email and password don’t match." });
    }
    startSession(res, req, u.id);
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === "POST /api/logout") {
    const t = readCookie(req);
    if (t) q.delSession.run(tokenHash(t));
    setCookie(res, req, "", 0);
    return send(res, 200, { ok: true });
  }

  /* Everything below needs a signed-in user */
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: "Please sign in." });

  if (route === "GET /api/me") return send(res, 200, { user: publicUser(user) });

  if (route === "POST /api/profile") {
    const b = await readBody(req), name = cleanName(b.name);
    if (!name) return send(res, 400, { error: "Please enter your name." });
    q.setName.run(name, user.id);
    return send(res, 200, { user: publicUser(q.userById.get(user.id)) });
  }

  if (route === "POST /api/password") {
    const b = await readBody(req);
    if (!checkPassword(String(b.current || ""), user.pass)) return send(res, 401, { error: "Your current password isn’t right." });
    if (!validPassword(b.next)) return send(res, 400, { error: "Your new password needs at least 8 characters." });
    q.setPass.run(hashPassword(b.next), user.id);
    q.delOtherSessions.run(user.id, user.tokenHash);
    return send(res, 200, { ok: true });
  }

  if (route === "POST /api/delete-account") {
    const b = await readBody(req);
    if (!checkPassword(String(b.password || ""), user.pass)) return send(res, 401, { error: "That password isn’t right." });
    q.delUser.run(user.id);
    setCookie(res, req, "", 0);
    return send(res, 200, { ok: true });
  }

  if (route === "GET /api/export") {
    const docs = q.allDocs.all(user.id).map(r => ({ path: r.path, data: JSON.parse(r.data), updatedAt: r.updated_at }));
    return send(res, 200, { app: "the-orchard", version: 1, exportedAt: new Date().toISOString(), docs }, {
      "Content-Disposition": `attachment; filename="orchard-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }

  if (route === "POST /api/import") {
    const b = await readBody(req);
    if (b.app !== "the-orchard" || !Array.isArray(b.docs)) return send(res, 400, { error: "That file isn’t an Orchard backup." });
    let n = 0; const now = Date.now();
    db.exec("BEGIN");
    try {
      for (const d of b.docs) {
        if (typeof d.path !== "string" || !/^[\w\-]+(\/[\w\-]+)*$/.test(d.path) || d.path.length > 300) continue;
        if (!d.data || typeof d.data !== "object") continue;
        q.putDoc.run(user.id, d.path, JSON.stringify(d.data), now); n++;
      }
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    return send(res, 200, { imported: n });
  }

  /* Document store used by the app */
  if (url.pathname === "/api/doc" || url.pathname === "/api/col") {
    const rel = relPath(user, url.searchParams.get("path"));
    if (!rel) return send(res, 400, { error: "Bad path." });

    if (route === "GET /api/col") {
      const like = rel.replace(/[\\%_]/g, c => "\\" + c) + "/%";
      const docs = q.listCol.all(user.id, like)
        .filter(r => !r.path.slice(rel.length + 1).includes("/"))
        .map(r => ({ id: r.path.slice(rel.length + 1), data: JSON.parse(r.data) }));
      return send(res, 200, { docs });
    }
    if (route === "GET /api/doc") {
      const r = q.getDoc.get(user.id, rel);
      return send(res, 200, r ? { exists: true, data: JSON.parse(r.data) } : { exists: false });
    }
    if (route === "PUT /api/doc") {
      const b = await readBody(req);
      if (!b || typeof b.data !== "object" || b.data === null || Array.isArray(b.data)) return send(res, 400, { error: "Bad data." });
      q.putDoc.run(user.id, rel, JSON.stringify(b.data), Date.now());
      return send(res, 200, { ok: true });
    }
    if (route === "DELETE /api/doc") {
      q.delDoc.run(user.id, rel);
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: "Not found." });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");

    const p = url.pathname;
    if (p === "/" || p === "/index.html") {
      if (!currentUser(req)) { res.writeHead(302, { Location: "/login" }); return res.end(); }
      return serveFile(res, "app.html");
    }
    if (p === "/login" || p === "/signup") {
      if (currentUser(req)) { res.writeHead(302, { Location: "/" }); return res.end(); }
      return serveFile(res, "login.html");
    }
    if (p === "/healthz") return send(res, 200, "ok");
    const file = p.slice(1);
    if (/^[\w\-]+\.(js|css|svg|png|ico|webmanifest)$/.test(file)) return serveFile(res, file);
    return send(res, 404, "Not found");
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "Something went wrong." });
  }
});

server.listen(PORT, () => console.log(`The Orchard is running on http://localhost:${PORT}`));

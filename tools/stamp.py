#!/usr/bin/env python3
"""Fingerprint the site's files so browsers can cache them safely.

Run this after changing any .js or .css file:

    python3 tools/stamp.py

It rewrites references such as  src="app.js"  in index.html and login.html to
src="app.js?v=1a2b3c4d", where the code is taken from the file's contents, and
updates the list of files the service worker (sw.js) keeps for offline use.
When a file changes, its code changes, so everyone gets the new version, while
unchanged files load straight from the device.
"""
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ["app.css", "app.js", "ui.css", "ui.js", "social.css", "social.js",
          "account.css", "account.js", "supabase.js", "phone.css", "phone.js", "game.css", "game.js", "game-prompts.js", "prefs.css", "prefs.js", "glow.css", "glow.js", "vault.css", "vault.js"]
PAGES = ["index.html", "login.html"]
# Not fingerprinted: config.js (you edit it by hand) and the icons.
PLAIN = ["./", "index.html", "login.html", "welcome.html", "config.js", "icon.svg", "icon-192.png",
         "icon-512.png", "manifest.webmanifest"]

def code(name):
    return hashlib.sha256((ROOT / name).read_bytes()).hexdigest()[:10]

versions = {a: code(a) for a in ASSETS}
changed = []
for page in PAGES:
    p = ROOT / page
    text = p.read_text(encoding="utf-8")
    new = text
    for a, v in versions.items():
        new = re.sub(r'((?:src|href)=")' + re.escape(a) + r'(?:\?v=[0-9a-f]+)?(")', r"\g<1>" + a + "?v=" + v + r"\g<2>", new)
    if new != text:
        p.write_text(new, encoding="utf-8"); changed.append(page)

# Service worker: what to keep for offline use, and a cache name that changes with it
used = set()
for page in PAGES:
    used.update(re.findall(r'(?:src|href)="([\w.-]+\?v=[0-9a-f]+)"', (ROOT / page).read_text(encoding="utf-8")))
shell = PLAIN + sorted(used)
cache = "orchard-" + hashlib.sha256(" ".join(shell).encode()).hexdigest()[:8]
sw = ROOT / "sw.js"
text = sw.read_text(encoding="utf-8")
block = "/* stamp:start */\nconst CACHE = %s;\nconst SHELL = [\n%s\n];\n/* stamp:end */" % (
    '"' + cache + '"', ",\n".join('  "%s"' % s for s in shell))
new = re.sub(r"/\* stamp:start \*/.*?/\* stamp:end \*/", lambda m: block, text, flags=re.S)
if new != text:
    sw.write_text(new, encoding="utf-8"); changed.append("sw.js")

print("Updated: " + (", ".join(changed) if changed else "nothing (already up to date)"))

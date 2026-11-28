#!/usr/bin/env python3
"""Check every Vault paper and rebuild the catalogue (vault/index.json).

Run this after adding or changing a paper:

    python3 tools/vault_build.py

Each paper is one JSON file in vault/papers/<subject>/. The format is described
in vault/README.md. This script checks the structure (ids, marks, mark schemes,
figure files). Topic tags are checked against the site's real topic list on the
in-app page  #vault/check , because those names live in app.js.
"""
import json, pathlib, re, sys
from fractions import Fraction

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAPERS = ROOT / "vault" / "papers"
INDEX = ROOT / "vault" / "index.json"

SUBJECTS = {"English Literature", "Religious Studies", "Psychology", "Spanish", "Geography", "Maths",
            "Further Maths", "Biology", "Chemistry", "Physics"}
TYPES = {"mcq", "short", "calc", "extended", "diagram"}
BACKGROUNDS = {"lined", "grid", "blank"}
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
KEY = re.compile(r"^[a-z]+/[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-]+$")


def number(v):
    """A mark scheme number: 12, 0.25 or "11/6"."""
    if isinstance(v, bool):
        raise ValueError
    if isinstance(v, (int, float)):
        return Fraction(str(v))
    return Fraction(str(v).strip())


def check_figures(figs, where, errs):
    for i, f in enumerate(figs or []):
        w = f"{where} figure {i + 1}"
        t = f.get("type")
        if t == "image":
            src = f.get("src", "")
            if not src or not (ROOT / src).is_file():
                errs.append(f"{w}: image file not found: {src!r}")
            if not f.get("alt"):
                errs.append(f"{w}: images need alt text (describe what the figure shows)")
        elif t == "table":
            head, rows = f.get("head") or [], f.get("rows") or []
            if not rows:
                errs.append(f"{w}: table has no rows")
            for r in rows:
                if head and len(r) != len(head):
                    errs.append(f"{w}: a table row has {len(r)} cells but the header has {len(head)}")
        elif t == "text":
            if not f.get("body"):
                errs.append(f"{w}: text figure has no body")
        else:
            errs.append(f"{w}: unknown figure type {t!r} (use image, table or text)")


def check_part(p, where, errs):
    w = f"{where} part {p.get('label') or p.get('id')}"
    if not SAFE_ID.match(str(p.get("id", ""))):
        errs.append(f"{w}: id must be lower-case letters, numbers and hyphens, e.g. \"01-2\" or \"3-b-ii\"")
    if not p.get("label"):
        errs.append(f"{w}: missing label (how the number is printed, e.g. \"01.2\")")
    if not p.get("text"):
        errs.append(f"{w}: missing question text")
    m = p.get("marks")
    if not isinstance(m, int) or m < 1:
        errs.append(f"{w}: marks must be a whole number of at least 1")
        m = 0
    t = p.get("type")
    if t not in TYPES:
        errs.append(f"{w}: type must be one of {', '.join(sorted(TYPES))}")
    if p.get("background") and p["background"] not in BACKGROUNDS:
        errs.append(f"{w}: background must be lined, grid or blank")
    topics = p.get("topics") or []
    if not topics:
        errs.append(f"{w}: needs at least one topic tag")
    for k in topics:
        if not KEY.match(k):
            errs.append(f"{w}: topic tag {k!r} doesn't look like subject/topic/group/subtopic")
    check_figures(p.get("figures"), w, errs)
    s = p.get("scheme")
    if not isinstance(s, dict):
        errs.append(f"{w}: missing mark scheme")
        return
    if t == "mcq":
        keys = [o.get("key") for o in p.get("options") or []]
        if len(keys) < 2:
            errs.append(f"{w}: multiple choice needs at least two options")
        pick = p.get("pick", 1)
        correct = s.get("correct") or []
        if len(correct) != pick:
            errs.append(f"{w}: pick is {pick} but the scheme lists {len(correct)} correct option(s)")
        for c in correct:
            if c not in keys:
                errs.append(f"{w}: correct option {c!r} isn't one of the options")
        if pick > 1 and m != pick:
            errs.append(f"{w}: with pick {pick}, marks should be {pick} (1 per correct option)")
        return
    if "numeric" in s:
        try:
            number(s["numeric"]["value"])
            float(s["numeric"].get("tolerance", 0))
        except Exception:
            errs.append(f"{w}: numeric.value must be a number or a fraction like \"11/6\"")
    levels = s.get("levels")
    if t == "extended" and not levels:
        errs.append(f"{w}: extended answers need level descriptors")
    if levels:
        top = sorted(levels, key=lambda l: l.get("min", 0))
        if top and top[-1].get("max") != m:
            errs.append(f"{w}: the top level should end at {m} marks")
        for a, b in zip(top, top[1:]):
            if b.get("min") != a.get("max", 0) + 1:
                errs.append(f"{w}: levels should run on with no gaps (level {a.get('level')} ends at {a.get('max')}, level {b.get('level')} starts at {b.get('min')})")
        for l in levels:
            if not l.get("descriptor"):
                errs.append(f"{w}: level {l.get('level')} has no descriptor")
    else:
        pts = s.get("points") or []
        if not pts and "numeric" not in s and not s.get("exact"):
            errs.append(f"{w}: the scheme needs marking points, levels, a numeric answer or exact answers")
        total = sum(int(x.get("marks", 1)) for x in pts)
        cap = s.get("max", total)
        if pts and min(total, cap) != m:
            errs.append(f"{w}: marking points are worth {min(total, cap)} but the part is worth {m} (use \"max\" if more points can be credited than there are marks)")


def check_paper(path):
    errs = []
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return None, [f"isn't valid JSON: {e}"]
    if d.get("schema") != 1:
        errs.append("schema must be 1")
    if not SAFE_ID.match(str(d.get("id", ""))):
        errs.append("id must be lower-case letters, numbers and hyphens")
    if path.stem != d.get("id"):
        errs.append(f"the file name should match the id ({d.get('id')}.json)")
    if d.get("subject") not in SUBJECTS:
        errs.append(f"subject must be one of the site's subjects: {', '.join(sorted(SUBJECTS))}")
    for f in ("board", "series", "paper", "title"):
        if not d.get(f):
            errs.append(f"missing {f}")
    if d.get("tier") not in (None, "Foundation", "Higher"):
        errs.append("tier must be Foundation, Higher or null")
    if not isinstance(d.get("minutes"), int):
        errs.append("minutes must be a whole number")
    sources = {s.get("id") for s in d.get("sources") or []}
    for s in d.get("sources") or []:
        if not SAFE_ID.match(str(s.get("id", ""))):
            errs.append(f"source {s.get('id')!r}: id must be lower-case letters, numbers and hyphens")
        check_figures(s.get("figures"), f"source {s.get('id')}", errs)
    seen, total = set(), 0
    for q in d.get("questions") or []:
        where = f"question {q.get('n')}"
        if q.get("source") and q["source"] not in sources:
            errs.append(f"{where}: source {q['source']!r} isn't in the paper's sources")
        check_figures(q.get("figures"), where, errs)
        if not q.get("parts"):
            errs.append(f"{where}: has no parts")
        for p in q.get("parts") or []:
            check_part(p, where, errs)
            if p.get("id") in seen:
                errs.append(f"{where}: part id {p.get('id')!r} is used twice")
            seen.add(p.get("id"))
            total += p.get("marks") if isinstance(p.get("marks"), int) else 0
    if total != d.get("totalMarks"):
        errs.append(f"totalMarks is {d.get('totalMarks')} but the parts add up to {total}")
    b = d.get("boundaries")
    if b:
        g = b.get("grades") or {}
        marks = [g[k] for k in sorted(g, key=lambda k: -int(k))]
        if any(x < y for x, y in zip(marks, marks[1:])):
            errs.append("boundaries must go down as the grade goes down")
        if marks and marks[0] > total:
            errs.append("the top boundary is higher than the paper's total")
    return d, errs


def summary(d, path):
    def short(t):
        t = re.sub(r"\*\*|[\^_]\{|\}", "", t or "").replace("\n", " ")
        return t[:160]
    return {
        "id": d["id"], "file": path.relative_to(ROOT).as_posix(), "official": bool(d.get("official")),
        "subject": d["subject"], "qualification": d.get("qualification", "GCSE"), "board": d["board"],
        "spec": d.get("spec"), "tier": d.get("tier"), "year": d.get("year"), "series": d["series"],
        "paper": d["paper"], "paperNum": d.get("paperNum"), "title": d["title"], "minutes": d["minutes"],
        "calculator": d.get("calculator"), "totalMarks": d["totalMarks"], "hasBoundaries": bool(d.get("boundaries")),
        "parts": [
            {"id": p["id"], "label": p["label"], "marks": p["marks"], "type": p["type"], "topics": p["topics"],
             "text": short((q.get("stem", "") + " " if i == 0 else "") + p["text"])}
            for q in d["questions"] for i, p in enumerate(q["parts"])
        ],
    }


def main():
    files = sorted(PAPERS.glob("*/*.json"))
    out, bad, ids = [], 0, set()
    for f in files:
        d, errs = check_paper(f)
        if d and d.get("id") in ids:
            errs.append(f"another paper already uses the id {d['id']!r}")
        rel = f.relative_to(ROOT).as_posix()
        if errs:
            bad += 1
            print(f"✗ {rel}")
            for e in errs:
                print(f"    - {e}")
            continue
        ids.add(d["id"])
        out.append(summary(d, f))
        print(f"✓ {rel}  ({d['totalMarks']} marks, {sum(len(q['parts']) for q in d['questions'])} parts)")
    out.sort(key=lambda p: (p["subject"], p["board"], p["tier"] or "", -(p["year"] or 0), p["series"], p["paperNum"] or 0, p["id"]))
    INDEX.write_text(json.dumps({"schema": 1, "papers": out}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"\nWrote vault/index.json with {len(out)} paper(s).")
    if bad:
        print(f"{bad} paper(s) have problems and were left out. Fix them and run this again.")
        sys.exit(1)


if __name__ == "__main__":
    main()

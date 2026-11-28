# The Vault: adding papers

Each paper is one JSON file in `vault/papers/<subject>/<paper-id>.json`. After adding
or changing one, run:

```
python3 tools/vault_build.py
```

It checks every paper and rebuilds `vault/index.json`, the list the site reads. Then open
**The Vault → Check papers** (`#vault/check`) on the site to confirm every topic tag matches
a real subtopic. It suggests the right tag if one is misspelt.

The three `orchard-…` papers are worked examples of every feature. Copy one as a starting point.

## A paper

| Field | Example | Notes |
|---|---|---|
| `schema` | `1` | Always 1 for now. |
| `id` | `"aqa-bio-8461-1h-2023-06"` | Lower-case letters, numbers and hyphens. Must match the file name. |
| `official` | `true` | `false` shows a "Practice" badge. |
| `subject` | `"Biology"` | Exactly as the site names it. |
| `qualification`, `board`, `spec` | `"GCSE"`, `"AQA"`, `"8461"` | |
| `tier` | `"Higher"` | `"Foundation"`, `"Higher"` or `null`. |
| `year`, `series` | `2023`, `"June 2023"` | |
| `paper`, `paperNum`, `title` | `"Paper 1"`, `1`, `"Cells, organisation…"` | |
| `minutes` | `105` | The real exam length (used by exam mode). |
| `calculator` | `true` | `true`, `false` or `null`. |
| `totalMarks` | `100` | Must equal the sum of every part's marks. |
| `boundaries` | `{ "note": "June 2023", "grades": { "9": 82, "8": 72 } }` | Optional. Raw marks needed for each grade. |
| `instructions` | `["Answer all questions."]` | Shown on the cover. |
| `sources` | see below | Optional extracts and items shared by several questions. |
| `questions` | see below | |

## Questions and parts

A question has a number `n` (as printed: `"01"`, `"3"`), an optional `stem` (the shared
lead-in), optional `figures`, an optional `source` (the id of a source), and `parts`. Every
markable bit is a part, so a question with no sub-parts still has one part.

| Part field | Example | Notes |
|---|---|---|
| `id` | `"03-2"`, `"3-b-ii"` | Lower-case letters, numbers and hyphens. Unique in the paper. |
| `label` | `"03.2"`, `"3(b)(ii)"` | How the number is printed. |
| `text` | `"Explain why…"` | See *Text* below. |
| `marks` | `2` | |
| `type` | `"short"` | `mcq`, `short`, `calc`, `extended` or `diagram`. |
| `topics` | `["bio/bcell/cell-division/stem-cells"]` | One or more site subtopic keys. The first one is the main tag. |
| `options`, `pick` | `[{ "key": "A", "text": "…" }]`, `1` | Multiple choice only. `pick` is how many boxes to tick. |
| `units`, `prefix` | `"cm"`, `"x ="` | Optional, shown beside the answer box. |
| `lines` | `6` | Optional starting size of the answer space. |
| `background` | `"grid"` | Optional canvas paper: `lined`, `grid` or `blank`. |
| `figures` | | Optional, as for questions. |
| `scheme` | see below | |

**Topic keys** are `subject/topic/group/subtopic`, built from the names on each subject page,
for example *Biology › Cell biology › Cell division › Stem cells* is
`bio/bcell/cell-division/stem-cells`. The check page lists any that don't match.

## Mark schemes

Use whichever of these fit the part:

- `correct`: multiple choice, e.g. `["B", "C"]`. Marked instantly, 1 mark per correct box.
- `numeric`: `{ "value": 12.5, "tolerance": 0.05 }`. The value can be a fraction such as
  `"11/6"`. A matching final answer is marked instantly. Any other answer goes to AI marking,
  so method marks can still be given.
- `exact`: accepted final forms, e.g. `["(x-7)(x+2)", "(x+2)(x-7)"]`. Spaces and the type of minus
  sign don't matter. A match is marked instantly.
- `answers`: model answers shown to the student.
- `points`: marking points, `[{ "text": "…", "marks": 1 }]` (`marks` defaults to 1). Add
  `"max": 3` when more points can be credited than there are marks.
- `levels`: for extended answers, e.g.
  `[{ "level": 3, "min": 5, "max": 6, "descriptor": "…" }]`, running on with no gaps.
- `indicative`: indicative content for level-marked answers.
- `guidance`: examiner guidance, such as what not to accept.

## Text

Question text is plain text with a few marks:

- `**bold**` and `*italic*`
- `x^{2}` for superscript, `CO_{2}` for subscript
- a blank line starts a new paragraph, and a single line break stays a line break

HTML isn't allowed. It's shown as typed.

## Figures

- Image: `{ "type": "image", "src": "vault/img/name.svg", "alt": "What it shows", "caption": "Figure 1", "lineArt": true }`.
  Put images in `vault/img/`. `lineArt` turns black line drawings white on dark themes.
- Table: `{ "type": "table", "caption": "Table 1", "head": ["…", "…"], "rows": [["…", "…"]] }`.
- Text extract: `{ "type": "text", "caption": "Source A", "body": "…" }`.

## Sources

Extracts or items used by several questions go in the paper's `sources`:
`{ "id": "item-a", "title": "Item A", "body": "…", "figures": [] }`. Then give each question that
uses it `"source": "item-a"`.

## Copyright

This repository and the website are public. Exam board papers and mark schemes are copyright
of the board, and many contain third-party extracts. Check you're allowed to republish a
paper before adding it here.

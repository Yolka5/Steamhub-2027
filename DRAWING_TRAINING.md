# Drawing training

A place to keep improving the drawings Steamhub makes from STEP uploads. Admin only, at
`/manufacturing/drawings`, linked from the label page. Nothing here reaches the workshop: training
parts live in their own tables and their own storage folder, never in `parts`.

The loop:

1. **Upload** STEP assemblies. They're split into parts the same way a real upload splits them
   (same worker, same engine), and every made part gets its drawing.
2. **Claude checks** every training drawing with the same `part_review` prompt the real upload uses
   (about $0.015 a part).
3. **Review** one drawing at a time. G = looks right. Otherwise: tap the drawing for a numbered pin,
   drag for a box, each with a note. Tick fix chips. Correct what the engine picked (made/bought,
   route, material, shape). Mark each of Claude's findings right or wrong. Enter saves.
4. **Claude's notes**: "Update Claude's notes" asks Claude to turn the feedback into short rules.
   Each rule is approved, edited or dropped by an admin. Approved rules (at most 30) are added to the
   `part_review` prompt for real uploads and training uploads alike.
5. **Engine updates**: when Yoni says *"look for engine updates"* in a Claude session, Claude follows
   the procedure below, changes the engine, and Yoni re-checks the redrawn examples.

## Decisions (round 1, 2026-11-22)

| # | Question | Answer |
|---|---|---|
| 1 | Where training parts live | Own tables (`drawing_*`), own storage folder `parts/training/` |
| 2 | What you drop | Assemblies, split like a real upload. Bought parts kept, no drawing |
| 3 | Same shape twice | One example per shape (sig); repeats are counted and skipped |
| 4 | Reviewing | One big drawing at a time. ← → move, **G** looks right, Enter save, S skip |
| 5 | Marks | Tap = numbered pin, drag = box, each with a note |
| 6 | Fix chips | Views, Dimensions, Scale, Bends, Holes, Layout, Other. CNC has no "missing dimensions" |
| 7 | Engine picks | Made/bought, route steps, material, shape class. Scored by Re-score all on the Engine updates tab |
| 8 | Claude on training parts | Yes, and each finding is marked right or wrong |
| 9 | Claude's memory | Distilled rules, approved one by one, at most 30 in the prompt |
| 10 | Engine updates | The procedure below, with before/after re-checks |
| 11 | Who | Admins only |
| 12 | Real parts | Later: a "Teach" button that copies a real part into the training set |

Pictures were made (`Creations/drawing-training-*.jpg`); the clickable demo was skipped on request.
Steamhub's own tokens: the main button and selected chips are orange (`--main`).

## Data

Migration `supabase/migrations/20261128_drawing_training.sql`. Every table is admin only (RLS
`is_admin()`); the `claude` function uses the service role.

- `drawing_uploads`: one per dropped file set. Counts of parts, drawings, bought, repeats. `test`
  marks rows made while testing, so they can be removed.
- `drawing_examples`: one per distinct shape (`sig` unique). Name, qty, size, geometry path, and what
  the engine picked at upload: `custom`, `machine`, `route`, `why`, `material`, `cls`. Claude's
  findings (`claude_findings`, `claude_at`, `claude_engine`). `status`: todo / right / corrected / skipped.
- `drawing_reviews`: one per example per engine version. `verdict` right / corrected / skipped, and
  for a re-check after an engine update: fixed / partly / not_fixed / worse / still_right / broke.
  `fixes text[]`, `marks jsonb` (pins and boxes in drawing fractions, with notes), the corrected
  `made`, `route`, `material`, `cls`, `claude_marks jsonb` (each finding right or wrong), `note`,
  `drawing_path` (the drawing as reviewed, gzipped SVG, so "before" survives an engine change) and
  `engine_meta` (cls, template, scale).
- `drawing_lessons`: Claude's notes. `text`, `kind` (drawing / route / bought / engine_gap),
  `sources` (how many corrections), `status` proposed / live / dropped.

`ENGINE_VERSION` in `src/lib/drawing.ts` is stamped on every review. Bump it with every engine change.

## Claude

The `claude` function:
- `part_review` takes either `part_id` (real upload, as before) or `example_id` (training). Both get
  the live lessons appended to the system prompt. Training findings are stored on the example, not
  in `part_reviews`.
- `drawing_notes` (admin only): reads reviews since the last notes plus the current rules, and
  proposes new rules as `proposed` lessons. About $0.10 a run.

## Look for engine updates (the procedure)

When Yoni says **"look for engine updates"**:

1. Read the open feedback: every `drawing_reviews` row on the current `ENGINE_VERSION` with verdict
   `corrected`, plus re-checks that came back `not_fixed`, `partly`, `worse` or `broke`. Group by fix
   chip, shape class and route, and read the pin notes.
2. Write a short list of proposed engine changes, each with the number of examples behind it and the
   files it touches (`src/lib/drawing.ts`, `src/lib/step/engine.js`, `src/lib/step/classify.js`,
   `src/lib/mfg.ts` for material). Wait for Yoni to pick. CNC drawings stay minimal (width and bearing
   checks only) unless Yoni says otherwise.
3. Make the picked changes and bump `ENGINE_VERSION`.
4. Re-score: on the page's **Engine updates** tab, press **Re-score all** (in the dev server, signed in
   as admin). It runs today's engine on every reviewed example: route and made/bought against the
   right answers, shape class, and which drawings now come out different (shape, template, scale).
   Note the numbers before and after the change.
5. Yoni opens **Engine updates** on the page: each example reviewed on an older engine shows the old
   drawing next to the new one. Fixed / Partly / Not fixed / Worse (G = fixed); a "looks right"
   example gets Still right / Broke. Those answers are the score, and the next "look for engine
   updates" starts from what's still open.
6. If a rule in Claude's notes was an engine gap that is now fixed, drop it.

## Phases

1. **Database**: the migration above. Applied by hand in the SQL editor if `apply_migration` is blocked.
2. **Upload and review page**: `src/pages/mfg/Drawings.tsx`, `src/lib/training.ts`, styles at the end
   of `src/styles/mfg.css`, the route in `App.tsx`, a link from the label page.
3. **Claude**: `example_id` and lessons in `part_review`; `drawing_notes`; the Claude's notes tab.
4. **Engine updates**: the before/after tab and Re-score all.
5. **Test** on dev with the 2026 intake assembly (upload marked `test`), then remove the test rows
   and files.

## Built (2026-11-22)

All phases are built. The database and the `claude` function are live; the app code is local and
not committed, so steamhub1577.com shows the page once it's committed and deployed.

- **Database:** `20261128_drawing_training.sql`, applied on live.
- **Function:** `claude` version 5 (example_id in `part_review`, `drawing_notes`).
- **App:** `src/pages/mfg/Drawings.tsx` at `/manufacturing/drawings`, `src/lib/training.ts`,
  `ENGINE_VERSION` and `trainingDrawing()` in `src/lib/drawing.ts`, `checkExample` and
  `writeDrawingNotes` in `src/lib/claude.ts`, styles at the end of `src/styles/mfg.css`, a link from
  the label page.

Tested on dev with the 2026 intake assembly, as a test upload. All test rows and files were removed
afterwards.
- Upload: 84 parts, 48 drawings, 36 bought, in about a minute. Claude checked the 48 for $0.67.
- Review: pins, boxes, fix chips, route correction, Claude right/wrong, G and Enter all saved as
  expected, with the drawing snapshot and engine meta.
- Claude's notes: with 2 reviews, Claude correctly proposed nothing (rules need two reviews).
- **Notes at the end of the system prompt were ignored**: a "don't flag cross holes" note left the
  cross-hole finding in place. Notes now go in the request, right before the answer, and say they
  win over the general checks (never over the fixed rules). With that, the finding went away.
- Engine updates: before/after drew, G saved "fixed", Re-score all gave route, made/bought and shape
  scores and listed the route miss.

Found on the way (not changed, waiting for "look for engine updates"): Claude flagged swapped
diameter labels on 6 of the 48 intake drawings (turned parts with a bore: the Ø of the bore points at
the outer circle and the other way round). That's an engine bug, the same one ONSHAPE.md phase 4 saw.

Not done:
- Real parts can't be copied into the training set yet (decision 12, later).
- The page is desktop-first. It works on a phone, but tap-to-pin is fiddly on a small screen.

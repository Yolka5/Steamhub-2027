# Manufacturing plan

Tom's STEP → BOM + Drawings tool, rebuilt as Steamhub's Manufacturing section. Written 2026-11-07 from a long Q&A with Yoni. Each phase below is meant to be one or two chats: read this file, do the next unfinished phase, tick it off here.

Source: `Creations/Tom's Stuff/1577 STEP → BOM + Drawings (Copy).html` (gitignored). Lines 103–1904 are the engine (pure JS, no libraries). Lines 1905–3098 are UI and claude.ai storage, which we don't keep.

## Why this shape

Last year the team used a Monday board, grouped by mechanism. It showed number, name, quantity and machine (CNC, Lathe, Mill, 3D print), with statuses To-do, In progress and Done. The workshop lead typed it in by hand, about an hour per mechanism, and the workshop worked from it on their screen. It worked because it was simple, but it was too manual and carried too little info. Yoni's own attempt failed on too many fields, too many clicks, poor phone support and per-person views.

So the rules are:

- **Upload does the typing.** Drop in a STEP file and every part is listed, numbered and classified, with a drawing. Nobody types a part list.
- **The workshop screen is as simple as Monday.** One list, the same for everyone, big touch targets, phone-first, with nothing that only works on hover.
- **Every added field must earn its place.** If it can be filled automatically, it is. If it can't and it's rarely needed, it isn't there.
- **No personalised views.** Filters live in the URL and everyone sees the same screens.

## Decisions

- **Robots.** Each season has several robots (2027 V1, 2027 V2, maybe prototype or wood). V2 is a separate robot built from scratch; V1 stays assembled. Creating V2 can copy V1's subsystem list (numbers, names, leads) but no parts.
- **Subsystems** (Tom called them sections). Each has a number, name, lead and members. The number varies by season but stays the same across V1 and V2. Creating one asks for the number, the name and the lead, picked from accounts. This is the one shared mechanism list: stock reservations, mechanism weight and the calculator link to it.
- **Part numbers.** Subsystem number × 1000 + n, so intake 3 gives 3001, 3002… They're given on the first upload, sorted by machine then size as Tom does. After that they never change. On re-upload, new parts take the next free number and numbers of cancelled parts aren't reused. V1 and V2 can both have a 3001; the robot name on the drawing tells them apart. The old sheet used a long format (`2230-26-FB-0216`) with sub-assembly codes. We're not using it now, but changing the format later should be a one-place change (`partNo()` in one file).
- **Machine** is its own field: CNC, Lathe, Mill, 3D print or Bought. Tom's engine guesses it from shape and name, and anyone can change it.
- **Status:** To-do → In progress → Done, plus Cancelled. Bought parts use Needed → Got it, or Missing.
- **In design vs released.** Uploaded parts start **in design** and only show on the subsystem page. Anyone selects parts and taps **Release**, and those parts go to the workshop list. Parts can be released while others are still in work; there's no whole-mechanism gate.
- **Urgent.** Anyone can mark a part urgent. Urgent parts sit at the top of the workshop list in the warning colour.
- **Claiming.** One tap on **I'll make it** sets you as maker and moves the part to In progress. **Done** is one more tap. The maker is your account, never typed.
- **Changes after release.** On re-upload, each part is classed as unchanged, changed, new or gone:
  - Unchanged: same geometry signature.
  - Changed: same name, different signature. The part keeps its number. If it was released, its lead and maker get a warning, and the lead decides (remake, or keep as is).
  - New: gets the next number, in design.
  - Gone: marked Cancelled. If it was in progress or done, the lead gets a warning.
- **Permissions.** Sign-in is required for the whole site, Stock and Tools included. Anyone with a Google account can sign in, and Yoni (the only admin) gets a notification for every new account and can ban it. Everyone signed in can do everything. Admin powers are only banning and deleting robots.
- **Notifications.** In Steamhub first: a badge on the rail and tab bar, plus a list. Email comes next, phone push after that (that needs Steamhub added to the home screen).
- **Drawings** are English only; CAD never uses Hebrew. The title block shows STEAMPUNK 1577, robot, subsystem, part number, material, scale, quantity, "drawn by" and "manufactured by". "Drawn by" is whoever uploaded the STEP; "manufactured by" is whoever claimed the part. Tolerance on 3D-printed parts is ±0.15. Machined parts get no tolerance field; the workshop handles it.
- **Outputs.** Drawings are PDF. The CNC team uses Estlcam, which takes DXF. 3D printing uses STEP (per part). Drawings print from a USB stick because the printer has no Wi-Fi. A batch is whatever is ready in one subsystem; subsystems never mix. The workshop selects parts and downloads one combined PDF to put on the stick. Each part also has its own PDF download.
- **Material.** The STEP doesn't carry it. Until the Onshape API is in, Steamhub guesses (plate thickness + name → "Aluminum 5"), and the uploader can change it from a short list. Once the Onshape API is in, it reads the material set in Onshape.
- **Bought parts.** There's no COTS inventory, because documenting it would take months. Whoever collects a bought part taps **Got it** or **Missing**. Missing parts go to the **wishlist** for Uri (head mentor), and anyone can also add a wishlist item by hand. Wishlist columns are item, qty, vendor, link, price, subsystem and who asked. **Export** makes a file to paste into a new Google Sheet, which Uri starts fresh each time.
- **Plates** (CNC stock) have no IDs and are found by size. The current list is aluminum only, and polycarb gets added at the next stock count. Each plate is Available → Partly used → Gone, with no offcut sizes. Whoever cuts from it (the CNC team, on their PC) taps Partly used or Gone. Data comes from the plate sheet (below), by one-time import plus a "Sync now" button that takes a pasted sheet link and reads the first tab.
- **End mills** are tracked too: flutes, diameter and qty, from the same sheet's last tab.
- **Tubes and profiles** in a part list suggest matching stock (existing Find), one tap reserves the piece for that part, and when the part is Done, Cut runs with the length from the drawing.
- **Subsystem status and weight** are automatic. Status runs in design → in production → ready for assembly (every part done or got) → assembled (a manual tick). Weight comes from reserved stock today and from Onshape mass properties later.
- **Assembly guide and bolt table** are in. Assemblers would use the guide.
- **Navigation.**
  - Desktop rail: Home, Stock, Manufacturing, Tools, Handbook.
  - Phone tab bar: Home, Stock, Add, Make, Tools. Handbook moves into the Tools page on phones (it's mostly read on desktop), and the workshop needs Make on phones.
- **Design.** Each UI phase loads the ttm-design skill and uses the existing tokens and components in `src/styles` and `src/components`. Nothing from Tom's look carries over.

## Data

Sheets:

- Plate stock: the team's plate Google Sheet. Its link lives in Steamhub (Plates → Sheet settings), not in this public repo. First tab, columns thickness, length, width, qty (blank = 1). The "3–4" and "5+" tabs repeat rows from the first tab; don't import them. Tab "כרסומים" holds end mills (flutes 1–3 × diameter 3–6 mm, with counts).
- Last season's tracking sheet (2026 V2), for reference only; Yoni has the link.

New Supabase tables (one migration per phase, RLS on everything):

| Table | Holds |
|---|---|
| `profiles` | id (auth uid), name, email, avatar, is_admin, banned, created_at, last_seen. Filled by a trigger on sign-up. Yoni's is_admin is set by hand. |
| `robots` | id, name, season, created_by, created_at, archived |
| `subsystems` | id, robot_id, number, name, lead_id, assembled (bool), created_at |
| `subsystem_members` | subsystem_id, user_id |
| `step_uploads` | id, subsystem_id, path in storage, filename, uploaded_by, uploaded_at, part_count |
| `parts` | id, subsystem_id, part_no, sig, name, qty, machine, material, size (mm, 3 numbers), cls (plate/tube/long/round/print/block), status, released_at, urgent, maker_id, notes, changed (bool, cleared by the lead), geometry path, own_pdf path, piece_id (tube stock), plate_id, last_upload_id, timestamps |
| `part_events` | part_id, action, by_id, details, at (history, like `piece_events`) |
| `notifications` | id, user_id, kind, text, link, read_at, created_at |
| `wishlist` | id, item, qty, vendor, link, price, subsystem_id, asked_by, status (open/exported/bought), created_at |
| `plates` | id, material, thickness, length, width, qty, state (available/partly_used/gone), updated_by, updated_at |
| `end_mills` | id, flutes, diameter, qty |
| `settings` | key, value (plate sheet link, last sync time) |
| `hardware` | subsystem_id, key, type override, qty, status, collected_by (bolt table rows) |
| `guide_progress` | subsystem_id, step key, done_by, done_at |

Existing tables change: `pieces` gets `subsystem_id` (nullable, kept alongside the `reserved_for` text). Every policy moves from public read to signed-in and not banned, through one helper function, `is_member()`.

Storage (private buckets, signed-in read):

- `step`: uploaded assembly STEPs. Supabase's free plan caps a file at 50 MB, which is enough for a mechanism.
- `parts`: per-part geometry (gzip JSON of the engine's edges/faces) and per-part STEP for printed parts.
- `drawings`: PDFs someone uploaded to replace the generated drawing.

**Why per-part files:** parsing a whole assembly STEP is heavy, fine on a CAD laptop but slow on a workshop phone. The upload runs once on the uploader's machine and saves each part's geometry. After that, any phone builds a part's drawing in about a second from its small file, always with the current title block (material, maker). Bolt table and assembly guide need the full assembly, so they run on desktop and save their results.

## Engine port

- Copy lines 103–1904 into `src/lib/step/engine.js` (plain JS with exports added; type the edges in `engine.d.ts`). Don't rewrite the geometry. Tom keeps improving his copy, and a close copy keeps his changes easy to port.
- Run parsing in a Web Worker (`src/lib/step/worker.ts`) with progress messages, so the page never freezes.
- Fixes to make while porting (from the review of Tom's file):
  - The note "geometry could not be read" is set and then wiped on the next line (`buildProject`). Keep it, and show those parts with a warning instead of silently calling them Bought.
  - DXF writes holes as short line segments. Write true CIRCLE and ARC entities, since Estlcam handles them far better.
  - Drawing note 3 is missing a word: "USE ␣ FOR UNSPECIFIED GEOMETRY". It should be "USE STEP FOR UNSPECIFIED GEOMETRY".
  - The tolerance field is always empty. Fill in ±0.15 for 3D-printed parts.
  - The bolt finder is metric only (M3–M8, holes ≤ 7.2 mm). Add #10-32 and 1/4-20. Reuse `src/lib/threads.ts` for tap and clearance sizes instead of Tom's own table.
  - The tighten step in the guide always says "4 mm hex key, 8 mm wrench". Take tools from the joints actually found.
  - Delete the old unused guide generator.
  - Later: hidden lines on fillets and freeform faces, which are only handled for flat, cylinder and cone faces now.
- Add per-part STEP export: write a standalone STEP from the entities one part's shape references (header + units + that subgraph).

## Phases

Tick a phase here when it's done and checked in the browser.

### Phase 1: sign-in, robots, subsystems, upload → part list (built 2026-11-07)
- [x] Migration `supabase/migrations/20261107_manufacturing_1.sql`: `profiles` (+ sign-up trigger that notifies admins), `is_member()`, `is_admin()`, `robots`, `subsystems`, `subsystem_members`, `step_uploads`, `parts`, `part_events`, `notifications`; buckets `step`, `parts`, `drawings`. Applied.
- [ ] **Run `20261107_manufacturing_2_signin.sql` when this is deployed.** It moves stock, materials, locations and the calculator robot from public read to signed-in. Held back so the live site keeps working until the sign-in gate ships.
- [x] Sign-in screen in front of the whole app; banned accounts see "No access".
- [x] Notifications: table, live bell with count on rail and top bar, `/notifications` list.
- [x] Admin: People and bans (`/people`) from the account menu, admin only. Yoni's profile has `is_admin`.
- [x] Engine port into `src/lib/step/` (engine.js + engine.d.ts), worker, per-part STEP (`partStep.ts`), fixes that touch parsing.
- [x] Pages: `/manufacturing/robots`, `/manufacturing/r/:id` (subsystem cards), `/manufacturing/s/:id` (drop zone, In design / Released / Bought / Cancelled lists with inline machine and material), re-upload with unchanged/changed/new/gone. Checked with the marathon intake: 418 part files → 102 parts; re-upload → 102 unchanged.
- [x] Upload takes one assembly STEP, several part files, or a dropped folder (Onshape's "each part as its own file" export); identical parts merge into a quantity. Unreadable files in a folder are skipped and counted.
- [x] New robot and new subsystem forms, "copy subsystems from".
- [x] Rail (Manufacturing), phone tab bar (Make), Handbook card on Tools for phones, Home quick link.
- [ ] Ctrl K finds robots, subsystems and part numbers. Only the Manufacturing pages are in Ctrl K so far.
- [ ] Members per subsystem (table exists, no UI yet).

### Phase 2: workshop list, drawings, batch PDF, DXF (built 2026-11-07)
- [x] Release (pick parts → Release, or Release all) and Urgent on the subsystem page.
- [x] `/manufacturing`: the workshop list. Released parts of active robots, grouped by subsystem, urgent and in-progress first. Machine and subsystem filters plus Show done, in the URL.
- [x] Part page `/manufacturing/p/:id`: drawing, I'll make it / Done (Got it / Missing for bought), Remake / Keep when changed in CAD, machine and material, urgent, notes, PDF, DXF and STEP buttons, history.
- [x] Drawings built in the browser from the part's geometry file with the live title block (±0.15 on printed parts).
- [ ] Upload your own PDF to replace a generated drawing (bucket `drawings` and column `own_pdf_path` are ready).
- [x] Drawings sheet per subsystem → one combined PDF named `<robot> <subsystem> <date>.pdf`. Checked: 6 parts in about 3 s.
- [x] DXF with true circles and arcs and straight edges joined; batch DXF zip for CNC parts.
- [x] Per-part STEP for 3D-printed parts.
- [x] Realtime: lists and the part page update live.

Test data: robot "Test robot (marathon intake)", subsystem 3 Intake. Archive it from the robot page when you're done with it.

### Phase 3: plates, end mills, stock matching (built 2026-11-07)
- [x] Migration `20261107_manufacturing_3.sql`: `plates` (one row per physical plate, `source` sheet/manual), `end_mills`, `settings`, `pieces.subsystem_id`, `parts.plate_id`, `parts.piece_id`, `wishlist`. Applied.
- [x] `/stock/plates`: cards per thickness (count, m², low-stock tag under a setting, default 0.5 m²), filter by thickness and material, Available / Partly used / Gone per plate, add plates by hand (aluminum or polycarb). Linked from Stock.
- [x] `/stock/end-mills`: by flutes and diameter, with − / + counts.
- [x] Sheet sync: edge function `supabase/functions/sync-sheet` (deployed). Reads the sheet as CSV by link, so no Google key. Admin sets the link, end mills tab and low-stock level under "Sheet settings"; anyone can press Sync. First run: 110 plates and 12 end mill sizes, totals matching the old site.
- [x] CNC part page: plates that fit (same thickness ±0.2, 5 mm margin each side), partly used first, identical plates grouped. "Some left" / "Used up" marks the plate and links it to the part.
- [x] Tube, round and hex parts: matching stock (round and hex ±0.2, profiles ±0.5), length = all copies plus a 3 mm kerf between them. Reserve links the piece to the part and subsystem. Done on the part runs Cut and shows the leftover to write on the piece.
- [x] Reserve sheet in Stock picks the subsystem from Manufacturing's list (or "Something else"). `/stock/mechanisms` still groups by the reserved-for text, which now matches subsystem names.
- [ ] Profiles in stock (coming in about a week). Matching already handles them as `rect_tube`.

### Phase 4: change warnings, bought parts, wishlist, subsystem status (built 2026-11-07)
- [x] Changed and gone parts notify the lead and maker; "Remake" / "Keep as is" on the part (built in phase 1–2).
- [x] Bought parts: Needed / Got it / Missing on the subsystem page and the part page. Missing adds a wishlist row once; Got it marks it bought.
- [x] `/manufacturing/wishlist` (third tab): add by hand, Open / Bought, "Copy for Google Sheets" (tab-separated, pastes into columns) and CSV, Bought / Remove.
- [x] Subsystem status worked out from parts; "Mark assembled" appears when everything is made and collected. Subsystem page shows bought parts collected and kg of stock reserved.
- [ ] Email notifications. They need an email-sending account (for example Resend) and its key in Supabase secrets. Phone push after that.

### Phase 5: bolt table and assembly guide (built 2026-11-07)
- [x] Migration `20261107_manufacturing_4_guide.sql`: `step_uploads.analysis_path`, `hardware` (joint types and collected items per subsystem), `guide_progress`, and a settings policy so every member can edit `hardware_stock`. Applied.
- [x] The upload keeps the worker open after parsing. With Steamhub's part numbers and machines, it works out joints (`findJoints`), the build order (`buildSequence`) and every picture (`renderScene`, 640 × 400, as vector data). It saves `analysis.json.gz` plus `guide-N.json.gz` chunks of 12 step pictures in the `parts` bucket. Only single assembly files have positions; loose part files get no bolts or guide.
- [x] Engine: #10-32 and 1/4-20 (tap drills, inch lengths named as fractions, nuts, washers, hex keys and wrenches). The tighten step lists the tools for the bolts actually found. Prep never taps bought parts. Only bought parts count as bearings.
- [x] `/manufacturing/s/:id/bolts`: what to collect (+10%, "Got it" with your name), joints with a thumbnail, type (changeable), parts and stack, open holes folded away, CSV.
- [x] `/manufacturing/s/:id/guide`: tools, phase list that jumps, 158 steps for the 2026 intake with shared ticks, pictures that load as you scroll, PDF (cover + one page per step).
- [x] "Hardware we stock" on the Bolts page: metric and inch bolt lengths, nylock or plain, heads, rivets, notes (`settings.hardware_stock`). Bolt lengths are picked from it.
- Checked on `Creations/Test STEP/Full Season Flow test/Intake 2026 Season/1577-2026-3000.step`: 84 parts, 70 joint types, 22 items to collect, 158 steps, upload 36 s, PDF 16 s.
- [ ] Guide text is written at upload, so a joint type changed later shows in the bolt table but not in the guide until the next upload.
- [ ] Tom's joint cross-section drawings (`jointSVG`) aren't ported; the thumbnail shows where each joint is instead.

**At robotics: fill in Hardware we stock** (any subsystem → Bolts → Hardware we stock):
- Bolt heads you use and in which sizes (socket cap, button, countersunk; M3, M4, M5, M6, #10-32, 1/4-20).
- Bolt lengths you actually stock, metric in mm and inch in inches (3/8, 1/2, 1-1/4…).
- Nylock or plain nuts; washers.
- Rivets: diameter and the grip ranges you buy.

### Bringing in Tom's updates (next, before phase 6)
Tom keeps improving his artifact in claude.ai (he's connecting Claude to it and adding features). When he's done:
- The baseline is today's copy, `Creations/Tom's Stuff/1577 STEP → BOM + Drawings (Copy).html` (downloaded 2026-11-07). Don't overwrite it; save his new version next to it with a new name.
- Diff his engine section (the first `<script>`, from the STEP parser to `clusterInstances`) between the two copies and apply the changes to `src/lib/step/engine.js`. Every Steamhub change in engine.js says "Steamhub:" in a comment, so keep those when merging.
- His UI half has no code to copy over (it's all rebuilt in React), but read it for new features and rebuild them in Steamhub's design.
- Re-run `scratchpad`-style checks on `Creations/Test STEP/Full Season Flow test/Intake 2026 Season/1577-2026-3000.step`: parse, joints, steps, drawings.

### Phase 6: Onshape API (on hold until Tom's updates are in)
- [ ] Everyone has their own Onshape account on the Education plan, which includes API access. Decide between one team API key in a Supabase secret and each person signing in to Onshape (OAuth).
- [ ] A subsystem stores its Onshape document and assembly link. **Re-sync** fetches the STEP and runs the same upload path.
- [ ] Read each part's material and mass from Onshape, so drawings show the real material and subsystems show CAD weight.

## Later, not planned yet

- Sub-assembly or revision codes in part numbers (FB, FBV2) if the team wants them back.
- Polycarb plates, at the next stock count.
- COTS inventory, if someone ever documents it.
- QR stickers on stock.

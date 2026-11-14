# Onshape connection plan

Steamhub reads from Onshape so it stops guessing. A subsystem is linked to its Onshape assembly, and one **Sync from Onshape** button brings in each part's real material and mass, where each part comes from (made or bought), and later the STEP itself. Claude reads the synced data to answer questions, check uploads and write better recaps.

Status: phases 0 to 3 built on 2026-11-14 and tested on live with test data; see **Built** below. Not committed. Yoni goes over what needs changing next. A clickable demo of the screens with fake data is `Creations/onshape-demo.html`, built by `node Creations/onshape-src/build.cjs` from the app's real CSS. Open it with `#synced`, `#robot` or `#connect` to land on a state. This replaces phase 6 in [MANUFACTURING.md](MANUFACTURING.md) and no longer waits for Tom's updates.

## What this is, and what it is not

- **It is not a browser extension.** Nothing is installed in Chrome and nothing runs inside the Onshape page. It is a server-side link: a Supabase edge function calls Onshape's official API, and the results land in Steamhub's database.
- **It only reads.** The API keys are created read-only, so Steamhub cannot change, move or delete anything in CAD, even by mistake.
- **It does not replace FRCShaper.** The team uses FRCShaper as it is for assembly work (decided 2026-11-14). We are not building our own version.
- **Claude never calls Onshape directly.** Claude reads what was synced into Supabase, so a question or a recap costs zero Onshape calls.

## How it works

```
Onshape document                Steamhub
┌──────────────────┐   3 calls  ┌──────────────────────────┐
│ assembly         │ ─────────► │ edge function `onshape`  │
│  parts, material │  (your own │  uses the caller's key   │
│  mass, sources   │   API key) │  counts every call       │
└──────────────────┘            └────────────┬─────────────┘
                                             ▼
                                ┌──────────────────────────┐
                                │ Supabase: parts,         │
                                │ subsystems, onshape_sync │
                                └──────┬───────────┬───────┘
                                       ▼           ▼
                              Manufacturing     Claude (gateway)
                              pages, drawings   checks, recaps, questions
```

1. Each person connects their own Onshape account once, by pasting an API key into Steamhub.
2. A subsystem lead pastes the assembly's Onshape link on the subsystem page.
3. Any member presses **Sync from Onshape**. The edge function calls Onshape with that person's key (or the lead's, if they have none), matches Onshape's parts to Steamhub's parts, and saves the result.
4. Steamhub shows the real material on drawings, the weight on the subsystem and the robot, and flags anything odd.

## Phase 0 results (2026-11-14, on the 2026 V2 intake and robot)

Run with Yoni's key on `V2 Intake Assembly` and `1577 STEAMPUNK 2026 - CERBERUS V2`. 13 counted calls. What came back, and what it changed in this plan:

- **It works.** Plan is EDU Standard. Basic auth with the key pair is enough. One call returns the whole bill of materials: 85 rows for the intake, 487 for the robot.
- **The call:** `GET /api/v10/assemblies/d/{did}/w/{wid}/e/{eid}/bom?indented=false&multiLevel=true&generateIfAbsent=false&onlyVisibleColumns=false`. With `generateIfAbsent=false` nothing is written to the document. Sub-assemblies come back flattened.
- **Fields per row:** `headerIdToValue` keyed by header id (look the id up by header name in `headers`): Name, Quantity, Material (an object, use `displayName`, for example "Aluminum - 6061"), Mass (a string with its unit, "227.541 g"), Part number, Description, Vendor. `itemSource` has `documentId`, `elementId`, `partId`, `wvmType`, `wvmId`, `isStandardContent`, `viewHref` (the Open in Onshape link).
- **Mass adds up.** The rows' mass times quantity sums to 7.199 kg, exactly what `massproperties` returns for the intake. So Steamhub can add rows up itself and leave prints out.
- **Printed parts are marked by material** in Onshape ("3D Printed PLA"), which is a second way to spot them besides the machine.
- **Parts live in many documents.** The intake alone pulls from 31 documents and the robot from 143: the team keeps almost every part in its own document, and MKCad has one document per part family. The "one tap per unknown document" idea would have meant dozens of taps, so it is replaced (see Made or bought).
- **Public means library.** `GET /documents/{did}` shows MKCad documents as `public: true`, owned by someone outside the team. Team documents are `public: false`. One call per document, once, then remembered for every subsystem.
- **The robot assembly knows its subsystems.** Its top-level rows are the six subsystem assemblies ("1577-2026-3000"), and each row's `itemSource` is that subsystem's document and tab. Steamhub can pair robot rows with linked subsystems by those ids, with no setup.
- **CAD mass has mistakes worth flagging.** The 2026 robot reads 185.9 kg: a "constant force spring" is set to 50 kg (×2) and two HDPE bumper parts read 13 kg each. A "heaviest parts" list and a flag on any single part over 5 kg catch these.
- **Names match the STEP exactly.** All 71 distinct names in the bill of materials appear as product names in the exported STEP. But names repeat: nine different parts are called "Part 1". Those can't be paired by name.
- **STEP export works and is quick.** `POST …/assemblies/…/translations` with `{"formatName":"STEP","storeInDocument":false}`, one status check about 15 s later said DONE, then `GET /documents/d/{did}/externaldata/{id}` returned a 15.9 MB file. 3 calls, nothing stored in the document.
- **Rate limits:** the translation endpoint allows about 10 a minute; the others 250 to 400.
- **Yoni's key is not read-only** (its scopes include write). Steamhub only ever sends reads and the export, but a read-only key is still the safer choice when the real keys are connected.

## Decisions

- **Keys: each person's own** (Yoni, 2026-11-14). Everyone has their own EDU account, so everyone gets their own 2,500 calls a year. A sync spends the calls of whoever pressed the button.
- **No key, still works.** A member who hasn't connected presses Sync and it runs with the subsystem lead's key, or Yoni's if the lead isn't connected. So only leads really need to connect. The page says whose key was used.
- **Access:** Yoni's account can open every subsystem's document, so his key is the last fallback. A lead's key only works if the lead's account can open that document; if Onshape answers "no access", Steamhub falls through to Yoni's key and says so.
- **Nightly sync, if the CAD changed.** People rarely make versions, so nothing waits for one. Before the 02:00 recap, each linked subsystem and robot gets a 1-call check with its lead's key, and a light sync only when something changed.
- **Who links:** the subsystem's lead, the captain and admins paste or change the Onshape link and set the weight target.
- **Material on drawings:** Onshape's name plus the thickness Steamhub measures, as in "Aluminum 6061 · 5 mm". Non-plates show the Onshape name alone.
- **3D-printed parts are left out of weight.** CAD mass is solid and prints are not, so they count as zero and are listed under "not weighed".
- **The full robot assembly is linked to the robot.** Robot weight and centre of mass come from it, so parts that belong to no subsystem (electronics, bumpers) are included.
- **Flags** show on the subsystem page. Only weight sends a push to the lead: a jump over the threshold, or going over the target.
- **Materials are already set in Onshape** by the team, so material and mass will come back filled. A part with no material is flagged instead of silently weighing zero.
- **Read-only keys.** When creating the key in the Onshape developer portal, only the read permission is ticked. Writing back to Onshape (part numbers, for example) is in "Later" and would need a separate decision.
- **Sync reads the workspace as it is now**, not a named version. Nobody has to create a version before syncing. Steamhub stores the workspace's microversion id, so the next sync can tell in one call whether anything changed at all.
- **Onshape is a strong hint, people still win.** A made/bought or material value that someone set by hand in Steamhub is not overwritten by a sync. It shows "Onshape says …" next to it instead.
- **Who may sync:** any member (Yoni, 2026-11-14).
- **Made/bought from a sync** is applied automatically while a part is in design. Once a part is released, the sync only shows a hint and a person decides.
- **Weight is in kg** everywhere. The season's limit is entered in kg.
- **The robot's CAD is spread over a few documents**, and the number is not known yet. Nothing assumes one document per subsystem: a subsystem links to one assembly tab, wherever it lives, and several subsystems can link into the same document.
- **English only** in the UI, as everywhere outside the Handbook.

## The call budget

Every successful call made with an API key counts against that person's 2,500 a year (EDU plan). Failed calls (4xx, 5xx) do not count. Webhook messages sent by Onshape do not count.

| Action | Calls | Notes |
|---|---|---|
| "Anything changed?" check | 1 | Reads the workspace's current microversion. If it matches the last sync, stop here. |
| Light sync (material, mass, sources) | 3 | Microversion check + bill of materials + assembly mass properties |
| Full sync (light sync + STEP) | 6 | Adds: start the STEP export, 1–2 status checks, 1 download (measured: 3) |
| First sync of a subsystem | up to 40 more, once | One lookup per source document not seen before. The 2026 intake would need about 22. |
| Connect test (when pasting a key) | 1 | Confirms the key works |
| Nightly, per linked subsystem or robot | 1, or 4 if changed | With the lead's key. About 120 nights in a build season is 120 to 480 calls per subsystem. |

At 6 calls a full sync, one person can run about 400 full syncs a year. The heaviest user is a lead: up to about 500 calls a season for the nightly run on one subsystem, plus the syncs that members without a key run on the lead's key. A lead of two subsystems is still under half the budget. The nightly run skips a lead who is past 2,000 calls.

Rules that keep it that way:
- The edge function is the only thing that calls Onshape. The browser never does.
- Every call is logged with who, which subsystem and which endpoint, and each person sees "312 of 2,500 used" on their account page. This counts Steamhub's calls only; calls the person makes elsewhere with the same account are not visible to us.
- STEP export status checks back off (5 s, 10 s, 20 s) instead of polling fast.
- At 2,000 calls the person gets a warning. At 2,400 Steamhub stops using that key.
- A 429 (rate limit) waits and retries once. A 402 (budget gone) stops and tells the person.

## What gets pulled, and what it changes

| From Onshape | Onshape call | What it changes in Steamhub |
|---|---|---|
| Material per part | Bill of materials | Drawings show the real material; `guessMaterial()` in `src/lib/mfg.ts` becomes the fallback for unlinked subsystems |
| Mass per part | Bill of materials | Real part weight; heaviest-parts list |
| Total mass and centre of mass | Assembly mass properties | Subsystem and robot weight, weight budget, centre of mass |
| Quantity per part | Bill of materials | A check against the count from the STEP |
| Source document of each part | Bill of materials (item source) | Made or bought: a part from FRCDesignLib, MKCad or Onshape standard content is bought |
| Part number and description | Bill of materials | Shown next to Steamhub's own number; helps matching |
| The STEP file | Assembly STEP export | **Re-sync** with no manual export and upload |
| Onshape ids of each part | Bill of materials | "Open in Onshape" links |
| What changed and when | Workspace microversion, checked nightly | Change warnings and CAD activity in SteamLab |

The exact field names in the bill of materials response (material, mass, item source) are from Onshape's API reference and are confirmed on a real team document in phase 0 before anything is built on them.

## Matching Onshape parts to Steamhub parts

Steamhub's parts come from the STEP, so they have a name and a geometry signature but no Onshape id. The first sync has to pair them.

1. **By name.** The STEP comes from the same assembly, and phase 0 showed the names are identical. A name that appears once on both sides is a match.
   - **Repeated names** ("Part 1" appears nine times in the 2026 intake) are paired only when the quantity singles one out. The rest stay unmatched, under one flag: "9 parts are called Part 1. Name them in Onshape so they can be matched."
2. **Quantity as a check.** A name match with a different quantity is still paired but flagged.
3. **Unmatched list.** Parts found on only one side are shown in a short review list: "In Onshape, not in Steamhub" (new since the last upload) and "In Steamhub, not in Onshape" (renamed or deleted). Nothing is created or cancelled from this list in phase 2; it only informs.
4. **After the first match** the pair is stored by Onshape part id, so a rename in Onshape no longer breaks it.

Once the STEP itself comes through the sync (phase 3), both sides come from the same moment and the unmatched list should be empty.

## Made or bought from Onshape

This becomes the top automatic layer of the part classifier, above shape reading and names, below a person's own choice and the team's labels.

Each part's row says which document it comes from. Steamhub keeps a table of documents it has seen (`onshape_documents`) and looks each new one up once (one call), then remembers it for every subsystem.

- **Onshape standard content** (bolts, nuts, washers): bought, hardware. No lookup needed, the row says so.
- **A public document owned by someone else** (MKCad, FRCDesignLib): a library, so the part is bought.
- **A private document:** a team document. The part keeps Steamhub's own guess, because a team document can also hold a belt or a bearing someone modelled. It is never forced to "made".
- An admin can flip a document between team and library by hand, for the rare public team document or private copy of a library.

Lookups are capped at 40 per sync, so a first sync of a big assembly can't burn a budget. Parts from documents not looked up yet just wait for the next sync. Steamhub skips the lookup for parts it already has as Bought.

Applied automatically while the part is in design; shown as a hint once it is released.

## Weight

All in kg.

- **Part weight** from Onshape's mass, times quantity.
- **Subsystem weight** = the sum of its parts' masses from the bill of materials, without 3D-printed parts. It replaces the "from reserved stock" estimate when the subsystem is linked. (Onshape's own total includes prints at solid density, so Steamhub adds the rows up itself.)
- **Robot weight** comes from the full robot assembly linked on the robot page, added up the same way, shown against the season's limit. The limit is a setting per season, because it changes between seasons. Until the robot is linked, it is the sum of the linked subsystems and says so.
- **"Outside subsystems":** robot weight minus the sum of its subsystems, shown as its own line, so electronics and bumpers are visible.
- **Centre of mass** for the robot comes straight from Onshape. It includes printed parts at solid density, so it is marked approximate.
- **Weight budget:** the lead, captain or an admin sets a target per subsystem. The subsystem tile shows weight against target.
- **History:** each sync stores the total, so a subsystem page can show "gained 0.4 kg since Monday".
- **Not weighed:** 3D-printed parts, parts with no material, and anything not modelled (wiring, tubing). The page says "CAD weight · 6 printed parts and 3 parts with no material not counted" so nobody reads it as the scale weight.

## Flags after a sync

Plain rules, no AI needed, shown as short lines on the subsystem page:

- A made part has no material in Onshape.
- The Onshape material is a plate thickness the team does not stock (checked against `plates`).
- Steamhub's machine and the Onshape source disagree (drawn as CNC, comes from a library).
- A part is still called "Part 7".
- The subsystem gained more than a set amount since the last sync.
- The subsystem is over its weight target.
- A single part weighs more than 5 kg in CAD (the 2026 robot has a 50 kg spring).
- Several parts share a name, so they can't be matched.
- A released part changed in Onshape (after phase 3, through the existing change warnings).

Only the two weight flags push to the lead, through `notifications`. The default weight-gain threshold is 0.2 kg between syncs and is a setting. The rest wait on the page.

## Where Claude fits

All through the `claude` gateway function from the 2026-11-13 plan, which gets built first.

- **Upload check** (the planned "Worth a look" at upload): Claude gets the real material, mass and source for each part, so the made/bought question is mostly answered before Claude sees it and the check is cheaper.
- **Reject reports:** each rejected part carries an "Open in Onshape" link, and the stock check uses the real material.
- **SteamLab nightly recap:** adds CAD lines from sync history, such as "Intake synced twice, gained 0.3 kg, 4 new parts".
- **Ask Claude, in SteamLab:** a question box for mentors and leads. "How heavy is the intake", "which parts have no material", "what changed in the shooter this week" are answered from the synced tables only, with the numbers it used shown under the answer. Each question is one Claude call through the gateway, under the gateway's daily cap. It gets its own pictures and demo round before it is built.

## Database

One migration per phase, RLS on everything, same as Manufacturing. Yoni runs the SQL himself.

New:

| Table | Holds |
|---|---|
| `onshape_accounts` | user_id, connected_at, last_used_at, calls_this_year, year. No key in this table. |
| Vault secrets | Each person's access key and secret key, stored in Supabase Vault under a name tied to their user id. Only the service role can read them, through one function, the same way `steamlab_cron` is kept. |
| `onshape_calls` | id, user_id, subsystem_id, endpoint, status, at. The call log and the counter's source. |
| `onshape_syncs` | id, subsystem_id, by_id, kind (light/full), microversion, total_mass, centroid, part_count, unmatched (json), flags (json), at |
| `onshape_documents` | document id, name, owner, public, kind (team / library), set_by (null when Steamhub decided it), seen_at. One row per source document, filled by a one-time lookup. |
| `settings` rows | Season weight limit (kg), weight-gain threshold (kg) |

Changed:

| Table | New columns |
|---|---|
| `subsystems` | os_document, os_workspace, os_element (parsed from the pasted link), os_microversion, mass_kg, mass_target_kg, last_sync_at |
| `robots` | os_document, os_workspace, os_element, os_microversion, mass_kg, centroid, last_sync_at |
| `parts` | os_part_id, os_source_document, os_material, os_mass_kg, os_part_number, material_by (guess / onshape / person) |

Keys never reach the browser after they are pasted: the Connect form sends them once to the edge function, which stores them in Vault and returns only "connected".

## The edge function `onshape`

One function, fixed actions, like the `claude` gateway. The browser cannot send an arbitrary Onshape URL.

| Action | Does |
|---|---|
| `connect` | Takes a pasted key pair, makes one test call, stores it in Vault |
| `disconnect` | Deletes the person's key |
| `check` | One call: has the workspace changed since the last sync? |
| `sync` | Light sync: bill of materials + mass properties, match, save, flags |
| `step_start` / `step_status` / `step_get` | Starts the STEP export, checks it, hands the file to the browser, which runs the existing upload path (the STEP engine runs on the uploader's machine, as today) |

| `nightly` | Called by pg_cron shortly before the SteamLab recap, with the Vault key, like `steamlab-recap`. Runs `check` on every linked subsystem and robot, and `sync` on the ones that changed. |

Every action checks that the caller is a signed-in member (or the cron's Vault key), logs the call, and enforces the budget stops above. The key is picked in this order: the caller's own, then the subsystem lead's, then Yoni's. Nobody can choose whose key is used, and the log records both who pressed and whose key paid.

## Screens

Small additions to existing pages, built with the ttm-design skill and the existing tokens.

- **Account menu: Connect Onshape.** Steamhub has no account page, so this is an item in the account menu that opens a sheet. Three short steps with a link to the Onshape developer portal, two fields to paste the keys, a Test button, then "Connected · 312 of 2,500 calls used this year" and Disconnect.
- **Subsystem page: Onshape row.** Paste the assembly link once (lead or admin). Then: **Sync from Onshape**, "Synced 2 h ago by Tom", weight against target, flags, and the unmatched list when there is one.
- **Part row and part page:** material shows its source ("from Onshape"), weight, and "Open in Onshape".
- **Robot page:** its own Onshape link to the full robot assembly, CAD weight against the season limit, per-subsystem bars, the "outside subsystems" line, and the centre of mass.
- **Not connected:** Sync still works on the lead's key, and a quiet line says "Synced with Tom's key · Connect your own" with a link to the account page.
- **SteamLab:** the Ask Claude box (phase 4).

## Build phases

Each phase works end to end before the next starts.

### Phase 0: proof on real documents (done 2026-11-14, 13 calls)
- [x] Read the 2026 V2 intake and robot assemblies: bill of materials, mass properties, microversion, one STEP export.
- [x] Results and the changes they forced are in "Phase 0 results" above.

### Phase 1: connect and link
- [x] A clickable demo of the Connect, Sync and robot weight screens in `Creations/onshape-demo.html` (2026-11-14). Waiting for Yoni to click through it.
- [ ] The material column on the subsystem page gets wider, because "Aluminum 6061 · 5 mm" is longer than "Aluminum 5".
- [ ] Migration: `onshape_accounts`, `onshape_calls`, Vault functions, the `subsystems` link columns.
- [ ] Edge function `onshape` with `connect`, `disconnect`, `check`, the call log and the budget stops.
- [ ] Account page: Connect Onshape. Subsystem page: paste the link, "Open in Onshape".
- Done when: two people have connected, a subsystem is linked, and the counter moves by exactly the calls made.

### Phase 2: light sync
- [ ] Migration: `onshape_syncs`, the `parts` columns, the settings rows.
- [ ] `sync` action: bill of materials + mass properties, matching, save.
- [ ] Material on drawings comes from Onshape when the part is matched.
- [ ] Made/bought from the source document, wired into the classifier as the top automatic layer.
- [ ] Subsystem weight, target, history. Flags, and the two weight pushes. The unmatched list.
- [ ] Robot link: the full robot assembly, robot weight, "outside subsystems", centre of mass.
- [ ] The key fallback (own, lead's, Yoni's) and the `onshape_documents` team and library lists.
- [ ] `nightly` action and its cron job, tested by hand on one subsystem before the cron is turned on.
- Done when: a real subsystem syncs in 3 calls, its drawings show "Aluminum 6061 · 5 mm" style material, its weight matches Onshape's mass readout minus the printed parts, and a night with no CAD change costs exactly 1 call per link.

### Phase 3: STEP from Onshape
- [ ] `step_start`, `step_status`, `step_get`. The browser receives the STEP and runs the existing upload path, so change warnings, part numbers and drawings behave exactly as with a manual upload.
- [ ] The manual upload stays for unlinked subsystems and as a fallback.
- Done when: **Re-sync** on a linked subsystem gives the same part list as exporting and uploading by hand.

### Phase 4: Claude
- [ ] Needs the `claude` gateway. Add the synced Onshape data to the upload check's input.
- [ ] "Open in Onshape" and real material in reject reports.
- [ ] CAD lines in the SteamLab recap from `onshape_syncs`.
- [ ] Ask Claude in SteamLab: pictures and a demo first, then a gateway feature that answers from the synced tables and shows the numbers it used.

Webhooks were dropped as a phase: they fire on new versions, and the team mostly edits without making versions. The nightly run in phase 2 does that job.

## Built (2026-11-14)

Phases 1 to 3 are built and were run on live against a copy of the 2026 intake. The database and the edge function are live. The app code is local and not committed, so the site doesn't show it yet.

- **Database** (`supabase/migrations/20261116_onshape.sql`, applied on live): `onshape_accounts`, `onshape_calls`, `onshape_links`, `onshape_syncs`, `onshape_documents`, the `os_*` and `material_by` columns on `parts`, three weight settings, the Vault functions for keys, and `onshape_run()` for the nightly run.
- **Function** `supabase/functions/onshape` (deployed, verify_jwt off). Actions: `connect`, `disconnect`, `link`, `unlink`, `target`, `dismiss`, `doc_kind`, `sync`, `step_start`, `step_status`, `step_get`, `nightly`.
- **App:** `src/lib/onshape.ts`, `src/components/Onshape.tsx` (the subsystem panel, the robot's Weight section, the Connect sheet), styles at the end of `src/styles/mfg.css`, an Onshape item in the account menu, CAD weight and "Open in Onshape" on the part page.
- **Test data on live:** robot "Onshape test (copy of 2026 intake)", its Intake linked to the 2026 intake assembly and the robot linked to the 2026 robot assembly. Delete the robot when done with it.
- **Yoni's key is connected**: it was put into Vault from `.env.local` by a one-time script, so it never passed through chat. `.env.local` can be deleted.

What the test showed:
- First sync of the intake: 26 calls (2 + 24 document lookups), 72 of 85 parts matched, 22 materials set, 1 part moved to Bought, 7.09 kg (7.20 kg in Onshape minus the printed parts).
- A second sync with no CAD change: 1 call, "Nothing changed".
- Robot sync: 3 calls, 183.91 kg, six groups, and the intake row paired with the test subsystem by itself.
- STEP from Onshape: 3 calls, then the normal upload path read 85 parts and built the bolt table and guide.
- 48 Onshape calls were used in all, phase 0 included.

Different from the plan:
- **A subsystem sync is 2 calls, not 3.** It doesn't need mass properties; the bill of materials has every mass. Only the robot sync reads the centre of mass.
- **Links live in their own table** (`onshape_links`), not as columns on `subsystems` and `robots`, so only the function can write them.
- **Centre of mass** shows as X, Y and Z from the assembly's origin, not as "height / forward / left": Steamhub can't know which Onshape axis is up.
- **"Outside subsystems"** became one row per top-level assembly of the robot, with a "Loose parts" row for parts placed straight in the robot assembly.
- **Flags are grouped:** one line for all parts without a material, one for all "Part N" names, one for repeated names, instead of a line per part.
- **The 24 lookups** on a first sync are more than the "about 22" guessed, and the cap is 40.

Not built or not checked yet:
- Connecting through the form with a fresh key (Claude doesn't type keys). The form's errors were checked through the function.
- The fall-back to the lead's key, and the pushes to a lead: only one account is connected, and the test lead was the one syncing.
- The "Onshape says it's bought" hint on a released part: the test copy has no released parts.
- The nightly run is not scheduled. To turn it on, run the `cron.schedule` line at the end of the migration file.
- A screen for an admin to flip a document between team and library (the function action exists).
- Ask Claude in SteamLab and the rest of phase 4.

## Later, not planned

- Writing Steamhub's part numbers back into Onshape (needs write permission on the key).
- Named versions and "released at version X" on parts.
- A shaded 3D picture of each part from Onshape for Claude's check (about one call per part, so only for flagged parts).
- Fasteners from standard content feeding the bolt table directly.
- Tube lengths from Onshape matched to stock (PLAN.md).

## Not doing

- A browser extension, or anything that drives the Onshape page.
- Our own FRCShaper. No inserting parts, no generating shafts or spacers, no editing CAD.
- One shared team key.

## Risks

- **Field names differ from the reference.** Phase 0 exists for this; nothing is built on an unconfirmed field.
- **Names don't match** between Onshape and an old STEP upload. The unmatched list shows it, and phase 3 removes the cause.
- **A key leaks.** Keys are read-only, live only in Vault, and each person can revoke theirs in Onshape in a minute.
- **Someone's budget runs out.** The counter, the warning at 2,000 and the stop at 2,400 leave room for their own use; another connected member can press Sync instead.
- **Mass is read as the scale weight.** The robot page always says "CAD weight" and lists what is not included.
- **Onshape changes the API.** One function holds every call, so a change is fixed in one place.

## Open questions

All the Q&A so far is in Decisions above. What is left:

1. Which subsystem assembly to run phase 0 on.
2. The season's weight limit in kg, once the 2027 rules are out.
3. Whether leads' accounts can open their own subsystem's document. Phase 0 or the first lead to connect will show it; if not, syncs fall through to Yoni's key.

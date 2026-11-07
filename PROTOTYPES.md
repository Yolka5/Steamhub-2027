# Prototypes plan

A Prototypes section in Steamhub: every prototype the team builds, its videos, and the parameters it was tested with, in one place. Written 2026-11-07 after Tomer asked for it in the team chat ("a place to upload the prototype videos, with all the parameters written next to each video"), and Tom agreed. Video storage was decided the same day: free plan, every clip shrunk in the browser. All five phases were built on 2026-11-07 in one run; what's left is listed under each phase and under "Not checked yet".

## Why this shape

Today prototype videos live in WhatsApp. A week later nobody remembers which video had 12 mm compression and which had 18 mm, which wheels were on, or what changed between two tries. The decision ("go with the 2-roller intake at 15 mm") ends up made from memory.

So the rules are:

- **The test is the unit.** A test is one video plus the parameter values it ran with, plus how it went. That's exactly what Tomer asked for.
- **Logging a test takes seconds on a phone.** Film, and the parameters are already filled from the last test. Change only the one you changed, tap how it went, save. The upload runs in the background.
- **Parameters line up.** Prototypes of the same subsystem share their parameter names, so any two can be compared side by side.
- **Modular, but not empty.** A prototype page is built from blocks anyone can add, remove and reorder. Every new prototype starts from a sensible set, so nobody faces a blank page.
- **One subsystem list.** Prototypes hang off the same subsystems as Manufacturing, stock reservations and the calculator.

## Decisions

- **Prototype.** Name, subsystem, concept (one line: "2 rollers, over the bumper"), status, owner, members, cover picture. Status runs **Idea → Building → Testing → Chosen** or **Dropped**. Chosen and Dropped ask for one line of why, which is the most useful thing to read next season.
- **Subsystem link.** A prototype picks a subsystem from the season's robots (number + name, as in Manufacturing). Since V1 and V2 share subsystem numbers, the link is by **season + subsystem number**, so a prototype shows on the subsystem page of every robot that season. Prototypes made before the robot exists (week 1 after kickoff) can sit under **No subsystem yet** and be moved later. Renaming or adding a subsystem in Manufacturing shows here at once, because it's the same table.
- **Parameters.** Each parameter has a name, a unit and a kind: number, text, choice (from a short list) or yes/no. Examples: compression (mm), roller diameter (in), wheel (choice: flex 30A, flex 45A, compliant), ratio, motor, RPM, voltage, ball type.
  - The **parameter set** belongs to the subsystem, not the prototype, so a new intake prototype starts with the intake's parameters. A prototype can add its own, and can push one up to the subsystem set with one tap.
  - A parameter can be marked **key**, which shows it on cards and on the video.
- **Tests.** Each test has the video (or photos), the value of every parameter, a result (**Worked / Partly / Failed**), an optional 1–5 score, an optional measured number (cycle time, success out of 10, shot distance), a note, who and when.
  - A new test copies the previous test's values. Values changed since the last test are highlighted on the test and in the list ("compression 12 → 15").
  - On the video the key parameters sit right under the player and stay there in fullscreen as an overlay, so the video and its parameters are never apart.
- **Video.** Phones film 1080p or 4K, which is far too big. The browser re-encodes every clip to 720p H.264 at 1.4 Mbit/s before upload (WebCodecs through Mediabunny in `src/lib/video.ts`, loaded only when a clip is processed; no server work). A 30 s clip comes out around 5 MB. Don't force a frame rate in the conversion: it turned frames black after the first second in Chromium. Clips are capped at 90 s; a longer video goes in as a YouTube or Drive link instead. A poster frame (JPEG) is saved with each clip, so lists show pictures and never load video.
- **Storage.** Supabase today holds about 40 MB of the free plan's 1 GB. At about 5 MB a clip that's roughly 150–180 clips before photos, which a build season can pass. See the open question below.
- **Blocks.** A prototype page is the header, then the **Tests** feed, then blocks. Block kinds:
  - Notes (text)
  - Photos
  - Checklist (what's left to build or try)
  - Pros and cons (the same cards as the Handbook)
  - Links (Onshape document, Chief Delphi thread, a team's reveal video), shown with their site name
  - Calculator mechanism: picks a mechanism from the team robot in the calculator and shows its ratio, speed and current live, with a link to open it
  - Stock used: pieces reserved for this prototype (existing Reserve, with the prototype as the reason)
  - Parameter chart: one parameter against the result or measured number over all tests ("compression vs balls in out of 10")

  Blocks are added from a + menu, reordered by drag on desktop (the handle left of the title) or Move up / Move down in the block's ⋯ menu, collapsed, and deleted with a confirm step. Each block saves on its own, so two people editing different blocks never clash.
- **Starting set.** A new prototype starts with Tests, Notes, Checklist and Links. A subsystem can save its current layout as the default for its next prototypes.
- **Compare.** Pick two to four prototypes (or tests) of one subsystem. One table: a row per parameter, a column per prototype, differences highlighted, best result and best measured number marked. Their videos play side by side, started together.
- **Choosing.** Marking a prototype Chosen shows it at the top of its subsystem's page in Manufacturing, with its key parameters. The others are kept, not deleted.
- **Permissions.** Same as the rest of Steamhub: everyone signed in can do everything. Deleting a prototype is for its owner and the admin; deleting a test is for whoever filmed it, its prototype's owner and the admin.
- **Navigation.**
  - Desktop rail: Home, Stock, Manufacturing, **Prototypes**, Tools, Handbook.
  - Phones: the tab bar stays as it is. Prototypes is a card on Tools and a **Record a test** quick action on Home, which opens the camera straight away. During the prototyping weeks after kickoff, swapping Tools for Prototypes in the tab bar is one line if the team wants it.
- **Design.** Each UI phase loads the ttm-design skill and uses the existing tokens and components in `src/styles` and `src/components`.

## Data

New Supabase tables (all in `supabase/migrations/20261107_prototypes.sql`, applied; RLS through `is_member()` like the rest):

| Table | Holds |
|---|---|
| `prototypes` | id, season, subsystem_number (nullable), name, concept, status (idea/building/testing/chosen/dropped), status_note, owner_id, cover_path, created_by, timestamps. Block order lives on the blocks. |
| `prototype_members` | prototype_id, user_id |
| `param_defs` | id, season, subsystem_number (null = this prototype only), prototype_id (null = subsystem set), name, unit, kind (number/text/choice/bool), options (text[]), key (bool), position |
| `prototype_tests` | id, prototype_id, n (1, 2, 3… per prototype), values (jsonb: param_def id → value), result (worked/partly/failed), score, measure_name, measure_value, note, video_path, poster_path, video_link, duration_s, by_id, by_name, at |
| `prototype_blocks` | id, prototype_id, kind, title, data (jsonb), position, collapsed, updated_by, updated_at |
| `subsystem_layouts` | season, subsystem_number, layout (jsonb), the default blocks for new prototypes |

Existing tables change: `pieces` gets `prototype_id` (nullable), so stock can be reserved for a prototype.

The subsystem link is season + number rather than a `subsystem_id`, because one prototype belongs to the subsystem across V1 and V2. The name always comes from the subsystems table, never stored twice.

Storage: a private bucket `prototypes` (signed-in read, 50 MB per file). `tests/<prototype id>/<test id>-<time>.mp4` and `.jpg` (poster), `photos/<prototype id>/<time>.jpg`. Photos are shrunk with the same code Stock uses (`shrink` in `src/lib/actions.ts`). Deleting a test, block or prototype removes its files.

## Phases

Tick a phase here when it's done and checked in the browser.

### Phase 1: prototypes, parameters, tests with video (built 2026-11-07)
- [x] Migration with every table and the `prototypes` bucket. Applied.
- [x] Video pipeline `src/lib/video.ts`: 720p H.264 with progress, poster frame, 90 s cap (longer clips keep the start); the original uploads when the browser can't encode, refused over 50 MB. Uploads run in a background queue (`queueVideo` in `src/lib/proto.ts`), one at a time, and keep going while you move around Steamhub; closing the tab mid-upload asks first. Checked: 1080p landscape and portrait clips came out as 720p MP4 with a real poster.
- [x] `/prototypes`: grouped by subsystem, cards with cover, status, last result and key parameters. Season, subsystem, status and Show dropped filters in the URL.
- [x] New prototype: name, subsystem (Manufacturing's list for the season, or none yet), concept.
- [x] `/prototypes/:id`: status picker, parameters panel (shared and own, key toggle, one-tap common parameters), tests feed with the key parameters on the video and a fullscreen button that keeps them on, all values, "12 mm → 15 mm" for what changed, result, score, measured, note.
- [x] `/prototypes/:id/test`: Film (opens the camera on phones), Choose file, or a YouTube/Drive link; values copied from the last test with Changed tags; result, score, measured, note. Edit at `/prototypes/:id/test/:testId`; a new video replaces the old files and the cover.
- [x] Rail item, a card on Tools (phones), "Record a test" on Home (`/prototypes/record` picks the prototype), realtime on every list.

### Phase 2: blocks (built 2026-11-07)
- [x] Notes, Photos, Checklist, Pros and cons, Links. Add, drag or Move up / Move down, collapse, rename by editing the title, delete with a confirm step.
- [x] Default starting set (Notes, To do, Links) and "Use these blocks for new <subsystem> prototypes".
- [x] A checkbox on each parameter moves it between the subsystem set and this prototype.

### Phase 3: compare and choose (built 2026-11-07)
- [x] `/prototypes/compare?ids=…`: each column shows its best test (pick another per column), rows that differ marked, best result, score and measured in bold, videos side by side with Play together, chips to add or remove prototypes (2 to 4).
- [x] Parameter chart block: a number parameter against result, score or the measured number, points labelled with the test number.
- [x] Chosen / Dropped ask for one line of why. The Manufacturing subsystem page has a Prototypes section: chosen first with its key parameters, then the others.

### Phase 4: connections (built 2026-11-07)
- [x] Calculator mechanism block: ratio, wheel or arm speed, surface speed and battery current from the team robot.
- [x] Stock used block: type a piece ID to reserve it for the prototype, Release, kg of raw stock. Releasing a piece anywhere clears its prototype link.
- [x] Ctrl K finds prototypes by name, concept or subsystem number.
- [x] Notifications: owner and members hear about each new test; the subsystem's leads hear when a prototype is chosen.

### Phase 5: sharing (built 2026-11-07)
- [x] "Share with parameters" on a test: a copy of the clip with the prototype, test number, parameters, result and measured number burned in along the bottom. Phones open the share sheet (WhatsApp); desktop downloads it and copies the text.
- [x] Season summary `/prototypes/summary?sub=3` (and `&season=`): an "At a glance" table (status, tests, best result, top measured number, why), then Chosen, Also tried and Dropped, each with its best test, the video of its best filmed test, key parameters, note and test dates. Linked from each subsystem group on the Prototypes list and from the Prototypes section of the Manufacturing subsystem page.

### Not checked yet
- On a real phone: Film opening the camera, how long encoding takes, and the share sheet with a video file. Everything else was checked in the desktop browser with generated clips.
- iPhone Safari should encode on iOS 17 and later; otherwise the original uploads if it's under 50 MB. Fullscreen on iPhone shows the bare video without the parameter overlay.
- Not clicked through: drag to reorder blocks, the Photos, Pros and cons and Links blocks, Stock used reserve, and notifications reaching a second person.

Test data: "Test double roller (delete me)" and "Test single roller (delete me)" under 3 Intake. Delete them from each prototype's Edit sheet when you're done.

## Open questions
- **Prototypes in Manufacturing.** Wood or printed prototype parts sometimes need the workshop. For now that means making a "Prototype" robot in Manufacturing. Linking a prototype to a STEP upload directly can come later if it's used a lot.

## Later, not planned yet

- Prototype templates for common mechanisms (roller intake, flywheel shooter, elevator, arm) with their usual parameters.
- Frame-by-frame scrubbing and slow motion markers on the video.
- Measuring from video (ball speed from two frames).

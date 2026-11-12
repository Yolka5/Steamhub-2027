# Steamhub 2027 plan

Hub for FRC 1577 Steampunk. The goal is to save CAD members minutes and energy during build season. Every screen is judged on how many clicks it saves.

Status: V1 built on 2026-11-02 (Stock, Calculator, Handbook). Extras added 2026-11-03 (center distance, cheat sheet, mechanisms, cut, then Tools hub, tap drill lookup and the FRC sources in the handbook). Waiting on Tomer's finished calculator spreadsheet: port the differences and extend scripts/verify-calc.ts for them. Next: Manufacturing, planned in full in [MANUFACTURING.md](MANUFACTURING.md) on 2026-11-07, built phase by phase. Prototypes (Tomer's request in the team chat) planned and built on 2026-11-07, see [PROTOTYPES.md](PROTOTYPES.md). Calendar (replaces Monday: tasks per team and subsystem, phases, daily updates, Gantt, push notifications first) planned on 2026-11-12, see [CALENDAR.md](CALENDAR.md).

## Decisions

- **Language**: the site is in English. Only the Handbook is in Hebrew, with RTL layout and matching Hebrew fonts.
- **Look**: light mode by default, dark mode as a toggle. Black and orange brand, with orange kept rare (logo, one main button per screen, meaning in data).
- **Fonts**: Night Machine for big page titles, Newsreader serif for section titles, Instrument Sans for everything else.
- **Data**: Supabase (database, photo storage, auth), imported once from the Google Sheet.
- **Sign-in**: Google. The session refreshes on its own, so people sign in once and stay signed in. Sign-in is required for the whole site (decided 2026-11-07). Anyone with a Google account can sign in and edit everything; the admin is notified of new accounts and can ban them.
- **Hosting**: Vercel, building from the GitHub repo on every push (vercel.json handles page routes).
- **IDs**: TB for round tube and rod (as in the sheet), PR profile, AN angle, FB flat bar, HX hex, OT other.
- **Repo**: GitHub `Steamhub 2027`, pushed from this folder.
- **CAD**: Onshape.
- **Devices**: phone first for the workshop, desktop for CAD, plus the workshop's touchscreen PC. Big touch targets everywhere, and nothing that only works on hover.
- **Tom's tool** (drawings, bolt detection, assembly guide, manufacturing tracking): its engine is ported, not rebuilt; its UI is replaced with Steamhub's.
- **Manufacturing**: see [MANUFACTURING.md](MANUFACTURING.md). Slow, confusing manufacturing tracking is a big part of why the old Steamhub failed, so it has to be as simple as last year's Monday board, with the upload doing the typing.

## Sections

| Section | Mode | Contents |
|---|---|---|
| Home | Tool | Search, your reservations, quick actions |
| Stock | Tool | Find, Browse, Add (phone), Stock photos (optional), History |
| Tools | Tool | Hub for every tool: motor and gearbox calculator, tap drill lookup, center distance, swerve, curves, cut list, weight per mechanism, plus links to JVN, AMB and ReCalc |
| Handbook | Read (Hebrew) | Chapters, mechanism comparisons, approval checklist, and the FRC information sources (מקורות מידע) |
| Manufacturing | Tool | Robots, subsystems, STEP upload → numbered part list and drawings, workshop list, plates, wishlist, bolt table, assembly guide ([MANUFACTURING.md](MANUFACTURING.md)) |
| Prototypes | Tool | Prototypes per subsystem, tests as video + parameter values + result, modular blocks, compare, choose ([PROTOTYPES.md](PROTOTYPES.md)) |
| Calendar | Tool (built 2026-11-12, not live yet) | Tasks per group (teams, CNC, Workshop, subsystems), phases, daily lead updates, Board, Calendar and Gantt views, reminders ([CALENDAR.md](CALENDAR.md)) |

## Stock

States: **Available → Reserved → Used**. Leftovers always go back to Available, because nothing is ever thrown out.

- **Labels**: sharpie with ID and length, as today. QR stickers maybe later.
- **Find**: shape, size, wall and min length, typed in one field (`20x40x1 700`) or through filters. Results are sorted by least waste and show photo, location and length. The query lives in the URL.
- **Reserve**: one click, with name and mechanism, plus an optional planned length. Reservations never expire.
- **Done** (later, through Manufacturing): the final length comes from the drawing, never from the reservation, because the drawing is always the latest version. On done, the leftover length (length minus final minus 3 mm kerf) stays Available under the same ID, and Steamhub shows the new length to rewrite on the piece.
- **Add** (phone): recent cross-section chips, length, optional photo, location, next ID shown large, plus "same as last" for batches. A drawing of the piece previews the profile as you type.
- **Stock photos**: photos are optional, since every piece is drawn from its profile and length. The page lists pieces without one and copies Drive photos into Steamhub.
- **Cut list**: enter all the lengths a mechanism needs, get the best pieces for all of them at once.
- **Shapes**:
  - round tube: OD, ID
  - rectangle and square tube: W x H x wall, for example 20x40x1 or 25.4x50.8. Everything is mm, no inches
  - L angle: A x B x thickness
  - rod
  - plate
  - hex
- **Backlog**: most stock isn't entered yet (tubes partly done, profiles and L angles not started). Add has to be fast enough to finish it, so Add ships together with Find.

## Motor and gearbox calculator

The whole workbook, as a real interactive page. Kraken motors only (X60 and X44, FOC and non-FOC).

- Battery budget across the top: one bar per set, filling toward the limit and turning to a warning colour when it goes over.
- One card per mechanism (pivot, linear, roller) with only the inputs that type needs. Mode 1 (find ratio) or Mode 2 (check ratio) as a toggle on the card.
- Every result updates live. The headline number for each card is the gear ratio and its status (OK, HIGH LOAD, ...).
- Curves and Voltage map as charts, opened from a mechanism.
- Swerve as its own panel comparing the three ratios.
- Motors table that can be edited.
- Numbers checked against the xlsx on real cases before it replaces the sheet.

## Extras

- Ctrl+K search over stock, calculator presets and handbook sections.
- Click any number to copy it.
- Center distance (belt, chain, gear) and cheat sheets (clearance holes, tap drills, bearings, hex shaft).
- Weight per mechanism from reserved stock.
- Later: Onshape integration that reads part lengths from the document and matches them to stock.

## Done in V1

- Stock: find, reserve, add from phone, needs photo, cut list, full edit and delete, editable locations, history, live team activity on Home.
- Calculator: whole workbook ported (`src/lib/calc.ts`), checked against the spreadsheet with `npx tsx scripts/verify-calc.ts` (136 checks). One shared team robot in Supabase; edits are a private draft until "Save to team robot".
- Handbook: Hebrew, RTL, contents rail, search, pros/cons cards, working checklist, in Ctrl K.
- Kickoff countdown on Home (9 Jan 2027, BIOCORE).
- Calculator: Center distance tab (HTD 5 mm and GT2 3 mm belts, #25 and #35 chain, 20 and 32 DP gears) that lists the nearest belts or chains around the distance you want, and a Cheat sheet tab (tap drills, clearance holes, bearings, hex shaft). Both in Ctrl K.
- Stock: Mechanisms page (`/stock/mechanisms`) with reserved stock grouped by mechanism and raw-material weight per mechanism, using planned length when set.
- Stock: Cut. On a reserved piece, enter the final length from the drawing; the leftover (minus 3 mm kerf) goes back to Available under the same ID and the new length is shown big to rewrite on the piece. Logged in History. Manufacturing can call the same `cutPiece` action later.
- Ctrl K also lists every calculator tab.
- Drive photo copy: edge function `supabase/functions/copy-drive-photos` plus a "Copy from Drive" button on Needs photo. Written, not deployed yet.

## Review pass (2026-11-10)

A full review of every section, on phone and desktop, judged on one question: is this the best it can be for a student in build season.

- Fixes: stock search no longer matches round tubes for two-sided sizes (20x40x1 means a profile or angle; "tube 20x40x1" means a profile). Sensors, switches and similar come in as Bought, and underscores in Onshape names no longer hide words; mount, bracket, holder, plate, cover and guard are always made. Cut clears the prototype link on the leftover. The Add stock photo preview is made once per photo. "In design" no longer says "Only you see these".
- Part names: a part still called "Part 1" is shown with a name from its shape and size ("Plate 6.35 mm, 181.6 × 108.4", "Hex 12.7, 330.5 long"), in lists, drawings, PDFs and file names. The stored name stays, because re-uploads match by it (`partName()` in `src/lib/mfg.ts`).
- Workshop: Start and Done on every row. A part with reserved stock opens its page for Done, so Cut still runs.
- Ctrl K finds parts by number (from the start: 30 finds 3001–3099) or by name.
- Home: "You're making", workshop moments in the live feed (started, finished, urgent, missing; `part_events` is in realtime). Phones: what's yours after search, a small countdown, no tiles the tab bar already has.
- Phone layouts: piece page puts ID, length and Reserve first; prototype page puts tests first; the calculator opens on the mechanisms with the battery budget folded into one line; Stock folds tolerance, view and show-reserved into one Options row, and the shape picker wraps.
- Plates and end mills are kept in both the sheet and Steamhub. The sync merges: end mills apply only the sheet's change since the last sync (`end_mills.sheet_qty`); plates marked Gone leave once the sheet drops them; a plate added in Steamhub and then in the sheet stays one plate. Both pages sync on open (once the merging sync has run) and list what the sheet doesn't have yet, with Copy.
- Tap drills and Center distance have their own pages (`/tools/tap-drills`, `/tools/center-distance`); the Calculator tabs stay.
- Sign-in branches that could never show are gone (the whole site is behind sign-in).
- Decided, don't reverse: everything loads at entry, KaTeX preloads, pages fetch fresh data on open.

## Review fixes (2026-11-11)

A second full review, then every finding built. Judged on the same question: faster, simpler or more trustworthy for a student in build season.

- Trust: stock, the calculator robot and photos are members-only, for reading and writing (`20261111_members_only.sql`). A double tap on any Save, Start or Reserve does one thing once (`useBusy` in `src/components/ui.tsx`); before, Add stock saved two pieces and Start then Done finished a part. Start rests 1.2 s before it turns into Done. Done on a part cuts its stock only after the part saved. Two people can't both Start a part.
- Numbers: "rod 12", "hex 12.7" and "ø20" are sizes, not lengths, and the cut list takes rod and hex. "700,350,120" is three lengths. Prototype values keep their zeros (1.05 stayed 15). End mills don't drop twice when the sheet catches up, and a sheet row with 0 plates means none. Partly used plates have to fit too. Hex spacers are named Hex. Times count lower-is-better in Compare and the summary.
- Offline and slow: a phone opens with no signal however long since it was last used (the saved session is reported fresh while offline, `src/lib/supabase.ts`). A slow connection says it's showing saved data, and lists reload when it answers, when the connection returns, and after a minute away (`useReloadOnReturn`). The offline worker saves the video tools, the STEP reader and the KaTeX fonts too, skips signed links and keeps its saved data under 400 answers. Lists read past Supabase's 1000 rows (`selectAll`). A failed load says so with Try again instead of looking empty.
- Fewer taps: the Home search searches everything (stock sizes go straight to Stock; 3004, M5 or a word open Ctrl K with it). The workshop filters fold into one line on phones. Undo on Done, plate Gone and Release. The cut list shows what it reserved instead of a new plan. Robots and subsystems can be renamed.
- Storage: an upload deletes the files it replaces and keeps only the newest assembly STEP; storage refusing a file is reported.
- Speed: no stagger on stock cards, and the Home search no longer waits behind the title animation. Prototype pictures are signed in one request per page.
- Accessibility: big titles and tags pass contrast in light mode (`--brand-text`, darker meaning colours), small buttons and checkboxes are 44 px on touch screens, Ctrl K works with a screen reader and keeps the highlight in view, the status bar moved to the top so it never covers the toast or the picked-parts bar.
- Admin (People, from the account menu): emails for the admin only, section use over the last 14 days, and Download a backup (every list as CSV in one zip).

## Season card and prototype defaults (2026-11-12)

Asked for by Yoni on 2026-11-11, built on 2026-11-12.

- **Season card on Home** (`src/components/SeasonCard.tsx`). It takes the countdown's place once kickoff is past, with no new numbers: content on the left and a robot drawn in lines (or the newest prototype video's frame) blurred into the right side. The card moves through four stages:
  1. **Set up V1:** one sheet with the robot name and a row per subsystem (number, name, lead). The subsystem list is typed in at kickoff.
  2. **Prototype week:** while V1 has no parts uploaded, the card shows prototypes and tests per subsystem. A subsystem with none links to New prototype (`/prototypes?sub=N&new=1`).
  3. **Production:** parts done per subsystem, how many were made today, and how many are in progress.
  4. **Start V2:** once **25% of V1's made parts are done**, the card offers V2. Its sheet copies V1's subsystems and leads; then the card follows V2, and V3 works the same way.
- **Which robot counts:** robots have a `version` (`20261112_robot_versions.sql`), read from "V1" or "V2" in the name when a robot is made or renamed. Only one V1 is allowed per season. Test robots have no version and never count.
- To see the card before kickoff, open `localhost:5173/?kickoff=past` on the dev server.

## How-to guide and wall poster (2026-11-12)

- `/guide`: how to use Steamhub, phone first, with a contents row that follows you (a rail on computers) and real screenshots in light and dark. It opens without signing in, so the wall QR works on a new student's phone; its links lead to sign-in and then to the page. Linked from Tools and Ctrl K.
- `/guide/print`: the A4 wall poster, the same steps cut to a line each, with a QR code to steamhub2027.vercel.app/guide made in the browser (`qrcode-generator`). Checked: prints as one A4 page and the code scans.
- The pictures come from `scripts/guide-shots` (real app, demo data, Supabase never called). Run it again when a screen changes: start `npx vite --port 5199`, then `node scripts/guide-shots/shoot.mjs`.

## Still open

- **Calendar go-live (built 2026-11-12):** apply `supabase/migrations/20261112_calendar.sql`, deploy `send-push` with `--no-verify-jwt`, merge. See [CALENDAR.md](CALENDAR.md#to-go-live).
- **Run `supabase/migrations/20261111_members_only.sql`** (members-only stock, page counts) and **deploy `supabase/functions/sync-sheet`** (end mill and 0-plate fixes). Both were held for Yoni's go-ahead on 2026-11-11.
- **After the 11 Nov code is deployed, run `20261111_emails_admin_only.sql`.** Before that, it would break the live site (older code reads profiles with select *).
- **Upgrade the Supabase plan before kickoff** (calendar reminder on 3 Jan 2027). The free plan has 1 GB of file storage; one assembly upload is about 25–40 MB.
- Press "Sync from sheet" on Plates once, so the merging sync runs and sync-on-open turns on. Deploy the sync fix above first.
- Press "Copy from Drive" on Stock photos once. 80 pieces still point at Drive (the function is deployed).
- Test the bolt table and assembly guide with a real assembly STEP (so far only folders of part files were uploaded).
- Clear the test data ("(delete me)" prototypes, test robots) before kickoff.
- Supabase advisor warnings: RLS policies that re-check auth per row, functions callable over the API.
- Writing Steamhub's plate changes straight into the sheet needs a Google service account; on hold.
- `scripts/verify-calc.ts`: 4 stall-load checks differ from the sheet since the stator-limited hold change.
- Two weeks after kickoff: remove the prototype blocks nobody uses, and check People → Sections used for whole sections nobody opens.
- Manufacturing phase 6 (Onshape integration) in [MANUFACTURING.md](MANUFACTURING.md).
- QR stickers, if the sharpie labels stop being enough.

## Build order

0. Foundation: GitHub repo, Supabase project, Google sign-in, tokens, shell, theme toggle, Ctrl+K, heading samples to pick from
1. Stock: import, Add, Find, Reserve, Needs photo
2. Calculator
3. Handbook
4. Manufacturing ([MANUFACTURING.md](MANUFACTURING.md)), then extras
5. Calendar ([CALENDAR.md](CALENDAR.md)), push notifications first

## Speed (phones)

- Everything loads at entry on purpose: one app download, then every page is instant. KaTeX (formulas) downloads in the background 3 s after load; prototype video tools load on first use.
- `vercel.json` caches `/assets` for a year (file names change every deploy). Fonts and images in `public/` cache for 30 days: **when replacing one, give it a new file name**, or phones keep the old one for up to a month.
- Fonts are self-hosted in `public/fonts` (`src/styles/fonts.css`). Each file only downloads when a page uses its characters, so Heebo (Hebrew) only loads on the Handbook.
- The logo is a CSS background (`.logo`), so only the current theme's version downloads. `index.html` shows it as a startup frame before the code arrives.
- Stock data loads after sign-in and reloads only when the app comes back after more than a minute away; realtime covers the rest.
- Lighthouse mobile, sign-in screen, production build: score 91 to 96, first paint 2.61 s to 0.91 s, 414 KB to 322 KB, 15 requests to 7.
- Offline app: `sw/sw.js` (template) becomes `dist/sw.js` at build time with that build's file list (`vite.config.ts`). The app opens from the phone's cache, even with no signal; Supabase reads are fetched fresh and fall back to the last saved copy after 4 s or offline; writes always need a connection. A new deploy shows "New version" with Refresh (`src/components/AppStatus.tsx`). Signing out wipes saved data. Installable from the browser menu (Add to Home screen).
- Measured on a slow 4G phone (production build): sign-in screen 2.14 s on the first visit, 0.27 s coming back.

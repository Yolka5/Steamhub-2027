# Steamhub 2027 plan

Hub for FRC 1577 Steampunk. The goal is to save CAD members minutes and energy during build season. Every screen is judged on how many clicks it saves.

Status: V1 built on 2026-11-02 (Stock, Calculator, Handbook). Extras added 2026-11-03 (center distance, cheat sheet, mechanisms, cut, then Tools hub, tap drill lookup and the FRC sources in the handbook). Waiting on Tomer's finished calculator spreadsheet: port the differences and extend scripts/verify-calc.ts for them. Next: Manufacturing, planned in full in [MANUFACTURING.md](MANUFACTURING.md) on 2026-11-07, built phase by phase. Prototypes (Tomer's request in the team chat) planned and built on 2026-11-07, see [PROTOTYPES.md](PROTOTYPES.md).

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

## Still open

- Press "Sync from sheet" on Plates once, so the merging sync runs and sync-on-open turns on.
- Press "Copy from Drive" on Stock photos once. 80 pieces still point at Drive (the function is deployed).
- Test the bolt table and assembly guide with a real assembly STEP (so far only folders of part files were uploaded).
- Clear the test data ("(delete me)" prototypes, test robots) before kickoff.
- Supabase advisor warnings: RLS policies that re-check auth per row, functions callable over the API.
- Writing Steamhub's plate changes straight into the sheet needs a Google service account; on hold.
- `scripts/verify-calc.ts`: 4 stall-load checks differ from the sheet since the stator-limited hold change.
- Two weeks after kickoff: remove the prototype blocks nobody uses.
- Manufacturing phase 6 (Onshape integration) in [MANUFACTURING.md](MANUFACTURING.md).
- QR stickers, if the sharpie labels stop being enough.

## Build order

0. Foundation: GitHub repo, Supabase project, Google sign-in, tokens, shell, theme toggle, Ctrl+K, heading samples to pick from
1. Stock: import, Add, Find, Reserve, Needs photo
2. Calculator
3. Handbook
4. Manufacturing ([MANUFACTURING.md](MANUFACTURING.md)), then extras

## Speed (phones)

- Everything loads at entry on purpose: one app download, then every page is instant. KaTeX (formulas) downloads in the background 3 s after load; prototype video tools load on first use.
- `vercel.json` caches `/assets` for a year (file names change every deploy). Fonts and images in `public/` cache for 30 days: **when replacing one, give it a new file name**, or phones keep the old one for up to a month.
- Fonts are self-hosted in `public/fonts` (`src/styles/fonts.css`). Each file only downloads when a page uses its characters, so Heebo (Hebrew) only loads on the Handbook.
- The logo is a CSS background (`.logo`), so only the current theme's version downloads. `index.html` shows it as a startup frame before the code arrives.
- Stock data loads after sign-in and reloads only when the app comes back after more than a minute away; realtime covers the rest.
- Lighthouse mobile, sign-in screen, production build: score 91 to 96, first paint 2.61 s to 0.91 s, 414 KB to 322 KB, 15 requests to 7.
- Offline app: `sw/sw.js` (template) becomes `dist/sw.js` at build time with that build's file list (`vite.config.ts`). The app opens from the phone's cache, even with no signal; Supabase reads are fetched fresh and fall back to the last saved copy after 4 s or offline; writes always need a connection. A new deploy shows "New version" with Refresh (`src/components/AppStatus.tsx`). Signing out wipes saved data. Installable from the browser menu (Add to Home screen).
- Measured on a slow 4G phone (production build): sign-in screen 2.14 s on the first visit, 0.27 s coming back.

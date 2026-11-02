# Steamhub 2027 plan

Hub for FRC 1577 Steampunk. The goal is to save CAD members minutes and energy during build season. Every screen is judged on how many clicks it saves.

Status: foundation and the first version of Stock are built (2026-11-02). Next: Google sign-in setup, Drive photos, then the calculator.

## Decisions

- **Language**: the site is in English. Only the Handbook is in Hebrew, with RTL layout and matching Hebrew fonts.
- **Look**: light mode by default, dark mode as a toggle. Black and orange brand, with orange kept rare (logo, one main button per screen, meaning in data).
- **Fonts**: Night Machine for big page titles, Newsreader serif for section titles, Instrument Sans for everything else.
- **Data**: Supabase (database, photo storage, auth), imported once from the Google Sheet.
- **Sign-in**: Google. The session refreshes on its own, so people sign in once and stay signed in. Anyone signed in can edit. Reading works without signing in.
- **Hosting**: Vercel unless we decide otherwise.
- **IDs**: TB for round tube and rod (as in the sheet), PR profile, AN angle, FB flat bar, HX hex, OT other.
- **Repo**: GitHub `Steamhub 2027`, pushed from this folder.
- **CAD**: Onshape.
- **Devices**: phone first for the workshop, desktop for CAD, plus the workshop's touchscreen PC. Big touch targets everywhere, and nothing that only works on hover.
- **Tom's tool** (drawings, bolt detection, exploded views, manufacturing tracking): not rebuilt from scratch. We integrate and improve it once Tom sends it.
- **Manufacturing**: designed later, as its own careful pass. Slow, confusing manufacturing tracking is a big part of why the old Steamhub failed, so it has to be fast and simple.

## Sections

| Section | Mode | Contents |
|---|---|---|
| Home | Tool | Search, your reservations, quick actions |
| Stock | Tool | Find, Browse, Add (phone), Needs photo, History |
| Calculators | Tool | Motor and gearbox, later center distance and cheat sheets |
| Handbook | Read (Hebrew) | Chapters, mechanism comparisons, approval checklist |
| Manufacturing | Tool | Later: Tom's tool and the part-done flow |

## Stock

States: **Available → Reserved → Used**. Leftovers always go back to Available, because nothing is ever thrown out.

- **Labels**: sharpie with ID and length, as today. QR stickers maybe later.
- **Find**: shape, size, wall and min length, typed in one field (`20x40x1 700`) or through filters. Results are sorted by least waste and show photo, location and length. The query lives in the URL.
- **Reserve**: one click, with name and mechanism, plus an optional planned length. Reservations never expire.
- **Done** (later, through Manufacturing): the final length comes from the drawing, never from the reservation, because the drawing is always the latest version. On done, the leftover length (length minus final minus 3 mm kerf) stays Available under the same ID, and Steamhub shows the new length to rewrite on the piece.
- **Add** (phone): recent cross-section chips, length, camera photo, location, next ID shown large, plus "same as last" for batches.
- **Needs photo**: a list of pieces without a photo, so someone can shoot them all in one pass.
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

## Build order

0. Foundation: GitHub repo, Supabase project, Google sign-in, tokens, shell, theme toggle, Ctrl+K, heading samples to pick from
1. Stock: import, Add, Find, Reserve, Needs photo
2. Calculator
3. Handbook
4. Manufacturing with Tom's tool, then extras

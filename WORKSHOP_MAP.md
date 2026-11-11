# Workshop map plan

A live, semi-3D map of the workshop inside Manufacturing. It shows which machine is running, the part on it and who is making it, flags urgent parts and forgotten Done taps, links the stock shelf to Stock, and keeps a history of machine time. Written 2026-11-12 from three rounds of Q&A with Yoni, five picture drafts and a clickable demo. Each phase below is one or two chats: read this file, do the next unticked phase, tick it here.

The clickable demo is `Creations/workshop-map-demo.html` (gitignored). The Python generator that draws the room, and the demo's template, live in the session scratchpad and were copied to `Creations/workshop-map-src/` (see "Room geometry"). The demo shows the agreed look and feel. Build it to match.

## Why this shape

The workshop already runs on the Manufacturing list: someone taps Start on a part, the part goes In progress, and Done finishes it. Those taps already know which machine is busy, with what and since when. The map shows that at a glance, so nobody has to walk to the lathe or ask around to know if it's free. It follows the same rules as MANUFACTURING.md: nothing new to type, phone-first, everyone sees the same screen.

## Decisions

### What "live" means
- **No sensors and no camera.** A machine is running while one of its parts is In progress (status `doing`), meaning someone tapped Start and hasn't tapped Done. The "camera" marks on Yoni's sketches only show where the photos were taken.
- **Two or more parts In progress on one machine:** the map shows the newest.
- **Updates live** through the existing realtime on `parts`, with no reload.

### States (each one has a word as well as a colour)
| State | When | Look |
|---|---|---|
| Idle | No part In progress, no urgent part waiting | White clay |
| Running | A part In progress for under 3 h | Whole machine solid green |
| Forgot Done? | A part In progress for 3 h or more | Pale, faded green, and the tag says "Forgot Done?" |
| Urgent part waiting | Idle, and a released To-do part for this machine is urgent | Whole machine solid yellow (yellow means "check this") |

When a machine is running and an urgent part is also waiting, running wins: the machine stays green and the tag gets a small yellow chip plus the line "Urgent 3011 waiting next".

### What does something
- **Lathe and Mill** are drawn on the map with states. Both always show a small black tag with the name and state word.
- **Stock shelf** (three heights, tubes and profiles) links to `/stock`. On hover it lifts and warms to a soft orange, and its "Stock →" tag turns orange.
- **Everything else is scenery:** saw, sander, grinder, bin, air reel, secondary table, big work table, workshop PC, drill bits and charging table, and the Beta cart. It's drawn for the look and does nothing.
- **CNC and 3D print** are in another room. For now they are two cards beside the map (name, part, who, time, a state pill). Later they become a cutout of their own room on the same screen (phase 6).

### The tag (bubble)
- **Collapsed** (always visible): the machine name in bold, a colour chip and the state word.
- **Open** (hover on desktop, tap on phone, tap again or tap elsewhere to close):
  - Running: part number and name, then "<first name> · started 40 min ago", then a **Show in list** button.
  - Forgot Done?: the same, plus "Still running, or did someone forget Done?" and a **Mark done** button. That button is the only action on the map; it runs the normal Done and shows the normal toast with Undo.
  - Idle: "3 Lathe parts waiting · last used 2 h ago" (or "not used today").
  - Urgent: the urgent part's number and name with "urgent", then the waiting count and last use.
- **Show in list** closes the panel, clears the machine filter, scrolls to that row and flashes it once.
- The design rules want sentence case, so tags say "Lathe", not Fern's "LATHE". It's a one-line change if Yoni wants the caps.

### Who's making it (the shared workshop PC)
- The workshop PC uses one shared Steamhub account. The admin (Yoni) marks it once in People as **Shared workshop PC**.
- On that account only, Start asks **"Who's making 3019?"**: a search box over everyone with a Steamhub account, plus a **Not on the list?** field that takes a typed name. Personal accounts start parts as themselves, as they do today.
- The picked person becomes the part's maker (`maker_id` and `maker_name`; a typed name sets only `maker_name`). So the map, the history and "manufactured by" on drawings all show the real person. The event log keeps the shared account as `by_id` and stores the picked name in `details.for`.

### Opening it
- **Desktop:** a tab sticks out of the right edge of the Workshop screen, with "Map" written vertically and one status dot per machine (green, yellow, faded green or grey). A click opens the panel. Dragging the tab left pulls the panel out with the pointer and opens it past 80 px.
- **Phone (under 768 px):** a **Map** button in the Manufacturing header opens the panel full screen.
- **Always starts closed.** Nothing is remembered between visits.
- Only on the Workshop tab, not Robots or Wishlist.
- **The opening animation** (Yoni asked for something cool):
  - The panel glides in from the right (520 ms, drawer easing) over a soft dark scrim.
  - The room tips down from a steeper angle into place (rotateX 28° to 0, 640 ms).
  - The lathe, mill and stock shelf drop onto the floor one after another with a little spring (start at 380, 470 and 560 ms).
  - The tags fade in last (760 ms).
  - Closing is a quick 280 ms slide.

  The design skill's checker flags anything over 300 ms on a Use page. This opening is the one agreed exception; everything else stays under 300 ms. With reduced motion turned on, all of it is instant.
- **Ways out:** Close button, Escape, clicking the scrim (the list behind), dragging the panel's left grabber or its header to the right (past 90 px closes; the scrim fades as you drag), and a tap on the grabber.

### Hover feel
- **Machines:** a machine under the pointer lifts 9 px with a springy ease (260 ms) and its floor shadow darkens and spreads. Pressing it squashes it slightly. Idle machines also lighten a step.
- **Stock shelf:** lifts 5 px.
- On phones the same lift plays on tap, while the tag is open.

### History
The panel has two tabs, **Now** and **History**. History has three parts:
- **Today:** a timeline per machine (CNC, Mill, Lathe, 3D print) from 13:00 to the current time, with one bar per part. A running part is a green bar to now. Pointing at a bar shows "3018 · Noam · 16:40–17:25".
- **Hours this week:** one bar per machine, with the hours written next to it.
- **Parts done this week:** one number per machine.

Weeks start Sunday. A part left In progress counts at most 3 h, so a forgotten Done can't ruin the stats. Busiest days and average time per part type wait until there's a season of data.

### Home
A **Workshop now** card on Home. It has a cropped mini map (the back half of the room, where the machines are, live colours, no tags) and one line per machine, e.g. "Lathe 3018 Hex · 40 min", "Mill idle, urgent 3011 waiting". Tapping it goes to `/manufacturing?map=1`, which opens the panel once and removes the parameter from the URL. It sits after `<Season />`. When the season card plan (memory: season-hero-and-proto-defaults) is built, put the two side by side on desktop.

### Look
- **Style:** Fern-thumbnail clay. Solid masses with no outlines, a light top face and a darker front face, a soft blurred contact shadow under each object, a warm grey floor, white walls and pale window panes. Status fills the whole machine, the way Fern colours its subject.
- **Angle:**
  - Seen from the entry (bottom-left), looking down.
  - Height lifts things up the screen (0.72 × height) and leans them slightly right (0.07 × height), so you see the top, the face toward the entry and a sliver of the left side.
  - Fixed: no mouse-follow tilt, because a moving room makes hovering and tapping miss.
  - The front and left walls are cut low so you can see in.
- **Dark mode:** dark clay (`#3a3a38` tops), brighter green and yellow, and the black tags become light tags with dark text.
- **Colours and fonts** follow the site tokens in `src/styles/tokens.css`. Clay tones and the run, stale and urgent colours become new tokens in that file, in both themes, with the values from the demo.
- **Room:** about 9 × 5.4 m, scaled from Yoni's sketch.
  - Back wall: windows behind the lathe, the air reel and the mill.
  - Front wall: windows by the drill table and the Beta cart, and the entry at the bottom-left.
  - The lathe runs along the left wall with its chuck at the north end, as the sketch shows. The photos make it look like it might face the back wall; check with Yoni during phase 2.
- **Phone:** the map keeps a 680 px width inside a sideways scroller, so machines stay a thumb's size. If that feels cramped, the fallback is a phone-only crop of the back half of the room.

## Data

One migration (`supabase/migrations/2026111x_workshop_map.sql`):
- `profiles.shared boolean not null default false`. Only the admin can change it (the existing "admin edits profiles" policy covers this).
- `parts.started_at timestamptz`.
  - Set to `now()` by `claimPart`.
  - Cleared when a part goes back to To-do.
  - Kept when Done is undone, so the run continues.
  - Backfill it for parts already `doing` from their latest `claimed` event.
- Function `public.machine_runs(since timestamptz)`, security invoker so RLS still applies. It returns `part_id, part_no, machine, maker_name, started, ended` (`ended` is null while running). Each `claimed` event pairs with the first `status_done` after it and before the next `claimed`; the machine and number come from `parts`. It feeds History and "last used".
- Index `part_events (action, at)` for the week query.
- RLS needs no other changes: everything is member-only already.

App code:
- `claimPart(p, who, maker?)`: an optional maker `{ id: string | null, name: string }` overrides who is credited and adds `details.for`. It also sets `started_at`.
- `useParts({ released: true })` already loads what the map needs on the Workshop page. The panel reuses that data, so the map adds no fetch to Now.
- History calls `machine_runs(<last Sunday 00:00>)` when its tab opens (fresh per open, per the speed decisions).
- Home gets its own small query on open: released parts that are `doing`, or urgent and `todo`, for Lathe, Mill, CNC and 3D print, with realtime like `useParts`.

## Room geometry

The generator is a short Python file (oblique projection, boxes, cylinders, convex hulls, soft shadows). For the app, port it to TypeScript as `src/lib/workshopRoom.ts`:
- A pure function that returns the polygon list and the anchor points once at module load (about 450 polygons, built in under a millisecond).
- Each polygon has a face (`t`, `s` or `w`), a tone class, and a group: `lathe`, `mill`, `stock` or scenery.
- `src/components/WorkshopMap.tsx` renders it as an SVG: one `<g>` per group with the state class, then the blurred shadow group, then the HTML tags positioned from the anchors with `getScreenCTM()`. This is the same approach as the demo.

So moving a table is a one-number change in one file. Keep the Python copy in `Creations/workshop-map-src/` only as the reference.

## Built (2026-11-12)

Phases 1–5 were built in one go overnight. Phase 6 waits for Yoni's sketch of the second room. Nothing is committed yet.

How the build differs from the plan above:
- **No `machine_runs()` SQL function.** History pairs start and finish events in the app (`pairRuns` in `src/lib/workshopMap.ts`), which handles Undo after Done and "I'll make it instead" more simply.
- **A trigger keeps `started_at`** (`parts_started` in `20261112_workshop_map.sql`). Every way of changing status agrees: Start, the subsystem page's status menu, and Undo. So `claimPart` doesn't set it.
- **History only counts what it should.** A start with no finish counts only while its part is still In progress. A forgotten run counts its first 3 h from when it started, and only the part inside this week.
- **The clay and status tokens live in `src/styles/workshop-map.css`**, not `tokens.css`, so all map styling is in one file.
- **The room is `src/lib/workshopRoom.ts`.** The map is `WorkshopMap.tsx`, the panel is `WorkshopPanel.tsx`, and the Home card is `WorkshopNow.tsx`. The panel and the edge tab render into `document.body` so the page's transforms can't trap them.

Checked:
- **Offline logic test** (19 checks, made-up data): states, the 3 h stale rule, running beating urgent, the newest of two parts, run pairing, Undo, take-over, the cap, and weeks starting Sunday.
- **In the browser, signed in, on real data:**
  - Opening from the edge tab and from `?map=1`.
  - Hover lift and tags, and tap-to-pin on a phone width.
  - All five ways to close, with focus returning to the tab.
  - Show in list (clears filters, flashes the row).
  - History against `part_events`, the Home card, dark mode, and the phone layout with no sideways page scroll.
- **Build:** `tsc`, eslint and `npm run build` pass.

Not checked live (the database tool refused test writes on the live project):
- The **Who's making it?** sheet and the **Mark done** button on a real stale part.
- Green, yellow and faded states from real data. Their colours were checked by switching the CSS classes in the browser.

To check:
1. In People, press **Shared PC** on a test account.
2. Start a released Lathe or Mill part from it and pick a name.
3. Check the map, the row and the part's history.

## Phases

### Phase 1: data, and "who's making it"
- [x] Migration: `profiles.shared`, `parts.started_at` with the backfill, `machine_runs()`, the index. Apply it with the Supabase tool and regenerate types if the project uses them.
- [x] People (admin view): a **Shared workshop PC** switch per account.
- [x] `claimPart` takes an optional maker and sets `started_at`. `setStatus` clears `started_at` on a return to To-do.
- [x] The **Who's making it?** dialog on Start when the signed-in profile is `shared`. Use the existing dialog and `.input` patterns, and `usePeople()` for the names. It has a search box, a "Not on the list?" field with Start, and Cancel. The design rules forbid disabled buttons, so an empty name says "Type a name first".
- [ ] Check on the live site with a test account marked shared (memory: test data on live is OK, real stock is not). Start a part as Noam: the row, the drawing's "manufactured by" and the event all say Noam.

### Phase 2: the map component (Now tab content, shown on a test route first)
- [x] Add the clay and status tokens to `tokens.css`, in both themes.
- [x] Write `workshopRoom.ts` (port the generator) and `WorkshopMap.tsx`: states from parts, tags with collapsed and open states, hover and tap, lift and shadow, Stock link, and the CNC and 3D print cards.
- [x] Forgot Done after 3 h, with Mark done running the normal Done flow and toast with Undo. Show in list scrolls to the row and flashes it.
- [x] Load the ttm-design skill for this phase. Run its `check.py` and `shoot.mjs` (desktop and phone, light and dark), then compare with the demo side by side.
- [ ] Ask Yoni whether the lathe faces the left wall or the back wall, and move it if needed.

### Phase 3: the slide-in panel on Workshop
- [x] The edge tab with status dots (desktop) and the header Map button (phone).
- [x] The panel with Now and History tabs, the opening animation, the scrim, the grabber and header drag to close, Escape, and Close. It always starts closed. `?map=1` opens it once.
- [x] Reduced motion: no animation. Focus moves into the panel on open and back to the tab on close.
- [ ] Try it on a real phone from the home screen app, in the workshop, on the shared PC account.

### Phase 4: History
- [x] The History tab from `machine_runs()`: today's timeline, hours this week, parts done this week, the 3 h cap, weeks starting Sunday.
- [x] Check the numbers by hand against `part_events` for one machine.

### Phase 5: Home card
- [x] The **Workshop now** card after `<Season />`: a cropped live mini map and one line per machine. Tapping it goes to `/manufacturing?map=1`.
- [x] Fresh query on open, plus realtime. No caching between pages (speed decisions).

### Phase 6: CNC and 3D print room (next, needs Yoni's input)
- [ ] Yoni sends a top-view sketch and photos of the second room, like the workshop ones.
- [ ] Draw it as a cutout room on the same screen, next to the workshop, with the same clay style. The CNC and printers get states, and the side cards go away.

## Not in this plan
- Sensors, cameras or anything that detects a machine running on its own.
- States for the saw, sander or grinder (scenery only, by decision).
- Busiest days and average time per part type (later, once there's data).
- Mouse-follow tilt (tried and dropped: it makes tapping miss and phones can't use it).

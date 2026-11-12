# Workshop tasks plan

The workshop lead hands out the parts. Released parts land in **Unassigned**. The lead gives each person a list, in the order he wants them made. Everyone sees their own list on their phone, and the shared workshop PC shows a board with a column per person. Written 2026-11-12 from two rounds of Q&A with Yoni, after Yoni talked it through with Itamar Toledano (the workshop lead). Each phase below is one chat: read this file, do the next unticked phase, tick it here.

## Why this shape

Until now anyone could tap Start on any part (MANUFACTURING.md, "Claiming"). That works when a few people pick their own work. It breaks down when a lead runs the floor: he needs to decide who makes what and in what order, and see at a glance who's busy and who's out of work. The board is last year's Monday board again, but grouped by person instead of by mechanism, and filled in by Steamhub instead of by hand.

This changes three rules in MANUFACTURING.md on purpose:
- **"Everyone signed in can do everything."** Now workshop leads (and admins) are the only ones who can assign, reassign and reorder.
- **"No personalised views."** Now there's a My parts view. The board and the workshop list are still the same for everyone.
- **"Claiming is one tap on I'll make it."** Now parts are handed out. Grabbing an unassigned part with Start still works.

## Decisions

### Who does what
- **Workshop lead** is a flag on the account, like Shared PC. The admin ticks it in People, and more than one person can have it. Itamar Toledano is the first one.
- **Leads and admins** can assign, reassign, unassign and reorder anyone's parts, and mark urgent. They can also Start and Done any part, to clean up after someone who forgot.
- **Everyone else:**
  - Starts and finishes **their own** assigned parts.
  - Can grab an **unassigned** part by tapping Start. It becomes theirs.
  - Can **give back** their own part (To-do or In progress), which returns it to Unassigned and tells the leads.
  - **Can't** start or finish a part assigned to someone else. The button isn't there, and the database refuses it too.
- **Releasing** stays as it is: anyone can release parts, and in practice it's the CAD people. Released parts go to Unassigned.

### What can be assigned
- Every released part that's made in the workshop: CNC, Lathe, Mill, 3D print. Hex shafts, tubes and profiles count, because they get cut and machined.
- **Not bought parts** (machine = Bought: bearings, motors and so on). They keep Needed / Got it / Missing as today and never show on the board.
- **No splitting.** A part with qty 8 goes to one person.

### Order
- Each person has **one list across all subsystems**, in the order the lead set. The top one is "do this next".
- **Urgent always sits on top**, in the warning colour. Inside urgent and inside the rest, the lead's order applies.
- **New assignments go to the bottom** of the person's list, keeping the order they had in the selection (part number).
- Stored as `queue_pos` (a number with room in between), so moving one part changes one row.

### The board (`/manufacturing/board`)
- A new tab in Manufacturing: **Workshop · Board · Robots · Wishlist**. On the shared PC account, Manufacturing opens on Board.
- **Columns:** Unassigned first, then one per person who has open parts or finished one in the last 12 hours. People with nothing don't get a column. Sorted by name, and leads can't pin columns (not needed yet).
- **Cards:** part number, name, qty, machine tag, subsystem number, urgent flag, status. Big touch targets with **Start** / **Done** right on the card, like the workshop list.
- **Done parts** stay at the bottom of the column, faded, for **12 hours** after Done, then drop off. `done_at` is kept by the database for this.
- **Column header:** name, count of open parts, and a dot when they have something In progress.
- **Unassigned** also shows parts that are In progress with a typed-in maker who has no account (from before this ships), with "In progress · <name>".
- **Filters** (in the URL, like the workshop list): robot, subsystem, machine. "Only CNC" turns the board into the CNC queue.
- **Wide board on a narrow screen:** columns scroll sideways, each at least 280 px wide. On phones the board shows one column at a time with the names as tabs on top.
- Realtime like the rest of Manufacturing.

### Tap your name (shared PC)
- Tapping a column's name opens **that person's list full screen**: big rows, the drawing a tap away, Start / Done / Give back. This is how someone on the shared PC sees "what do I do now".
- It returns to the board after 3 minutes with no touch, so the next person doesn't land in someone else's list.
- **Start on an assigned part credits the person it's assigned to** without asking, because it's their part.
- **Start on an unassigned part** asks "Who's making 3019?" (the existing picker). The picker now shows **recent picks first**: the last 8 people picked on this PC, as big name buttons above the search. Saved in the browser on that PC, so it costs nothing to set up. The picked person becomes both the maker and the assignee.

### My parts (phones and personal accounts)
- `/manufacturing/mine`: your list in your order, then your done parts from the last 12 hours.
- On phones, the **Make** tab opens My parts when you have any assigned parts, and the workshop list when you don't. A link at the top switches between them.
- Home's quick link says "3 parts for you" when you have some.

### Lead tools
- **Assign mode** (a button on the board and the workshop list, leads only):
  1. Filter (robot, subsystem, machine).
  2. Tick parts, or **Select all shown**.
  3. **Assign to…** opens the people picker: recent picks first, then search.
  The bar at the bottom says "12 parts selected · Assign to… · Unassign".
- **Drag and drop on the board** (mouse and touch):
  - Drag a card to another column to reassign it.
  - Drag it to Unassigned to unassign it.
  - Drag it up or down to reorder.
- **Without dragging** (phones, or anyone who prefers buttons): each card's menu has Move to top, Up, Down, Reassign…, Unassign.
- **Urgent** keeps working as today, from the card menu or the part page.
- **The workshop list** (`/manufacturing`) stays as it is, with a small "→ Noam" chip on assigned rows and an Assigned to filter.

### Notifications (the existing bell)
- **To the person:** "Itamar gave you 12 parts" (one notification per person per assign action, not per part). "3012 moved to Ari" or "3012 is unassigned" when the lead takes one away.
- **To leads:**
  - "8 parts released in Intake, waiting to be handed out": one per release action.
  - "Noam gave back 3012".
  - "Noam has nothing left": when someone's last open part is done or given back.
- **To the person, from CAD changes:** changed and gone parts already warn the subsystem lead and the maker. Now they also warn the assignee.
- Nobody gets notified about their own actions.

### Map, history, drawings
- The workshop map is unchanged: a machine is running when one of its parts is In progress.
- "Manufactured by" on drawings stays the maker (the person who tapped Start, or the assignee on the shared PC).
- The part's history logs assigned, reassigned, unassigned, given back and reordered-to-top, with who did it.

## Data

Migration `supabase/migrations/20261113_workshop_tasks.sql` (applied 2026-11-12), safe to run before the code is deployed (it only adds):

- `profiles.workshop_lead boolean not null default false`, readable by members. Set Itamar Toledano's.
- `public.can_assign()`: `is_admin()` or the caller's `workshop_lead`.
- `parts` gets:
  - `assignee_id uuid` (references profiles, on delete set null)
  - `assigned_at timestamptz`
  - `assigned_by uuid`
  - `queue_pos double precision`
  - `done_at timestamptz`
- **`done_at` kept by a trigger:** set when status becomes done, cleared when it leaves done. Backfilled from the last done event.
- **Guard trigger on `parts`** (`before update`), so the rules hold however the row is changed:
  - `assignee_id` or `queue_pos` changes need `can_assign()`, except for two cases:
    - **Grab:** `assignee_id` goes from null to someone, in the same update as status todo → doing. On a personal account it must be the caller. On the shared account it can be the person picked.
    - **Give back:** `assignee_id` goes to null and the caller is the assignee or the shared account. Status goes back to todo and the maker is cleared.
  - A status change on an assigned part needs the caller to be the assignee, the shared account, or `can_assign()`.
- **Index** on `parts (assignee_id, status)`.
- **Backfill:** parts that are In progress with a `maker_id` get `assignee_id = maker_id`. Everything else released stays unassigned.
- **Notifications** for assign, release and "nothing left" are sent from the app (`notify()` in `src/lib/mfg.ts`), batched per action. "Nothing left" is checked after Done and Give back.

## Phases

### Phase 1: database and actions (built 2026-11-12)
- [x] Migration above, applied. Itamar Toledano ticked as lead.
- [x] People: **Workshop lead** button next to Shared PC, admin only.
- [x] `src/lib/mfg.ts`:
  - `assignParts(parts, person, who)`, `unassignParts`, `moveInQueue(part, before, after)` and `giveBack(part, who)`, each logging events and notifying.
  - `claimPart` sets the assignee when grabbing.
- [x] `canAssign` on the auth context. The workshop list hides Start / Done on other people's parts.
- [ ] Check in the browser (2026-11-12: board, hand-out mode and picker checked read-only; writes not clicked through, the test session wasn't allowed to change live data):
  - A non-lead can't assign, even by calling the API directly.
  - Start on someone else's part is refused.
  - Grab and give back work.

### Phase 2: the board and tap your name (built 2026-11-12)
- [x] `/manufacturing/board` with columns, cards, done-for-12-hours, filters, realtime, and the phone one-column view.
- [x] Full-screen person list with the 3 minute return.
- [x] Shared PC: Manufacturing opens on Board. Start on an assigned part credits the assignee. The picker shows recent picks first.
- [x] Checked at 1440 × 900 and 390 × 844, no sideways scrolling on the phone.

### Phase 3: lead tools (built 2026-11-12)
- [x] Assign mode with filters, select all shown, the bottom bar, and Assign to… with recent picks.
- [x] Drag between columns and within a column, with mouse and touch. The card menu has Move to top, Up, Down, Reassign and Unassign.
- [x] "→ Name" chip and Assigned to filter on the workshop list.

### Phase 4: My parts, notifications, docs (built 2026-11-12)
- [x] `/manufacturing/mine`, the Make tab rule, and the Home quick link.
- [x] All the notifications above, including CAD changes to the assignee.
- [x] MANUFACTURING.md: update the three rules under "Decisions" and point here.
- [x] The guide (`src/content/guide.tsx`): Your parts, The board, Handing out parts. Screenshots still to take.

## Not now

- Due dates tied to the Calendar ("needed by Tuesday").
- Splitting one part between people.
- Assigning bought parts to collect.
- Leads per machine (a CNC lead, a print lead). The flag already allows several leads if that's ever wanted.

## Pushback: reject, ask first, done with a note (planned 2026-11-12)

Three ways to push back on a part, each with a note to the people responsible for it: **whoever released it, plus the subsystem lead if that's someone else**. Agreed with Yoni in one round of Q&A.

### Decisions
- **Reject (workshop lead, before handing out or starting).**
  - Toledano (or an admin) presses **Reject…** on a To-do part, writes why ("no 6 mm plate", "drawing is missing a hole"), and sends.
  - The part goes back to **In design** on its subsystem page, with a red **Rejected** note: who, when, and why. It drops off the board and the list, and any assignee is cleared (they're told).
  - **Release** clears the note. The responsible people, and the assignee if there was one, get the note as a notification.
- **Ask first (the maker, instead of Start).**
  - On a To-do part you may work on, **Ask first…** sends a question ("can I use the 6 mm plate instead of 5?").
  - The card shows **Waiting for an answer** until someone answers.
  - The responsible people, or a workshop lead, answer on the part page with **Go ahead** or **No, make it as drawn**, plus an optional note.
  - The asker is told. The question and answer stay on the part page.
  - Nothing is blocked: it's a question, not a lock. On the shared PC it asks who's asking, like Start.
- **Done, with a note (the maker, instead of Done).**
  - On an In-progress part, **Done, with a note…** finishes the part and sends what was different ("used 6 mm instead of 5").
  - Nobody approves anything. The part keeps a **Made differently** tag with the note on the part page, the subsystem page, the board and the list, so assembly knows. The rest is sorted out in person.

### Data
Migration `supabase/migrations/20261114_part_pushback.sql`:
- `parts`:
  - `rejected_note`, `rejected_by`, `rejected_at`.
  - `asking` (bool): an open question, for the card tag.
  - `made_differently` (text).
- `part_requests`: id, part_id, kind (`ask` / `done_note` / `reject`), note, by_id, by_name, for_id (the person, when the shared PC asks for them), status (`open` / `approved` / `denied` / `info`), answer, answered_by, answered_by_name, answered_at, created_at. Members read and add. Answering (update) is for leads, admins, the releaser and the subsystem lead (`can_answer(part_id)`).
- The guard on `parts` refuses setting `rejected_note` unless `can_assign()`. Clearing it (Release) is open to everyone.

### Build
- [ ] Migration, applied. Written; waiting on Yoni's OK in the Supabase tool (it timed out unanswered on 2026-11-12).
- [x] `src/lib/mfg.ts`: `responsibleFor(part)`, `rejectPart`, `askFirst`, `answerAsk`, `doneWithNote`; release clears the rejection.
- [x] A note sheet (one text box, one button), used by all three.
- [x] Board and list card menu: Reject… (leads), Ask first… (To-do), Done, with a note… (In progress). Tags: Waiting for an answer, Made differently.
- [x] Part page: the same actions, the red Rejected box, the open question with Go ahead / No, and a Questions section with the history.
- [x] Subsystem page: Rejected and Made differently tags with the note.
- [x] Home: "Waiting for your answer" for the responsible people.
- [x] Guide entries.
- [ ] Deploy, after the migration.

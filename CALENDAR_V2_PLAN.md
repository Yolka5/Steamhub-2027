# Calendar v2 plan

Written 2026-11-22 from Yoni's feedback after the Monday import, then checked again against the live data and the code. **Nothing here is built yet.** The questions at the end decide the details.

**Demo:** `Creations/calendar-v2-demo.html` (open it through the dev server: `http://localhost:5173/Creations/calendar-v2-demo.html`). It's built on the recommended answers below: Board, Month and Sections views, section colours with stripes, comments with follow and mute, a Google event with a suggested section, GitHub-synced Programming tasks, and the GitHub block. Fake data, saved in the browser; "Start over" resets it.

## Status (2026-11-24): built, on the live database, not committed

Built on the recommended answers (Yoni: "start building the whole thing"; meetings have no fixed days, planned a week ahead; no GitHub details yet).

- **Database** (`20261130_calendar_v2.sql`, `20261201_calendar_v2_github.sql`, both applied):
  - `cal_sections` with colours. `cal_groups.team` now points at a section.
  - A `custom` group kind, plus a group's own colour and its GitHub label.
  - `cal_lists`: "To-Do December" moved over.
  - `comments` and `comment_follows`. The empty `phase_notes` moved in. Notifications come from a trigger (`comments_notify`).
  - `events.kind_by_hand`, so the Google sync keeps a kind set by hand.
  - GitHub fields on `tasks`, and `profiles.github`.
  - Strategy is a section with ziv guy as lead. The empty subsystem 7 is gone.
- **App:**
  - Sections from the database in every screen.
  - Section colour as a stripe on Board, Month, Gantt, Plan and filters. Filters take several sections at once.
  - The Sections page, `/calendar/sections`.
  - "+ Group" on each section, and lists inside groups.
  - Comments on tasks, groups, lists, phases and events, with "who hears" and follow or mute.
  - In the month grid, a thin Periods strip for anything over a week. `dir="auto"` on titles.
  - Google events: Steamhub's own fields stay editable, plus a suggested section.
  - The Monday import only adds new items now.
- **GitHub:** the `github-sync` function is deployed and runs every 15 minutes from about 06:00 to 24:00 Israel time. The Import page has a GitHub block. It waits for the repo and the key (`GITHUB_TOKEN` in Supabase secrets).
- **Meetings:** reminders follow any event of kind Meeting. That includes Google events, once someone sets the kind to Meeting by hand, or the title says meeting, מפגש, פגישה or אימון.
- **Mechanics has no single lead** (Yoni, 2026-11-24). Its groups' leads (CNC, Workshop, each project) get their own daily update reminders.
- The "ghjghj" test phase is deleted.
- **Still open:**
  - The GitHub repo, board and key.
  - Kickoff 2's date: Monday says 31 Dec, Google says 27 Dec.

## What was asked

1. **Strategy gets its own top-level section**, next to Mechanics, Electronics and Programming, and anyone can **add more sections**.
2. **Comments everywhere**: on any task (To-Do December has none today), group, event and phase. Writing one is always the person's choice.
3. **Assign anything to a section or group**: every task and calendar event can be for Mechanics, Programming, a subsystem, and so on.
4. **Colours per section** (and per group), customizable, and the same colour everywhere: Board, month grid, Gantt, filters.
5. **Everything joined up**: the same sections, colours and comments on every screen, and the problems found so far fixed properly.
6. **Programming's GitHub kanban syncs in**: their issues and sub-issues show up as Programming tasks and subtasks, and update on their own, about every 30 minutes or smarter.

## What's in the way today (checked on live data)

- **Why Strategy is under Mechanics.** Strategy was added as **subsystem 7 of the off-season robot** "Before season Projects". Every off-season subsystem becomes a Mechanics project group, so it got a lead (ziv guy), a **CAD and a Manufacturing phase** that make no sense for Strategy, and it shows wherever robot subsystems are listed (parts, prototypes, the robot page). It has no parts and no tasks, so it can be moved cleanly.
- **The three teams are hard-coded.** The database only allows `mechanics`, `electronics` and `programming` (a check on `cal_groups.team`). The app lists them in `TEAMS` / `TEAM_WORD` and reads `.team` in 12 files: Board, Calendar filters, month grid, Gantt, Plan, Summary, Updates, Import, the group page, the task and event windows, and the person picker. Adding Strategy means making sections data instead of code.
- **No way to add your own group.** Groups are only made automatically (CNC, Workshop, subsystems, projects). A "Scouting" group under Strategy has nowhere to come from.
- **Comments only exist on phases** (`phase_notes`: text, photos, one level of replies, @mentions). Tasks, groups and events have none. Tasks have one `notes` text box, which is a description, not a conversation. Phase notes notify every lead, mentor and admin on every note: fine for a few, noise on every task.
- **No colours.** Colour today means status only (grey, yellow, red, green).
- **Google events belong to no section.** All 21 are "the whole team", so they show under every filter and can't take a section colour.
- **"To-Do December" is a text label**, `tasks.section`, typed per task. It works, but it isn't a real thing you can rename, reorder or comment on.
- **Little data to move.** 20 tasks, 0 subtasks, 0 own events, 0 notes, 0 daily updates. Changing the structure now is cheap, and gets more expensive every week.

## Problems found looking deeper

| # | Problem | Fix |
|---|---|---|
| 1 | Strategy is a robot subsystem with CAD and Manufacturing phases (above). | Strategy becomes a section; subsystem 7 and its two empty phases are removed. |
| 2 | **Daily update reminders never fire.** They're sent when a *meeting* event ends. There are no Steamhub meetings, and every Google event is kind "other". | Set up the real weekly meetings (question 8). |
| 3 | **Mechanics has no lead**, so nobody there is asked for a daily update and the Summary shows nobody missing. Electronics (yohan) and Programming (AMIR) have one. | Set a Mechanics lead, and Strategy's (ziv guy carries over). |
| 4 | **Long Google blocks bury the month grid.** הכשרות תוכנה (Sep to Dec), פרוייקט קבוצתי מכניקה, העשרת ידע and תקופת הכנה each take a row of every week, 3 of the 5 rows. | A thin "Periods" strip at the top of each week for anything longer than a week. |
| 5 | **The Google event window misleads.** It says the next sync undoes every edit. True for name and dates, not for "For", reminders and status. | On Google events, lock what Google owns (name, dates, repeat) and keep Steamhub's own fields editable: section/group, status, follows task, reminders, comments. |
| 6 | **Hebrew titles show in the wrong order** in bars and rows ("חיווט 24" shows as "24 חיווט"). | `dir="auto"` on every title. |
| 7 | **Importing Monday again undoes the fixes** (moves tasks back, brings back Dev Bot's CAD / Assembly / Testing rows that are now Woodbot's). | Question 7: "add new items only", or Monday is done. |
| 8 | Kickoff 2 is on 31 Dec in Monday and 27 Dec in Google. | Pick one. |
| 9 | Phase "ghjghj" in Prototypes - 3D prints looks like a test. | Delete it if it is. |
| 10 | Google has "לעשות פגישת מחזור ל30 שנה" in Oct 2033. | Harmless; it's a joke or should be deleted in Google. |
| 11 | Only one Google block follows a task so far. | Each Google block gets a suggested section from its title, one tap to confirm. |

## The plan

### 1. Sections become data (Strategy, more sections, colours)

- **Three levels, one name each:** **Sections** at the top (Mechanics, Electronics, Programming, Strategy), **Groups** inside them (CNC, Intake, Woodbot, Scouting), and **Lists** inside a group (To-Do December). See question 1.
- **The model.** The existing team rows (`cal_groups` kind `team`) become the sections. Every other group points to its section with a `section_id`. Mechanics, Electronics and Programming keep a fixed key so automatic groups still land right (CNC, Workshop, subsystems and off-season projects in Mechanics). The three-team check goes, and `TEAMS` / `TEAM_WORD` are replaced by the list from the database in all 12 files.
- **Strategy** becomes a section with ziv guy as lead. Subsystem 7 and its CAD / Manufacturing phases are removed. Kickoff and scouting events move under it.
- **Managing sections:** a "Sections" page (from the Calendar's ⋯ menu) to add, rename, reorder, pick a colour and lead, and delete an empty section.
- **Your own groups:** a new group kind `custom`, which anyone can add inside any section (Strategy → Scouting, Kickoff). Automatic groups stay automatic.
- **Lists become real:** `tasks.section` text becomes a small `cal_lists` table, so a list can be renamed, reordered and folded once, not task by task. "To-Do December" moves over as is.
- **Colours:** each section picks from a set of about 12 colours, each tested for light and dark mode and readable text, plus a free colour picker under "More" that warns when a colour is hard to read. A group uses its section's colour unless you give it its own.
- **Where the colour shows**, the same everywhere: section header and its groups, filter chips (which now come from the list, not code), month grid and agenda, Gantt rows, Plan (phone), Summary, the Big view, and "Your tasks" on Home.
- **Colour and status together.** Status already fills the bar. Recommended: section colour as a stripe on the bar's left edge, so a bar says "Programming, In progress" at a glance (question 3).
- **Assigning:** the task window's Group picker and the event window's "For" picker become one picker: section, then a group inside it, or the section itself, or the whole team.
- **Filters:** pick one or more sections, so "Mechanics + Strategy" works.

### 2. Comments everywhere

- One `comments` table replaces `phase_notes`. A comment sits on exactly one thing: a task (subtasks included), group, list, phase or event. Same features as phase notes: text, photos, one level of replies, @mentions, and only the writer edits or deletes.
- A comment chip on every row: task rows (To-Do December included), group headers, phase rows, and in the event window. A count once there's one, a faint icon until then. Nothing asks you to comment.
- **Who hears about it** (question 5), recommended:
  - Task: its owners and its group's lead.
  - Group, list or phase: the group's lead.
  - Event: nobody unless mentioned.
  - @mentions always.
  - A "Tell everyone" tick for the writer when it matters.
  - Anyone can **follow** or **mute** a task or group, so "the person decides" works both ways.
- The daily Summary and the nightly SteamLab recap read the day's comments, as they read phase notes today.
- On a GitHub-synced task, comments stay in Steamhub (they are not sent to GitHub).

### 3. Calendar view fixes

- The "Periods" strip for long blocks (problem 4).
- Section colour stripes and status fills.
- Locked Google fields and honest wording (problem 5).
- `dir="auto"` on titles (problem 6).
- Google events get a suggested section from their title: תוכנה → Programming, אלקטרוניקה → Electronics, מכני / מכניקה → Mechanics, סיאנסי → CNC, קיקאוף / scouting → Strategy. One tap to confirm; the hourly sync never touches it.

### 4. GitHub sync for Programming

- **What syncs:** Programming's GitHub issues become Programming tasks, their sub-issues become subtasks.
  - Steamhub tasks go one level deep; deeper sub-issues come in flattened under their top task.
  - From GitHub: title, open/closed or the board column (Todo / In Progress / Done → Not started / In progress / Done), assignees, labels (as Lists or groups, question 6), and dates from the board's date fields or the milestone.
  - Each task links back to its GitHub issue and shows "From GitHub".
- **Direction:** GitHub → Steamhub only. GitHub stays the truth for programmers; those fields are locked in Steamhub, like Google events. Steamhub's own things stay editable: comments, "waits for" links between a programming task and a mechanics task, colour, and which group it sits in.
- **People:** a `github` username on each profile, set once, so GitHub assignees become task owners. Unknown usernames show as the GitHub name until linked.
- **How often, cheaply.** Recommended: **instant plus a safety net.**
  - A GitHub **webhook** calls a `github-sync` edge function when an issue changes, so changes show within seconds. This needs someone with admin on the repo to add it once (I'd give the exact steps).
  - A **15-minute** run catches anything the webhook missed, and only during the day (07:00 to 23:00).
  - Each run asks only for issues changed since the last one, and with an ETag; an unchanged answer costs nothing against GitHub's limit of 5,000 calls an hour. In practice a few calls an hour.
  - If the board is a GitHub **Project** (columns), its column and date fields come from GitHub's GraphQL API, which has no free "unchanged" answer, so the board is read only when an issue actually changed.
  - A "Sync now" button for impatient moments.
  - Without the webhook, the 15-minute run alone still works.
- **The key:** a fine-grained GitHub token, **read-only**, for just that repo: Issues and Metadata, plus Projects if their board is a GitHub Project. If the repo belongs to an organization, the organization may need to approve the token. **Don't paste it in chat.** You put it in Supabase yourself (Edge Functions → Secrets → `GITHUB_TOKEN`), the same way the Google key was done. The app never sees it.
- **Built like the Google import:** a "GitHub" block on the Import page with the repo or board link, last sync, errors and Sync now.

### 5. Checks

- Built and tested on demo data first (`scripts/guide-shots/mock.mjs`): add a section, recolour it, add a custom group and a list, move a task and an event into it, comment on a task with a mention and check who's notified, sync a test GitHub repo.
- Then on the live data, computer and phone, light and dark, with screenshots of each screen.

### Order

1. Sections, Strategy, colours, lists (touches the most files; everything builds on it).
2. Comments.
3. Calendar view fixes.
4. GitHub sync (waits for the token and the answers about their board).

Each part goes live on its own when it's done. Before part 1: pictures and a clickable demo of the Board, month grid and the Sections page with colours.

## Questions

1. **Names:** Sections → Groups → Lists, as above?
2. **Who manages sections and colours:** everyone (like the rest of the Calendar), or admins and leads only?
3. **Calendar bars:** section colour as a stripe plus status fill (recommended), or a switch "Colour by section / by status"?
4. **More than one section per task or event** (a joint Mechanics + Programming session)? Recommended: one section or "Whole team".
5. **Comment notifications:** the recommendation above (owners and lead, @mentions, optional "Tell everyone", follow / mute)?
6. **GitHub:** the repo or board link; GitHub Project board with columns, or plain issues; sub-issues or checklists inside issues; do labels mean anything (like "Vision", "Auto") that should become groups; who can add a webhook; read-only, or should Steamhub changes go back to GitHub?
7. **Monday:** one-time move, or still in use for a while?
8. **Meetings and leads:** the real weekly meeting days and times, so daily update reminders work; and who leads Mechanics?
9. **Strategy subsystem 7:** OK to remove it from the off-season robot? It has no parts or tasks, only two empty phases.

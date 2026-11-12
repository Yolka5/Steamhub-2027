# Calendar plan

Monday.com, rebuilt as Steamhub's Calendar section. Written 2026-11-12 from a Q&A with Yoni. Each phase below is meant to be one or two chats: read this file, do the next unfinished phase, tick it off here.

## Why this shape

The team uses Monday for time management and subsystem updates (last year also for manufacturing, which Steamhub's Manufacturing section already replaced). What the team actually uses in it:

- Tasks for each team, with subtasks
- A status on each task (Not started, In progress, Done) and a priority
- Gantt and calendar views
- Comments that work as a daily summary

Monday knows nothing about the robot. Steamhub knows the people, the subsystems and their leads, the prototypes, the parts and the robot versions. So the Calendar isn't a copy of Monday: it's the same few things, with Steamhub doing the updating wherever it can.

The rules are the same as everywhere in Steamhub:

- **Simple first.** If a lead needs more than one screen and one tap to do their daily job, it's wrong.
- **The work does the updating.** Prototype, CAD and manufacturing progress come from real data, never typed percentages.
- **Fixed fields.** No custom columns, statuses, automations or board settings. That's how Yoni's previous attempt died. The only modular thing is phases.
- **Same screens for everyone.** Filters live in the URL. Everyone signed in can do everything.

## Decisions

- **Groups.** Every task belongs to a group. The three teams are Mechanics, Electronics and Programming. Only Mechanics has groups under it: CNC (lead Ariel Arbib), Workshop (lead Itamar Toledano), and one group per subsystem (Intake, Shooter, Chassis...).
  - Subsystem groups are made by V1 setup (the Season card sheet), with the same number, name and lead. Renaming a subsystem renames its group. Nobody sets groups up by hand.
  - Groups are per season. A subsystem group spans V1 and V2 (subsystem numbers stay the same across robots).
  - Leads are picked from Steamhub accounts.
- **Phases** are the modular part. A group has zero or more phases, in order, each with a start and end date on the calendar.
  - Anyone can add, rename, reorder or delete phases and set their dates. A group with no phases is just a task list (CNC and Workshop will probably stay that way).
  - **Presets:** a V1 subsystem starts with Prototypes → CAD (V1) → Manufacturing (V1). Starting V2 adds CAD (V2) → Manufacturing (V2) to every subsystem group, with no Prototypes phase. Presets are a starting point and can be changed after.
  - **CAD and Manufacturing belong to a robot**, so V1 CAD and V2 CAD are separate phases.
  - Phases follow each other by default (the next one waits for the previous one). They can be dragged to overlap when that really happens.
  - **Linked phases** (Prototypes, CAD, Manufacturing) read their progress from Steamhub, and Steamhub **suggests** when one is done. A person always approves; it never switches on its own. Phases anyone invents get their progress from their tasks.
  - The **current phase** of a group is the first phase not marked done.
- **Tasks:** name, owners, start and due date, status, priority. Optional: phase, subtasks, waits for, a link (prototype, subsystem, part). Anyone can create and edit tasks.
  - **Status:** Not started → In progress → Done. No Stuck, no Cancelled.
  - **Priority:** Low, Normal (default), High. Only High is shown on rows, in the warning colour, like urgent parts.
  - **Subtasks:** one level deep only, shown as a count on the row ("2/4").
  - **Waits for** (dependencies): a task can wait for other tasks. When a task's dates move later, everything waiting for it moves by the same amount, down the whole chain, with one Undo. When a task is done, the owners of tasks waiting only for it get "X can start".
  - No comment threads on tasks. Updates live on groups and phases (below).
- **Daily updates.** At the end of the day, each lead writes one plain-text update for their group. Leads are the three team leads, the CNC and Workshop leads and every subsystem lead.
  - One update per group per day. Sending again the same day edits it.
  - The update is filed under the group's current phase automatically, so every phase builds up its own history ("all Intake updates during prototyping"). Groups with no phases keep theirs under the group.
  - **Summary page:** one screen per day with every group's update, grouped by team, and "not sent yet" next to leads who haven't sent theirs. Everyone can see it.
- **Events:** anything that isn't a task, like meetings, competitions, deadlines and kickoff. They have a date (or a time range), an optional group, and can repeat weekly.
  - **Meetings are a repeating event** (for example Sun, Tue, Thu 16:00-21:00), set once in the calendar and changed whenever the schedule changes. No hardcoded meeting days.
  - **Any event can have reminders** ("1 day before", "1 hour before").
  - **Daily update reminder:** when a meeting event ends, every lead who hasn't sent today's update gets a reminder. No meeting that day means no reminder.
- **Notifications** use the existing bell, and reach the phone through push (phase 0). Sent for: assigned to a task, due tomorrow, overdue, a task you wait for is done, a phase suggested as done (to the group lead), event reminders, daily update reminder.
- **Navigation.** Calendar gets its own item on the rail on computers. On phones it stays off the tab bar: it's on the Home card and in Tools. If it turns out to be used daily, it replaces something on the tab bar later.
- **Time zone:** Asia/Jerusalem for every date, reminder and "today".

## Screens

### Calendar page `/calendar`

One page, three views as picks at the top: **Board**, **Calendar**, **Gantt**. The view and filters live in the URL. Filters: Mine / All, and the team (Mechanics, Electronics, Programming). Leads see **Send today's update** at the top until they've sent it.

### Board (default)

```
▾ Intake · lead Noa                 Prototypes ███▌ 2 tests    3 open
  ● Roller test v2          Thu 14    HIGH   In progress
  ○ Side plates CAD         Mon 18           Not started
     waits for Roller test v2
▾ Shooter · lead Itay  ...
                                                   [ + Task ]
```

- Groups fold. The group header shows the current phase and its progress.
- One row per task: name, due date, priority (only when High), status. **Tap the status** to move it to the next one; tap the row to open the task.
- Overdue dates are red. Nothing else gets colour.
- **+ Task** is one field that reads the text: `Roller test v2 thu high` picks up the day and priority, the same way Stock reads `20x40x1 700`. Chips under it for tapping. The group is the one being looked at, the phase is its current phase.

### Task

A sheet from the bottom on phones, a side panel on computers. One screen, no tabs: name, group and owners, status picks, priority picks, dates, waits for, link, subtasks with a checkbox each.

### Group and phase

Tap a group header to see its phases in order, each with dates, progress and its updates (newest first). A suggested phase shows a banner: "All 30 parts released. Finish CAD (V1)?" with **Finish** and **Not yet**.

### Today's update

```
Today's update · Intake          Wed 13 Nov
[ Rollers slip at 60%, ordered softer wheels. ]
                              [ Send ]
```

One text box. It shows which phase it will be filed under.

### Summary `/calendar/summary`

One day per screen, with a day picker. Teams in order, each group's update under its lead's name, "not sent yet" for the missing ones.

### Calendar view

- **Phones:** an agenda list. Today at the top, then the days ahead: tasks due, phases starting or ending, events.
- **Computers:** a month grid with tasks and phases as bars across their dates, and events. Tap a day to add an event.

### Gantt

- Rows grouped by team, then group. Each group shows its phase bars with progress inside, and its tasks under them, folded by default.
- Drag a bar to move it, drag its end to change the length. Drag from one bar to another to make it wait. Arrows show who waits for whom.
- A line for today. Milestones (kickoff, V1 start, V2 start, competitions) come from the Season card and events.
- Zoom: week, month, season.
- Computers and the workshop touchscreen edit it. Phones can look and scroll, but not drag.
- Built by hand in Steamhub's look, no Gantt library.

### Around Steamhub

- **Home:** a "Your tasks" card with today's and overdue tasks. Leads also see "Send today's update" there until they've sent it.
- **Subsystem page:** the subsystem's phases and open tasks, short.
- **Ctrl K** finds tasks and groups.
- **People → Download a backup** includes tasks, phases, updates and events.
- **Guide:** a Calendar step, and "Add Steamhub to your home screen" for iPhone push.

## Linked phases

| Phase | Progress shown | Suggested as done when |
|---|---|---|
| Prototypes | prototypes and tests for the subsystem, and the chosen one | a prototype for the subsystem is Chosen |
| CAD (robot) | parts released out of all parts | the subsystem has an upload and every made part is released |
| Manufacturing (robot) | parts done out of made parts, plus bought parts got | the subsystem is ready for assembly (every part done or got) |
| Anything else | tasks done out of tasks | every task is done |

A suggestion notifies the group lead once. **Not yet** hides it until the data changes again.

## Data

| Table | Columns |
|---|---|
| `cal_groups` | id, season, team (mechanics/electronics/programming), kind (team/cnc/workshop/subsystem), subsystem_number (nullable), name, lead_id, sort, created_at |
| `cal_phases` | id, group_id, name, kind (prototypes/cad/manufacturing/custom), robot_id (cad and manufacturing), sort, starts_on, ends_on, follows_previous (bool, default true), done_at, done_by, dismissed_at (Not yet) |
| `tasks` | id, group_id, phase_id (nullable), parent_id (subtasks), title, status (todo/doing/done), priority (low/normal/high), starts_on, due_on, prototype_id, part_id (nullable links), sort, done_at, created_by, timestamps |
| `task_owners` | task_id, user_id |
| `task_waits` | task_id, waits_for_id (no cycles, checked on save) |
| `cal_updates` | id, group_id, phase_id (nullable), day, author_id, text, timestamps. One per group per day |
| `events` | id, title, kind (meeting/competition/deadline/other), group_id (nullable), starts_at, ends_at, all_day, repeat_days (weekdays, nullable), repeat_until, reminders (minutes before, int[]), created_by, timestamps |
| `push_subscriptions` | id, user_id, endpoint, p256dh, auth, user_agent, created_at |
| `reminders_sent` | key (event + occurrence + user, or task + kind + day), sent_at. So nothing is sent twice |

Members-only RLS on everything, as in `20261111_members_only.sql`. Tasks, phases and updates are in realtime.

## Phases

### Phase 0: push notifications
- [ ] VAPID keys in Supabase secrets, `push_subscriptions` table.
- [ ] Service worker (`sw/sw.js`) shows pushes and opens the link on tap.
- [ ] "Turn on phone notifications" on the Notifications page and once on Home, never nagging. On an iPhone not on the home screen, it says how to add it first.
- [ ] Edge function `send-push`, called for every new row in `notifications` (database webhook), so everything that rings the bell today also reaches the phone: urgent parts, parts changed in CAD, new tests, new accounts. Dead subscriptions are removed.
- [ ] Guide step for iPhone home screen.
- [ ] Checked on Android Chrome and an iPhone from the home screen.

### Phase 1: groups, tasks, Board
- [ ] Migration: `cal_groups`, `cal_phases`, `tasks`, `task_owners`, `task_waits`.
- [ ] Team groups plus CNC and Workshop made on first open of the season. Subsystem groups made and renamed with V1 setup and subsystem edits; V1 presets; starting V2 adds its phases.
- [ ] `/calendar` with the Board: groups, rows, tap status, filters in the URL, + Task with text reading.
- [ ] Task sheet and panel, subtasks, owners.
- [ ] Group page with phases: add, rename, reorder, delete, dates, Finish.
- [ ] Rail item, Tools tile, Home "Your tasks" card, Ctrl K.
- [ ] Notifications: assigned to a task.

### Phase 2: daily updates and summary
- [ ] `cal_updates`, Today's update screen, filed under the current phase.
- [ ] Updates on the group and phase pages.
- [ ] `/calendar/summary` with "not sent yet".
- [ ] "Send today's update" on the Board and Home for leads.

### Phase 3: Calendar view, events, reminders
- [ ] `events`, add and edit, weekly repeat.
- [ ] Agenda on phones, month grid on computers.
- [ ] Scheduled job (pg_cron every 5 minutes → edge function `reminders`): event reminders, daily update reminder when a meeting ends, due tomorrow, overdue. `reminders_sent` keeps it to once.

### Phase 4: Gantt and waits for
- [ ] Gantt with phase and task bars, today line, milestones, zoom.
- [ ] Drag to move and resize, drag to link. Moving a task later moves everything waiting for it, with Undo. Cycles refused.
- [ ] Waits for on the task sheet. "X can start" notification.
- [ ] View-only on phones.

### Phase 5: linked phases
- [ ] Progress for Prototypes, CAD and Manufacturing phases from Steamhub data.
- [ ] Done suggestions with Finish / Not yet, and the lead's notification.
- [ ] Task links to a prototype or part, shown on both sides.
- [ ] Subsystem page shows its phases and open tasks.
- [ ] Backup CSV includes the Calendar tables. Guide step.

## Not in this plan

- Importing from Monday (the new season starts from scratch).
- Comments on tasks, Stuck status, custom fields, automations, time tracking.
- Google Calendar sync. A read-only feed Google can subscribe to is cheap if it's ever wanted.
- Email notifications (push replaces them for now).

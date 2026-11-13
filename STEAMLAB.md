# SteamLab plan

A bird's-eye view of the whole team for mentors and leads: are we on schedule, where is everyone right now, and what happened today. Claude writes a recap of each workshop day at 02:00, pushes it to mentors, and sends each lead a recap of their own subsystem.

Status: planned and approved on 2026-11-13, then built the same night: all five phases, see **Built** below. The demo is `Creations/steamlab-demo.html`, built by `node Creations/steamlab-src/build.cjs`, and it draws the real rooms from `src/lib/workshopRoom.ts` and `src/lib/cncRoom.ts`. Nothing is committed yet.

## Decisions

- **Who sees it:** mentors, leads and admins. Mentors get a new `mentor` switch in People, which only an admin can turn on. A lead is anyone who is `lead_id` on a subsystem or a calendar group. Nobody else sees SteamLab in the sidebar, and the route sends them Home.
- **Questions it answers, in order:** are we on schedule, what happened today, where is everyone. "Who's stuck" was left out on purpose.
- **Layout (laptop first):** schedule tiles across the top, then the two rooms side by side with the timeline under them, and the recap and feed in a rail on the right.
- **Layout (phone):** many mentors are away, so the phone matters as much. The order is recap, schedule tiles (swiped sideways), rooms (Workshop and CNC room as tabs), then the feed.
- **Replay:** a timeline under the rooms for any day. Drag it or press play. Machines, avatars, the feed and the numbers all follow the playhead. On today, the live end is "now".
- **Recaps:** Claude writes them every night at 02:00 for the day before. They're kept in SteamLab as an archive. The team recap goes to mentors as a push, and each subsystem's recap goes to its lead. No "write one now" button, since it wasn't picked.
- **Design:** ttm-design Use / Tool, as in the demo. The design check is clean. The replay pops are the only motion over 300 ms, because the replay is a sim.
- **3D printers** aren't in either room, so they get one line under the CNC room.

## Where the numbers come from

| What | Source |
|---|---|
| % of parts made | `parts` per subsystem: done ÷ all, ignoring cancelled and bought |
| Plan % (the orange tick) | The subsystem's manufacturing phase in the Calendar (`cal_phases` with kind `manufacturing`, `starts_on` → `ends_on`), as a straight line from 0% to 100%. With no dates there's no tick, and the tile says "No plan dates" |
| Days behind | (plan % − made %) ÷ the phase's % per day. Under 0.8 days reads "On track", 5 points or more ahead reads "Ahead" |
| Machine sessions (who's on what, the timeline) | `part_events` start and done, paired with the existing `pairRuns` in `src/lib/workshopMap.ts` |
| Feed | Parts done (`part_events`), tests filmed (`prototype_tests`), prototypes chosen (`prototypes`), lead updates (`cal_updates`), phases done (`cal_phases.done_at`), stock and plate changes |
| "Updates 4/5" | `cal_updates` for that day ÷ subsystem groups |

"Where everyone is" only knows about people who are running a part on a machine. People assembling, doing CAD or away from machines don't show. The plan accepts that for V1, and a check-in can come later if mentors miss it.

## The recap function

- **Edge function `steamlab-recap`** (Deno). It collects one day's data from the tables above into one JSON, sends it to Claude, and saves the answer.
- **Model:** `claude-opus-5-5` at `effort: "medium"`, with the server-side fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), so a declined request is re-run on another model inside the same call. It goes through the official SDK (`npm:@anthropic-ai/sdk`), which runs in Deno.
- **Output:** structured JSON (`output_config.format`), with one block per scope: `{ scope: "team" | <subsystem>, headline, paragraphs[], worth_a_look[] }`. The team recap and every subsystem recap come back in one call.
- **Prompt rules:** plain English, short, numbers with units, no blame, name the gap and its likely cause, and "Worth a look" holds at most 3 concrete actions. Facts only from the JSON.
- **Key:** an edge function secret, assumed to be named `ANTHROPIC_API_KEY`.
- **Schedule:** `pg_cron` at `0 0 * * *` UTC. That's 02:00 in Israel in winter and 03:00 after the clocks change in late March. This is the same way `cal-reminders` runs.
- **Skips:** a day with no events (no workshop) writes nothing and pushes nothing, so it costs nothing.
- **Cost:** about 20K tokens in and 5K out (thinking included) is roughly $0.20 a night. That's about $5 a month in build season, and less in quiet weeks.
- **Pushes:** insert rows into `notifications`. The existing trigger then calls `send-push`. Mentors get the team headline, and each lead gets their subsystem's headline. Tapping one opens `/steamlab?day=…`.
- **Privacy:** what Claude sees is first names, part names, numbers and lead updates. No emails.

## New database pieces

- `profiles.mentor boolean default false`. Only an admin can write it, and it shows in People.
- A `can_steamlab()` function: admin, mentor, or a lead of any subsystem or calendar group.
- A `steamlab_recaps` table: `day date`, `scope text` ('team' or a subsystem id), `headline`, `paragraphs jsonb`, `look jsonb`, `events int`, `model`, `created_at`, and `unique (day, scope)`. It's readable when `can_steamlab()`, and only the function writes to it.
- A cron job `steamlab-recap` that calls the function.

## Build phases

1. **Access and page.** Add the mentor switch in People, `can_steamlab()`, the `/steamlab` route, and the sidebar entry for those who can see it. Build the page shell with the day switcher, the schedule tiles from real `parts` and `cal_phases`, and the phone order.
2. **Rooms and replay.** Reuse `WorkshopMap` for both rooms, with a time prop so a replay can draw any moment. Add avatars on machines in use, the 3D print line, and the timeline with drag and play. Hovering a subsystem tile lights up only its machines, bars and feed items.
3. **Feed and numbers.** Build the feed from the sources above, cut at the playhead, plus the four numbers (parts, machine hours, tests, updates).
4. **Recaps.** Add `steamlab_recaps`, the `steamlab-recap` function and the cron job. Add the recap card with Team and subsystem tabs, and "Copy". For today, the card shows "written at 02:00" plus the numbers so far. Add the pushes to mentors and leads. Test it on a day of test data on live before turning the cron on.
5. **Polish.** Leads open on their own subsystem's tab, add the archive back to kickoff, and check it on a real phone, in dark mode, and with reduced motion.

## Built (2026-11-13)

- **Database** (`supabase/migrations/20261115_steamlab.sql`, applied on live): `profiles.mentor`, `can_steamlab()`, `steamlab_recaps`, the Vault key `steamlab_cron` with `steamlab_key_ok()` (service role only), `steamlab_run()`, and the cron job `steamlab-recap` at `0 0 * * *` UTC.
- **Function** `supabase/functions/steamlab-recap` (deployed, verify_jwt off). It accepts the Vault key or an admin's sign-in. `{ day, dry, force }` runs any day by hand, and `dry` sends no pushes. A test run for 2026-11-12 (dry) wrote a team recap and the marathon intake's recap from 23 events.
- **App:** `/steamlab` (`src/pages/SteamLab.tsx`, `src/lib/steamlab.ts`, `src/styles/steamlab.css`). There's a sidebar item and a Home tile for those who can open it, and a Mentor button in People.
- **Rooms:** these reuse `WorkshopMap`. Live shows the real parts. A replay passes the parts that were running at that moment, so tags, colours and "Forgot Done?" all follow the playhead. Avatars and pops sit on the room anchors.
- **Different from the plan:**
  - Leads are pushed only their own subsystem's recap, and mentors and admins get the team one, so nobody gets both.
  - The feed has no stock or plate changes yet, because nothing records them by day in a way SteamLab can read.
  - Subsystem tiles show every active robot, test robots included. The robot's name shows when there's more than one.
- **Not checked yet:** a real push on a phone (the test run was dry), and the first nightly run. That one happens tonight at 02:00 and recaps 13 Nov.
- **To pause the nightly run:** `select cron.unschedule('steamlab-recap');`
- **To run one by hand:** call the function signed in as an admin, with `{ "day": "YYYY-MM-DD", "dry": true }`.

## Open

- Turn on the Mentor switch in People for each mentor. Leads already have access.
- A people check-in, if "where is everyone" feels too thin with machine sessions only.

-- Monday import, second pass (CALENDAR.md, "Monday import fixes").
--  - tasks.section: the Monday group a task came from, kept when it lands in a team group
--    (Mechanics holds "To-Do December"), so the Board can show it as a section. Editable on the task.
--  - events.status: Not started / In progress / Done on an event, for the long Google Calendar blocks
--    ("הכשרות תוכנה לשכבת י'"). Null means no status (plain meetings, one-off days).
--  - events.task_id: an event that follows a task takes that task's status, so Monday's status shows
--    on the calendar. ical-sync only writes its own columns, so both survive the hourly sync, and
--    neither marks an event for gcal-push (events_gcal_mark compares other columns).

alter table public.tasks add column if not exists section text;

alter table public.events add column if not exists status text;
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status is null or status in ('todo', 'doing', 'done'));
alter table public.events add column if not exists task_id uuid references public.tasks on delete set null;
create index if not exists events_task_id on public.events (task_id) where task_id is not null;

-- Imported tasks already in a team group keep their Monday group as the section.
update public.tasks t
set section = initcap(split_part(t.import_key, ':', 3))
from public.cal_groups g
where g.id = t.group_id
  and g.kind = 'team'
  and t.import_key like 'monday:%'
  and t.section is null
  and lower(split_part(t.import_key, ':', 3)) <> lower(g.name);

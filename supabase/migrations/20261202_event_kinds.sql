-- Two event kinds (Yoni, 2026-11-24): Event, the default, and Competition. Meeting and Deadline
-- went: nobody used them, and a meeting is just an event. Competitions stay, as the milestones on
-- the phone Plan and the Gantt.
--   - 'other' is shown as "Event" in the app.
--   - Old meetings and deadlines become events. A trigger does the same for anything that still
--     sends the old kinds (an older ical-sync), so nothing fails.
--   - The "a meeting just ended" daily update reminder has nothing to fire on any more; it never
--     fired anyway (no events were meetings).

update public.events set kind = 'other' where kind in ('meeting', 'deadline');

create or replace function public.events_two_kinds() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind is distinct from 'competition' then new.kind := 'other'; end if;
  return new;
end $$;
drop trigger if exists events_two_kinds on public.events;
create trigger events_two_kinds before insert or update of kind on public.events
  for each row execute function public.events_two_kinds();

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('other', 'competition'));
alter table public.events alter column kind set default 'other';

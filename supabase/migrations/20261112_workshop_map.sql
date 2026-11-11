-- Workshop map (WORKSHOP_MAP.md, phase 1).
-- Safe to run before the code is deployed: it only adds a column, a trigger and an index.

-- The shared workshop PC account. Start on it asks "Who's making it?". Admin sets it in People.
alter table public.profiles add column if not exists shared boolean not null default false;
grant select (shared) on public.profiles to authenticated;

-- When the part on a machine was started, for "started 40 min ago" and "Forgot Done?".
alter table public.parts add column if not exists started_at timestamptz;

-- Kept by the database so every way of changing status agrees: Start, the subsystem page's
-- status menu, and Undo after Done (which keeps the original start).
create or replace function public.parts_started_at() returns trigger language plpgsql as $$
begin
  if new.status = 'doing' and (
       old.status in ('todo', 'missing', 'cancelled')
    or (old.status = 'doing' and new.maker_name is distinct from old.maker_name)
    or (old.status = 'done' and old.started_at is null)
  ) then
    new.started_at := now();
  end if;
  if new.status in ('todo', 'cancelled', 'missing') then
    new.started_at := null;
  end if;
  return new;
end $$;
drop trigger if exists parts_started on public.parts;
create trigger parts_started before update of status, maker_name on public.parts
  for each row execute function public.parts_started_at();

-- Parts already running get the time of their last start.
update public.parts p
set started_at = coalesce(
  (select max(e.at) from public.part_events e where e.part_id = p.id and e.action in ('claimed', 'status_doing')),
  p.updated_at)
where p.status = 'doing' and p.started_at is null;

-- History reads a week of start and finish events.
create index if not exists part_events_action_at on public.part_events (action, at);

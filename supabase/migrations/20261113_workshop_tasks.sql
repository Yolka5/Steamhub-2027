-- Workshop tasks (WORKSHOP_TASKS.md, phase 1): the workshop lead hands out parts.
-- Safe to run before the code is deployed: it only adds columns, functions and triggers, and the
-- guard only limits columns the old code never writes.

-- ===== Workshop leads =====
alter table public.profiles add column if not exists workshop_lead boolean not null default false;
grant select (workshop_lead) on public.profiles to authenticated;

create or replace function public.can_assign() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (is_admin or workshop_lead) and not banned)
$$;
revoke all on function public.can_assign() from public, anon;
grant execute on function public.can_assign() to authenticated;

-- ===== Who makes what, in what order =====
alter table public.parts add column if not exists assignee_id uuid references public.profiles on delete set null;
alter table public.parts add column if not exists assigned_at timestamptz;
alter table public.parts add column if not exists assigned_by uuid references public.profiles on delete set null;
-- The lead's order inside a person's list (smaller is sooner). Numbers with room in between, so a
-- move changes one row.
alter table public.parts add column if not exists queue_pos double precision;
-- When it was finished: the board keeps done parts for 12 hours.
alter table public.parts add column if not exists done_at timestamptz;
create index if not exists parts_assignee on public.parts (assignee_id, status);

-- done_at, kept by the database so every way of finishing a part agrees.
create or replace function public.parts_done_at() returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.done_at := now();
  elsif new.status <> 'done' then
    new.done_at := null;
  end if;
  return new;
end $$;
drop trigger if exists parts_done on public.parts;
create trigger parts_done before insert or update of status on public.parts
  for each row execute function public.parts_done_at();

-- The rules, however the row is changed:
-- * Handing out, taking away and reordering are for workshop leads and admins.
-- * Anyone may grab an unassigned part by starting it (the shared PC on behalf of the person picked).
-- * The person a part is assigned to (or the shared PC) may give it back.
-- * Starting or finishing a part assigned to someone else is refused.
create or replace function public.parts_assign_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_shared boolean;
begin
  -- The SQL editor and server jobs have no user.
  if me is null or public.can_assign() then
    return new;
  end if;
  select coalesce(shared, false) into is_shared from public.profiles where id = me;

  if new.assignee_id is distinct from old.assignee_id then
    if old.assignee_id is null and old.status = 'todo' and new.status = 'doing'
       and (new.assignee_id = me or is_shared) then
      null; -- grab
    elsif new.assignee_id is null and (old.assignee_id = me or is_shared) and new.status = 'todo' then
      null; -- give back
    else
      raise exception 'Only the workshop lead can hand out parts' using errcode = 'P0001';
    end if;
  elsif new.queue_pos is distinct from old.queue_pos then
    raise exception 'Only the workshop lead can change the order' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status and new.status in ('doing', 'done')
     and old.assignee_id is not null and old.assignee_id <> me and not is_shared then
    raise exception 'This part is assigned to someone else' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists parts_assign_guard on public.parts;
create trigger parts_assign_guard before update on public.parts
  for each row execute function public.parts_assign_guard();

-- ===== Starting point =====
-- Parts being made right now belong to whoever is making them.
update public.parts
set assignee_id = maker_id, assigned_at = coalesce(started_at, now()), queue_pos = extract(epoch from coalesce(started_at, now()))
where status = 'doing' and maker_id is not null and assignee_id is null;

update public.parts p
set done_at = coalesce((select max(e.at) from public.part_events e where e.part_id = p.id and e.action = 'status_done'), p.updated_at)
where p.status = 'done' and p.done_at is null;

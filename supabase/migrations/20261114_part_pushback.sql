-- Pushback on parts (WORKSHOP_TASKS.md, "Pushback"): the workshop lead rejects a part with a note,
-- a maker asks before starting, or finishes with a note on what was different.
-- Safe to run before the code is deployed: it only adds.

alter table public.parts add column if not exists rejected_note text;
alter table public.parts add column if not exists rejected_by uuid references public.profiles on delete set null;
alter table public.parts add column if not exists rejected_at timestamptz;
-- An open "Ask first" question, for the card tag.
alter table public.parts add column if not exists asking boolean not null default false;
-- "Done, with a note": what was made differently, kept for assembly.
alter table public.parts add column if not exists made_differently text;

create table if not exists public.part_requests (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts on delete cascade,
  kind text not null check (kind in ('ask', 'done_note', 'reject')),
  note text not null,
  by_id uuid references public.profiles on delete set null,
  by_name text not null default '',
  -- The person it's really from, when the shared workshop PC asks on their behalf.
  for_id uuid references public.profiles on delete set null,
  -- open: waiting for an answer; approved / denied: answered; info: nothing to answer.
  status text not null default 'open' check (status in ('open', 'approved', 'denied', 'info')),
  answer text,
  answered_by uuid references public.profiles on delete set null,
  answered_by_name text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists part_requests_part on public.part_requests (part_id, created_at desc);
create index if not exists part_requests_open on public.part_requests (status) where status = 'open';

-- Who answers a question about a part: leads and admins, whoever released it, the subsystem lead.
create or replace function public.can_answer(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_assign() or exists (
    select 1 from public.parts p join public.subsystems s on s.id = p.subsystem_id
    where p.id = pid and auth.uid() in (p.released_by, s.lead_id)
  )
$$;
revoke all on function public.can_answer(uuid) from public, anon;
grant execute on function public.can_answer(uuid) to authenticated;

alter table public.part_requests enable row level security;
drop policy if exists "members read part requests" on public.part_requests;
drop policy if exists "members add part requests" on public.part_requests;
drop policy if exists "responsible answer part requests" on public.part_requests;
create policy "members read part requests" on public.part_requests for select to authenticated using (public.is_member());
create policy "members add part requests" on public.part_requests for insert to authenticated with check (public.is_member() and by_id = auth.uid());
create policy "responsible answer part requests" on public.part_requests for update to authenticated using (public.is_member() and public.can_answer(part_id)) with check (public.is_member() and public.can_answer(part_id));
alter publication supabase_realtime add table public.part_requests;

-- Rejecting is for workshop leads and admins; clearing a rejection (Release) is open to everyone.
create or replace function public.parts_assign_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_shared boolean;
begin
  if me is null or public.can_assign() then
    return new;
  end if;
  select coalesce(shared, false) into is_shared from public.profiles where id = me;

  if new.rejected_note is not null and new.rejected_note is distinct from old.rejected_note then
    raise exception 'Only the workshop lead can reject a part' using errcode = 'P0001';
  end if;

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

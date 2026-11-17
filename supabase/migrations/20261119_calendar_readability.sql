-- Calendar readability pass (CALENDAR.md, "Readability pass"). Only adds; nothing is dropped.
--   1. Phases get a real status: Not started / In progress / Done, any number In progress at once.
--      done_at stays (Steamhub reads it in many places) and is kept in step with the status.
--   2. Phase notes: small updates on a phase, with photos, one level of replies and @mentions.
--      Only the writer edits or deletes. Every lead, the captain, mentors and admins hear about
--      new notes; a reply reaches the note's writer; a mention reaches the person mentioned.
-- Daily updates move to the group: the app stops filing them under a phase. Old rows keep theirs.

-- ===== 1. Phase status =====
alter table public.cal_phases add column if not exists status text not null default 'todo'
  check (status in ('todo', 'doing', 'done'));

-- Start from what the Board showed: done stays done; the phase a group was on ("Now") is In
-- progress once its start day has come (or it has no dates); everything else Not started.
update public.cal_phases set status = 'done' where done_at is not null and status <> 'done';
update public.cal_phases p set status = 'doing'
where p.done_at is null and p.status = 'todo'
  and (p.starts_on is null or p.starts_on <= (now() at time zone 'Asia/Jerusalem')::date)
  and p.id = (
    select c.id from public.cal_phases c where c.group_id = p.group_id and c.done_at is null order by c.sort limit 1
  );

-- One rule for both columns: Done has a done_at (now, unless the app gives an earlier one, as when
-- Steamhub's suggestion is approved and the last part was released yesterday); anything else has none.
create or replace function public.cal_phase_status_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.done_at is distinct from old.done_at and new.status is not distinct from old.status then
    -- An older screen that still sets done_at directly.
    new.status := case when new.done_at is null then (case when old.status = 'done' then 'doing' else old.status end) else 'done' end;
  end if;
  if new.status = 'done' then
    new.done_at := coalesce(new.done_at, now());
  else
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end $$;

drop trigger if exists cal_phase_status_sync on public.cal_phases;
create trigger cal_phase_status_sync before insert or update on public.cal_phases
  for each row execute function public.cal_phase_status_sync();

-- ===== 2. Phase notes =====
create table if not exists public.phase_notes (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.cal_phases on delete cascade,
  parent_id uuid references public.phase_notes on delete cascade,
  author_id uuid references public.profiles on delete set null default auth.uid(),
  text text not null default '',
  -- Paths in the private 'prototypes' bucket, under phase-notes/<phase id>/.
  photos text[] not null default '{}',
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(text) > 0 or cardinality(photos) > 0)
);
create index if not exists phase_notes_phase on public.phase_notes (phase_id, created_at desc);
create index if not exists phase_notes_parent on public.phase_notes (parent_id);
create index if not exists phase_notes_day on public.phase_notes (created_at);

-- Replies go one level deep, and stay on the same phase.
create or replace function public.phase_notes_check() returns trigger
language plpgsql set search_path = public as $$
declare p public.phase_notes;
begin
  if new.parent_id is not null then
    select * into p from public.phase_notes where id = new.parent_id;
    if p.parent_id is not null then
      raise exception 'Replies go under a note, not under another reply' using errcode = 'P0001';
    end if;
    new.phase_id := p.phase_id;
  end if;
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists phase_notes_check on public.phase_notes;
create trigger phase_notes_check before insert or update on public.phase_notes
  for each row execute function public.phase_notes_check();

alter table public.phase_notes enable row level security;
drop policy if exists "members read phase notes" on public.phase_notes;
create policy "members read phase notes" on public.phase_notes for select to authenticated using (public.is_member());
drop policy if exists "members write own phase notes" on public.phase_notes;
create policy "members write own phase notes" on public.phase_notes for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));
drop policy if exists "writer edits phase notes" on public.phase_notes;
create policy "writer edits phase notes" on public.phase_notes for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "writer deletes phase notes" on public.phase_notes;
create policy "writer deletes phase notes" on public.phase_notes for delete to authenticated
  using (author_id = (select auth.uid()));

do $$ begin
  alter publication supabase_realtime add table public.phase_notes;
exception when duplicate_object then null; end $$;

-- Who hears about a note. In the database, so it happens however the note was written.
create or replace function public.phase_notes_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ph public.cal_phases;
  g public.cal_groups;
  who text;
  body text;
  link text;
  parent_author uuid;
begin
  select * into ph from public.cal_phases where id = new.phase_id;
  select * into g from public.cal_groups where id = ph.group_id;
  select split_part(coalesce(name, 'Someone'), ' ', 1) into who from public.profiles where id = new.author_id;
  who := coalesce(who, 'Someone');
  body := case when length(new.text) > 0 then left(new.text, 140) else 'a photo' end;
  link := '/calendar?notes=' || new.phase_id;

  -- Mentioned people, first, with their own wording.
  insert into public.notifications (user_id, kind, text, link)
  select distinct m, 'note_mention', who || ' mentioned you on ' || g.name || ' · ' || ph.name || ': ' || body, link
  from unnest(new.mentions) m
  join public.profiles p on p.id = m and not p.banned
  where m is distinct from new.author_id;

  if new.parent_id is not null then
    -- A reply reaches the note's writer.
    select author_id into parent_author from public.phase_notes where id = new.parent_id;
    insert into public.notifications (user_id, kind, text, link)
    select parent_author, 'note_reply', who || ' replied on ' || g.name || ' · ' || ph.name || ': ' || body, link
    where parent_author is not null and parent_author is distinct from new.author_id
      and not (parent_author = any (new.mentions));
    return new;
  end if;

  -- A new note reaches every lead of the season, the captain, mentors and admins.
  insert into public.notifications (user_id, kind, text, link)
  select distinct r.id, 'phase_note', who || ' on ' || g.name || ' · ' || ph.name || ': ' || body, link
  from (
    select lead_id as id from public.cal_groups where season = g.season and lead_id is not null
    union
    select id from public.profiles where (is_admin or mentor or captain)
  ) r
  join public.profiles p on p.id = r.id and not p.banned
  where r.id is distinct from new.author_id
    and not (r.id = any (new.mentions));
  return new;
end $$;

revoke all on function public.phase_notes_notify() from public, anon, authenticated;

drop trigger if exists phase_notes_notify on public.phase_notes;
create trigger phase_notes_notify after insert on public.phase_notes
  for each row execute function public.phase_notes_notify();

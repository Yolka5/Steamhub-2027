-- Calendar v2 (CALENDAR_V2_PLAN.md): sections as data, lists, comments everywhere, GitHub sync.
--   1. Sections: Mechanics, Electronics, Programming, Strategy, and any added later, each with a
--      colour. cal_groups.team holds the section's key, as it always held the team's.
--   2. Groups: an own colour, and a 'custom' kind anyone can add inside a section.
--   3. Strategy leaves the off-season robot: its empty subsystem 7 goes, ziv guy leads the section.
--   4. Lists: "To-Do December" becomes a real row instead of text on each task.
--   5. Comments on tasks, groups, lists, phases and events, with follow and mute. Phase notes move in.
--   6. Google events: the kind (Meeting, so the daily update reminder fires) can be set by hand.
--   7. GitHub: issues become Programming tasks; a profile can carry its GitHub username.

-- ===== 1. Sections =====
create table if not exists public.cal_sections (
  key text primary key check (key ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (length(trim(name)) between 1 and 40),
  -- A palette key ('blue') or a custom '#rrggbb'.
  color text not null default 'slate',
  sort double precision not null default 0,
  created_at timestamptz not null default now()
);

insert into public.cal_sections (key, name, color, sort) values
  ('mechanics', 'Mechanics', 'blue', 0),
  ('electronics', 'Electronics', 'teal', 1),
  ('programming', 'Programming', 'purple', 2),
  ('strategy', 'Strategy', 'pink', 3)
on conflict (key) do nothing;

alter table public.cal_sections enable row level security;
drop policy if exists "members all cal_sections" on public.cal_sections;
create policy "members all cal_sections" on public.cal_sections for all to authenticated using (public.is_member()) with check (public.is_member());
do $$ begin
  alter publication supabase_realtime add table public.cal_sections;
exception when duplicate_object then null; end $$;

-- The three-team check goes; the section must exist instead.
alter table public.cal_groups drop constraint if exists cal_groups_team_check;
do $$ begin
  alter table public.cal_groups add constraint cal_groups_team_fkey foreign key (team) references public.cal_sections (key) on update cascade;
exception when duplicate_object then null; end $$;

-- ===== 2. Groups =====
alter table public.cal_groups add column if not exists color text;
-- Issues with this GitHub label land in this group (a Programming group like "Vision").
alter table public.cal_groups add column if not exists github_label text;
alter table public.cal_groups drop constraint if exists cal_groups_kind_check;
alter table public.cal_groups add constraint cal_groups_kind_check check (kind in ('team', 'cnc', 'workshop', 'subsystem', 'project', 'custom'));
-- Custom groups can be many per section, so they stay out of the one-per-slot index.
drop index if exists public.cal_groups_season_slot;
create unique index if not exists cal_groups_season_slot on public.cal_groups (season, team, kind, subsystem_number) nulls not distinct where kind not in ('project', 'custom');

-- Every section has its own group each season: tasks and events "for Strategy" sit there.
create or replace function public.cal_ensure_season(s integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.robots;
  sub public.subsystems;
  g uuid;
begin
  if not public.is_member() and auth.uid() is not null then return; end if;
  insert into public.cal_groups (season, team, kind, name, sort)
  select s, c.key, 'team', c.name, 0 from public.cal_sections c
  on conflict (season, team, kind, subsystem_number) where kind not in ('project', 'custom') do nothing;
  insert into public.cal_groups (season, team, kind, name, sort, lead_id) values
    (s, 'mechanics', 'cnc', 'CNC', 1, (select id from public.profiles where name ilike '%arbib%' and not banned order by created_at limit 1)),
    (s, 'mechanics', 'workshop', 'Workshop', 2, (select id from public.profiles where name ilike 'itamar toledano%' and not banned order by created_at limit 1))
  on conflict (season, team, kind, subsystem_number) where kind not in ('project', 'custom') do nothing;
  for r in select * from public.robots where season = s and version is not null and not offseason order by version loop
    for sub in select * from public.subsystems where robot_id = r.id loop
      insert into public.cal_groups (season, team, kind, subsystem_number, name, lead_id, sort)
      values (s, 'mechanics', 'subsystem', sub.number, sub.name, sub.lead_id, 10 + sub.number)
      on conflict (season, team, kind, subsystem_number) where kind not in ('project', 'custom') do nothing
      returning id into g;
      if g is null then
        select id into g from public.cal_groups where season = s and kind = 'subsystem' and subsystem_number = sub.number;
      end if;
      perform public.cal_add_robot_phases(g, r);
      g := null;
    end loop;
  end loop;
  for r in select * from public.robots where season = s and offseason and not archived loop
    for sub in select * from public.subsystems where robot_id = r.id loop
      perform public.cal_add_project(sub, r);
    end loop;
  end loop;
end $$;
revoke all on function public.cal_ensure_season(integer) from public, anon;
grant execute on function public.cal_ensure_season(integer) to authenticated;

-- A new section gets its group in every season that already has a Calendar.
create or replace function public.cal_sections_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cal_groups (season, team, kind, name, sort)
  select distinct g.season, new.key, 'team', new.name, 0 from public.cal_groups g
  on conflict (season, team, kind, subsystem_number) where kind not in ('project', 'custom') do nothing;
  return new;
end $$;
revoke all on function public.cal_sections_group() from public, anon, authenticated;
drop trigger if exists cal_sections_group on public.cal_sections;
create trigger cal_sections_group after insert on public.cal_sections
  for each row execute function public.cal_sections_group();

-- Renaming a section renames its own groups.
create or replace function public.cal_sections_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.cal_groups set name = new.name where team = new.key and kind = 'team';
  end if;
  return new;
end $$;
revoke all on function public.cal_sections_rename() from public, anon, authenticated;
drop trigger if exists cal_sections_rename on public.cal_sections;
create trigger cal_sections_rename after update on public.cal_sections
  for each row execute function public.cal_sections_rename();

-- ===== 3. Strategy leaves the off-season robot =====
-- Subsystem 7 "Strategy" of "Before season Projects": no parts, tasks, notes or events, only two
-- empty phases. Its lead moves to the Strategy section's group.
do $$
declare
  sub public.subsystems;
  lead uuid;
  s integer;
begin
  select max(season) into s from public.cal_groups;
  if s is not null then
    insert into public.cal_groups (season, team, kind, name, sort) values (s, 'strategy', 'team', 'Strategy', 0)
    on conflict (season, team, kind, subsystem_number) where kind not in ('project', 'custom') do nothing;
  end if;
  for sub in
    select x.* from public.subsystems x join public.robots r on r.id = x.robot_id
    where r.offseason and lower(trim(x.name)) = 'strategy'
      and not exists (select 1 from public.parts where subsystem_id = x.id)
      and not exists (select 1 from public.pieces where subsystem_id = x.id)
      and not exists (select 1 from public.prototypes where project_sub = x.id)
      and not exists (select 1 from public.tasks t join public.cal_groups g on g.id = t.group_id where g.subsystem_id = x.id)
  loop
    lead := coalesce(sub.lead_id, (select lead_id from public.cal_groups where subsystem_id = sub.id limit 1));
    if lead is not null and s is not null then
      update public.cal_groups set lead_id = lead where season = s and team = 'strategy' and kind = 'team' and lead_id is null;
    end if;
    delete from public.subsystems where id = sub.id;
  end loop;
end $$;

-- ===== 4. Lists =====
create table if not exists public.cal_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cal_groups on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  sort double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);
alter table public.cal_lists enable row level security;
drop policy if exists "members all cal_lists" on public.cal_lists;
create policy "members all cal_lists" on public.cal_lists for all to authenticated using (public.is_member()) with check (public.is_member());
do $$ begin
  alter publication supabase_realtime add table public.cal_lists;
exception when duplicate_object then null; end $$;

alter table public.tasks add column if not exists list_id uuid references public.cal_lists on delete set null;
create index if not exists tasks_list on public.tasks (list_id);

-- The typed labels become lists, one per group and name.
insert into public.cal_lists (group_id, name, sort)
select group_id, trim(section), row_number() over (partition by group_id order by trim(section))
from (select distinct group_id, section from public.tasks where section is not null and trim(section) <> '') t
on conflict (group_id, name) do nothing;
update public.tasks t set list_id = l.id
from public.cal_lists l
where t.list_id is null and t.section is not null and l.group_id = t.group_id and l.name = trim(t.section);

-- A list belongs to one group: a task moved to another group leaves its list.
create or replace function public.tasks_list_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.list_id is not null and not exists (select 1 from public.cal_lists where id = new.list_id and group_id = new.group_id) then
    new.list_id := null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_list_check on public.tasks;
create trigger tasks_list_check before insert or update of list_id, group_id on public.tasks
  for each row execute function public.tasks_list_check();

-- ===== 5. Comments =====
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('task', 'group', 'list', 'phase', 'event')),
  target_id uuid not null,
  parent_id uuid references public.comments on delete cascade,
  author_id uuid references public.profiles on delete set null default auth.uid(),
  text text not null default '',
  -- Paths in the private 'prototypes' bucket, under comments/<target id>/.
  photos text[] not null default '{}',
  mentions uuid[] not null default '{}',
  -- The writer ticked "Tell everyone".
  tell_all boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(text) > 0 or cardinality(photos) > 0)
);
create index if not exists comments_target on public.comments (target_kind, target_id, created_at desc);
create index if not exists comments_parent on public.comments (parent_id);
create index if not exists comments_day on public.comments (created_at);

create or replace function public.comments_check() returns trigger
language plpgsql set search_path = public as $$
declare p public.comments;
begin
  if new.parent_id is not null then
    select * into p from public.comments where id = new.parent_id;
    if p.parent_id is not null then
      raise exception 'Replies go under a comment, not under another reply' using errcode = 'P0001';
    end if;
    new.target_kind := p.target_kind;
    new.target_id := p.target_id;
    new.tell_all := false;
  end if;
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.target_kind := old.target_kind;
    new.target_id := old.target_id;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists comments_check on public.comments;
create trigger comments_check before insert or update on public.comments
  for each row execute function public.comments_check();

alter table public.comments enable row level security;
drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments for select to authenticated using (public.is_member());
drop policy if exists "members write own comments" on public.comments;
create policy "members write own comments" on public.comments for insert to authenticated
  with check (public.is_member() and author_id = (select auth.uid()));
drop policy if exists "writer edits comments" on public.comments;
create policy "writer edits comments" on public.comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "writer deletes comments" on public.comments;
create policy "writer deletes comments" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()));
do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;

-- Follow: hear about every comment. Mute: hear only when mentioned.
create table if not exists public.comment_follows (
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  target_kind text not null check (target_kind in ('task', 'group', 'list', 'phase', 'event')),
  target_id uuid not null,
  mode text not null check (mode in ('follow', 'mute')),
  created_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);
alter table public.comment_follows enable row level security;
drop policy if exists "own comment follows" on public.comment_follows;
create policy "own comment follows" on public.comment_follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_member());
do $$ begin
  alter publication supabase_realtime add table public.comment_follows;
exception when duplicate_object then null; end $$;

-- Phase notes move in, with their ids, so old links still find them.
do $$ begin
  if to_regclass('public.phase_notes') is not null then
    insert into public.comments (id, target_kind, target_id, parent_id, author_id, text, photos, mentions, created_at, updated_at)
    select id, 'phase', phase_id, null, author_id, text, photos, mentions, created_at, updated_at from public.phase_notes where parent_id is null
    on conflict (id) do nothing;
    insert into public.comments (id, target_kind, target_id, parent_id, author_id, text, photos, mentions, created_at, updated_at)
    select id, 'phase', phase_id, parent_id, author_id, text, photos, mentions, created_at, updated_at from public.phase_notes where parent_id is not null
    on conflict (id) do nothing;
  end if;
end $$;

/** Where a comment's target lives: its group (for the lead), a name for the notification, and the link. */
create or replace function public.comment_target(k text, t uuid, out group_id uuid, out label text, out link text)
language plpgsql stable security definer set search_path = public as $$
begin
  if k = 'task' then
    select x.group_id, x.title into group_id, label from public.tasks x where x.id = t;
    link := '/calendar?task=' || t || '&comments=1';
  elsif k = 'group' then
    select x.id, x.name into group_id, label from public.cal_groups x where x.id = t;
    link := '/calendar?comments=group:' || t;
  elsif k = 'list' then
    select x.group_id, g.name || ' · ' || x.name into group_id, label from public.cal_lists x join public.cal_groups g on g.id = x.group_id where x.id = t;
    link := '/calendar?comments=list:' || t;
  elsif k = 'phase' then
    select x.group_id, g.name || ' · ' || x.name into group_id, label from public.cal_phases x join public.cal_groups g on g.id = x.group_id where x.id = t;
    link := '/calendar?comments=phase:' || t;
  elsif k = 'event' then
    select x.group_id, x.title into group_id, label from public.events x where x.id = t;
    link := '/calendar?event=' || t || '&comments=1';
  end if;
  label := coalesce(label, 'the Calendar');
end $$;
revoke all on function public.comment_target(text, uuid) from public, anon, authenticated;

/**
 * Who hears about a comment, in the database so it holds however it was written:
 *   mentioned people, always; on a reply, the writer of the comment replied to; followers;
 *   and the usual people unless they muted it: a task's owners and its group's lead, a group's,
 *   list's or phase's lead, nobody for an event. "Tell everyone" reaches the whole team.
 */
create or replace function public.comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tg record;
  who text;
  body text;
  lead uuid;
  parent_author uuid;
  usual uuid[] := '{}';
  muted uuid[];
  sent uuid[] := '{}';
begin
  select * into tg from public.comment_target(new.target_kind, new.target_id);
  select split_part(coalesce(name, 'Someone'), ' ', 1) into who from public.profiles where id = new.author_id;
  who := coalesce(who, 'Someone');
  body := case when length(new.text) > 0 then left(new.text, 140) else 'a photo' end;
  select coalesce(array_agg(user_id), '{}') into muted from public.comment_follows
    where target_kind = new.target_kind and target_id = new.target_id and mode = 'mute';

  -- Mentioned people first, with their own wording; mute doesn't stop a mention.
  insert into public.notifications (user_id, kind, text, link)
  select distinct m, 'comment_mention', who || ' mentioned you on ' || tg.label || ': ' || body, tg.link
  from unnest(new.mentions) m join public.profiles p on p.id = m and not p.banned
  where m is distinct from new.author_id;
  sent := sent || new.mentions || new.author_id;

  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
    if parent_author is not null and not (parent_author = any (sent)) then
      insert into public.notifications (user_id, kind, text, link)
      values (parent_author, 'comment_reply', who || ' replied on ' || tg.label || ': ' || body, tg.link);
      sent := sent || parent_author;
    end if;
  else
    if new.target_kind <> 'event' then
      select lead_id into lead from public.cal_groups where id = tg.group_id;
      if lead is not null then usual := usual || lead; end if;
    end if;
    if new.target_kind = 'task' then
      usual := usual || coalesce((select array_agg(user_id) from public.task_owners where task_id = new.target_id), '{}');
    end if;
    if new.tell_all then
      usual := usual || coalesce((select array_agg(id) from public.profiles where not banned and not coalesce(shared, false)), '{}');
      muted := '{}';
    end if;
  end if;

  usual := usual || coalesce((select array_agg(user_id) from public.comment_follows
    where target_kind = new.target_kind and target_id = new.target_id and mode = 'follow'), '{}');

  insert into public.notifications (user_id, kind, text, link)
  select distinct u, 'comment', who || ' on ' || tg.label || ': ' || body, tg.link
  from unnest(usual) u join public.profiles p on p.id = u and not p.banned
  where not (u = any (sent)) and not (u = any (muted));
  return new;
end $$;
revoke all on function public.comments_notify() from public, anon, authenticated;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.comments_notify();

-- Comments on a deleted thing go with it.
create or replace function public.comments_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.comments where target_kind = tg_argv[0] and target_id = old.id;
  delete from public.comment_follows where target_kind = tg_argv[0] and target_id = old.id;
  return old;
end $$;
revoke all on function public.comments_cleanup() from public, anon, authenticated;
drop trigger if exists comments_cleanup on public.tasks;
create trigger comments_cleanup after delete on public.tasks for each row execute function public.comments_cleanup('task');
drop trigger if exists comments_cleanup on public.cal_groups;
create trigger comments_cleanup after delete on public.cal_groups for each row execute function public.comments_cleanup('group');
drop trigger if exists comments_cleanup on public.cal_lists;
create trigger comments_cleanup after delete on public.cal_lists for each row execute function public.comments_cleanup('list');
drop trigger if exists comments_cleanup on public.cal_phases;
create trigger comments_cleanup after delete on public.cal_phases for each row execute function public.comments_cleanup('phase');
drop trigger if exists comments_cleanup on public.events;
create trigger comments_cleanup after delete on public.events for each row execute function public.comments_cleanup('event');

-- ===== 6. Google events: kind by hand =====
-- The hourly sync guesses the kind from the title. Once someone sets it, the sync keeps theirs.
alter table public.events add column if not exists kind_by_hand boolean not null default false;
create or replace function public.events_keep_kind() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.kind_by_hand and new.kind_by_hand and new.kind is distinct from old.kind
     and coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' = 'service_role' then
    new.kind := old.kind;
  end if;
  return new;
end $$;
drop trigger if exists events_keep_kind on public.events;
create trigger events_keep_kind before update on public.events
  for each row execute function public.events_keep_kind();

-- ===== 7. GitHub =====
alter table public.profiles add column if not exists github text;
create unique index if not exists profiles_github on public.profiles (lower(github)) where github is not null;

alter table public.tasks add column if not exists source text;
alter table public.tasks add column if not exists gh_id bigint;
alter table public.tasks add column if not exists gh_number integer;
alter table public.tasks add column if not exists gh_url text;
-- GitHub logins of assignees nobody has linked to a profile yet.
alter table public.tasks add column if not exists gh_people text[] not null default '{}';
create unique index if not exists tasks_gh_id on public.tasks (gh_id) where gh_id is not null;

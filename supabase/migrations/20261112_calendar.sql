-- Calendar: groups, phases, tasks, daily updates, events, phone push and reminders. See CALENDAR.md.
-- Push keys are never in this file: send-push makes the VAPID pair on first use and keeps it in
-- Supabase Vault ('vapid_public', 'vapid_private').

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ===== Groups =====
-- Teams (Mechanics, Electronics, Programming), and under Mechanics: CNC, Workshop and one group
-- per subsystem number. Made by cal_ensure_season() and by the subsystem trigger, never by hand.
create table if not exists public.cal_groups (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  team text not null check (team in ('mechanics', 'electronics', 'programming')),
  kind text not null check (kind in ('team', 'cnc', 'workshop', 'subsystem')),
  subsystem_number integer,
  name text not null,
  lead_id uuid references public.profiles on delete set null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique nulls not distinct (season, team, kind, subsystem_number)
);

-- ===== Phases =====
create table if not exists public.cal_phases (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cal_groups on delete cascade,
  name text not null,
  kind text not null default 'custom' check (kind in ('prototypes', 'cad', 'manufacturing', 'custom')),
  robot_id uuid references public.robots on delete cascade,
  sort double precision not null default 0,
  starts_on date,
  ends_on date,
  follows_previous boolean not null default true,
  done_at timestamptz,
  done_by uuid references public.profiles on delete set null,
  -- "Not yet" on a done suggestion: hidden until the progress it was dismissed at changes.
  dismissed_for text,
  -- The lead heard about the suggestion once.
  suggested_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists cal_phases_group on public.cal_phases (group_id, sort);

-- ===== Tasks =====
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cal_groups on delete cascade,
  phase_id uuid references public.cal_phases on delete set null,
  parent_id uuid references public.tasks on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  starts_on date,
  due_on date,
  notes text not null default '',
  prototype_id uuid references public.prototypes on delete set null,
  part_id uuid references public.parts on delete set null,
  sort double precision not null default 0,
  done_at timestamptz,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_on is null or starts_on is null or due_on >= starts_on)
);
create index if not exists tasks_group on public.tasks (group_id);
create index if not exists tasks_parent on public.tasks (parent_id);
create index if not exists tasks_due on public.tasks (due_on) where status <> 'done';

create table if not exists public.task_owners (
  task_id uuid not null references public.tasks on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (task_id, user_id)
);
create index if not exists task_owners_user on public.task_owners (user_id);

create table if not exists public.task_waits (
  task_id uuid not null references public.tasks on delete cascade,
  waits_for_id uuid not null references public.tasks on delete cascade,
  primary key (task_id, waits_for_id),
  check (task_id <> waits_for_id)
);
create index if not exists task_waits_for on public.task_waits (waits_for_id);

-- No loops: A waits for B waits for A would push dates forever.
create or replace function public.task_waits_no_cycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (
    with recursive up(id) as (
      select new.waits_for_id
      union
      select w.waits_for_id from public.task_waits w join up on w.task_id = up.id
    )
    select 1 from up where id = new.task_id
  ) then
    raise exception 'That would make the tasks wait for each other in a loop' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists task_waits_no_cycle on public.task_waits;
create trigger task_waits_no_cycle before insert or update on public.task_waits
for each row execute function public.task_waits_no_cycle();

create or replace function public.tasks_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
for each row execute function public.tasks_touch();

-- ===== Daily updates =====
create table if not exists public.cal_updates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cal_groups on delete cascade,
  phase_id uuid references public.cal_phases on delete set null,
  day date not null,
  author_id uuid references public.profiles on delete set null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, day)
);
create index if not exists cal_updates_day on public.cal_updates (day);

-- ===== Events =====
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'other' check (kind in ('meeting', 'competition', 'deadline', 'other')),
  group_id uuid references public.cal_groups on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  -- Weekly repeat: 0 Sunday to 6 Saturday, in Israel time.
  repeat_days smallint[],
  repeat_until date,
  skip_days date[] not null default '{}',
  -- Minutes before the start.
  reminders integer[] not null default '{}',
  notes text not null default '',
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

-- ===== Phone push =====
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- send-push claims a notification once, so calling it twice never sends twice.
alter table public.notifications add column if not exists pushed_at timestamptz;

create table if not exists public.reminders_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- ===== Row level security =====
alter table public.cal_groups enable row level security;
alter table public.cal_phases enable row level security;
alter table public.tasks enable row level security;
alter table public.task_owners enable row level security;
alter table public.task_waits enable row level security;
alter table public.cal_updates enable row level security;
alter table public.events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminders_sent enable row level security;

create policy "members all cal_groups" on public.cal_groups for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all cal_phases" on public.cal_phases for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all tasks" on public.tasks for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all task_owners" on public.task_owners for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all task_waits" on public.task_waits for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all cal_updates" on public.cal_updates for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all events" on public.events for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "own push" on public.push_subscriptions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_member());

alter publication supabase_realtime add table public.cal_groups;
alter publication supabase_realtime add table public.cal_phases;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_owners;
alter publication supabase_realtime add table public.task_waits;
alter publication supabase_realtime add table public.cal_updates;
alter publication supabase_realtime add table public.events;

-- ===== Groups and phases from the robots =====

/** The phases a subsystem group gets for a robot: V1 Prototypes, CAD, Manufacturing; V2 on: CAD, Manufacturing. */
create or replace function public.cal_add_robot_phases(g uuid, r public.robots) returns void
language plpgsql security definer set search_path = public as $$
declare
  next_sort double precision;
begin
  select coalesce(max(sort), 0) + 1 into next_sort from public.cal_phases where group_id = g;
  if r.version = 1 and not exists (select 1 from public.cal_phases where group_id = g and kind = 'prototypes') then
    insert into public.cal_phases (group_id, name, kind, sort) values (g, 'Prototypes', 'prototypes', next_sort);
    next_sort := next_sort + 1;
  end if;
  if not exists (select 1 from public.cal_phases where group_id = g and kind = 'cad' and robot_id = r.id) then
    insert into public.cal_phases (group_id, name, kind, robot_id, sort) values (g, 'CAD (V' || r.version || ')', 'cad', r.id, next_sort);
    next_sort := next_sort + 1;
  end if;
  if not exists (select 1 from public.cal_phases where group_id = g and kind = 'manufacturing' and robot_id = r.id) then
    insert into public.cal_phases (group_id, name, kind, robot_id, sort) values (g, 'Manufacturing (V' || r.version || ')', 'manufacturing', r.id, next_sort);
  end if;
end $$;

/** The season's fixed groups, with the leads Yoni named, plus a group for every subsystem of its V robots. */
create or replace function public.cal_ensure_season(s integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.robots;
  sub public.subsystems;
  g uuid;
begin
  if not public.is_member() and auth.uid() is not null then return; end if;
  insert into public.cal_groups (season, team, kind, name, sort) values
    (s, 'mechanics', 'team', 'Mechanics', 0),
    (s, 'electronics', 'team', 'Electronics', 0),
    (s, 'programming', 'team', 'Programming', 0)
  on conflict do nothing;
  insert into public.cal_groups (season, team, kind, name, sort, lead_id) values
    (s, 'mechanics', 'cnc', 'CNC', 1, (select id from public.profiles where name ilike '%arbib%' and not banned order by created_at limit 1)),
    (s, 'mechanics', 'workshop', 'Workshop', 2, (select id from public.profiles where name ilike 'itamar toledano%' and not banned order by created_at limit 1))
  on conflict do nothing;
  for r in select * from public.robots where season = s and version is not null order by version loop
    for sub in select * from public.subsystems where robot_id = r.id loop
      insert into public.cal_groups (season, team, kind, subsystem_number, name, lead_id, sort)
      values (s, 'mechanics', 'subsystem', sub.number, sub.name, sub.lead_id, 10 + sub.number)
      on conflict (season, team, kind, subsystem_number) do nothing
      returning id into g;
      if g is null then
        select id into g from public.cal_groups where season = s and kind = 'subsystem' and subsystem_number = sub.number;
      end if;
      perform public.cal_add_robot_phases(g, r);
      g := null;
    end loop;
  end loop;
end $$;
revoke all on function public.cal_ensure_season(integer) from public, anon;
grant execute on function public.cal_ensure_season(integer) to authenticated;
revoke all on function public.cal_add_robot_phases(uuid, public.robots) from public, anon, authenticated;

/** A subsystem made or renamed on a V robot keeps its Calendar group in step: name, lead, phases. */
create or replace function public.cal_subsystem_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.robots;
  g uuid;
begin
  select * into r from public.robots where id = new.robot_id;
  if r.version is null then return new; end if;
  perform public.cal_ensure_season(r.season);
  select id into g from public.cal_groups where season = r.season and kind = 'subsystem' and subsystem_number = new.number;
  if g is null then
    insert into public.cal_groups (season, team, kind, subsystem_number, name, lead_id, sort)
    values (r.season, 'mechanics', 'subsystem', new.number, new.name, new.lead_id, 10 + new.number)
    returning id into g;
  elsif tg_op = 'UPDATE' then
    update public.cal_groups set name = new.name, lead_id = new.lead_id where id = g
      and (name is distinct from new.name or lead_id is distinct from new.lead_id);
  end if;
  perform public.cal_add_robot_phases(g, r);
  return new;
end $$;
drop trigger if exists cal_subsystem_sync on public.subsystems;
create trigger cal_subsystem_sync after insert or update of name, lead_id, number on public.subsystems
for each row execute function public.cal_subsystem_sync();

-- ===== Push: every new notification goes to the phone too =====

/** The VAPID key pair, for send-push only. Made by send-push on first use and kept in Vault. */
create or replace function public.push_keys() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' limit 1),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private' limit 1))
$$;
create or replace function public.push_keys_init(pub text, priv text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from vault.secrets where name = 'vapid_private') then return; end if;
  perform vault.create_secret(priv, 'vapid_private', 'Steamhub push: VAPID private key');
  perform vault.create_secret(pub, 'vapid_public', 'Steamhub push: VAPID public key');
exception when unique_violation then
  -- Another first call stored its pair a moment earlier; that one stays.
  null;
end $$;
revoke all on function public.push_keys() from public, anon, authenticated;
revoke all on function public.push_keys_init(text, text) from public, anon, authenticated;
grant execute on function public.push_keys() to service_role;
grant execute on function public.push_keys_init(text, text) to service_role;

create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    perform net.http_post(
      url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/send-push',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end $$;
drop trigger if exists notify_push on public.notifications;
create trigger notify_push after insert on public.notifications
for each row execute function public.notify_push();

-- ===== Reminders, every 5 minutes =====
-- Israel time throughout. Each reminder has a key in reminders_sent, so it goes out once.

create or replace function public.cal_send(k text, users uuid[], kind text, body text, link text) returns void
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if users is null or cardinality(users) = 0 then return; end if;
  insert into public.reminders_sent (key) values (k) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return; end if;
  insert into public.notifications (user_id, kind, text, link)
  select distinct u, kind, body, link from unnest(users) u where u is not null;
end $$;

create or replace function public.cal_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'Asia/Jerusalem';
  now_l timestamp := now() at time zone tz;
  today date := (now() at time zone tz)::date;
  cur_season integer;
  e public.events;
  d date;
  occ timestamptz;
  occ_end timestamptz;
  m integer;
  fire timestamptz;
  who uuid[];
  t record;
  l record;
begin
  select max(season) into cur_season from public.cal_groups;

  -- Events: each occurrence from yesterday to a week ahead.
  for e in select * from public.events loop
    for d in select generate_series(today - 1, today + 8, interval '1 day')::date loop
      if e.repeat_days is null then
        if (e.starts_at at time zone tz)::date <> d then continue; end if;
        occ := e.starts_at;
        occ_end := coalesce(e.ends_at, e.starts_at);
      else
        if not (extract(dow from d)::smallint = any (e.repeat_days)) then continue; end if;
        if d < (e.starts_at at time zone tz)::date then continue; end if;
        if e.repeat_until is not null and d > e.repeat_until then continue; end if;
        if d = any (e.skip_days) then continue; end if;
        occ := (d + (e.starts_at at time zone tz)::time) at time zone tz;
        occ_end := (d + (coalesce(e.ends_at, e.starts_at) at time zone tz)::time) at time zone tz;
        if occ_end < occ then occ_end := occ; end if;
      end if;

      -- Who hears about an event: everyone for team-wide ones; for a group's, its lead and everyone
      -- with an open task in it.
      if e.group_id is null then
        select array_agg(id) into who from public.profiles where not banned and not coalesce(shared, false);
      else
        select array_agg(distinct x) into who from (
          select lead_id x from public.cal_groups where id = e.group_id
          union select o.user_id from public.task_owners o join public.tasks k on k.id = o.task_id
            where k.group_id = e.group_id and k.status <> 'done'
        ) s;
      end if;

      foreach m in array e.reminders loop
        fire := occ - make_interval(mins => m);
        if fire <= now() and fire > now() - interval '30 minutes' then
          perform public.cal_send(
            'ev:' || e.id || ':' || d || ':' || m, who, 'event_reminder',
            e.title || case
              when m >= 1440 and m % 1440 = 0 then ' ' || case when m = 1440 then 'tomorrow' else 'in ' || (m / 1440) || ' days' end
              when m >= 60 and m % 60 = 0 then ' in ' || (m / 60) || case when m = 60 then ' hour' else ' hours' end
              when m = 0 then ' is starting'
              else ' in ' || m || ' min' end
              || case when e.all_day then '' else ', ' || to_char(occ at time zone tz, 'HH24:MI') end,
            '/calendar?view=calendar&d=' || d);
        end if;
      end loop;

      -- A meeting just ended: leads who haven't sent today's update hear about it.
      if e.kind = 'meeting' and d = today and occ_end <= now() and occ_end > now() - interval '30 minutes' and cur_season is not null then
        for l in
          select g.lead_id, string_agg(g.name, ', ' order by g.sort) names
          from public.cal_groups g
          where g.season = cur_season and g.lead_id is not null
            and (e.group_id is null or g.team = (select team from public.cal_groups where id = e.group_id))
            and not exists (select 1 from public.cal_updates u where u.group_id = g.id and u.day = today)
          group by g.lead_id
        loop
          perform public.cal_send('upd:' || l.lead_id || ':' || today, array[l.lead_id], 'update_reminder',
            'Send today''s update for ' || l.names, '/calendar/update');
        end loop;
      end if;
    end loop;
  end loop;

  -- Due tomorrow, from 16:00.
  if extract(hour from now_l) >= 16 then
    for t in
      select k.id, k.title, array_agg(o.user_id) owners from public.tasks k join public.task_owners o on o.task_id = k.id
      where k.status <> 'done' and k.due_on = today + 1 group by k.id
    loop
      perform public.cal_send('due:' || t.id || ':' || today, t.owners, 'task_due', t.title || ' is due tomorrow', '/calendar?task=' || t.id);
    end loop;
  end if;

  -- Overdue, the morning after, from 08:00.
  if extract(hour from now_l) >= 8 then
    for t in
      select k.id, k.title, array_agg(o.user_id) owners from public.tasks k join public.task_owners o on o.task_id = k.id
      where k.status <> 'done' and k.due_on = today - 1 group by k.id
    loop
      perform public.cal_send('late:' || t.id || ':' || today, t.owners, 'task_late', t.title || ' was due yesterday', '/calendar?task=' || t.id);
    end loop;
  end if;

  delete from public.reminders_sent where sent_at < now() - interval '30 days';
end $$;
revoke all on function public.cal_reminders() from public, anon, authenticated;
revoke all on function public.cal_send(text, uuid[], text, text, text) from public, anon, authenticated;

select cron.schedule('cal-reminders', '*/5 * * * *', 'select public.cal_reminders()');

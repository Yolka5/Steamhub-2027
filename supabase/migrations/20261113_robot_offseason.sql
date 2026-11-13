-- Off-season projects (a wood bot, practice builds) live in a season's year but aren't that season's
-- robot. Marked ones never get a V number, so the season card, the Calendar and the prototype
-- subsystem lists leave them out.

alter table public.robots add column if not exists offseason boolean not null default false;

update public.robots set version = null where offseason and version is not null;

alter table public.robots drop constraint if exists robots_offseason_no_version;
alter table public.robots add constraint robots_offseason_no_version check (not (offseason and version is not null));

-- ===== Off-season projects on the Calendar =====
-- Each subsystem of an off-season project gets its own group (kind 'project') under Mechanics, with
-- CAD and Manufacturing phases that follow its parts. Season groups stay keyed by subsystem number,
-- so a project's "3" never lands in the season's subsystem 3.

alter table public.cal_groups add column if not exists subsystem_id uuid references public.subsystems on delete cascade;

alter table public.cal_groups drop constraint if exists cal_groups_kind_check;
alter table public.cal_groups add constraint cal_groups_kind_check check (kind in ('team', 'cnc', 'workshop', 'subsystem', 'project'));

-- The one-group-per-number rule now covers season groups only; projects are one per subsystem.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.cal_groups'::regclass and contype = 'u' loop
    execute format('alter table public.cal_groups drop constraint %I', c);
  end loop;
end $$;
create unique index if not exists cal_groups_season_slot on public.cal_groups (season, team, kind, subsystem_number) nulls not distinct where kind <> 'project';
create unique index if not exists cal_groups_project on public.cal_groups (subsystem_id) where kind = 'project';

create or replace function public.cal_add_project_phases(g uuid, r public.robots) returns void
language plpgsql security definer set search_path = public as $$
declare
  next_sort double precision;
begin
  select coalesce(max(sort), 0) + 1 into next_sort from public.cal_phases where group_id = g;
  if not exists (select 1 from public.cal_phases where group_id = g and kind = 'cad' and robot_id = r.id) then
    insert into public.cal_phases (group_id, name, kind, robot_id, sort) values (g, 'CAD', 'cad', r.id, next_sort);
    next_sort := next_sort + 1;
  end if;
  if not exists (select 1 from public.cal_phases where group_id = g and kind = 'manufacturing' and robot_id = r.id) then
    insert into public.cal_phases (group_id, name, kind, robot_id, sort) values (g, 'Manufacturing', 'manufacturing', r.id, next_sort);
  end if;
end $$;
revoke all on function public.cal_add_project_phases(uuid, public.robots) from public, anon, authenticated;

create or replace function public.cal_add_project(sub public.subsystems, r public.robots) returns void
language plpgsql security definer set search_path = public as $$
declare
  g uuid;
begin
  select id into g from public.cal_groups where kind = 'project' and subsystem_id = sub.id;
  if g is null then
    insert into public.cal_groups (season, team, kind, subsystem_id, name, lead_id, sort)
    values (r.season, 'mechanics', 'project', sub.id, sub.name, sub.lead_id, 100 + sub.number)
    returning id into g;
  else
    update public.cal_groups set name = sub.name, lead_id = sub.lead_id where id = g
      and (name is distinct from sub.name or lead_id is distinct from sub.lead_id);
  end if;
  perform public.cal_add_project_phases(g, r);
end $$;
revoke all on function public.cal_add_project(public.subsystems, public.robots) from public, anon, authenticated;

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
  for r in select * from public.robots where season = s and version is not null and not offseason order by version loop
    for sub in select * from public.subsystems where robot_id = r.id loop
      insert into public.cal_groups (season, team, kind, subsystem_number, name, lead_id, sort)
      values (s, 'mechanics', 'subsystem', sub.number, sub.name, sub.lead_id, 10 + sub.number)
      on conflict (season, team, kind, subsystem_number) where kind <> 'project' do nothing
      returning id into g;
      if g is null then
        select id into g from public.cal_groups where season = s and kind = 'subsystem' and subsystem_number = sub.number;
      end if;
      perform public.cal_add_robot_phases(g, r);
      g := null;
    end loop;
  end loop;
  -- Off-season projects that aren't archived: a group per subsystem.
  for r in select * from public.robots where season = s and offseason and not archived loop
    for sub in select * from public.subsystems where robot_id = r.id loop
      perform public.cal_add_project(sub, r);
    end loop;
  end loop;
end $$;
revoke all on function public.cal_ensure_season(integer) from public, anon;
grant execute on function public.cal_ensure_season(integer) to authenticated;

create or replace function public.cal_subsystem_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.robots;
  g uuid;
begin
  select * into r from public.robots where id = new.robot_id;
  if r.offseason then
    perform public.cal_ensure_season(r.season);
    perform public.cal_add_project(new, r);
    return new;
  end if;
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

-- Marking a robot off-season (or unarchiving one) brings its project groups in at once.
create or replace function public.cal_robot_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.offseason and not new.archived then perform public.cal_ensure_season(new.season); end if;
  return new;
end $$;
drop trigger if exists cal_robot_sync on public.robots;
create trigger cal_robot_sync after insert or update of offseason, archived, season on public.robots
  for each row execute function public.cal_robot_sync();
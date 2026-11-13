-- Captain: the team's main person. Tom Haitin. Sees everything an admin sees: People with emails,
-- who can join, sections used, and SteamLab. It's a view role; the admin's edit buttons stay the admin's.
--
-- Locked: once this runs, nobody can change it through Steamhub or the API, admins included.
-- The profiles_captain_lock trigger refuses any change to captain, and any ban, shared-PC switch or
-- delete of the captain's account. Only dropping the trigger in the SQL editor (the project owner)
-- gets around it, and that's deliberate: a database can't lock out its own owner.

alter table public.profiles add column if not exists captain boolean not null default false;
grant select (captain) on public.profiles to authenticated;

-- Set before the lock exists. Matched by email, so it lands on Tom's account and nobody else's.
update public.profiles set captain = (lower(email) = 'tomhaitin@gmail.com') where captain is distinct from (lower(email) = 'tomhaitin@gmail.com');

create or replace function public.profiles_captain_lock() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.captain then
      raise exception 'Captain is fixed and can''t be given' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.captain then
      raise exception 'The captain''s account can''t be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if new.captain is distinct from old.captain then
    raise exception 'Captain is fixed and can''t be changed' using errcode = 'P0001';
  end if;
  if old.captain and (new.banned or new.shared) then
    raise exception 'The captain can''t be banned or made a shared PC' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists profiles_captain_lock on public.profiles;
create trigger profiles_captain_lock before insert or update or delete on public.profiles
  for each row execute function public.profiles_captain_lock();

create or replace function public.is_captain() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and captain and not banned)
$$;
revoke all on function public.is_captain() from public, anon;
grant execute on function public.is_captain() to authenticated;

-- ===== Sees all =====
-- People with emails (the People page).
create or replace function public.admin_people() returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where public.is_admin() or public.is_captain() order by created_at desc;
$$;

-- Sections used.
drop policy if exists "captain reads page views" on public.page_views;
create policy "captain reads page views" on public.page_views for select to authenticated using (public.is_captain());

-- Who can join (read only; adding and removing stays the admin's).
drop policy if exists "captain reads allowed emails" on public.allowed_emails;
create policy "captain reads allowed emails" on public.allowed_emails for select to authenticated using (public.is_captain());

-- SteamLab.
create or replace function public.can_steamlab() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and not p.banned and (
      p.is_admin or p.mentor or p.captain
      or exists (select 1 from public.subsystems s join public.robots r on r.id = s.robot_id where s.lead_id = p.id and not r.archived)
      or exists (select 1 from public.cal_groups g where g.lead_id = p.id)
    )
  )
$$;

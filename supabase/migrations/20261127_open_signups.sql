-- Open sign-ups for a while: until the time in settings 'signups_open_until', any Google account
-- can make an account, not only the emails on the list. After that time the list applies again
-- by itself, with nothing to switch back. Accounts made while it was open keep working, like any
-- account that already exists.
--
-- Only an admin can set the time ("admin writes settings"). Anyone can ask whether it's open, so
-- the sign-in screen can hide "Ask for access" while it is.

create or replace function public.signups_open_until() returns timestamptz
language sql stable security definer set search_path = public as $$
  select t from (
    select (value #>> '{}')::timestamptz as t from public.settings where key = 'signups_open_until'
  ) s where t > now()
$$;
revoke all on function public.signups_open_until() from public;
grant execute on function public.signups_open_until() to anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  shown text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
begin
  if new.email is null
     or (public.signups_open_until() is null
         and not exists (select 1 from public.allowed_emails where email = public.norm_email(new.email))) then
    raise exception 'Not on the Steamhub list' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, name, email, avatar)
  values (new.id, shown, new.email, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.notifications (user_id, kind, text, link)
  select p.id, 'new_user', shown || ' (' || coalesce(new.email, 'no email') || ') signed in for the first time', '/people'
  from public.profiles p where p.is_admin and p.id <> new.id;
  return new;
end $$;

-- 2026-11-21: the link goes out to the whole team, open for 24 hours.
insert into public.settings (key, value, updated_at)
values ('signups_open_until', to_jsonb(now() + interval '24 hours'), now())
on conflict (key) do update set value = excluded.value, updated_at = now();

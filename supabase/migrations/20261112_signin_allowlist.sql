-- Who can sign in: accounts that already exist, plus new Google accounts whose email is on the
-- admin's list (People → Who can join). Anyone else is refused before an account is made, so
-- nothing of theirs is stored.

create table if not exists public.allowed_emails (
  -- Stored normalized (see norm_email), so "J.Doe+robotics@Gmail.com" and "jdoe@gmail.com" match.
  email text primary key,
  added_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;
drop policy if exists "admin all allowed emails" on public.allowed_emails;
create policy "admin all allowed emails" on public.allowed_emails for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Lower case; for Gmail also drop dots and "+anything" in the name, which Gmail ignores.
create or replace function public.norm_email(e text) returns text
language sql immutable as $$
  select case
    when split_part(lower(trim(e)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(trim(e)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else lower(trim(e))
  end
$$;

-- Every new account gets a profile, and every admin hears about it. A new account whose email
-- isn't on the list is refused: the error rolls back the account itself.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  shown text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
begin
  if new.email is null or not exists (select 1 from public.allowed_emails where email = public.norm_email(new.email)) then
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

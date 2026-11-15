-- Mentors see all: everything the captain sees (People with emails, who can join, join requests,
-- sections used, Claude's calls, SteamLab), read only. Bans, roles, allowed emails and approving
-- join requests stay the admin's. is_captain() itself is unchanged, so Onshape links stay
-- admin, captain and lead.

create or replace function public.sees_all() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not banned and (is_admin or captain or mentor))
$$;
revoke all on function public.sees_all() from public, anon;
grant execute on function public.sees_all() to authenticated;

-- People with emails.
create or replace function public.admin_people() returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where public.sees_all() order by created_at desc;
$$;

-- Sections used.
drop policy if exists "captain reads page views" on public.page_views;
drop policy if exists "sees all reads page views" on public.page_views;
create policy "sees all reads page views" on public.page_views for select to authenticated using (public.sees_all());

-- Who can join.
drop policy if exists "captain reads allowed emails" on public.allowed_emails;
drop policy if exists "sees all reads allowed emails" on public.allowed_emails;
create policy "sees all reads allowed emails" on public.allowed_emails for select to authenticated using (public.sees_all());

-- Join requests.
drop policy if exists "admin reads join requests" on public.join_requests;
create policy "admin reads join requests" on public.join_requests for select to authenticated using (public.sees_all());

-- Claude's calls.
drop policy if exists "admin reads ai calls" on public.ai_calls;
create policy "admin reads ai calls" on public.ai_calls for select to authenticated using (public.sees_all());

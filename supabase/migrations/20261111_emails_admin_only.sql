-- Emails for the admin only. Everyone else reads names (for leads, members and makers).
-- RUN AFTER the 11 Nov code is deployed: older code reads profiles with select *, which this
-- column grant turns into an error.

revoke select on public.profiles from authenticated;
grant select (id, name, avatar, is_admin, banned, created_at) on public.profiles to authenticated;

-- The People page: every account with its email, admin only.
create or replace function public.admin_people()
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where public.is_admin() order by created_at desc;
$$;
revoke all on function public.admin_people() from public, anon;
grant execute on function public.admin_people() to authenticated;

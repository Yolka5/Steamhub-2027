-- Stock, the calculator robot and stock photos for signed-in, not-banned members only.
-- Replaces 20261107_manufacturing_2_signin.sql, which was never run and only covered reading:
-- until now these tables were readable with the public key, and a banned account could still
-- edit and delete stock.

-- Reading
drop policy if exists "read pieces" on public.pieces;
drop policy if exists "read events" on public.piece_events;
drop policy if exists "read materials" on public.materials;
drop policy if exists "read locations" on public.locations;
drop policy if exists "read robots" on public.calc_robots;
create policy "read pieces" on public.pieces for select to authenticated using (public.is_member());
create policy "read events" on public.piece_events for select to authenticated using (public.is_member());
create policy "read materials" on public.materials for select to authenticated using (public.is_member());
create policy "read locations" on public.locations for select to authenticated using (public.is_member());
create policy "read robots" on public.calc_robots for select to authenticated using (public.is_member());

-- Writing
drop policy if exists "add pieces" on public.pieces;
drop policy if exists "edit pieces" on public.pieces;
drop policy if exists "delete pieces" on public.pieces;
create policy "add pieces" on public.pieces for insert to authenticated with check (public.is_member());
create policy "edit pieces" on public.pieces for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "delete pieces" on public.pieces for delete to authenticated using (public.is_member());

drop policy if exists "add events" on public.piece_events;
create policy "add events" on public.piece_events for insert to authenticated with check (by_id = auth.uid() and public.is_member());

drop policy if exists "edit materials" on public.materials;
create policy "edit materials" on public.materials for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists "edit locations" on public.locations;
create policy "edit locations" on public.locations for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists "add robots" on public.calc_robots;
drop policy if exists "edit robots" on public.calc_robots;
create policy "add robots" on public.calc_robots for insert to authenticated with check (public.is_member());
create policy "edit robots" on public.calc_robots for update to authenticated using (public.is_member()) with check (public.is_member());

-- Stock photos (the bucket stays public for reading, so photo links keep working in <img>)
drop policy if exists "upload photos" on storage.objects;
drop policy if exists "replace photos" on storage.objects;
create policy "upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_member());
create policy "replace photos" on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_member());

-- ===== Page opens per section =====
-- One counter per section per day, no names: enough to see two weeks after kickoff which
-- sections nobody uses. Only the admin reads it.
create table if not exists public.page_views (
  day date not null default current_date,
  section text not null,
  n integer not null default 0,
  primary key (day, section)
);
alter table public.page_views enable row level security;
create policy "admin reads page views" on public.page_views for select to authenticated using (public.is_admin());

create or replace function public.count_view(section text) returns void
language sql security definer set search_path = public as $$
  insert into public.page_views (day, section, n)
  select current_date, left(section, 40), 1
  where public.is_member()
  on conflict (day, section) do update set n = public.page_views.n + 1;
$$;
revoke all on function public.count_view(text) from public, anon;
grant execute on function public.count_view(text) to authenticated;

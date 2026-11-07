-- Run when the sign-in gate is deployed: stock, calculator and photos stop being public.
-- Until then the live site still reads them without signing in.

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

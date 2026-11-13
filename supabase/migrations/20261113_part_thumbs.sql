-- Part pictures for lists, drawn once and shared. Each device used to draw every picture itself
-- (two at a time), so the workshop PC waited seconds for a list. The first device to need one, or
-- the uploader, draws it and saves it here; everyone else reads it in one request per list.
-- Keyed by geometry path, which is unique per upload, so a picture never goes stale.

create table if not exists public.part_thumbs (
  geometry_path text primary key,
  svg text not null,
  created_at timestamptz not null default now()
);

alter table public.part_thumbs enable row level security;
drop policy if exists "members read part thumbs" on public.part_thumbs;
create policy "members read part thumbs" on public.part_thumbs for select to authenticated using (public.is_member());
drop policy if exists "members add part thumbs" on public.part_thumbs;
create policy "members add part thumbs" on public.part_thumbs for insert to authenticated with check (public.is_member());

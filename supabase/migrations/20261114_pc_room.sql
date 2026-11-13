-- Which room a shared PC stands in. The CNC room's PC gets its own Home: the CNC parts, by plate.
-- Null is the workshop. Admin sets it in People, like `shared`.
alter table public.profiles add column if not exists room text check (room in ('cnc'));
grant select (room) on public.profiles to authenticated;

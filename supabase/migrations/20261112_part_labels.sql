-- The right answer for each part, labelled by hand at /manufacturing/label. A test set for the
-- part classifier (made or bought, and which machines in which order), so changes to the guessing
-- can be scored. Keeps a copy of name, size and geometry so a label survives the part being removed.

create table if not exists public.part_labels (
  id uuid primary key default gen_random_uuid(),
  part_id uuid unique references public.parts on delete set null,
  sig text not null,
  name text not null,
  geometry_path text,
  size numeric[],
  cls text,
  -- What the upload guessed when it was labelled.
  guess text,
  -- Machines in order, e.g. {Lathe,Mill} or {CNC,Bend}; {Bought} for COTS. Empty = skipped (not sure).
  route text[] not null default '{}',
  note text not null default '',
  labeled_by uuid references public.profiles on delete set null,
  labeled_by_name text,
  labeled_at timestamptz not null default now(),
  constraint part_labels_route check (route <@ array['CNC', 'Lathe', 'Mill', '3D print', 'Bend', 'Bought']::text[])
);

alter table public.part_labels enable row level security;
drop policy if exists "members all part labels" on public.part_labels;
create policy "members all part labels" on public.part_labels for all to authenticated using (public.is_member()) with check (public.is_member());

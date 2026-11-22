-- Drawing training (DRAWING_TRAINING.md): STEP uploads that only exist to correct the drawings the
-- engine makes, and to teach Claude's upload check. Kept apart from parts, so nothing reaches the
-- workshop. Admin only. Files go to the 'parts' bucket under training/.

create table if not exists public.drawing_uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  size bigint not null default 0,
  parts int not null default 0,
  drawn int not null default 0,
  bought int not null default 0,
  repeats int not null default 0,
  -- Rows made while testing the page itself, removed afterwards.
  test boolean not null default false,
  uploaded_by uuid references public.profiles on delete set null,
  uploaded_by_name text,
  at timestamptz not null default now()
);

create table if not exists public.drawing_examples (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references public.drawing_uploads on delete cascade,
  sig text not null unique,
  name text not null,
  qty int not null default 1,
  size numeric[] not null default '{}',
  geometry_path text,
  -- What the engine picked at upload, exactly as a real upload would.
  custom boolean not null default true,
  machine text not null,
  route text[] not null default '{}',
  why text not null default '',
  material text not null default '',
  cls text,
  -- Claude's upload check on this drawing.
  claude_findings jsonb,
  claude_at timestamptz,
  claude_engine text,
  status text not null default 'todo' check (status in ('todo', 'right', 'corrected', 'skipped')),
  created_at timestamptz not null default now()
);
create index if not exists drawing_examples_upload on public.drawing_examples (upload_id);

create table if not exists public.drawing_reviews (
  id uuid primary key default gen_random_uuid(),
  example_id uuid not null references public.drawing_examples on delete cascade,
  engine_version text not null,
  -- right / corrected / skipped on a first review; the rest are re-checks after an engine update.
  verdict text not null check (verdict in ('right', 'corrected', 'skipped', 'fixed', 'partly', 'not_fixed', 'worse', 'still_right', 'broke')),
  fixes text[] not null default '{}',
  -- [{ n, x, y, w?, h?, note, fix? }] in fractions of the drawing (0..1), w/h for a box.
  marks jsonb not null default '[]',
  -- The right answers, when they differ from the engine's (null = the engine was right).
  made text check (made in ('made', 'bought')),
  route text[],
  material text,
  cls text,
  -- [{ text, kind, right }] Claude's findings marked right or wrong.
  claude_marks jsonb not null default '[]',
  note text not null default '',
  -- The drawing as it was reviewed (gzipped SVG in 'parts'), so "before" survives an engine change.
  drawing_path text,
  -- { cls, template, scale } of that drawing.
  engine_meta jsonb,
  by_id uuid references public.profiles on delete set null,
  by_name text,
  at timestamptz not null default now(),
  unique (example_id, engine_version),
  constraint drawing_reviews_route check (route is null or route <@ array['CNC', 'Lathe', 'Mill', '3D print', 'Bend', 'Bought']::text[])
);

create table if not exists public.drawing_lessons (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  kind text not null default 'drawing' check (kind in ('drawing', 'route', 'bought', 'engine_gap')),
  -- How many corrections it came from.
  sources int not null default 0,
  status text not null default 'proposed' check (status in ('proposed', 'live', 'dropped')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by_name text
);

alter table public.drawing_uploads enable row level security;
alter table public.drawing_examples enable row level security;
alter table public.drawing_reviews enable row level security;
alter table public.drawing_lessons enable row level security;

drop policy if exists "admin drawing uploads" on public.drawing_uploads;
create policy "admin drawing uploads" on public.drawing_uploads for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin drawing examples" on public.drawing_examples;
create policy "admin drawing examples" on public.drawing_examples for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin drawing reviews" on public.drawing_reviews;
create policy "admin drawing reviews" on public.drawing_reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin drawing lessons" on public.drawing_lessons;
create policy "admin drawing lessons" on public.drawing_lessons for all to authenticated using (public.is_admin()) with check (public.is_admin());

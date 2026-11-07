-- Manufacturing phase 5 (see MANUFACTURING.md): bolt table and assembly guide.
-- The analysis (joints, steps, step pictures) is worked out at upload and saved as files in the
-- parts bucket; these tables hold what people change or tick.

alter table public.step_uploads add column if not exists analysis_path text;

-- Per subsystem: a joint's chosen type ("type:<joint key>") or a shopping item's state ("item:<name>").
create table if not exists public.hardware (
  subsystem_id uuid not null references public.subsystems on delete cascade,
  key text not null,
  value jsonb not null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  primary key (subsystem_id, key)
);

create table if not exists public.guide_progress (
  subsystem_id uuid not null references public.subsystems on delete cascade,
  step_key text not null,
  done_by_name text,
  done_at timestamptz not null default now(),
  primary key (subsystem_id, step_key)
);

alter table public.hardware enable row level security;
alter table public.guide_progress enable row level security;
create policy "members all hardware" on public.hardware for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all guide progress" on public.guide_progress for all to authenticated using (public.is_member()) with check (public.is_member());

-- The team's hardware stock (bolt lengths, nuts) is everyone's to fill in, not only the admin's.
create policy "members write hardware stock" on public.settings for all to authenticated
  using (key = 'hardware_stock' and public.is_member()) with check (key = 'hardware_stock' and public.is_member());

alter publication supabase_realtime add table public.guide_progress;

-- Prototypes (see PROTOTYPES.md): prototypes per subsystem, parameters, tests with video, blocks.
-- A prototype links to a subsystem by season + number, so it shows on V1 and V2 alike.

create table if not exists public.prototypes (
  id uuid primary key default gen_random_uuid(),
  season int not null default extract(year from now())::int,
  subsystem_number int check (subsystem_number > 0),
  name text not null,
  concept text not null default '',
  status text not null default 'idea' check (status in ('idea', 'building', 'testing', 'chosen', 'dropped')),
  status_note text not null default '',
  owner_id uuid references public.profiles on delete set null,
  cover_path text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prototypes_season on public.prototypes (season, subsystem_number);
drop trigger if exists prototypes_touch on public.prototypes;
create trigger prototypes_touch before update on public.prototypes for each row execute function public.touch_updated_at();

create table if not exists public.prototype_members (
  prototype_id uuid not null references public.prototypes on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (prototype_id, user_id)
);

-- A parameter belongs to a subsystem's set (prototype_id null) or to one prototype.
create table if not exists public.param_defs (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  subsystem_number int,
  prototype_id uuid references public.prototypes on delete cascade,
  name text not null,
  unit text not null default '',
  kind text not null default 'number' check (kind in ('number', 'text', 'choice', 'bool')),
  options text[] not null default '{}',
  key boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  check (prototype_id is not null or subsystem_number is not null)
);
create index if not exists param_defs_sub on public.param_defs (season, subsystem_number) where prototype_id is null;
create index if not exists param_defs_proto on public.param_defs (prototype_id);

create table if not exists public.prototype_tests (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null references public.prototypes on delete cascade,
  n int not null,
  "values" jsonb not null default '{}',
  result text check (result in ('worked', 'partly', 'failed')),
  score int check (score between 1 and 5),
  measure_name text not null default '',
  measure_value numeric,
  note text not null default '',
  video_path text,
  poster_path text,
  video_link text,
  duration_s numeric,
  video_size bigint,
  by_id uuid references public.profiles on delete set null,
  by_name text,
  at timestamptz not null default now(),
  unique (prototype_id, n)
);

create table if not exists public.prototype_blocks (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null references public.prototypes on delete cascade,
  kind text not null check (kind in ('notes', 'photos', 'checklist', 'proscons', 'links', 'calc', 'stock', 'chart')),
  title text not null default '',
  data jsonb not null default '{}',
  position double precision not null default 0,
  collapsed boolean not null default false,
  updated_by uuid references public.profiles on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists prototype_blocks_proto on public.prototype_blocks (prototype_id, position);
drop trigger if exists prototype_blocks_touch on public.prototype_blocks;
create trigger prototype_blocks_touch before update on public.prototype_blocks for each row execute function public.touch_updated_at();

-- The blocks a subsystem's new prototypes start with.
create table if not exists public.subsystem_layouts (
  season int not null,
  subsystem_number int not null,
  layout jsonb not null default '[]',
  primary key (season, subsystem_number)
);

alter table public.pieces add column if not exists prototype_id uuid references public.prototypes on delete set null;

-- ===== Policies =====
alter table public.prototypes enable row level security;
alter table public.prototype_members enable row level security;
alter table public.param_defs enable row level security;
alter table public.prototype_tests enable row level security;
alter table public.prototype_blocks enable row level security;
alter table public.subsystem_layouts enable row level security;

create policy "members read prototypes" on public.prototypes for select to authenticated using (public.is_member());
create policy "members add prototypes" on public.prototypes for insert to authenticated with check (public.is_member());
create policy "members edit prototypes" on public.prototypes for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "owner deletes prototype" on public.prototypes for delete to authenticated
  using (public.is_member() and (owner_id = auth.uid() or created_by = auth.uid() or public.is_admin()));

create policy "members all prototype members" on public.prototype_members for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all param defs" on public.param_defs for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all blocks" on public.prototype_blocks for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all layouts" on public.subsystem_layouts for all to authenticated using (public.is_member()) with check (public.is_member());

create policy "members read tests" on public.prototype_tests for select to authenticated using (public.is_member());
create policy "members add tests" on public.prototype_tests for insert to authenticated with check (public.is_member());
create policy "members edit tests" on public.prototype_tests for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "filmer deletes test" on public.prototype_tests for delete to authenticated
  using (public.is_member() and (by_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.prototypes p where p.id = prototype_id and p.owner_id = auth.uid())));

alter publication supabase_realtime add table public.prototypes;
alter publication supabase_realtime add table public.prototype_tests;
alter publication supabase_realtime add table public.prototype_blocks;
alter publication supabase_realtime add table public.param_defs;

-- ===== Storage: videos, posters and photos =====
insert into storage.buckets (id, name, public, file_size_limit) values ('prototypes', 'prototypes', false, 52428800)
on conflict (id) do nothing;

create policy "members read prototype files" on storage.objects for select to authenticated
  using (bucket_id = 'prototypes' and public.is_member());
create policy "members add prototype files" on storage.objects for insert to authenticated
  with check (bucket_id = 'prototypes' and public.is_member());
create policy "members replace prototype files" on storage.objects for update to authenticated
  using (bucket_id = 'prototypes' and public.is_member());
create policy "members remove prototype files" on storage.objects for delete to authenticated
  using (bucket_id = 'prototypes' and public.is_member());

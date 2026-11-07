-- Manufacturing phases 1 and 2 (see MANUFACTURING.md).
-- Adds people, robots, subsystems, uploads, parts, part history and notifications.
-- Existing stock tables keep their policies until the sign-in gate is deployed
-- (then run 20261107_manufacturing_2_signin.sql).

-- ===== People =====
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  email text,
  avatar text,
  is_admin boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and not exists (select 1 from public.profiles where id = auth.uid() and banned)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin)
$$;

-- ===== Notifications =====
create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null,
  text text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

-- Every new account gets a profile, and every admin hears about it.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  shown text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, name, email, avatar)
  values (new.id, shown, new.email, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.notifications (user_id, kind, text, link)
  select p.id, 'new_user', shown || ' (' || coalesce(new.email, 'no email') || ') signed in for the first time', '/people'
  from public.profiles p where p.is_admin and p.id <> new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- People who signed in before this existed.
insert into public.profiles (id, name, email, avatar)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       u.email,
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- ===== Robots and subsystems =====
create table if not exists public.robots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season int not null default extract(year from now())::int,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);

create table if not exists public.subsystems (
  id uuid primary key default gen_random_uuid(),
  robot_id uuid not null references public.robots on delete cascade,
  number int not null check (number > 0),
  name text not null,
  lead_id uuid references public.profiles on delete set null,
  assembled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (robot_id, number)
);

create table if not exists public.subsystem_members (
  subsystem_id uuid not null references public.subsystems on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (subsystem_id, user_id)
);

-- ===== Uploads and parts =====
create table if not exists public.step_uploads (
  id uuid primary key default gen_random_uuid(),
  subsystem_id uuid not null references public.subsystems on delete cascade,
  path text not null,
  filename text not null,
  size bigint,
  uploaded_by uuid references public.profiles on delete set null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  part_count int,
  summary jsonb
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  subsystem_id uuid not null references public.subsystems on delete cascade,
  part_no int not null,
  sig text not null,
  name text not null,
  qty int not null default 1,
  machine text not null default 'CNC' check (machine in ('CNC', 'Lathe', 'Mill', '3D print', 'Bought')),
  material text not null default '',
  size numeric[] not null default '{0,0,0}',
  cls text,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'cancelled', 'missing')),
  released_at timestamptz,
  released_by uuid references public.profiles on delete set null,
  urgent boolean not null default false,
  maker_id uuid references public.profiles on delete set null,
  maker_name text,
  drawn_by text,
  notes text not null default '',
  changed boolean not null default false,
  bad boolean not null default false,
  geometry_path text,
  step_path text,
  own_pdf_path text,
  last_upload_id uuid references public.step_uploads on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subsystem_id, part_no)
);
create index if not exists parts_released on public.parts (released_at) where released_at is not null;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists parts_touch on public.parts;
create trigger parts_touch before update on public.parts for each row execute function public.touch_updated_at();

create table if not exists public.part_events (
  id bigserial primary key,
  part_id uuid not null references public.parts on delete cascade,
  action text not null,
  by_id uuid references public.profiles on delete set null,
  by_name text,
  details jsonb,
  at timestamptz not null default now()
);
create index if not exists part_events_part on public.part_events (part_id, at desc);

-- ===== Row level security: signed in and not banned =====
alter table public.profiles enable row level security;
alter table public.notifications enable row level security;
alter table public.robots enable row level security;
alter table public.subsystems enable row level security;
alter table public.subsystem_members enable row level security;
alter table public.step_uploads enable row level security;
alter table public.parts enable row level security;
alter table public.part_events enable row level security;

create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member());
create policy "admin edits profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own" on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy "members notify" on public.notifications for insert to authenticated with check (public.is_member());

create policy "members all robots" on public.robots for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all subsystems" on public.subsystems for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all subsystem_members" on public.subsystem_members for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all uploads" on public.step_uploads for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all parts" on public.parts for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read part events" on public.part_events for select to authenticated using (public.is_member());
create policy "members add part events" on public.part_events for insert to authenticated with check (public.is_member());

-- ===== Realtime =====
alter publication supabase_realtime add table public.parts;
alter publication supabase_realtime add table public.notifications;

-- ===== Storage: STEP files, per-part geometry and STEP, uploaded drawings =====
insert into storage.buckets (id, name, public) values
  ('step', 'step', false),
  ('parts', 'parts', false),
  ('drawings', 'drawings', false)
on conflict (id) do nothing;

create policy "members read mfg files" on storage.objects for select to authenticated
  using (bucket_id in ('step', 'parts', 'drawings') and public.is_member());
create policy "members add mfg files" on storage.objects for insert to authenticated
  with check (bucket_id in ('step', 'parts', 'drawings') and public.is_member());
create policy "members replace mfg files" on storage.objects for update to authenticated
  using (bucket_id in ('step', 'parts', 'drawings') and public.is_member());
create policy "members remove mfg files" on storage.objects for delete to authenticated
  using (bucket_id in ('step', 'parts', 'drawings') and public.is_member());

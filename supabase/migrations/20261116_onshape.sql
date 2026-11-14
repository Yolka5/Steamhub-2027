-- Onshape connection (ONSHAPE.md, phases 1 to 3): each person's own API key, a subsystem or robot
-- linked to its Onshape assembly, and what a sync reads from it (material, mass, source document).
-- Safe to run before the code is deployed: it only adds tables, columns, functions and settings.
-- Everything here is written by the `onshape` edge function (service role). Members only read.

-- ===== Who has connected =====
-- The key pair itself lives in Vault (below), never in a table a member can read.
create table if not exists public.onshape_accounts (
  user_id uuid primary key references public.profiles on delete cascade,
  onshape_name text,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- Successful calls made through Steamhub with this key, in `year`. Onshape allows 2,500 a year.
  year int not null default extract(year from now())::int,
  calls int not null default 0
);
alter table public.onshape_accounts enable row level security;
drop policy if exists "members read onshape accounts" on public.onshape_accounts;
create policy "members read onshape accounts" on public.onshape_accounts for select to authenticated using (public.is_member());

-- ===== Every call, for the counter and for finding a runaway =====
create table if not exists public.onshape_calls (
  id bigserial primary key,
  key_user uuid references public.profiles on delete set null,
  by_user uuid references public.profiles on delete set null,
  link_id uuid,
  action text not null,
  endpoint text not null,
  status int not null,
  at timestamptz not null default now()
);
create index if not exists onshape_calls_key on public.onshape_calls (key_user, at desc);
alter table public.onshape_calls enable row level security;
drop policy if exists "own onshape calls" on public.onshape_calls;
create policy "own onshape calls" on public.onshape_calls for select to authenticated
  using (key_user = auth.uid() or by_user = auth.uid() or public.is_admin());

-- ===== A subsystem or a robot, linked to an assembly tab =====
create table if not exists public.onshape_links (
  id uuid primary key default gen_random_uuid(),
  subsystem_id uuid unique references public.subsystems on delete cascade,
  robot_id uuid unique references public.robots on delete cascade,
  did text not null,
  wid text not null,
  eid text not null,
  doc_name text,
  linked_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  -- From the last sync.
  microversion text,
  mass_g numeric,
  target_g numeric,
  centroid jsonb,
  -- { prints, no_mass, rows, matched } counts, and for a robot { parts: [...], heavy: [...] }.
  summary jsonb not null default '{}',
  flags jsonb not null default '[]',
  dismissed jsonb not null default '[]',
  unmatched jsonb not null default '[]',
  last_sync_at timestamptz,
  last_sync_by uuid references public.profiles on delete set null,
  last_key_user uuid references public.profiles on delete set null,
  last_calls int,
  last_checked_at timestamptz,
  check ((subsystem_id is null) <> (robot_id is null))
);
alter table public.onshape_links enable row level security;
drop policy if exists "members read onshape links" on public.onshape_links;
create policy "members read onshape links" on public.onshape_links for select to authenticated using (public.is_member());

-- ===== History, one row per sync that found a change =====
create table if not exists public.onshape_syncs (
  id bigserial primary key,
  link_id uuid not null references public.onshape_links on delete cascade,
  by_id uuid references public.profiles on delete set null,
  key_user uuid references public.profiles on delete set null,
  kind text not null default 'light',
  microversion text,
  mass_g numeric,
  rows int,
  matched int,
  calls int,
  note text,
  at timestamptz not null default now()
);
create index if not exists onshape_syncs_link on public.onshape_syncs (link_id, at desc);
alter table public.onshape_syncs enable row level security;
drop policy if exists "members read onshape syncs" on public.onshape_syncs;
create policy "members read onshape syncs" on public.onshape_syncs for select to authenticated using (public.is_member());

-- ===== Source documents seen in a bill of materials =====
-- A public document owned by someone else is a parts library (MKCad, FRCDesignLib), so its parts
-- are bought. A private one is the team's. Looked up once, then remembered for every subsystem.
create table if not exists public.onshape_documents (
  did text primary key,
  name text,
  owner_name text,
  public boolean,
  kind text not null check (kind in ('team', 'library')),
  -- Set when an admin flipped it by hand; a later lookup then leaves it alone.
  set_by uuid references public.profiles on delete set null,
  seen_at timestamptz not null default now()
);
alter table public.onshape_documents enable row level security;
drop policy if exists "members read onshape documents" on public.onshape_documents;
create policy "members read onshape documents" on public.onshape_documents for select to authenticated using (public.is_member());

-- ===== What a sync writes on a part =====
alter table public.parts add column if not exists os_part_id text;
alter table public.parts add column if not exists os_document text;
alter table public.parts add column if not exists os_href text;
alter table public.parts add column if not exists os_material text;
alter table public.parts add column if not exists os_mass_g numeric;
alter table public.parts add column if not exists os_part_number text;
-- Onshape says it's bought: 'standard' (bolts and nuts) or 'library'. Null when it's the team's.
alter table public.parts add column if not exists os_bought text;
-- Someone said "keep as made", so a sync stops suggesting Bought for it.
alter table public.parts add column if not exists os_keep boolean not null default false;
-- Where the material came from: 'guess' (the upload), 'onshape', or 'person' (typed in Steamhub).
alter table public.parts add column if not exists material_by text not null default 'guess';

insert into public.settings (key, value) values
  ('weight_limit_kg', '52.2'::jsonb),
  ('weight_gain_kg', '0.2'::jsonb),
  ('weight_heavy_part_kg', '5'::jsonb)
on conflict (key) do nothing;

-- ===== Keys in Vault =====
-- One secret per person, named onshape_key_<user id>, holding {"a": access, "s": secret}.
-- Only the service role (the edge function) can call these.
create or replace function public.onshape_key_set(uid uuid, a text, s text) returns void
language plpgsql security definer set search_path = public as $$
declare
  nm text := 'onshape_key_' || uid::text;
  sid uuid;
  val text := jsonb_build_object('a', a, 's', s)::text;
begin
  select id into sid from vault.secrets where name = nm;
  if sid is null then
    perform vault.create_secret(val, nm, 'Onshape API key of one Steamhub member');
  else
    perform vault.update_secret(sid, val);
  end if;
end $$;

create or replace function public.onshape_key_get(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'onshape_key_' || uid::text limit 1
$$;

create or replace function public.onshape_key_del(uid uuid) returns void
language sql security definer set search_path = public as $$
  delete from vault.secrets where name = 'onshape_key_' || uid::text
$$;

-- One more call on a key's yearly counter. A new year starts the count again.
create or replace function public.onshape_count(uid uuid, n int) returns int
language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from now())::int;
  c int;
begin
  update public.onshape_accounts
     set calls = case when year = y then calls + n else n end, year = y, last_used_at = now()
   where user_id = uid
   returning calls into c;
  return c;
end $$;

revoke all on function public.onshape_key_set(uuid, text, text) from public, anon, authenticated;
revoke all on function public.onshape_key_get(uuid) from public, anon, authenticated;
revoke all on function public.onshape_key_del(uuid) from public, anon, authenticated;
revoke all on function public.onshape_count(uuid, int) from public, anon, authenticated;
grant execute on function public.onshape_key_set(uuid, text, text) to service_role;
grant execute on function public.onshape_key_get(uuid) to service_role;
grant execute on function public.onshape_key_del(uuid) to service_role;
grant execute on function public.onshape_count(uuid, int) to service_role;

-- ===== The nightly run =====
-- Same shape as SteamLab's: the function has no JWT check, so cron carries a key kept in Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'onshape_cron') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'onshape_cron', 'Onshape: key the nightly sync run sends');
  end if;
end $$;

create or replace function public.onshape_key_ok(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'onshape_cron' and decrypted_secret = k)
$$;
revoke all on function public.onshape_key_ok(text) from public, anon, authenticated;
grant execute on function public.onshape_key_ok(text) to service_role;

create or replace function public.onshape_run() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/onshape',
    body := '{"action":"nightly"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-onshape-key', (select decrypted_secret from vault.decrypted_secrets where name = 'onshape_cron' limit 1)
    ),
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.onshape_run() from public, anon, authenticated;

-- Not scheduled here on purpose. To turn the nightly sync on (23:30 UTC, half an hour before the
-- SteamLab recap), run this once:
--   select cron.schedule('onshape-nightly', '30 23 * * *', 'select public.onshape_run()');
-- To turn it off:
--   select cron.unschedule('onshape-nightly');

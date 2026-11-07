-- Manufacturing phases 3 and 4 (see MANUFACTURING.md): plates, end mills, settings,
-- links between parts and stock, and the wishlist for Uri.

-- ===== Plates: one row per physical plate, so each has its own state =====
create table if not exists public.plates (
  id uuid primary key default gen_random_uuid(),
  material text not null default 'Aluminum',
  thickness numeric not null check (thickness > 0),
  length numeric not null check (length > 0),
  width numeric not null check (width > 0),
  state text not null default 'available' check (state in ('available', 'partly_used', 'gone')),
  -- Sync only ever adds or removes available plates that came from the sheet.
  source text not null default 'manual' check (source in ('sheet', 'manual')),
  notes text,
  updated_by uuid references public.profiles on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists plates_thickness on public.plates (thickness);

create table if not exists public.end_mills (
  id uuid primary key default gen_random_uuid(),
  flutes int not null check (flutes > 0),
  diameter numeric not null check (diameter > 0),
  qty int not null default 0,
  unique (flutes, diameter)
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ===== Parts and stock know about each other =====
alter table public.pieces add column if not exists subsystem_id uuid references public.subsystems on delete set null;
alter table public.parts add column if not exists plate_id uuid references public.plates on delete set null;
alter table public.parts add column if not exists piece_id text references public.pieces (id) on delete set null;

-- ===== Wishlist: what's missing, for Uri's buy list =====
create table if not exists public.wishlist (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  qty int not null default 1,
  vendor text,
  link text,
  price numeric,
  subsystem_id uuid references public.subsystems on delete set null,
  part_id uuid references public.parts on delete set null,
  asked_by uuid references public.profiles on delete set null,
  asked_by_name text,
  status text not null default 'open' check (status in ('open', 'bought')),
  created_at timestamptz not null default now()
);

-- ===== Row level security =====
alter table public.plates enable row level security;
alter table public.end_mills enable row level security;
alter table public.settings enable row level security;
alter table public.wishlist enable row level security;

create policy "members all plates" on public.plates for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all end mills" on public.end_mills for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all wishlist" on public.wishlist for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read settings" on public.settings for select to authenticated using (public.is_member());
create policy "admin writes settings" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.plates;
alter publication supabase_realtime add table public.wishlist;

insert into public.settings (key, value) values
  ('plate_sheet', '{"url": "", "endmill_tab": "כרסומים", "low_m2": 0.5, "synced_at": null}')
on conflict (key) do nothing;

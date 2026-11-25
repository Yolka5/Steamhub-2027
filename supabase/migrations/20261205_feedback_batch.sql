-- Feedback batch (2026-11-25).
-- 1. Two more statuses for calendar tasks, phases and events: Delayed and Cancelled.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('todo','doing','done','delayed','cancelled'));
alter table public.cal_phases drop constraint if exists cal_phases_status_check;
alter table public.cal_phases add constraint cal_phases_status_check check (status in ('todo','doing','done','delayed','cancelled'));
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status is null or status in ('todo','doing','done','delayed','cancelled'));

-- 2. Only mentors, the captain, admins and the Mechanics lead delete robots and subsystems.
create or replace function public.can_delete_robots() returns boolean
language sql stable security definer set search_path = public as $$
  select public.sees_all()
      or exists (select 1 from public.cal_groups g where g.team = 'mechanics' and g.kind = 'team' and g.lead_id = auth.uid())
$$;

drop policy if exists "members all robots" on public.robots;
create policy "members read robots" on public.robots for select using (public.is_member());
create policy "members add robots" on public.robots for insert with check (public.is_member());
create policy "members edit robots" on public.robots for update using (public.is_member());
create policy "leads delete robots" on public.robots for delete using (public.is_member() and public.can_delete_robots());

drop policy if exists "members all subsystems" on public.subsystems;
create policy "members read subsystems" on public.subsystems for select using (public.is_member());
create policy "members add subsystems" on public.subsystems for insert with check (public.is_member());
create policy "members edit subsystems" on public.subsystems for update using (public.is_member());
create policy "leads delete subsystems" on public.subsystems for delete using (public.is_member() and public.can_delete_robots());

-- 3. The Handbook's subsystem approval checklist, ticked per person per subsystem.
create table if not exists public.subsystem_checks (
  subsystem_id uuid not null references public.subsystems(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item int not null,
  checked_at timestamptz not null default now(),
  primary key (subsystem_id, user_id, item)
);
alter table public.subsystem_checks enable row level security;
create policy "members read checks" on public.subsystem_checks for select using (public.is_member());
create policy "own checks in" on public.subsystem_checks for insert with check (public.is_member() and user_id = auth.uid());
create policy "own checks out" on public.subsystem_checks for delete using (public.is_member() and user_id = auth.uid());

-- 4. A mentor's own Home: which blocks, in what order.
create table if not exists public.home_layouts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  blocks jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.home_layouts enable row level security;
create policy "own home read" on public.home_layouts for select using (user_id = auth.uid());
create policy "own home write" on public.home_layouts for insert with check (user_id = auth.uid());
create policy "own home edit" on public.home_layouts for update using (user_id = auth.uid());

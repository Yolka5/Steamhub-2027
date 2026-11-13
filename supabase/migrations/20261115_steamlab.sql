-- SteamLab (STEAMLAB.md): mentors, who can open SteamLab, and Claude's nightly recaps.
-- Safe to run before the code is deployed: it only adds a column, functions, a table and a job.

-- ===== Mentors =====
-- Only admins edit profiles ("admin edits profiles"), so nobody can make themselves a mentor.
alter table public.profiles add column if not exists mentor boolean not null default false;
grant select (mentor) on public.profiles to authenticated;

-- Mentors, admins, and anyone who leads a subsystem of an active robot or a Calendar group.
create or replace function public.can_steamlab() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and not p.banned and (
      p.is_admin or p.mentor
      or exists (select 1 from public.subsystems s join public.robots r on r.id = s.robot_id where s.lead_id = p.id and not r.archived)
      or exists (select 1 from public.cal_groups g where g.lead_id = p.id)
    )
  )
$$;
revoke all on function public.can_steamlab() from public, anon;
grant execute on function public.can_steamlab() to authenticated;

-- ===== Recaps =====
-- One row per day and scope: 'team', or a subsystem's id. Written only by the steamlab-recap
-- function (service role); everyone who can open SteamLab reads every recap.
create table if not exists public.steamlab_recaps (
  id bigserial primary key,
  day date not null,
  scope text not null,
  headline text not null,
  paragraphs jsonb not null default '[]',
  look jsonb not null default '[]',
  events int not null default 0,
  model text,
  created_at timestamptz not null default now(),
  unique (day, scope)
);
alter table public.steamlab_recaps enable row level security;
drop policy if exists "steamlab reads recaps" on public.steamlab_recaps;
create policy "steamlab reads recaps" on public.steamlab_recaps for select to authenticated using (public.can_steamlab());

-- ===== The nightly run =====
-- The function is deployed without JWT checks (cron has no user token), so the run carries a key
-- kept in Vault. The function checks it with steamlab_key_ok(), which only the service role can call.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'steamlab_cron') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'steamlab_cron', 'SteamLab: key the nightly recap run sends');
  end if;
end $$;

create or replace function public.steamlab_key_ok(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'steamlab_cron' and decrypted_secret = k)
$$;
revoke all on function public.steamlab_key_ok(text) from public, anon, authenticated;
grant execute on function public.steamlab_key_ok(text) to service_role;

-- 00:00 UTC is 02:00 in Israel in winter (03:00 after the clocks change in late March).
-- The function recaps the day before, Israel time, and skips a day with no activity.
create or replace function public.steamlab_run() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/steamlab-recap',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-steamlab-key', (select decrypted_secret from vault.decrypted_secrets where name = 'steamlab_cron' limit 1)
    ),
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.steamlab_run() from public, anon, authenticated;

select cron.unschedule('steamlab-recap') where exists (select 1 from cron.job where jobname = 'steamlab-recap');
select cron.schedule('steamlab-recap', '0 0 * * *', 'select public.steamlab_run()');

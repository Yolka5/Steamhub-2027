-- The Claude gateway (ONSHAPE.md phase 4): what the `claude` edge function writes and reads.
--   ai_calls        every request, with its tokens and cost; also the source of the daily caps
--   part_reviews    what Claude noticed on a part's drawing or route, one row per part
--   reject_reports  the grouped report on parts the workshop sent back, one per subsystem
-- Safe to run before the code is deployed.

create table if not exists public.ai_calls (
  id bigserial primary key,
  user_id uuid references public.profiles on delete set null,
  feature text not null,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric not null default 0,
  ok boolean not null default true,
  at timestamptz not null default now()
);
create index if not exists ai_calls_user on public.ai_calls (user_id, at desc);
alter table public.ai_calls enable row level security;
drop policy if exists "admin reads ai calls" on public.ai_calls;
create policy "admin reads ai calls" on public.ai_calls for select to authenticated using (public.is_admin() or public.is_captain());

-- `sig` is the part's geometry when Claude looked. A changed part has a new sig, so it's looked at again.
-- `dismissed` holds the text of findings someone waved off; they stay gone.
create table if not exists public.part_reviews (
  part_id uuid primary key references public.parts on delete cascade,
  sig text,
  findings jsonb not null default '[]',
  dismissed jsonb not null default '[]',
  model text,
  reviewed_at timestamptz not null default now()
);
alter table public.part_reviews enable row level security;
drop policy if exists "members read part reviews" on public.part_reviews;
create policy "members read part reviews" on public.part_reviews for select to authenticated using (public.is_member());
drop policy if exists "members dismiss part reviews" on public.part_reviews;
create policy "members dismiss part reviews" on public.part_reviews for update to authenticated using (public.is_member()) with check (public.is_member());

-- items: [{ part_id, part_no, name, note (the lead's words), by, at, why, fix, stock }]
create table if not exists public.reject_reports (
  id bigserial primary key,
  subsystem_id uuid not null references public.subsystems on delete cascade,
  headline text not null,
  items jsonb not null default '[]',
  model text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles on delete set null
);
create index if not exists reject_reports_sub on public.reject_reports (subsystem_id, created_at desc);
alter table public.reject_reports enable row level security;
drop policy if exists "members read reject reports" on public.reject_reports;
create policy "members read reject reports" on public.reject_reports for select to authenticated using (public.is_member());
drop policy if exists "members close reject reports" on public.reject_reports;
create policy "members close reject reports" on public.reject_reports for update to authenticated using (public.is_member()) with check (public.is_member());

-- When this reject was put in a report. A part rejected again later is reported again.
alter table public.parts add column if not exists reject_reported_at timestamptz;
-- Rejects from before this feature were already pushed the old way.
update public.parts set reject_reported_at = now() where rejected_note is not null and reject_reported_at is null;

-- ===== The 5-minute run =====
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'claude_cron') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'claude_cron', 'Claude gateway: key the reject-report run sends');
  end if;
end $$;

create or replace function public.claude_key_ok(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'claude_cron' and decrypted_secret = k)
$$;
revoke all on function public.claude_key_ok(text) from public, anon, authenticated;
grant execute on function public.claude_key_ok(text) to service_role;

-- Calls the function only when a reject has waited ten minutes, so a quiet day costs nothing.
create or replace function public.claude_rejects_run() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.parts
    where rejected_note is not null and rejected_at is not null and released_at is null
      and rejected_at < now() - interval '10 minutes'
      and (reject_reported_at is null or reject_reported_at < rejected_at)
  ) then
    return;
  end if;
  perform net.http_post(
    url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/claude',
    body := '{"feature":"reject_reports"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-claude-key', (select decrypted_secret from vault.decrypted_secrets where name = 'claude_cron' limit 1)
    ),
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.claude_rejects_run() from public, anon, authenticated;

select cron.unschedule('claude-rejects') where exists (select 1 from cron.job where jobname = 'claude-rejects');
select cron.schedule('claude-rejects', '*/5 * * * *', 'select public.claude_rejects_run()');
-- To pause the reports: select cron.unschedule('claude-rejects');

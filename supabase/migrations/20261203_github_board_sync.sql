-- The GitHub sync follows Programming's Project board (github.com/orgs/frc1577/projects/3), so the
-- 15-minute timer runs when a board or a repo is saved.
select cron.unschedule('github-sync') where exists (select 1 from cron.job where jobname = 'github-sync');
select cron.schedule(
  'github-sync',
  '*/15 4-21 * * *',
  $$select net.http_post(
      url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/github-sync',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    )
    where exists (select 1 from public.settings where key = 'github' and (coalesce(value->>'repo', '') <> '' or coalesce(value->>'project', '') <> ''))$$
);
insert into public.settings (key, value, updated_at)
values ('github', '{"project": "https://github.com/orgs/frc1577/projects/3", "repo": null}'::jsonb, now())
on conflict (key) do update set value = public.settings.value || excluded.value, updated_at = now();

-- Calendar v2, second part (CALENDAR_V2_PLAN.md).
--   1. GitHub: every 15 minutes in the day (about 06:00 to 24:00 Israel time) as a safety net for the
--      webhook. The function does nothing until an admin saves the repo in Calendar → Import and the
--      key is in Supabase (GITHUB_TOKEN). Unchanged answers cost nothing against GitHub's limit.
--   2. Comment notifications link straight to the comments: /calendar?comments=<kind>:<id>.

select cron.unschedule('github-sync') where exists (select 1 from cron.job where jobname = 'github-sync');
select cron.schedule(
  'github-sync',
  '*/15 4-21 * * *',
  $$select net.http_post(
      url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/github-sync',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    )
    where exists (select 1 from public.settings where key = 'github' and value ? 'repo')$$
);

create or replace function public.comment_target(k text, t uuid, out group_id uuid, out label text, out link text)
language plpgsql stable security definer set search_path = public as $$
begin
  if k = 'task' then
    select x.group_id, x.title into group_id, label from public.tasks x where x.id = t;
  elsif k = 'group' then
    select x.id, x.name into group_id, label from public.cal_groups x where x.id = t;
  elsif k = 'list' then
    select x.group_id, g.name || ' · ' || x.name into group_id, label from public.cal_lists x join public.cal_groups g on g.id = x.group_id where x.id = t;
  elsif k = 'phase' then
    select x.group_id, g.name || ' · ' || x.name into group_id, label from public.cal_phases x join public.cal_groups g on g.id = x.group_id where x.id = t;
  elsif k = 'event' then
    select x.group_id, x.title into group_id, label from public.events x where x.id = t;
  end if;
  label := coalesce(label, 'the Calendar');
  link := '/calendar?comments=' || k || ':' || t;
end $$;
revoke all on function public.comment_target(text, uuid) from public, anon, authenticated;

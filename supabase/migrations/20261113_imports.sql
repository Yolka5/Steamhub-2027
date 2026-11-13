-- Imports into the Calendar (CALENDAR.md).
--  - Google Calendar: events read from the calendar's secret iCal address every hour by the
--    ical-sync function. source/source_uid say where an event came from, so a sync updates it in place.
--  - Monday: tasks from a board's Excel export. import_key is the Monday board, group and item, so
--    importing the same export again updates those tasks instead of adding them twice.

alter table public.events add column if not exists source text;
alter table public.events add column if not exists source_uid text;
create unique index if not exists events_source_uid on public.events (source, source_uid);

alter table public.tasks add column if not exists import_key text;
create unique index if not exists tasks_import_key on public.tasks (import_key);

-- Every hour, a few minutes past, read the Google Calendar again. The function does nothing until
-- an admin saves the link in Calendar → Import.
select cron.unschedule('google-calendar') where exists (select 1 from cron.job where jobname = 'google-calendar');
select cron.schedule(
  'google-calendar',
  '7 * * * *',
  $$select net.http_post(
      url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/ical-sync',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    )$$
);

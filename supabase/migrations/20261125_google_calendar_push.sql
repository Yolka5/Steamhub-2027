-- Google Calendar both ways (CALENDAR.md, "Google Calendar"). Google to Steamhub is ical-sync, every
-- hour. Steamhub to Google is gcal-push: events made in Steamhub (source is null) are written into
-- the team calendar through a Google service account, right after each change. Each side edits its
-- own events: Google's come in read-only, Steamhub's are only changed from Steamhub.

alter table public.events add column if not exists google_id text;
-- Changed since it was last written to Google.
alter table public.events add column if not exists google_dirty boolean not null default false;

-- Google ids of Steamhub events deleted here, so gcal-push deletes them in Google too.
create table if not exists public.gcal_trash (
  google_id text primary key,
  at timestamptz not null default now()
);
alter table public.gcal_trash enable row level security;
-- No policies: only the edge function (service role) reads and writes it.

create or replace function public.gcal_poke() returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/gcal-push',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then null; -- a failed poke waits for the next change or the hourly run
end $$;

create or replace function public.events_gcal_mark() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.source is null and old.google_id is not null then
      insert into public.gcal_trash (google_id) values (old.google_id) on conflict do nothing;
    end if;
    return old;
  end if;
  if new.source is not null then return new; end if;
  -- Only a change Google would show marks it: not gcal-push writing google_id back.
  if tg_op = 'INSERT' or (new.title, new.kind, new.group_id, new.starts_at, new.ends_at, new.all_day, new.repeat_days, new.repeat_until, new.skip_days, new.notes)
      is distinct from (old.title, old.kind, old.group_id, old.starts_at, old.ends_at, old.all_day, old.repeat_days, old.repeat_until, old.skip_days, old.notes) then
    new.google_dirty := true;
  end if;
  return new;
end $$;
drop trigger if exists events_gcal_mark on public.events;
create trigger events_gcal_mark before insert or update or delete on public.events for each row execute function public.events_gcal_mark();

create or replace function public.events_gcal_poke() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only when sending is on and there's something to send (gcal-push clearing google_dirty is not).
  -- Sending is turned on from the Import page: settings 'google_calendar_push' {on: true}.
  -- gcal-push's own writes (service role) never call it again.
  if coalesce(auth.role(), '') <> 'service_role'
     and exists (select 1 from public.settings where key = 'google_calendar_push' and (value->>'on')::boolean)
     and (exists (select 1 from public.events where google_dirty) or exists (select 1 from public.gcal_trash)) then
    perform public.gcal_poke();
  end if;
  return null;
end $$;
drop trigger if exists events_gcal_poke on public.events;
-- Once per statement, so a batch of changes is one call.
create trigger events_gcal_poke after insert or update or delete on public.events for each statement execute function public.events_gcal_poke();

-- Every hour as well, in case a call was missed.
select cron.unschedule('google-calendar-push') where exists (select 1 from cron.job where jobname = 'google-calendar-push');
select cron.schedule('google-calendar-push', '37 * * * *', $$select public.gcal_poke()$$);

-- Events gcal-push wrote come back in the iCal feed as <google id>@google.com. They're Steamhub's
-- own already, so ical-sync's insert of them is dropped here.
create or replace function public.events_skip_google_echo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'google' and new.source_uid is not null
     and exists (select 1 from public.events e where e.source is null and e.google_id = split_part(split_part(new.source_uid, '@', 1), '#', 1)) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists events_skip_google_echo on public.events;
create trigger events_skip_google_echo before insert on public.events for each row execute function public.events_skip_google_echo();

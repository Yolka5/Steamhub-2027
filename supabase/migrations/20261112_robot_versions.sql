-- Robot versions for the season card on Home (PLAN.md, "Season card"): V1, V2… of a season.
-- Test and practice robots have none, so they never count as the season's robot. One V1 per
-- season, so two people tapping Set up V1 at kickoff can't make two.

alter table public.robots add column if not exists version int check (version > 0);
create unique index if not exists robots_season_version on public.robots (season, version) where version is not null;

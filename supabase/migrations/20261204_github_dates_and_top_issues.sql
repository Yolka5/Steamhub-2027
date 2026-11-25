-- GitHub issues on the Gantt (2026-11-25).
-- Most of Programming's issues have no dates in GitHub. gh_dated says whether GitHub gave this one
-- dates: when it did, GitHub's dates win and the bar is locked; when it didn't, anyone can place and
-- drag it in Steamhub and the sync leaves those dates alone.
-- The sync also stops bringing in sub-issues and strips the "[offseason Project]:" tag from titles.
alter table public.tasks add column if not exists gh_dated boolean not null default false;
update public.tasks set gh_dated = (starts_on is not null or due_on is not null) where source = 'github';

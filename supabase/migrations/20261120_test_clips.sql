-- A prototype test can hold more than one video. The first clip stays in the old columns
-- (video_path, poster_path, video_link, duration_s, video_size), so covers, Compare and the
-- season summary keep working unchanged. Every clip after the first goes in more_videos:
-- [{ "path", "poster", "link", "duration_s", "size" }, ...], a file (path) or a link, never both.

alter table public.prototype_tests add column if not exists more_videos jsonb not null default '[]';

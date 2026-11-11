-- Home's team activity shows workshop moments (started, finished, urgent, missing) live,
-- so part_events joins the realtime publication like piece_events.
alter publication supabase_realtime add table public.part_events;

-- The plate sheet and Steamhub are both kept, so the sync merges end mill counts instead of
-- replacing them: sheet_qty is what the sheet said at the last sync, and a sync applies only the
-- sheet's change since then. Today's counts came straight from the sheet, so they start equal.
alter table public.end_mills add column if not exists sheet_qty integer;
update public.end_mills set sheet_qty = qty where sheet_qty is null;

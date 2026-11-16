-- Plates restock: the team counts every plate and end mill again from scratch.
--  - Plates get an optional photo, like tube stock.
--  - Wood joins Aluminum and Polycarb (material is free text, nothing to change).
--  - All plates and end mills are cleared. Parts that remembered their plate lose the link (on delete set null).
--  - The old sheet is detached; its link is kept as previous_url in case it's ever needed.

alter table public.plates add column if not exists photo_url text;

delete from public.plates;
delete from public.end_mills;

update public.settings
set value = (value - 'synced_at' - 'synced_by' - 'merges') || jsonb_build_object('url', '', 'previous_url', value->>'url'),
    updated_at = now()
where key = 'plate_sheet';

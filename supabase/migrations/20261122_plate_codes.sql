-- Plates get a number written on them, like tube stock: AL-001, PC-001, WD-001, one counter per
-- material. The app shows the next one before saving; the unique index catches two people saving
-- the same number at once, and the app then asks for the next free one.

alter table public.plates add column if not exists code text;
create unique index if not exists plates_code on public.plates (code);

create or replace function public.next_plate_code(prefix text)
returns text
language sql
stable
set search_path to ''
as $$
  select prefix || '-' || lpad((coalesce(max(substring(code from '\d+$')::int), 0) + 1)::text, 3, '0')
  from public.plates where code like prefix || '-%';
$$;

grant execute on function public.next_plate_code(text) to authenticated;

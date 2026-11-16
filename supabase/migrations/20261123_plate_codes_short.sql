-- Plate numbers are short, no dash: AL01, PC01, WD01 (AL100 after AL99).
create or replace function public.next_plate_code(prefix text)
returns text
language sql
stable
set search_path to ''
as $$
  select prefix || lpad((coalesce(max(substring(code from '\d+$')::int), 0) + 1)::text, 2, '0')
  from public.plates where code ~ ('^' || prefix || '\d+$');
$$;

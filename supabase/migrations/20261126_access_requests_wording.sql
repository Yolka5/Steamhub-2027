-- The whole team gets the Steamhub link at once, and most of them aren't on the list yet. They
-- aren't joining the team, they're asking for access, so the admin's notification says that.
-- Same function as 20261117_join_requests.sql, with two changes:
--   * the flood guard goes from 20 to 150 new requests an hour, so a whole-team rush gets through;
--   * the note is no longer sent from the form (it stays an optional argument for older clients).

create or replace function public.request_join(p_email text, p_name text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  n text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  note text := nullif(left(trim(coalesce(p_note, '')), 200), '');
  norm text;
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 120 then return 'bad_email'; end if;
  if length(n) < 2 or length(n) > 60 then return 'bad_name'; end if;
  norm := public.norm_email(e);

  -- Already asked (whatever the answer was), or already on the list: say the same thing and do nothing.
  if exists (select 1 from public.join_requests where email = norm)
     or exists (select 1 from public.allowed_emails where email = norm) then
    return 'sent';
  end if;
  -- A flood guard: this is open to anyone, so it stops at 150 new requests an hour (more than the
  -- whole team, so a rush the day the link goes out still gets through).
  if (select count(*) from public.join_requests where created_at > now() - interval '1 hour') >= 150 then
    return 'busy';
  end if;

  insert into public.join_requests (email, shown_email, name, note) values (norm, e, n, note);
  insert into public.notifications (user_id, kind, text, link)
  select p.id, 'join_request', n || ' (' || e || ') asked for access to Steamhub', '/people'
  from public.profiles p where p.is_admin and not p.banned;
  return 'sent';
end $$;
revoke all on function public.request_join(text, text, text) from public;
grant execute on function public.request_join(text, text, text) to anon, authenticated;

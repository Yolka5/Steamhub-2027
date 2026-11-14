-- Asking to join: someone whose Google account isn't on the list (signin_allowlist) can send the
-- admin a request from the sign-in screen. The admin approves it in People → Who can join, which
-- adds the email to allowed_emails, and the person signs in again.
--
-- The request comes from someone with no account, so it goes through one function that anyone can
-- call. It stores a name, an email and a short note, nothing else. It never says whether an email
-- is already on the list, so it can't be used to find out who is on the team.

create table if not exists public.join_requests (
  id bigserial primary key,
  -- Normalized like allowed_emails (norm_email), so one person can't queue up twice.
  email text not null unique,
  -- As they typed it, for the admin to read.
  shown_email text not null,
  name text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles on delete set null
);

alter table public.join_requests enable row level security;
drop policy if exists "admin reads join requests" on public.join_requests;
create policy "admin reads join requests" on public.join_requests for select to authenticated using (public.is_admin() or public.is_captain());

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
  -- A flood guard: this is open to anyone, so it stops at 20 new requests an hour.
  if (select count(*) from public.join_requests where created_at > now() - interval '1 hour') >= 20 then
    return 'busy';
  end if;

  insert into public.join_requests (email, shown_email, name, note) values (norm, e, n, note);
  insert into public.notifications (user_id, kind, text, link)
  select p.id, 'join_request', n || ' (' || e || ') asked to join Steamhub', '/people'
  from public.profiles p where p.is_admin and not p.banned;
  return 'sent';
end $$;
revoke all on function public.request_join(text, text, text) from public;
grant execute on function public.request_join(text, text, text) to anon, authenticated;

-- The admin's answer. Approving puts the email on the list; declining just closes the request.
create or replace function public.decide_join(p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.join_requests;
begin
  if not public.is_admin() then
    raise exception 'Only an admin answers join requests' using errcode = 'P0001';
  end if;
  select * into r from public.join_requests where id = p_id;
  if not found then return; end if;
  if p_ok then
    insert into public.allowed_emails (email, added_by) values (r.email, auth.uid()) on conflict (email) do nothing;
  end if;
  update public.join_requests set status = case when p_ok then 'approved' else 'declined' end, decided_at = now(), decided_by = auth.uid() where id = p_id;
end $$;
revoke all on function public.decide_join(bigint, boolean) from public, anon;
grant execute on function public.decide_join(bigint, boolean) to authenticated;

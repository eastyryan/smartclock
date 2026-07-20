-- =========================================================================
-- SmartClock — fix slow PIN verification
--
-- Paste into: Supabase dashboard -> SQL Editor -> New query -> Run.
-- Safe to run any time. Replaces one function; changes no data.
--
-- THE PROBLEM
--
-- verify_employee_pin was written as a single SQL statement:
--
--   select e.name from public.employees e
--   where lower(e.name) = lower(p_name)
--     and e.is_active
--     and e.pin_hash is not null
--     and e.pin_hash = crypt(p_pin, e.pin_hash);
--
-- Postgres is free to evaluate those AND-ed conditions in any order, and it
-- chose to run crypt() across the whole table rather than filtering by name
-- first. With 22 hashed employees that is 22 bcrypt hashes per login attempt.
--
-- Measured against production: one login took 1.9s at the RPC and ~2.1s
-- end-to-end. Ten simultaneous logins took ~9s each; twenty-one exceeded the
-- function timeout and returned 503. That is exactly the 7am scenario — the
-- whole crew clocking in at once — so it would have failed on the first real
-- morning of use.
--
-- THE FIX
--
-- Fetch the single matching row first, then hash exactly once. One bcrypt per
-- attempt instead of one per employee, and it no longer degrades as the roster
-- grows.
--
-- Note this does introduce a timing difference between "no such employee"
-- (returns immediately) and "wrong PIN" (one bcrypt). That is not a meaningful
-- leak here: the employee list is already public in the clock-in dropdown, so
-- there is no secret in whether a name exists.
-- =========================================================================

create or replace function public.verify_employee_pin(p_name text, p_pin text)
returns table (name text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text;
  v_hash text;
begin
  select e.name, e.pin_hash
    into v_name, v_hash
  from public.employees e
  where lower(e.name) = lower(p_name)
    and e.is_active
    and e.pin_hash is not null
  limit 1;

  if v_hash is null then
    return;                       -- unknown or inactive employee
  end if;

  if v_hash = crypt(p_pin, v_hash) then
    name := v_name;
    return next;
  end if;
end;
$$;

revoke all on function public.verify_employee_pin(text, text) from public, anon, authenticated;
grant execute on function public.verify_employee_pin(text, text) to service_role;

-- verify_manager_pin is left alone deliberately. It takes only a PIN, so it
-- genuinely has to test every active manager — but there are two of them, so
-- that is two bcrypts, not twenty-two.

-- Verify it still works (should return one row):
--   select * from public.verify_employee_pin('Adrian', '3847');
-- And still rejects (should return zero rows):
--   select * from public.verify_employee_pin('Adrian', '0000');

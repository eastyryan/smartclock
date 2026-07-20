-- =========================================================================
-- SmartClock — PHASE B: THE SECURITY FIX
--
-- *** DO NOT RUN THIS UNTIL THE NEW SERVER ROUTES ARE DEPLOYED. ***
--
-- It revokes anon access completely. Any client still talking to PostgREST
-- directly stops working the moment it runs — which is the point, but it means
-- the new code must already be live.
--
-- Verified against production on 2026-07-19, BEFORE this migration:
--   anon SELECT on clock_events  -> 200, returned rows
--   anon PATCH  on clock_events  -> 204 (accepted)
--   anon DELETE on job_sites     -> 204 (accepted)
--
-- The anon key ships in the browser bundle, so anyone loading the site could
-- read every timesheet, approve their own hours, or delete the job site list
-- from the console. The PIN screens only gated which React component rendered;
-- they never gated data.
--
-- Afterwards, anon has no access to any application table. Every read and
-- write goes through a route handler that authorizes the caller's session
-- cookie and then uses the service-role key, which bypasses RLS by design.
-- =========================================================================

-- Drop every existing policy. Names are unknown for the tables created by hand
-- in the dashboard, so enumerate rather than guess.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('clock_events','job_sites','employees','managers',
                        'eod_checklists','clock_event_audit','auth_attempts',
                        'photo_uploads','time_entries')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    raise notice 'dropped policy % on %', p.policyname, p.tablename;
  end loop;
end $$;

-- RLS enabled with zero policies == deny all for anon and authenticated.
-- service_role bypasses RLS and is only ever used server-side.
-- photo_uploads and time_entries are empty legacy tables; locked rather than
-- dropped, since dropping is irreversible and they cost nothing to leave.
do $$
declare t text;
begin
  foreach t in array array['clock_events','job_sites','employees','managers',
                           'eod_checklists','clock_event_audit','auth_attempts',
                           'photo_uploads','time_entries']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;

-- Stop future tables in this schema being world-accessible by default.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- -------------------------------------------------------------------------
-- Confirm the hole is closed. From a terminal, with the ANON key:
--
--   curl -s -o /dev/null -w '%{http_code}\n' -X PATCH \
--     "$URL/rest/v1/clock_events?id=eq.00000000-0000-0000-0000-000000000000" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H "Content-Type: application/json" -d '{"status":"approved"}'
--
-- Before this migration: 204 (accepted).  After: expect 401 or 403.
-- -------------------------------------------------------------------------

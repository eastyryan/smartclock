-- =========================================================================
-- SmartClock — digest send log (fixes silently-missed digests)
--
-- Paste into: Supabase dashboard -> SQL Editor -> New query -> Run.
-- Safe to run any time; purely additive.
--
-- WHY THIS EXISTS
--
-- The digest handler used to decide "is it time to send?" and "have I already
-- sent?" from the same fact: the current Toronto wall clock. A ~20 minute
-- window per slot was the trigger AND the deduplication.
--
-- That silently broke. GitHub Actions does not fire scheduled workflows
-- punctually — observed delays on 2026-07-21 were 44, 56, 89 and 112 minutes.
-- Every run landed outside its window, returned HTTP 200 with
-- {"skipped": true}, and sent nothing. Actions showed four green checkmarks
-- for a day on which no digest was delivered.
--
-- Splitting the two concerns fixes it: the handler now accepts a wide window
-- (hours, not minutes) so a late fire still sends, and THIS TABLE guarantees
-- exactly one send per slot per day no matter how many times it fires.
--
-- The primary key is the whole mechanism. The route inserts before sending;
-- if the insert conflicts, some earlier run already claimed that slot and this
-- one returns without sending.
-- =========================================================================

create table if not exists public.digest_sends (
  -- Toronto calendar day, YYYY-MM-DD. Not a timestamp: the question is
  -- "did Tuesday's evening digest go out", which is a local-day question.
  date_key   text not null,
  kind       text not null check (kind in ('morning', 'evening')),
  claimed_at timestamptz not null default now(),
  -- Populated after delivery is attempted, so this doubles as the audit trail
  -- that was missing while the digests were failing: {"email": 1, "sms": 0}.
  result     jsonb,

  primary key (date_key, kind)
);

-- Same posture as every other table (see 0002): RLS on, anon and authenticated
-- revoked entirely. The app reaches this only through the service-role client
-- in server routes, never from the browser.
alter table public.digest_sends enable row level security;
revoke all on public.digest_sends from anon, authenticated;

-- Verify — after the next 9:30 AM or 6 PM slot there should be a row:
--   select * from public.digest_sends order by claimed_at desc limit 10;

-- To force a re-send of a slot (e.g. after fixing a bad send), delete its row
-- and trigger the workflow; the next fire will re-claim it:
--   delete from public.digest_sends where date_key = '2026-07-21' and kind = 'evening';

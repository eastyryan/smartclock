-- =========================================================================
-- SmartClock — enable SMS digests via Twilio
--
-- Paste into: Supabase dashboard -> SQL Editor -> New query -> Run.
-- Safe to run any time; purely additive.
--
-- Background: managers.phone has existed since 0001, added for an SMS plan
-- that died when every free route into Canadian mobiles closed (see the note
-- in 0004_manager_email.sql). Twilio is the paid route, so the column is
-- finally load-bearing.
--
-- The digest route sends to whichever channels a manager has filled in:
--   email set only  -> email
--   phone set only  -> SMS
--   both set        -> both, dispatched independently
-- So setting a phone here ADDS a text; it does not stop the email.
--
-- Format is forgiving — the app normalizes to E.164 before calling Twilio, so
-- '905-555-0123', '(905) 555-0123' and '+19055550123' all work. Anything that
-- cannot be read as a North American number is skipped and logged rather than
-- billed.
-- =========================================================================

-- >>> Replace with Nick's actual mobile before running. <<<
update public.managers
   set phone = '905-555-0123'
 where name = 'Nick Dean';

-- Verify — Nick should now have both an email and a phone:
--   select name, email, phone, is_active from public.managers order by name;

-- To stop the texts later without touching code or redeploying:
--   update public.managers set phone = null where name = 'Nick Dean';

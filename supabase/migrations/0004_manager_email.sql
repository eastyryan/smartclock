-- =========================================================================
-- SmartClock — manager digest recipients
--
-- Paste into: Supabase dashboard -> SQL Editor -> New query -> Run.
-- Safe to run any time; purely additive.
--
-- The managers table has `phone` (added for the SMS plan) but no `email`.
-- SMS turned out to be unavailable for free in Canada — Rogers decommissioned
-- its email-to-SMS gateway, Telus blocks it, Textbelt geo-blocks Canada, and
-- GC Notify is government-only — so the digests go out by email instead.
--
-- Recipients live here rather than in code, so changing who gets the 9:30 AM
-- and 6 PM digests is one UPDATE, not a deploy.
-- =========================================================================

alter table public.managers add column if not exists email text;

-- Only Nick receives the digests, as requested.
update public.managers set email = 'deanryans@rogers.com' where name = 'Nick Dean';

-- Verify — Nick should have an email, Jake should be null:
--   select name, email, phone, is_active from public.managers order by name;

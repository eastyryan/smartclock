-- =========================================================================
-- SmartClock — PHASE C: drop the plaintext PIN columns
--
-- Run ONLY after employees and managers have logged in successfully against
-- the hashed values. Kept as a separate step precisely so the plaintext
-- survives long enough to fall back on if hashing turns out misconfigured.
--
-- Check first — every active person should show hashed = true:
--   select name, pin_hash is not null as hashed from public.employees where is_active;
--   select name, pin_hash is not null as hashed from public.managers  where is_active;
-- =========================================================================

alter table public.employees drop column if exists pin;
alter table public.managers  drop column if exists pin;

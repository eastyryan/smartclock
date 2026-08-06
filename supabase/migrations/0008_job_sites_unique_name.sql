-- OPTIONAL. Two job sites sharing a name are indistinguishable in the clock-in
-- dropdown. The /api/sites POST route already turns the resulting 23505 into a
-- clear 409 message — this index is what makes that fire.
--
-- Run once in the Supabase SQL editor. If it errors, two existing sites already
-- share a name (case-insensitively) — rename or remove one first, then re-run.
create unique index if not exists job_sites_name_unique
  on public.job_sites (lower(name));

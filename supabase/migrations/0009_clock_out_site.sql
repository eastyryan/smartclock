-- =========================================================================
-- Clock-out job site
--
-- Crews often finish at a different site than they started. Store which
-- active site the GPS match resolved to (or the nearest site when outside
-- every fence), so digests and history can say where they clocked out and
-- how far they were from that site — not only the clock-in site_name.
-- =========================================================================

alter table public.clock_events
  add column if not exists clock_out_site_id   bigint,
  add column if not exists clock_out_site_name text;

comment on column public.clock_events.clock_out_site_id is
  'Job site the clock-out GPS matched (inside fence), or nearest site when outside all. NULL if no usable fix.';
comment on column public.clock_events.clock_out_site_name is
  'Denormalised name of clock_out_site_id at punch time.';
comment on column public.clock_events.clock_out_distance_m is
  'Distance in metres from the employee fix to clock_out_site (or nearest site).';
comment on column public.clock_events.clock_out_within_fence is
  'NULL = no usable GPS. true = inside any active site radius. false = confidently outside every active site.';

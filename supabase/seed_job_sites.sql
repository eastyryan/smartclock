-- Job site seed for a fresh environment.
--
-- Previously this list lived in src/app/page.tsx and the browser inserted it
-- whenever job_sites came back empty — a client-side write that two phones
-- opening simultaneously would both perform.
--
-- Safe to re-run: existing ids are left untouched.

insert into public.job_sites (id, name, address, lat, lng, radius, active)
values
  (1, 'The Shop', '4271 Greenbank Rd, Ottawa, ON', 45.2241, -75.7186, 359, true),
  (2, 'Navaho', '8 Deerfield Dr, Ottawa, ON', 45.3559, -75.7520, 359, true),
  (3, 'Skyline', '42 Northview Rd, Ottawa, ON', 45.3629, -75.7296, 359, true),
  (4, 'Meadowlands', '1242 Meadowlands Dr E, Ottawa, ON', 45.35909125246288, -75.72347435767033, 1000, true),
  (5, 'Craig Henry', '269E Craig Henry Dr, Ottawa, ON', 45.33510047434069, -75.76491428943284, 550, true),
  (6, 'Walkley', '550 Reardon Pvt, Ottawa, ON', 45.3758, -75.6483, 359, true),
  (7, 'Beaconwood', '2012 Beaconwood Dr, Ottawa, ON', 45.4474, -75.5971, 359, true),
  (8, 'Forestview', '651 Woodcliffe Pvt, Ottawa, ON', 45.4619, -75.5386, 359, true),
  (9, 'Aspenview', '1628 Teakdale Ave, Ottawa, ON', 45.4517, -75.5265, 359, true),
  (10, 'Castle Hill', '1000 Castle Hill Cres, Ottawa, ON', 45.3696, -75.7454, 359, true),
  (11, 'Jubilee', '24 Rutlege St, Ottawa, ON', 45.27937109543332, -75.7140484165026, 359, true),
  (12, 'Timberline', '25 Alpenglow Private, Ottawa, ON', 45.27572462629332, -75.71053090588975, 359, true)
on conflict (id) do nothing;

-- Keep the identity sequence ahead of the seeded ids.
select setval(
  pg_get_serial_sequence('public.job_sites', 'id'),
  greatest((select max(id) from public.job_sites), 1)
);

-- End of Day Checklist storage for SmartClock.
-- Run this ONCE in the Supabase dashboard → SQL Editor → New query → Run.

create table if not exists public.eod_checklists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_name text not null,
  vehicle text not null,
  -- Truck inspection
  no_trash boolean not null default false,
  interior_wipe boolean not null default false,
  bed_blown boolean not null default false,
  gas_level text,
  -- Equipment inspection
  clean_mower boolean not null default false,
  clean_weedwacker boolean not null default false,
  clean_blower boolean not null default false,
  broken_notes text
);

-- Let the app's anon key read history (for the manager export) and insert new checklists.
alter table public.eod_checklists enable row level security;
create policy "eod read"   on public.eod_checklists for select using (true);
create policy "eod insert" on public.eod_checklists for insert with check (true);

-- Optional: live updates so the manager export sees new submissions without a refresh.
alter publication supabase_realtime add table public.eod_checklists;

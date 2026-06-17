-- Employee roster for SmartClock.
-- NOTE: the app currently reads its employee list + PINs from the hardcoded
-- EMPLOYEES array in src/app/page.tsx. This table is a Supabase-side record of
-- the same roster; it is NOT wired into the app yet.
-- Run this ONCE in the Supabase dashboard → SQL Editor → New query → Run.

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  pin text not null,
  active boolean not null default true,
  unique (name),
  unique (pin)
);

-- Seed the current roster (idempotent: re-running won't create duplicates).
insert into public.employees (name, pin) values
  ('Adrian', '3847'),
  ('Antonio Alvarez', '6192'),
  ('Brandy Larabie', '5038'),
  ('Cameron Rice', '7261'),
  ('Carolina Landa', '4915'),
  ('Easton Ryan', '8374'),
  ('Evariste Sindayizeruka', '2659'),
  ('Griffin Kay', '9123'),
  ('Hayden Rice', '1486'),
  ('Isabella Dean', '7530'),
  ('Jonathan Ceballos', '4271'),
  ('Karen Constantino', '8609'),
  ('Levy', '3152'),
  ('Marshal Armah Adjetey (Wally)', '5784'),
  ('Matthew Larkin', '5176'),
  ('Moses Boateng', '6347'),
  ('Satpal Singh', '9058'),
  ('ShonDreya Smardon', '4629'),
  ('Tyrell Anderson', '2813'),
  ('Vanessa Sciampacone', '8041'),
  ('Will Kennedy', '7492')
on conflict (name) do nothing;

-- Let the app's anon key read the roster.
alter table public.employees enable row level security;
create policy "employees read" on public.employees for select using (true);

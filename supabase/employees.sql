-- Employee roster for SmartClock (the `employees` table already exists in Supabase
-- but is RLS-protected, so rows can only be added from the dashboard, not the app key).
--
-- The app reads its employee list + PINs from the hardcoded EMPLOYEES array in
-- src/app/page.tsx, so this table is a Supabase-side mirror of that roster.
--
-- Run this in the Supabase dashboard → SQL Editor → New query → Run.
-- It is safe to re-run: it only inserts people who aren't already present.

-- Make sure the table + read policy exist (no-op if they already do).
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  pin text not null,
  active boolean not null default true
);
alter table public.employees enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'employees' and policyname = 'employees read') then
    create policy "employees read" on public.employees for select using (true);
  end if;
end $$;

-- Seed the full roster. WHERE NOT EXISTS makes this safe regardless of which
-- unique constraints the existing table has, and safe to run repeatedly.
insert into public.employees (name, pin)
select v.name, v.pin
from (values
  ('Adrian', '3847'),
  ('Antonio Alvarez', '6192'),
  ('Brandy Larabie', '5038'),
  ('Cameron Rice', '7261'),
  ('Carolina Landa', '4915'),
  ('Dexter', '6628'),
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
) as v(name, pin)
where not exists (
  select 1 from public.employees e where e.name = v.name
);

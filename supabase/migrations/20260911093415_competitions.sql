-- Competitions the Lineup Builder can build a roster for: each one may fix
-- the number of teams a club sends (a minority — most let the club choose,
-- same as today), fix the team size at 3 instead of 4, and/or restrict
-- eligibility to a max youth age category ("that category or younger").
-- Managed by Jeff via the /admin/competitions screen, not imported from FLTT.

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  max_age_category text,  -- one of lib/age-categories.ts's AGE_CATEGORIES, or null = open to all ages
  fixed_team_count int,   -- null = club chooses, same as today
  team_size int not null default 4,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint competitions_fixed_team_count_check
    check (fixed_team_count is null or fixed_team_count between 1 and 10),
  constraint competitions_team_size_check check (team_size in (3, 4)),
  constraint competitions_max_age_category_check
    check (max_age_category is null or max_age_category in
      ('Poussin', 'Benjamin', 'Minime', 'Cadet', 'Junior', 'Espoirs'))
);

alter table public.competitions enable row level security;

create policy "competitions public read" on public.competitions
  for select
  using (true);

create policy "competitions admin insert" on public.competitions
  for insert
  with check (public.is_admin());

create policy "competitions admin update" on public.competitions
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "competitions admin delete" on public.competitions
  for delete
  using (public.is_admin());

grant select on public.competitions to anon, authenticated;
grant insert, update, delete on public.competitions to authenticated;
grant all on public.competitions to service_role;

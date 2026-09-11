-- How many teams a specific club has entered in a specific competition for a
-- given season — imported from FLTT's published schedule PDFs (see
-- lib/import/team-counts.ts), not hand-entered. Prefills (but doesn't lock)
-- the Lineup Builder's team-count field for competitions where the club
-- chooses how many teams to field.

create table public.competition_club_team_counts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  club text not null,
  season text not null,
  team_count int not null,
  updated_at timestamptz not null default now(),
  constraint competition_club_team_counts_team_count_check
    check (team_count between 1 and 10),
  unique (competition_id, club, season)
);

alter table public.competition_club_team_counts enable row level security;

create policy "competition_club_team_counts public read" on public.competition_club_team_counts
  for select
  using (true);

create policy "competition_club_team_counts admin insert" on public.competition_club_team_counts
  for insert
  with check (public.is_admin());

create policy "competition_club_team_counts admin update" on public.competition_club_team_counts
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "competition_club_team_counts admin delete" on public.competition_club_team_counts
  for delete
  using (public.is_admin());

grant select on public.competition_club_team_counts to anon, authenticated;
grant insert, update, delete on public.competition_club_team_counts to authenticated;
grant all on public.competition_club_team_counts to service_role;

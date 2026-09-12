-- Clubs whose weakest (last) team plays one tier down at a smaller team
-- size than the rest of the competition (e.g. Championnat Seniors is
-- normally 4-man, but a club's team in Division 6 is 3-man). Manually
-- curated by Jeff — no FLTT-published document lists this for the current
-- season, so it isn't reimported/overwritten by the team-count import.

alter table public.competitions
  add column small_last_team_clubs text[] not null default '{}';

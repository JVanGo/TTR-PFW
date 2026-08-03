-- Classement points (FLTT in-class standing, -5,5 to +11,5) for C1-D3 players.
-- Feeds the classement-based TTR estimate for those classes; entered by admins
-- one player at a time until a bulk source exists.

alter table public.players
  add column classement_points numeric(3, 1);

alter table public.players
  add constraint players_classement_points_check
  check (classement_points is null or classement_points between -5.5 and 11.5);

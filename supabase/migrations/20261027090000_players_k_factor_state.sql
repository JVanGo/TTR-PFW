-- The two counters that decide the K of a player's next game, as the season
-- simulation leaves them (see lib/dtr-formula.ts's kFactorFor): rated games
-- played across their whole FLTT career, and games left with the +4
-- returning-player bonus. Written by every simulation run; read by the
-- DTR-Rechner so a picked player gets their exact K. Null until the next run.

alter table public.players
  add column career_matches integer,
  add column returning_bonus_games_left integer,
  add constraint players_career_matches_check
    check (career_matches is null or career_matches >= 0),
  add constraint players_returning_bonus_games_left_check
    check (returning_bonus_games_left is null or returning_bonus_games_left between 0 and 15);

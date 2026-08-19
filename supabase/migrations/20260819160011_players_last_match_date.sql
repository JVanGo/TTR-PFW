-- The most recent date we know this player played a real (non-forfeit)
-- graded match, across their entire known history -- feeds the match-based
-- "inactive" badge on /ranking and the player profile (see
-- DëschTennisRating.pdf's Inaktivitätsabzug), replacing that badge's old
-- roster-based meaning on the ranking page. Populated by the season
-- simulation pipeline (lib/import/ttr-simulation-io.ts), never by an admin
-- action. Null means "no known match ever" -- exempt from the badge, same
-- reasoning as the newcomer K-bonus (nothing to have gone inactive FROM).
-- For a player whose real last match predates our lookback window, this may
-- be a conservative placeholder date rather than their literal last match
-- date -- see staleLastMatchSentinelIso() in ttr-simulation-io.ts. Existing
-- rows are null until the next full season simulation re-run backfills them.

alter table public.players
  add column last_match_date date;

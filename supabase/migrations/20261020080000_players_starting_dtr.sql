-- Admin-entered starting DTR for the season simulation, editable from the
-- admin player form. Replaces adding a new SEASON_START_OVERRIDES code entry
-- (season-start-overrides.ts) for each correction Jeff makes.
--
-- starting_dtr_season records which season the value was entered for: the
-- simulation only applies it when it matches its own SEASON_LABEL, so a
-- correction made for one season can't silently carry into the next at
-- rollover (the same "one-off fix for that season" rule
-- SEASON_START_OVERRIDES follows by being reset each rollover).

alter table public.players
  add column starting_dtr integer,
  add column starting_dtr_season text;

alter table public.players
  add constraint players_starting_dtr_check
  check (starting_dtr is null or starting_dtr between 0 and 3000);

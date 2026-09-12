-- Replaces small_last_team_clubs (a plain club list, implying exactly one
-- smaller trailing team per club) with a club -> count map, since a club
-- can have more than one team playing at the smaller size (e.g. two teams
-- in Division 6 while the rest of Championnat Seniors is 4-man). No real
-- data has been entered into the old column yet, so this is a clean swap,
-- not a data migration.

alter table public.competitions drop column small_last_team_clubs;
alter table public.competitions add column small_last_team_counts jsonb not null default '{}'::jsonb;

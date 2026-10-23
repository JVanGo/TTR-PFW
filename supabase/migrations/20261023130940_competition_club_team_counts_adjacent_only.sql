-- How many of a club's teams (its strongest, i.e. its first N) play in
-- NL1–NL3, where players may only swap with the spot directly above or
-- below instead of the usual DTR-tolerance rule. Imported alongside
-- team_count from the same FLTT schedule PDFs (see lib/import/team-counts.ts).
-- Existing rows default to 0 (no restriction) until the import is re-run.

alter table public.competition_club_team_counts
  add column adjacent_only_team_count int not null default 0,
  add constraint competition_club_team_counts_adjacent_only_check
    check (adjacent_only_team_count between 0 and team_count);

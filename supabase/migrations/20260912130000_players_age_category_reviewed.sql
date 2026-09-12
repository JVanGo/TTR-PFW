-- age_category alone can't tell "confirmed adult" apart from "nobody's
-- checked yet" — both store null. This tracks the latter separately so new
-- players can be surfaced for review (see /admin/newcomers) without ever
-- losing track of one, now that Jeff can't reliably re-run the
-- Export-Members spreadsheet import himself.
--
-- Existing rows are backfilled to true (already covered by a past import, or
-- simply not a newcomer) — only players inserted after this migration start
-- out unreviewed.

alter table public.players
  add column age_category_reviewed boolean not null default false;

update public.players set age_category_reviewed = true;

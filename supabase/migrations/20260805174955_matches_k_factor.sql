-- The Änderungskonstante (K) applied to a graded match (base 16 plus any
-- age/experience/inactivity bonuses, see DëschTennisRating.pdf). Null for
-- tournament-placement bonus rows, which aren't scored via the win/loss
-- formula at all.

alter table public.matches
  add column k_factor integer;

alter table public.matches
  add constraint matches_k_factor_check
  check (k_factor is null or k_factor between 16 and 36);

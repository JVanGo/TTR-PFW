-- Breaks down k_factor into the exact bonuses that produced it, so the
-- player profile can show why a player's Änderungskonstante (K) is what it
-- is instead of just the final number. Nullable in lockstep with k_factor
-- (null for tournament-placement/growth/floor/forfeit rows that aren't
-- scored via the win/loss formula at all).

alter table public.matches
  add column k_age_bonus integer,
  add column k_is_newcomer_bonus boolean,
  add column k_is_returning_bonus boolean;

alter table public.matches
  add constraint matches_k_age_bonus_check
  check (k_age_bonus is null or k_age_bonus in (0, 4, 8));

-- NOT VALID: existing rows predate these columns and won't have a
-- breakdown until the season simulation is next re-run (same "full
-- production re-run" pattern used for previous k_factor-related fixes).
-- The constraint still applies to every row inserted or updated from now on.
alter table public.matches
  add constraint matches_k_breakdown_null_together_check
  check (
    (k_factor is null and k_age_bonus is null and k_is_newcomer_bonus is null and k_is_returning_bonus is null)
    or
    (k_factor is not null and k_age_bonus is not null and k_is_newcomer_bonus is not null and k_is_returning_bonus is not null)
  ) not valid;

alter table public.matches
  add constraint matches_k_breakdown_sums_check
  check (
    k_factor is null
    or k_factor = 16 + k_age_bonus
      + (case when k_is_newcomer_bonus then 4 else 0 end)
      + (case when k_is_returning_bonus then 4 else 0 end)
  );

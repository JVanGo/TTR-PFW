-- The youth growth bonus (Nachwuchs-Spielstärkezuwachs) is dated at the
-- CLOSE of the Teilrunde it rewards — Jan 1 for playing through Aug-Jan
-- ("Hironn"), Aug 1 for playing through Jan-Aug ("Réckronn") — not at some
-- date within that period. The plain month-based half split (Aug-Dec ->
-- hironn, else -> reckronn) was reading that closing date as if it were a
-- play date, which puts BOTH of this bonus's occurrences in the wrong half:
-- the Jan 1 bonus (earned for Hironn) landed in Réckronn, and the Aug 1
-- bonus (earned for Réckronn) landed in Hironn. Confirmed against TRUSHEIM
-- Magnus, whose only 2025-2026 Hironn points turned out to be exactly his
-- Aug-1 growth bonus despite having zero real matches before January.
create or replace view public.player_season_summary as
with halves as (
  select
    player_id,
    season,
    case
      when competition = 'Nachwuchs-Spielstärkezuwachs' then
        case when extract(month from match_date) = 1 then 'hironn' else 'reckronn' end
      when extract(month from match_date) between 8 and 12 then 'hironn'
      else 'reckronn'
    end as half,
    ttr_delta,
    new_ttr,
    match_date,
    -- Mirrors isRealMatchRow() in lib/import/ttr-simulation.ts — keep both in sync.
    upper(competition) not like 'TOU %'
      and upper(competition) <> 'TOU'
      and competition not in (
        'Ersteinstufung-Mindestwert',
        'Nachwuchs-Spielstärkezuwachs',
        'Inaktivitätsabzug'
      ) as is_real_match
  from public.matches
)
select
  player_id,
  season,
  count(*) filter (where is_real_match)::int as matches_played,
  coalesce(sum(ttr_delta) filter (where half = 'hironn'), 0)::int as ttr_change_hironn,
  coalesce(sum(ttr_delta) filter (where half = 'reckronn'), 0)::int as ttr_change_reckronn,
  (
    select new_ttr from public.matches m
    where m.player_id = h.player_id and m.season = h.season
    order by match_date desc, created_at desc
    limit 1
  ) as latest_ttr
from halves h
group by player_id, season;

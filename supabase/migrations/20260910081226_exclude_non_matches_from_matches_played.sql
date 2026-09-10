-- player_season_summary.matches_played was counting every row in `matches`,
-- including the four synthetic adjustment rows the season simulation also
-- writes there (tournament placement bonus, youth growth bonus,
-- Ersteinstufung floor reset, Inaktivitätsabzug) — none of which is a game
-- anyone actually played. ttr_change_hironn/ttr_change_reckronn correctly
-- keep summing every row's ttr_delta (all four are real rating changes),
-- only the played-game count changes here.
create or replace view public.player_season_summary as
with halves as (
  select
    player_id,
    season,
    case
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

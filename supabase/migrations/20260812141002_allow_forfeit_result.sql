-- Allow a match's `result` to record a forfeit ('FF') alongside the existing
-- 'W'/'L' — a forfeited game moves zero rating points for either player and
-- shouldn't count as a "played" match in the season summary.

alter table public.matches
  drop constraint matches_result_check;

alter table public.matches
  add constraint matches_result_check check (result in ('W', 'L', 'FF'));

create or replace view public.player_season_summary as
with halves as (
  select
    player_id,
    season,
    case
      when extract(month from match_date) between 8 and 12 then 'hironn'
      else 'reckronn'
    end as half,
    result,
    ttr_delta,
    new_ttr,
    match_date
  from public.matches
)
select
  player_id,
  season,
  count(*) filter (where result <> 'FF')::int as matches_played,
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

-- One row per player-perspective on a match (two rows per played match).
-- Mirrors the per-player sheet layout in TTR-Saisonentwicklung.xlsx so imports stay simple.

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  match_date date not null,
  competition text not null,
  opponent_name text not null,
  opponent_player_id uuid references public.players(id) on delete set null,
  opponent_ttr integer,
  score text,
  result text not null,
  ttr_delta integer not null,
  new_ttr integer not null,
  season text not null,
  created_at timestamptz not null default now(),
  constraint matches_result_check check (result in ('W','L'))
);

create index matches_player_date_idx on public.matches (player_id, match_date);
create index matches_opponent_idx on public.matches (opponent_player_id);
create index matches_season_idx on public.matches (season);

-- Per-player season summary: one row per (player, season). Cheap to query
-- from the profile page; recomputed on every read so it stays in sync with matches.
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
    match_date
  from public.matches
)
select
  player_id,
  season,
  count(*)::int as matches_played,
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

alter table public.matches enable row level security;

create policy "matches public read" on public.matches
  for select
  using (true);

-- Admin writes are gated on the admin_emails allowlist; policy defined in the
-- admin_emails migration to keep the allowlist logic in one place.

-- Every active player's DTR frozen at the start of a Teilrunde (1 Aug for
-- Teilrunde 1, 1 Jan for Teilrunde 2) — the Verbandsrangliste NL teams must
-- line up by (see lib/lineup.ts's startingOrder). Taken once by
-- scripts/take-verbandsrangliste-snapshot-prod.ts and never recomputed, so
-- later season re-runs don't change it. `club` is frozen too: the club the
-- player was listed for on the day (shown in the downloadable PDF).

create table public.verbandsrangliste_snapshots (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  teilrunde smallint not null,
  player_id uuid not null references public.players(id) on delete cascade,
  dtr int not null,
  club text,
  taken_at timestamptz not null default now(),
  constraint verbandsrangliste_snapshots_teilrunde_check check (teilrunde in (1, 2)),
  unique (season, teilrunde, player_id)
);

alter table public.verbandsrangliste_snapshots enable row level security;

create policy "verbandsrangliste_snapshots public read" on public.verbandsrangliste_snapshots
  for select
  using (true);

create policy "verbandsrangliste_snapshots admin insert" on public.verbandsrangliste_snapshots
  for insert
  with check (public.is_admin());

create policy "verbandsrangliste_snapshots admin update" on public.verbandsrangliste_snapshots
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "verbandsrangliste_snapshots admin delete" on public.verbandsrangliste_snapshots
  for delete
  using (public.is_admin());

grant select on public.verbandsrangliste_snapshots to anon, authenticated;
grant insert, update, delete on public.verbandsrangliste_snapshots to authenticated;
grant all on public.verbandsrangliste_snapshots to service_role;

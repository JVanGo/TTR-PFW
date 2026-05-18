-- Players table: one row per ranked player in the Verbandsrangliste.
-- name_key mirrors the lib/name-key.ts helper (lower(unaccent(name)) with collapsed whitespace),
-- maintained by a trigger because unaccent() is not immutable.

create extension if not exists unaccent;

create or replace function public.normalize_name(input text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(unaccent('unaccent', input), '\s+', ' ', 'g'))
$$;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null,
  class text not null,
  pfw numeric(8,2) not null,
  club text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_class_check check (
    class in ('A1','A2','A3','B1','B2','B3','C1','C2','C3','D1','D2','D3')
  )
);

create index players_name_key_idx on public.players (name_key);
create index players_class_idx on public.players (class);
create index players_club_idx on public.players (club);

create or replace function public.set_player_name_key()
returns trigger
language plpgsql
as $$
begin
  new.name_key = public.normalize_name(new.name);
  return new;
end;
$$;

create trigger players_set_name_key
  before insert or update of name on public.players
  for each row
  execute function public.set_player_name_key();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_set_updated_at
  before update on public.players
  for each row
  execute function public.set_updated_at();

alter table public.players enable row level security;

-- Public can read all players (used by the ranking page and player profiles).
create policy "players public read" on public.players
  for select
  using (true);

-- Admin writes are gated on the admin_emails allowlist. Defined alongside that
-- table's migration so the lookup is co-located with the source of truth.

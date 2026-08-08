-- Kader (national squad) membership for the Lineup Builder's Mannschaftsaufstellung
-- tolerance rule (DëschTennisRating.pdf, p.5-6): Kader players get a wider DTR
-- tolerance (105/120) than regular adults (35/50) or youth (70/85) when checking
-- whether two players can legally swap places in a team lineup.
-- Source: kaderzusammensetzung-november-2025.pdf (A-Kader, Anschlusskader,
-- Aufbaugruppe all count as "Kader" for this rule), matched by player name + club.

alter table public.players
  add column is_kader boolean not null default false;

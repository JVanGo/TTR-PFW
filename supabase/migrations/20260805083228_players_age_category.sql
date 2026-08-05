-- Age category (French FLTT youth classification) for the DTR season simulation:
-- feeds the K-factor age bonus, U17 growth bonus, and Ersteinstufung starting
-- value for brand-new players. Null means adult/Senior (no bonus, 1025 start).
-- Source: Export-Members - 25-26_Espoirs.xlsx, matched by player name.

alter table public.players
  add column age_category text;

alter table public.players
  add constraint players_age_category_check
  check (age_category is null or age_category in (
    'Poussin', 'Benjamin', 'Minime', 'Cadet', 'Junior', 'Espoirs'
  ));

-- Admin tick box "Plays abroad — no inactivity deduction". The DTR rules
-- exempt players with a foreign playing licence ("Spieler mit ausländischer
-- Spielberechtigung") from Inaktivitätsabzug, but FLTT's data has no field
-- for it, so Jeff sets it per player from the admin player form.
--
-- A ticked player is never deducted, always counts as active, and any
-- deduction from the previous season is added back to their carried-forward
-- starting DTR (see ttr-simulation-io.ts).

alter table public.players
  add column inactivity_exempt boolean not null default false;

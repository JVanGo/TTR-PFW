-- The RLS policies on players/matches/admin_emails assume the standard Supabase
-- role grants (anon/authenticated/service_role can touch a table; RLS then
-- decides which rows). This local/prod project was missing those base grants,
-- so every query failed with "permission denied for table X" before RLS was
-- ever evaluated. Grants here mirror the RLS policies already in place.

grant select on public.players, public.matches to anon, authenticated;
grant insert, update, delete on public.players, public.matches to authenticated;

grant select on public.admin_emails to authenticated;

grant select on public.player_season_summary to anon, authenticated;

grant all on public.players, public.matches, public.admin_emails to service_role;
grant select on public.player_season_summary to service_role;

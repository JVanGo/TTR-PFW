-- The match exports write "LASTNAME Firstname" while the Verbandsrangliste
-- writes "Firstname Lastname". Sort the whitespace-separated tokens so both
-- orderings normalize to the same key — matches the JS lib/name-key.ts helper.
create or replace function public.normalize_name(input text)
returns text
language sql
immutable
as $$
  with parts as (
    select unnest(
      string_to_array(
        regexp_replace(lower(unaccent('unaccent', input)), '\s+', ' ', 'g'),
        ' '
      )
    ) as token
  )
  select string_agg(token, ' ' order by token)
  from parts
  where token <> ''
$$;

-- Refresh name_key on every existing row using the new function.
update public.players set name = name;

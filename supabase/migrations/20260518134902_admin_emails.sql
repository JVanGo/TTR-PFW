-- Admin allowlist. Only emails in this table may sign in and perform admin writes.
-- Seeded manually; there is no UI to manage this table — service-role only.

create table public.admin_emails (
  email text primary key,
  added_at timestamptz not null default now()
);

alter table public.admin_emails enable row level security;

-- A signed-in user may read their own row to confirm they're on the allowlist.
-- The table is otherwise readable only via service-role.
create policy "admin_emails read own" on public.admin_emails
  for select
  using (auth.email() = email);

-- Helper to check whether the current session belongs to an admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_emails
    where email = auth.email()
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Admin write policies on players and matches reference is_admin().
create policy "players admin insert" on public.players
  for insert
  with check (public.is_admin());

create policy "players admin update" on public.players
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "players admin delete" on public.players
  for delete
  using (public.is_admin());

create policy "matches admin insert" on public.matches
  for insert
  with check (public.is_admin());

create policy "matches admin update" on public.matches
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "matches admin delete" on public.matches
  for delete
  using (public.is_admin());

-- Seed Jeff's email as the first admin.
insert into public.admin_emails (email) values ('jvangoid@hotmail.com')
on conflict (email) do nothing;

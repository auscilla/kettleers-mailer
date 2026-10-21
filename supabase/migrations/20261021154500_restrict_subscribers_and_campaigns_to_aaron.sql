-- Only Aaron's signed-in account (aaron@uscilla.com) may read or change
-- subscribers and campaigns. This app has no public subscribe form, so
-- anonymous visitors are not given insert access.
--
-- The check reads auth.users (the account email tied to the user id).
-- It does not use user_metadata, which a person can edit themselves.

create schema if not exists private;

create or replace function private.is_aaron()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where id = (select auth.uid())
      and lower(email) = 'aaron@uscilla.com'
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;

revoke all on function private.is_aaron() from public;
revoke all on function private.is_aaron() from anon;
grant execute on function private.is_aaron() to authenticated;

alter table public.subscribers enable row level security;
alter table public.campaigns enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('subscribers', 'campaigns')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy subscribers_aaron_all
  on public.subscribers
  for all
  to authenticated
  using ((select private.is_aaron()))
  with check ((select private.is_aaron()));

create policy campaigns_aaron_all
  on public.campaigns
  for all
  to authenticated
  using ((select private.is_aaron()))
  with check ((select private.is_aaron()));

revoke all on table public.subscribers from public, anon;
revoke all on table public.campaigns from public, anon;

grant select, insert, update, delete on table public.subscribers to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;

grant select, insert, update, delete on table public.subscribers to service_role;
grant select, insert, update, delete on table public.campaigns to service_role;

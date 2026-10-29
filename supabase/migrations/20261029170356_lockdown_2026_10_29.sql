-- lockdown_2026_10_29  (project kettleers-mailer, ref dzrrkdfdhkcwaydgifwi)
-- Replaces the "any authenticated user" policies on subscribers, campaigns,
-- templates and app_users with policies limited to the two auth users that
-- exist today. anon gets no table privileges. Service role bypasses RLS and
-- is unaffected. Existing subscribers_aaron_all / campaigns_aaron_all stay.

alter table public.subscribers enable row level security;
alter table public.campaigns   enable row level security;
alter table public.templates   enable row level security;
alter table public.app_users   enable row level security;

drop policy if exists "Allow authenticated full access to subscribers" on public.subscribers;
drop policy if exists "Allow authenticated full access to campaigns"   on public.campaigns;
drop policy if exists "Allow authenticated full access to templates"   on public.templates;
drop policy if exists "Allow authenticated users full access to app_users" on public.app_users;

create policy subscribers_existing_users_all on public.subscribers
  for all to authenticated
  using ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid))
  with check ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid));

create policy campaigns_existing_users_all on public.campaigns
  for all to authenticated
  using ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid))
  with check ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid));

create policy templates_existing_users_all on public.templates
  for all to authenticated
  using ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid))
  with check ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid));

create policy app_users_existing_users_all on public.app_users
  for all to authenticated
  using ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid))
  with check ((select auth.uid()) in ('e159b025-81dc-4264-a9d0-be7c3e72b27b'::uuid, '77cfbb0c-cfdb-4e49-8b20-237448c26ac3'::uuid));

revoke all on table public.subscribers from anon, public;
revoke all on table public.campaigns   from anon, public;
revoke all on table public.templates   from anon, public;
revoke all on table public.app_users   from anon, public;

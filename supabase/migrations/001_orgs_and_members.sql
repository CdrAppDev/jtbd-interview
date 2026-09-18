-- Migration: orgs_and_members (intent 002)
create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  contact_name text,
  contact_email text,
  retention_days int not null default 365,
  created_at timestamptz default now()
);

create table admins (
  email text primary key check (email = lower(email)),
  user_id uuid references auth.users(id) on delete set null
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('org_viewer')),
  user_id uuid references auth.users(id) on delete set null,
  unique (organization_id, email)
);

-- Link a newly created auth user to any admin or membership row seeded by email.
create or replace function public.claim_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update admins set user_id = new.id where email = lower(new.email) and user_id is null;
  update memberships set user_id = new.id where email = lower(new.email) and user_id is null;
  return new;
end;
$$;

drop trigger if exists claim_memberships on auth.users;
create trigger claim_memberships
  after insert on auth.users
  for each row execute function public.claim_memberships();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function public.member_of(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from memberships where user_id = auth.uid() and organization_id = org);
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.member_of(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.member_of(uuid) to authenticated;

alter table jobs add column organization_id uuid references organizations(id) on delete cascade;
alter table jobs drop constraint if exists jobs_slug_key;
alter table jobs add constraint jobs_org_slug_key unique (organization_id, slug);

-- RLS for the new tables. No anon policies anywhere.
alter table organizations enable row level security;
alter table admins enable row level security;
alter table memberships enable row level security;

create policy admin_all on organizations for all to authenticated using (is_admin()) with check (is_admin());
create policy member_read on organizations for select to authenticated using (member_of(id));
create policy admin_all on admins for all to authenticated using (is_admin()) with check (is_admin());
create policy self_read on admins for select to authenticated using (user_id = auth.uid());
create policy admin_all on memberships for all to authenticated using (is_admin()) with check (is_admin());
create policy self_read on memberships for select to authenticated using (user_id = auth.uid());

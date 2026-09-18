-- Migration: interview_links_and_respondents (intent 002)
create table interview_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  token text not null unique,
  closes_at timestamptz not null,
  revoked_at timestamptz,
  respondent_cap int check (respondent_cap is null or respondent_cap > 0),
  created_at timestamptz default now()
);
create unique index interview_links_one_active_per_job on interview_links (job_id) where revoked_at is null;

alter table respondents alter column name drop not null;
alter table respondents add column organization_id uuid references organizations(id) on delete cascade;
alter table respondents add column link_id uuid references interview_links(id) on delete set null;
alter table respondents add column token_hash text unique;

alter table step_responses add column organization_id uuid references organizations(id) on delete cascade;
alter table ratings add column organization_id uuid references organizations(id) on delete cascade;

create table answer_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  respondent_id uuid not null references respondents(id) on delete cascade,
  viewer_user_id uuid not null,
  viewed_at timestamptz default now()
);

alter table interview_links enable row level security;
alter table answer_views enable row level security;
create policy admin_all on interview_links for all to authenticated using (is_admin()) with check (is_admin());
create policy member_read on interview_links for select to authenticated using (member_of(organization_id));
create policy admin_all on answer_views for all to authenticated using (is_admin()) with check (is_admin());

-- Migration: candidates_and_runs (intent 004)
-- Engine runs are split into units so each finishes inside one serverless call.
-- A unit row is also the audit of what was sent to the model and what it cost.

create table engine_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('find_jobs', 'draft_interview', 'refresh_evidence')),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  candidate_id uuid,
  job_id uuid references jobs(id) on delete cascade,
  transcript_ids uuid[] not null default '{}',
  model text not null,
  units_total int not null,
  units_done int not null default 0,
  error text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_cents int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index engine_runs_by_org on engine_runs (organization_id, created_at desc);

create table engine_run_units (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references engine_runs(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  position int not null,
  transcript_id uuid references transcripts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  result jsonb,
  error text,
  unique (run_id, position)
);

create table job_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  run_id uuid references engine_runs(id) on delete set null,
  kind text not null default 'job' check (kind in ('job', 'solution', 'constraint')),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'set_aside')),
  statement text not null,
  executor_role text not null,
  explanation text,
  reason text,
  merged_from jsonb,
  job_id uuid references jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index job_candidates_by_org on job_candidates (organization_id, status, created_at desc);

-- Quote text, speaker and transcript title are copied, so a quote still reads
-- after its transcript is deleted. The links go null, the evidence stays.
create table candidate_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  candidate_id uuid not null references job_candidates(id) on delete cascade,
  transcript_id uuid references transcripts(id) on delete set null,
  segment_id uuid references transcript_segments(id) on delete set null,
  speaker text,
  text text not null,
  transcript_title text not null,
  created_at timestamptz not null default now()
);
create index candidate_quotes_by_candidate on candidate_quotes (candidate_id);

alter table engine_runs enable row level security;
alter table engine_run_units enable row level security;
alter table job_candidates enable row level security;
alter table candidate_quotes enable row level security;

create policy admin_all on engine_runs for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on engine_run_units for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on job_candidates for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on candidate_quotes for all to authenticated using (is_admin()) with check (is_admin());

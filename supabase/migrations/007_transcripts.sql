-- Migration: transcripts (intent 004)
-- Client meeting transcripts and their segments, plus the audit of who read one.
-- Highest data class: admin only, no anon or org_viewer policy anywhere.

create table transcripts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text not null check (source in ('fellow', 'paste')),
  fellow_recording_id text,
  title text not null,
  held_at timestamptz not null,
  attendees text[] not null default '{}',
  language text,
  duration_seconds int,
  imported_by uuid,
  created_at timestamptz not null default now()
);
create unique index transcripts_fellow_once
  on transcripts (organization_id, fellow_recording_id)
  where fellow_recording_id is not null;
create index transcripts_by_org on transcripts (organization_id, held_at desc);

create table transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references transcripts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  position int not null,
  speaker text,
  start_seconds numeric,
  end_seconds numeric,
  text text not null,
  unique (transcript_id, position)
);
create index transcript_segments_by_transcript on transcript_segments (transcript_id, position);

create table transcript_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  transcript_id uuid not null references transcripts(id) on delete cascade,
  viewer_user_id uuid not null,
  viewed_at timestamptz not null default now()
);

alter table transcripts enable row level security;
alter table transcript_segments enable row level security;
alter table transcript_views enable row level security;

create policy admin_all on transcripts for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on transcript_segments for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on transcript_views for all to authenticated using (is_admin()) with check (is_admin());

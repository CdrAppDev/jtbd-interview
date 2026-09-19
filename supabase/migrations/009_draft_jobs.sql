-- Migration: draft_jobs (intent 004)
-- A job drafted from a candidate, the transcript evidence behind each of its
-- parts, and the additions a later run proposes for Chris to apply or ignore.

alter table jobs add column draft boolean not null default false;
alter table jobs add column candidate_id uuid references job_candidates(id) on delete set null;

-- Evidence is copied text, like candidate_quotes: deleting the transcript
-- nulls the links but leaves the quote readable, marked as deleted in the UI.
create table draft_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  target_kind text not null check (target_kind in ('job', 'step', 'data_item', 'statement')),
  target_id uuid not null,
  transcript_id uuid references transcripts(id) on delete set null,
  segment_id uuid references transcript_segments(id) on delete set null,
  speaker text,
  text text not null,
  transcript_title text not null,
  created_at timestamptz not null default now()
);
create index draft_evidence_by_target on draft_evidence (job_id, target_id);

create table job_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  run_id uuid references engine_runs(id) on delete set null,
  target_kind text not null check (target_kind in ('step', 'data_item', 'statement')),
  target_id uuid,
  payload jsonb not null,
  speaker text,
  text text,
  transcript_id uuid references transcripts(id) on delete set null,
  segment_id uuid references transcript_segments(id) on delete set null,
  transcript_title text,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'ignored')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index job_proposals_by_job on job_proposals (job_id, status);

alter table draft_evidence enable row level security;
alter table job_proposals enable row level security;
create policy admin_all on draft_evidence for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on job_proposals for all to authenticated using (is_admin()) with check (is_admin());

-- One transaction for a whole drafted job: the job, its eight steps, the data
-- items, which items are offered at each step, the statements, and the quote
-- behind each part. Modelled on skeleton_job. Payload shape:
-- {title, executor_name, executor_role, description,
--  evidence: [{quote, speaker, transcript_id, segment_id, transcript_title}],
--  steps: [{position, stage, title, description, evidence: [...],
--           items: [<data item key>],
--           statements: [{position, text, data_item, evidence: [...]}]}],
--  data_items: [{key, name, evidence: [...]}]}
create or replace function public.create_draft_job(p_org uuid, p_candidate uuid, p_slug text, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_job uuid; s jsonb; it jsonb; st jsonb; e jsonb;
  new_step uuid; new_item uuid; new_stmt uuid;
  keys jsonb := '{}'::jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  insert into jobs (slug, title, executor_name, executor_role, description, organization_id, draft, candidate_id)
  values (
    p_slug,
    coalesce(p_payload->>'title', 'Untitled job'),
    coalesce(p_payload->>'executor_name', 'Executor'),
    coalesce(p_payload->>'executor_role', 'Role'),
    p_payload->>'description',
    p_org, true, p_candidate
  )
  returning id into new_job;

  for e in select * from jsonb_array_elements(coalesce(p_payload->'evidence', '[]'::jsonb)) loop
    insert into draft_evidence (organization_id, job_id, target_kind, target_id, transcript_id, segment_id, speaker, text, transcript_title)
    values (p_org, new_job, 'job', new_job,
            nullif(e->>'transcript_id', '')::uuid, nullif(e->>'segment_id', '')::uuid,
            e->>'speaker', coalesce(e->>'quote', ''), coalesce(e->>'transcript_title', ''));
  end loop;

  -- Data items first: statements and step offerings reference them by key.
  for it in select * from jsonb_array_elements(coalesce(p_payload->'data_items', '[]'::jsonb)) loop
    insert into data_items (job_id, key, name)
    values (new_job, it->>'key', it->>'name')
    returning id into new_item;
    keys := keys || jsonb_build_object(it->>'key', new_item::text);
    for e in select * from jsonb_array_elements(coalesce(it->'evidence', '[]'::jsonb)) loop
      insert into draft_evidence (organization_id, job_id, target_kind, target_id, transcript_id, segment_id, speaker, text, transcript_title)
      values (p_org, new_job, 'data_item', new_item,
              nullif(e->>'transcript_id', '')::uuid, nullif(e->>'segment_id', '')::uuid,
              e->>'speaker', coalesce(e->>'quote', ''), coalesce(e->>'transcript_title', ''));
    end loop;
  end loop;

  for s in select * from jsonb_array_elements(coalesce(p_payload->'steps', '[]'::jsonb)) loop
    insert into steps (job_id, position, stage, title, description)
    values (new_job, (s->>'position')::int, s->>'stage', s->>'title', coalesce(s->>'description', ''))
    returning id into new_step;

    for e in select * from jsonb_array_elements(coalesce(s->'evidence', '[]'::jsonb)) loop
      insert into draft_evidence (organization_id, job_id, target_kind, target_id, transcript_id, segment_id, speaker, text, transcript_title)
      values (p_org, new_job, 'step', new_step,
              nullif(e->>'transcript_id', '')::uuid, nullif(e->>'segment_id', '')::uuid,
              e->>'speaker', coalesce(e->>'quote', ''), coalesce(e->>'transcript_title', ''));
    end loop;

    insert into step_data_items (step_id, data_item_id, position)
    select new_step, (keys->>k.value)::uuid, k.ordinality
    from jsonb_array_elements_text(coalesce(s->'items', '[]'::jsonb)) with ordinality as k(value, ordinality)
    where keys ? k.value;

    for st in select * from jsonb_array_elements(coalesce(s->'statements', '[]'::jsonb)) loop
      insert into statements (step_id, position, text, data_item_id)
      values (new_step, (st->>'position')::int, st->>'text',
              case when keys ? (st->>'data_item') then (keys->>(st->>'data_item'))::uuid else null end)
      returning id into new_stmt;
      for e in select * from jsonb_array_elements(coalesce(st->'evidence', '[]'::jsonb)) loop
        insert into draft_evidence (organization_id, job_id, target_kind, target_id, transcript_id, segment_id, speaker, text, transcript_title)
        values (p_org, new_job, 'statement', new_stmt,
                nullif(e->>'transcript_id', '')::uuid, nullif(e->>'segment_id', '')::uuid,
                e->>'speaker', coalesce(e->>'quote', ''), coalesce(e->>'transcript_title', ''));
      end loop;
    end loop;
  end loop;

  return new_job;
end $$;

revoke all on function public.create_draft_job(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.create_draft_job(uuid, uuid, text, jsonb) to authenticated;

-- Migration: functions_and_views (intent 002)
-- The worker path: anon may only call interview_* functions. Each checks the
-- link token, and the respondent secret where one is required.

create or replace function public._b64url(b bytea) returns text
language sql immutable as $$ select translate(encode(b, 'base64'), '+/=', '-_') $$;

create or replace function public._hash(t text) returns text
language sql immutable as $$ select encode(digest(t, 'sha256'), 'hex') $$;

create or replace function public._respondent(p_token text, p_secret text)
returns respondents
language sql stable security definer set search_path = public as $$
  select r.* from respondents r
  join interview_links l on l.id = r.link_id
  where l.token = p_token and r.token_hash = _hash(p_secret)
$$;

create or replace function public.interview_open(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l interview_links; j jobs; o organizations; n int; st text;
begin
  select * into l from interview_links where token = p_token;
  if not found then return jsonb_build_object('status', 'closed'); end if;
  select * into j from jobs where id = l.job_id;
  select * into o from organizations where id = l.organization_id;
  if l.revoked_at is not null or l.closes_at < now() then
    st := 'closed';
  else
    select count(*) into n from respondents where link_id = l.id;
    st := case when l.respondent_cap is not null and n >= l.respondent_cap then 'full' else 'open' end;
  end if;
  return jsonb_build_object(
    'status', st,
    'org_name', o.name,
    'closes_at', l.closes_at,
    'job', jsonb_build_object('title', j.title, 'description', j.description, 'executor_name', j.executor_name, 'executor_role', j.executor_role),
    'steps', (select coalesce(jsonb_agg(jsonb_build_object('position', s.position, 'stage', s.stage, 'title', s.title) order by s.position), '[]'::jsonb) from steps s where s.job_id = j.id)
  );
end $$;

create or replace function public.interview_start(p_token text, p_role text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l interview_links; n int; sec text; rid uuid;
begin
  select * into l from interview_links where token = p_token for update;
  if not found or l.revoked_at is not null or l.closes_at < now() then raise exception 'closed'; end if;
  if p_role is null or length(trim(p_role)) = 0 then raise exception 'role_required'; end if;
  select count(*) into n from respondents where link_id = l.id;
  if l.respondent_cap is not null and n >= l.respondent_cap then raise exception 'full'; end if;
  sec := _b64url(gen_random_bytes(32));
  insert into respondents (job_id, organization_id, link_id, role, name, token_hash)
  values (l.job_id, l.organization_id, l.id, trim(p_role), nullif(trim(coalesce(p_name, '')), ''), _hash(sec))
  returning id into rid;
  return jsonb_build_object('respondent_id', rid, 'secret', sec);
end $$;

create or replace function public.interview_resume(p_token text, p_secret text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r respondents; nxt int; total int;
begin
  r := _respondent(p_token, p_secret);
  if r.id is null then return null; end if;
  select max(position) into total from steps where job_id = r.job_id;
  select min(s.position) into nxt from steps s
   where s.job_id = r.job_id
     and not exists (select 1 from step_responses sr where sr.respondent_id = r.id and sr.step_id = s.id);
  return jsonb_build_object('respondent_id', r.id, 'next_position', coalesce(nxt, total), 'completed', r.completed_at is not null);
end $$;

create or replace function public.interview_step(p_token text, p_secret text, p_position int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r respondents; s steps; total int;
begin
  r := _respondent(p_token, p_secret);
  if r.id is null then raise exception 'no_respondent'; end if;
  select * into s from steps where job_id = r.job_id and position = p_position;
  if not found then raise exception 'no_step'; end if;
  select count(*) into total from steps where job_id = r.job_id;
  return jsonb_build_object(
    'step', jsonb_build_object('id', s.id, 'job_id', s.job_id, 'position', s.position, 'stage', s.stage, 'title', s.title, 'description', s.description),
    'total', total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'key', d.key, 'name', d.name) order by sdi.position), '[]'::jsonb)
              from step_data_items sdi join data_items d on d.id = sdi.data_item_id where sdi.step_id = s.id),
    'statements', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'step_id', st.step_id, 'position', st.position, 'text', st.text, 'data_item_id', st.data_item_id) order by st.position), '[]'::jsonb)
                   from statements st where st.step_id = s.id),
    'response', (select jsonb_build_object('data_item_ids', sr.data_item_ids, 'other_data', sr.other_data, 'free_text', sr.free_text)
                 from step_responses sr where sr.respondent_id = r.id and sr.step_id = s.id),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('statement_id', x.statement_id, 'importance', x.importance, 'satisfaction', x.satisfaction)), '[]'::jsonb)
                from ratings x join statements st on st.id = x.statement_id where x.respondent_id = r.id and st.step_id = s.id)
  );
end $$;

create or replace function public.interview_save(p_token text, p_secret text, p_step_id uuid, p_item_ids uuid[], p_other text, p_free text, p_ratings jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare r respondents; s steps; ids uuid[]; rec jsonb;
begin
  r := _respondent(p_token, p_secret);
  if r.id is null then raise exception 'no_respondent'; end if;
  select * into s from steps where id = p_step_id and job_id = r.job_id;
  if not found then raise exception 'no_step'; end if;
  select coalesce(array_agg(d.id), '{}') into ids from data_items d where d.job_id = r.job_id and d.id = any(coalesce(p_item_ids, '{}'));
  insert into step_responses (respondent_id, organization_id, step_id, data_item_ids, other_data, free_text)
  values (r.id, r.organization_id, s.id, ids, nullif(trim(coalesce(p_other, '')), ''), nullif(trim(coalesce(p_free, '')), ''))
  on conflict (respondent_id, step_id) do update
    set data_item_ids = excluded.data_item_ids, other_data = excluded.other_data, free_text = excluded.free_text;
  for rec in select * from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb)) loop
    if (rec->>'importance')::int between 1 and 5 and (rec->>'satisfaction')::int between 1 and 5
       and exists (select 1 from statements st where st.id = (rec->>'statement_id')::uuid and st.step_id = s.id) then
      insert into ratings (respondent_id, organization_id, statement_id, importance, satisfaction)
      values (r.id, r.organization_id, (rec->>'statement_id')::uuid, (rec->>'importance')::int, (rec->>'satisfaction')::int)
      on conflict (respondent_id, statement_id) do update
        set importance = excluded.importance, satisfaction = excluded.satisfaction;
    end if;
  end loop;
end $$;

create or replace function public.interview_finish(p_token text, p_secret text)
returns void
language plpgsql security definer set search_path = public as $$
declare r respondents;
begin
  r := _respondent(p_token, p_secret);
  if r.id is null then raise exception 'no_respondent'; end if;
  update respondents set completed_at = coalesce(completed_at, now()) where id = r.id;
end $$;

revoke all on function public._b64url(bytea), public._hash(text), public._respondent(text, text) from public, anon, authenticated;
revoke all on function public.interview_open(text), public.interview_start(text, text, text), public.interview_resume(text, text),
  public.interview_step(text, text, int), public.interview_save(text, text, uuid, uuid[], text, text, jsonb), public.interview_finish(text, text) from public;
grant execute on function public.interview_open(text), public.interview_start(text, text, text), public.interview_resume(text, text),
  public.interview_step(text, text, int), public.interview_save(text, text, uuid, uuid[], text, text, jsonb), public.interview_finish(text, text) to anon, authenticated;

-- Admin helpers: clone a job into an organization, or start from the eight-step skeleton.
create or replace function public.clone_job(p_source uuid, p_org uuid, p_slug text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_job uuid; s record; d record; nid uuid; step_map jsonb := '{}'; item_map jsonb := '{}';
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  insert into jobs (slug, title, executor_name, executor_role, description, organization_id)
  select p_slug, title, executor_name, executor_role, description, p_org from jobs where id = p_source
  returning id into new_job;
  if new_job is null then raise exception 'no_source'; end if;
  for s in select * from steps where job_id = p_source order by position loop
    insert into steps (job_id, position, stage, title, description) values (new_job, s.position, s.stage, s.title, s.description) returning id into nid;
    step_map := step_map || jsonb_build_object(s.id::text, nid::text);
  end loop;
  for d in select * from data_items where job_id = p_source loop
    insert into data_items (job_id, key, name) values (new_job, d.key, d.name) returning id into nid;
    item_map := item_map || jsonb_build_object(d.id::text, nid::text);
  end loop;
  insert into step_data_items (step_id, data_item_id, position)
  select (step_map->>sdi.step_id::text)::uuid, (item_map->>sdi.data_item_id::text)::uuid, sdi.position
  from step_data_items sdi join steps s2 on s2.id = sdi.step_id where s2.job_id = p_source;
  insert into statements (step_id, position, text, data_item_id)
  select (step_map->>st.step_id::text)::uuid, st.position, st.text,
         case when st.data_item_id is null then null else (item_map->>st.data_item_id::text)::uuid end
  from statements st join steps s3 on s3.id = st.step_id where s3.job_id = p_source;
  return new_job;
end $$;

create or replace function public.skeleton_job(p_org uuid, p_slug text, p_title text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_job uuid; stages text[] := array['Define', 'Locate', 'Prepare', 'Confirm', 'Execute', 'Monitor', 'Modify', 'Conclude']; i int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  insert into jobs (slug, title, executor_name, executor_role, description, organization_id)
  values (p_slug, p_title, 'Executor', 'Role', null, p_org) returning id into new_job;
  for i in 1..8 loop
    insert into steps (job_id, position, stage, title, description) values (new_job, i, stages[i], stages[i], '');
  end loop;
  return new_job;
end $$;

revoke all on function public.clone_job(uuid, uuid, text), public.skeleton_job(uuid, text, text) from public, anon;
grant execute on function public.clone_job(uuid, uuid, text), public.skeleton_job(uuid, text, text) to authenticated;

-- Counts for admins and org contacts. Runs as the view owner, so the where
-- clause is the access check: contacts see counts, never rows.
create or replace view public.job_progress with (security_invoker = false) as
  select j.id as job_id, j.organization_id,
         count(r.id)::int as started,
         count(r.completed_at)::int as finished
  from jobs j left join respondents r on r.job_id = j.id
  where is_admin() or member_of(j.organization_id)
  group by j.id, j.organization_id;

revoke all on public.job_progress from public, anon;
grant select on public.job_progress to authenticated;

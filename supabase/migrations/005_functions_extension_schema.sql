-- Migration: functions_extension_schema (intent 002)
-- pgcrypto lives in the extensions schema on Supabase; the functions pin
-- search_path to public, so qualify the two calls that need it.

create or replace function public._hash(t text) returns text
language sql immutable as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;

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
  sec := _b64url(extensions.gen_random_bytes(32));
  insert into respondents (job_id, organization_id, link_id, role, name, token_hash)
  values (l.job_id, l.organization_id, l.id, trim(p_role), nullif(trim(coalesce(p_name, '')), ''), _hash(sec))
  returning id into rid;
  return jsonb_build_object('respondent_id', rid, 'secret', sec);
end $$;

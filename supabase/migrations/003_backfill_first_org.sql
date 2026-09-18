-- Migration: backfill_first_org (intent 002)
-- Moves the existing Derek job and its responses into a first internal organization.
insert into organizations (name, slug, contact_name, contact_email)
values ('CdrAppDev (internal)', 'internal', 'Chris', 'chris.roberts.mail@gmail.com');

insert into admins (email) values ('chris.roberts.mail@gmail.com');

update jobs set organization_id = (select id from organizations where slug = 'internal') where organization_id is null;
update respondents r set organization_id = j.organization_id from jobs j where r.job_id = j.id and r.organization_id is null;
update step_responses s set organization_id = r.organization_id from respondents r where s.respondent_id = r.id and s.organization_id is null;
update ratings x set organization_id = r.organization_id from respondents r where x.respondent_id = r.id and x.organization_id is null;

alter table jobs alter column organization_id set not null;
alter table respondents alter column organization_id set not null;
alter table step_responses alter column organization_id set not null;
alter table ratings alter column organization_id set not null;

insert into interview_links (organization_id, job_id, token, closes_at)
select j.organization_id, j.id,
       translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_'),
       now() + interval '30 days'
from jobs j where j.slug = 'sow';

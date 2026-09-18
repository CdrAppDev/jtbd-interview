-- Migration: tenant_rls (intent 002)
-- Cut-over: drop every policy that let the anon key read or write answers and
-- content. Workers only reach the database through the interview_* functions.
-- Admins act as themselves (is_admin()); contacts see jobs and links for their
-- organization (member_of()); nothing else is readable by anyone.

drop policy "read jobs" on jobs;
drop policy "read steps" on steps;
drop policy "read data_items" on data_items;
drop policy "read step_data_items" on step_data_items;
drop policy "read statements" on statements;
drop policy "read respondents" on respondents;
drop policy "insert respondents" on respondents;
drop policy "update respondents" on respondents;
drop policy "read step_responses" on step_responses;
drop policy "insert step_responses" on step_responses;
drop policy "upsert step_responses" on step_responses;
drop policy "read ratings" on ratings;
drop policy "insert ratings" on ratings;
drop policy "upsert ratings" on ratings;

create policy admin_all on jobs for all to authenticated using (is_admin()) with check (is_admin());
create policy member_read on jobs for select to authenticated using (member_of(organization_id));
create policy admin_all on steps for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on data_items for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on step_data_items for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on statements for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on respondents for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on step_responses for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on ratings for all to authenticated using (is_admin()) with check (is_admin());

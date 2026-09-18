# Plan: organizations, client contacts, jobs, and interview links
From: spec.md (2026-09-18). Status: accepted (approved in plan mode). Date: 2026-09-18.

## Context
Intent 002 (accepted) and its spec (accepted) turn the single-job, no-auth mock into a multi-org app: Chris logs in as admin, creates orgs and jobs, issues one expiring interview link per job; the client contact logs in and sees only her jobs, the link, and counts; workers stay anonymous behind the link. Today every table is readable and writable by the anon key, the results page reads all answers unscoped, and the done page links workers to results. This plan replaces that with database functions for the worker path, RLS keyed on `organization_id` for everyone else, and Supabase Auth magic links for admin and contact.

## Files that change
Dependencies
- `package.json`: add `@supabase/ssr` (cookie sessions for Next.js). Nothing else.

Library
- `lib/supabase.ts` (modified): keep `supabase()` anon client and types; add types `Organization`, `InterviewLink`, `Respondent`, `Membership`; remove `JOB_SLUG`.
- `lib/supabase-server.ts` (new): `createServerClient` bound to Next cookies, used by every authenticated server component, server action, and route handler.
- `lib/auth.ts` (new): `getUser()`, `requireAdmin()` (calls RPC `is_admin`, else `redirect('/no-access')`), `requireMembership()` (returns the user's org or redirects), `siteUrl()` from request headers.
- `lib/interview.ts` (new): server actions for the worker path: `openInterview(token)`, `startInterview(token, form)`, `loadStep(token, position)`, `saveStep(token, form)`, `finishInterview(token)`. Each calls the matching `interview_*` RPC with the anon client and reads or sets the `jtbd_r` cookie (httpOnly, path `/i/<token>`, 30 days).
- `lib/scoring.ts` (new): the scoring code lifted verbatim from `app/results/page.tsx` (`tierOf`, statement scoring, data-item buckets) so the results page and the individual-interview page share it.
- `middleware.ts` (new): refreshes the Supabase session cookie; redirects unauthenticated `/admin/*` and `/org/*` to `/login`.

Worker routes
- `app/page.tsx` (modified): `redirect('/login')`.
- `app/i/[token]/page.tsx` (new): start screen. Calls `openInterview`; shows closed message, or "continue" if cookie valid, or the start form.
- `app/i/[token]/[step]/page.tsx` (new): replaces `app/interview/[rid]/[step]/page.tsx`; loads via `loadStep`.
- `components/StartForm.tsx` (modified): role required, name optional, submits to `startInterview`; copy from spec.
- `components/StepForm.tsx` (modified): same UI, but submits to `saveStep` and `finishInterview` instead of writing to the database directly. Navigation uses `/i/<token>/<n>`.
- `app/done/page.tsx` (modified): remove the results link; copy from spec.
- `app/interview/[rid]/[step]/page.tsx` (deleted) and `app/results/page.tsx` (deleted, moved under admin).

Auth routes
- `app/login/page.tsx` (new) and `app/login/actions.ts` (new): email form, `signInWithOtp` with `emailRedirectTo = siteUrl() + '/auth/callback'`.
- `app/auth/callback/route.ts` (new): `verifyOtp({ token_hash, type })`, then redirect: admin to `/admin`, member to `/org`, else `/no-access`.
- `app/no-access/page.tsx` (new).
- `app/logout/route.ts` (new): `signOut`, redirect to `/login`.

Admin routes (all under `app/admin/`, all call `requireAdmin()`)
- `layout.tsx` (new): nav (Organizations, Sign out).
- `page.tsx` (new): organizations with jobs and started/finished from `job_progress`.
- `orgs/new/page.tsx` (new), `orgs/[orgId]/page.tsx` (new): details form, contact, retention, jobs list, delete (type the name to confirm).
- `orgs/[orgId]/jobs/new/page.tsx` (new): clone picker or skeleton.
- `jobs/[jobId]/page.tsx` (new): three sections on one page, each a plain form: content editor, link panel, respondents table.
- `jobs/[jobId]/respondents/[rid]/page.tsx` (new): one interview read-only; inserts `answer_views` first.
- `jobs/[jobId]/results/page.tsx` (new): `app/results/page.tsx` moved, filtered to the job, using `lib/scoring.ts`.
- `actions.ts` (new): server actions `createOrg`, `updateOrg`, `deleteOrg`, `createJob` (RPC `clone_job` or `skeleton_job`), `updateJob`, `saveStep`, `saveDataItem`, `deleteDataItem`, `setStepItems`, `saveStatement`, `deleteStatement`, `createLink`, `updateLink`, `revokeLink`. All use the server client; RLS enforces admin.
- `components/CopyButton.tsx` (new, client): copies text, shows "Copied".

Contact routes
- `app/org/layout.tsx` (new): `requireMembership()`, nav (Sign out).
- `app/org/page.tsx` (new): jobs with link, closing date, counts from `job_progress`.

Styling and docs
- `app/globals.css` (modified): add `.nav-bar`, `.table-actions`, `.form-grid`, `.notice` (about 40 lines). Existing tokens and classes reused everywhere.
- `supabase/migrations/*.sql` (new): the five migrations below, committed for the record. Applied with the Supabase MCP `apply_migration` tool.
- `CLAUDE.md` (modified): tables, routes, auth, RLS summary, Supabase Auth URL settings.

## Migrations
Applied in this order, each as one `apply_migration` call with the same name as the file.

1. `orgs_and_members`
   - `create extension if not exists pgcrypto;`
   - `organizations(id uuid pk default gen_random_uuid(), name text not null, slug text unique not null, contact_name text, contact_email text, retention_days int not null default 365, created_at timestamptz default now())`
   - `admins(email text primary key, user_id uuid references auth.users)` with a check that `email = lower(email)`.
   - `memberships(id uuid pk, organization_id uuid references organizations on delete cascade, email text not null, role text not null check (role in ('org_viewer')), user_id uuid references auth.users, unique(organization_id, email))`, same lowercase check.
   - Function `public.claim_memberships()` (security definer) and trigger `after insert on auth.users`: `update admins set user_id = new.id where email = lower(new.email)`; same for `memberships`.
   - `is_admin()`: `exists(select 1 from admins where user_id = auth.uid())`. `member_of(org uuid)`: `exists(select 1 from memberships where user_id = auth.uid() and organization_id = org)`. Both `security definer`, `stable`, granted to `authenticated`.
   - `alter table jobs add column organization_id uuid references organizations on delete cascade;` (nullable until backfill). Drop the unique constraint on `jobs.slug`; add `unique(organization_id, slug)`.

2. `interview_links_and_respondents`
   - `interview_links(id uuid pk, organization_id uuid not null references organizations on delete cascade, job_id uuid not null references jobs on delete cascade, token text unique not null, closes_at timestamptz not null, revoked_at timestamptz, respondent_cap int, created_at timestamptz default now())`; partial unique index on `(job_id) where revoked_at is null`.
   - `respondents`: `alter column name drop not null`; add `organization_id uuid references organizations on delete cascade`, `link_id uuid references interview_links on delete set null`, `token_hash text unique`.
   - `step_responses` and `ratings`: add `organization_id uuid references organizations on delete cascade`.
   - `answer_views(id uuid pk, organization_id uuid not null references organizations on delete cascade, respondent_id uuid not null references respondents on delete cascade, viewer_user_id uuid not null, viewed_at timestamptz default now())`.

3. `backfill_first_org`
   - Insert organization `('CdrAppDev (internal)', 'internal', 'Chris', 'chris.roberts.mail@gmail.com')`.
   - Insert `admins ('chris.roberts.mail@gmail.com')`.
   - Set `organization_id` on the Derek job, then on `respondents`, `step_responses` (via respondent), `ratings` (via respondent). Then `alter ... set not null` on `jobs`, `respondents`, `step_responses`, `ratings`.
   - Insert one `interview_links` row for the Derek job, `closes_at = now() + 30 days`, token from `gen_random_bytes(32)` base64url.

4. `functions_and_views` (all `security definer`, `set search_path = public`)
   - `_b64url(bytea)` helper, `_hash(text)` = sha256 hex.
   - `interview_open(p_token text)` returns json `{status, job:{title, description, executor_name, executor_role}, org_name, steps:[{position, stage, title}]}`; `status` is `closed` when link missing, revoked, or `closes_at < now()`; `full` when cap reached (count of respondents for the link); else `open`.
   - `interview_start(p_token text, p_role text, p_name text)`: requires `open`, `length(trim(p_role)) > 0`; inserts respondent with `token_hash`; returns `{respondent_id, secret}`.
   - `interview_resume(p_token, p_secret)`: returns `{respondent_id, next_position}` or null. Used by the start page for "continue".
   - `interview_step(p_token, p_secret, p_position)`: validates respondent belongs to the link; returns step, items, statements, existing response, existing ratings as json. Allowed when closed.
   - `interview_save(p_token, p_secret, p_step_id, p_item_ids uuid[], p_other text, p_free text, p_ratings jsonb)`: upserts `step_responses` and `ratings` (stamping `organization_id`), only for that respondent, only for steps of that job.
   - `interview_finish(p_token, p_secret)`: sets `completed_at`.
   - Grants: `execute` on the six `interview_*` functions to `anon`. Revoke from `public`.
   - `clone_job(p_source uuid, p_org uuid, p_slug text)` and `skeleton_job(p_org uuid, p_slug text, p_title text)`: admin-only (`if not is_admin() then raise`), copy steps, data items, step_data_items, statements with id remapping; skeleton inserts the eight stages with placeholder titles. Granted to `authenticated`.
   - View `job_progress` as `security_invoker = false` with body `select j.id as job_id, j.organization_id, count(r.*) filter (where true) as started, count(r.*) filter (where r.completed_at is not null) as finished from jobs j left join respondents r on r.job_id = j.id where is_admin() or member_of(j.organization_id) group by j.id`. Grant select to `authenticated`.

5. `tenant_rls`
   - `drop policy` for all fourteen existing policies (named in `pg_policies` today: `read jobs`, `read steps`, `read data_items`, `read step_data_items`, `read statements`, `read respondents`, `insert respondents`, `update respondents`, `read step_responses`, `insert step_responses`, `upsert step_responses`, `read ratings`, `insert ratings`, `upsert ratings`).
   - Enable RLS on the new tables.
   - Policies, all `to authenticated`:
     - `organizations`: `admin_all for all using (is_admin()) with check (is_admin())`; `member_read for select using (member_of(id))`.
     - `jobs`: `admin_all`; `member_read for select using (member_of(organization_id))`.
     - `steps`, `data_items`, `step_data_items`, `statements`: `admin_all` only (join through `jobs` for the org check: `exists(select 1 from jobs where jobs.id = job_id and is_admin())`; for `step_data_items` and `statements` join via `steps`).
     - `interview_links`: `admin_all`; `member_read for select using (member_of(organization_id))`.
     - `respondents`, `step_responses`, `ratings`, `answer_views`: `admin_all` only.
     - `admins`, `memberships`: `admin_all`; `self_read for select using (user_id = auth.uid())`.
   - No policy of any kind for `anon`. Verify with `set role anon; select count(*) from respondents;` which must return 0 rows (RLS with no policy denies).

## Order of work
Each step ends with `npm run typecheck` and `npm run build` green and the deployed app still usable.

1. **Auth scaffolding, no behaviour change for workers.** Add `@supabase/ssr`. Write `lib/supabase-server.ts`, `lib/auth.ts`, `middleware.ts`, `/login`, `/auth/callback`, `/no-access`, `/logout`, `app/admin/layout.tsx` and a placeholder `app/admin/page.tsx` that prints "Signed in as ...". Apply migration 1. Old routes untouched and still work because old policies still exist.
2. **Schema for links and tenancy.** Apply migrations 2 and 3. Old routes still work (`name` nullable is compatible; new columns have no effect on old queries).
3. **Worker path on functions.** Apply migration 4. Write `lib/interview.ts`, `app/i/[token]/page.tsx`, `app/i/[token]/[step]/page.tsx`, rewrite `StartForm` and `StepForm`, update `/done`. Test the Derek link end to end on a preview deployment. Old `/interview` path still works in parallel.
4. **Admin and contact screens.** `lib/scoring.ts`, all `app/admin/*` pages and `actions.ts`, `app/org/*`, `CopyButton`, CSS additions. Move and scope the results page. Test as admin on preview: create org, create job by cloning Derek, edit a statement, create link, open it as a worker in a private window, see the respondent appear, open it (audit row written), see results.
5. **Cut-over.** Apply migration 5. Delete `app/interview/`, `app/results/`, point `/` at `/login`. Redeploy. Confirm anon has no access (proof below).
6. **Docs.** Update `CLAUDE.md`. Delete the Smoke Test respondent is still Chris's call, not part of this.

One manual step for Chris, before step 1 can be tested: in the Supabase dashboard, Authentication, URL Configuration, set Site URL to the Vercel production URL and add redirect URLs for `https://*.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`. Claude will supply the exact production URL from the Vercel project. Magic links do not work until this is set.

## Risks
- **Locking yourself out.** If `admins` has the wrong email, `/admin` is unreachable. Guard: migration 3 seeds Chris's email; `claim_memberships` links it on first login; proof step logs in before cut-over.
- **Cut-over breaks the mock run.** Migration 5 drops anon access, so anyone mid-interview on the old `/interview` URLs loses access. Guard: do step 5 when no interviews are in progress (today, 2 respondents, both test data); the Derek link created in migration 3 is the replacement URL.
- **Server components cannot set cookies.** The `jtbd_r` cookie is only set inside server actions (`startInterview`) and read in components. Guard: `openInterview` reads the cookie, never writes; `startInterview` is the only writer.
- **Session refresh.** Without middleware the auth cookie expires silently and admin pages redirect to login. Guard: `middleware.ts` runs `getUser()` on every request under `/admin` and `/org`.
- **Clone id remapping.** `clone_job` must map old step ids to new for `statements.step_id` and `step_data_items.step_id`, and old data item ids to new for `statements.data_item_id`. Guard: done in SQL with two temp mapping tables; proof clones Derek and checks counts match (8, 25, 47, 33).
- **Results page regression.** Moving it can break the SVG or the tables. Guard: it moves as a file with only the data-fetching block changed to filter by job; scoring goes to `lib/scoring.ts` unchanged.
- **Magic link rate limit.** Supabase's built-in mailer allows a few emails per hour. Guard: test logins sparingly; accepted in spec concern 2.

## Alternatives not taken
- Service role key in server code instead of security-definer functions: rejected, it bypasses RLS entirely and adds a secret to manage.
- Anon RLS policies keyed on a token header instead of functions: rejected, harder to reason about and easy to get wrong; functions keep every check in one place.
- Per-respondent JWTs via Supabase anonymous sign-in: rejected, adds auth users for every worker and complicates deletion.
- A separate `profiles` table with a global role: rejected, roles are per org per the policy skill; `admins` is the one global exception.
- Client-side Supabase calls for the worker (as today): rejected, would require anon policies on answer tables.
- Drag-and-drop ordering in the content editor: deferred, positions are edited as numbers.

## Proof
Paste into the PR:
1. `npm run typecheck` exits 0, `npm run build` lists routes `/`, `/login`, `/auth/callback`, `/no-access`, `/logout`, `/i/[token]`, `/i/[token]/[step]`, `/done`, `/admin`, `/admin/orgs/new`, `/admin/orgs/[orgId]`, `/admin/orgs/[orgId]/jobs/new`, `/admin/jobs/[jobId]`, `/admin/jobs/[jobId]/respondents/[rid]`, `/admin/jobs/[jobId]/results`, `/org`. No `/interview` or `/results`.
2. SQL via Supabase MCP after migration 5:
   - `select count(*) from pg_policies where roles @> '{anon}'` returns 0.
   - `set role anon; select count(*) from respondents;` returns 0 (and the same for `step_responses`, `ratings`, `interview_links`, `organizations`).
   - `set role anon; select interview_open('<derek token>')->>'status';` returns `open`.
   - `select count(*) from jobs where organization_id is null` returns 0; same for respondents, step_responses, ratings.
   - After cloning Derek: counts of steps, data_items, step_data_items, statements for the clone equal 8, 25, 47, 33.
3. Screens on the Vercel preview, listed with what was seen:
   - `/i/<derek token>` shows title, privacy sentence, resume note, role and name fields. Submit with empty role: error. Submit with role only: step 1.
   - Close tab, reopen `/i/<token>`: "Continue where you left off". Private window: fresh start form.
   - Finish all eight steps: `/done` with no links.
   - Revoke the link as admin, open `/i/<token>` in a private window: closed message. The in-progress respondent from before can still open its step URL.
   - `/admin` as Chris: org list with counts. `/org` as Chris: `/no-access` (admin is not a member). Log in as the contact email of a test org: `/org` shows link, closing date, counts; `/admin` redirects to `/no-access`.
   - `/admin/jobs/<id>/respondents/<rid>`: interview shown; `select count(*) from answer_views` increased by 1.
   - `/admin/jobs/<id>/results`: same charts and tables as before for the Derek job.

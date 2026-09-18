# Spec: organizations, client contacts, jobs, and interview links
From: intent.md (2026-09-18). Status: draft. Date: 2026-09-18.

## Concerns
1. **Resume only on the same browser.** Workers are anonymous, so "leave and come back" works through a cookie on the device they started on. Starting on a phone and finishing on a laptop is not possible without giving the worker an identity. Proposed: accept this, and say so on the first screen ("come back on this device").
2. **Login emails are sent by Supabase's built-in mailer** (from a supabase.io address, low hourly limit on the free plan). Fine for you and a handful of contacts. Before the first client engagement, a custom sender (Resend or similar, from your domain) should be a small follow-up intent. Not built here.
3. **Retention is stored, not yet automated.** Each org gets a `retention_days` setting and a "delete organization" action that cascades everything. Automatic purge on the deadline is a later intent. The policy skill says retention is a promise we keep; this release keeps it manually.
4. **The results page today is unscoped.** It reads every rating and step response in the database. It must be rewritten to filter by job. Not a policy conflict, but a bug that becomes a cross-client leak the moment a second org exists, so it is called out here.

## Requirements
Admin (Chris)
1. Admin logs in with a magic link. Non-admin, non-member emails that log in see a "no access" page and nothing else.
2. Admin sees all organizations with, per job, counts of interviews started and finished.
3. Admin creates an organization: name, contact name, contact email, retention days. Saving the contact email grants that email `org_viewer` membership; the contact logs in with a magic link to the same email.
4. Admin creates a job in an org by cloning any existing job (all steps, data items, step-to-item mapping, statements) or from the 8-step skeleton (steps with stage names and empty descriptions, no items, no statements).
5. Admin edits a job's title, executor name and role, description, step titles and descriptions, data items, which items appear at which step, and statements (text, step, data item).
6. Admin creates the job's interview link with a closing date and an optional respondent cap; can extend the date, change the cap, or revoke the link. One active link per job.
7. Admin sees the job's respondents (role, name if given, steps saved, finished or not, started at) and can open any individual interview. Opening one writes an audit row.
8. Admin sees results per job, identical in content to today's results page, filtered to that job.
9. Admin can delete an organization; everything under it is deleted.

Client contact
10. Contact logs in with a magic link and sees only their organization's jobs.
11. Per job: the interview link (copy button), the closing date, started count, finished count. Nothing else. No names, no answers, no results.

Worker
12. Opening a valid link shows the job title, the privacy sentence, and a form: role (required), name (optional). Submitting starts an interview and sets a cookie for that respondent on that browser.
13. Opening a link that is closed, revoked, or at its cap shows the closed message and no form.
14. A worker who started before the link closed can still finish. New starts are refused after close.
15. The interview steps work exactly as today (items, two ratings per statement, free text, back and next, reload saved answers). The done page no longer links to results.
16. A worker cannot read any other respondent's data, results, or content for other jobs, by any route or API call with the public key.

Data and security
17. Every table has RLS. The anon role has no policies on `respondents`, `step_responses`, `ratings`, or any admin table. Worker reads and writes go only through the database functions in the design.
18. Every row in `jobs`, `respondents`, `step_responses`, `ratings`, `interview_links`, `answer_views` carries `organization_id`, and every policy filters on it.
19. The existing Derek job, its content, and its two respondents are migrated into a first organization without loss.
20. `npm run typecheck` and `npm run build` pass.

## Design
### Data model
Migrations, in order:

`orgs_and_members`
- `organizations` (id, name, slug unique, contact_name, contact_email, retention_days int default 365, created_at)
- `admins` (email citext unique, user_id uuid null references auth.users)
- `memberships` (id, organization_id, email citext, role text check in ('org_viewer'), user_id uuid null, unique (organization_id, email))
- Trigger `claim_memberships` on `auth.users` insert: sets `user_id` on `admins` and `memberships` rows whose email matches. Helpers `is_admin()` and `member_of(org uuid)` (security definer, read `auth.uid()`).
- `jobs` gains `organization_id` not null (after backfill), `slug` unique becomes unique per `(organization_id, slug)`.

`interview_links_and_respondents`
- `interview_links` (id, organization_id, job_id, token text unique, closes_at timestamptz, revoked_at null, respondent_cap int null, created_at). Partial unique index: one row per job where `revoked_at is null`.
- `respondents`: `name` becomes nullable, add `organization_id`, `link_id`, `token_hash text unique` (sha256 of the respondent's secret; the secret itself lives only in the worker's cookie).
- `step_responses` and `ratings` gain `organization_id`.
- `answer_views` (id, organization_id, respondent_id, viewer_user_id, viewed_at).

`backfill_first_org`
- Insert organization "CdrAppDev (internal)" slug `internal`, contact you. Set `organization_id` on the Derek job and all existing respondents, step responses, ratings. Insert your email into `admins`. Create an interview link for the Derek job closing in 30 days.

`interview_functions` (all `security definer`, granted to anon, each validates the token first)
- `interview_open(link_token)` returns job title, description, executor, steps list, and status (`open`, `closed`, `full`). No answers.
- `interview_start(link_token, role, name)` checks open and cap, inserts respondent, returns respondent id and a fresh secret. Rejects empty role.
- `interview_step(link_token, respondent_secret, position)` returns step content, items, statements, and that respondent's saved answers for the step. Allowed after close if the respondent exists.
- `interview_save(link_token, respondent_secret, step_id, data_item_ids, other_data, free_text, ratings jsonb)` upserts step response and ratings for that respondent only. Allowed after close.
- `interview_finish(link_token, respondent_secret)` sets `completed_at`.
Tokens: link token is 32 random bytes, base64url. Respondent secret likewise; only its hash is stored.

`tenant_rls`
- Drop every existing policy. New policies:
  - Content tables (`jobs`, `steps`, `data_items`, `step_data_items`, `statements`): select and all writes for `is_admin()`. Select for `member_of(organization_id)` on `jobs` only (contacts need job titles, not statements). No anon policies; workers get content through the functions.
  - `organizations`: admin all; `member_of(id)` select.
  - `memberships`, `admins`: admin all; a user can select their own rows.
  - `interview_links`: admin all; `member_of(organization_id)` select.
  - `respondents`: admin select, update, delete. Contacts get counts through a view `job_progress` (job_id, organization_id, started, finished) with `security_invoker = off` and a policy-equivalent `where member_of(organization_id) or is_admin()` inside the view. No direct contact access to `respondents`.
  - `step_responses`, `ratings`, `answer_views`: admin only.
- `is_admin()` and `member_of()` are the only functions policies call.

### Access control
| Actor | Mechanism |
|---|---|
| Admin, contact | Supabase Auth magic link. Session in httpOnly cookies via `@supabase/ssr`. Server components and server actions use the user's session, so RLS applies with the `authenticated` role. |
| Worker | No session. Link token in the URL; respondent secret in an httpOnly cookie `jtbd_r` scoped to `/i/<token>`, 30 days. Server actions call the `interview_*` functions with the anon key. Anon has no table policies, so nothing else is reachable. |
| Audit | Admin opening `/admin/.../respondents/[rid]` inserts into `answer_views` before rendering. |
| Secrets | None new. The publishable key stays public. No service role key in the app. |

Middleware: `/admin/*` requires `is_admin()`, `/org/*` requires a membership, else redirect to `/login` or `/no-access`.

### Routes and screens
Worker
- `/i/[token]`: job title, the privacy sentence, role and name form. Closed, revoked, or full: closed message only. If the `jtbd_r` cookie is present and valid, a "continue where you left off" button instead of the form.
- `/i/[token]/[step]`: the step form, as today.
- `/done`: thanks, no links.
- `/` redirects to `/login`. `/interview/*` and `/results` are removed.

Auth
- `/login`: email field, sends magic link. `/auth/callback`: exchanges the code, then routes admins to `/admin`, members to `/org`, others to `/no-access`.

Admin
- `/admin`: organizations, each with jobs and started/finished counts. New organization button.
- `/admin/orgs/new`, `/admin/orgs/[orgId]`: details, contact, retention, jobs, delete organization (confirm by typing the org name).
- `/admin/orgs/[orgId]/jobs/new`: clone from a picker of all jobs, or skeleton.
- `/admin/jobs/[jobId]`: three tabs on one page. *Content*: editable job fields, steps, data items, per-step item checklist, statements. *Link*: create, closing date, cap, copy, extend, revoke. *Respondents*: table with open links to individuals.
- `/admin/jobs/[jobId]/respondents/[rid]`: one interview, step by step, read only.
- `/admin/jobs/[jobId]/results`: today's results page, scoped.

Contact
- `/org`: their organization's jobs. Per job: link with copy button, closing date, started, finished.

All screens use the existing CSS tokens and components. Plain forms with server actions. No new UI library. `@supabase/ssr` is added for cookie sessions.

### External systems
- Supabase Auth (magic link). Failure: login page shows "Couldn't send the link. Try again in a minute."
- No other integrations in this release.

## Copy
- First screen privacy sentence: "Your answers go to [Chris's company name], who is helping [Org name] understand how this job works today. [Org name] will see how many people have finished, not what anyone said. Come back on this device to pick up where you left off."
- Role field label: "Your role". Help: "What you do, not your title. For example: delivery lead, account executive."
- Name field label: "Your name (optional)".
- Closed message: "This interview has closed. If you think that is a mistake, ask the person who sent you the link."
- Full message: same as closed.
- Continue button: "Continue where you left off".
- Done page: "Thanks. That's the whole job. Your answers are saved."
- Login: "Sign in". "Enter your email and we'll send you a link." Sent: "Check your email for a sign-in link."
- No access: "This email doesn't have access. If you were expecting to sign in, ask the person who set up your interview."
- Contact page, per job: "Interview link", "Closes on [date]", "[n] started, [n] finished".
- Copy button: "Copy link". After: "Copied".

## Out of scope
Carried from intent: contact results view, per-worker links, email sending, branding, Slack, transcripts, deleting the Smoke Test respondent. Deferred by this design: cross-device resume for workers, automatic retention purge, custom login email sender, drag-and-drop reordering in the content editor (positions are edited as numbers).

## Open questions
None.

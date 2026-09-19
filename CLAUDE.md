# JTBD interview app

A form-based interview that walks a worker through the eight steps of a job (Ulwick's universal job map: Define, Locate, Prepare, Confirm, Execute, Monitor, Modify, Conclude). At each step the worker checks the data they use, rates a few statements on importance (1–5) and how well it works today (1–5), and adds free text. A results page scores every statement on the ODI 0–20 scale and rolls the scores up to data items, sorting them into migration buckets.

Purpose: test whether ODI/JTBD can scope a data migration. "Migrate data from A to B" is the customer's solution, not anyone's job; the job is what workers do with the data. Every stakeholder (including legal and finance) is a job executor and gets interviewed. Only true constraints (laws, target-system limits, cutover dates) live on a separate checklist.

This is an internal mock run. The seeded job is Derek, an account executive at a Salesforce implementation partner: "Put together the statement of work for a deal that's been approved to move forward." Internal teammates answer in Derek's shoes.

## Development process

This repo follows the AI-native SDLC loop described in `.claude/skills/asdlc/SKILL.md`. Every change is a chain of committed artifacts under `intent/<nnn>-<slug>/`: `intent.md` (what and why), `spec.md` (requirements and design with policy applied), `plan.md` (files, order, proof). Chris accepts each gate by setting `Status: accepted`. No implementation starts without an accepted `plan.md`. Stage commands: `/asdlc-intent`, `/asdlc-spec`, `/asdlc-plan`. Reviews follow `REVIEW.md`.

Policy skills, loaded during spec and review: `voice` (language rules) and `data-security` (access control, tenancy, transcripts).

## Verifying your work

- Typecheck: `npm run typecheck` (must print nothing and exit 0)
- Build: `npm run build` (must finish with "Compiled successfully")

Run both before reporting any build task complete, and paste the output. There is no lint or test suite yet; adding them is a candidate intent. Never weaken a check to make it pass.

## Language rules (client-facing and in-app)

Full rules in `.claude/skills/voice/SKILL.md`. The short version:

- Workers "get interviewed," never "take a survey."
- Plain language. No framework jargon in the UI: say "friction," "how well it works today," "what to fix," not "outcome statements" or "opportunity algorithm."
- No em-dashes in copy.

## Stack

- Next.js 14 (app router), TypeScript, plain CSS in `app/globals.css`. No Tailwind, no UI library.
- Supabase Postgres. The publishable (anon) key has no table policies at all; workers reach the database only through the `interview_*` functions (`lib/interview.ts`), with the link token from the URL and a respondent secret in an httpOnly cookie scoped to `/i/<token>`. Signed-in users (Supabase Auth magic link, cookie sessions via `@supabase/ssr`, `lib/supabase-server.ts`) query tables directly and RLS decides: `is_admin()` sees everything, `member_of(org)` sees that org's jobs, links and counts. Policy: `.claude/skills/data-security/SKILL.md`.
- Fonts: Newsreader (display) + Public Sans (body) via Google Fonts. Palette tokens are in `globals.css`, light and dark.

## Supabase

- Project: `jtbd-interview`, ref `xmfyhcxfyzandkpmbfbo`, region us-east-1, org "CdrAppDev's Org" (free plan, 2-project cap).
- URL: `https://xmfyhcxfyzandkpmbfbo.supabase.co`
- Publishable key: `sb_publishable_UeW98UzhC_HoGthDOR8KOg_56n7n2R2` (public by design; defaults are in `lib/supabase.ts`, override with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Migrations applied, in order: `interview_schema`, `seed_derek_sow_job`, then intent 002's `orgs_and_members`, `interview_links_and_respondents`, `backfill_first_org`, `functions_and_views`, `functions_extension_schema`, `tenant_rls`. Copies are in `supabase/migrations/`. Apply new ones with the Supabase MCP `apply_migration` tool and commit the SQL file alongside.
- Auth: Supabase Auth email magic links, sent by Supabase's built-in mailer for now (low hourly limit). In the dashboard, Authentication, URL Configuration: Site URL `https://jtbd-interview.vercel.app`, redirect URLs `https://jtbd-interview.vercel.app/auth/callback`, `https://*-chris-projects-2b749b6c.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`. Magic links use the PKCE code flow, so the link must be opened in the browser that requested it.
- Admins are rows in `admins` (by email; `user_id` is linked on first login by the `claim_memberships` trigger). Chris's email is seeded. Contacts are `memberships` rows with role `org_viewer`, created from the org's contact email.

### Tables

- `organizations` (name, slug, contact, `retention_days`), `admins` (email, user_id), `memberships` (org, email, role `org_viewer`, user_id).
- `jobs` (per org, slug unique per org), `steps` (8, `position` + `stage` + plain `title`/`description`), `data_items` (keyed), `step_data_items` (which items are offered at each step), `statements` (each points at one `data_item_id`).
- `interview_links` (one active per job: token, `closes_at`, `revoked_at`, `respondent_cap`).
- `respondents` (org, link, role required, name optional, `token_hash`, completed_at), `step_responses` and `ratings` (both carry `organization_id`), `answer_views` (audit: who opened which respondent, when).
- View `job_progress` (started, finished per job) is how contacts get counts without row access.
- Functions: `interview_open/start/resume/step/save/finish` (anon), `clone_job`, `skeleton_job` (admin), `is_admin()`, `member_of(org)`.
- Content lives in the DB and is edited in the admin job page.

There is one test respondent named "Smoke Test" in the DB. Delete it before the real run:
`delete from respondents where name = 'Smoke Test';` (cascades). The Derek job lives in the internal organization (slug `internal`) with a link that closes 30 days after 2026-09-18; extend it from the job page.

## Scoring (results page)

- Per statement: importance and satisfaction are means of the 1–5 ratings, doubled to a 0–10 scale. Score = importance + max(importance − satisfaction, 0), range 0–20.
- Tiers: 15+ fix first, 12–15 high friction, 10–12 worth watching, under 10 works well enough.
- Data buckets: "Move carefully" if any statement pointing at the item scores 12+; "Move" if anyone checked it or a statement scores 10+; "Leave behind" otherwise.
- Charts: opportunity landscape scatter (importance vs works-today, dashed diagonal, underserved below it), ranked bars, data-item table, full statement table, free-text comments.

## Routes

Worker (no account): `/i/[token]` start screen with the privacy sentence, role (required) and name (optional), or "continue" if the cookie is present; `/i/[token]/[step]` one step per screen; `/done`. Closed, revoked or full links show the closed message. Resume works only in the browser that started.

Auth: `/login` (magic link), `/auth/callback`, `/logout` (POST), `/no-access`. `/` redirects to `/login`. Middleware sends signed-out visitors of `/admin/*` and `/org/*` to `/login`.

Admin (`is_admin()`): `/admin` organizations with counts; `/admin/orgs/new`, `/admin/orgs/[orgId]` (details, contact, retention, delete by typing the name); `/admin/orgs/[orgId]/jobs/new` (clone or skeleton); `/admin/jobs/[jobId]` (link, respondents, job, steps, data items, what's offered per step, statements); `/admin/jobs/[jobId]/respondents/[rid]` (one interview, writes an audit row); `/admin/jobs/[jobId]/results` (the results page, scoped to the job). Server actions in `app/admin/actions.ts`.

Contact (`org_viewer`): `/org` their jobs with link, closing date, started and finished counts. Nothing else.

Development process artifacts: `intent/002-orgs-and-links/` holds the intent, spec and plan for this shape of the app.

## Run

```
npm install
npm run dev
```

## Deploy

Vercel, team "Chris' projects" (`team_qjcwaOCujkwW7oKLhxvRMqhS`). Import this repo as a new project; Next.js is auto-detected, no env vars required.

## Fellow and the LLM (intent 004)

- Fellow workspace: `https://dxfoundation.fellow.app/`. `FELLOW_SUBDOMAIN` is `dxfoundation`.
- The Developer API is switched on. Chris created a personal key named "JTBD Interview" on 2026-09-18; it is `FELLOW_API_KEY`, a server-side secret set in Vercel, never in the repo. Webhooks are not enabled on the workspace and intent 004 does not need them.
- The app calls Anthropic under its own DX Foundation developer platform account with its own API key (`ANTHROPIC_API_KEY`), separate from Chris's Claude Max plan, which covers build sessions only.
- Cost of a run: about $0.30 per transcript hour to find the jobs, about $0.10 per transcript hour per interview draft. Ceiling per run is `ENGINE_MAX_INPUT_TOKENS`.

## Next up

1. Chris: set the Supabase Auth URLs (above), sign in at `/login`, walk the proof screens in `intent/002-orgs-and-links/plan.md`.
2. Delete the Smoke Test respondent, share the Derek link (from the job page) with the team.
3. Intents 003 (branding and Slack) and 004 (transcripts and job identification) are drafted under `intent/`.
4. Follow-up intents noted in the 002 spec: custom login email sender, automatic retention purge, contact results view.
5. Read the free-text answers after the first few interviews; add missing data items and statements in the admin job page.

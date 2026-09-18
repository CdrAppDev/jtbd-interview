# Intent: multi-org, multi-job interview platform (v1)
Author: Chris. Status: draft. Date: 2026-09-18.

## Problem
The app can only run one job, for one implied organization, with no access control. Content is seeded by hand in SQL, the results page is public, and any visitor with the anon key can read every answer. To use this with real clients I need to set up a job for an organization, send them one link they can share with many workers, get notified as interviews complete, and see results scoped to that job, without workers creating accounts and without one client ever seeing another's data.

Identifying the jobs in the first place is manual today. I read transcripts of client conversations (captured in Fellow) and work out which jobs to interview for.

## Proposed outcome
- I log in, create an organization, create a job for it (from a template or by cloning an existing job), and generate a share link with an expiry.
- The org contact forwards that link internally. Workers open it, see one sentence about who sees their answers, enter role (required) and name (optional), and get interviewed. No sign-up.
- I get a Slack message each time an interview is completed: org, job, role, running count.
- I see results per job, and can read individual interviews as they land.
- Every screen carries my company's branding, with the client's name and logo alongside it.
- I can load client transcripts (manually at first, automatically from Fellow later). A job identification pass proposes candidate jobs with supporting quotes. I accept, reject, or edit each one. Accepted candidates become draft jobs, and a second pass drafts the steps, data items, and statements for me to edit.

## Affected users and systems
- Chris (admin): all screens except the interview itself.
- Org contact: receives the link; optionally a results-only login later.
- Workers: the interview, via link only.
- App: every route, the Supabase schema and RLS, Supabase Auth, a Slack incoming webhook, Fellow API, an LLM for job identification.

## Constraints
- Workers must be able to complete an interview anonymously. Follow the `data-security` skill: link-scoped writes, expiring and revocable links, all reads of answers and transcripts behind authenticated server code, tenancy enforced in RLS, audit log, retention setting.
- Transcripts are the most sensitive data in the system. Admin-only access unless a later intent says otherwise.
- Keep the existing stack: Next.js 14 app router, TypeScript, plain CSS, Supabase. No UI library.
- All user-facing copy follows the `voice` skill.
- Job identification produces proposals only. Nothing becomes a job without my acceptance.
- Supabase free plan for now (two-project cap).

## Out of scope
- Org contacts logging in to see results (decide per engagement; design so it can be added).
- Full white-labelling (custom domains, hiding my brand).
- Automatic Fellow sync in the first release; manual transcript upload is enough to start.
- Changing the scoring or the migration bucket labels. That is a separate copy decision.
- Second seeded job (finance or audit executor).

## Open questions
- One shared link per org, or one link per worker? Leaning shared link with expiry and optional respondent cap.
- Does the Fellow plan include API access, and does the API expose full transcripts or only notes?
- Which LLM and prompt shape for job identification, and how are proposals stored so re-runs do not resurface rejected ones?
- Sequencing: is the order (1) orgs and links, (2) branding and Slack, (3) transcripts and job identification right?
- Does the org contact get a completion count view without a login, or only through me?

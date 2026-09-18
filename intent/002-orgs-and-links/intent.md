# Intent: organizations, jobs, and share links
Author: Chris. Status: draft. Date: 2026-09-18.

## Problem
The app runs one job for one implied organization with no access control. The results page is public and any visitor with the anon key can read every answer. I cannot set up a job for a client, send them one link to share with their workers, or see results for that job alone. Job content is seeded by hand in SQL.

## Proposed outcome
- I log in (magic link, my email only). I see a list of organizations and their jobs with a completion count for each.
- I create an organization (name, contact email). I create a job for it by cloning an existing job or starting from the 8-step skeleton, then edit the job statement, step descriptions, data items, and statements in the app.
- I generate a share link for the job with an expiry date. I can revoke it. I copy it and send it to the org contact myself.
- A worker opens the link, reads one sentence saying who sees their answers and what they are used for, enters role (required) and name (optional), and gets interviewed exactly as today. They can leave and come back. No account.
- On the job page I see respondents as they arrive (role, name if given, step reached, completed) and can open any individual interview.
- Results are per job, behind my login. The results page itself is unchanged.
- One client can never see another client's data, and a worker can never read anyone's answers.

## Affected users and systems
- Chris: every admin screen.
- Workers: the interview, reached only via a link.
- App: new admin routes, the interview route, Supabase schema (organizations, jobs gain organization_id, share links, respondents gain organization_id and link), RLS on every table, Supabase Auth.

## Constraints
- Follow the `data-security` skill in full: link-scoped writes, expiry and revocation checked server-side, reads of answers only through authenticated server code, tenancy in RLS, audit log of who viewed individual answers, retention setting on the org.
- Follow the `voice` skill for all copy, especially the privacy sentence.
- Keep the stack: Next.js 14 app router, TypeScript, plain CSS, Supabase free plan.
- The existing seeded job (Derek, SOW) becomes the first job of a first organization. Existing responses are preserved.

## Out of scope
- Any login for the org contact. Design roles so `org_viewer` can be added later without a schema change.
- Branding, Slack notifications (003). Transcripts and job identification (004).
- Deleting the Smoke Test respondent (do it in the DB before the real run, as noted in CLAUDE.md).

## Open questions
- One shared link per org, or one link per worker? Leaning shared link with expiry and an optional respondent cap.
- Does the org contact get a completion count without a login (a public "7 of 10 done" page on the link), or only through me?

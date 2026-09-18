# Intent: organizations, client contacts, jobs, and interview links
Author: Chris. Status: accepted. Date: 2026-09-18.

## Problem
The app runs one job for one implied organization with no access control. The results page is public and any visitor with the anon key can read every answer. I cannot set up a job for a client, give their contact a link to share with workers, see how many interviews are done, or see results for that job alone. Job content is seeded by hand in SQL.

## Proposed outcome
### My side (admin)
- I log in (magic link to my email). I see every organization, its jobs, and a count of interviews started and finished for each.
- I create an organization (name, contact name, contact email) and invite the contact. She gets a magic-link login.
- I create a job for an organization by cloning an existing job or starting from the 8-step skeleton, then edit the job statement, step descriptions, data items, and statements in the app.
- Each job has one shared interview link. I set the date it closes and can extend it or revoke it.
- On the job page I see respondents as they arrive (role, name if given, step reached, finished or not) and can open any individual interview.
- Results are per job, behind my login. The results page itself is unchanged (ODI scoring, tiers, landscape chart, data-item buckets, free-text comments).

### The client contact's side
- She logs in and sees only her organization's jobs.
- For each job she sees the interview link, the closing date, and a running count: started and finished. She copies the link and pastes it into her own email or Slack to the workers she chooses. The app sends no email.
- She sees no names, no answers, no results. A results view for contacts (aggregates only, never free text or individual interviews) is a later intent, decided per engagement.

### The worker's side
- Opens the link. Reads one sentence saying who sees their answers and what they are used for. Enters role (required) and name (optional). Gets interviewed exactly as today. Can leave and come back. No account.
- After the closing date the link shows "this interview has closed."

## Decisions made
- Answers are anonymous. The app never ties an answer to an email address or invite. Name is voluntary.
- One shared link per job, not one per worker. Expiry and an optional respondent cap limit a leaked link.
- The client contact is a user of the app with a login, but a small one: jobs, link, closing date, counts.
- No email sending from the app. The contact distributes the link herself so it arrives from someone workers know.
- A link has an optional respondent cap in this release.
- A worker who started before a link closed or was revoked may finish their interview. New starts are refused.

## Affected users and systems
- Chris: every admin screen.
- Client contact: her own screen.
- Workers: the interview, reached only via a link.
- App: new admin and contact routes, the interview route, Supabase schema (organizations, memberships with roles, jobs gain organization_id, interview links, respondents gain organization_id and link), RLS on every table, Supabase Auth.

## Constraints
- Follow the `data-security` skill in full: link-scoped writes, expiry and revocation checked server-side, reads of answers only through authenticated server code, tenancy in RLS, roles per org membership (`admin`, `org_viewer` for the contact), audit log of who viewed individual answers, retention setting on the org.
- Follow the `voice` skill for all copy, especially the privacy sentence and the closed-link message.
- Keep the stack: Next.js 14 app router, TypeScript, plain CSS, Supabase free plan.
- The existing seeded job (Derek, SOW) becomes the first job of a first organization. Existing responses are preserved.

## Out of scope
- A results view for the client contact (later intent).
- Per-worker invite links and email sending.
- Branding, Slack notifications (003). Transcripts and job identification (004).
- Deleting the Smoke Test respondent (do it in the DB before the real run, as noted in CLAUDE.md).

## Open questions
None. Both earlier questions resolved into Decisions made.

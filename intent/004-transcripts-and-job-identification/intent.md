# Intent: transcripts and job identification
Author: Chris. Status: draft. Date: 2026-09-18.

## Problem
Identifying which jobs to interview for is manual. I read transcripts of client conversations (captured in Fellow) and work out the jobs myself, then write the steps, data items, and statements by hand. This is the slowest part of setting up an engagement and the part where my judgment matters most.

## Proposed outcome
- I load transcripts into an organization. Manual upload first (paste or file); automatic pull from Fellow later, matched to orgs by attendee email domain with an unmatched queue.
- I run job identification. It reads every transcript for the org and proposes candidate jobs, each with the job statement in job-map form, who executes it, and the transcript quotes that support it.
- I review each candidate: accept, reject with a reason, or edit the wording. Rejected candidates stay recorded so a re-run on new transcripts does not resurface them.
- For an accepted candidate I run interview drafting. It proposes the 8 step descriptions, data items, and statements, citing transcript evidence. It lands as a draft job in the org that I edit before generating a link (002).
- Nothing becomes a job without my acceptance. The engine only proposes.

## Affected users and systems
- Chris only. No client or worker sees any of this.
- App: transcripts table and storage, candidates table, admin screens for upload, review, and drafting, an LLM integration, later the Fellow API.

## Constraints
- Transcripts are the most sensitive data in the system. Admin-only, audit-logged reads, covered by the org's retention setting, deleted with the org (`data-security` skill).
- The LLM is called from server code with the API key in a server-side secret. Transcripts are sent only for the org being processed.
- Prompts encode the JTBD rules from CLAUDE.md: jobs are what workers do, not solutions; every stakeholder is a job executor; constraints (laws, system limits, dates) are separate and not jobs.
- Depends on 002 (organizations and jobs must exist).

## Out of scope
- Any automated acceptance of candidates.
- Fellow sync in the first release.
- Analysis of interview answers (that is the existing results page).

## Open questions
- Does the Fellow plan include API access, and does the API expose full transcripts or only notes and summaries?
- Which model, and what is the budget per run? Transcripts for an engagement could be many hours of conversation.
- How should candidates and rejections be stored so re-runs are idempotent?
- Should the two passes (identify jobs, draft interview) be one screen or two?

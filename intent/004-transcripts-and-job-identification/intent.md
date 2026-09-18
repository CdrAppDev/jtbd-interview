# Intent: transcripts and job identification
Author: Chris. Status: accepted. Date: 2026-09-18.

## Problem
Identifying which jobs to interview for is the slowest part of setting up an engagement, and I do not want to do it by hand. The evidence is already recorded: client conversations captured in Fellow. Today nothing connects those transcripts to the interview app. I need the app to read the transcripts for an organization, tell me which jobs it found and why, and draft the interview content, so that my part is judging proposals, not writing them.

## Proposed outcome
### Getting transcripts in
- Fellow is connected through its Developer API (key held server-side as `FELLOW_API_KEY`). On an organization's page I open "Transcripts", see recent Fellow meetings (title, date, attendees), tick the ones that belong to this client, and import them. The transcript text, speakers and timestamps are stored under the organization.
- I can also paste a transcript by hand, for conversations that are not in Fellow.
- Each transcript shows its source, date, and which candidate jobs cite it.

### Finding the jobs
- I press "Find the jobs". The engine reads every transcript for the organization and proposes candidate jobs. Each candidate has: the job statement in job-map form, who executes it (one role), a one-paragraph explanation, and the transcript quotes that support it, each quote linked to its transcript and speaker.
- Candidates that are solutions in disguise ("migrate the data", "buy a tool") or constraints (laws, system limits, dates) are listed separately as "not a job", with the reason, so I can see what was filtered out.
- I review each candidate: accept, reject with a reason, or edit the wording and executor. Rejected candidates stay recorded so running it again after new transcripts does not resurface them.

### Drafting the interview
- For an accepted candidate I press "Draft the interview". The engine proposes the eight step descriptions, the data items, which items appear at which step, and the statements, each with the transcript evidence that motivated it.
- It lands as a draft job in the organization. I edit it on the existing "Edit the job content" page and create the link as today (002).
- Nothing becomes a job without my acceptance. The engine only proposes.

## Decisions made
- Fellow API on demand is the primary path (I choose the meetings). Automatic sync and matching by attendee domain is a later intent.
- Paste is the fallback, not a separate feature: same storage, same engine.
- The engine's output has to be good enough that review is accept or reject, not rewrite. Quotes on every proposal are what make review fast.

## Affected users and systems
- Chris only. No client or worker sees any of this.
- App: transcripts and candidates tables and storage, admin screens for import, review and drafting, the Fellow API, an LLM called from server code.

## Constraints
- Transcripts are the most sensitive data in the system. Admin-only, every read audited, covered by the organization's retention setting, deleted with the organization (`data-security` skill).
- `FELLOW_API_KEY` and the LLM key are server-side secrets. Transcripts are sent to the LLM only for the organization being processed, never mixed across clients.
- Prompts encode the JTBD rules from CLAUDE.md: jobs are what workers do, not solutions; every stakeholder is a job executor; constraints (laws, system limits, dates) are separate and not jobs. Output follows the `voice` skill.
- Keep the stack: Next.js 14, TypeScript, plain CSS, Supabase free plan. Long transcripts must not exceed serverless time limits: processing runs in the background with progress shown in the app.
- Depends on 002 (shipped).

## Out of scope
- Automatic Fellow sync, webhooks, matching meetings to organizations by attendee domain.
- Any automated acceptance of candidates.
- Analysis of interview answers (that is the results page).
- Branding and Slack (003).

## Decisions at acceptance
- Build the Fellow import and transcript viewer first and use real imported transcripts to design and tune the job-identification prompts, rather than working from a pasted sample.

## Open questions
- Which LLM and what budget per run? A client engagement may be many hours of transcript; the spec must give a cost figure per "Find the jobs" run before the first real use.
- Should the engine also propose a second-pass merge when two candidates are the same job in different words, or leave that to Chris? Spec proposes; Chris decides there.

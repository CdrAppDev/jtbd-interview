# Spec: transcripts and job identification
From: intent.md (2026-09-18). Status: draft. Date: 2026-09-19.

## Concerns
1. **Cost per run is small but real.** Model: Claude Opus 5 (`claude-opus-5`, $5 per million input tokens, $25 per million output). A one-hour meeting is roughly 12,000 tokens. Ten hours of transcripts: "Find the jobs" costs about $0.60 of input plus about $0.25 of output per pass, and the design runs two passes (one per transcript, then one merge), so under $2 per run; "Draft the interview" for one job, about $1. The app shows the estimate before you confirm a run and refuses runs over a cap (default 40 hours of transcript, changeable in settings). Follow-up runs on the same transcripts use prompt caching and cost less.
2. **Serverless time limits.** One model call over ten hours of transcript can take minutes; Vercel functions on this plan stop at 300 seconds. So a run is a sequence of short steps saved in the database and resumed by the next request, never one long call. The UI polls and shows "3 of 7 transcripts read". If Vercel's limit turns out lower on the current plan, the same design works with smaller steps; nothing else changes.
3. **Fellow access follows your login.** The API key only sees recordings you can see in Fellow (you attended, or it was shared with you). Meetings a colleague ran without you will not appear. Not a policy conflict, but worth knowing before an engagement.
4. **Transcripts leave Supabase for the model.** Sending client conversations to Anthropic's API is a new data flow. It is permitted by the `data-security` skill (server-side secret, one organization per request), but it should be in the client-facing data summary from intent 002's concern list. Proposed: accept, and add one line to that summary.
5. **Transcript reads are audited as views, not as bytes.** Opening a transcript writes an audit row; running the engine writes one row per transcript per run. Matches the policy's spirit without logging content.

## Requirements
Transcripts in
1. Admin opens an organization's "Transcripts" page and sees imported transcripts (title, date, duration, word count, source, which candidates cite it) and a "Bring in from Fellow" button.
2. "Bring in from Fellow" lists recordings from Fellow newest first, 20 per page, with title, start time, duration, and whether already imported. Admin can filter by title text and by date range. Admin ticks recordings and imports them; each becomes a transcript under the organization with speakers, timestamps and text. Importing the same recording twice does nothing.
3. Admin can paste a transcript (title, date, text). Speaker labels of the form `Name:` at line starts are recognised; otherwise the whole text is one segment.
4. Admin can open a transcript and read it with speaker labels. Opening writes an audit row.
5. Admin can delete a transcript. Candidates keep their quotes (copied at run time) but the link to the transcript shows "deleted".

Finding the jobs
6. Admin presses "Find the jobs". The app shows the estimate (hours of transcript, approximate cost) and asks to confirm. A run starts; the page shows progress and the result when done. A failed run says why and can be retried.
7. A run reads every transcript in the organization and produces candidates. Each candidate has: a job statement in job-map form (verb, object, context; no solution words), one executor role, a one-paragraph explanation, and one to five quotes, each with transcript, speaker, timestamp, and the exact words.
8. Things that are not jobs (solutions, constraints, complaints without a job behind them) are listed under "Not a job" with the reason.
9. Candidates previously rejected are passed into the run with their reasons; the run must not resurface the same job. Candidates previously accepted are also passed in so the run reports "already accepted" rather than duplicating them.
10. Admin reviews each candidate: accept, reject with a reason, or edit the statement and executor role then accept. Decisions are recorded with who and when.

Drafting the interview
11. For an accepted candidate, admin presses "Draft the interview". A run produces: eight step descriptions (one per stage of the job map, in the executor's words), data items (the information the executor uses), which items appear at which step, and statements (one to six per step, each pointing at one data item), each with the quotes that motivated it.
12. The result becomes a job in the organization (slug from the statement), marked as drafted from the candidate, with the evidence stored on each statement and data item. It opens in the existing content editor. Creating the link is unchanged (002).
13. Drafting the same candidate again replaces nothing: it creates a second draft job, so the first is never lost.

Data and security
14. New tables carry `organization_id` and are admin-only in RLS. No member or anon policies. Transcripts are never sent to the client browser except on the transcript page an admin opened.
15. `FELLOW_API_KEY`, `FELLOW_SUBDOMAIN`, `ANTHROPIC_API_KEY` are server-side environment variables. The app never logs transcript text or API keys.
16. Each model request contains transcripts from exactly one organization.
17. Deleting an organization deletes its transcripts, runs and candidates.
18. `npm run typecheck` and `npm run build` pass.

## Design
### Data model
Migrations in order:

`transcripts`
- `transcripts` (id, organization_id, source text check in ('fellow','paste'), fellow_recording_id text unique null, title text, started_at timestamptz, duration_seconds int null, speakers text[], segments jsonb, text text, word_count int, imported_by uuid, created_at, deleted_at timestamptz null). `segments` is `[{start, end, speaker, text}]` in Fellow's shape. `text` is the flattened "Speaker: text" form the model reads.
- `transcript_views` (id, organization_id, transcript_id, viewer_user_id, purpose text check in ('read','run'), run_id uuid null, viewed_at).
- RLS: `admin_all` on both. Enable RLS.

`job_runs_and_candidates`
- `job_runs` (id, organization_id, kind text check in ('identify','draft'), status text check in ('queued','running','done','failed'), candidate_id uuid null, model text, steps jsonb, step_index int default 0, input_tokens int default 0, output_tokens int default 0, estimated_usd numeric, error text, created_by uuid, created_at, updated_at, finished_at). `steps` is the ordered list of work items, each `{type, transcript_id?, status, result?}`; the runner executes `steps[step_index]` and advances.
- `job_candidates` (id, organization_id, run_id, statement text, executor_role text, explanation text, quotes jsonb, status text check in ('proposed','accepted','rejected','not_a_job'), reason text null, edited_statement text null, edited_executor_role text null, job_id uuid null references jobs on delete set null, decided_by uuid null, decided_at timestamptz null, created_at). `quotes` is `[{transcript_id, transcript_title, speaker, start, text}]`, copied at run time.
- `jobs` gains `candidate_id uuid null references job_candidates on delete set null`. `statements` and `data_items` gain `evidence jsonb null` (same quote shape).
- RLS: `admin_all` on both new tables. Enable RLS.

### Access control
Everything in this intent is admin-only: pages under `/admin/orgs/[orgId]/transcripts` and `/admin/orgs/[orgId]/jobs/find` call `requireAdmin()`, server actions call it again, RLS enforces it. The run executor route (`POST /api/runs/[id]/step`) accepts only requests carrying a run token stored on the run row and generated when the run starts, so a browser cannot drive someone else's run; it also runs `requireAdmin()` when a session is present. Transcript text is read server-side only; the transcript page renders it for the admin who opened it and writes a `transcript_views` row first.

### The Fellow adapter (`lib/fellow.ts`)
- Base URL `https://${FELLOW_SUBDOMAIN}.fellow.app/api/v1`, header `X-API-KEY`. All list calls are `POST` with a JSON body.
- `listRecordings({cursor, pageSize, title, createdAtStart, createdAtEnd})` calls `POST /recordings` with `pagination` and `filters`, no transcript, returns `{data, page_info.cursor}`.
- `fetchTranscript(recording)` gets the transcript for one recording. First try `GET /recording/{id}`; if the response has no `transcript`, call `POST /recordings` with `include: {transcript: true}` and `filters: {created_at_start, created_at_end}` set to the recording's creation day and pick the matching id. The plan records which path works.
- Respect 3 requests per second: a small queue with 350 ms spacing; retry once on 429 after the `Retry-After` header or 2 seconds.
- Errors surface as one line on the page: "Couldn't reach Fellow. Check the API key in Vercel." No transcript text in logs.

### The engine (`lib/engine/`)
- Client: `@anthropic-ai/sdk`, model `claude-opus-5`, adaptive thinking (default), `output_config.effort: "high"`, structured outputs (`output_config.format` with a JSON schema) so every response is machine-readable; streaming with `stream.finalMessage()` so long outputs never hit HTTP timeouts. Prompt caching: the system prompt and the JTBD rules are the stable prefix with `cache_control`; transcripts follow.
- `identify` run, steps: one `extract` step per transcript, then one `merge` step.
  - `extract(transcript)`: system prompt carries the job-map rules (a job is a goal the executor is trying to achieve, independent of solutions; every stakeholder is an executor of their own job; constraints are not jobs). Output: candidate jobs found in this transcript with quotes (exact words, speaker, timestamp) and a "not a job" list. Roughly 12,000 input tokens per hour of meeting, about 2,000 output.
  - `merge(all extracts, prior accepted, prior rejected)`: deduplicates across transcripts, keeps the strongest quotes (max five), writes the explanation, marks duplicates of accepted candidates as "already accepted", drops anything matching a rejected candidate and says so. Output becomes `job_candidates` rows.
- `draft` run, steps: one `evidence` step per transcript that the candidate's quotes came from (or all transcripts, if fewer than six), then one `compose` step.
  - `evidence(transcript, candidate)`: pulls everything in this transcript about this job: what the executor does at each stage, what information they use, where it goes wrong. Output: notes with quotes.
  - `compose(candidate, all evidence)`: produces the eight steps, data items, step-to-item mapping, and statements with evidence, in the `voice` skill's language (plain, no framework words, short). Output is inserted through `skeleton_job` plus direct inserts in one transaction.
- Cost: the run row accumulates `usage.input_tokens` and `usage.output_tokens` from every response and shows the actual cost next to the estimate.
- Run execution: a server action creates the run with its `steps` and calls `POST /api/runs/[id]/step` (with `waitUntil` from `@vercel/functions` so the action returns immediately). The route executes one step, saves the result, and calls itself for the next step. The page polls `job_runs` every three seconds. If a step fails, the run is `failed` with the error; "Retry" resumes from the failed step. If a run has not updated for ten minutes it is shown as stalled with a "Resume" button that calls the route again.

### Routes and screens
- `/admin/orgs/[orgId]` gains two cards: "Transcripts" (count, last import, button) and "Find the jobs" (candidates by status, button).
- `/admin/orgs/[orgId]/transcripts`: list; "Bring in from Fellow" opens `/admin/orgs/[orgId]/transcripts/fellow` (recordings with checkboxes, filters, "Import selected"); "Paste a transcript" form (title, date, text).
- `/admin/orgs/[orgId]/transcripts/[tid]`: the transcript, speaker labels, timestamps, "cited by" list, delete.
- `/admin/orgs/[orgId]/jobs/find`: the candidates page. Top: "Find the jobs" with the estimate and confirm; run status. Then candidates grouped: proposed (each with statement, executor, explanation, quotes, accept / reject with reason / edit), accepted (with "Draft the interview" and links to drafted jobs), rejected (with reasons), not a job. Rejected and not-a-job are collapsed.
- `/admin/jobs/[jobId]/content` shows evidence quotes under each statement and data item when present (collapsed).
- Server actions in `app/admin/transcripts/actions.ts` and `app/admin/candidates/actions.ts`. Route handler `app/api/runs/[id]/step/route.ts`.

### External systems
- Fellow Developer API: as above. Rate limit 3 per second, 10,000 per day. Failure: message on the page, nothing imported.
- Anthropic API: `ANTHROPIC_API_KEY` in Vercel (Chris adds it as a Secret, all three environments). Failure: run marked failed with the API error class (rate limit, overloaded, bad request) in plain words; retry button. `refusal` stop reason handled: the run fails with "the model declined this content" and the step is marked for Chris to look at.
- No other integrations.

## Copy
- Transcripts page title: "Transcripts". Empty: "No transcripts yet. Bring them in from Fellow, or paste one."
- Fellow picker: "Recordings in Fellow", columns Title, When, Length, Status ("Imported" or blank). Button "Import selected". After import: "Imported 3 transcripts."
- Find the jobs, before running: "Read all [n] transcripts ([h] hours) and propose the jobs. About $[x]. Takes a few minutes." Button "Find the jobs".
- Progress: "Reading transcript 3 of 7", "Comparing what was found", "Done".
- Candidate card: statement as the heading; "Done by: [executor role]"; explanation; quotes as "[speaker], [transcript title], [mm:ss]: '[words]'"; buttons "Accept", "Reject", "Edit".
- Reject dialog: "Why is this not a job to interview for?" (required).
- Not a job list heading: "Not a job" with the one-line reason per item.
- Draft the interview button: "Draft the interview". Progress: "Reading transcript 2 of 4", "Writing the interview". Done: "Draft ready. Open it to edit." linking to the content editor.
- Errors: "Couldn't reach Fellow. Check the API key in Vercel." "The run stopped: [plain reason]. Retry." "That is more than [cap] hours of transcript. Remove some transcripts or raise the cap in settings."

## Out of scope
Carried from intent: automatic Fellow sync, webhooks, matching by attendee domain, automated acceptance, analysis of answers, branding and Slack. Deferred by this design: a per-organization prompt override, editing quotes, exporting candidates, running the engine on a subset of transcripts (it always uses all of the organization's transcripts).

## Open questions
- Merge near-duplicate candidates automatically (the design does this inside the `merge` step and tells you what it merged) or only flag them and let you merge? Design proposes automatic, with the merged statements listed on the card. Chris decides.

# Spec: transcripts and job identification
From: intent.md (2026-09-18). Status: draft. Date: 2026-09-19.

## Concerns
1. **Transcripts leave our database.** Each run sends one organization's transcripts to Anthropic's API. Anthropic's standard API terms keep inputs for up to 30 days for abuse monitoring and do not train on them; zero retention is a separate arrangement. Chris decides whether the standard terms are acceptable to clients or arranges zero retention before the first client run, and the engagement paperwork should say transcripts are processed this way.
2. **Runs are driven by the open admin page, not a server worker.** A worker with no signed-in user would need the Supabase service role key in the app, which 002 ruled out. Instead the page calls the work route one unit at a time under Chris's own session, so RLS applies as everywhere else. Cost: closing the tab pauses the run; reopening resumes it. Chris decides whether that is acceptable or whether to admit the service role key for this one module.
3. **Retention is still manual.** Transcripts get the same treatment as answers: `retention_days` is stored, deleting the organization cascades, automatic purge stays a later intent (002 concern 3). Restated because transcripts are the highest data class.
4. **The Fellow key is personal.** Fellow keys are per user and see what that user sees, and a workspace admin must switch the API on. `FELLOW_API_KEY` is Chris's key. Fine for one consultant; flagged because it is not a workspace credential.

## Requirements
Transcripts
1. On an organization's page, admin opens "Transcripts" and sees every transcript for that organization: title, source (Fellow or pasted), date, length, and how many candidate jobs cite it.
2. Admin opens "Import from Fellow", sees recent recordings (title, date, duration) for a date range and optional title search, ticks any number, and imports them. Already-imported recordings are marked and cannot be imported twice. Attendees are fetched from the recording's note at import.
3. Admin pastes a transcript with a title, date and text. Lines starting with a name and a colon become that speaker; other text is one unnamed speaker. Stored in the same shape as a Fellow import.
4. Admin opens a transcript and reads it segment by segment with speaker and time. Opening one writes an audit row. The page lists the candidates that cite it.
5. Admin can delete a transcript. Its quotes go with it; candidates that cited it stay and show the evidence as deleted.

Finding the jobs
6. Admin presses "Find the jobs" and sees how many transcripts, roughly how many hours, and the estimated cost before confirming.
7. The run reads every transcript of that organization only, in units that finish inside one serverless call, and shows progress per unit.
8. Each candidate has a job statement in job-map form, one executor role, a one-paragraph explanation, and quotes linked to transcript, speaker and position.
9. Solutions in disguise and constraints appear separately as "not a job" with the reason. Admin can promote one to a candidate if the engine was wrong.
10. Admin accepts a candidate, rejects it with a reason, or edits its statement and executor first. Rejected candidates stay stored; later runs are told about them and do not resurface them or the same job in other words.
11. When two candidates look like the same job, the engine proposes one merged candidate listing the originals; admin can split it back. (Answers the intent's second open question: the engine proposes, Chris decides.)
12. A run records which transcripts were sent, the model, tokens in and out, and cost. A run whose estimated input exceeds the configured ceiling is refused with the figure shown.
13. A failed unit shows its error and a "Resume" button. Resume retries the unit; three failures fail the run.

Drafting the interview
14. For an accepted candidate, "Draft the interview" proposes the job title, executor, description, eight step titles and descriptions, data items, which items are offered at each step, and statements each pointing at a data item.
15. Every proposed step, data item and statement carries its transcript evidence (quote, speaker, transcript), shown on the content page until Chris removes it.
16. The draft lands as a job marked "Draft" in the organization, editable on the existing content page; the link is created as today. Nothing is created without the button, and the engine never changes an existing job.
17. Worker-facing engine output (titles, descriptions, statements) follows the voice skill: the prompt carries the rules, and the app rejects output with em-dashes or banned words, asking the engine once to fix it.

Data and security
18. Every new table has RLS with admin-only policies. No anon or org viewer access to transcripts, candidates, runs or evidence by any route.
19. Every new row carries `organization_id`; every policy and query filters on it. A run only loads transcripts of its own organization.
20. `FELLOW_API_KEY`, `FELLOW_SUBDOMAIN` and `ANTHROPIC_API_KEY` are server-side environment variables, read only in `lib/fellow.ts` and `lib/engine/`.
21. Deleting an organization deletes its transcripts, segments, views, candidates, quotes, runs and evidence.
22. `npm run typecheck` and `npm run build` pass.

## Design
### Data model
Migrations, in order. Every table: `organization_id not null references organizations on delete cascade`, RLS on, one policy `admin_all for all to authenticated using (is_admin()) with check (is_admin())`, nothing else.

`transcripts`
- `transcripts` (id, organization_id, source check in ('fellow','paste'), fellow_recording_id null, title, held_at timestamptz, attendees text[] default '{}', language null, duration_seconds null, imported_by uuid, created_at). Unique (organization_id, fellow_recording_id).
- `transcript_segments` (id, transcript_id cascade, organization_id, position, speaker null, start_seconds null, end_seconds null, text). Unique (transcript_id, position). One row per Fellow speech segment; for paste, one per line.
- `transcript_views` (id, organization_id, transcript_id cascade, viewer_user_id, viewed_at). Same shape as `answer_views`.

`candidates_and_runs`
- `engine_runs` (id, organization_id, kind check in ('find_jobs','draft_interview'), status check in ('running','done','failed'), candidate_id null, transcript_ids uuid[], model, units_total, units_done default 0, error null, input_tokens, output_tokens, cost_cents, created_by, created_at, finished_at null).
- `engine_run_units` (id, run_id cascade, organization_id, position, transcript_id null, status, attempts default 0, result jsonb null, error null). Unique (run_id, position). The last unit of a find-jobs run has no transcript: it is the merge pass. These rows are the audit of what went to the LLM.
- `job_candidates` (id, organization_id, run_id null set null, kind check in ('job','solution','constraint'), status check in ('proposed','accepted','rejected'), statement, executor_role, explanation, reason null, merged_from jsonb null, job_id null set null, created_at, decided_at null). `kind` other than `job` is the "not a job" list; promoting sets `kind = 'job'`.
- `candidate_quotes` (id, organization_id, candidate_id cascade, transcript_id null set null, segment_id null set null, speaker, text, transcript_title). Speaker, text and title are copied so a quote survives its transcript being deleted (requirement 5).

`draft_jobs`
- `jobs` gains `draft boolean not null default false` and `candidate_id uuid null references job_candidates on delete set null`. `interview_open` does not return them.
- `draft_evidence` (id, organization_id, job_id cascade, target_kind check in ('job','step','data_item','statement'), target_id uuid, transcript_id null set null, segment_id null set null, speaker, text, transcript_title). Deleted when Chris removes them; never shown to workers.
- Function `create_draft_job(p_org, p_candidate, p_payload jsonb)` (security definer, admin check inside, mirrors `skeleton_job`): creates job, steps, data items, step-item rows, statements and evidence in one transaction, returns the job id.

### Access control
| What | Class | Read | Write | Enforced by |
|---|---|---|---|---|
| `transcripts`, `transcript_segments` | Transcripts | admin | admin | RLS `admin_all`; actions call `requireAdmin()` |
| `transcript_views` | Audit | admin | transcript page inserts before render | RLS `admin_all`, as `answer_views` |
| `engine_runs`, `engine_run_units`, `job_candidates`, `candidate_quotes`, `draft_evidence` | Transcripts (derived) | admin | admin actions and the work route | RLS `admin_all`; the route runs under the admin's session cookie |
| Fellow, Anthropic | external | server only | none | keys in env, used only in `lib/fellow.ts` and `lib/engine/` |

The work route `POST /admin/api/runs/[runId]/work` is a route handler with `maxDuration = 300`. It calls `requireAdmin()`, loads the run through the admin's session, takes the next unit that is not done, runs it, stores the result, and returns the run's status. The run row is its only input; the body carries nothing. A client component `RunProgress` on the transcripts and candidates pages calls it while the run is `running` and shows progress; on failure it shows "Resume". Middleware already sends signed-out visitors of `/admin/*` to `/login`.

### Routes and screens
- `/admin/orgs/[orgId]`: two new cards, "Transcripts" (count, last import) and "Candidate jobs" (to review, accepted counts), each linking on. Draft jobs carry a "Draft" label. Delete copy names transcripts.
- `/admin/orgs/[orgId]/transcripts`: the list (requirement 1); "Import from Fellow" and "Paste a transcript"; a "Find the jobs" card with the estimate and confirm, or the running progress; past runs with status, tokens and cost.
- `/admin/orgs/[orgId]/transcripts/import`: date range (default last 90 days), title search, recordings table with checkboxes, "Import selected". Imports one recording at a time in a server action, respecting Fellow's rate limit.
- `/admin/orgs/[orgId]/transcripts/paste`: title, date, text area, "Save transcript".
- `/admin/orgs/[orgId]/transcripts/[tid]`: inserts the view row, then shows attendees, segments with speaker and time (each with an anchor quotes link to), citing candidates, and delete with confirm.
- `/admin/orgs/[orgId]/candidates`: sections "To review", "Accepted", "Not a job", "Rejected". Per candidate: statement, executor, explanation, quotes linking to anchors, merged-from originals. Actions: accept, reject with reason, edit, split, promote ("This is a job"), and "Draft the interview" on accepted ones (replaced by a link when a draft exists). Progress for a draft run shows here.
- `/admin/jobs/[jobId]/content`: evidence lines under the job, each step, item and statement, with "Remove". Only when evidence exists.
- `/admin/jobs/[jobId]`: "Draft" label and a link to the candidate it came from.
- `POST /admin/api/runs/[runId]/work`, `GET /admin/api/runs/[runId]`: work and status.

Existing CSS tokens and classes, plain forms with server actions in `app/admin/actions.ts`, one small client component for polling. New dependency: `@anthropic-ai/sdk`. New env: `FELLOW_API_KEY`, `FELLOW_SUBDOMAIN`, `ANTHROPIC_API_KEY`, optional `ENGINE_MAX_INPUT_TOKENS`; `.env.example` lists them without values.

### External systems
Fellow Developer API
- Base `https://{FELLOW_SUBDOMAIN}.fellow.app/api/v1/`, header `X-API-KEY`. List is `POST /recordings` with `created_at_start`, `created_at_end`, `title`, `page_size` (max 50) and `cursor`, iterated until the cursor is null. One recording is `GET /recordings/{id}` with `include: {transcript: true}`; the transcript is `speech_segments` of `speaker`, `text`, `start_time`, `end_time`, plus `language_code`. Attendees come from the linked note (`GET /notes/{note_id}`), fetched once at import.
- Limits: 3 requests per second, 10,000 per day per key. The client waits 350 ms between calls; a 429 shows "Fellow is rate limiting. Wait a minute and try again."
- Failure: missing key or subdomain hides the import button and says so; a network or auth error imports nothing and shows the notice; a partial import keeps what succeeded and names what failed. `lib/fellow.ts` is the only file that talks to Fellow, using `fetch`.

LLM
- `claude-opus-5` through `@anthropic-ai/sdk`: adaptive thinking, effort `high`, streaming with `finalMessage()`, structured output (`output_config.format`) with a JSON schema per call. Prompts in `lib/engine/prompts.ts` encode the CLAUDE.md rules: jobs are what workers do, not solutions; every stakeholder is a job executor; laws, system limits and dates are constraints; plain language, no em-dashes.
- Find the jobs, pass 1: one unit per transcript (over 80,000 tokens, split at segment boundaries). Input: the numbered segments, the organization name, the rules. Output: jobs and not-a-jobs found in that transcript, quotes as segment numbers so they are exact and link back.
- Pass 2: one unit. Input: all pass-1 outputs plus the organization's accepted and rejected candidates with reasons. Output: the final list with merges (`merged_from`) and rejected matches dropped. The app writes `job_candidates` and `candidate_quotes`, resolving segment numbers to ids.
- Draft the interview: one unit. Input: the candidate, its quotes, the organization's transcripts, the eight job map stages, the voice rules. Output: job fields, steps, data items, step-item mapping, statements, evidence as segment numbers. The app calls `create_draft_job`.
- Cost (answers the intent's first open question). One hour of conversation is roughly 12,000 tokens. At Opus 5 rates ($5 per million input, $25 per million output, thinking billed as output), finding the jobs across 10 hours is about 150,000 input and 50,000 output tokens: around $3. Drafting one interview over the same 10 hours is about 130,000 input and 15,000 output: around $1. Rule of thumb: $0.30 per transcript hour to find the jobs, $0.10 per hour per draft. The estimate uses `countTokens` before the run. `ENGINE_MAX_INPUT_TOKENS` defaults to 600,000 (about 50 hours, about $12 a run). If quality holds and the budget bites, `claude-sonnet-5` is the same API at 40 percent of the price, a one-line change; start on Opus and judge on the Derek transcripts first, per the intent's acceptance decision.
- Failure: API errors, refusals and schema failures fail the unit with the message; the run can be resumed. A refusal is shown as is and not retried automatically.

## Copy
- Org cards: "Transcripts. Client conversations the jobs are found in." "Candidate jobs. What the transcripts suggest the jobs are. You decide."
- Estimate: "Reads [n] transcripts, about [h] hours of conversation. Costs about $[x]. Takes a few minutes." Ceiling: "That is more than this server reads in one run ([n] hours). Remove some transcripts or raise the limit."
- Progress: "Reading transcript [i] of [n]: [title]". "Comparing what it found across transcripts". "Done. [n] candidates to review, [m] set aside as not a job." Failed: "The run stopped: [error]." with "Resume". Note: "Keep this page open while it runs. If you close it, the run pauses until you come back."
- Import: "Recent recordings in Fellow", "Already imported", "Import selected", "No recordings in this range.", "Fellow isn't set up on this server. Add the key and subdomain, then redeploy."
- Paste hint: "Start a line with the speaker's name and a colon to keep who said what."
- Transcript page: "Every time anyone opens a transcript it is recorded, with who and when." Delete: "Quotes taken from it stay on their candidates, marked as deleted evidence."
- Candidates: "Who does it: [role]", "Why the engine thinks so", "From the transcripts", "Merged from [n] candidates", "(transcript deleted)". Buttons: "Accept", "Reject", "Edit", "Split", "This is a job", "Draft the interview". Reject label: "Why not? (kept so it doesn't come back)". Drafted: "Already drafted. Open the job."
- Evidence line on the content page: the quote, then "[speaker], [transcript title]", "Remove".
- Org delete: "Deletes every job, link, respondent, answer and transcript under it. There is no undo."

## Out of scope
Carried from intent: automatic Fellow sync, webhooks, matching meetings by attendee domain, automated acceptance, analysis of interview answers, branding and Slack (003). Deferred by this design: a server-side worker (concern 2), automatic retention purge (concern 3), zero-retention arrangement with Anthropic (concern 1), re-running on a single transcript, editing transcripts after import, quote highlighting inside the viewer beyond anchors, prompt caching across runs, any org viewer access to transcripts or candidates.

## Open questions
- Is the Developer API switched on in Chris's Fellow workspace, and what is the subdomain? Needed before the import screen can be tried.
- Concern 1 needs an answer before the first client organization's transcripts are imported. The internal organization (Derek) can tune the prompts before then.

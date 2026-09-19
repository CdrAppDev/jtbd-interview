# Plan: transcripts and job identification
From: spec.md (2026-09-19). Status: accepted. Date: 2026-09-19.

## Context
The app today holds job content, interview links and answers. Nothing connects client conversations to the jobs we interview for. This adds transcripts (imported from Fellow or pasted), an engine that proposes candidate jobs with quotes, review screens where Chris accepts or sets aside each candidate, a drafting step that turns an accepted candidate into a draft job, and a refresh that proposes additions to a drafted job from transcripts that arrive later. Everything is admin only. Runs are driven by the open admin page calling a work route one unit at a time, so no service role key enters the app.

## Files that change
Dependencies and configuration
- `package.json` (modified): add `@anthropic-ai/sdk`. Nothing else.
- `.env.example` (new): `FELLOW_API_KEY`, `FELLOW_SUBDOMAIN`, `ANTHROPIC_API_KEY`, `ENGINE_MAX_INPUT_TOKENS`, names only, no values.

Library
- `lib/supabase.ts` (modified): add types `Transcript`, `TranscriptSegment`, `EngineRun`, `EngineRunUnit`, `JobCandidate`, `CandidateQuote`, `DraftEvidence`, `JobProposal`; add `draft` and `candidate_id` to `Job`.
- `lib/fellow.ts` (new): the only file that talks to Fellow. `fellowConfigured()`, `listRecordings({from, to, title})` paging `POST /recordings` with `page_size: 50` until `page_info.cursor` is null, `getRecording(id)` with `include: {transcript: true}`, `getNote(id)` for attendees. Header `X-API-KEY`, base `https://${FELLOW_SUBDOMAIN}.fellow.app/api/v1/`. A 350 ms gap between calls, a 429 raised as `FellowRateLimited`, any other non-2xx as `FellowError` carrying the status.
- `lib/engine/client.ts` (new): the Anthropic client, `countInput(parts)` via `messages.countTokens`, and `ask(schema, system, user)` using `claude-opus-5`, `thinking: {type: "adaptive"}`, `output_config: {effort: "high", format: schema}`, streaming with `finalMessage()`. Returns the parsed object plus `usage`. Throws `EngineRefused` on `stop_reason === "refusal"`.
- `lib/engine/prompts.ts` (new): the four prompts (find pass 1, find pass 2, draft, refresh) with the job rules and the voice rules inline.
- `lib/engine/schemas.ts` (new): one JSON schema per call. Quotes are always `{segment: number}` so they resolve to real rows.
- `lib/engine/run.ts` (new): `estimate(transcriptIds)` returning tokens, hours and dollars; `startRun(kind, args)` creating the run and its units; `runNextUnit(runId)` doing exactly one unit and writing its result; `applyFindResults(runId)`, `applyDraftResult(runId)`, `applyRefreshResults(runId)`. Also `checkVoice(text)` used before any worker-facing text is saved.
- `lib/cost.ts` (new): token counts to cents for the current model, one table, used by the estimate and by the run record.

Server actions
- `app/admin/actions-transcripts.ts` (new): `importFromFellow`, `pasteTranscript`, `deleteTranscript`, `startFindJobs`.
- `app/admin/actions-candidates.ts` (new): `acceptCandidate`, `setAsideCandidate`, `bringBackCandidate`, `editCandidate`, `splitCandidate`, `promoteCandidate`, `startDraft`, `startRefresh`, `applyProposal`, `ignoreProposal`, `deleteEvidence`. Each calls `requireAdmin()` first, as `app/admin/actions.ts` does today.

Routes and screens
- `app/admin/orgs/[orgId]/page.tsx` (modified): two cards, Transcripts and Candidate jobs, with counts; "Draft" label in the jobs table; delete copy names transcripts.
- `app/admin/orgs/[orgId]/transcripts/page.tsx` (new): the list, the two import buttons, the find-the-jobs card with the estimate or the running progress, and past runs.
- `app/admin/orgs/[orgId]/transcripts/import/page.tsx` (new): date range, title search, recordings with checkboxes, already-imported marked.
- `app/admin/orgs/[orgId]/transcripts/paste/page.tsx` (new): title, date, text.
- `app/admin/orgs/[orgId]/transcripts/[tid]/page.tsx` (new): writes `transcript_views`, then attendees, segments with anchors, citing candidates, delete.
- `app/admin/orgs/[orgId]/candidates/page.tsx` (new): the four sections and their actions.
- `app/admin/jobs/[jobId]/page.tsx` (modified): Draft label, link to the candidate, and the "Check for new evidence" card with its proposals.
- `app/admin/jobs/[jobId]/content/page.tsx` (modified): evidence lines with Remove under the job, each step, item and statement.
- `app/admin/api/runs/[runId]/work/route.ts` (new): `export const maxDuration = 300`. `requireAdmin()`, load the run under the admin's session, call `runNextUnit`, return the run's status. The body carries nothing.
- `app/admin/api/runs/[runId]/route.ts` (new): the run's status for polling.
- `components/RunProgress.tsx` (new, client): while the run is running, POST to the work route, show the unit line, and show Resume on failure.

Styling and docs
- `app/globals.css` (modified): `.segment`, `.quote`, `.evidence`, `.progress`, about 40 lines, reusing existing tokens.
- `supabase/migrations/007..009_*.sql` (new): the three migrations below, committed for the record.
- `CLAUDE.md` (modified): the new tables, routes, run mechanics and env vars.

## Migrations
Applied in order with the Supabase `apply_migration` tool, the SQL committed alongside. Every table: `organization_id uuid not null references organizations(id) on delete cascade`, `alter table ... enable row level security`, and one policy `create policy admin_all on <t> for all to authenticated using (is_admin()) with check (is_admin())`.

1. `transcripts`
   - `transcripts(id, organization_id, source text not null check (source in ('fellow','paste')), fellow_recording_id text, title text not null, held_at timestamptz not null, attendees text[] not null default '{}', language text, duration_seconds int, imported_by uuid, created_at timestamptz default now())`, unique index on `(organization_id, fellow_recording_id)` where `fellow_recording_id is not null`.
   - `transcript_segments(id, transcript_id references transcripts on delete cascade, organization_id, position int not null, speaker text, start_seconds numeric, end_seconds numeric, text text not null)`, unique `(transcript_id, position)`, index on `transcript_id`.
   - `transcript_views(id, organization_id, transcript_id references transcripts on delete cascade, viewer_user_id uuid not null, viewed_at timestamptz default now())`.

2. `candidates_and_runs`
   - `engine_runs(id, organization_id, kind text check (kind in ('find_jobs','draft_interview','refresh_evidence')), status text check (status in ('running','done','failed')), candidate_id uuid, job_id uuid references jobs on delete cascade, transcript_ids uuid[] not null default '{}', model text not null, units_total int not null, units_done int not null default 0, error text, input_tokens bigint default 0, output_tokens bigint default 0, cost_cents int default 0, created_by uuid, created_at timestamptz default now(), finished_at timestamptz)`.
   - `engine_run_units(id, run_id references engine_runs on delete cascade, organization_id, position int not null, transcript_id uuid references transcripts on delete set null, status text not null default 'pending', attempts int not null default 0, result jsonb, error text)`, unique `(run_id, position)`.
   - `job_candidates(id, organization_id, run_id uuid references engine_runs on delete set null, kind text check (kind in ('job','solution','constraint')) default 'job', status text check (status in ('proposed','accepted','set_aside')) default 'proposed', statement text not null, executor_role text not null, explanation text, reason text, merged_from jsonb, job_id uuid references jobs on delete set null, created_at timestamptz default now(), decided_at timestamptz)`.
   - `candidate_quotes(id, organization_id, candidate_id references job_candidates on delete cascade, transcript_id uuid references transcripts on delete set null, segment_id uuid references transcript_segments on delete set null, speaker text, text text not null, transcript_title text not null, created_at timestamptz default now())`.

3. `draft_jobs`
   - `alter table jobs add column draft boolean not null default false, add column candidate_id uuid references job_candidates(id) on delete set null;`
   - `draft_evidence(id, organization_id, job_id references jobs on delete cascade, target_kind text check (target_kind in ('job','step','data_item','statement')), target_id uuid not null, transcript_id uuid references transcripts on delete set null, segment_id uuid references transcript_segments on delete set null, speaker text, text text not null, transcript_title text not null)`, index on `(job_id, target_id)`.
   - `job_proposals(id, organization_id, job_id references jobs on delete cascade, run_id uuid references engine_runs on delete set null, target_kind text check (target_kind in ('step','data_item','statement')), target_id uuid, payload jsonb not null, speaker text, text text, transcript_id uuid references transcripts on delete set null, segment_id uuid references transcript_segments on delete set null, transcript_title text, status text check (status in ('proposed','applied','ignored')) default 'proposed', created_at timestamptz default now(), decided_at timestamptz)`.
   - `create_draft_job(p_org uuid, p_candidate uuid, p_payload jsonb) returns uuid`, security definer, `set search_path = public`, first line `if not is_admin() then raise exception 'forbidden'; end if;`. Inserts the job with `draft = true`, its eight steps, data items, step-item rows, statements and evidence in one transaction, returns the job id. Modelled on `skeleton_job`.

## Order of work
Each step ends with `npm run typecheck` and `npm run build` green, and the app still running.

1. **Schema.** Apply the three migrations, commit the SQL, add the types to `lib/supabase.ts`. No UI yet. Verify with a signed-out query that the anon key sees none of the new tables.
2. **Transcripts in by hand.** `pasteTranscript`, the paste screen, the list screen, the transcript viewer with its audit row, and delete. This alone is useful: Derek's conversations can be loaded and read.
3. **Fellow.** `lib/fellow.ts`, the import screen, `importFromFellow`. Import one real meeting end to end. The screen hides itself when the key or subdomain is missing.
4. **Run machinery.** `lib/cost.ts`, `lib/engine/client.ts`, the two api routes, `RunProgress`. Prove it with a trivial unit that counts words, then delete that unit.
5. **Find the jobs.** The two prompts and schemas, `startFindJobs`, `applyFindResults`, the candidates screen with accept, set aside, bring back, edit, split and promote. Run it against Derek's transcripts and read what comes back.
6. **Draft the interview.** `create_draft_job`, the draft prompt, `startDraft`, the Draft label, and the evidence lines on the content page.
7. **Check for new evidence.** The refresh prompt, `startRefresh`, `job_proposals`, the card on the job page, apply and ignore.
8. **Documentation.** Update `CLAUDE.md` and `.env.example`, record the real cost of the Derek run against the estimate.

## Risks
- **A long transcript overruns the 300 second limit.** Guarded by one unit per transcript and a split at 80,000 tokens. If a unit still times out, the run is resumable and the split threshold is a one-line change.
- **The engine returns quotes that do not exist.** Guarded by asking for segment numbers rather than text: a number that is not a real segment of that transcript is dropped and logged, not stored.
- **Cross-client leakage.** Guarded twice: every query filters `organization_id`, and the run row carries the transcript ids so the work route never accepts them from the browser. Step 1 verifies the anon key sees nothing.
- **Cost surprise.** Guarded by the estimate before the run, the per-run ceiling, and the cost recorded on every run. Worst case at the default ceiling is about twelve dollars.
- **Worker-facing text drifts from the voice rules.** Guarded by `checkVoice` before saving, one retry, then the offending text is flagged rather than saved silently.
- **A run stalls because the tab closed.** Accepted in the spec, concern 2. The run stays resumable and says so on screen.

## Alternatives not taken
- A background worker with the Supabase service role key: fastest to write, but puts a key that bypasses every policy into the app, which intent 002 ruled out.
- One call over all transcripts at once: simpler code, but breaks the serverless limit and loses per-transcript resumability.
- Asking the engine for quote text instead of segment numbers: invites invented quotes and gives nothing to link back to.
- Storing only the Fellow identifier and fetching text on demand: cheaper storage, but the evidence would disappear if the meeting were deleted in Fellow, and every run would re-fetch.
- Putting the new actions in `app/admin/actions.ts`: that file is already 240 lines; two new files keep each readable.

## Proof
Paste into the pull request:

1. `npm run typecheck` prints nothing, exits 0. `npm run build` ends with "Compiled successfully".
2. Signed out, with the publishable key only, a read of `transcripts`, `job_candidates` and `draft_evidence` each returns no rows and no error leak. Paste the three results.
3. Paste a transcript, open it, confirm a `transcript_views` row exists for your user and the segments show speaker and time.
4. Import one real meeting from Fellow. Confirm title, date, attendees and segment count match Fellow. Confirm importing it again is refused.
5. Run "Find the jobs" over the Derek transcripts. Paste the estimate shown, the actual cost recorded, and the candidate count. Open one candidate and follow a quote through to its transcript segment.
6. Set a candidate aside with a reason. Import another transcript, run again, confirm it is not proposed as new and that any new supporting quote attaches to it. Bring it back.
7. Draft the interview from an accepted candidate. Confirm the job appears marked Draft with eight steps, data items and statements, and that the content page shows a quote under each.
8. Import a further transcript, press "Check for new evidence" on that job, apply one proposal and ignore another. Confirm the applied one appears in the job content with its quote and the ignored one is not proposed again.
9. Delete a test organization. Confirm its transcripts, segments, candidates, quotes, runs and evidence are gone.

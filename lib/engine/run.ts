import type { SupabaseClient } from "@supabase/supabase-js";
import { ENGINE_MODEL, costCents, estimateCents, hoursOf, maxInputTokens } from "@/lib/cost";
import { EngineError, ask, countInput } from "./client";
import { DRAFT, FIND_ALL, FIND_ONE, REFRESH } from "./prompts";
import {
  DRAFT_SCHEMA, FIND_ALL_SCHEMA, FIND_ONE_SCHEMA, REFRESH_SCHEMA,
  type Drafted, type FoundAll, type FoundOne, type Refreshed,
} from "./schemas";
import type { EngineRun, EngineRunUnit, JobCandidate, Transcript, TranscriptSegment } from "@/lib/supabase";

// A run is a list of units. One unit is one call to the model, small enough
// to finish inside a single serverless invocation. The run row carries the
// transcripts it may read, so the browser never names them.

type Db = SupabaseClient;

const BANNED = /—|\bsurvey\b|\bquestionnaire\b|\bsatisfaction\b|\bopportunity\b|\boutcome statement\b|\bODI\b|\bJTBD\b/i;

/** Worker-facing text has to obey the language rules. */
export function checkVoice(text: string): boolean {
  return !BANNED.test(text);
}

export function cleanVoice(text: string): string {
  return text.replace(/\s*—\s*/g, ", ");
}

const numbered = (segments: TranscriptSegment[]) =>
  segments.map((s) => `[${s.position}] ${s.speaker ?? "Unknown"}: ${s.text}`).join("\n");

async function segmentsOf(db: Db, transcriptId: string): Promise<TranscriptSegment[]> {
  const { data } = await db.from("transcript_segments").select("*").eq("transcript_id", transcriptId).order("position");
  return (data ?? []) as TranscriptSegment[];
}

async function transcriptsOf(db: Db, ids: string[]): Promise<Transcript[]> {
  if (!ids.length) return [];
  const { data } = await db.from("transcripts").select("*").in("id", ids).order("held_at");
  return (data ?? []) as Transcript[];
}

export type Estimate = { tokens: number; hours: number; cents: number; overCeiling: boolean; ceilingHours: number };

/** What a find-the-jobs run over these transcripts would read and cost. */
export async function estimate(db: Db, transcriptIds: string[]): Promise<Estimate> {
  let tokens = 0;
  for (const id of transcriptIds) {
    const segs = await segmentsOf(db, id);
    tokens += await countInput(FIND_ONE, numbered(segs));
  }
  const ceiling = maxInputTokens();
  return {
    tokens,
    hours: hoursOf(tokens),
    cents: estimateCents(ENGINE_MODEL, tokens),
    overCeiling: tokens > ceiling,
    ceilingHours: hoursOf(ceiling),
  };
}

async function createRun(
  db: Db,
  args: { organizationId: string; kind: EngineRun["kind"]; transcriptIds: string[]; unitTranscriptIds: string[]; extraUnits: number; candidateId?: string; jobId?: string; userId: string },
): Promise<string> {
  const unitsTotal = args.unitTranscriptIds.length + args.extraUnits;
  const { data, error } = await db
    .from("engine_runs")
    .insert({
      organization_id: args.organizationId,
      kind: args.kind,
      transcript_ids: args.transcriptIds,
      candidate_id: args.candidateId ?? null,
      job_id: args.jobId ?? null,
      model: ENGINE_MODEL,
      units_total: unitsTotal,
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new EngineError(error?.message ?? "Couldn't start the run.");

  const units = args.unitTranscriptIds.map((transcript_id, i) => ({
    run_id: data.id,
    organization_id: args.organizationId,
    position: i + 1,
    transcript_id,
  }));
  for (let i = 0; i < args.extraUnits; i++) {
    units.push({ run_id: data.id, organization_id: args.organizationId, position: units.length + 1, transcript_id: null as unknown as string });
  }
  const { error: unitError } = await db.from("engine_run_units").insert(units);
  if (unitError) {
    await db.from("engine_runs").delete().eq("id", data.id);
    throw new EngineError(unitError.message);
  }
  return data.id;
}

export async function startFindJobs(db: Db, organizationId: string, transcriptIds: string[], userId: string): Promise<string> {
  // The last unit has no transcript: it is the pass that compares findings.
  return createRun(db, { organizationId, kind: "find_jobs", transcriptIds, unitTranscriptIds: transcriptIds, extraUnits: 1, userId });
}

export async function startDraft(db: Db, organizationId: string, candidateId: string, transcriptIds: string[], userId: string): Promise<string> {
  return createRun(db, { organizationId, kind: "draft_interview", transcriptIds, unitTranscriptIds: [], extraUnits: 1, candidateId, userId });
}

export async function startRefresh(db: Db, organizationId: string, jobId: string, transcriptIds: string[], userId: string): Promise<string> {
  return createRun(db, { organizationId, kind: "refresh_evidence", transcriptIds, unitTranscriptIds: transcriptIds, extraUnits: 0, jobId, userId });
}

/** Transcripts of this organization no run for this job has read yet. */
export async function unreadFor(db: Db, organizationId: string, jobId: string): Promise<Transcript[]> {
  const [{ data: all }, { data: runs }] = await Promise.all([
    db.from("transcripts").select("*").eq("organization_id", organizationId).order("held_at"),
    db.from("engine_runs").select("transcript_ids").eq("job_id", jobId),
  ]);
  const seen = new Set<string>();
  for (const r of (runs ?? []) as Pick<EngineRun, "transcript_ids">[]) for (const id of r.transcript_ids) seen.add(id);
  return ((all ?? []) as Transcript[]).filter((t) => !seen.has(t.id));
}

async function record(db: Db, runId: string, usage: { input: number; output: number }) {
  const { data } = await db.from("engine_runs").select("input_tokens, output_tokens, model").eq("id", runId).single();
  const input = (data?.input_tokens ?? 0) + usage.input;
  const output = (data?.output_tokens ?? 0) + usage.output;
  await db
    .from("engine_runs")
    .update({ input_tokens: input, output_tokens: output, cost_cents: costCents(data?.model ?? ENGINE_MODEL, input, output) })
    .eq("id", runId);
}

export type RunState = { status: EngineRun["status"]; done: number; total: number; label: string; error: string | null };

/**
 * Do exactly one unit of a run. Called repeatedly by the page holding the run
 * open. Everything it reads comes from the run row, never from the request.
 */
export async function runNextUnit(db: Db, runId: string): Promise<RunState> {
  const { data: runRow } = await db.from("engine_runs").select("*").eq("id", runId).maybeSingle<EngineRun>();
  if (!runRow) throw new EngineError("Run not found.");
  if (runRow.status !== "running") return await stateOf(db, runRow);

  const { data: unitRow } = await db
    .from("engine_run_units")
    .select("*")
    .eq("run_id", runId)
    .neq("status", "done")
    .order("position")
    .limit(1)
    .maybeSingle<EngineRunUnit>();

  if (!unitRow) {
    await db.from("engine_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    return await stateOf(db, { ...runRow, status: "done" });
  }

  try {
    await db.from("engine_run_units").update({ attempts: unitRow.attempts + 1 }).eq("id", unitRow.id);
    const result = await doUnit(db, runRow, unitRow);
    await db.from("engine_run_units").update({ status: "done", result, error: null }).eq("id", unitRow.id);
    await db.from("engine_runs").update({ units_done: runRow.units_done + 1 }).eq("id", runId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "The run stopped.";
    await db.from("engine_run_units").update({ status: "failed", error: message }).eq("id", unitRow.id);
    // Three goes at one unit is enough; beyond that something is wrong.
    if (unitRow.attempts + 1 >= 3) {
      await db.from("engine_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", runId);
    } else {
      await db.from("engine_runs").update({ error: message }).eq("id", runId);
    }
    const { data: after } = await db.from("engine_runs").select("*").eq("id", runId).single();
    return await stateOf(db, after as EngineRun);
  }

  const { data: after } = await db.from("engine_runs").select("*").eq("id", runId).single();
  const run = after as EngineRun;
  const { count } = await db.from("engine_run_units").select("id", { count: "exact", head: true }).eq("run_id", runId).neq("status", "done");
  if (!count) {
    await applyResults(db, run);
    await db.from("engine_runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    return await stateOf(db, { ...run, status: "done" });
  }
  return await stateOf(db, run);
}

export async function stateOf(db: Db, run: EngineRun): Promise<RunState> {
  let label = "";
  if (run.status === "running") {
    const { data: next } = await db
      .from("engine_run_units")
      .select("position, transcript_id")
      .eq("run_id", run.id)
      .neq("status", "done")
      .order("position")
      .limit(1)
      .maybeSingle<{ position: number; transcript_id: string | null }>();
    if (!next) label = "Finishing up";
    else if (!next.transcript_id) label = run.kind === "draft_interview" ? "Writing the interview" : "Comparing what it found across transcripts";
    else {
      const { data: t } = await db.from("transcripts").select("title").eq("id", next.transcript_id).maybeSingle<{ title: string }>();
      label = `Reading transcript ${next.position} of ${run.units_total}: ${t?.title ?? ""}`;
    }
  }
  return { status: run.status, done: run.units_done, total: run.units_total, label, error: run.error };
}

async function doUnit(db: Db, run: EngineRun, unit: EngineRunUnit): Promise<unknown> {
  if (run.kind === "find_jobs" && unit.transcript_id) return await findInOne(db, run.id, unit.transcript_id);
  if (run.kind === "find_jobs") return await compareAll(db, run);
  if (run.kind === "draft_interview") return await draftInterview(db, run);
  if (run.kind === "refresh_evidence" && unit.transcript_id) return await refreshFrom(db, run, unit.transcript_id);
  throw new EngineError("This run has nothing to do.");
}

async function findInOne(db: Db, runId: string, transcriptId: string) {
  const segs = await segmentsOf(db, transcriptId);
  const { value, usage } = await ask<FoundOne>(FIND_ONE_SCHEMA, FIND_ONE, numbered(segs));
  await record(db, runId, usage);
  return value;
}

/** Every transcript of the run, numbered, for the passes that read them all. */
async function allNumbered(db: Db, run: EngineRun) {
  const transcripts = await transcriptsOf(db, run.transcript_ids);
  const parts: string[] = [];
  const index: { transcript: Transcript; segments: TranscriptSegment[] }[] = [];
  for (let i = 0; i < transcripts.length; i++) {
    const segs = await segmentsOf(db, transcripts[i].id);
    index.push({ transcript: transcripts[i], segments: segs });
    parts.push(`Conversation ${i + 1}: ${transcripts[i].title} (${transcripts[i].held_at.slice(0, 10)})\n${numbered(segs)}`);
  }
  return { text: parts.join("\n\n"), index };
}

async function compareAll(db: Db, run: EngineRun) {
  const { data: units } = await db.from("engine_run_units").select("position, transcript_id, result").eq("run_id", run.id).not("transcript_id", "is", null).order("position");
  const transcripts = await transcriptsOf(db, run.transcript_ids);
  const order = new Map(transcripts.map((t, i) => [t.id, i + 1]));
  const findings = ((units ?? []) as { transcript_id: string; result: unknown }[])
    .map((u) => `Conversation ${order.get(u.transcript_id) ?? 0}:\n${JSON.stringify(u.result)}`)
    .join("\n\n");

  const { data: decided } = await db
    .from("job_candidates")
    .select("id, statement, executor_role, status, reason")
    .eq("organization_id", run.organization_id)
    .in("status", ["accepted", "set_aside"]);
  const D = (decided ?? []) as Pick<JobCandidate, "id" | "statement" | "executor_role" | "status" | "reason">[];
  const already = D.length
    ? D.map((c, i) => `${i + 1}. [${c.status === "accepted" ? "accepted" : "set aside"}] ${c.statement} (${c.executor_role})${c.reason ? ` Reason: ${c.reason}` : ""}`).join("\n")
    : "None yet.";

  const user = `Findings from each conversation:\n\n${findings}\n\nCandidates already decided on:\n${already}`;
  const { value, usage } = await ask<FoundAll>(FIND_ALL_SCHEMA, FIND_ALL, user);
  await record(db, run.id, usage);
  return { ...value, decided_ids: D.map((c) => c.id) };
}

async function draftInterview(db: Db, run: EngineRun) {
  const { data: candidate } = await db.from("job_candidates").select("*").eq("id", run.candidate_id ?? "").maybeSingle<JobCandidate>();
  if (!candidate) throw new EngineError("That candidate is gone.");
  const { data: quotes } = await db.from("candidate_quotes").select("speaker, text, transcript_title").eq("candidate_id", candidate.id);
  const said = ((quotes ?? []) as { speaker: string | null; text: string; transcript_title: string }[])
    .map((q) => `"${q.text}" (${q.speaker ?? "Unknown"}, ${q.transcript_title})`)
    .join("\n");
  const { text } = await allNumbered(db, run);
  const user = `The job: ${candidate.statement}\nWho does it: ${candidate.executor_role}\nWhy: ${candidate.explanation ?? ""}\n\nWhat people said about it:\n${said}\n\nThe conversations:\n\n${text}`;
  const { value, usage } = await ask<Drafted>(DRAFT_SCHEMA, DRAFT, user);
  await record(db, run.id, usage);
  return value;
}

async function refreshFrom(db: Db, run: EngineRun, transcriptId: string) {
  const { data: job } = await db.from("jobs").select("*").eq("id", run.job_id ?? "").maybeSingle();
  if (!job) throw new EngineError("That job is gone.");
  const { data: steps } = await db.from("steps").select("id, position, stage, title, description").eq("job_id", job.id).order("position");
  const S = (steps ?? []) as { id: string; position: number; stage: string; title: string; description: string }[];
  const [{ data: items }, { data: stmts }] = await Promise.all([
    db.from("data_items").select("key, name").eq("job_id", job.id),
    db.from("statements").select("step_id, text").in("step_id", S.map((s) => s.id)),
  ]);
  const byStep = new Map<string, string[]>();
  for (const st of (stmts ?? []) as { step_id: string; text: string }[]) {
    byStep.set(st.step_id, [...(byStep.get(st.step_id) ?? []), st.text]);
  }
  const shape = [
    `The job: ${job.title} (${job.executor_role})`,
    `Data items already listed: ${((items ?? []) as { key: string; name: string }[]).map((i) => `${i.key} (${i.name})`).join(", ") || "none"}`,
    ...S.map((s) => `Step ${s.position} ${s.stage}: ${s.title}\n  ${s.description}\n  Statements: ${(byStep.get(s.id) ?? []).join(" | ") || "none"}`),
  ].join("\n");

  const segs = await segmentsOf(db, transcriptId);
  const { value, usage } = await ask<Refreshed>(REFRESH_SCHEMA, REFRESH, `${shape}\n\nThe new conversation:\n${numbered(segs)}`);
  await record(db, run.id, usage);
  return { ...value, transcript_id: transcriptId };
}

async function applyResults(db: Db, run: EngineRun) {
  const { applyFind, applyDraft, applyRefresh } = await import("./apply");
  if (run.kind === "find_jobs") return await applyFind(db, run);
  if (run.kind === "draft_interview") return await applyDraft(db, run);
  if (run.kind === "refresh_evidence") return await applyRefresh(db, run);
}

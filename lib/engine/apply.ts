import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanVoice } from "./run";
import type { Drafted, FoundAll, Refreshed } from "./schemas";
import type { EngineRun, Transcript, TranscriptSegment } from "@/lib/supabase";

// Turning what the model returned into rows. Quotes arrive as passage
// numbers, so every one is looked up: a number that is not a real passage of
// that conversation is dropped rather than stored. Nothing invented survives.

type Db = SupabaseClient;

type Resolved = { transcript_id: string; segment_id: string; speaker: string | null; text: string; transcript_title: string };

async function passageIndex(db: Db, run: EngineRun) {
  const { data: rows } = await db.from("transcripts").select("*").in("id", run.transcript_ids).order("held_at");
  const transcripts = (rows ?? []) as Transcript[];
  const byNumber = new Map<number, { transcript: Transcript; segments: Map<number, TranscriptSegment> }>();
  for (let i = 0; i < transcripts.length; i++) {
    const { data: segs } = await db.from("transcript_segments").select("*").eq("transcript_id", transcripts[i].id).order("position");
    byNumber.set(i + 1, {
      transcript: transcripts[i],
      segments: new Map(((segs ?? []) as TranscriptSegment[]).map((s) => [s.position, s])),
    });
  }
  return byNumber;
}

function resolve(index: Map<number, { transcript: Transcript; segments: Map<number, TranscriptSegment> }>, transcriptNo: number, passage: number): Resolved | null {
  const entry = index.get(transcriptNo);
  const seg = entry?.segments.get(passage);
  if (!entry || !seg) return null;
  return {
    transcript_id: entry.transcript.id,
    segment_id: seg.id,
    speaker: seg.speaker,
    text: seg.text,
    transcript_title: entry.transcript.title,
  };
}

export async function applyFind(db: Db, run: EngineRun) {
  const { data: unit } = await db
    .from("engine_run_units")
    .select("result")
    .eq("run_id", run.id)
    .is("transcript_id", null)
    .maybeSingle<{ result: (FoundAll & { decided_ids: string[] }) | null }>();
  const out = unit?.result;
  if (!out) return;
  const index = await passageIndex(db, run);

  const quotesFor = (candidateId: string, quotes: { transcript: number; passage: number }[]) =>
    quotes
      .map((q) => resolve(index, q.transcript, q.passage))
      .filter((r): r is Resolved => r !== null)
      .map((r) => ({ organization_id: run.organization_id, candidate_id: candidateId, ...r }));

  for (const c of out.candidates ?? []) {
    const { data: row } = await db
      .from("job_candidates")
      .insert({
        organization_id: run.organization_id,
        run_id: run.id,
        kind: "job",
        statement: cleanVoice(c.statement),
        executor_role: c.executor_role,
        explanation: cleanVoice(c.explanation ?? ""),
        merged_from: c.merged_from?.length ? c.merged_from.map((statement) => ({ statement, executor_role: c.executor_role })) : null,
      })
      .select("id")
      .single();
    if (row) {
      const quotes = quotesFor(row.id, c.quotes ?? []);
      if (quotes.length) await db.from("candidate_quotes").insert(quotes);
    }
  }

  for (const n of out.not_jobs ?? []) {
    const { data: row } = await db
      .from("job_candidates")
      .insert({
        organization_id: run.organization_id,
        run_id: run.id,
        kind: n.kind,
        statement: cleanVoice(n.statement),
        executor_role: "Not a job",
        explanation: null,
        reason: cleanVoice(n.reason ?? ""),
      })
      .select("id")
      .single();
    if (row) {
      const quotes = quotesFor(row.id, n.quotes ?? []);
      if (quotes.length) await db.from("candidate_quotes").insert(quotes);
    }
  }

  // New support for candidates already decided on, so a set-aside candidate
  // keeps building its case instead of being proposed again.
  for (const more of out.more_evidence ?? []) {
    const id = out.decided_ids?.[more.candidate - 1];
    if (!id) continue;
    const { data: had } = await db.from("candidate_quotes").select("segment_id").eq("candidate_id", id);
    const seen = new Set(((had ?? []) as { segment_id: string | null }[]).map((q) => q.segment_id));
    const quotes = quotesFor(id, more.quotes ?? []).filter((q) => !seen.has(q.segment_id));
    if (quotes.length) await db.from("candidate_quotes").insert(quotes);
  }
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "job";

export async function applyDraft(db: Db, run: EngineRun) {
  const { data: unit } = await db
    .from("engine_run_units")
    .select("result")
    .eq("run_id", run.id)
    .is("transcript_id", null)
    .maybeSingle<{ result: Drafted | null }>();
  const out = unit?.result;
  if (!out || !run.candidate_id) return;
  const index = await passageIndex(db, run);

  const ev = (quotes: { transcript: number; passage: number }[] = []) =>
    quotes
      .map((q) => resolve(index, q.transcript, q.passage))
      .filter((r): r is Resolved => r !== null)
      .map((r) => ({ quote: r.text, speaker: r.speaker, transcript_id: r.transcript_id, segment_id: r.segment_id, transcript_title: r.transcript_title }));

  const payload = {
    title: cleanVoice(out.title),
    executor_name: out.executor_name,
    executor_role: out.executor_role,
    description: cleanVoice(out.description ?? ""),
    evidence: ev(out.quotes),
    data_items: (out.data_items ?? []).map((i) => ({ key: slugify(i.key || i.name), name: i.name, evidence: ev(i.quotes) })),
    steps: (out.steps ?? []).map((s) => ({
      position: s.position,
      stage: s.stage,
      title: cleanVoice(s.title),
      description: cleanVoice(s.description ?? ""),
      items: (s.items ?? []).map((k) => slugify(k)),
      evidence: ev(s.quotes),
      statements: (s.statements ?? []).map((st) => ({
        position: st.position,
        text: cleanVoice(st.text),
        data_item: st.data_item ? slugify(st.data_item) : "",
        evidence: ev(st.quotes),
      })),
    })),
  };

  // Slugs are unique per organization, so step aside if one is taken.
  const { data: taken } = await db.from("jobs").select("slug").eq("organization_id", run.organization_id);
  const used = new Set(((taken ?? []) as { slug: string }[]).map((j) => j.slug));
  let slug = slugify(payload.title);
  const base = slug;
  for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;

  const { data: jobId, error } = await db.rpc("create_draft_job", {
    p_org: run.organization_id,
    p_candidate: run.candidate_id,
    p_slug: slug,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
  await db.from("job_candidates").update({ job_id: jobId as string }).eq("id", run.candidate_id);
  await db.from("engine_runs").update({ job_id: jobId as string }).eq("id", run.id);
}

export async function applyRefresh(db: Db, run: EngineRun) {
  if (!run.job_id) return;
  const { data: units } = await db.from("engine_run_units").select("result").eq("run_id", run.id).eq("status", "done");
  const { data: steps } = await db.from("steps").select("id, position").eq("job_id", run.job_id);
  const stepAt = new Map(((steps ?? []) as { id: string; position: number }[]).map((s) => [s.position, s.id]));

  for (const u of (units ?? []) as { result: (Refreshed & { transcript_id: string }) | null }[]) {
    const out = u.result;
    if (!out?.additions?.length) continue;
    const { data: t } = await db.from("transcripts").select("title").eq("id", out.transcript_id).maybeSingle<{ title: string }>();
    const { data: segs } = await db.from("transcript_segments").select("*").eq("transcript_id", out.transcript_id).order("position");
    const byPosition = new Map(((segs ?? []) as TranscriptSegment[]).map((s) => [s.position, s]));

    for (const a of out.additions) {
      const seg = byPosition.get(a.quotes?.[0]?.passage ?? -1);
      await db.from("job_proposals").insert({
        organization_id: run.organization_id,
        job_id: run.job_id,
        run_id: run.id,
        target_kind: a.kind,
        target_id: a.kind === "data_item" ? null : (stepAt.get(a.step_position) ?? null),
        payload: {
          key: a.key ? slugify(a.key) : "",
          name: a.name,
          text: cleanVoice(a.text ?? ""),
          data_item: a.data_item ? slugify(a.data_item) : "",
          why: cleanVoice(a.why ?? ""),
          step_position: a.step_position,
        },
        speaker: seg?.speaker ?? null,
        text: seg?.text ?? null,
        transcript_id: out.transcript_id,
        segment_id: seg?.id ?? null,
        transcript_title: t?.title ?? "",
      });
    }
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import { startDraft, startFindJobs, startRefresh, unreadFor } from "@/lib/engine/run";
import { engineConfigured } from "@/lib/engine/client";
import type { JobCandidate, Transcript } from "@/lib/supabase";

// Reviewing what the engine proposed. Nothing here calls the model: the
// actions only create a run, which the open page then drives one unit at a
// time. Admin only, and every row written carries organization_id.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);
const back = (path: string): never => { revalidatePath(path.split("?")[0]); redirect(path); };

async function candidateOf(id: string) {
  const { data } = await supabaseServer().from("job_candidates").select("*").eq("id", id).maybeSingle<JobCandidate>();
  return data;
}

export async function startFindingJobs(form: FormData) {
  const user = await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/transcripts`;
  if (!engineConfigured()) fail(path, "The engine isn't set up on this server. Add the key, then redeploy.");
  const db = supabaseServer();
  const { data } = await db.from("transcripts").select("id").eq("organization_id", orgId);
  const ids = ((data ?? []) as Pick<Transcript, "id">[]).map((t) => t.id);
  if (!ids.length) fail(path, "There are no conversations to read yet.");
  try {
    await startFindJobs(db, orgId, ids, user.id);
  } catch (e) {
    fail(path, e instanceof Error ? e.message : "Couldn't start the run.");
  }
  back(path);
}

export async function startDrafting(form: FormData) {
  const user = await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/candidates`;
  if (!engineConfigured()) fail(path, "The engine isn't set up on this server. Add the key, then redeploy.");
  const candidate = await candidateOf(str(form, "id"));
  if (!candidate || candidate.organization_id !== orgId) fail(path, "That candidate is gone.");
  if (candidate!.job_id) fail(path, "Already drafted. Open the job.");
  const db = supabaseServer();
  const { data } = await db.from("transcripts").select("id").eq("organization_id", orgId);
  const ids = ((data ?? []) as Pick<Transcript, "id">[]).map((t) => t.id);
  if (!ids.length) fail(path, "There are no conversations to read yet.");
  try {
    await startDraft(db, orgId, candidate!.id, ids, user.id);
  } catch (e) {
    fail(path, e instanceof Error ? e.message : "Couldn't start the run.");
  }
  back(path);
}

export async function startRefreshing(form: FormData) {
  const user = await requireAdmin();
  const jobId = str(form, "job_id");
  const orgId = str(form, "organization_id");
  const path = `/admin/jobs/${jobId}`;
  if (!engineConfigured()) fail(path, "The engine isn't set up on this server. Add the key, then redeploy.");
  const db = supabaseServer();
  const unread = await unreadFor(db, orgId, jobId);
  if (!unread.length) fail(path, "Nothing new to read.");
  try {
    await startRefresh(db, orgId, jobId, unread.map((t) => t.id), user.id);
  } catch (e) {
    fail(path, e instanceof Error ? e.message : "Couldn't start the run.");
  }
  back(path);
}

async function decide(form: FormData, status: JobCandidate["status"], reason: string | null) {
  await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/candidates`;
  const { error } = await supabaseServer()
    .from("job_candidates")
    .update({ status, reason, decided_at: status === "proposed" ? null : new Date().toISOString() })
    .eq("id", str(form, "id"))
    .eq("organization_id", orgId);
  if (error) fail(path, error.message);
  back(path);
}

export async function acceptCandidate(form: FormData) {
  await decide(form, "accepted", null);
}

export async function setAsideCandidate(form: FormData) {
  const reason = str(form, "reason");
  if (!reason) fail(`/admin/orgs/${str(form, "organization_id")}/candidates`, "Say why you are setting it aside.");
  await decide(form, "set_aside", reason);
}

// Setting aside is reversible on purpose: the candidate never went away, it
// was only kept out of the interview list.
export async function bringBackCandidate(form: FormData) {
  await decide(form, "proposed", null);
}

export async function editCandidate(form: FormData) {
  await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/candidates`;
  const statement = str(form, "statement");
  if (!statement) fail(path, "The job statement can't be empty.");
  const { error } = await supabaseServer()
    .from("job_candidates")
    .update({ statement, executor_role: str(form, "executor_role") || "Unknown" })
    .eq("id", str(form, "id"))
    .eq("organization_id", orgId);
  if (error) fail(path, error.message);
  back(path);
}

export async function promoteCandidate(form: FormData) {
  await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/candidates`;
  const { error } = await supabaseServer()
    .from("job_candidates")
    .update({ kind: "job", status: "proposed", reason: null })
    .eq("id", str(form, "id"))
    .eq("organization_id", orgId);
  if (error) fail(path, error.message);
  back(path);
}

/** Split a merged candidate back into the wordings it was merged from. */
export async function splitCandidate(form: FormData) {
  await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/candidates`;
  const candidate = await candidateOf(str(form, "id"));
  if (!candidate || candidate.organization_id !== orgId) fail(path, "That candidate is gone.");
  const parts = candidate!.merged_from ?? [];
  if (!parts.length) fail(path, "This one was not merged from anything.");
  const db = supabaseServer();
  const { error } = await db.from("job_candidates").insert(
    parts.map((p) => ({
      organization_id: orgId,
      run_id: candidate!.run_id,
      kind: "job",
      statement: p.statement,
      executor_role: p.executor_role || candidate!.executor_role,
      explanation: candidate!.explanation,
    })),
  );
  if (error) fail(path, error.message);
  await db.from("job_candidates").update({ merged_from: null }).eq("id", candidate!.id);
  back(path);
}

export async function deleteEvidence(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}/content`;
  const { error } = await supabaseServer().from("draft_evidence").delete().eq("id", str(form, "id"));
  if (error) fail(path, error.message);
  back(path);
}

export async function ignoreProposal(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const { error } = await supabaseServer()
    .from("job_proposals")
    .update({ status: "ignored", decided_at: new Date().toISOString() })
    .eq("id", str(form, "id"));
  if (error) fail(path, error.message);
  back(path);
}

/** Add what a refresh run suggested, with the quote behind it. */
export async function applyProposal(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const db = supabaseServer();
  const { data: p } = await db.from("job_proposals").select("*").eq("id", str(form, "id")).maybeSingle();
  if (!p || p.job_id !== jobId) fail(path, "That suggestion is gone.");
  const payload = (p!.payload ?? {}) as { key?: string; name?: string; text?: string; data_item?: string };
  let targetKind: "step" | "data_item" | "statement" = p!.target_kind;
  let targetId: string | null = p!.target_id;

  if (p!.target_kind === "data_item") {
    const { data: item, error } = await db
      .from("data_items")
      .insert({ job_id: jobId, key: payload.key || "item", name: payload.name || payload.key || "Item" })
      .select("id")
      .single();
    if (error || !item) fail(path, error?.message ?? "Couldn't add the data item.");
    targetId = item!.id;
  } else if (p!.target_kind === "statement") {
    if (!targetId) fail(path, "That suggestion has no step to go under.");
    const { data: existing } = await db.from("statements").select("position").eq("step_id", targetId!).order("position", { ascending: false }).limit(1).maybeSingle();
    const { data: item } = payload.data_item
      ? await db.from("data_items").select("id").eq("job_id", jobId).eq("key", payload.data_item).maybeSingle()
      : { data: null };
    const { data: stmt, error } = await db
      .from("statements")
      .insert({ step_id: targetId!, position: (existing?.position ?? 0) + 1, text: payload.text || "", data_item_id: item?.id ?? null })
      .select("id")
      .single();
    if (error || !stmt) fail(path, error?.message ?? "Couldn't add the statement.");
    targetId = stmt!.id;
  } else {
    if (!targetId) fail(path, "That suggestion has no step to go under.");
    const { data: step } = await db.from("steps").select("description").eq("id", targetId!).maybeSingle();
    const merged = [step?.description, payload.text].filter(Boolean).join(" ");
    const { error } = await db.from("steps").update({ description: merged }).eq("id", targetId!);
    if (error) fail(path, error.message);
    targetKind = "step";
  }

  if (p!.text) {
    await db.from("draft_evidence").insert({
      organization_id: p!.organization_id,
      job_id: jobId,
      target_kind: targetKind,
      target_id: targetId,
      transcript_id: p!.transcript_id,
      segment_id: p!.segment_id,
      speaker: p!.speaker,
      text: p!.text,
      transcript_title: p!.transcript_title ?? "",
    });
  }
  await db.from("job_proposals").update({ status: "applied", decided_at: new Date().toISOString() }).eq("id", p!.id);
  back(path);
}

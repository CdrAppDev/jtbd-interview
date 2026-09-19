import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xmfyhcxfyzandkpmbfbo.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_UeW98UzhC_HoGthDOR8KOg_56n7n2R2";

export function supabase() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { fetch: (url: RequestInfo | URL, init?: RequestInit) => fetch(url, { ...init, cache: "no-store" }) },
  });
}

export type Job = {
  id: string;
  organization_id: string;
  slug: string;
  title: string;
  executor_name: string;
  executor_role: string;
  description: string | null;
  draft: boolean;
  candidate_id: string | null;
};
export type Step = {
  id: string;
  job_id: string;
  position: number;
  stage: string;
  title: string;
  description: string;
};
export type DataItem = { id: string; key: string; name: string };
export type Statement = { id: string; step_id: string; position: number; text: string; data_item_id: string | null };

export type Organization = {
  id: string;
  name: string;
  slug: string;
  contact_name: string | null;
  contact_email: string | null;
  retention_days: number;
  created_at: string;
};
export type InterviewLink = {
  id: string;
  organization_id: string;
  job_id: string;
  token: string;
  closes_at: string;
  revoked_at: string | null;
  respondent_cap: number | null;
  created_at: string;
};
export type Respondent = {
  id: string;
  job_id: string;
  organization_id: string;
  link_id: string | null;
  name: string | null;
  role: string | null;
  created_at: string;
  completed_at: string | null;
};
export type JobProgress = { job_id: string; organization_id: string; started: number; finished: number };

// Intent 004: transcripts, the engine, candidates and drafted jobs.

export type Transcript = {
  id: string;
  organization_id: string;
  source: "fellow" | "paste";
  fellow_recording_id: string | null;
  title: string;
  held_at: string;
  attendees: string[];
  language: string | null;
  duration_seconds: number | null;
  imported_by: string | null;
  created_at: string;
};
export type TranscriptSegment = {
  id: string;
  transcript_id: string;
  organization_id: string;
  position: number;
  speaker: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  text: string;
};
export type RunKind = "find_jobs" | "draft_interview" | "refresh_evidence";
export type RunStatus = "running" | "done" | "failed";
export type EngineRun = {
  id: string;
  organization_id: string;
  kind: RunKind;
  status: RunStatus;
  candidate_id: string | null;
  job_id: string | null;
  transcript_ids: string[];
  model: string;
  units_total: number;
  units_done: number;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
};
export type EngineRunUnit = {
  id: string;
  run_id: string;
  organization_id: string;
  position: number;
  transcript_id: string | null;
  status: "pending" | "done" | "failed";
  attempts: number;
  result: unknown;
  error: string | null;
};
export type CandidateKind = "job" | "solution" | "constraint";
export type CandidateStatus = "proposed" | "accepted" | "set_aside";
export type JobCandidate = {
  id: string;
  organization_id: string;
  run_id: string | null;
  kind: CandidateKind;
  status: CandidateStatus;
  statement: string;
  executor_role: string;
  explanation: string | null;
  reason: string | null;
  merged_from: { statement: string; executor_role: string }[] | null;
  job_id: string | null;
  created_at: string;
  decided_at: string | null;
};
// Quote text, speaker and title are copies, so a quote survives its transcript
// being deleted. A null transcript_id means the source is gone.
export type CandidateQuote = {
  id: string;
  organization_id: string;
  candidate_id: string;
  transcript_id: string | null;
  segment_id: string | null;
  speaker: string | null;
  text: string;
  transcript_title: string;
  created_at: string;
};
export type EvidenceTarget = "job" | "step" | "data_item" | "statement";
export type DraftEvidence = {
  id: string;
  organization_id: string;
  job_id: string;
  target_kind: EvidenceTarget;
  target_id: string;
  transcript_id: string | null;
  segment_id: string | null;
  speaker: string | null;
  text: string;
  transcript_title: string;
  created_at: string;
};
export type ProposalTarget = "step" | "data_item" | "statement";
export type JobProposal = {
  id: string;
  organization_id: string;
  job_id: string;
  run_id: string | null;
  target_kind: ProposalTarget;
  target_id: string | null;
  payload: Record<string, unknown>;
  speaker: string | null;
  text: string | null;
  transcript_id: string | null;
  segment_id: string | null;
  transcript_title: string | null;
  status: "proposed" | "applied" | "ignored";
  created_at: string;
  decided_at: string | null;
};

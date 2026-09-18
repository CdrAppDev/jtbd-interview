"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase, type DataItem, type Statement, type Step } from "./supabase";

// The worker path. Every call goes through an interview_* database function
// that checks the link token, and the respondent secret where one is needed.
// The secret lives only in an httpOnly cookie scoped to this link's path.

const COOKIE = "jtbd_r";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type OpenResult = {
  status: "open" | "closed" | "full";
  org_name?: string;
  closes_at?: string;
  job?: { title: string; description: string | null; executor_name: string; executor_role: string };
  steps?: { position: number; stage: string; title: string }[];
};

export type ResumeResult = { respondent_id: string; next_position: number; completed: boolean } | null;

export type StepData = {
  step: Step;
  total: number;
  items: DataItem[];
  statements: Statement[];
  response: { data_item_ids: string[]; other_data: string | null; free_text: string | null } | null;
  ratings: { statement_id: string; importance: number; satisfaction: number }[];
};

export type StartState = { error?: string };

function secretFor(token: string) {
  void token;
  return cookies().get(COOKIE)?.value ?? null;
}

export async function openInterview(token: string): Promise<OpenResult> {
  const { data, error } = await supabase().rpc("interview_open", { p_token: token });
  if (error || !data) return { status: "closed" };
  return data as OpenResult;
}

export async function resumeInfo(token: string): Promise<ResumeResult> {
  const secret = secretFor(token);
  if (!secret) return null;
  const { data } = await supabase().rpc("interview_resume", { p_token: token, p_secret: secret });
  return (data as ResumeResult) ?? null;
}

export async function startInterview(token: string, _prev: StartState, form: FormData): Promise<StartState> {
  const role = String(form.get("role") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (!role) return { error: "Add your role. What you do, not your title." };
  const { data, error } = await supabase().rpc("interview_start", { p_token: token, p_role: role, p_name: name || null });
  if (error || !data) {
    const msg = error?.message ?? "";
    if (msg.includes("closed") || msg.includes("full")) return { error: "This interview has closed. If you think that is a mistake, ask the person who sent you the link." };
    return { error: "Couldn't start the interview. Try again." };
  }
  const { secret } = data as { respondent_id: string; secret: string };
  cookies().set(COOKIE, secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/i/${token}`,
    maxAge: THIRTY_DAYS,
  });
  redirect(`/i/${token}/1`);
}

export async function loadStep(token: string, position: number): Promise<StepData> {
  const secret = secretFor(token);
  if (!secret) redirect(`/i/${token}`);
  const { data, error } = await supabase().rpc("interview_step", { p_token: token, p_secret: secret, p_position: position });
  if (error || !data) redirect(`/i/${token}`);
  return data as StepData;
}

export type SavePayload = {
  stepId: string;
  itemIds: string[];
  other: string;
  free: string;
  ratings: { statement_id: string; importance: number; satisfaction: number }[];
  nextPosition: number | null;
};

export async function saveStep(token: string, payload: SavePayload): Promise<{ error?: string }> {
  const secret = secretFor(token);
  if (!secret) redirect(`/i/${token}`);
  const db = supabase();
  const { error } = await db.rpc("interview_save", {
    p_token: token,
    p_secret: secret,
    p_step_id: payload.stepId,
    p_item_ids: payload.itemIds,
    p_other: payload.other,
    p_free: payload.free,
    p_ratings: payload.ratings,
  });
  if (error) return { error: "Couldn't save this step. Check your connection and try again." };
  if (payload.nextPosition === null) {
    const fin = await db.rpc("interview_finish", { p_token: token, p_secret: secret });
    if (fin.error) return { error: "Couldn't finish the interview. Try again." };
    redirect(`/done`);
  }
  redirect(`/i/${token}/${payload.nextPosition}`);
}

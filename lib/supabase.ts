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

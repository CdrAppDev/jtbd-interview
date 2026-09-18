"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

// Every action runs as the signed-in admin; RLS is the enforcement, requireAdmin() is the friendly redirect.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = str(f, k); return v ? Number(v) : null; };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "job";
const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);
const back = (path: string): never => { revalidatePath(path); revalidatePath("/admin"); redirect(path); };

async function orgOfJob(jobId: string) {
  const { data } = await supabaseServer().from("jobs").select("organization_id").eq("id", jobId).single();
  return data?.organization_id as string | undefined;
}

// Organizations

export async function createOrg(form: FormData) {
  await requireAdmin();
  const name = str(form, "name");
  if (!name) fail("/admin/orgs/new", "Name is required.");
  const email = str(form, "contact_email").toLowerCase() || null;
  const db = supabaseServer();
  const { data, error } = await db
    .from("organizations")
    .insert({ name, slug: slugify(name), contact_name: str(form, "contact_name") || null, contact_email: email, retention_days: num(form, "retention_days") ?? 365 })
    .select("id")
    .single();
  if (error || !data) fail("/admin/orgs/new", error?.message ?? "Couldn't create the organization.");
  if (email) await db.from("memberships").insert({ organization_id: data!.id, email, role: "org_viewer" });
  back(`/admin/orgs/${data!.id}`);
}

export async function updateOrg(form: FormData) {
  await requireAdmin();
  const id = str(form, "id");
  const path = `/admin/orgs/${id}`;
  const name = str(form, "name");
  if (!name) fail(path, "Name is required.");
  const email = str(form, "contact_email").toLowerCase() || null;
  const db = supabaseServer();
  const { error } = await db
    .from("organizations")
    .update({ name, contact_name: str(form, "contact_name") || null, contact_email: email, retention_days: num(form, "retention_days") ?? 365 })
    .eq("id", id);
  if (error) fail(path, error.message);
  // The contact's login follows the contact email: one org_viewer per org.
  await db.from("memberships").delete().eq("organization_id", id).eq("role", "org_viewer").neq("email", email ?? "");
  if (email) await db.from("memberships").upsert({ organization_id: id, email, role: "org_viewer" }, { onConflict: "organization_id,email" });
  back(path);
}

export async function deleteOrg(form: FormData) {
  await requireAdmin();
  const id = str(form, "id");
  const path = `/admin/orgs/${id}`;
  const db = supabaseServer();
  const { data: org } = await db.from("organizations").select("name").eq("id", id).single();
  if (!org || str(form, "confirm") !== org.name) fail(path, "Type the organization's name exactly to delete it.");
  const { error } = await db.from("organizations").delete().eq("id", id);
  if (error) fail(path, error.message);
  back("/admin");
}

// Jobs

export async function createJob(form: FormData) {
  await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/jobs/new`;
  const mode = str(form, "mode");
  const db = supabaseServer();
  let slug = slugify(str(form, "slug") || str(form, "title") || "job");
  const { data: taken } = await db.from("jobs").select("slug").eq("organization_id", orgId);
  const used = new Set((taken ?? []).map((j) => j.slug));
  let candidate = slug, i = 2;
  while (used.has(candidate)) candidate = `${slug}-${i++}`;
  slug = candidate;
  let res;
  if (mode === "clone") {
    const source = str(form, "source_job_id");
    if (!source) fail(path, "Pick a job to clone.");
    res = await db.rpc("clone_job", { p_source: source, p_org: orgId, p_slug: slug });
  } else {
    const title = str(form, "title");
    if (!title) fail(path, "Give the job a title.");
    res = await db.rpc("skeleton_job", { p_org: orgId, p_slug: slug, p_title: title });
  }
  if (res.error || !res.data) fail(path, res.error?.message ?? "Couldn't create the job.");
  back(`/admin/jobs/${res.data}`);
}

export async function updateJob(form: FormData) {
  await requireAdmin();
  const id = str(form, "id");
  const path = `/admin/jobs/${id}`;
  const title = str(form, "title");
  if (!title) fail(path, "Title is required.");
  const { error } = await supabaseServer()
    .from("jobs")
    .update({ title, executor_name: str(form, "executor_name") || "Executor", executor_role: str(form, "executor_role") || "Role", description: str(form, "description") || null })
    .eq("id", id);
  if (error) fail(path, error.message);
  back(path);
}

export async function saveStepContent(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const title = str(form, "title");
  if (!title) fail(path, "Each step needs a title.");
  const { error } = await supabaseServer().from("steps").update({ title, description: str(form, "description") }).eq("id", str(form, "id"));
  if (error) fail(path, error.message);
  back(path);
}

export async function saveDataItem(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const name = str(form, "name");
  if (!name) fail(path, "Data item needs a name.");
  const id = str(form, "id");
  const db = supabaseServer();
  const { error } = id
    ? await db.from("data_items").update({ name }).eq("id", id)
    : await db.from("data_items").insert({ job_id: jobId, key: slugify(name), name });
  if (error) fail(path, error.message);
  back(path);
}

export async function deleteDataItem(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const id = str(form, "id");
  const db = supabaseServer();
  await db.from("statements").update({ data_item_id: null }).eq("data_item_id", id);
  await db.from("step_data_items").delete().eq("data_item_id", id);
  const { error } = await db.from("data_items").delete().eq("id", id);
  if (error) fail(path, error.message);
  back(path);
}

export async function setStepItems(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const stepId = str(form, "step_id");
  const ids = form.getAll("item").map(String);
  const db = supabaseServer();
  await db.from("step_data_items").delete().eq("step_id", stepId);
  if (ids.length) {
    const { error } = await db.from("step_data_items").insert(ids.map((data_item_id, i) => ({ step_id: stepId, data_item_id, position: i + 1 })));
    if (error) fail(path, error.message);
  }
  back(path);
}

export async function saveStatement(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const text = str(form, "text");
  if (!text) fail(path, "Statement text is required.");
  const id = str(form, "id");
  const row = { step_id: str(form, "step_id"), position: num(form, "position") ?? 1, text, data_item_id: str(form, "data_item_id") || null };
  const db = supabaseServer();
  const { error } = id ? await db.from("statements").update(row).eq("id", id) : await db.from("statements").insert(row);
  if (error) fail(path, error.message);
  back(path);
}

export async function deleteStatement(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const db = supabaseServer();
  await db.from("ratings").delete().eq("statement_id", str(form, "id"));
  const { error } = await db.from("statements").delete().eq("id", str(form, "id"));
  if (error) fail(path, error.message);
  back(path);
}

// Interview links

function closesAtFrom(form: FormData, path: string) {
  const d = str(form, "closes_at");
  const t = Date.parse(`${d}T23:59:59`);
  if (!d || Number.isNaN(t)) fail(path, "Pick a closing date.");
  return new Date(t).toISOString();
}

export async function createLink(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const orgId = await orgOfJob(jobId);
  if (!orgId) fail(path, "Job not found.");
  const token = randomBytes(32).toString("base64url");
  const { error } = await supabaseServer()
    .from("interview_links")
    .insert({ organization_id: orgId, job_id: jobId, token, closes_at: closesAtFrom(form, path), respondent_cap: num(form, "respondent_cap") });
  if (error) fail(path, error.message.includes("one_active") ? "This job already has an active link. Revoke it first." : error.message);
  back(path);
}

export async function updateLink(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const { error } = await supabaseServer()
    .from("interview_links")
    .update({ closes_at: closesAtFrom(form, path), respondent_cap: num(form, "respondent_cap") })
    .eq("id", str(form, "id"));
  if (error) fail(path, error.message);
  back(path);
}

export async function revokeLink(form: FormData) {
  await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const { error } = await supabaseServer().from("interview_links").update({ revoked_at: new Date().toISOString() }).eq("id", str(form, "id"));
  if (error) fail(path, error.message);
  back(path);
}

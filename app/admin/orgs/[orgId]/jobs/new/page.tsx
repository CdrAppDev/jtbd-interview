import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Job, Organization } from "@/lib/supabase";
import { createJob } from "@/app/admin/actions";

export default async function NewJob({ params, searchParams }: { params: { orgId: string }; searchParams: { error?: string } }) {
  const db = supabaseServer();
  const { data: org } = await db.from("organizations").select("*").eq("id", params.orgId).maybeSingle<Organization>();
  if (!org) notFound();
  const { data: all } = await db.from("jobs").select("id, title, organization_id, organizations(name)").order("title");
  const jobs = (all ?? []) as unknown as (Pick<Job, "id" | "title" | "organization_id"> & { organizations: { name: string } | null })[];

  return (
    <main className="wrap stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href={`/admin/orgs/${org.id}`}>{org.name}</Link></div>
        <h1>New job</h1>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <form action={createJob} className="card stack">
        <input type="hidden" name="organization_id" value={org.id} />
        <input type="hidden" name="mode" value="clone" />
        <h2>Clone an existing job</h2>
        <p className="muted small">Copies the steps, data items and statements. Edit them afterwards.</p>
        <div className="field">
          <label htmlFor="source_job_id">Job to clone</label>
          <select id="source_job_id" name="source_job_id" required>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} ({j.organizations?.name ?? "?"})</option>)}
          </select>
        </div>
        <div><button className="btn" type="submit">Clone</button></div>
      </form>

      <form action={createJob} className="card stack">
        <input type="hidden" name="organization_id" value={org.id} />
        <input type="hidden" name="mode" value="skeleton" />
        <h2>Start from the eight steps</h2>
        <p className="muted small">Empty steps named after the job map. You write the descriptions, data items and statements.</p>
        <div className="field">
          <label htmlFor="title">Job statement</label>
          <input id="title" name="title" placeholder="Put together the statement of work for a deal that's been approved" />
        </div>
        <div><button className="btn" type="submit">Create</button></div>
      </form>
    </main>
  );
}

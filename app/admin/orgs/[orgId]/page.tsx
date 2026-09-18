import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Job, JobProgress, Organization } from "@/lib/supabase";
import { updateOrg, deleteOrg } from "@/app/admin/actions";

export default async function OrgPage({ params, searchParams }: { params: { orgId: string }; searchParams: { error?: string } }) {
  const db = supabaseServer();
  const { data: org } = await db.from("organizations").select("*").eq("id", params.orgId).maybeSingle<Organization>();
  if (!org) notFound();
  const [{ data: jobs }, { data: progress }] = await Promise.all([
    db.from("jobs").select("id, slug, title").eq("organization_id", org.id).order("title"),
    db.from("job_progress").select("*").eq("organization_id", org.id),
  ]);
  const P = new Map(((progress ?? []) as JobProgress[]).map((p) => [p.job_id, p]));

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · {org.slug}</div>
        <h1>{org.name}</h1>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <section className="card stack">
        <div className="row between">
          <h2>Jobs</h2>
          <Link className="btn small" href={`/admin/orgs/${org.id}/jobs/new`}>New job</Link>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Job</th><th style={{ textAlign: "right" }}>Started</th><th style={{ textAlign: "right" }}>Finished</th><th></th></tr></thead>
            <tbody>
              {((jobs ?? []) as Pick<Job, "id" | "slug" | "title">[]).map((j) => (
                <tr key={j.id}>
                  <td><Link href={`/admin/jobs/${j.id}`}>{j.title}</Link></td>
                  <td className="num">{P.get(j.id)?.started ?? 0}</td>
                  <td className="num">{P.get(j.id)?.finished ?? 0}</td>
                  <td className="small"><Link href={`/admin/jobs/${j.id}/results`}>Results</Link></td>
                </tr>
              ))}
              {(jobs ?? []).length === 0 && <tr><td colSpan={4} className="muted">No jobs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <form action={updateOrg} className="card stack">
        <h2>Details</h2>
        <input type="hidden" name="id" value={org.id} />
        <div className="field"><label htmlFor="name">Organization name</label><input id="name" name="name" defaultValue={org.name} required /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="contact_name">Contact name</label><input id="contact_name" name="contact_name" defaultValue={org.contact_name ?? ""} /></div>
          <div className="field"><label htmlFor="contact_email">Contact email</label><input id="contact_email" name="contact_email" type="email" defaultValue={org.contact_email ?? ""} /></div>
          <div className="field"><label htmlFor="retention_days">Keep data for (days)</label><input id="retention_days" name="retention_days" type="number" min={1} defaultValue={org.retention_days} /></div>
        </div>
        <p className="hint">Changing the contact email moves the sign-in to the new address.</p>
        <div><button className="btn" type="submit">Save</button></div>
      </form>

      <form action={deleteOrg} className="card stack">
        <h2>Delete this organization</h2>
        <p className="muted small">Deletes every job, link, respondent and answer under it. There is no undo. Type the organization's name to confirm.</p>
        <input type="hidden" name="id" value={org.id} />
        <div className="row">
          <input name="confirm" placeholder={org.name} style={{ maxWidth: 320 }} />
          <button className="btn ghost" type="submit">Delete organization</button>
        </div>
      </form>
    </main>
  );
}

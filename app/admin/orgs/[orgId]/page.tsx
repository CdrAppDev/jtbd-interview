import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Job, JobProgress, Organization } from "@/lib/supabase";
import { updateOrg, deleteOrg } from "@/app/admin/actions";

export default async function OrgPage({ params, searchParams }: { params: { orgId: string }; searchParams: { error?: string } }) {
  const db = supabaseServer();
  const { data: org } = await db.from("organizations").select("*").eq("id", params.orgId).maybeSingle<Organization>();
  if (!org) notFound();
  const [{ data: jobs }, { data: progress }, transcripts, candidates] = await Promise.all([
    db.from("jobs").select("id, slug, title, draft").eq("organization_id", org.id).order("title"),
    db.from("job_progress").select("*").eq("organization_id", org.id),
    db.from("transcripts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    db.from("job_candidates").select("status").eq("organization_id", org.id),
  ]);
  const toReview = ((candidates.data ?? []) as { status: string }[]).filter((c) => c.status === "proposed").length;
  const accepted = ((candidates.data ?? []) as { status: string }[]).filter((c) => c.status === "accepted").length;
  const P = new Map(((progress ?? []) as JobProgress[]).map((p) => [p.job_id, p]));

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · {org.slug}</div>
        <h1>{org.name}</h1>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <div className="form-grid">
        <section className="card stack">
          <div className="stack" style={{ gap: 4 }}>
            <h2>Transcripts</h2>
            <p className="muted small">Client conversations the jobs are found in. {transcripts.count ?? 0} stored.</p>
          </div>
          <div><Link className="btn ghost small" href={`/admin/orgs/${org.id}/transcripts`}>Open transcripts</Link></div>
        </section>
        <section className="card stack">
          <div className="stack" style={{ gap: 4 }}>
            <h2>Candidate jobs</h2>
            <p className="muted small">What the transcripts suggest the jobs are. You decide. {toReview} to review, {accepted} accepted.</p>
          </div>
          <div><Link className="btn ghost small" href={`/admin/orgs/${org.id}/candidates`}>Open candidates</Link></div>
        </section>
      </div>

      <section className="card stack">
        <div className="row between">
          <h2>Jobs</h2>
          <Link className="btn small" href={`/admin/orgs/${org.id}/jobs/new`}>New job</Link>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Job</th><th style={{ textAlign: "right" }}>Started</th><th style={{ textAlign: "right" }}>Finished</th><th></th></tr></thead>
            <tbody>
              {((jobs ?? []) as Pick<Job, "id" | "slug" | "title" | "draft">[]).map((j) => (
                <tr key={j.id}>
                  <td><Link href={`/admin/jobs/${j.id}`}>{j.title}</Link>{j.draft && <> <span className="tag">Draft</span></>}</td>
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
        <p className="muted small">Deletes every job, link, respondent, answer and transcript under it. There is no undo. Type the organization's name to confirm.</p>
        <input type="hidden" name="id" value={org.id} />
        <div className="row">
          <input name="confirm" placeholder={org.name} style={{ maxWidth: 320 }} />
          <button className="btn ghost" type="submit">Delete organization</button>
        </div>
      </form>
    </main>
  );
}

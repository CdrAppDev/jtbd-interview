import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import type { Job, JobProgress, Organization } from "@/lib/supabase";

export default async function AdminHome() {
  const db = supabaseServer();
  const [{ data: orgs }, { data: jobs }, { data: progress }] = await Promise.all([
    db.from("organizations").select("*").order("name"),
    db.from("jobs").select("id, organization_id, slug, title").order("title"),
    db.from("job_progress").select("*"),
  ]);
  const P = new Map(((progress ?? []) as JobProgress[]).map((p) => [p.job_id, p]));
  const J = (jobs ?? []) as Pick<Job, "id" | "organization_id" | "slug" | "title">[];

  return (
    <main className="wrap wide stack-lg">
      <header className="row between">
        <div className="stack" style={{ gap: 4 }}>
          <div className="eyebrow">Admin</div>
          <h1>Organizations</h1>
        </div>
        <Link className="btn" href="/admin/orgs/new">New organization</Link>
      </header>

      {((orgs ?? []) as Organization[]).map((o) => (
        <section key={o.id} className="card stack">
          <div className="row between">
            <h2><Link href={`/admin/orgs/${o.id}`}>{o.name}</Link></h2>
            <Link className="btn ghost small" href={`/admin/orgs/${o.id}/jobs/new`}>New job</Link>
          </div>
          {o.contact_email && <p className="muted small">Contact: {o.contact_name ?? ""} {o.contact_email}</p>}
          <div className="tablewrap">
            <table>
              <thead><tr><th>Job</th><th style={{ textAlign: "right" }}>Started</th><th style={{ textAlign: "right" }}>Finished</th><th></th></tr></thead>
              <tbody>
                {J.filter((j) => j.organization_id === o.id).map((j) => (
                  <tr key={j.id}>
                    <td><Link href={`/admin/jobs/${j.id}`}>{j.title}</Link></td>
                    <td className="num">{P.get(j.id)?.started ?? 0}</td>
                    <td className="num">{P.get(j.id)?.finished ?? 0}</td>
                    <td className="small"><Link href={`/admin/jobs/${j.id}/results`}>Results</Link></td>
                  </tr>
                ))}
                {J.filter((j) => j.organization_id === o.id).length === 0 && <tr><td colSpan={4} className="muted">No jobs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {(orgs ?? []).length === 0 && <p className="muted">No organizations yet.</p>}
    </main>
  );
}

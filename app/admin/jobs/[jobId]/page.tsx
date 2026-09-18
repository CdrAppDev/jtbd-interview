import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { siteUrl } from "@/lib/auth";
import type { InterviewLink, Job, JobProgress, Respondent, Step } from "@/lib/supabase";
import CopyButton from "@/components/CopyButton";
import { createLink, updateLink, revokeLink } from "@/app/admin/actions";

export default async function JobPage({ params, searchParams }: { params: { jobId: string }; searchParams: { error?: string } }) {
  const db = supabaseServer();
  const { data: jobRow } = await db.from("jobs").select("*, organizations(name)").eq("id", params.jobId).maybeSingle();
  if (!jobRow) notFound();
  const job = jobRow as Job & { organizations: { name: string } | null };

  const [{ data: steps }, { data: link }, { data: respondents }, { data: progress }] = await Promise.all([
    db.from("steps").select("id").eq("job_id", job.id),
    db.from("interview_links").select("*").eq("job_id", job.id).is("revoked_at", null).maybeSingle<InterviewLink>(),
    db.from("respondents").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
    db.from("job_progress").select("*").eq("job_id", job.id).maybeSingle<JobProgress>(),
  ]);
  const S = (steps ?? []) as Pick<Step, "id">[];
  const R = (respondents ?? []) as Respondent[];
  const { data: saved } = R.length
    ? await db.from("step_responses").select("respondent_id, step_id").in("respondent_id", R.map((r) => r.id))
    : { data: [] as { respondent_id: string; step_id: string }[] };
  const savedBy = new Map<string, number>();
  for (const row of (saved ?? []) as { respondent_id: string; step_id: string }[]) savedBy.set(row.respondent_id, (savedBy.get(row.respondent_id) ?? 0) + 1);
  const linkUrl = link ? `${siteUrl()}/i/${link.token}` : null;
  const today = new Date().toISOString().slice(0, 10);
  const dateOf = (iso: string) => iso.slice(0, 10);
  const hid = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${job.organization_id}`}>{job.organizations?.name}</Link></div>
        <h1>{job.title}.</h1>
        <div className="row">
          <span className="muted small">{progress?.started ?? 0} started, {progress?.finished ?? 0} finished</span>
          <Link className="btn small" href={`/admin/jobs/${job.id}/results`}>Results</Link>
          <Link className="btn ghost small" href={`/admin/jobs/${job.id}/content`}>Edit the job content</Link>
        </div>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <section className="card stack" id="link">
        <h2>Interview link</h2>
        {link && linkUrl ? (
          <>
            <div className="linkbox row between">
              <span className="mono">{linkUrl}</span>
              <CopyButton text={linkUrl} />
            </div>
            <form action={updateLink} className="form-grid">
              {hid("id", link.id)}{hid("job_id", job.id)}
              <div className="field"><label htmlFor="closes_at">Closes on</label><input id="closes_at" name="closes_at" type="date" defaultValue={dateOf(link.closes_at)} min={today} required /></div>
              <div className="field"><label htmlFor="respondent_cap">Respondent cap (optional)</label><input id="respondent_cap" name="respondent_cap" type="number" min={1} defaultValue={link.respondent_cap ?? ""} /></div>
              <div><button className="btn" type="submit">Save</button></div>
            </form>
            <form action={revokeLink} className="row">
              {hid("id", link.id)}{hid("job_id", job.id)}
              <button className="btn ghost small" type="submit">Revoke this link</button>
              <span className="muted small">Nobody new can start. People who already started can finish.</span>
            </form>
          </>
        ) : (
          <form action={createLink} className="form-grid">
            {hid("job_id", job.id)}
            <div className="field"><label htmlFor="closes_at">Closes on</label><input id="closes_at" name="closes_at" type="date" min={today} required /></div>
            <div className="field"><label htmlFor="respondent_cap">Respondent cap (optional)</label><input id="respondent_cap" name="respondent_cap" type="number" min={1} /></div>
            <div><button className="btn" type="submit">Create link</button></div>
          </form>
        )}
      </section>

      <section className="card stack" id="respondents">
        <h2>Respondents</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Role</th><th>Name</th><th style={{ textAlign: "right" }}>Steps saved</th><th>Status</th><th>Started</th><th></th></tr></thead>
            <tbody>
              {R.map((r) => (
                <tr key={r.id}>
                  <td>{r.role ?? "(not given)"}</td>
                  <td className="muted">{r.name ?? ""}</td>
                  <td className="num">{savedBy.get(r.id) ?? 0} of {S.length}</td>
                  <td>{r.completed_at ? "Finished" : "In progress"}</td>
                  <td className="small muted">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="small"><Link href={`/admin/jobs/${job.id}/respondents/${r.id}`}>Open</Link></td>
                </tr>
              ))}
              {R.length === 0 && <tr><td colSpan={6} className="muted">Nobody yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}

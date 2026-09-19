import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { siteUrl } from "@/lib/auth";
import type { InterviewLink, Job, JobProgress, Respondent, Step } from "@/lib/supabase";
import CopyButton from "@/components/CopyButton";
import { createLink, updateLink, revokeLink } from "@/app/admin/actions";
import { applyProposal, ignoreProposal, startRefreshing } from "@/app/admin/actions-candidates";
import { stateOf, unreadFor } from "@/lib/engine/run";
import { engineConfigured } from "@/lib/engine/client";
import { dollars, estimateCents, hoursOf } from "@/lib/cost";
import type { EngineRun, JobCandidate, JobProposal } from "@/lib/supabase";
import RunProgress from "@/components/RunProgress";

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
  // What a later conversation might add to a job already drafted.
  const [{ data: candidate }, { data: proposalRows }, { data: refreshRows }] = await Promise.all([
    job.candidate_id
      ? db.from("job_candidates").select("id, statement, executor_role").eq("id", job.candidate_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("job_proposals").select("*").eq("job_id", job.id).eq("status", "proposed").order("created_at"),
    db.from("engine_runs").select("*").eq("job_id", job.id).eq("kind", "refresh_evidence").order("created_at", { ascending: false }).limit(1),
  ]);
  const proposals = (proposalRows ?? []) as JobProposal[];
  const refresh = ((refreshRows ?? []) as EngineRun[])[0];
  const refreshing = refresh?.status === "running" ? refresh : null;
  const refreshState = refreshing ? await stateOf(db, refreshing) : null;
  const unread = job.candidate_id && !refreshing ? await unreadFor(db, job.organization_id, job.id) : [];
  const unreadSeconds = unread.reduce((n, t) => n + (t.duration_seconds ?? 0), 0);
  // Fall back to the token rule of thumb when a transcript has no duration.
  const unreadTokens = unreadSeconds > 0 ? Math.round((unreadSeconds / 3600) * 12000) : unread.length * 12000;

  const linkUrl = link ? `${siteUrl()}/i/${link.token}` : null;
  const today = new Date().toISOString().slice(0, 10);
  const dateOf = (iso: string) => iso.slice(0, 10);
  const hid = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${job.organization_id}`}>{job.organizations?.name}</Link></div>
        <h1>{job.title}.{job.draft && <> <span className="tag">Draft</span></>}</h1>
        {candidate && (
          <p className="muted small">
            Drafted from a candidate: <Link href={`/admin/orgs/${job.organization_id}/candidates#c-${(candidate as Pick<JobCandidate, "id" | "statement">).id}`}>{(candidate as Pick<JobCandidate, "id" | "statement">).statement}</Link>
          </p>
        )}
        <p className="muted small">{progress?.started ?? 0} started, {progress?.finished ?? 0} finished</p>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <section className="card row between">
        <div className="stack" style={{ gap: 4 }}>
          <h2>Results</h2>
          <p className="muted small">Friction scores, the landscape chart, what to fix first, and which data the job depends on.</p>
        </div>
        <Link className="btn" href={`/admin/jobs/${job.id}/results`}>See the results</Link>
      </section>

      {job.candidate_id && (refreshing || unread.length > 0 || proposals.length > 0) && (
        <section className="card stack">
          <h2>New evidence</h2>
          {refreshing && refreshState ? (
            <RunProgress runId={refreshing.id} initial={refreshState} />
          ) : unread.length > 0 ? (
            <form action={startRefreshing} className="stack" style={{ gap: 10 }}>
              {hid("job_id", job.id)}{hid("organization_id", job.organization_id)}
              <p className="muted small">
                {unread.length} transcript{unread.length === 1 ? " has" : "s have"} come in since this job was written.
                Costs about {dollars(estimateCents("claude-opus-5", unreadTokens))} to read {hoursOf(unreadTokens).toFixed(1)} hours.
              </p>
              <div><button className="btn" type="submit" disabled={!engineConfigured()}>Check for new evidence</button></div>
            </form>
          ) : null}

          {proposals.length > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="eyebrow">Suggested additions</div>
              {proposals.map((p) => {
                const payload = p.payload as { name?: string; text?: string; why?: string; step_position?: number };
                return (
                  <div key={p.id} className="stack" style={{ gap: 6 }}>
                    <p>
                      <span className="tag">{p.target_kind === "data_item" ? "Data item" : p.target_kind === "statement" ? "Statement" : "Step"}</span>{" "}
                      {payload.name || payload.text}
                    </p>
                    {payload.why && <p className="muted small">{payload.why}</p>}
                    {p.text && (
                      <blockquote className="quote">
                        {p.text}
                        <span className="cite">{p.speaker ?? "Unknown"}, {p.transcript_title}</span>
                      </blockquote>
                    )}
                    <div className="row">
                      <form action={applyProposal}>{hid("id", p.id)}{hid("job_id", job.id)}<button className="btn small" type="submit">Add</button></form>
                      <form action={ignoreProposal}>{hid("id", p.id)}{hid("job_id", job.id)}<button className="btn ghost small" type="submit">Ignore</button></form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!refreshing && unread.length === 0 && proposals.length === 0 && <p className="muted small">Nothing new to add.</p>}
        </section>
      )}

      <section className="card row between">
        <div className="stack" style={{ gap: 4 }}>
          <h2>Job content</h2>
          <p className="muted small">The steps, data items and statements workers see.</p>
        </div>
        <Link className="btn ghost" href={`/admin/jobs/${job.id}/content`}>Edit the job content</Link>
      </section>

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

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { stateOf } from "@/lib/engine/run";
import type { CandidateQuote, EngineRun, JobCandidate, Organization } from "@/lib/supabase";
import RunProgress from "@/components/RunProgress";
import {
  acceptCandidate, bringBackCandidate, editCandidate, promoteCandidate,
  setAsideCandidate, splitCandidate, startDrafting,
} from "@/app/admin/actions-candidates";

// What the transcripts suggest the jobs are. Nothing here is a decision the
// engine made: every candidate waits for Chris.

export default async function CandidatesPage({ params, searchParams }: { params: { orgId: string }; searchParams: { error?: string } }) {
  const db = supabaseServer();
  const { data: org } = await db.from("organizations").select("*").eq("id", params.orgId).maybeSingle<Organization>();
  if (!org) notFound();

  const [{ data: cands }, { data: quotes }, { data: runs }, { data: jobs }] = await Promise.all([
    db.from("job_candidates").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }),
    db.from("candidate_quotes").select("*").eq("organization_id", org.id).order("created_at"),
    db.from("engine_runs").select("*").eq("organization_id", org.id).eq("status", "running").order("created_at", { ascending: false }),
    db.from("jobs").select("id, title").eq("organization_id", org.id),
  ]);
  const C = (cands ?? []) as JobCandidate[];
  const Q = (quotes ?? []) as CandidateQuote[];
  const jobTitle = new Map(((jobs ?? []) as { id: string; title: string }[]).map((j) => [j.id, j.title]));
  const quotesOf = (id: string) => Q.filter((q) => q.candidate_id === id);

  const running = ((runs ?? []) as EngineRun[]).find((r) => r.kind === "draft_interview");
  const runState = running ? await stateOf(db, running) : null;

  const toReview = C.filter((c) => c.kind === "job" && c.status === "proposed");
  const accepted = C.filter((c) => c.kind === "job" && c.status === "accepted");
  const setAside = C.filter((c) => c.kind === "job" && c.status === "set_aside");
  const notJobs = C.filter((c) => c.kind !== "job");
  const hid = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  const quoteList = (id: string) => {
    const list = quotesOf(id);
    if (!list.length) return null;
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">From the transcripts</div>
        {list.map((q) => (
          <blockquote key={q.id} className="quote">
            {q.text}
            <span className="cite">
              {q.speaker ?? "Unknown"}, {q.transcript_id
                ? <Link href={`/admin/orgs/${org.id}/transcripts/${q.transcript_id}#s-`}>{q.transcript_title}</Link>
                : <>{q.transcript_title} (transcript deleted)</>}
            </span>
          </blockquote>
        ))}
      </div>
    );
  };

  const card = (c: JobCandidate, actions: React.ReactNode) => (
    <div key={c.id} id={`c-${c.id}`} className="card stack">
      <div className="stack" style={{ gap: 4 }}>
        <h3>{c.statement}</h3>
        <p className="muted small">Who does it: {c.executor_role}</p>
      </div>
      {c.explanation && (
        <div className="stack" style={{ gap: 2 }}>
          <div className="eyebrow">Why the engine thinks so</div>
          <p>{c.explanation}</p>
        </div>
      )}
      {c.reason && <p className="muted small">Set aside: {c.reason}</p>}
      {c.merged_from && c.merged_from.length > 0 && (
        <p className="muted small">Merged from {c.merged_from.length} candidates: {c.merged_from.map((m) => m.statement).join(" | ")}</p>
      )}
      {quoteList(c.id)}
      {actions}
    </div>
  );

  return (
    <main className="wrap stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${org.id}`}>{org.name}</Link></div>
        <h1>Candidate jobs</h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>What the transcripts suggest the jobs are. You decide. Setting one aside keeps it out of the interview list, nothing more: it stays here with its quotes and keeps collecting new ones.</p>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}
      {running && runState && (
        <section className="card stack">
          <h2>Writing the interview</h2>
          <RunProgress runId={running.id} initial={runState} />
        </section>
      )}

      <section className="stack">
        <h2>To review</h2>
        {toReview.length === 0 && <p className="muted">Nothing waiting. Run &quot;Find the jobs&quot; on the transcripts page.</p>}
        {toReview.map((c) =>
          card(c, (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row">
                <form action={acceptCandidate}>{hid("id", c.id)}{hid("organization_id", org.id)}<button className="btn small" type="submit">Accept</button></form>
                {c.merged_from && c.merged_from.length > 0 && (
                  <form action={splitCandidate}>{hid("id", c.id)}{hid("organization_id", org.id)}<button className="btn ghost small" type="submit">Split</button></form>
                )}
              </div>
              <form action={setAsideCandidate} className="row">
                {hid("id", c.id)}{hid("organization_id", org.id)}
                <input name="reason" placeholder="Why are you setting it aside?" style={{ flex: 1, minWidth: 220 }} aria-label="Why are you setting it aside?" />
                <button className="btn ghost small" type="submit">Set aside</button>
              </form>
              <details>
                <summary className="small">Edit the wording</summary>
                <form action={editCandidate} className="stack" style={{ gap: 8, marginTop: 8 }}>
                  {hid("id", c.id)}{hid("organization_id", org.id)}
                  <input name="statement" defaultValue={c.statement} aria-label="Job statement" />
                  <input name="executor_role" defaultValue={c.executor_role} aria-label="Who does it" />
                  <div><button className="btn ghost small" type="submit">Save</button></div>
                </form>
              </details>
            </div>
          )),
        )}
      </section>

      <section className="stack">
        <h2>Accepted</h2>
        {accepted.length === 0 && <p className="muted">None accepted yet.</p>}
        {accepted.map((c) =>
          card(c, c.job_id ? (
            <p className="muted small">Already drafted. <Link href={`/admin/jobs/${c.job_id}`}>{jobTitle.get(c.job_id) ?? "Open the job"}</Link></p>
          ) : (
            <form action={startDrafting} className="row">
              {hid("id", c.id)}{hid("organization_id", org.id)}
              <button className="btn" type="submit" disabled={Boolean(running)}>Draft the interview</button>
            </form>
          )),
        )}
      </section>

      <section className="stack">
        <h2>Set aside</h2>
        {setAside.length === 0 && <p className="muted">None set aside.</p>}
        {setAside.map((c) =>
          card(c, (
            <form action={bringBackCandidate} className="row">
              {hid("id", c.id)}{hid("organization_id", org.id)}
              <button className="btn ghost small" type="submit">Bring back</button>
            </form>
          )),
        )}
      </section>

      <section className="stack">
        <h2>Not a job</h2>
        {notJobs.length === 0 && <p className="muted">Nothing was set aside as a solution or a constraint.</p>}
        {notJobs.map((c) => (
          <div key={c.id} id={`c-${c.id}`} className="card stack">
            <div className="stack" style={{ gap: 4 }}>
              <h3>{c.statement}</h3>
              <p className="muted small">{c.kind === "solution" ? "A solution, not a job" : "A constraint, not a job"}. {c.reason}</p>
            </div>
            {quoteList(c.id)}
            <form action={promoteCandidate} className="row">
              {hid("id", c.id)}{hid("organization_id", org.id)}
              <button className="btn ghost small" type="submit">This is a job</button>
            </form>
          </div>
        ))}
      </section>
    </main>
  );
}

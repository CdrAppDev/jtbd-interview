import { supabase, JOB_SLUG, type Job, type Step } from "@/lib/supabase";
import StartForm from "@/components/StartForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = supabase();
  const { data: job } = await db.from("jobs").select("*").eq("slug", JOB_SLUG).single<Job>();
  if (!job) return <main className="wrap">Job not found.</main>;
  const { data: steps } = await db.from("steps").select("*").eq("job_id", job.id).order("position");

  return (
    <main className="wrap stack-lg">
      <header className="stack">
        <div className="eyebrow">Interview</div>
        <div>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>The job</div>
          <h1 style={{ fontSize: "clamp(28px, 4.5vw, 40px)", marginTop: 4 }}>{job.title}.</h1>
        </div>
        <p className="muted" style={{ maxWidth: "60ch" }}>
          You do this job, so you're the expert here. We're working out what to fix and which information this work really depends on. Before anything gets decided, we want to understand the job as you actually do it.
        </p>
        <p className="muted" style={{ maxWidth: "60ch" }}>{job.description}</p>
      </header>

      <section className="section">
        <h2>The eight steps</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          {(steps as Step[] | null)?.map((s) => (
            <li key={s.id}>
              <span style={{ fontWeight: 600 }}>{s.title}</span>
              <span className="muted small"> · {s.stage}</span>
            </li>
          ))}
        </ol>
        <p className="hint">
          There are no right answers. The gap between how the job is supposed to work and how it really works is exactly what we're looking for, so don't clean it up.
        </p>
      </section>

      <section className="section">
        <h2>Before you start</h2>
        <p className="hint">
          Your name is attached so the project team can tell responses apart and follow up on what you share.
        </p>
        <StartForm jobId={job.id} />
      </section>
    </main>
  );
}

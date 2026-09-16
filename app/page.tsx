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
        <div className="eyebrow">Interview · {job.executor_name}, {job.executor_role}</div>
        <h1 style={{ fontSize: "clamp(28px, 4.5vw, 40px)" }}>{job.title}.</h1>
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
          For this run, put yourself in Derek's shoes. Answer as the person doing this job at a Salesforce implementation partner, using whatever real experience you have with proposals, SOWs and handoffs.
        </p>
      </section>

      <section className="section">
        <h2>Before you start</h2>
        <StartForm jobId={job.id} />
      </section>
    </main>
  );
}

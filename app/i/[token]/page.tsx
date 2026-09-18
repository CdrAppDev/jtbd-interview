import Link from "next/link";
import { openInterview, resumeInfo } from "@/lib/interview";
import { CONSULTANT_NAME } from "@/lib/config";
import StartForm from "@/components/StartForm";

export const dynamic = "force-dynamic";

const BIG = { fontSize: "clamp(28px, 4.5vw, 40px)" };

export default async function Start({ params }: { params: { token: string } }) {
  const open = await openInterview(params.token);

  if (open.status !== "open") {
    return (
      <main className="wrap stack-lg">
        <header className="stack">
          {open.job && <div className="eyebrow">Interview · {open.org_name}</div>}
          <h1 style={BIG}>This interview has closed.</h1>
          <p className="muted" style={{ maxWidth: "56ch" }}>If you think that is a mistake, ask the person who sent you the link.</p>
        </header>
      </main>
    );
  }

  const job = open.job!;
  const resume = await resumeInfo(params.token);

  return (
    <main className="wrap stack-lg">
      <header className="stack">
        <div className="eyebrow">Interview · {job.executor_name}, {job.executor_role}</div>
        <h1 style={BIG}>{job.title}.</h1>
        {job.description && <p className="muted" style={{ maxWidth: "60ch" }}>{job.description}</p>}
      </header>

      <section className="section">
        <h2>The eight steps</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          {open.steps?.map((s) => (
            <li key={s.position}>
              <span style={{ fontWeight: 600 }}>{s.title}</span>
              <span className="muted small"> · {s.stage}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="section stack">
        <h2>Who sees your answers</h2>
        <p style={{ maxWidth: "60ch" }}>
          Your answers go to {CONSULTANT_NAME}, who is helping {open.org_name} understand how this job works today. {open.org_name} will see how many people have finished, not what anyone said.
        </p>
        <p className="hint">Finish in the same browser you start in. You can close the tab and come back, but if you clear your browsing data you will have to start over.</p>
      </section>

      <section className="section">
        {resume ? (
          resume.completed ? (
            <div className="stack">
              <h2>You've already finished</h2>
              <p className="muted">Thanks. Your answers are saved. You can still go back and change anything.</p>
              <div><Link className="btn ghost" href={`/i/${params.token}/1`}>Review my answers</Link></div>
            </div>
          ) : (
            <div className="stack">
              <h2>Welcome back</h2>
              <div><Link className="btn" href={`/i/${params.token}/${resume.next_position}`}>Continue where you left off</Link></div>
            </div>
          )
        ) : (
          <>
            <h2>Before you start</h2>
            <StartForm token={params.token} />
          </>
        )}
      </section>
    </main>
  );
}

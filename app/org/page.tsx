import { requireMembership, siteUrl } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import type { InterviewLink, Job, JobProgress, Organization } from "@/lib/supabase";
import CopyButton from "@/components/CopyButton";

export default async function OrgHome() {
  const { organizationId } = await requireMembership();
  const db = supabaseServer();
  const [{ data: org }, { data: jobs }, { data: links }, { data: progress }] = await Promise.all([
    db.from("organizations").select("*").eq("id", organizationId).maybeSingle<Organization>(),
    db.from("jobs").select("id, title, executor_name, executor_role").eq("organization_id", organizationId).order("title"),
    db.from("interview_links").select("*").eq("organization_id", organizationId).is("revoked_at", null),
    db.from("job_progress").select("*").eq("organization_id", organizationId),
  ]);
  const L = new Map(((links ?? []) as InterviewLink[]).map((l) => [l.job_id, l]));
  const P = new Map(((progress ?? []) as JobProgress[]).map((p) => [p.job_id, p]));
  const base = siteUrl();
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="wrap stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow">{org?.name}</div>
        <h1>Interviews</h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>Copy a link and send it to the people who do this job. They don't need an account. You'll see how many have started and finished, not what anyone said.</p>
      </header>

      {((jobs ?? []) as Pick<Job, "id" | "title" | "executor_name" | "executor_role">[]).map((j) => {
        const link = L.get(j.id);
        const p = P.get(j.id);
        const open = link && new Date(link.closes_at) > new Date();
        return (
          <section key={j.id} className="card stack">
            <h2>{j.title}.</h2>
            <p className="muted small">{j.executor_name}, {j.executor_role}</p>
            {link && open ? (
              <>
                <div className="linkbox row between">
                  <span className="mono">{base}/i/{link.token}</span>
                  <CopyButton text={`${base}/i/${link.token}`} />
                </div>
                <p className="small">Closes on {fmt(link.closes_at)}.</p>
              </>
            ) : (
              <p className="muted small">{link ? "This interview has closed." : "No link yet."}</p>
            )}
            <p><b>{p?.started ?? 0}</b> started, <b>{p?.finished ?? 0}</b> finished</p>
          </section>
        );
      })}
      {(jobs ?? []).length === 0 && <p className="muted">No interviews set up yet.</p>}
    </main>
  );
}

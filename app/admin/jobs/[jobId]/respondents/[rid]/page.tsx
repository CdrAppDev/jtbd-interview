import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/auth";
import type { DataItem, Job, Respondent, Statement, Step } from "@/lib/supabase";

export default async function RespondentPage({ params }: { params: { jobId: string; rid: string } }) {
  const user = await requireAdmin();
  const db = supabaseServer();
  const { data: r } = await db.from("respondents").select("*").eq("id", params.rid).eq("job_id", params.jobId).maybeSingle<Respondent>();
  if (!r) notFound();
  // Reading one person's answers is audited.
  await db.from("answer_views").insert({ organization_id: r.organization_id, respondent_id: r.id, viewer_user_id: user.id });

  const [{ data: job }, { data: steps }, { data: items }, { data: responses }, { data: ratings }] = await Promise.all([
    db.from("jobs").select("*").eq("id", r.job_id).single<Job>(),
    db.from("steps").select("*").eq("job_id", r.job_id).order("position"),
    db.from("data_items").select("*").eq("job_id", r.job_id),
    db.from("step_responses").select("step_id, data_item_ids, other_data, free_text").eq("respondent_id", r.id),
    db.from("ratings").select("statement_id, importance, satisfaction").eq("respondent_id", r.id),
  ]);
  const S = (steps ?? []) as Step[];
  const { data: stmts } = await db.from("statements").select("*").in("step_id", S.map((s) => s.id)).order("position");
  const itemName = new Map(((items ?? []) as DataItem[]).map((i) => [i.id, i.name]));
  const resp = new Map(((responses ?? []) as { step_id: string; data_item_ids: string[]; other_data: string | null; free_text: string | null }[]).map((x) => [x.step_id, x]));
  const rate = new Map(((ratings ?? []) as { statement_id: string; importance: number; satisfaction: number }[]).map((x) => [x.statement_id, x]));
  const ST = (stmts ?? []) as Statement[];

  return (
    <main className="wrap stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href={`/admin/jobs/${params.jobId}`}>{job?.title}</Link> · respondents</div>
        <h1>{r.role ?? "(role not given)"}{r.name ? `, ${r.name}` : ""}</h1>
        <p className="muted small">Started {new Date(r.created_at).toLocaleString()}{r.completed_at ? `, finished ${new Date(r.completed_at).toLocaleString()}` : ", in progress"}.</p>
      </header>

      {S.map((s) => {
        const x = resp.get(s.id);
        const these = ST.filter((st) => st.step_id === s.id);
        return (
          <section key={s.id} className="card stack">
            <div className="eyebrow">Step {s.position} · {s.stage}</div>
            <h2>{s.title}</h2>
            {!x ? <p className="muted">Not answered.</p> : (
              <>
                <div><span className="small" style={{ fontWeight: 600 }}>Uses: </span>{x.data_item_ids.map((id) => itemName.get(id) ?? "?").join(", ") || "nothing ticked"}{x.other_data ? `; also ${x.other_data}` : ""}</div>
                <div className="tablewrap">
                  <table>
                    <thead><tr><th>Statement</th><th style={{ textAlign: "right" }}>Matters</th><th style={{ textAlign: "right" }}>Works today</th></tr></thead>
                    <tbody>
                      {these.map((st) => (
                        <tr key={st.id}><td>{st.text}</td><td className="num">{rate.get(st.id)?.importance ?? "–"}</td><td className="num">{rate.get(st.id)?.satisfaction ?? "–"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {x.free_text && <p>{x.free_text}</p>}
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}

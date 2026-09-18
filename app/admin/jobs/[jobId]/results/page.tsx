import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Job, Step, DataItem, Statement } from "@/lib/supabase";
import { scoreStatements, bucketItems, TIER_LABEL, TIER_VAR, TIER_SOFT, BUCKET, BUCKET_VAR, f1, type RatingRow, type StepResponseRow } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export default async function Results({ params }: { params: { jobId: string } }) {
  const db = supabaseServer();
  const { data: job } = await db.from("jobs").select("*").eq("id", params.jobId).maybeSingle<Job>();
  if (!job) notFound();

  const [{ data: steps }, { data: items }, { data: respondents }] = await Promise.all([
    db.from("steps").select("*").eq("job_id", job.id).order("position"),
    db.from("data_items").select("*").eq("job_id", job.id),
    db.from("respondents").select("id, name, role, completed_at").eq("job_id", job.id),
  ]);
  const S = (steps ?? []) as Step[];
  const stepById = new Map(S.map((s) => [s.id, s]));
  const I = (items ?? []) as DataItem[];
  const itemById = new Map(I.map((i) => [i.id, i]));
  const people = (respondents ?? []) as { id: string; name: string | null; role: string | null; completed_at: string | null }[];
  const rids = people.map((p) => p.id);
  const [{ data: stmts }, { data: ratings }, { data: stepResponses }] = await Promise.all([
    db.from("statements").select("*").in("step_id", S.map((s) => s.id)).order("position"),
    rids.length ? db.from("ratings").select("respondent_id, statement_id, importance, satisfaction").in("respondent_id", rids) : Promise.resolve({ data: [] as RatingRow[] }),
    rids.length ? db.from("step_responses").select("respondent_id, step_id, data_item_ids, other_data, free_text").in("respondent_id", rids) : Promise.resolve({ data: [] as StepResponseRow[] }),
  ]);
  const R = (ratings ?? []) as RatingRow[];
  const SR = (stepResponses ?? []) as StepResponseRow[];
  const started = people.length;
  const completed = people.filter((p) => p.completed_at).length;

  const rated = scoreStatements((stmts ?? []) as Statement[], S, R);
  const ranked = [...rated].filter((r) => r.n > 0).sort((a, b) => b.opp - a.opp);
  const rows = bucketItems(I, rated, SR, S);

  // Free text by step
  const comments = SR.filter((sr) => sr.free_text || sr.other_data)
    .map((sr) => ({ step: stepById.get(sr.step_id), who: people.find((p) => p.id === sr.respondent_id), text: sr.free_text, other: sr.other_data }))
    .filter((c) => c.step)
    .sort((a, b) => a.step!.position - b.step!.position);

  // Scatter geometry
  const W = 560, H = 440, PL = 44, PR = 16, PT = 16, PB = 40;
  const px = (imp: number) => PL + (imp / 10) * (W - PL - PR);
  const py = (sat: number) => PT + (1 - sat / 10) * (H - PT - PB);

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 8 }}>
        <div className="eyebrow"><Link href={`/admin/jobs/${job.id}`}>Back to the job</Link> · Results · {job.executor_name}, {job.executor_role}</div>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 38px)", maxWidth: "28ch" }}>{job.title}.</h1>
        <p className="muted">
          {completed} of {started} interviews complete{started ? "" : " (none yet)"}. Scores are on the framework's 0 to 20 scale: importance + (importance − how well it works), each out of 10.
        </p>
        <div className="legend">
          {TIER_LABEL.map((l, i) => <span key={l}><i style={{ background: TIER_VAR[i] }} />{[ "under 10", "10 to 12", "12 to 15", "15 and up" ][i]}: {l.toLowerCase()}</span>)}
        </div>
      </header>

      {ranked.length === 0 ? (
        <section className="card"><p className="muted">No ratings yet. Results fill in as people finish steps.</p></section>
      ) : (
        <>
          <section className="grid-2">
            <div className="card">
              <div>
                <div className="eyebrow">Opportunity landscape</div>
                <h2 style={{ fontSize: 22, marginTop: 4 }}>Important, but works badly: lower right.</h2>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Importance versus how well it works today, one dot per statement" style={{ maxWidth: "100%", display: "block" }}>
                {/* zones */}
                <polygon points={`${px(0)},${py(0)} ${px(10)},${py(10)} ${px(10)},${py(0)}`} fill="var(--heat-2)" opacity="0.08" />
                <polygon points={`${px(0)},${py(0)} ${px(10)},${py(10)} ${px(0)},${py(10)}`} fill="var(--heat-0)" opacity="0.10" />
                {[0, 2, 4, 6, 8, 10].map((v) => (
                  <g key={v}>
                    <line x1={px(v)} y1={py(0)} x2={px(v)} y2={py(10)} stroke="var(--rule)" strokeWidth="1" />
                    <line x1={px(0)} y1={py(v)} x2={px(10)} y2={py(v)} stroke="var(--rule)" strokeWidth="1" />
                    <text x={px(v)} y={H - PB + 18} fontSize="11" textAnchor="middle" fill="var(--ink-3)">{v}</text>
                    <text x={PL - 8} y={py(v) + 4} fontSize="11" textAnchor="end" fill="var(--ink-3)">{v}</text>
                  </g>
                ))}
                <line x1={px(0)} y1={py(0)} x2={px(10)} y2={py(10)} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="4 4" />
                <text x={px(10) - 6} y={py(0) - 8} fontSize="11" textAnchor="end" fill="var(--ink-2)">Underserved</text>
                <text x={px(0) + 6} y={py(10) + 14} fontSize="11" fill="var(--ink-2)">Overserved</text>
                <text x={(px(0) + px(10)) / 2} y={H - 4} fontSize="12" textAnchor="middle" fill="var(--ink-2)">Importance</text>
                <text x={12} y={(py(0) + py(10)) / 2} fontSize="12" textAnchor="middle" fill="var(--ink-2)" transform={`rotate(-90 12 ${(py(0) + py(10)) / 2})`}>Works today</text>
                {rated.filter((r) => r.n > 0).map((r) => (
                  <g key={r.id}>
                    <circle cx={px(r.imp)} cy={py(r.sat)} r="7" fill={TIER_VAR[r.tier]} stroke="var(--paper-2)" strokeWidth="2">
                      <title>{`${r.stepPos}.${r.position} ${r.text}\nImportance ${f1(r.imp)} · Works today ${f1(r.sat)} · Score ${f1(r.opp)}`}</title>
                    </circle>
                    <text x={px(r.imp) + 10} y={py(r.sat) + 4} fontSize="10" fill="var(--ink-2)">{r.stepPos}.{r.position}</text>
                  </g>
                ))}
              </svg>
              <p className="small muted">Dots are labelled step.statement. Hover for the full text. The dashed line is where importance and performance match; below it, the job is underserved.</p>
            </div>

            <div className="card">
              <div>
                <div className="eyebrow">Ranked by friction</div>
                <h2 style={{ fontSize: 22, marginTop: 4 }}>What to fix, in order.</h2>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {ranked.slice(0, 12).map((r) => (
                  <div className="bar" key={r.id} title={r.text}>
                    <span className="n">{r.stepPos}.{r.position}</span>
                    <div className="track"><i style={{ width: `${(r.opp / 20) * 100}%`, background: TIER_VAR[r.tier] }} /><span>{r.text}</span></div>
                    <span className="v">{f1(r.opp)}</span>
                  </div>
                ))}
              </div>
              {ranked.length > 12 && <p className="small muted">Top 12 of {ranked.length}. The full list is in the table below.</p>}
            </div>
          </section>

          <section className="card">
            <div>
              <div className="eyebrow">Migration scope</div>
              <h2 style={{ fontSize: 22, marginTop: 4 }}>The data this job actually depends on.</h2>
              <p className="small muted" style={{ marginTop: 6, maxWidth: "70ch" }}>
                Each item shows how many people checked it and the worst friction score of any statement that depends on it. Move carefully: a statement scoring 12 or more points at it. Move: someone uses it. Leave behind: nobody checked it and nothing important depends on it.
              </p>
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Data</th><th>Bucket</th><th style={{ textAlign: "right" }}>People</th><th style={{ textAlign: "right" }}>Checks</th><th>Steps</th><th style={{ textAlign: "right" }}>Worst score</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.item.id}>
                      <td>{r.item.name}</td>
                      <td><span className="pill" style={{ background: BUCKET_VAR[r.bucket], color: r.bucket === 0 ? "var(--ink)" : "#fff" }}>{BUCKET[r.bucket]}</span></td>
                      <td className="num">{r.people}</td>
                      <td className="num">{r.checks}</td>
                      <td className="muted small">{Array.from(r.steps).sort((a, b) => a - b).join(", ") || "—"}</td>
                      <td className="num">{r.maxOpp ? f1(r.maxOpp) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div>
              <div className="eyebrow">Every statement</div>
              <h2 style={{ fontSize: 22, marginTop: 4 }}>All scores by step.</h2>
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>#</th><th>Statement</th><th>Depends on</th><th style={{ textAlign: "right" }}>Importance</th><th style={{ textAlign: "right" }}>Works today</th><th style={{ textAlign: "right" }}>Score</th><th style={{ textAlign: "right" }}>n</th></tr></thead>
                <tbody>
                  {rated.map((r) => (
                    <tr key={r.id} style={{ background: r.n ? TIER_SOFT[r.tier] : undefined }}>
                      <td className="num">{r.stepPos}.{r.position}</td>
                      <td>{r.text}</td>
                      <td className="muted small">{r.data_item_id ? itemById.get(r.data_item_id)?.name : "—"}</td>
                      <td className="num">{r.n ? f1(r.imp) : "—"}</td>
                      <td className="num">{r.n ? f1(r.sat) : "—"}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{r.n ? f1(r.opp) : "—"}</td>
                      <td className="num">{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="card">
        <div>
          <div className="eyebrow">In their words</div>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>What goes wrong, and what we missed.</h2>
        </div>
        {comments.length === 0 ? <p className="muted">No comments yet.</p> : (
          <div className="stack">
            {comments.map((c, i) => (
              <div key={i} style={{ display: "grid", gap: 4, paddingBottom: 12, borderBottom: "1px solid var(--rule)" }}>
                <div className="small muted">Step {c.step!.position} · {c.step!.title} · {c.who?.role ?? "Anonymous"}{c.who?.name ? `, ${c.who.name}` : ""}</div>
                {c.other && <div><span className="small" style={{ fontWeight: 600 }}>Also uses: </span>{c.other}</div>}
                {c.text && <div>{c.text}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="eyebrow">Who's been through it</div>
        <p className="muted small" style={{ marginTop: 6 }}>
          {people.length === 0 ? "Nobody yet." : people.map((p) => `${p.role ?? "(no role)"}${p.name ? ` (${p.name})` : ""}${p.completed_at ? "" : " · in progress"}`).join(" · ")}
        </p>
      </section>
    </main>
  );
}

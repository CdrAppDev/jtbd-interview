import { notFound } from "next/navigation";
import { supabase, JOB_SLUG, type Job, type Step, type DataItem, type Statement } from "@/lib/supabase";
import StepForm from "@/components/StepForm";

export const dynamic = "force-dynamic";

export default async function StepPage({ params }: { params: { rid: string; step: string } }) {
  const pos = parseInt(params.step, 10);
  if (!Number.isFinite(pos) || pos < 1) notFound();

  const db = supabase();
  const { data: job } = await db.from("jobs").select("*").eq("slug", JOB_SLUG).single<Job>();
  if (!job) notFound();
  const { data: respondent } = await db.from("respondents").select("id, name").eq("id", params.rid).single();
  if (!respondent) notFound();

  const { data: steps } = await db.from("steps").select("*").eq("job_id", job.id).order("position");
  const all = (steps ?? []) as Step[];
  const step = all.find((s) => s.position === pos);
  if (!step) notFound();

  const { data: sdi } = await db
    .from("step_data_items")
    .select("position, data_items(id, key, name)")
    .eq("step_id", step.id)
    .order("position");
  const items: DataItem[] = ((sdi ?? []) as unknown as { data_items: DataItem }[]).map((r) => r.data_items);

  const { data: stmts } = await db.from("statements").select("*").eq("step_id", step.id).order("position");

  const { data: existing } = await db
    .from("step_responses")
    .select("data_item_ids, other_data, free_text")
    .eq("respondent_id", respondent.id)
    .eq("step_id", step.id)
    .maybeSingle();
  const { data: existingRatings } = await db
    .from("ratings")
    .select("statement_id, importance, satisfaction")
    .eq("respondent_id", respondent.id)
    .in("statement_id", ((stmts ?? []) as Statement[]).map((s) => s.id));

  return (
    <main className="wrap stack-lg">
      <div className="stack" style={{ gap: 10 }}>
        <div className="progress" aria-label={`Step ${pos} of ${all.length}`}>
          {all.map((s) => (
            <i key={s.id} className={s.position < pos ? "done" : s.position === pos ? "now" : ""} />
          ))}
        </div>
        <div className="eyebrow">Step {pos} of {all.length} · {step.stage}</div>
      </div>

      <header className="stephead">
        <h1>{step.title}</h1>
        <p className="lead">{step.description}</p>
      </header>

      <StepForm
        respondentId={respondent.id}
        step={step}
        items={items}
        statements={(stmts ?? []) as Statement[]}
        total={all.length}
        existing={existing ?? null}
        existingRatings={(existingRatings ?? []) as { statement_id: string; importance: number; satisfaction: number }[]}
      />
    </main>
  );
}

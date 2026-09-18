import { notFound } from "next/navigation";
import { loadStep } from "@/lib/interview";
import StepForm from "@/components/StepForm";

export const dynamic = "force-dynamic";

export default async function StepPage({ params }: { params: { token: string; step: string } }) {
  const pos = parseInt(params.step, 10);
  if (!Number.isFinite(pos) || pos < 1) notFound();

  const data = await loadStep(params.token, pos);
  const { step, total } = data;

  return (
    <main className="wrap stack-lg">
      <div className="stack" style={{ gap: 10 }}>
        <div className="progress" aria-label={`Step ${pos} of ${total}`}>
          {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
            <i key={p} className={p < pos ? "done" : p === pos ? "now" : ""} />
          ))}
        </div>
        <div className="eyebrow">Step {pos} of {total} · {step.stage}</div>
      </div>

      <header className="stephead">
        <h1>{step.title}</h1>
        <p className="lead">{step.description}</p>
      </header>

      <StepForm
        token={params.token}
        step={step}
        items={data.items}
        statements={data.statements}
        total={total}
        existing={data.response}
        existingRatings={data.ratings}
      />
    </main>
  );
}

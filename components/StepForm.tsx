"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type Step, type DataItem, type Statement } from "@/lib/supabase";
import { saveStep } from "@/lib/interview";

type Rating = { importance?: number; satisfaction?: number };

export default function StepForm({
  token, step, items, statements, total, existing, existingRatings,
}: {
  token: string;
  step: Step;
  items: DataItem[];
  statements: Statement[];
  total: number;
  existing: { data_item_ids: string[]; other_data: string | null; free_text: string | null } | null;
  existingRatings: { statement_id: string; importance: number; satisfaction: number }[];
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set(existing?.data_item_ids ?? []));
  const [other, setOther] = useState(existing?.other_data ?? "");
  const [free, setFree] = useState(existing?.free_text ?? "");
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => {
    const r: Record<string, Rating> = {};
    for (const x of existingRatings) r[x.statement_id] = { importance: x.importance, satisfaction: x.satisfaction };
    return r;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isLast = step.position === total;

  function toggle(id: string) {
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function rate(id: string, k: keyof Rating, v: number) {
    setRatings((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing = statements.filter((s) => !ratings[s.id]?.importance || !ratings[s.id]?.satisfaction);
    if (missing.length) {
      setErr(`Rate both questions on every statement (${missing.length} left).`);
      document.getElementById(`stmt-${missing[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true); setErr(null);
    const res = await saveStep(token, {
      stepId: step.id,
      itemIds: Array.from(checked),
      other: other.trim(),
      free: free.trim(),
      ratings: statements.map((s) => ({ statement_id: s.id, importance: ratings[s.id].importance!, satisfaction: ratings[s.id].satisfaction! })),
      nextPosition: isLast ? null : step.position + 1,
    });
    if (res?.error) { setErr(res.error); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="stack-lg">
      <section className="section">
        <h2>What do you use at this step?</h2>
        <p className="hint">Check everything you look at, open, or ask someone for.</p>
        <div className="checks">
          {items.map((it) => (
            <label key={it.id} className="check">
              <input type="checkbox" id={`di-${it.id}`} checked={checked.has(it.id)} onChange={() => toggle(it.id)} />
              <span>{it.name}</span>
            </label>
          ))}
        </div>
        <div className="field">
          <label htmlFor="other">Anything else you use here?</label>
          <input id="other" type="text" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Name it, even if it's a spreadsheet or someone's memory" />
        </div>
      </section>

      <section className="section">
        <h2>Rate each statement</h2>
        <p className="hint">Two ratings per statement: how important it is to you, and how well it works today. 1 is low, 5 is high.</p>
        <div className="stack">
          {statements.map((s, i) => (
            <div key={s.id} id={`stmt-${s.id}`} className="stmt">
              <div className="text"><b>{i + 1}</b>{s.text}</div>
              <div className="scale">
                <span className="q">How important is this to you?</span>
                <Seg name={`imp-${s.id}`} cls="imp" value={ratings[s.id]?.importance} onChange={(v) => rate(s.id, "importance", v)} lo="Not at all" hi="Critical" />
                <span className="q">How well does it work today?</span>
                <Seg name={`sat-${s.id}`} cls="" value={ratings[s.id]?.satisfaction} onChange={(v) => rate(s.id, "satisfaction", v)} lo="Badly" hi="Very well" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>What goes wrong at this step?</h2>
        <p className="hint">What do you have to dig for, or ask someone for? What did we miss?</p>
        <textarea id="free" value={free} onChange={(e) => setFree(e.target.value)} />
      </section>

      <div className="nav">
        {step.position > 1 ? (
          <button type="button" className="btn ghost" onClick={() => router.push(`/i/${token}/${step.position - 1}`)}>Back</button>
        ) : <span />}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {err && <span className="err">{err}</span>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : isLast ? "Finish" : "Next step"}</button>
        </div>
      </div>
    </form>
  );
}

function Seg({ name, cls, value, onChange, lo, hi }: { name: string; cls: string; value?: number; onChange: (v: number) => void; lo: string; hi: string }) {
  return (
    <div>
      <div className={`seg ${cls}`} role="radiogroup">
        {[1, 2, 3, 4, 5].map((v) => (
          <label key={v}>
            <input type="radio" id={`${name}-${v}`} name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            {v}
          </label>
        ))}
      </div>
      <div className="ends"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

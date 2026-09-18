import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { DataItem, Job, Statement, Step } from "@/lib/supabase";
import { updateJob, saveStepContent, saveDataItem, deleteDataItem, setStepItems, saveStatement, deleteStatement } from "@/app/admin/actions";

// One collapsible block per step: its title and description, which data
// items are offered there, and its statements. Data items live in their own
// block at the top. Open one step at a time.

export default async function JobContent({ params, searchParams }: { params: { jobId: string }; searchParams: { error?: string; open?: string } }) {
  const db = supabaseServer();
  const { data: jobRow } = await db.from("jobs").select("*, organizations(name)").eq("id", params.jobId).maybeSingle();
  if (!jobRow) notFound();
  const job = jobRow as Job & { organizations: { name: string } | null };

  const [{ data: steps }, { data: items }] = await Promise.all([
    db.from("steps").select("*").eq("job_id", job.id).order("position"),
    db.from("data_items").select("*").eq("job_id", job.id).order("name"),
  ]);
  const S = (steps ?? []) as Step[];
  const I = (items ?? []) as DataItem[];
  const stepIds = S.map((s) => s.id);
  const [{ data: sdi }, { data: stmts }] = await Promise.all([
    db.from("step_data_items").select("step_id, data_item_id, position").in("step_id", stepIds),
    db.from("statements").select("*").in("step_id", stepIds).order("position"),
  ]);
  const SDI = (sdi ?? []) as { step_id: string; data_item_id: string; position: number }[];
  const ST = (stmts ?? []) as Statement[];
  const hid = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const itemSelect = (name: string, value: string) => (
    <select name={name} defaultValue={value} aria-label="Depends on">
      <option value="">No data item</option>
      {I.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
    </select>
  );

  return (
    <main className="wrap stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${job.organization_id}`}>{job.organizations?.name}</Link> · <Link href={`/admin/jobs/${job.id}`}>Job</Link></div>
        <h1>Edit the job content</h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>Open a step to change what workers read there, which data items they can tick, and the statements they rate. Changes apply to new answers only.</p>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <details className="card" open={searchParams.open === "job"}>
        <summary><span className="eyebrow">The job</span><span>{job.title}</span></summary>
        <form action={updateJob} className="stack" style={{ marginTop: 12 }}>
          {hid("id", job.id)}
          <div className="field"><label htmlFor="title">Job statement</label><input id="title" name="title" defaultValue={job.title} required /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="executor_name">Executor name</label><input id="executor_name" name="executor_name" defaultValue={job.executor_name} /></div>
            <div className="field"><label htmlFor="executor_role">Executor role</label><input id="executor_role" name="executor_role" defaultValue={job.executor_role} /></div>
          </div>
          <div className="field"><label htmlFor="description">Description shown on the first screen</label><textarea id="description" name="description" defaultValue={job.description ?? ""} /></div>
          <div><button className="btn" type="submit">Save</button></div>
        </form>
      </details>

      <details className="card" open={searchParams.open === "data"}>
        <summary><span className="eyebrow">Data items</span><span>{I.length} items the job uses</span></summary>
        <div className="stack" style={{ marginTop: 12 }}>
          <p className="muted small">Add the data first, then open each step to choose which items are offered there.</p>
          <div className="list">
            {I.map((it) => (
              <div key={it.id} className="row">
                <form action={saveDataItem} className="row" style={{ flex: 1 }}>
                  {hid("id", it.id)}{hid("job_id", job.id)}
                  <input name="name" defaultValue={it.name} required style={{ flex: 1, minWidth: 200 }} />
                  <button className="btn ghost small" type="submit">Save</button>
                </form>
                <form action={deleteDataItem}>
                  {hid("id", it.id)}{hid("job_id", job.id)}
                  <button className="btn ghost small" type="submit">Delete</button>
                </form>
              </div>
            ))}
          </div>
          <form action={saveDataItem} className="row">
            {hid("job_id", job.id)}
            <input name="name" placeholder="New data item" required style={{ flex: 1, minWidth: 200 }} />
            <button className="btn small" type="submit">Add</button>
          </form>
        </div>
      </details>

      {S.map((s) => {
        const on = new Set(SDI.filter((x) => x.step_id === s.id).map((x) => x.data_item_id));
        const these = ST.filter((st) => st.step_id === s.id);
        return (
          <details key={s.id} className="card" open={searchParams.open === String(s.position)}>
            <summary><span className="eyebrow">Step {s.position} · {s.stage}</span><span>{s.title}</span><span className="muted small">{on.size} items offered, {these.length} statements</span></summary>
            <div className="stack-lg" style={{ marginTop: 12 }}>
              <form action={saveStepContent} className="stack" style={{ gap: 8 }}>
                {hid("id", s.id)}{hid("job_id", job.id)}
                <h3>What workers read</h3>
                <div className="field"><label htmlFor={`st-${s.id}`}>Step title</label><input id={`st-${s.id}`} name="title" defaultValue={s.title} required /></div>
                <div className="field"><label htmlFor={`sd-${s.id}`}>Description</label><textarea id={`sd-${s.id}`} name="description" defaultValue={s.description} /></div>
                <div><button className="btn ghost small" type="submit">Save</button></div>
              </form>

              <form action={setStepItems} className="stack" style={{ gap: 8 }}>
                {hid("step_id", s.id)}{hid("job_id", job.id)}
                <h3>Data items offered at this step</h3>
                <div className="checks">
                  {I.map((it) => (
                    <label key={it.id} className="check"><input type="checkbox" name="item" value={it.id} defaultChecked={on.has(it.id)} /><span>{it.name}</span></label>
                  ))}
                </div>
                <div><button className="btn ghost small" type="submit">Save</button></div>
              </form>

              <div className="stack" style={{ gap: 8 }}>
                <h3>Statements workers rate</h3>
                <div className="list">
                  {these.map((st) => (
                    <div key={st.id} className="row">
                      <form action={saveStatement} className="row" style={{ flex: 1 }}>
                        {hid("id", st.id)}{hid("job_id", job.id)}{hid("step_id", s.id)}
                        <input name="position" type="number" min={1} defaultValue={st.position} style={{ width: 64 }} aria-label="Position" />
                        <input name="text" defaultValue={st.text} required style={{ flex: 1, minWidth: 240 }} aria-label="Statement" />
                        {itemSelect("data_item_id", st.data_item_id ?? "")}
                        <button className="btn ghost small" type="submit">Save</button>
                      </form>
                      <form action={deleteStatement}>
                        {hid("id", st.id)}{hid("job_id", job.id)}
                        <button className="btn ghost small" type="submit">Delete</button>
                      </form>
                    </div>
                  ))}
                  <form action={saveStatement} className="row">
                    {hid("job_id", job.id)}{hid("step_id", s.id)}
                    <input name="position" type="number" min={1} defaultValue={these.length + 1} style={{ width: 64 }} aria-label="Position" />
                    <input name="text" placeholder="New statement for this step" required style={{ flex: 1, minWidth: 240 }} aria-label="Statement" />
                    {itemSelect("data_item_id", "")}
                    <button className="btn small" type="submit">Add</button>
                  </form>
                </div>
              </div>
            </div>
          </details>
        );
      })}
    </main>
  );
}

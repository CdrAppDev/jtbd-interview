import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { siteUrl } from "@/lib/auth";
import type { DataItem, InterviewLink, Job, JobProgress, Respondent, Statement, Step } from "@/lib/supabase";
import CopyButton from "@/components/CopyButton";
import { updateJob, saveStepContent, saveDataItem, deleteDataItem, setStepItems, saveStatement, deleteStatement, createLink, updateLink, revokeLink } from "@/app/admin/actions";

export default async function JobPage({ params, searchParams }: { params: { jobId: string }; searchParams: { error?: string } }) {
  const db = supabaseServer();
  const { data: jobRow } = await db.from("jobs").select("*, organizations(name)").eq("id", params.jobId).maybeSingle();
  if (!jobRow) notFound();
  const job = jobRow as Job & { organizations: { name: string } | null };

  const [{ data: steps }, { data: items }, { data: link }, { data: respondents }, { data: progress }] = await Promise.all([
    db.from("steps").select("*").eq("job_id", job.id).order("position"),
    db.from("data_items").select("*").eq("job_id", job.id).order("name"),
    db.from("interview_links").select("*").eq("job_id", job.id).is("revoked_at", null).maybeSingle<InterviewLink>(),
    db.from("respondents").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
    db.from("job_progress").select("*").eq("job_id", job.id).maybeSingle<JobProgress>(),
  ]);
  const S = (steps ?? []) as Step[];
  const I = (items ?? []) as DataItem[];
  const R = (respondents ?? []) as Respondent[];
  const stepIds = S.map((s) => s.id);
  const [{ data: sdi }, { data: stmts }, { data: saved }] = await Promise.all([
    db.from("step_data_items").select("step_id, data_item_id, position").in("step_id", stepIds),
    db.from("statements").select("*").in("step_id", stepIds).order("position"),
    R.length ? db.from("step_responses").select("respondent_id, step_id").in("respondent_id", R.map((r) => r.id)) : Promise.resolve({ data: [] as { respondent_id: string; step_id: string }[] }),
  ]);
  const SDI = (sdi ?? []) as { step_id: string; data_item_id: string; position: number }[];
  const ST = (stmts ?? []) as Statement[];
  const savedBy = new Map<string, number>();
  for (const row of (saved ?? []) as { respondent_id: string; step_id: string }[]) savedBy.set(row.respondent_id, (savedBy.get(row.respondent_id) ?? 0) + 1);
  const linkUrl = link ? `${siteUrl()}/i/${link.token}` : null;
  const today = new Date().toISOString().slice(0, 10);
  const dateOf = (iso: string) => iso.slice(0, 10);
  const hid = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${job.organization_id}`}>{job.organizations?.name}</Link></div>
        <h1>{job.title}.</h1>
        <div className="row">
          <span className="muted small">{progress?.started ?? 0} started, {progress?.finished ?? 0} finished</span>
          <Link className="btn small" href={`/admin/jobs/${job.id}/results`}>Results</Link>
        </div>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <section className="card stack" id="link">
        <h2>Interview link</h2>
        {link && linkUrl ? (
          <>
            <div className="linkbox row between">
              <span className="mono">{linkUrl}</span>
              <CopyButton text={linkUrl} />
            </div>
            <form action={updateLink} className="form-grid">
              {hid("id", link.id)}{hid("job_id", job.id)}
              <div className="field"><label htmlFor="closes_at">Closes on</label><input id="closes_at" name="closes_at" type="date" defaultValue={dateOf(link.closes_at)} min={today} required /></div>
              <div className="field"><label htmlFor="respondent_cap">Respondent cap (optional)</label><input id="respondent_cap" name="respondent_cap" type="number" min={1} defaultValue={link.respondent_cap ?? ""} /></div>
              <div><button className="btn" type="submit">Save</button></div>
            </form>
            <form action={revokeLink} className="row">
              {hid("id", link.id)}{hid("job_id", job.id)}
              <button className="btn ghost small" type="submit">Revoke this link</button>
              <span className="muted small">Nobody new can start. People who already started can finish.</span>
            </form>
          </>
        ) : (
          <form action={createLink} className="form-grid">
            {hid("job_id", job.id)}
            <div className="field"><label htmlFor="closes_at">Closes on</label><input id="closes_at" name="closes_at" type="date" min={today} required /></div>
            <div className="field"><label htmlFor="respondent_cap">Respondent cap (optional)</label><input id="respondent_cap" name="respondent_cap" type="number" min={1} /></div>
            <div><button className="btn" type="submit">Create link</button></div>
          </form>
        )}
      </section>

      <section className="card stack" id="respondents">
        <h2>Respondents</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Role</th><th>Name</th><th style={{ textAlign: "right" }}>Steps saved</th><th>Status</th><th>Started</th><th></th></tr></thead>
            <tbody>
              {R.map((r) => (
                <tr key={r.id}>
                  <td>{r.role ?? "(not given)"}</td>
                  <td className="muted">{r.name ?? ""}</td>
                  <td className="num">{savedBy.get(r.id) ?? 0} of {S.length}</td>
                  <td>{r.completed_at ? "Finished" : "In progress"}</td>
                  <td className="small muted">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="small"><Link href={`/admin/jobs/${job.id}/respondents/${r.id}`}>Open</Link></td>
                </tr>
              ))}
              {R.length === 0 && <tr><td colSpan={6} className="muted">Nobody yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <form action={updateJob} className="card stack" id="job">
        <h2>Job</h2>
        {hid("id", job.id)}
        <div className="field"><label htmlFor="title">Job statement</label><input id="title" name="title" defaultValue={job.title} required /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="executor_name">Executor name</label><input id="executor_name" name="executor_name" defaultValue={job.executor_name} /></div>
          <div className="field"><label htmlFor="executor_role">Executor role</label><input id="executor_role" name="executor_role" defaultValue={job.executor_role} /></div>
        </div>
        <div className="field"><label htmlFor="description">Description shown on the first screen</label><textarea id="description" name="description" defaultValue={job.description ?? ""} /></div>
        <div><button className="btn" type="submit">Save</button></div>
      </form>

      <section className="card stack" id="steps">
        <h2>Steps</h2>
        <div className="list">
          {S.map((s) => (
            <form key={s.id} action={saveStepContent} className="stack" style={{ gap: 8 }}>
              {hid("id", s.id)}{hid("job_id", job.id)}
              <div className="eyebrow">Step {s.position} · {s.stage}</div>
              <div className="field"><label htmlFor={`st-${s.id}`}>Title</label><input id={`st-${s.id}`} name="title" defaultValue={s.title} required /></div>
              <div className="field"><label htmlFor={`sd-${s.id}`}>Description</label><textarea id={`sd-${s.id}`} name="description" defaultValue={s.description} /></div>
              <div><button className="btn ghost small" type="submit">Save step</button></div>
            </form>
          ))}
        </div>
      </section>

      <section className="card stack" id="data">
        <h2>Data items</h2>
        <p className="muted small">The data this job uses. Workers tick these at each step where they are offered.</p>
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
      </section>

      <section className="card stack" id="offered">
        <h2>What's offered at each step</h2>
        <div className="list">
          {S.map((s) => {
            const on = new Set(SDI.filter((x) => x.step_id === s.id).map((x) => x.data_item_id));
            return (
              <form key={s.id} action={setStepItems} className="stack" style={{ gap: 8 }}>
                {hid("step_id", s.id)}{hid("job_id", job.id)}
                <div className="eyebrow">Step {s.position} · {s.title}</div>
                <div className="checks">
                  {I.map((it) => (
                    <label key={it.id} className="check"><input type="checkbox" name="item" value={it.id} defaultChecked={on.has(it.id)} /><span>{it.name}</span></label>
                  ))}
                </div>
                <div><button className="btn ghost small" type="submit">Save step {s.position}</button></div>
              </form>
            );
          })}
        </div>
      </section>

      <section className="card stack" id="statements">
        <h2>Statements</h2>
        <p className="muted small">What workers rate at each step. Each one points at the data item it depends on.</p>
        {S.map((s) => (
          <div key={s.id} className="stack" style={{ gap: 8 }}>
            <div className="eyebrow">Step {s.position} · {s.title}</div>
            <div className="list">
              {ST.filter((st) => st.step_id === s.id).map((st) => (
                <div key={st.id} className="row">
                  <form action={saveStatement} className="row" style={{ flex: 1 }}>
                    {hid("id", st.id)}{hid("job_id", job.id)}{hid("step_id", s.id)}
                    <input name="position" type="number" min={1} defaultValue={st.position} style={{ width: 64 }} aria-label="Position" />
                    <input name="text" defaultValue={st.text} required style={{ flex: 1, minWidth: 260 }} aria-label="Statement" />
                    <select name="data_item_id" defaultValue={st.data_item_id ?? ""} aria-label="Depends on">
                      <option value="">No data item</option>
                      {I.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
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
                <input name="position" type="number" min={1} defaultValue={ST.filter((st) => st.step_id === s.id).length + 1} style={{ width: 64 }} aria-label="Position" />
                <input name="text" placeholder="New statement for this step" required style={{ flex: 1, minWidth: 260 }} aria-label="Statement" />
                <select name="data_item_id" defaultValue="" aria-label="Depends on">
                  <option value="">No data item</option>
                  {I.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
                <button className="btn small" type="submit">Add</button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

import { createOrg } from "@/app/admin/actions";

export default function NewOrg({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="wrap stack-lg">
      <header className="stack">
        <div className="eyebrow">New organization</div>
        <h1>Who are we interviewing?</h1>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}
      <form action={createOrg} className="section stack">
        <div className="field"><label htmlFor="name">Organization name</label><input id="name" name="name" required /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="contact_name">Contact name</label><input id="contact_name" name="contact_name" /></div>
          <div className="field"><label htmlFor="contact_email">Contact email</label><input id="contact_email" name="contact_email" type="email" /></div>
          <div className="field"><label htmlFor="retention_days">Keep data for (days)</label><input id="retention_days" name="retention_days" type="number" min={1} defaultValue={365} /></div>
        </div>
        <p className="hint">The contact email gets a sign-in that shows this organization's jobs, links and completion counts. Nothing else.</p>
        <div><button className="btn" type="submit">Create organization</button></div>
      </form>
    </main>
  );
}

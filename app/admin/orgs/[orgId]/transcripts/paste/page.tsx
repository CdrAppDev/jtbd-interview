import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Organization } from "@/lib/supabase";
import { pasteTranscript } from "@/app/admin/actions-transcripts";

export default async function PastePage({ params, searchParams }: { params: { orgId: string }; searchParams: { error?: string } }) {
  const { data: org } = await supabaseServer().from("organizations").select("*").eq("id", params.orgId).maybeSingle<Organization>();
  if (!org) notFound();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="wrap stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${org.id}`}>{org.name}</Link> · <Link href={`/admin/orgs/${org.id}/transcripts`}>Transcripts</Link></div>
        <h1>Paste a transcript</h1>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <form action={pasteTranscript} className="card stack">
        <input type="hidden" name="organization_id" value={org.id} />
        <div className="form-grid">
          <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" required placeholder="Discovery call with operations" /></div>
          <div className="field"><label htmlFor="held_at">Date</label><input id="held_at" name="held_at" type="date" defaultValue={today} required /></div>
        </div>
        <div className="field">
          <label htmlFor="body">Transcript</label>
          <textarea id="body" name="body" rows={18} required />
          <p className="hint">Start a line with the speaker&apos;s name and a colon to keep who said what.</p>
        </div>
        <div><button className="btn" type="submit">Save transcript</button></div>
      </form>
    </main>
  );
}

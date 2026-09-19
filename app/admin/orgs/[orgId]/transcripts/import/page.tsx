import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Organization, Transcript } from "@/lib/supabase";
import { clock } from "@/lib/transcript-text";
import { FellowNotConfigured, FellowRateLimited, fellowConfigured, listRecordings, type FellowRecording } from "@/lib/fellow";
import { importFromFellow } from "@/app/admin/actions-transcripts";

// Pick meetings out of Fellow. The key on the server is what identifies us to
// Fellow, so this lists exactly what Chris's own Fellow account can see.

const dayBefore = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

export default async function ImportPage({ params, searchParams }: { params: { orgId: string }; searchParams: { error?: string; from?: string; to?: string; title?: string } }) {
  const db = supabaseServer();
  const { data: org } = await db.from("organizations").select("*").eq("id", params.orgId).maybeSingle<Organization>();
  if (!org) notFound();

  const from = searchParams.from || dayBefore(90);
  const to = searchParams.to || dayBefore(0);
  const title = searchParams.title ?? "";

  let recordings: FellowRecording[] = [];
  let problem: string | null = null;
  if (fellowConfigured()) {
    try {
      recordings = await listRecordings({ from, to, title: title || undefined });
    } catch (e) {
      if (e instanceof FellowNotConfigured) problem = "Fellow isn't set up on this server. Add the key and subdomain, then redeploy.";
      else if (e instanceof FellowRateLimited) problem = "Fellow is rate limiting. Wait a minute and try again.";
      else problem = e instanceof Error ? e.message : "Couldn't reach Fellow.";
    }
  } else {
    problem = "Fellow isn't set up on this server. Add the key and subdomain, then redeploy.";
  }

  const { data: already } = await db
    .from("transcripts")
    .select("fellow_recording_id")
    .eq("organization_id", org.id)
    .not("fellow_recording_id", "is", null);
  const have = new Set(((already ?? []) as Pick<Transcript, "fellow_recording_id">[]).map((t) => t.fellow_recording_id));

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${org.id}`}>{org.name}</Link> · <Link href={`/admin/orgs/${org.id}/transcripts`}>Transcripts</Link></div>
        <h1>Recent recordings in Fellow</h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>Tick the conversations that belong to {org.name}. Importing stores the text under this organization.</p>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}
      {problem && <p className="notice">{problem}</p>}

      <form className="card row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field"><label htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} /></div>
        <div className="field"><label htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} /></div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="title">Title contains</label><input id="title" name="title" defaultValue={title} /></div>
        <button className="btn ghost" type="submit">Search</button>
      </form>

      <form action={importFromFellow} className="card stack">
        <input type="hidden" name="organization_id" value={org.id} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <input type="hidden" name="title" value={title} />
        <div className="tablewrap">
          <table>
            <thead><tr><th></th><th>Recording</th><th>Date</th><th>Length</th><th></th></tr></thead>
            <tbody>
              {recordings.map((r) => (
                <tr key={r.id}>
                  <td>{!have.has(r.id) && <input type="checkbox" name="recording" value={r.id} aria-label={`Import ${r.title}`} />}</td>
                  <td>{r.title}</td>
                  <td className="small">{r.held_at ? r.held_at.slice(0, 10) : ""}</td>
                  <td className="small">{clock(r.duration_seconds)}</td>
                  <td className="small muted">{have.has(r.id) ? "Already imported" : ""}</td>
                </tr>
              ))}
              {recordings.length === 0 && !problem && <tr><td colSpan={5} className="muted">No recordings in this range.</td></tr>}
            </tbody>
          </table>
        </div>
        <div><button className="btn" type="submit" disabled={recordings.length === 0}>Import selected</button></div>
      </form>
    </main>
  );
}

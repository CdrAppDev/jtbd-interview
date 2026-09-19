import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import type { Organization, Transcript } from "@/lib/supabase";
import { clock } from "@/lib/transcript-text";
import { fellowConfigured } from "@/lib/fellow";
import { engineConfigured } from "@/lib/engine/client";
import { estimate, stateOf } from "@/lib/engine/run";
import { dollars } from "@/lib/cost";
import type { EngineRun } from "@/lib/supabase";
import RunProgress from "@/components/RunProgress";
import { startFindingJobs } from "@/app/admin/actions-candidates";

// Every conversation stored for one client, and what can be done with them.

export default async function TranscriptsPage({ params, searchParams }: { params: { orgId: string }; searchParams: { error?: string } }) {
  const db = supabaseServer();
  const { data: org } = await db.from("organizations").select("*").eq("id", params.orgId).maybeSingle<Organization>();
  if (!org) notFound();

  const [{ data: rows }, { data: quotes }] = await Promise.all([
    db.from("transcripts").select("*").eq("organization_id", org.id).order("held_at", { ascending: false }),
    db.from("candidate_quotes").select("transcript_id").eq("organization_id", org.id),
  ]);
  const T = (rows ?? []) as Transcript[];
  const cited = new Map<string, number>();
  for (const q of (quotes ?? []) as { transcript_id: string | null }[]) {
    if (q.transcript_id) cited.set(q.transcript_id, (cited.get(q.transcript_id) ?? 0) + 1);
  }
  const hours = T.reduce((n, t) => n + (t.duration_seconds ?? 0), 0) / 3600;

  const { data: runRows } = await db
    .from("engine_runs")
    .select("*")
    .eq("organization_id", org.id)
    .in("kind", ["find_jobs"])
    .order("created_at", { ascending: false })
    .limit(10);
  const runs = (runRows ?? []) as EngineRun[];
  const running = runs.find((r) => r.status === "running");
  const runState = running ? await stateOf(db, running) : null;
  // Counting tokens costs nothing and is the only honest way to quote a price.
  const guess = !running && T.length > 0 && engineConfigured() ? await estimate(db, T.map((t) => t.id)) : null;

  return (
    <main className="wrap wide stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${org.id}`}>{org.name}</Link></div>
        <h1>Transcripts</h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>Client conversations the jobs are found in. Only you can read these. Every time anyone opens one it is recorded, with who and when.</p>
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      <section className="card row between">
        <div className="stack" style={{ gap: 4 }}>
          <h2>Add a conversation</h2>
          <p className="muted small">{T.length} stored{hours >= 0.1 ? `, about ${hours.toFixed(1)} hours` : ""}.</p>
        </div>
        <div className="row">
          {fellowConfigured() && <Link className="btn ghost" href={`/admin/orgs/${org.id}/transcripts/import`}>Import from Fellow</Link>}
          <Link className="btn" href={`/admin/orgs/${org.id}/transcripts/paste`}>Paste a transcript</Link>
        </div>
      </section>
      {!fellowConfigured() && <p className="hint">Fellow isn&apos;t set up on this server. Add the key and subdomain, then redeploy.</p>}

      <section className="card stack">
        <h2>Find the jobs</h2>
        {running && runState ? (
          <RunProgress runId={running.id} initial={runState} />
        ) : !engineConfigured() ? (
          <p className="muted small">The engine isn&apos;t set up on this server. Add the key, then redeploy.</p>
        ) : T.length === 0 ? (
          <p className="muted small">Add a conversation first.</p>
        ) : guess?.overCeiling ? (
          <p className="notice">That is more than this server reads in one run ({guess.ceilingHours.toFixed(0)} hours). Remove some transcripts or raise the limit.</p>
        ) : (
          <form action={startFindingJobs} className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="organization_id" value={org.id} />
            <p className="muted small">
              Reads {T.length} transcript{T.length === 1 ? "" : "s"}, about {(guess?.hours ?? 0).toFixed(1)} hours of conversation.
              Costs about {dollars(guess?.cents ?? 0)}. Takes a few minutes.
            </p>
            <div className="row">
              <button className="btn" type="submit">Find the jobs</button>
              <Link className="btn ghost" href={`/admin/orgs/${org.id}/candidates`}>See the candidates</Link>
            </div>
          </form>
        )}
      </section>

      {runs.length > 0 && (
        <section className="card stack">
          <h2>Past runs</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Started</th><th>What happened</th><th>Read</th><th style={{ textAlign: "right" }}>Cost</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{r.created_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="small">{r.status === "done" ? "Finished" : r.status === "failed" ? `Stopped: ${r.error ?? ""}` : "Running"}</td>
                    <td className="small">{r.transcript_ids.length} transcripts</td>
                    <td className="num">{dollars(r.cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Stored conversations</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Conversation</th><th>Date</th><th>Where from</th><th>Length</th><th style={{ textAlign: "right" }}>Quoted</th></tr></thead>
            <tbody>
              {T.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/admin/orgs/${org.id}/transcripts/${t.id}`}>{t.title}</Link></td>
                  <td className="small">{t.held_at.slice(0, 10)}</td>
                  <td className="small">{t.source === "fellow" ? "Fellow" : "Pasted"}</td>
                  <td className="small">{clock(t.duration_seconds)}</td>
                  <td className="num">{cited.get(t.id) ?? 0}</td>
                </tr>
              ))}
              {T.length === 0 && <tr><td colSpan={5} className="muted">No conversations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

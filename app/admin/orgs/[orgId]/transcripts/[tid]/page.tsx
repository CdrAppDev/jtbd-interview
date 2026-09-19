import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import type { JobCandidate, Organization, Transcript, TranscriptSegment } from "@/lib/supabase";
import { clock, speakersOf } from "@/lib/transcript-text";
import { deleteTranscript } from "@/app/admin/actions-transcripts";

// Reading a client conversation is audited, the same way reading one
// person's interview answers is.

export default async function TranscriptPage({ params, searchParams }: { params: { orgId: string; tid: string }; searchParams: { error?: string } }) {
  const user = await requireAdmin();
  const db = supabaseServer();
  const { data: t } = await db
    .from("transcripts")
    .select("*")
    .eq("id", params.tid)
    .eq("organization_id", params.orgId)
    .maybeSingle<Transcript>();
  if (!t) notFound();
  await db.from("transcript_views").insert({ organization_id: t.organization_id, transcript_id: t.id, viewer_user_id: user.id });

  const [{ data: org }, { data: segs }, { data: quotes }] = await Promise.all([
    db.from("organizations").select("*").eq("id", t.organization_id).maybeSingle<Organization>(),
    db.from("transcript_segments").select("*").eq("transcript_id", t.id).order("position"),
    db.from("candidate_quotes").select("candidate_id").eq("transcript_id", t.id),
  ]);
  const S = (segs ?? []) as TranscriptSegment[];
  const candidateIds = [...new Set(((quotes ?? []) as { candidate_id: string }[]).map((q) => q.candidate_id))];
  const { data: cands } = candidateIds.length
    ? await db.from("job_candidates").select("id, statement, executor_role, status").in("id", candidateIds)
    : { data: [] as JobCandidate[] };
  const C = (cands ?? []) as Pick<JobCandidate, "id" | "statement" | "executor_role" | "status">[];
  const people = t.attendees.length ? t.attendees : speakersOf(S);

  return (
    <main className="wrap stack-lg">
      <header className="stack" style={{ gap: 4 }}>
        <div className="eyebrow"><Link href="/admin">Organizations</Link> · <Link href={`/admin/orgs/${t.organization_id}`}>{org?.name}</Link> · <Link href={`/admin/orgs/${t.organization_id}/transcripts`}>Transcripts</Link></div>
        <h1>{t.title}</h1>
        <p className="muted small">
          {t.held_at.slice(0, 10)} · {t.source === "fellow" ? "From Fellow" : "Pasted"}
          {t.duration_seconds ? ` · ${clock(t.duration_seconds)}` : ""} · {S.length} passages
        </p>
        {people.length > 0 && <p className="muted small">In the room: {people.join(", ")}</p>}
      </header>
      {searchParams.error && <p className="notice">{searchParams.error}</p>}

      {C.length > 0 && (
        <section className="card stack">
          <h2>Candidate jobs quoting this conversation</h2>
          <ul className="list">
            {C.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/orgs/${t.organization_id}/candidates#c-${c.id}`}>{c.statement}</Link>
                <span className="muted small"> · {c.executor_role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2>What was said</h2>
        <div className="stack" style={{ gap: 10 }}>
          {S.map((s) => (
            <div key={s.id} id={`s-${s.position}`} className="segment">
              <div className="eyebrow">{s.speaker ?? "Unattributed"}{s.start_seconds !== null ? ` · ${clock(s.start_seconds)}` : ""}</div>
              <p>{s.text}</p>
            </div>
          ))}
          {S.length === 0 && <p className="muted">This conversation has no text.</p>}
        </div>
      </section>

      <form action={deleteTranscript} className="card stack">
        <h2>Delete this conversation</h2>
        <p className="muted small">Quotes taken from it stay on their candidates, marked as deleted evidence. Type delete to confirm.</p>
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="organization_id" value={t.organization_id} />
        <div className="row">
          <input name="confirm" placeholder="delete" style={{ maxWidth: 200 }} />
          <button className="btn ghost" type="submit">Delete transcript</button>
        </div>
      </form>
    </main>
  );
}

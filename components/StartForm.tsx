"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function StartForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Add your name so we can tell responses apart."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase()
      .from("respondents")
      .insert({ job_id: jobId, name: name.trim(), role: role.trim() || null })
      .select("id")
      .single();
    if (error || !data) { setErr("Couldn't start the interview. Try again."); setBusy(false); return; }
    router.push(`/interview/${data.id}/1`);
  }

  return (
    <form onSubmit={start} className="stack">
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="role">Your actual role (optional)</label>
        <input id="role" type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Delivery lead, Architect, AE" />
      </div>
      {err && <p className="err">{err}</p>}
      <div>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Starting…" : "Start the interview"}</button>
      </div>
    </form>
  );
}

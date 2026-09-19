"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import { parseTranscript } from "@/lib/transcript-text";
import { FellowNotConfigured, FellowRateLimited, attendeesOf, listRecordings } from "@/lib/fellow";

// Transcripts are the highest data class. Every action here is admin only,
// and every row written carries organization_id.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);
const back = (path: string): never => { revalidatePath(path.split("?")[0]); redirect(path); };

export async function pasteTranscript(form: FormData) {
  const user = await requireAdmin();
  const orgId = str(form, "organization_id");
  const path = `/admin/orgs/${orgId}/transcripts/paste`;
  const title = str(form, "title");
  const held = str(form, "held_at");
  const body = String(form.get("body") ?? "");
  if (!title) fail(path, "Give the conversation a title.");
  if (!held || Number.isNaN(Date.parse(held))) fail(path, "Pick the date it happened.");
  const segments = parseTranscript(body);
  if (!segments.length) fail(path, "There is no text to save.");

  const db = supabaseServer();
  const { data: t, error } = await db
    .from("transcripts")
    .insert({
      organization_id: orgId,
      source: "paste",
      title,
      held_at: new Date(`${held}T12:00:00Z`).toISOString(),
      imported_by: user.id,
    })
    .select("id")
    .single();
  if (error || !t) fail(path, error?.message ?? "Couldn't save the conversation.");

  const { error: segError } = await db.from("transcript_segments").insert(
    segments.map((s, i) => ({
      transcript_id: t!.id,
      organization_id: orgId,
      position: i + 1,
      speaker: s.speaker,
      text: s.text,
    })),
  );
  // A transcript with no segments is useless, so undo rather than leave a shell.
  if (segError) {
    await db.from("transcripts").delete().eq("id", t!.id);
    fail(path, segError.message);
  }
  back(`/admin/orgs/${orgId}/transcripts/${t!.id}`);
}

export async function deleteTranscript(form: FormData) {
  await requireAdmin();
  const orgId = str(form, "organization_id");
  const id = str(form, "id");
  const path = `/admin/orgs/${orgId}/transcripts/${id}`;
  const db = supabaseServer();
  const { data: t } = await db.from("transcripts").select("title").eq("id", id).maybeSingle();
  if (!t || str(form, "confirm") !== "delete") fail(path, "Type delete to confirm.");
  const { error } = await db.from("transcripts").delete().eq("id", id);
  if (error) fail(path, error.message);
  back(`/admin/orgs/${orgId}/transcripts`);
}

export async function importFromFellow(form: FormData) {
  const user = await requireAdmin();
  const orgId = str(form, "organization_id");
  const from = str(form, "from");
  const to = str(form, "to");
  const title = str(form, "title");
  const query = new URLSearchParams({ from, to, ...(title ? { title } : {}) }).toString();
  const path = `/admin/orgs/${orgId}/transcripts/import?${query}`;
  const ids = new Set(form.getAll("recording").map(String));
  if (!ids.size) fail(path, "Tick at least one recording.");

  const db = supabaseServer();
  let found;
  try {
    // The list endpoint returns transcripts when asked, so the ticked
    // recordings arrive whole in one walk of the same window.
    found = (await listRecordings({ from, to, title: title || undefined }, true)).filter((r) => ids.has(r.id));
  } catch (e) {
    if (e instanceof FellowNotConfigured) fail(path, "Fellow isn't set up on this server. Add the key and subdomain, then redeploy.");
    if (e instanceof FellowRateLimited) fail(path, "Fellow is rate limiting. Wait a minute and try again.");
    fail(path, e instanceof Error ? e.message : "Couldn't reach Fellow.");
  }

  const failed: string[] = [];
  let saved = 0;
  let lastId = "";
  for (const rec of found ?? []) {
    if (!rec.segments.length) { failed.push(`${rec.title} (no transcript)`); continue; }
    const attendees = await attendeesOf(rec.note_id);
    const { data: t, error } = await db
      .from("transcripts")
      .insert({
        organization_id: orgId,
        source: "fellow",
        fellow_recording_id: rec.id,
        title: rec.title,
        held_at: rec.held_at ?? new Date().toISOString(),
        attendees,
        language: rec.language,
        duration_seconds: rec.duration_seconds === null ? null : Math.round(rec.duration_seconds),
        imported_by: user.id,
      })
      .select("id")
      .single();
    if (error || !t) { failed.push(`${rec.title} (${error?.message ?? "not saved"})`); continue; }
    const { error: segError } = await db.from("transcript_segments").insert(
      rec.segments.map((s, i) => ({
        transcript_id: t.id,
        organization_id: orgId,
        position: i + 1,
        speaker: s.speaker,
        start_seconds: s.start,
        end_seconds: s.end,
        text: s.text,
      })),
    );
    if (segError) {
      await db.from("transcripts").delete().eq("id", t.id);
      failed.push(`${rec.title} (${segError.message})`);
      continue;
    }
    saved++;
    lastId = t.id;
  }

  if (!saved) fail(path, failed.length ? `Nothing was imported. ${failed.join("; ")}` : "Nothing was imported.");
  if (failed.length) fail(`/admin/orgs/${orgId}/transcripts`, `Imported ${saved}. Left out: ${failed.join("; ")}`);
  back(saved === 1 ? `/admin/orgs/${orgId}/transcripts/${lastId}` : `/admin/orgs/${orgId}/transcripts`);
}

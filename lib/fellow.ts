// The only file that talks to Fellow.
//
// Fellow's Developer API is keyed per person: FELLOW_API_KEY is Chris's key
// and the app sees exactly what that account sees. The key and the workspace
// subdomain are server-side environment variables and never reach the browser.
//
// Shapes come from the Developer API reference:
//   POST /recordings  {pagination: {cursor, page_size}, filters: {...}, include: {transcript}}
//                  -> {page_info: {cursor, page_size}, data: [...]}
//   GET  /notes/{id} -> a note, which carries the meeting's attendees.
// Limits are 3 requests a second and 10,000 a day, so calls are spaced out.

const GAP_MS = 350;
const PAGE_SIZE = 50;

export class FellowNotConfigured extends Error {}
export class FellowRateLimited extends Error {}
export class FellowError extends Error {}

export type FellowRecording = {
  id: string;
  title: string;
  held_at: string | null;
  duration_seconds: number | null;
  note_id: string | null;
  language: string | null;
  segments: { speaker: string | null; text: string; start: number | null; end: number | null }[];
};

export function fellowConfigured(): boolean {
  return Boolean(process.env.FELLOW_API_KEY && process.env.FELLOW_SUBDOMAIN);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function call(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const key = process.env.FELLOW_API_KEY;
  const sub = process.env.FELLOW_SUBDOMAIN;
  if (!key || !sub) throw new FellowNotConfigured("Fellow isn't set up on this server.");
  const res = await fetch(`https://${sub}.fellow.app/api/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 429) throw new FellowRateLimited("Fellow is rate limiting. Wait a minute and try again.");
  if (!res.ok) throw new FellowError(`Fellow answered ${res.status}.`);
  return (await res.json()) as Record<string, unknown>;
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asText = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Field names for a recording's title and time are not pinned down in the
// reference, so read the first of the plausible names that is present.
const firstText = (row: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = asText(row[k]);
    if (v) return v;
  }
  return null;
};

function toRecording(raw: unknown): FellowRecording | null {
  const row = asRecord(raw);
  const id = firstText(row, ["id", "recording_id", "guid"]);
  if (!id) return null;
  const transcript = asRecord(row.transcript);
  const segments = asArray(transcript.speech_segments).map((s) => {
    const seg = asRecord(s);
    return {
      speaker: asText(seg.speaker),
      text: asText(seg.text) ?? "",
      start: asNumber(seg.start_time),
      end: asNumber(seg.end_time),
    };
  }).filter((s) => s.text.length > 0);
  const last = segments[segments.length - 1];
  return {
    id,
    title: firstText(row, ["title", "name", "meeting_title"]) ?? "Untitled recording",
    held_at: firstText(row, ["started_at", "recorded_at", "occurred_at", "created_at", "start_time"]),
    duration_seconds: asNumber(row.duration_seconds) ?? asNumber(row.duration) ?? (last?.end ?? null),
    note_id: firstText(row, ["note_id"]),
    language: asText(transcript.language_code),
    segments,
  };
}

export type RecordingFilter = { from?: string; to?: string; title?: string };

/** Every recording in the window, oldest cursor page first. */
export async function listRecordings(filter: RecordingFilter, withTranscript = false): Promise<FellowRecording[]> {
  const filters: Record<string, string> = {};
  if (filter.from) filters.created_at_start = filter.from;
  if (filter.to) filters.created_at_end = filter.to;
  if (filter.title) filters.title = filter.title.slice(0, 255);

  const out: FellowRecording[] = [];
  let cursor: string | null = null;
  // The cursor walk is bounded so a misbehaving cursor cannot loop forever.
  for (let page = 0; page < 20; page++) {
    if (page > 0) await wait(GAP_MS);
    const body: Record<string, unknown> = { pagination: { cursor, page_size: PAGE_SIZE }, filters };
    if (withTranscript) body.include = { transcript: true };
    const res: Record<string, unknown> = await call("recordings", body);
    for (const raw of asArray(res.data)) {
      const rec = toRecording(raw);
      if (rec) out.push(rec);
    }
    cursor = asText(asRecord(res.page_info).cursor);
    if (!cursor) break;
  }
  return out;
}

/** Who was in the meeting, from the recording's note. Best effort. */
export async function attendeesOf(noteId: string | null): Promise<string[]> {
  if (!noteId) return [];
  try {
    await wait(GAP_MS);
    const res = await call(`notes/${encodeURIComponent(noteId)}`);
    const note = asRecord(res.data ?? res);
    const raw = asArray(note.attendees).length ? asArray(note.attendees) : asArray(note.participants);
    const names = raw
      .map((a) => (typeof a === "string" ? a : firstText(asRecord(a), ["name", "full_name", "display_name", "email"])))
      .filter((n): n is string => Boolean(n));
    return [...new Set(names)];
  } catch {
    // Attendees are a nicety. A note we cannot read must not fail an import.
    return [];
  }
}

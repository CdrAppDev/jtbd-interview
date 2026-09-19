// Turning pasted text into the same shape a Fellow import produces.
// A line that starts with a short name and a colon is that person speaking,
// and everything after it belongs to them until the next such line.

export type ParsedSegment = { speaker: string | null; text: string };

const SPEAKER = /^([A-Z][^:\n]{0,40}?)\s*(?:\[[^\]]*\]|\([^)]*\))?\s*:\s*(.*)$/;

export function parseTranscript(body: string): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  let speaker: string | null = null;
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = SPEAKER.exec(line);
    if (m && !/^https?$/i.test(m[1])) {
      speaker = m[1].trim();
      const rest = m[2].trim();
      if (rest) out.push({ speaker, text: rest });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.speaker === speaker) last.text = `${last.text} ${line}`;
    else out.push({ speaker, text: line });
  }
  return out;
}

export function speakersOf(segments: { speaker: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const s of segments) if (s.speaker) seen.add(s.speaker);
  return [...seen];
}

export function clock(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

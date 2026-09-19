// What a run costs, in one place.
//
// Rates are dollars per million tokens for the model the engine uses.
// Thinking is billed as output. Keep this table next to the model choice so
// the estimate on screen and the figure recorded on the run cannot drift.

export const ENGINE_MODEL = "claude-opus-5";

const RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

// A rough ratio of output to input for this workload, used only before a run.
const OUTPUT_RATIO = 0.3;

// Spoken conversation runs around this many tokens an hour.
const TOKENS_PER_HOUR = 12000;

export function costCents(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? RATES[ENGINE_MODEL];
  const dollars = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return Math.round(dollars * 100);
}

export function estimateCents(model: string, inputTokens: number): number {
  return costCents(model, inputTokens, Math.round(inputTokens * OUTPUT_RATIO));
}

export function hoursOf(inputTokens: number): number {
  return inputTokens / TOKENS_PER_HOUR;
}

export function dollars(cents: number): string {
  return cents < 100 ? `$${(cents / 100).toFixed(2)}` : `$${Math.round(cents / 100)}`;
}

export function maxInputTokens(): number {
  const raw = Number(process.env.ENGINE_MAX_INPUT_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000;
}

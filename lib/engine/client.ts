import Anthropic from "@anthropic-ai/sdk";
import { ENGINE_MODEL } from "@/lib/cost";

// The only file that talks to Anthropic. The key is the app's own, held
// server-side. Transcripts of one organization go out per call and nothing
// is mixed across clients: the caller passes exactly what it loaded.

export class EngineNotConfigured extends Error {}
export class EngineRefused extends Error {}
export class EngineError extends Error {}

export type Usage = { input: number; output: number };
export type Answer<T> = { value: T; usage: Usage };

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new EngineNotConfigured("The engine isn't set up on this server.");
  return new Anthropic({ apiKey });
}

export function engineConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Tokens the model would read for this prompt, before spending anything. */
export async function countInput(system: string, user: string): Promise<number> {
  const res = await client().messages.countTokens({
    model: ENGINE_MODEL,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.input_tokens;
}

/**
 * One call, answered against a JSON schema so the result parses without
 * cleanup. Streamed because these runs are long and the answers are large.
 */
export async function ask<T>(schema: Record<string, unknown>, system: string, user: string): Promise<Answer<T>> {
  const stream = client().messages.stream({
    model: ENGINE_MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();
  const usage: Usage = { input: message.usage.input_tokens, output: message.usage.output_tokens };

  if (message.stop_reason === "refusal") {
    throw new EngineRefused(message.stop_details?.explanation ?? "The model declined to answer this.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new EngineError("The answer was cut off. Try a shorter transcript.");
  }
  const text = message.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  if (!text.trim()) throw new EngineError("The model returned nothing.");
  try {
    return { value: JSON.parse(text) as T, usage };
  } catch {
    throw new EngineError("The model's answer was not readable.");
  }
}

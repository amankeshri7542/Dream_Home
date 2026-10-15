// One structured-output call to Claude. The schema keeps the answer to ids the
// app can draw; the caller still sanitises it.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
/** USD per million tokens for Claude Opus 5.5. */
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.4 };

export type DesignCall = {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
};
export type DesignAnswer = { json: unknown; costUsd: number; model: string };
export type CallClaude = (call: DesignCall) => Promise<DesignAnswer>;

export class DesignRefused extends Error {}

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};
export function costOf(u: Usage): number {
  return (
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
    1e6
  );
}

export const callClaude: CallClaude = async (call) => {
  const client = new Anthropic({ apiKey: call.apiKey, timeout: 100_000, maxRetries: 1 });
  const message = await client.beta.messages
    .stream({
      model: call.model ?? MODEL,
      max_tokens: call.maxTokens,
      // If the model declines, Anthropic retries server-side on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "omitted" },
      output_config: { effort: call.effort, format: { type: "json_schema", schema: call.schema } },
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: call.user }],
    })
    .finalMessage();
  const costUsd = costOf(message.usage);
  console.info(
    JSON.stringify({ ai: "design", model: message.model, stop: message.stop_reason, usage: message.usage, costUsd }),
  );
  if (message.stop_reason === "refusal") throw new DesignRefused("The designer declined this brief.");
  if (message.stop_reason === "max_tokens") throw new Error("The design ran out of room.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { json: JSON.parse(text), costUsd, model: message.model };
};

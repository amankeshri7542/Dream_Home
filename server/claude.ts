// One structured-output call to Claude. The schema keeps the answer to ids the
// app can draw; the caller still sanitises it.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

/** USD per million tokens. Cache writes are the 5-minute TTL rate (1.25× input). */
type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };
const PRICES: Array<[prefix: string, price: Price]> = [
  ["claude-opus-5-5", { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 }],
];
/** Unknown models are priced high, so the daily budget errs on the safe side. */
const UNKNOWN: Price = { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 };
export const priceOf = (model: string) => PRICES.find(([prefix]) => model.startsWith(prefix))?.[1] ?? UNKNOWN;

/** Server-side refusal fallback ("default") is offered for the Opus line only; Haiku rejects it. */
export const supportsFallback = (model: string) => model.startsWith("claude-opus-");

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

/** A failed call that was still billed: the caller adds `costUsd` to the daily spend. */
export class BilledError extends Error {
  constructor(
    message: string,
    public costUsd = 0,
  ) {
    super(message);
  }
}
export class DesignRefused extends BilledError {}

type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};
type Usage = TokenUsage & { iterations?: Array<TokenUsage & { model?: string }> | null };

const tokenCost = (u: TokenUsage, p: Price) =>
  (u.input_tokens * p.input +
    u.output_tokens * p.output +
    (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * p.cacheRead) /
  1e6;

/**
 * What a call cost. With a server-side fallback, `usage.iterations` lists every
 * attempt (each billed at its own model's rate); otherwise the top level covers it.
 */
export function costOf(usage: Usage, model: string = MODEL): number {
  if (usage.iterations?.length)
    return usage.iterations.reduce((sum, it) => sum + tokenCost(it, priceOf(it.model ?? model)), 0);
  return tokenCost(usage, priceOf(model));
}

export const callClaude: CallClaude = async (call) => {
  const model = call.model ?? MODEL;
  const client = new Anthropic({ apiKey: call.apiKey, timeout: 100_000, maxRetries: 1 });
  const message = await client.beta.messages
    .stream({
      model,
      max_tokens: call.maxTokens,
      // If an Opus model declines, Anthropic retries server-side on a fallback model.
      ...(supportsFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      thinking: { type: "adaptive", display: "omitted" },
      output_config: { effort: call.effort, format: { type: "json_schema", schema: call.schema } },
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: call.user }],
    })
    .finalMessage();
  const costUsd = costOf(message.usage as Usage, message.model ?? model);
  console.info(
    JSON.stringify({ ai: "design", model: message.model, stop: message.stop_reason, usage: message.usage, costUsd }),
  );
  if (message.stop_reason === "refusal") throw new DesignRefused("The designer declined this brief.", costUsd);
  if (message.stop_reason === "max_tokens") throw new BilledError("The design ran out of room.", costUsd);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { json: JSON.parse(text), costUsd, model: message.model };
  } catch {
    throw new BilledError("The design wasn't readable.", costUsd);
  }
};

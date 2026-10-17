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

/**
 * A call's worst case in USD: every input token written to the cache (the
 * dearest input rate) and every allowed output token. Charged to the daily
 * budget up front, then settled to the real cost.
 */
export const worstCaseUsd = (model: string, inputTokens: number, maxTokens: number) => {
  const p = priceOf(model);
  return (inputTokens * Math.max(p.input, p.cacheWrite) + maxTokens * p.output) / 1e6;
};

/**
 * Server-side refusal fallback ("default") is offered for the Opus line and
 * Sonnet 5.5 on the Claude API; Haiku rejects it.
 */
export const supportsFallback = (model: string) => model.startsWith("claude-opus-") || model.startsWith("claude-sonnet-5-5");

export type DesignCall = {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  /** A picture to read alongside the text (a builder's plan). Never logged. */
  image?: { mediaType: "image/jpeg"; data: string };
  /** What the call is for, in the usage log. */
  label?: string;
  timeoutMs?: number;
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

/**
 * What a failed call cost: its bill when Anthropic answered (a refusal or a
 * cut-off answer), 0 when it never reached the model (an error answer, or no
 * connection), and null when nobody knows (a timeout part-way through).
 */
export function billOf(error: unknown): number | null {
  if (error instanceof BilledError) return error.costUsd;
  if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIUserAbortError) return null;
  if (error instanceof Anthropic.APIConnectionError) return 0;
  if (error instanceof Anthropic.APIError && typeof error.status === "number") return 0;
  return null;
}

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
  const client = new Anthropic({ apiKey: call.apiKey, timeout: call.timeoutMs ?? 100_000, maxRetries: 1 });
  // The SDK's timeout stops counting once a stream starts, so this one bounds the whole answer.
  const deadline = { signal: AbortSignal.timeout(call.timeoutMs ?? 100_000) };
  const message = await client.beta.messages
    .stream({
      model,
      max_tokens: call.maxTokens,
      // If an Opus model declines, Anthropic retries server-side on a fallback model.
      ...(supportsFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      thinking: { type: "adaptive", display: "omitted" },
      output_config: { effort: call.effort, format: { type: "json_schema", schema: call.schema } },
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: call.image
            ? [
                { type: "image", source: { type: "base64", media_type: call.image.mediaType, data: call.image.data } },
                { type: "text", text: call.user },
              ]
            : call.user,
        },
      ],
    }, deadline)
    .finalMessage();
  const costUsd = costOf(message.usage as Usage, message.model ?? model);
  console.info(
    // Usage only: never the prompt, the picture or the answer.
    JSON.stringify({ ai: call.label ?? "design", model: message.model, stop: message.stop_reason, usage: message.usage, costUsd }),
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

export type ToolCall = {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  tools: { name: string; description: string; input_schema: Record<string, unknown> }[];
  maxTokens: number;
  label: string;
  timeoutMs?: number;
};
export type ToolAnswer = { text: string; calls: { name: string; input: unknown }[]; costUsd: number; model: string };
export type CallTools = (call: ToolCall) => Promise<ToolAnswer>;

/**
 * One quick tool-use turn (voice commands on Haiku): no thinking, low effort,
 * the tool list and system prompt cached. The calls come back unchecked;
 * the caller checks every one against its tool.
 */
export const callTools: CallTools = async (call) => {
  const client = new Anthropic({ apiKey: call.apiKey, timeout: call.timeoutMs ?? 20_000, maxRetries: 1 });
  const message = await client.messages.create({
    model: call.model,
    max_tokens: call.maxTokens,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    // Tools come before the system prompt, so this one breakpoint caches both.
    system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
    tools: call.tools.map((tool) => ({ ...tool, input_schema: tool.input_schema as Anthropic.Tool.InputSchema })),
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: call.user }],
  }, { signal: AbortSignal.timeout(call.timeoutMs ?? 20_000) });
  const costUsd = costOf(message.usage as Usage, message.model ?? call.model);
  // Usage only: never what was said or done.
  console.info(JSON.stringify({ ai: call.label, model: message.model, stop: message.stop_reason, usage: message.usage, costUsd }));
  if (message.stop_reason === "refusal") throw new DesignRefused("The helper declined.", costUsd);
  return {
    text: message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim(),
    calls: message.content.flatMap((b) => (b.type === "tool_use" ? [{ name: b.name, input: b.input }] : [])),
    costUsd,
    model: message.model,
  };
};

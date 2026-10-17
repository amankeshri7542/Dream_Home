// What every route shares: injectable dependencies (for tests) and the limiter.
import type { CallClaude } from "./claude";
import { onVercel, type Env } from "./http";
import { Limiter, budgetFrom, memoryStore, restStore, rulesFrom, type Store } from "./limiter";

export type Deps = { callClaude?: CallClaude; store?: Store; now?: () => Date };

let sharedMemory: Store | null = null;

/**
 * The counter store: Upstash/Vercel KV when configured. Locally, an in-memory
 * store. On Vercel without KV there is none, because per-instance memory can't
 * enforce limits or the budget; callers must then refuse work that costs money.
 */
export function storeFor(env: Env, deps: Deps): Store | null {
  if (deps.store) return deps.store;
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) return restStore(env.KV_REST_API_URL, env.KV_REST_API_TOKEN);
  if (onVercel(env)) return null;
  return (sharedMemory ??= memoryStore());
}

export function limiterFor(env: Env, deps: Deps): Limiter | null {
  const store = storeFor(env, deps);
  return store && new Limiter(store, budgetFrom(env), rulesFrom(env), deps.now);
}

/** The AI is on when there's a key and nobody pulled the kill switch (AI_DISABLED=1). */
export const aiConfigured = (env: Env) => !!env.ANTHROPIC_API_KEY && env.AI_DISABLED !== "1";

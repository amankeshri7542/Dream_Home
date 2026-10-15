// POST /api/design  {kind: "home" | "room", brief, variant?}  → a design plan
// GET  /api/design                                           → free uses left
// The API key stays here. When anything goes wrong the answer says so and the
// app falls back to its built-in planner, so a homeowner is never stuck.
import { parseHomeBrief, parseRoomBrief, type DesignResponse, type HomePlan, type RoomPlan } from "../src/ai/brief";
import { HOME_SYSTEM, ROOM_SYSTEM, homeUserMessage, roomUserMessage } from "../src/ai/prompt";
import { HOME_PLAN_SCHEMA, ROOM_PLAN_SCHEMA, sanitizeHomePlan, sanitizeRoomPlan } from "../src/ai/schema";
import { DesignRefused, callClaude as realCallClaude, type CallClaude } from "./claude";
import { Limiter, memoryStore, restStore, type Kind, type Store } from "./limiter";

export type Env = Partial<
  Record<"ANTHROPIC_API_KEY" | "AI_MODEL" | "AI_DAILY_BUDGET_USD" | "KV_REST_API_URL" | "KV_REST_API_TOKEN", string>
>;
export type Deps = { callClaude?: CallClaude; store?: Store; now?: () => Date };

const MAX_BODY = 8_000;
const DEVICE = /^[a-z0-9-]{16,64}$/;
let sharedMemory: Store | null = null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const fail = (reason: "limit" | "busy" | "offline" | "invalid", message: string, left?: number, status = 200) =>
  json({ ok: false, reason, message, ...(left !== undefined ? { left } : {}) } satisfies DesignResponse<never>, status);

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "local").slice(0, 64);
}

function limiterFor(env: Env, deps: Deps) {
  const store =
    deps.store ??
    (env.KV_REST_API_URL && env.KV_REST_API_TOKEN
      ? restStore(env.KV_REST_API_URL, env.KV_REST_API_TOKEN)
      : (sharedMemory ??= memoryStore()));
  const budget = Number(env.AI_DAILY_BUDGET_USD ?? "10");
  return new Limiter(store, Number.isFinite(budget) && budget > 0 ? budget : 10, deps.now);
}

export async function handleDesign(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const device = request.headers.get("x-dream-device") ?? "";
  if (!DEVICE.test(device)) return fail("invalid", "Missing device id.", undefined, 400);
  const limiter = limiterFor(env, deps);
  const live = !!env.ANTHROPIC_API_KEY;

  if (request.method === "GET") {
    try {
      return json({ ok: true, live, home: await limiter.left("home", device), room: await limiter.left("room", device) });
    } catch {
      return json({ ok: true, live, home: null, room: null });
    }
  }
  if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);

  const text = await request.text();
  if (text.length > MAX_BODY) return fail("invalid", "That request is too big.", undefined, 413);
  let body: { kind?: unknown; brief?: unknown; variant?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail("invalid", "That request isn't readable.", undefined, 400);
  }
  const kind: Kind | null = body.kind === "home" || body.kind === "room" ? body.kind : null;
  if (!kind) return fail("invalid", "Unknown design kind.", undefined, 400);
  const variant = Number.isInteger(body.variant) ? Math.min(9, Math.max(0, body.variant as number)) : 0;
  const parsed = kind === "home" ? parseHomeBrief(body.brief) : parseRoomBrief(body.brief);
  if (!parsed.ok) return fail("invalid", parsed.error, undefined, 400);
  if (!live) return fail("offline", "The AI designer isn’t switched on yet.");

  const ip = clientIp(request);
  let verdict;
  try {
    verdict = await limiter.reserve(kind, device, ip);
  } catch (error) {
    console.error("limit store", error);
    return fail("busy", "The AI designer is busy right now.");
  }
  if (!verdict.ok)
    return verdict.reason === "limit"
      ? fail("limit", "You’ve used your free AI designs.", 0)
      : fail("busy", "The AI designer is very busy today.", verdict.left);

  const call = deps.callClaude ?? realCallClaude;
  try {
    const answer =
      kind === "home"
        ? await call({
            apiKey: env.ANTHROPIC_API_KEY!,
            model: env.AI_MODEL,
            system: HOME_SYSTEM,
            user: homeUserMessage(parsed.brief as never, variant),
            schema: HOME_PLAN_SCHEMA,
            effort: "medium",
            maxTokens: 16_000,
          })
        : await call({
            apiKey: env.ANTHROPIC_API_KEY!,
            model: env.AI_MODEL,
            system: ROOM_SYSTEM,
            user: roomUserMessage(parsed.brief as never, variant),
            schema: ROOM_PLAN_SCHEMA,
            effort: "low",
            maxTokens: 6_000,
          });
    await limiter.spend(answer.costUsd).catch(() => undefined);
    const plan = kind === "home" ? sanitizeHomePlan(answer.json) : sanitizeRoomPlan(answer.json);
    return json({ ok: true, plan, source: "ai", left: verdict.left } satisfies DesignResponse<HomePlan | RoomPlan>);
  } catch (error) {
    console.error("design failed", error instanceof Error ? error.message : error);
    await limiter.refund(kind, device, ip).catch(() => undefined);
    return error instanceof DesignRefused
      ? fail("busy", "The AI designer couldn’t work with that note. Try changing it.", verdict.left + 1)
      : fail("busy", "The AI designer didn’t answer in time.", verdict.left + 1);
  }
}

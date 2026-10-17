// POST /api/design  {kind: "home" | "room", brief, variant?}  → a design plan
// GET  /api/design                                           → free uses left
// The API key stays here. When anything goes wrong the answer says so and the
// app falls back to its built-in planner, so a homeowner is never stuck.
import { parseHomeBrief, parseRoomBrief, type DesignResponse, type HomePlan, type RoomPlan } from "../src/ai/brief";
import { HOME_SYSTEM, ROOM_SYSTEM, homeUserMessage, roomUserMessage } from "../src/ai/prompt";
import { HOME_PLAN_SCHEMA, ROOM_PLAN_SCHEMA, sanitizeHomePlan, sanitizeRoomPlan } from "../src/ai/schema";
import { DesignRefused, MODEL, billOf, callClaude as realCallClaude, worstCaseUsd } from "./claude";
import { aiConfigured, limiterFor, type Deps } from "./context";
import { BodyTooLarge, clientIp, deviceOf, fail, json, readBody, type Env } from "./http";

export type { Deps } from "./context";
export type { Env } from "./http";

const MAX_BODY = 8_000;

export async function handleDesign(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const device = deviceOf(request);
  if (!device) return fail("invalid", "Missing device id.", undefined, 400);
  const limiter = limiterFor(env, deps);
  const live = aiConfigured(env) && !!limiter;

  if (request.method === "GET") {
    if (!limiter) return json({ ok: true, live, home: null, room: null });
    try {
      return json({ ok: true, live, home: await limiter.left("home", device), room: await limiter.left("room", device) });
    } catch {
      return json({ ok: true, live, home: null, room: null });
    }
  }
  if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);

  let text: string;
  try {
    text = await readBody(request, MAX_BODY);
  } catch (error) {
    if (error instanceof BodyTooLarge) return fail("invalid", "That request is too big.", undefined, 413);
    return fail("invalid", "That request isn't readable.", undefined, 400);
  }
  let body: { kind?: unknown; brief?: unknown; variant?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail("invalid", "That request isn't readable.", undefined, 400);
  }
  const kind = body.kind === "home" || body.kind === "room" ? body.kind : null;
  if (!kind) return fail("invalid", "Unknown design kind.", undefined, 400);
  const variant = Number.isInteger(body.variant) ? Math.min(9, Math.max(0, body.variant as number)) : 0;
  const parsed = kind === "home" ? parseHomeBrief(body.brief) : parseRoomBrief(body.brief);
  if (!parsed.ok) return fail("invalid", parsed.error, undefined, 400);
  if (!live || !limiter) return fail("offline", "The AI designer isn’t switched on yet.");

  const ip = clientIp(request);
  const model = env.AI_MODEL || MODEL;
  // About 8k tokens of instructions and schema, and the answer's cap.
  const estimate = worstCaseUsd(model, 10_000, kind === "home" ? 16_000 : 6_000);
  let verdict;
  try {
    verdict = await limiter.reserve(kind, device, ip, estimate);
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
            model,
            system: HOME_SYSTEM,
            user: homeUserMessage(parsed.brief as never, variant),
            schema: HOME_PLAN_SCHEMA,
            effort: "medium",
            maxTokens: 16_000,
          })
        : await call({
            apiKey: env.ANTHROPIC_API_KEY!,
            model,
            system: ROOM_SYSTEM,
            user: roomUserMessage(parsed.brief as never, variant),
            schema: ROOM_PLAN_SCHEMA,
            effort: "low",
            maxTokens: 6_000,
          });
    await limiter.settle(estimate, answer.costUsd).catch(() => undefined);
    const plan = kind === "home" ? sanitizeHomePlan(answer.json) : sanitizeRoomPlan(answer.json);
    return json({ ok: true, plan, source: "ai", left: verdict.left } satisfies DesignResponse<HomePlan | RoomPlan>);
  } catch (error) {
    // The reason only: never the brief or the answer.
    console.error("design failed", error instanceof Error ? error.name : "error");
    // A refused or cut-off answer is still billed; a timeout keeps its worst case.
    await limiter.failed(kind, device, ip, estimate, billOf(error)).catch(() => undefined);
    return error instanceof DesignRefused
      ? fail("busy", "The AI designer couldn’t work with that note. Try changing it.", verdict.left + 1)
      : fail("busy", "The AI designer didn’t answer in time.", verdict.left + 1);
  }
}

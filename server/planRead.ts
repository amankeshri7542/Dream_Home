// POST /api/plan-read  a JPEG photo of a builder's floor plan → what the AI reads off it
// GET  /api/plan-read                                           → is it on, and free readings left
// One free reading per device (LIMIT_PLAN_*). The photo is read in memory and
// never stored or logged; only the call's usage and cost are. The app always
// offers "Draw it yourself" on the photo when reading isn't possible.
import { IMAGE, READING_SCHEMA, READING_SYSTEM, readingUserText, sanitizeReading } from "../src/planread/reading";
import { billOf, callClaude as realCallClaude, worstCaseUsd } from "./claude";
import { aiConfigured, limiterFor, type Deps } from "./context";
import { BodyTooLarge, clientIp, deviceOf, fail, json, readBytes, type Env } from "./http";
import { jpegSize } from "./share";

export const PLAN_MODEL = "claude-sonnet-5-5";
const PLOT = /^(\d{1,3})x(\d{1,3}) ?(ft|m)$/;
const ROAD = new Set(["top", "bottom", "left", "right"]);

const base64 = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

export async function handlePlanRead(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const device = deviceOf(request);
  if (!device) return fail("invalid", "Missing device id.", undefined, 400);
  const limiter = limiterFor(env, deps);
  const live = aiConfigured(env) && !!limiter;
  if (request.method === "GET") {
    if (!limiter) return json({ ok: true, live, left: null });
    try {
      return json({ ok: true, live, left: await limiter.left("plan", device) });
    } catch {
      return json({ ok: true, live, left: null });
    }
  }
  if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);
  if (!(request.headers.get("content-type") ?? "").startsWith("image/jpeg"))
    return fail("invalid", "Send the plan as a JPEG photo.", undefined, 415);
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(request, IMAGE.maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLarge) return fail("too-big", "That photo is too big. Try a smaller one.", undefined, 413);
    return fail("invalid", "That photo isn't readable.", undefined, 400);
  }
  const size = jpegSize(bytes);
  if (!size || Math.max(size.width, size.height) > IMAGE.maxEdge || Math.min(size.width, size.height) < 200)
    return fail("invalid", "That photo isn't a JPEG of a sensible size.", undefined, 400);
  if (!live || !limiter) return fail("offline", "Plan reading isn’t switched on yet.");

  const ip = clientIp(request);
  const model = env.PLAN_MODEL || PLAN_MODEL;
  // The picture (up to ~4.8k tokens) and the instructions, and the answer's cap.
  const estimate = worstCaseUsd(model, 7_000, 12_000);
  let verdict;
  try {
    verdict = await limiter.reserve("plan", device, ip, estimate);
  } catch (error) {
    console.error("limit store", error instanceof Error ? error.message : error);
    return fail("busy", "Plan reading is busy right now.");
  }
  if (!verdict.ok)
    return verdict.reason === "limit"
      ? fail("limit", "You’ve used your free plan reading.", 0)
      : fail("busy", "Plan reading is very busy today.", verdict.left);

  const url = new URL(request.url);
  const plot = PLOT.exec(url.searchParams.get("plot") ?? "");
  const road = url.searchParams.get("road") ?? "";
  const call = deps.callClaude ?? realCallClaude;
  try {
    const answer = await call({
      apiKey: env.ANTHROPIC_API_KEY!,
      model,
      system: READING_SYSTEM,
      user: readingUserText({ plot: plot ? `${plot[1]} × ${plot[2]} ${plot[3]}` : undefined, road: ROAD.has(road) ? road : undefined }),
      image: { mediaType: "image/jpeg", data: base64(bytes) },
      schema: READING_SCHEMA,
      effort: "medium",
      maxTokens: 12_000,
      label: "plan-read",
      timeoutMs: 55_000,
    });
    await limiter.settle(estimate, answer.costUsd).catch(() => undefined);
    return json({ ok: true, reading: sanitizeReading(answer.json), left: verdict.left });
  } catch (error) {
    // The reason only: never the photo or what was read.
    console.error("plan read failed", error instanceof Error ? error.name : "error");
    await limiter.failed("plan", device, ip, estimate, billOf(error)).catch(() => undefined);
    return fail("busy", "Couldn’t read the plan this time.", verdict.left + 1);
  }
}

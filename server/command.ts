// POST /api/command  {text, lang, context} → {ok, reply, actions, left}
// GET  /api/command                         → is it on, and commands left today
// "Talk to your home": Haiku turns what someone said into calls from a closed
// set of tools; each call is checked against its tool and the home's refs
// before it goes back, and the app runs them as one undo step. Navigation
// ("undo", "night", "open the kitchen") never gets here: the app answers it.
// What was said is never stored or logged; only the call's usage and cost are.
import {
  COMMAND_SYSTEM,
  CONTEXT_MAX,
  MAX_ACTIONS,
  TEXT_MAX,
  TOOL_DEFS,
  cleanAction,
  cleanContext,
  commandUserText,
  refsOf,
} from "../src/voice/tools";
import { billOf, callTools as realCallTools, worstCaseUsd } from "./claude";
import { aiConfigured, limiterFor, type Deps } from "./context";
import { BodyTooLarge, clientIp, deviceOf, fail, json, readBody, type Env } from "./http";

export const COMMAND_MODEL = "claude-haiku-5-5";
const BODY_MAX = CONTEXT_MAX + TEXT_MAX * 4 + 1_024;

export async function handleCommand(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const device = deviceOf(request);
  if (!device) return fail("invalid", "Missing device id.", undefined, 400);
  const limiter = limiterFor(env, deps);
  const live = aiConfigured(env) && !!limiter;
  if (request.method === "GET") {
    if (!limiter) return json({ ok: true, live, left: null });
    try {
      return json({ ok: true, live, left: await limiter.left("command", device) });
    } catch {
      return json({ ok: true, live, left: null });
    }
  }
  if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readBody(request, BODY_MAX));
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BodyTooLarge) return fail("too-big", "That was a bit long. Try saying it in fewer words.", undefined, 413);
    return fail("invalid", "That request wasn’t readable.", undefined, 400);
  }
  const said = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!said || said.length > TEXT_MAX) return fail("invalid", "Say or type what you’d like to change.", undefined, 400);
  const lang = body.lang === "hi" ? "hi" : "en";
  const context = cleanContext(body.context);
  if (!context || JSON.stringify(context).length > CONTEXT_MAX)
    return fail("invalid", "This home couldn’t be described. Try again.", undefined, 400);
  if (!live || !limiter) return fail("offline", "Talking to your home isn’t switched on yet.");

  const ip = clientIp(request);
  const model = env.COMMAND_MODEL || COMMAND_MODEL;
  // The tools, instructions and home (about 5k tokens), and the answer's cap.
  const estimate = worstCaseUsd(model, 6_000, 600);
  let verdict;
  try {
    verdict = await limiter.reserve("command", device, ip, estimate);
  } catch (error) {
    console.error("limit store", error instanceof Error ? error.message : error);
    return fail("busy", "Your home’s helper is busy right now.");
  }
  if (!verdict.ok)
    return verdict.reason === "limit"
      ? fail("limit", "That’s all the helper can do today. Tap and edit as usual, and come back tomorrow.", 0)
      : fail("busy", "Your home’s helper is very busy today.", verdict.left);

  const call = deps.callTools ?? realCallTools;
  try {
    const answer = await call({
      apiKey: env.ANTHROPIC_API_KEY!,
      model,
      system: COMMAND_SYSTEM,
      user: commandUserText(context, said, lang),
      tools: TOOL_DEFS,
      maxTokens: 600,
      label: "command",
      timeoutMs: 20_000,
    });
    await limiter.settle(estimate, answer.costUsd).catch(() => undefined);
    const refs = refsOf(context);
    const checked = answer.calls.slice(0, MAX_ACTIONS * 2).map((c) => cleanAction(c, refs));
    const actions = checked.filter((a) => a !== null).slice(0, MAX_ACTIONS);
    const reply = answer.text.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
    return json({
      ok: true,
      reply: reply || (actions.length ? "" : "Sorry, I didn’t catch that. Try “make the kitchen bigger”."),
      actions,
      dropped: checked.length - actions.length,
      left: verdict.left,
    });
  } catch (error) {
    // The reason only: never what was said.
    console.error("command failed", error instanceof Error ? error.name : "error");
    await limiter.failed("command", device, ip, estimate, billOf(error)).catch(() => undefined);
    return fail("busy", "Couldn’t do that just now. Try again in a moment.", verdict.left + 1);
  }
}

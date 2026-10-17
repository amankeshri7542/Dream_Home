// Every /api/* request lands here (one Vercel function, rewritten by
// vercel.json). Routes are looked up by name; anything that changes state must
// come from our own pages. New routes (share links, plan reading, voice
// commands) are added to ROUTES.
import { handleCommand } from "./command";
import type { Deps } from "./context";
import { handleDesign } from "./design";
import { fail, sameSite, type Env } from "./http";
import { handleOg } from "./og";
import { handlePlanRead } from "./planRead";
import { handleShare } from "./share";

/** `params` are the path parts after the route name: /api/share/abc/image → ["abc", "image"]. */
type Handler = (request: Request, env: Env, deps: Deps, params: string[]) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  design: handleDesign,
  share: handleShare,
  og: handleOg,
  "plan-read": handlePlanRead,
  command: handleCommand,
};

/**
 * The route name: from `?__route=` (added by the vercel.json rewrite) or from
 * the path itself (`/api/design` → "design"), whichever the platform passes on.
 */
export function routeName(url: URL): string {
  const fromQuery = url.searchParams.get("__route");
  const raw = fromQuery ?? url.pathname.replace(/^\/api\/?/, "");
  return raw.replace(/^\/+|\/+$/g, "");
}

export async function route(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const [name, ...params] = routeName(new URL(request.url)).split("/");
  const handler = Object.hasOwn(ROUTES, name) ? ROUTES[name] : undefined;
  if (!handler) return fail("missing", "There’s nothing here.", undefined, 404);
  if (!sameSite(request, env)) return fail("forbidden", "This request must come from Dream Home.", undefined, 403);
  try {
    return await handler(request, env, deps, params);
  } catch (error) {
    console.error("route failed", name, error instanceof Error ? error.message : error);
    return fail("busy", "Something went wrong. Please try again.", undefined, 500);
  }
}

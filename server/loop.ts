// The viral loop in daily totals, for the owner only: homes shared, links
// opened, remixes. Plain counters per day and nothing about who: no ids, no
// addresses, no scripts in the page. A counter that can't be written is simply
// missed; sharing never waits on it or fails because of it.
//
//   GET /api/loop?days=14   (Authorization: Bearer $ADMIN_TOKEN)
import { kvFor, type Deps } from "./context";
import { fail, isAdmin, json, type Env } from "./http";
import type { KeyValue } from "./kv";

export type LoopEvent = "shared" | "opened" | "remixed";
const EVENTS: LoopEvent[] = ["shared", "opened", "remixed"];
const key = (day: string, event: LoopEvent) => `dh:v1:loop:${day}:${event}`;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const MAX_DAYS = 90;

/** Adds one to today's count. Never throws. */
export async function countLoop(kv: KeyValue, event: LoopEvent, now: Date = new Date()): Promise<void> {
  await kv.incr(key(dayOf(now), event)).catch(() => undefined);
}

export async function handleLoop(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (request.method !== "GET") return fail("invalid", "Use GET.", undefined, 405);
  if (!isAdmin(request, env)) return fail("forbidden", "Admins only.", undefined, 403);
  const kv = kvFor(env, deps);
  if (!kv) return fail("offline", "Sharing isn’t switched on yet.", undefined, 503);
  const asked = Number(new URL(request.url).searchParams.get("days"));
  const span = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_DAYS) : 14;
  const today = (deps.now ?? (() => new Date()))().getTime();
  const days = Array.from({ length: span }, (_, i) => dayOf(new Date(today - i * 86_400_000)));
  const counts = await kv.counts(...days.flatMap((day) => EVENTS.map((event) => key(day, event))));
  const rows = days.map((day, i) => ({
    day,
    shared: counts[i * 3],
    opened: counts[i * 3 + 1],
    remixed: counts[i * 3 + 2],
  }));
  const total = (field: LoopEvent) => rows.reduce((n, r) => n + r[field], 0);
  const shared = total("shared"),
    opened = total("opened"),
    remixed = total("remixed");
  return json({
    ok: true,
    days: rows,
    totals: { shared, opened, remixed },
    // What matters most: does each shared home bring in another?
    remixesPerShare: shared ? Math.round((remixed / shared) * 100) / 100 : null,
    opensPerShare: shared ? Math.round((opened / shared) * 100) / 100 : null,
  });
}

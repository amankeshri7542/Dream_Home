// Talks to /api/design. Every failure resolves to the built-in planner, so the
// homeowner always gets a home; `source` says who designed it.
import type { DesignResponse, HomeBrief, HomePlan, RoomBrief, RoomPlan } from "./brief";
import { FREE_HOME_DESIGNS, FREE_ROOM_MAKEOVERS } from "./brief";
import { plannerHomePlan, plannerRoomPlan } from "./planner";
import { sanitizeHomePlan, sanitizeRoomPlan } from "./schema";

const DEVICE_KEY = "dream-home:device";
const CREDITS_KEY = "dream-home:ai-credits";

/** A random id for this browser; it only counts free designs. */
export function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && /^[a-z0-9-]{16,64}$/.test(saved)) return saved;
    // randomUUID needs a secure context; a phone testing over the LAN has none.
    const id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return "device-anonymous-0000";
  }
}

export type Credits = { home: number; room: number; live: boolean };
export function savedCredits(): Credits {
  try {
    const raw = JSON.parse(localStorage.getItem(CREDITS_KEY) ?? "null");
    if (raw && Number.isInteger(raw.home) && Number.isInteger(raw.room))
      return { home: raw.home, room: raw.room, live: raw.live !== false };
  } catch {
    /* fall through */
  }
  return { home: FREE_HOME_DESIGNS, room: FREE_ROOM_MAKEOVERS, live: true };
}
function saveCredits(credits: Credits) {
  try {
    localStorage.setItem(CREDITS_KEY, JSON.stringify(credits));
  } catch {
    /* private mode: the counter just isn't remembered */
  }
}

/** Asks the server how many free uses are left (falls back to the last known count). */
export async function fetchCredits(): Promise<Credits> {
  try {
    const res = await fetch("/api/design", { headers: { "x-dream-device": deviceId() } });
    const body = await res.json();
    if (body?.ok && Number.isInteger(body.home) && Number.isInteger(body.room)) {
      const credits = { home: body.home, room: body.room, live: !!body.live };
      saveCredits(credits);
      return credits;
    }
    if (body?.ok) return { ...savedCredits(), live: !!body.live };
  } catch {
    /* offline or no server */
  }
  return { ...savedCredits(), live: false };
}

export type Designed<P> = {
  plan: P;
  source: "ai" | "planner";
  /** Why the planner stepped in, in plain words (null when the AI designed it). */
  why: null | "limit" | "busy" | "offline";
  credits: Credits;
};

/** The caller's signal plus a two-minute limit (works on older phone browsers too). */
export function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function ask<P>(
  kind: "home" | "room",
  brief: HomeBrief | RoomBrief,
  variant: number,
  signal?: AbortSignal,
): Promise<DesignResponse<P> | null> {
  const limit = withTimeout(signal, 120_000);
  try {
    const res = await fetch("/api/design", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dream-device": deviceId() },
      body: JSON.stringify({ kind, brief, variant }),
      signal: limit.signal,
    });
    const body = (await res.json()) as DesignResponse<P>;
    return body && typeof body === "object" && "ok" in body ? body : null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  } finally {
    limit.done();
  }
}

function settle<P>(kind: "home" | "room", answer: DesignResponse<P> | null, sanitize: (raw: unknown) => P, planner: () => P): Designed<P> {
  const credits = savedCredits();
  if (answer?.ok) {
    const next = { ...credits, [kind]: answer.left, live: true };
    saveCredits(next);
    return { plan: sanitize(answer.plan), source: "ai", why: null, credits: next };
  }
  const why = answer && answer.reason !== "invalid" ? answer.reason : "offline";
  const next = {
    ...credits,
    ...(answer && answer.left !== undefined ? { [kind]: answer.left } : {}),
    ...(why === "limit" ? { [kind]: 0 } : {}),
    live: why !== "offline",
  };
  saveCredits(next);
  return { plan: planner(), source: "planner", why, credits: next };
}

export async function designHome(brief: HomeBrief, variant = 0, signal?: AbortSignal): Promise<Designed<HomePlan>> {
  const answer = await ask<HomePlan>("home", brief, variant, signal);
  return settle("home", answer, sanitizeHomePlan, () => plannerHomePlan(brief, variant));
}

export async function designRoom(brief: RoomBrief, variant = 0, signal?: AbortSignal): Promise<Designed<RoomPlan>> {
  const answer = await ask<RoomPlan>("room", brief, variant, signal);
  return settle("room", answer, sanitizeRoomPlan, () => plannerRoomPlan(brief, variant));
}

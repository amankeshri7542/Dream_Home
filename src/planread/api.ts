// Talking to /api/plan-read. Every call has a timeout and turns failures into
// a friendly sentence; nothing here throws.
import { deviceId, withTimeout } from "../ai/client";
import type { PlanReading } from "./reading";

export type ReadFailure = { ok: false; reason: string; message: string };
const OFFLINE: ReadFailure = { ok: false, reason: "offline", message: "You seem to be offline. You can draw it yourself on the photo." };

/** Is plan reading on, and how many free readings this device has left (null: unknown). */
export async function readingsLeft(): Promise<{ live: boolean; left: number | null }> {
  const limit = withTimeout(undefined, 8_000);
  try {
    const res = await fetch("/api/plan-read", { headers: { "x-dream-device": deviceId() }, signal: limit.signal });
    const body = (await res.json()) as { ok?: boolean; live?: boolean; left?: number | null };
    return { live: !!body.live, left: typeof body.left === "number" ? body.left : null };
  } catch {
    return { live: false, left: null };
  } finally {
    limit.done();
  }
}

/** Sends the photo; the answer is the reading, or why there isn't one. */
export async function readPlan(
  photo: Blob,
  hint: { plot: string; road: "top" | "bottom" | "left" | "right" },
  signal?: AbortSignal,
): Promise<{ ok: true; reading: PlanReading; left: number } | ReadFailure> {
  const limit = withTimeout(signal, 70_000);
  try {
    const res = await fetch(`/api/plan-read?plot=${encodeURIComponent(hint.plot)}&road=${hint.road}`, {
      method: "POST",
      body: photo,
      headers: { "content-type": "image/jpeg", "x-dream-device": deviceId() },
      signal: limit.signal,
    });
    const body = (await res.json().catch(() => null)) as ({ ok: boolean } & Record<string, unknown>) | null;
    if (body?.ok && body.reading) return body as { ok: true; reading: PlanReading; left: number };
    if (body && typeof body.message === "string") return { ok: false, reason: String(body.reason), message: body.message };
    return { ok: false, reason: "busy", message: "Couldn’t read the plan this time." };
  } catch {
    return signal?.aborted ? { ok: false, reason: "cancelled", message: "" } : OFFLINE;
  } finally {
    limit.done();
  }
}

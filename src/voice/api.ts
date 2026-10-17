// Talking to /api/command. Every call has a timeout and turns failures into a
// friendly sentence; nothing here throws. The answer's actions are checked
// again here against the home that was described.
import { deviceId, withTimeout } from "../ai/client";
import { MAX_ACTIONS, cleanAction, refsOf, type VoiceAction, type VoiceContext } from "./tools";

export type CommandFailure = { ok: false; reason: string; message: string };

/** Is the helper on, and how many requests this device has left today (null: unknown). */
export async function commandsLeft(): Promise<{ live: boolean; left: number | null }> {
  const limit = withTimeout(undefined, 8_000);
  try {
    const res = await fetch("/api/command", { headers: { "x-dream-device": deviceId() }, signal: limit.signal });
    const body = (await res.json()) as { live?: boolean; left?: number | null };
    return { live: !!body.live, left: typeof body.left === "number" ? body.left : null };
  } catch {
    return { live: false, left: null };
  } finally {
    limit.done();
  }
}

export async function sendCommand(
  text: string,
  lang: "en" | "hi",
  context: VoiceContext,
  signal?: AbortSignal,
): Promise<{ ok: true; reply: string; actions: VoiceAction[]; left: number } | CommandFailure> {
  const limit = withTimeout(signal, 25_000);
  try {
    const res = await fetch("/api/command", {
      method: "POST",
      body: JSON.stringify({ text, lang, context }),
      headers: { "content-type": "application/json", "x-dream-device": deviceId() },
      signal: limit.signal,
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.ok === true) {
      const refs = refsOf(context);
      const actions = (Array.isArray(body.actions) ? body.actions : [])
        .map((a: { tool?: unknown; input?: unknown }) => cleanAction({ name: a?.tool, input: a?.input }, refs))
        .filter((a) => a !== null)
        .slice(0, MAX_ACTIONS);
      return { ok: true, reply: typeof body.reply === "string" ? body.reply : "", actions, left: Number(body.left) || 0 };
    }
    if (body && typeof body.message === "string") return { ok: false, reason: String(body.reason), message: body.message };
    return { ok: false, reason: "busy", message: "Couldn’t do that just now. Try again in a moment." };
  } catch {
    return signal?.aborted
      ? { ok: false, reason: "cancelled", message: "" }
      : { ok: false, reason: "offline", message: "You seem to be offline. Undo, night, day and opening rooms still work." };
  } finally {
    limit.done();
  }
}

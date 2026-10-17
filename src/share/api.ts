// Talking to /api/share. Every call has a timeout and turns failures into a
// friendly sentence; nothing here throws.
import { deviceId, withTimeout } from "../ai/client";
import type { Project } from "../domain/types";

export type Failure = { ok: false; reason: string; message: string };
export type SharedMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  appVersion: string;
  image: boolean;
  remixOf?: { id: string; name: string };
};

const OFFLINE: Failure = {
  ok: false,
  reason: "offline",
  message: "You seem to be offline. Try again when you’re connected.",
};

async function call<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
  ms = 20_000,
): Promise<({ ok: true } & T) | Failure> {
  const limit = withTimeout(undefined, ms);
  try {
    const res = await fetch(path, {
      ...init,
      signal: limit.signal,
      headers: {
        "x-dream-device": deviceId(),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
    const body = (await res.json().catch(() => null)) as ({ ok: boolean } & Record<string, unknown>) | null;
    if (body && typeof body.ok === "boolean") return body as ({ ok: true } & T) | Failure;
    return { ok: false, reason: "busy", message: "Sharing didn’t answer properly. Please try again." };
  } catch {
    return OFFLINE;
  } finally {
    limit.done();
  }
}

export type ShareOptions = { showName: boolean; showCity: boolean };
const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

export const createShare = (project: Project, options: ShareOptions) =>
  call<{ id: string; editToken: string; updatedAt: number }>("/api/share", { method: "POST", ...json({ project, ...options }) });

export const updateShare = (id: string, token: string, project: Project, options: ShareOptions) =>
  call<{ updatedAt: number }>(`/api/share/${id}`, { method: "PUT", token, ...json({ project, ...options }) });

export const deleteShare = (id: string, token: string) => call(`/api/share/${id}`, { method: "DELETE", token });

export const uploadPoster = (id: string, token: string, jpeg: Blob) =>
  call(`/api/share/${id}/image`, { method: "PUT", token, body: jpeg, headers: { "Content-Type": "image/jpeg" } }, 30_000);

export const shareStats = (id: string, token: string) =>
  call<{ views: number; remixes: number; hidden: boolean }>(`/api/share/${id}/stats`, { token });

export const fetchShare = (id: string) => call<{ meta: SharedMeta; project: unknown }>(`/api/share/${id}`);

export const countView = (id: string) => call(`/api/share/${id}/view`, { method: "POST" });
export const countRemix = (id: string) => call(`/api/share/${id}/remix`, { method: "POST" });
export const reportShare = (id: string) => call(`/api/share/${id}/report`, { method: "POST" });

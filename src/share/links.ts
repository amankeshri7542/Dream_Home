// The links this device has shared, by My homes id. The edit token is the
// only key to change or delete a shared home, so it never leaves this device.
import type { Project } from "../domain/types";

export const LINKS_KEY = "dream-home.shares.v1";
export type ShareLink = {
  id: string;
  token: string;
  updatedAt: number;
  showName: boolean;
  showCity: boolean;
  /** A fingerprint of the home as last shared, to offer "Update link". */
  fingerprint: string;
};

function all(storage: Storage | undefined = globalThis.localStorage): Record<string, ShareLink> {
  try {
    const raw = JSON.parse(storage?.getItem(LINKS_KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}
export function linkFor(homeId: string, storage?: Storage): ShareLink | null {
  const link = all(storage)[homeId];
  return link && typeof link.id === "string" && typeof link.token === "string" ? link : null;
}
export function saveLink(homeId: string, link: ShareLink, storage: Storage | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(LINKS_KEY, JSON.stringify({ ...all(storage), [homeId]: link }));
  } catch {
    /* The link still works; this device just won't remember it. */
  }
}
export function forgetLink(homeId: string, storage: Storage | undefined = globalThis.localStorage) {
  const links = all(storage);
  delete links[homeId];
  try {
    storage?.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    /* Nothing to undo. */
  }
}

export const shareUrl = (id: string, origin = globalThis.location?.origin ?? "") => `${origin}/h/${id}`;

/** A quick fingerprint (FNV-1a) of a home, to tell whether it changed since sharing. */
export function fingerprint(project: Project): string {
  const text = JSON.stringify(project);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

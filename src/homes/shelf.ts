// "My homes": the list of homes kept on this device (up to 12). The list is a
// small index in localStorage; each home's full copy lives in IndexedDB (see
// store.ts), because a dozen homes would overflow localStorage. The home being
// edited is also saved, as before, in `dream-home.project.v2`.
import { projectStats } from "../domain/model";
import type { Project } from "../domain/types";

export const SHELF_KEY = "dream-home.homes.v1";
/** Where the open home is saved (unchanged since v2). */
export const PROJECT_KEY = "dream-home.project.v2";
export const MAX_HOMES = 12;

export type HomeEntry = {
  id: string;
  name: string;
  /** Milliseconds since 1970. */
  updatedAt: number;
  bedrooms: number;
  floors: number;
};
export type Shelf = { activeId: string; homes: HomeEntry[] };

const ID = /^home-[a-z0-9]{8,32}$/;
export function newHomeId(random: () => number = Math.random): string {
  let id = "home-";
  for (let i = 0; i < 12; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return id;
}

export function entryFor(id: string, project: Project, now: number): HomeEntry {
  const stats = projectStats(project);
  return {
    id,
    name: project.name.slice(0, 80) || "My home",
    updatedAt: now,
    bedrooms: stats.bedrooms,
    floors: project.floors.length,
  };
}

function normalize(raw: unknown): Shelf | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { activeId?: unknown; homes?: unknown };
  if (!Array.isArray(r.homes)) return null;
  const seen = new Set<string>();
  const homes: HomeEntry[] = [];
  for (const h of r.homes.slice(0, MAX_HOMES)) {
    if (!h || typeof h !== "object") continue;
    const e = h as Record<string, unknown>;
    if (typeof e.id !== "string" || !ID.test(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    homes.push({
      id: e.id,
      name: typeof e.name === "string" && e.name.trim() ? e.name.slice(0, 80) : "My home",
      updatedAt: Number.isFinite(e.updatedAt) ? (e.updatedAt as number) : 0,
      bedrooms: Number.isInteger(e.bedrooms) ? (e.bedrooms as number) : 0,
      floors: Number.isInteger(e.floors) ? (e.floors as number) : 1,
    });
  }
  if (!homes.length) return null;
  const activeId = typeof r.activeId === "string" && seen.has(r.activeId) ? r.activeId : homes[0].id;
  return { activeId, homes };
}

/**
 * Reads the shelf. A device without one (everyone before My homes existed)
 * gets a shelf holding just the home it already has.
 */
export function loadShelf(project: Project, now: number, storage: Storage | undefined = globalThis.localStorage): Shelf {
  let raw: unknown = null;
  try {
    raw = JSON.parse(storage?.getItem(SHELF_KEY) ?? "null");
  } catch {
    raw = null;
  }
  const shelf = normalize(raw);
  if (shelf) return shelf;
  const id = newHomeId();
  return { activeId: id, homes: [entryFor(id, project, now)] };
}

export function saveShelf(shelf: Shelf, storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(SHELF_KEY, JSON.stringify(shelf));
    return true;
  } catch {
    return false;
  }
}

/** The open home changed: refresh its name, size and time, and move it to the top. */
export function touchActive(shelf: Shelf, project: Project, now: number): Shelf {
  const entry = entryFor(shelf.activeId, project, now);
  return { ...shelf, homes: [entry, ...shelf.homes.filter((h) => h.id !== shelf.activeId)] };
}

/** Adds a new home at the top and makes it the open one. */
export function addHome(shelf: Shelf, id: string, project: Project, now: number): Shelf {
  return { activeId: id, homes: [entryFor(id, project, now), ...shelf.homes.filter((h) => h.id !== id)] };
}

export function switchTo(shelf: Shelf, id: string): Shelf {
  return shelf.homes.some((h) => h.id === id) ? { ...shelf, activeId: id } : shelf;
}

/** Removes a home that isn't open. */
export function removeHome(shelf: Shelf, id: string): Shelf {
  if (id === shelf.activeId) return shelf;
  return { ...shelf, homes: shelf.homes.filter((h) => h.id !== id) };
}

export const isFull = (shelf: Shelf) => shelf.homes.length >= MAX_HOMES;

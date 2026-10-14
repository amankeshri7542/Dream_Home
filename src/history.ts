// Pure undo/redo history. Each transition remembers a label and the selection it
// concerned so undo/redo can explain and re-select what changed.
import type { Project } from "./domain/types";

export type HistoryMeta = {
  label?: string;
  /** Opaque selection payload owned by the editor. */
  selection?: unknown;
  /** Consecutive edits with the same key inside the window merge into one step. */
  coalesceKey?: string;
};
type Entry = { project: Project; meta?: HistoryMeta };
export type History = {
  past: Entry[];
  present: Project;
  future: Entry[];
  revision: number;
  lastKey?: string;
  lastAt?: number;
};
export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 1200;

export const createHistory = (present: Project): History => ({
  past: [],
  present,
  future: [],
  revision: 0,
});

export function pushHistory(
  h: History,
  project: Project,
  meta: HistoryMeta | undefined,
  now: number,
): History {
  if (JSON.stringify(h.present) === JSON.stringify(project)) return h;
  const key = meta?.coalesceKey;
  if (
    key &&
    key === h.lastKey &&
    h.lastAt !== undefined &&
    now - h.lastAt < COALESCE_MS &&
    h.past.length
  )
    return {
      ...h,
      present: project,
      future: [],
      revision: h.revision + 1,
      lastAt: now,
    };
  return {
    past: [...h.past.slice(-(HISTORY_LIMIT - 1)), { project: h.present, meta }],
    present: project,
    future: [],
    revision: h.revision + 1,
    lastKey: key,
    lastAt: now,
  };
}

export function undoHistory(h: History): { h: History; restored?: HistoryMeta } {
  const last = h.past.at(-1);
  if (!last) return { h };
  return {
    h: {
      past: h.past.slice(0, -1),
      present: last.project,
      future: [{ project: h.present, meta: last.meta }, ...h.future],
      revision: h.revision + 1,
    },
    restored: last.meta,
  };
}

export function redoHistory(h: History): { h: History; restored?: HistoryMeta } {
  const next = h.future[0];
  if (!next) return { h };
  return {
    h: {
      past: [...h.past, { project: h.present, meta: next.meta }],
      present: next.project,
      future: h.future.slice(1),
      revision: h.revision + 1,
    },
    restored: next.meta,
  };
}

export const undoLabel = (h: History) => h.past.at(-1)?.meta?.label;
export const redoLabel = (h: History) => h.future[0]?.meta?.label;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createHistory,
  pushHistory,
  redoHistory,
  redoLabel,
  undoHistory,
  undoLabel,
  type History,
  type HistoryMeta,
} from "./history";
import { createPreset, parseProject } from "./domain/model";
import { createStarter } from "./domain/starters";
import type { EditResult, Project } from "./domain/types";
import {
  addHome,
  isFull,
  loadShelf,
  newHomeId,
  removeHome,
  saveShelf,
  switchTo,
  touchActive,
  type Shelf,
} from "./homes/shelf";
import { deviceHomeStore } from "./homes/store";

/** What happened when a home was created, opened or removed. */
export type HomeOutcome = "ok" | "full" | "unsupported" | "missing" | "failed" | "open";
const KEY = "dream-home.project.v2";
const LEGACY_KEY = "dream-home.project.v1";
function load() {
  let stored: string | null = null;
  try {
    // A damaged current save must never be replaced by an older, stale project.
    // The original v1 file stays untouched as a recovery copy after migration.
    stored = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (stored !== null)
      return {
        project: parseProject(stored),
        saved: true,
        error: "",
        recovery: null,
      };
  } catch {
    return {
      project: sample(),
      saved: true,
      error: "saved-file-unreadable",
      recovery: stored,
    };
  }
  return { project: sample(), saved: false, error: "", recovery: null };
}
function sample() {
  const result = createStarter(
    {
      widthCm: 914,
      depthCm: 1524,
      road: "south",
      marginCm: 60,
      bedrooms: 2,
      floors: 1,
    },
    "family",
  );
  return result.ok ? result.project : createPreset("compact");
}
export function useProject() {
  const [boot] = useState(load);
  const historyRef = useRef<History>(createHistory(boot.project));
  const [history, setHistory] = useState<History>(historyRef.current);
  const [error, setError] = useState(boot.error);
  const [canSave, setCanSave] = useState(!boot.error);
  const [saved, setSaved] = useState(!boot.error);
  const store = useMemo(deviceHomeStore, []);
  const [shelf, setShelfState] = useState<Shelf>(() => loadShelf(boot.project, Date.now()));
  const shelfRef = useRef(shelf);
  const setShelf = useCallback((next: Shelf) => {
    shelfRef.current = next;
    setShelfState(next);
    saveShelf(next);
  }, []);
  /**
   * A first visit's untouched starter home: picking a starting home replaces
   * it instead of filling My homes with copies nobody made.
   */
  const pristine = useRef(!boot.saved);
  const write = useCallback((next: History) => {
    historyRef.current = next;
    pristine.current = false;
    setHistory(next);
  }, []);
  const commit = useCallback(
    (project: Project, meta?: HistoryMeta) => {
      write(pushHistory(historyRef.current, project, meta, Date.now()));
      setCanSave(true);
      setError("");
    },
    [write],
  );
  const apply = useCallback(
    (result: EditResult, meta?: HistoryMeta) => {
      if (result.ok) {
        commit(result.project, meta);
        return true;
      }
      setError(result.error);
      return false;
    },
    [commit],
  );
  /** Starts a fresh history at `project` (first-run starting homes). */
  const resetHistory = useCallback(
    (project: Project) => {
      write({ ...createHistory(project), revision: historyRef.current.revision + 1 });
      setCanSave(true);
      setError("");
    },
    [write],
  );
  const undo = useCallback(() => {
    const { h, restored } = undoHistory(historyRef.current);
    if (h !== historyRef.current) write(h);
    setError("");
    return restored;
  }, [write]);
  const redo = useCallback(() => {
    const { h, restored } = redoHistory(historyRef.current);
    if (h !== historyRef.current) write(h);
    setError("");
    return restored;
  }, [write]);
  // The open home saves to localStorage on every change, as it always has; its
  // My homes copy follows shortly after (and at once before switching homes).
  const copyTimer = useRef(0);
  const lastShelved = useRef<Project | null>(null);
  const shelveActive = useCallback(async () => {
    window.clearTimeout(copyTimer.current);
    const present = historyRef.current.present;
    if (!store.persistent || lastShelved.current === present) return;
    await store.put(shelfRef.current.activeId, JSON.stringify(present));
    lastShelved.current = present;
  }, [store]);
  useEffect(() => {
    if (!canSave) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(history.present));
      setSaved(true);
    } catch {
      setSaved(false);
      setError("storage-unavailable");
    }
    setShelf(touchActive(shelfRef.current, history.present, Date.now()));
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => void shelveActive().catch(() => undefined), 600);
  }, [history.present, canSave, setShelf, shelveActive]);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  /** A new home on the shelf, opened with a fresh history. */
  const createHome = useCallback(
    async (project: Project): Promise<HomeOutcome> => {
      if (pristine.current) {
        resetHistory(project);
        return "ok";
      }
      if (!store.persistent) return "unsupported";
      if (isFull(shelfRef.current)) return "full";
      try {
        await shelveActive();
        const id = newHomeId();
        await store.put(id, JSON.stringify(project));
        lastShelved.current = project;
        setShelf(addHome(shelfRef.current, id, project, Date.now()));
        resetHistory(project);
        return "ok";
      } catch {
        return "failed";
      }
    },
    [resetHistory, setShelf, shelveActive, store],
  );
  const openHome = useCallback(
    async (id: string): Promise<HomeOutcome> => {
      if (id === shelfRef.current.activeId) return "ok";
      try {
        await shelveActive();
        const json = await store.get(id);
        if (!json) return "missing";
        const project = parseProject(json);
        lastShelved.current = project;
        setShelf(switchTo(shelfRef.current, id));
        resetHistory(project);
        return "ok";
      } catch {
        return "failed";
      }
    },
    [resetHistory, setShelf, shelveActive, store],
  );
  const deleteHome = useCallback(
    async (id: string): Promise<HomeOutcome> => {
      if (id === shelfRef.current.activeId) return "open";
      try {
        await store.remove(id);
        setShelf(removeHome(shelfRef.current, id));
        return "ok";
      } catch {
        return "failed";
      }
    },
    [setShelf, store],
  );
  /** A home's saved copy, for previews (the open one comes from memory). */
  const readHome = useCallback(
    async (id: string): Promise<Project | null> => {
      if (id === shelfRef.current.activeId) return historyRef.current.present;
      try {
        const json = await store.get(id);
        return json ? parseProject(json) : null;
      } catch {
        return null;
      }
    },
    [store],
  );
  return {
    project: history.present,
    revision: history.revision,
    commit,
    apply,
    resetHistory,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    undoLabel: undoLabel(history),
    redoLabel: redoLabel(history),
    error,
    setError,
    saved,
    hasSavedProject: boot.saved,
    recovery: boot.recovery,
    homes: {
      list: shelf.homes,
      activeId: shelf.activeId,
      persistent: store.persistent,
      full: isFull(shelf),
      create: createHome,
      open: openHome,
      remove: deleteHome,
      read: readHome,
    },
  };
}

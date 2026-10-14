import { useCallback, useEffect, useRef, useState } from "react";
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
  const write = useCallback((next: History) => {
    historyRef.current = next;
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
  useEffect(() => {
    if (!canSave) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(history.present));
      setSaved(true);
    } catch {
      setSaved(false);
      setError("storage-unavailable");
    }
  }, [history.present, canSave]);
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
  };
}

import { useCallback, useEffect, useState } from "react";
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
  const [history, setHistory] = useState<{
    past: Project[];
    present: Project;
    future: Project[];
  }>({ past: [], present: boot.project, future: [] });
  const [error, setError] = useState(boot.error);
  const [canSave, setCanSave] = useState(!boot.error);
  const [saved, setSaved] = useState(!boot.error);
  const commit = useCallback((project: Project) => {
    setHistory((h) =>
      JSON.stringify(h.present) === JSON.stringify(project)
        ? h
        : {
            past: [...h.past.slice(-49), h.present],
            present: project,
            future: [],
          },
    );
    setCanSave(true);
    setError("");
  }, []);
  const apply = useCallback(
    (result: EditResult) => {
      if (result.ok) {
        commit(result.project);
        return true;
      }
      setError(result.error);
      return false;
    },
    [commit],
  );
  const undo = useCallback(() => {
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future],
          }
        : h,
    );
    setError("");
  }, []);
  const redo = useCallback(() => {
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
    setError("");
  }, []);
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
    commit,
    apply,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
    error,
    setError,
    saved,
    hasSavedProject: boot.saved,
    recovery: boot.recovery,
  };
}

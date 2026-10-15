import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { useProject } from "../useProject";
import type { HistoryMeta } from "../history";
import type { Unit } from "../domain/display";
import type {
  ComponentRef,
  EditIssue,
  EditResult,
  Floor,
  Project,
} from "../domain/types";
import {
  DEFAULT_VIEW,
  editorReducer,
  initialEditorState,
  type EditorAction,
  type EditorState,
} from "./state";
import {
  loadPreferences,
  savePreferences,
  type Preferences,
} from "./preferences";
import {
  resolveSelection,
  targetForId,
  type ResolvedSelection,
} from "./selection";
import { EDIT_MODES, type SelectionTarget } from "./types";

export type RunOptions = {
  /** Select this after a successful edit (`undefined` keeps the selection). */
  select?: SelectionTarget | null;
  /** Select the result's `focusId` when the command reports one. */
  selectFocus?: boolean;
  notice?: string;
  coalesceKey?: string;
  /** Announce failures as a notification instead of an inline error. */
  quietError?: boolean;
};

export type EditorApi = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  project: Project;
  revision: number;
  activeFloor: Floor;
  selected: ResolvedSelection | null;
  unit: Unit;
  prefs: Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
  run: (result: EditResult, label: string, opts?: RunOptions) => boolean;
  commit: (project: Project, label: string, opts?: RunOptions) => void;
  /** Replaces the document and starts a fresh undo history (first-run homes). */
  startFresh: (project: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  error: string;
  setError: (error: string) => void;
  saved: boolean;
  hasSavedProject: boolean;
  recovery: string | null;
  select: (target: SelectionTarget | null, origin?: "canvas" | "list") => void;
  notify: (text: string, tone?: "info" | "success" | "error") => void;
};

const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error("useEditor must be used inside EditorProvider");
  return api;
}

/** Child-friendly wording for a blocked edit, naming both rooms involved. */
export function friendlyIssue(project: Project, issue: EditIssue): string {
  const nameOf = (ref?: ComponentRef) => {
    if (!ref) return null;
    for (const f of project.floors) {
      const room = f.rooms.find((r) => r.id === ref.id);
      if (room) return room.name;
      if (f.balconies.some((b) => b.id === ref.id))
        return f.elevation > 0 ? "the balcony" : "the veranda";
    }
    const v = project.verticalSpaces.find((x) => x.id === ref.id);
    if (v) return v.kind === "stairs" ? "the stairs" : "the courtyard";
    const unit = project.units.find((u) => u.id === ref.id);
    return unit ? unit.name : null;
  };
  const source = nameOf(issue.source);
  const blocker = nameOf(issue.blockers[0]);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  switch (issue.code) {
    case "room-overlap":
      if (source && blocker)
        return `${cap(source)} bumps into ${blocker}. Try a smaller size, another spot, or set ${blocker} aside.`;
      break;
    case "room-outside-floor":
      if (source)
        return `${cap(source)} would poke outside the house. Try another spot, or grow the house in My plot.`;
      break;
    case "room-in-void":
      if (source)
        return `${cap(source)} would cover ${blocker ?? "the stairs or courtyard"}. Try another spot.`;
      break;
    case "room-outside-unit":
    case "room-in-private-unit":
      if (source) return `${cap(source)} has to stay inside its own home. Try another spot.`;
      break;
  }
  return friendlyError(issue.message);
}

export function friendlyError(error: string) {
  if (error === "saved-file-unreadable")
    return "Your saved file could not be opened. It has been kept safe. Use “Recover saved file” in More before making changes.";
  if (error === "storage-unavailable")
    return "Saving is unavailable on this device. Download your project file to keep your changes.";
  // Only the room-placement message; furniture and garden messages say it better.
  if (/no free space for this room/i.test(error))
    return "This room needs more space. Set another room aside in the tray, try a smaller size, or expand the building area.";
  return error;
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest("input,select,textarea,dialog,[contenteditable=true]");

export function EditorProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<EditorState>;
}) {
  const doc = useProject();
  const [prefs, setPrefsState] = useState(loadPreferences);
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    initialEditorState({
      quality: prefs.quality,
      ...(prefs.streetLife ? {} : { view: { ...DEFAULT_VIEW, streetLife: false } }),
      ...initial,
    }),
  );
  const { project } = doc;
  const selected = useMemo(
    () => resolveSelection(project, state.selection),
    [project, state.selection],
  );
  const activeFloor = useMemo(() => {
    const byView =
      state.view.floor !== "all"
        ? project.floors.find((f) => f.id === state.view.floor)
        : undefined;
    return byView ?? selected?.floor ?? project.floors[0];
  }, [project, state.view.floor, selected]);

  const setPrefs = useCallback((patch: Partial<Preferences>) => {
    setPrefsState((p) => ({ ...p, ...patch }));
    savePreferences(patch);
  }, []);
  useEffect(() => {
    document.documentElement.lang = "en";
    savePreferences({ language: "en", unit: prefs.unit });
  }, [prefs.unit]);

  const notify = useCallback(
    (text: string, tone: "info" | "success" | "error" = "info") =>
      dispatch({ type: "notify", text, tone }),
    [],
  );
  const select = useCallback(
    (target: SelectionTarget | null, origin?: "canvas" | "list") =>
      dispatch({ type: "select", target, origin }),
    [],
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const run = useCallback(
    (result: EditResult, label: string, opts: RunOptions = {}) => {
      const meta: HistoryMeta = {
        label,
        selection: stateRef.current.selection,
        ...(opts.coalesceKey ? { coalesceKey: opts.coalesceKey } : {}),
      };
      if (!doc.apply(result, meta)) {
        if (!result.ok) {
          const issue = result.issues?.[0];
          const text = issue
            ? friendlyIssue(doc.project, issue)
            : friendlyError(result.error);
          if (issue?.blockers.length)
            dispatch({ type: "flash", ids: issue.blockers.map((b) => b.id) });
          if (opts.quietError) {
            doc.setError("");
            dispatch({ type: "notify", text, tone: "error" });
          } else doc.setError(text);
        }
        return false;
      }
      if (result.ok) {
        if (opts.select !== undefined)
          dispatch({ type: "select", target: opts.select, origin: "list" });
        else if (opts.selectFocus && result.focusId) {
          const target = targetForId(result.project, result.focusId);
          if (target) dispatch({ type: "select", target });
        }
        if (result.notices?.length)
          dispatch({
            type: "notify",
            text: result.notices.map((n) => n.message).join(" "),
            tone: "info",
            undo: true,
          });
        else if (opts.notice)
          dispatch({ type: "notify", text: opts.notice, tone: "success" });
      }
      return true;
    },
    [doc],
  );
  const commit = useCallback(
    (next: Project, label: string, opts: RunOptions = {}) => {
      run({ ok: true, project: next }, label, opts);
    },
    [run],
  );
  const restore = useCallback(
    (meta: HistoryMeta | undefined, verb: "Undid" | "Redid") => {
      if (!meta) return;
      const target = meta.selection as SelectionTarget | null | undefined;
      if (target) dispatch({ type: "select", target, origin: "canvas" });
      if (meta.label)
        dispatch({ type: "notify", text: `${verb}: ${meta.label}`, tone: "info" });
    },
    [],
  );
  const undo = useCallback(
    () => restore(doc.undo(), "Undid"),
    [doc, restore],
  );
  const redo = useCallback(
    () => restore(doc.redo(), "Redid"),
    [doc, restore],
  );

  // Drop selections that no longer exist (undo, removal, floor changes).
  useEffect(() => {
    if (state.selection && !resolveSelection(project, state.selection))
      dispatch({ type: "select", target: null });
    if (
      state.view.floor !== "all" &&
      !project.floors.some((f) => f.id === state.view.floor)
    )
      dispatch({ type: "choose-floor", floor: "all" });
    if (
      state.tray.selected &&
      !project.stagedRooms?.some((s) => s.room.id === state.tray.selected)
    )
      dispatch({ type: "tray-select", id: null });
  }, [project, state.selection, state.view.floor, state.tray.selected]);

  useEffect(() => {
    if (!state.flash.length) return;
    const timer = window.setTimeout(() => dispatch({ type: "flash", ids: [] }), 1600);
    return () => window.clearTimeout(timer);
  }, [state.flash]);
  // Every message fades on its own, so none sits over the home for long;
  // explanations of a refusal and Undo offers stay a little longer.
  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "dismiss-notice" }),
      state.notice.tone === "error" ? 9000 : state.notice.undo ? 6000 : 3500,
    );
    return () => window.clearTimeout(timer);
  }, [state.notice]);

  useEffect(() => {
    if (prefs.quality !== state.quality) setPrefs({ quality: state.quality });
  }, [state.quality, prefs.quality, setPrefs]);

  // Global keyboard shortcuts. Canvas-specific keys live on the canvas itself.
  const api = useRef({ undo, redo });
  api.current = { undo, redo };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (key === "z" || key === "y")) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) api.current.redo();
        else api.current.undo();
        return;
      }
      if (e.key === "Escape") {
        dispatch({ type: "escape" });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!loadPreferences().singleKeyShortcuts) return;
      const s = stateRef.current;
      if (e.key === "?") dispatch({ type: "overlay", overlay: "shortcuts" });
      else if (/^[1-5]$/.test(e.key))
        dispatch({ type: "set-mode", mode: EDIT_MODES[Number(e.key) - 1] });
      else if (key === "p" && s.mode !== "explore")
        dispatch({ type: "lens", open: !s.lens });
      else if (key === "h") dispatch({ type: "chrome", hidden: !s.chromeHidden });
      else if (key === "l")
        dispatch({ type: "view", patch: { labels: !s.view.labels } });
      else if (key === "f" && !(e.target instanceof HTMLCanvasElement))
        dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "keep" } });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const value: EditorApi = {
    state,
    dispatch,
    project,
    revision: doc.revision,
    activeFloor,
    selected,
    unit: prefs.unit,
    prefs,
    setPrefs,
    run,
    commit,
    startFresh: (next: Project) => {
      doc.resetHistory(next);
      dispatch({ type: "select", target: null });
    },
    undo,
    redo,
    canUndo: doc.canUndo,
    canRedo: doc.canRedo,
    undoLabel: doc.undoLabel,
    redoLabel: doc.redoLabel,
    error: doc.error,
    setError: doc.setError,
    saved: doc.saved,
    hasSavedProject: doc.hasSavedProject,
    recovery: doc.recovery,
    select,
    notify,
  };
  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

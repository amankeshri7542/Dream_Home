// The editor controller: a pure reducer owning all transient UI state.
// `useProject` remains the only owner of the document and its history.
import type { SceneView } from "../scene/types";
import {
  PICKABLE,
  type CameraCommand,
  type EditorMode,
  type ExploreView,
  type QualitySetting,
  type SelectionTarget,
} from "./types";

export type Panel =
  | "rooms"
  | "plot"
  | "tray"
  | "catalog"
  | "style"
  | "garden"
  | "site"
  | null;
export type SheetSnap = "hidden" | "peek" | "medium" | "expanded";
export type Tool = "select" | "move" | "resize";
export type Overlay =
  | "start"
  | "share"
  | "more"
  | "help"
  | "shortcuts"
  | "photo"
  | null;
export type Notice = {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
  undo?: boolean;
};
export type Confirm = {
  title: string;
  body: string;
  confirmLabel: string;
  /** The safe alternative (e.g. "Set aside instead"); focused by default. */
  safeLabel?: string;
  action: string;
  safeAction?: string;
} | null;

export type EditorState = {
  mode: EditorMode;
  lastEditMode: Exclude<EditorMode, "explore">;
  tool: Tool;
  selection: SelectionTarget | null;
  panel: Panel;
  /** A room the Add space catalog should open on (from checklist hints). */
  catalogPick: string | null;
  sheet: SheetSnap;
  overlay: Overlay;
  viewOptions: boolean;
  lens: boolean;
  view: SceneView;
  camera: CameraCommand | null;
  cameraSeq: number;
  hour: number;
  explore: ExploreView;
  quality: QualitySetting;
  chromeHidden: boolean;
  notice: Notice | null;
  noticeSeq: number;
  confirm: Confirm;
  tray: { selected: string | null; unit: string };
  /** Component ids briefly outlined in red after a blocked edit. */
  flash: string[];
};

export const DEFAULT_VIEW: SceneView = {
  floor: "all",
  stage: 4,
  cutaway: true,
  walls: true,
  openings: true,
  landscape: true,
  labels: true,
  furnishings: true,
  roof: false,
  resetKey: 0,
};
export const BUILD_HOUR = 10.5;
export const GOLDEN_HOUR = 17.25;

export function initialEditorState(
  patch: Partial<EditorState> = {},
): EditorState {
  return {
    mode: "build",
    lastEditMode: "build",
    tool: "select",
    selection: null,
    panel: null,
    catalogPick: null,
    sheet: "hidden",
    overlay: null,
    viewOptions: false,
    lens: false,
    view: DEFAULT_VIEW,
    camera: null,
    cameraSeq: 0,
    hour: BUILD_HOUR,
    explore: "orbit",
    quality: "auto",
    chromeHidden: false,
    notice: null,
    noticeSeq: 0,
    confirm: null,
    tray: { selected: null, unit: "auto" },
    flash: [],
    ...patch,
  };
}

type CameraIntent = CameraCommand extends infer C
  ? C extends { id: number }
    ? Omit<C, "id">
    : never
  : never;
export type EditorAction =
  | {
      type: "select";
      target: SelectionTarget | null;
      origin?: "canvas" | "list" | "history" | "edit";
    }
  | { type: "set-mode"; mode: EditorMode }
  /** `lens` (default true) opens the plan lens alongside a transform tool. */
  | { type: "set-tool"; tool: Tool; lens?: boolean }
  | { type: "open-panel"; panel: Panel; pick?: string }
  | { type: "close-panel" }
  | { type: "sheet"; snap: SheetSnap }
  | { type: "overlay"; overlay: Overlay }
  | { type: "view-options"; open: boolean }
  | { type: "lens"; open: boolean }
  | { type: "view"; patch: Partial<SceneView> }
  | { type: "choose-floor"; floor: string | "all" }
  | { type: "camera"; command: CameraIntent }
  | { type: "hour"; hour: number }
  | { type: "explore"; view: ExploreView }
  | { type: "quality"; quality: QualitySetting }
  | { type: "chrome"; hidden: boolean }
  | { type: "notify"; text: string; tone?: Notice["tone"]; undo?: boolean }
  | { type: "dismiss-notice" }
  | { type: "confirm"; confirm: Confirm }
  | { type: "tray-select"; id: string | null }
  | { type: "tray-unit"; unit: string }
  | { type: "flash"; ids: string[] }
  | { type: "escape" };

/** View presets applied when switching modes, so each mode reads at a glance. */
export function modeView(mode: EditorMode, view: SceneView): SceneView {
  if (mode === "outside" || mode === "explore")
    return { ...view, stage: 5, roof: true, cutaway: false, walls: true };
  return {
    ...view,
    stage: 4,
    roof: false,
    cutaway: true,
    walls: true,
    openings: mode === "openings" ? true : view.openings,
  };
}

const withCamera = (state: EditorState, command: CameraIntent): EditorState => ({
  ...state,
  camera: { ...command, id: state.cameraSeq + 1 } as CameraCommand,
  cameraSeq: state.cameraSeq + 1,
});
export const selectionFloorId = (t: SelectionTarget | null) =>
  t && "floorId" in t ? t.floorId : null;

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "select": {
      const target = action.target;
      if (!target)
        return {
          ...state,
          selection: null,
          sheet: state.panel ? state.sheet : "hidden",
          tool: state.tool,
        };
      if (state.mode === "explore") return state;
      const floorId = selectionFloorId(target);
      const view =
        floorId && state.view.floor !== "all" && state.view.floor !== floorId
          ? { ...state.view, floor: floorId }
          : state.view;
      // Decorating and placing doors happen inside one room: open its panel
      // half-way and glide the camera in, so furniture is big enough to tap.
      const inRoomMode = state.mode === "decorate" || state.mode === "openings";
      const next: EditorState = {
        ...state,
        selection: target,
        view,
        tray:
          target.kind === "staged"
            ? { ...state.tray, selected: target.id }
            : state.tray,
        sheet:
          action.origin === "list" || inRoomMode
            ? state.sheet === "expanded"
              ? "expanded"
              : "medium"
            : state.sheet === "medium" || state.sheet === "expanded"
              ? state.sheet
              : "peek",
        viewOptions: false,
      };
      const enteringRoom =
        inRoomMode &&
        target.kind === "room" &&
        !(state.selection?.kind === "room" && state.selection.id === target.id);
      return enteringRoom
        ? withCamera(next, { type: "fit", subject: "room", floorId: target.floorId, roomId: target.id })
        : next;
    }
    case "set-mode": {
      if (action.mode === state.mode) return state;
      const keep =
        state.selection &&
        PICKABLE[action.mode].includes(state.selection.kind)
          ? state.selection
          : null;
      // A room carried into Decorate or Doors & windows is entered right away.
      const roomFocus =
        keep?.kind === "room" && (action.mode === "decorate" || action.mode === "openings")
          ? keep
          : null;
      const next: EditorState = {
        ...state,
        mode: action.mode,
        lastEditMode:
          action.mode === "explore" ? state.lastEditMode : action.mode,
        selection: keep,
        tool: "select",
        panel: null,
        sheet: roomFocus ? "medium" : keep ? "peek" : "hidden",
        lens: action.mode === "explore" ? false : state.lens,
        viewOptions: false,
        view: modeView(action.mode, {
          ...state.view,
          floor:
            action.mode === "outside" || action.mode === "explore"
              ? "all"
              : state.view.floor,
        }),
        explore: action.mode === "explore" ? "orbit" : state.explore,
        hour:
          action.mode === "explore"
            ? GOLDEN_HOUR
            : state.mode === "explore"
              ? BUILD_HOUR
              : state.hour,
        chromeHidden: false,
      };
      return withCamera(
        next,
        roomFocus
          ? { type: "fit", subject: "room", floorId: roomFocus.floorId, roomId: roomFocus.id }
          : { type: "fit", subject: "home", view: action.mode === "explore" ? "hero" : "keep" },
      );
    }
    case "set-tool":
      return {
        ...state,
        tool: action.tool,
        // Resizing happens in the plan lens; moving also works directly in 3D.
        lens: action.tool !== "select" ? (action.lens ?? true) || state.lens : state.lens,
        viewOptions: false,
        panel: action.tool !== "select" ? null : state.panel,
        sheet:
          action.tool !== "select" && state.selection ? "peek" : state.sheet,
      };
    case "open-panel":
      if (action.panel === state.panel && !state.selection)
        return { ...state, panel: null, sheet: "hidden" };
      return {
        ...state,
        panel: action.panel,
        catalogPick: action.panel === "catalog" ? (action.pick ?? null) : state.catalogPick,
        selection: null,
        // Catalog-style panels need room to browse.
        sheet: !action.panel
          ? "hidden"
          : action.panel === "catalog" || action.panel === "garden" || action.panel === "style"
            ? "expanded"
            : "medium",
        tool: "select",
        viewOptions: false,
        // Tray pieces are dropped onto the floor plan.
        lens: action.panel === "tray" ? true : state.lens,
      };
    case "close-panel":
      return {
        ...state,
        panel: null,
        selection: null,
        sheet: "hidden",
        tool: "select",
      };
    case "sheet":
      if (action.snap === "hidden")
        return { ...state, sheet: "hidden", selection: null, panel: null };
      return { ...state, sheet: action.snap };
    case "overlay":
      return { ...state, overlay: action.overlay, viewOptions: false };
    case "view-options":
      return { ...state, viewOptions: action.open };
    case "lens":
      return {
        ...state,
        lens: action.open,
        tool: action.open ? state.tool : "select",
      };
    case "view":
      return { ...state, view: { ...state.view, ...action.patch } };
    case "choose-floor":
      return {
        ...state,
        view: { ...state.view, floor: action.floor },
        selection:
          action.floor !== "all" &&
          state.selection &&
          selectionFloorId(state.selection) &&
          selectionFloorId(state.selection) !== action.floor
            ? null
            : state.selection,
        tray: { ...state.tray, unit: "auto" },
      };
    case "camera":
      return withCamera(state, action.command);
    case "hour":
      return { ...state, hour: Math.max(0, Math.min(24, action.hour)) };
    case "explore":
      return { ...state, explore: action.view };
    case "quality":
      return { ...state, quality: action.quality };
    case "chrome":
      return { ...state, chromeHidden: action.hidden };
    case "notify":
      return {
        ...state,
        notice: {
          id: state.noticeSeq + 1,
          text: action.text,
          tone: action.tone ?? "info",
          ...(action.undo ? { undo: true } : {}),
        },
        noticeSeq: state.noticeSeq + 1,
      };
    case "dismiss-notice":
      return { ...state, notice: null };
    case "confirm":
      return { ...state, confirm: action.confirm };
    case "tray-select":
      return { ...state, tray: { ...state.tray, selected: action.id } };
    case "tray-unit":
      return { ...state, tray: { ...state.tray, unit: action.unit } };
    case "flash":
      return { ...state, flash: action.ids };
    case "escape": {
      if (state.confirm) return { ...state, confirm: null };
      if (state.viewOptions) return { ...state, viewOptions: false };
      if (state.tray.selected)
        return { ...state, tray: { ...state.tray, selected: null } };
      if (state.tool !== "select") return { ...state, tool: "select" };
      if (state.panel === "catalog" || state.panel === "tray")
        return {
          ...state,
          panel: null,
          sheet: state.selection ? "peek" : "hidden",
        };
      if (state.sheet === "expanded" && (state.selection || state.panel))
        return { ...state, sheet: "medium" };
      if (state.sheet === "medium" && state.selection && !state.panel)
        return { ...state, sheet: "peek" };
      if (state.selection)
        return {
          ...state,
          selection: null,
          sheet: state.panel ? "medium" : "hidden",
        };
      if (state.panel) return { ...state, panel: null, sheet: "hidden" };
      if (state.explore === "walk") return { ...state, explore: "orbit" };
      if (state.chromeHidden) return { ...state, chromeHidden: false };
      if (state.lens) return { ...state, lens: false };
      return state;
    }
  }
}

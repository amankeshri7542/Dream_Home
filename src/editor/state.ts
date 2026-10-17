// The editor controller: a pure reducer owning all transient UI state.
// `useProject` remains the only owner of the document and its history.
import type { SceneView } from "../scene/types";
import type { Season } from "../insights/solar";
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
/** The Room Studio's tabs; each runs on one of the editing modes. */
export type RoomTab = "furniture" | "colours" | "layout" | "doors";
export const ROOM_TABS: readonly RoomTab[] = ["furniture", "colours", "layout", "doors"];
export const TAB_MODE: Record<RoomTab, "build" | "openings" | "decorate"> = {
  furniture: "decorate",
  colours: "decorate",
  layout: "build",
  doors: "openings",
};
export type RoomFocus = { floorId: string; roomId: string };
export type Tool = "select" | "move" | "resize";
export type Overlay =
  | "start"
  | "share"
  | "more"
  | "help"
  | "shortcuts"
  | "photo"
  | "reel"
  | "sunlight"
  | "plan"
  | "talk"
  | "homes"
  | "plans"
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
  /** The safe alternative (e.g. "Keep for later instead"); focused by default. */
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
  /** The day the sun is shown for, when the plot has a city (Sunlight sheet). */
  season: Season;
  explore: ExploreView;
  quality: QualitySetting;
  chromeHidden: boolean;
  notice: Notice | null;
  noticeSeq: number;
  confirm: Confirm;
  tray: { selected: string | null; unit: string };
  /** Component ids briefly outlined in red after a blocked edit. */
  flash: string[];
  /** The hero room (Room level), or null at Home level. */
  focus: RoomFocus | null;
  /** The Room Studio tab (remembered between rooms). */
  roomTab: RoomTab;
  /** The floor shown at Home before entering a room (restored on leaving). */
  homeFloor: string | "all";
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
    season: "today",
    explore: "orbit",
    quality: "auto",
    chromeHidden: false,
    notice: null,
    noticeSeq: 0,
    confirm: null,
    tray: { selected: null, unit: "auto" },
    flash: [],
    focus: null,
    roomTab: "furniture",
    homeFloor: "all",
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
  | { type: "season"; season: Season }
  | { type: "explore"; view: ExploreView }
  | { type: "quality"; quality: QualitySetting }
  | { type: "chrome"; hidden: boolean }
  | { type: "notify"; text: string; tone?: Notice["tone"]; undo?: boolean }
  | { type: "dismiss-notice" }
  | { type: "confirm"; confirm: Confirm }
  | { type: "tray-select"; id: string | null }
  | { type: "tray-unit"; unit: string }
  | { type: "flash"; ids: string[] }
  /** Fly into a room and make it the hero (Room level). */
  | { type: "enter-room"; floorId: string; roomId: string; tab?: RoomTab }
  /** Fly back out to the whole home (Home level). */
  | { type: "leave-room" }
  | { type: "room-tab"; tab: RoomTab }
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

/** The tab a mode stands for when entering a room from it. */
function tabForMode(mode: EditorMode, remembered: RoomTab): RoomTab {
  if (mode === "openings") return "doors";
  if (mode === "decorate") return remembered === "colours" ? "colours" : "furniture";
  return remembered;
}
function enterRoom(state: EditorState, floorId: string, roomId: string, tab: RoomTab): EditorState {
  const mode = TAB_MODE[tab];
  const same = state.focus?.roomId === roomId && state.focus.floorId === floorId;
  const next: EditorState = {
    ...state,
    focus: { floorId, roomId },
    roomTab: tab,
    homeFloor: state.focus ? state.homeFloor : state.view.floor,
    mode,
    lastEditMode: mode,
    selection: { kind: "room", floorId, id: roomId },
    tool: "select",
    panel: null,
    // A room picked on the open floor plan keeps the plan open.
    lens: state.lens,
    sheet: state.focus && state.sheet === "expanded" ? "expanded" : "medium",
    viewOptions: false,
    chromeHidden: false,
    view: { ...modeView(mode, state.view), floor: floorId },
    explore: "orbit",
    hour: state.mode === "explore" ? BUILD_HOUR : state.hour,
    tray: { ...state.tray, selected: null },
  };
  return same ? next : withCamera(next, { type: "fit", subject: "room", floorId, roomId, view: "room" });
}
function leaveRoom(state: EditorState, camera = true): EditorState {
  if (!state.focus) return state;
  const next: EditorState = {
    ...state,
    focus: null,
    mode: "build",
    lastEditMode: "build",
    selection: null,
    sheet: "hidden",
    panel: null,
    tool: "select",
    viewOptions: false,
    view: { ...modeView("build", state.view), floor: state.homeFloor },
  };
  return camera ? withCamera(next, { type: "fit", subject: "home", view: "return" }) : next;
}
const focusTarget = (f: RoomFocus): SelectionTarget => ({ kind: "room", floorId: f.floorId, id: f.roomId });

/**
 * The view the scene renders: the editor's view, plus the dollhouse focus
 * while a room is the hero (its floor only, cut open, neighbours faded; kept
 * "soft" while moving or resizing so the neighbours stay visible).
 */
export function sceneView(s: EditorState): SceneView {
  if (!s.focus) return s.view;
  return {
    ...s.view,
    floor: s.focus.floorId,
    stage: 4,
    roof: false,
    cutaway: true,
    focus: { ...s.focus, soft: s.tool !== "select" || s.lens },
  };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "select": {
      const target = action.target;
      if (state.focus) {
        // Inside a room: empty space returns to the room, another room
        // becomes the hero, furniture and openings are picked in place.
        if (!target) return { ...state, selection: focusTarget(state.focus), viewOptions: false };
        if (target.kind === "room") {
          if (target.id === state.focus.roomId) return { ...state, selection: target, viewOptions: false };
          if (action.origin === "history") return state;
          return enterRoom(state, target.floorId, target.id, state.roomTab);
        }
        if (target.kind === "furniture" || target.kind === "opening")
          return { ...state, selection: target, viewOptions: false };
        if (action.origin === "history") return state;
        return editorReducer(leaveRoom(state, false), action);
      }
      // At Home, a room is opened as the hero (never by undo/redo).
      if (target?.kind === "room" && state.mode !== "outside" && state.mode !== "explore") {
        if (action.origin === "history") return { ...state, flash: [target.id] };
        return enterRoom(state, target.floorId, target.id, tabForMode(state.mode, state.roomTab));
      }
      if (target && action.origin === "history" && (target.kind === "furniture" || target.kind === "opening"))
        return state;
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
      if (state.focus) {
        if (action.mode === "decorate")
          return editorReducer(state, { type: "room-tab", tab: state.roomTab === "colours" ? "colours" : "furniture" });
        if (action.mode === "openings") return editorReducer(state, { type: "room-tab", tab: "doors" });
        const home = leaveRoom(state);
        return action.mode === "build" ? home : editorReducer(home, action);
      }
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
    case "set-tool": {
      const next: EditorState = {
        ...state,
        tool: action.tool,
        // Resizing happens in the plan lens; moving also works directly in 3D.
        lens: action.tool !== "select" ? (action.lens ?? true) || state.lens : state.lens,
        viewOptions: false,
        panel: action.tool !== "select" ? null : state.panel,
        sheet:
          action.tool !== "select" && state.selection ? "peek" : state.sheet,
      };
      // Moving a hero room needs the whole floor in view; Done flies back in.
      const f = state.focus;
      if (f && state.tool === "select" && action.tool !== "select")
        return withCamera(next, { type: "fit", subject: "floor", floorId: f.floorId, view: "keep" });
      if (f && state.tool !== "select" && action.tool === "select")
        return withCamera(next, { type: "fit", subject: "room", floorId: f.floorId, roomId: f.roomId, view: "keep" });
      return next;
    }
    case "open-panel":
      if (state.focus) return editorReducer(leaveRoom(state), action);
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
      if (action.snap === "hidden" && state.focus) return leaveRoom(state);
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
      if (state.focus) return editorReducer(leaveRoom(state), action);
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
    case "season":
      return { ...state, season: action.season };
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
    case "enter-room":
      return enterRoom(state, action.floorId, action.roomId, action.tab ?? state.roomTab);
    case "leave-room":
      return leaveRoom(state);
    case "room-tab": {
      if (!state.focus) return { ...state, roomTab: action.tab };
      const mode = TAB_MODE[action.tab];
      return {
        ...state,
        roomTab: action.tab,
        mode,
        lastEditMode: mode,
        selection: focusTarget(state.focus),
        tool: "select",
        panel: null,
        // The floor plan is a layout tool: only the Layout tab keeps it open.
        lens: action.tab === "layout" ? state.lens : false,
        viewOptions: false,
        view: { ...modeView(mode, state.view), floor: state.focus.floorId },
      };
    }
    case "escape": {
      if (state.focus) {
        if (state.confirm) return { ...state, confirm: null };
        if (state.viewOptions) return { ...state, viewOptions: false };
        if (state.tool !== "select") return { ...state, tool: "select" };
        if (state.lens) return { ...state, lens: false };
        if (state.selection && state.selection.kind !== "room")
          return { ...state, selection: focusTarget(state.focus) };
        if (state.sheet === "expanded") return { ...state, sheet: "medium" };
        return leaveRoom(state);
      }
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

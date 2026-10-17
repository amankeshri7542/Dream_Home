// Runs what the helper asked for, in order, through the same pure domain
// commands the buttons use. Every edit is chained into one project, so the
// whole request is one undo step; the run stops at the first edit that can't
// be done and says why. Removing a room, emptying one, changing the whole
// look, or growing the house to make space asks first. Views (open a room,
// night, the photo studio…) come back as intents for the app to show after.
import { plannerRoomPlan } from "../ai/planner";
import { applyRoomPlan } from "../ai/buildHome";
import { ROOM_CATALOG, addCatalogRoom, growHouse, type CatalogId, type RoomSize } from "../domain/builder";
import { addAttachedBathroom } from "../domain/ensuite";
import { furnitureCatalogItem, resolveFurniture, roomFocalWall, roomWalls } from "../domain/furniture";
import { addFurniture, clearFurniture, removeFurniture, resetFurniture } from "../domain/furnitureCommands";
import { STYLE_PRESET_INFO } from "../domain/looks";
import {
  applyStylePreset,
  effectiveRoof,
  setExterior,
  setRoomAccentWall,
  setRoomFloorMaterial,
  setRoomWallColor,
  setStyle,
} from "../domain/materials";
import { removeRoom, swapRoomUses, updateRoom } from "../domain/model";
import { addRoomWindow, ensureRoomDoor } from "../domain/openingCommands";
import { snap } from "../domain/geometry";
import type { EditResult, Project, Rect, Room, RoomKind, RoofStyle, StylePreset } from "../domain/types";
import type { Vibe } from "../ai/brief";
import { friendlyError, friendlyIssue } from "../editor/EditorProvider";
import type { RefMap } from "./context";
import { isDestructive, toolGroup, type ROOM_USES, type VoiceAction } from "./tools";

export type ViewIntent =
  | { type: "open-room"; floorId: string; roomId: string }
  | { type: "home" }
  | { type: "outside" }
  | { type: "explore"; view: "orbit" | "walk" | "showcase" }
  | { type: "hour"; hour: number }
  | { type: "sunlight" }
  | { type: "vastu" }
  | { type: "photo" }
  | { type: "video" };

export type RunOutcome = {
  /** The home after every edit that worked (the same object when nothing changed). */
  project: Project;
  changed: boolean;
  /** Why it stopped, in plain words (the edits before it still apply). */
  failure?: string;
  /** Ask before doing anything; run again with `confirmed` on a yes. */
  confirm?: string;
  /** Things that were already so ("Bedroom 1 already has a door."). */
  notes: string[];
  views: ViewIntent[];
  history: ("undo" | "redo")[];
};

type Ctx = { refs: RefMap; unit: "ft" | "m"; activeFloorId: string; grow: boolean; lang: "en" | "hi" };
/** A step's result; "grow" means it would work once the house grows. */
type Step = { ok: true; project: Project } | { ok: false; message: string } | { ok: "grow"; project: Project };

const ADD: Record<string, CatalogId> = {
  bedroom: "bedroom",
  living: "living",
  kitchen: "kitchen",
  bathroom: "bathroom",
  dining: "dining",
  pooja: "prayer",
  study: "study",
  utility: "utility",
  guest: "guest",
};
const USES: Record<(typeof ROOM_USES)[number], { kind: RoomKind; name?: string }> = {
  living: { kind: "living", name: "Living room" },
  bedroom: { kind: "bedroom" },
  kitchen: { kind: "kitchen", name: "Kitchen" },
  bathroom: { kind: "bathroom", name: "Bathroom" },
  dining: { kind: "dining", name: "Dining room" },
  pooja: { kind: "utility", name: "Pooja room" },
  study: { kind: "utility", name: "Study" },
  store: { kind: "utility", name: "Store" },
};
const SCALE: Record<RoomSize, number> = { small: 0.8, regular: 1, large: 1.2 };

const why = (p: Project, r: EditResult): string =>
  r.ok ? "" : r.issues?.[0] ? friendlyIssue(p, r.issues[0]) : friendlyError(r.error);
const findRoom = (p: Project, floorId: string, roomId: string) =>
  p.floors.find((f) => f.id === floorId)?.rooms.find((r) => r.id === roomId);

/** Spots right beside a room for a new w × d room: right, left, below, above (each edge-aligned both ways). */
function beside(b: Rect, w: number, d: number): { x: number; z: number }[] {
  return [
    { x: b.x + b.w, z: b.z },
    { x: b.x + b.w, z: b.z + b.d - d },
    { x: b.x - w, z: b.z },
    { x: b.x - w, z: b.z + b.d - d },
    { x: b.x, z: b.z + b.d },
    { x: b.x + b.w - w, z: b.z + b.d },
    { x: b.x, z: b.z - d },
    { x: b.x + b.w - w, z: b.z - d },
  ];
}

function addRoom(p: Project, floorId: string, kind: string, size: RoomSize, near: Room | undefined): EditResult {
  const id = ADD[kind];
  const item = ROOM_CATALOG.find((r) => r.id === id)!;
  const w = snap(item.width * SCALE[size]),
    d = snap(item.depth * SCALE[size]);
  if (near)
    for (const spot of beside(near.bounds, w, d)) {
      const r = addCatalogRoom(p, floorId, id, size, spot);
      if (r.ok) return r;
    }
  return addCatalogRoom(p, floorId, id, size);
}

/** The room at its new size, from whichever corner (or the middle) keeps it valid. */
function resizeRoom(p: Project, floorId: string, room: Room, w: number, d: number): EditResult {
  const b = room.bounds;
  const spots = [
    { x: b.x, z: b.z },
    { x: b.x + b.w - w, z: b.z },
    { x: b.x, z: b.z + b.d - d },
    { x: b.x + b.w - w, z: b.z + b.d - d },
    { x: snap(b.x + (b.w - w) / 2), z: snap(b.z + (b.d - d) / 2) },
  ];
  let first: EditResult | null = null;
  for (const s of spots) {
    const r = updateRoom(p, floorId, room.id, { bounds: { ...s, w, d } });
    if (r.ok) return r;
    first ??= r;
  }
  return first!;
}

/** Tries an edit; when it fails for lack of space, sees whether growing the house first would make it work. */
function withGrow(p: Project, floorId: string, edit: (q: Project) => EditResult, ctx: Ctx): Step {
  const r = edit(p);
  if (r.ok) return { ok: true, project: r.project };
  const grown = growHouse(p, floorId);
  if (grown.ok && grown.project !== p) {
    const again = edit(grown.project);
    if (again.ok) return ctx.grow ? { ok: true, project: again.project } : { ok: "grow", project: again.project };
  }
  return { ok: false, message: why(p, r) };
}

function editStep(p: Project, a: VoiceAction, ctx: Ctx): Step {
  const input = a.input;
  const target = typeof input.room === "string" ? ctx.refs.rooms.get(input.room) : undefined;
  const room = target && findRoom(p, target.floorId, target.roomId);
  const done = (r: EditResult): Step => (r.ok ? { ok: true, project: r.project } : { ok: false, message: why(p, r) });
  if ("room" in input && (!target || !room)) return { ok: false, message: "That room isn’t in the home any more." };
  const floorId = target?.floorId ?? ctx.activeFloorId;
  const roomId = room?.id ?? "";
  const toCm = (v: number) => snap(ctx.unit === "m" ? v * 100 : v * 30.48);
  switch (a.tool) {
    case "add_room": {
      const nearRef = typeof input.near === "string" ? ctx.refs.rooms.get(input.near) : undefined;
      const near = nearRef && findRoom(p, nearRef.floorId, nearRef.roomId);
      const onFloor = (typeof input.floor === "string" && ctx.refs.floors.get(input.floor)) || nearRef?.floorId || ctx.activeFloorId;
      const size = (input.size as RoomSize | undefined) ?? "regular";
      return withGrow(p, onFloor, (q) => addRoom(q, onFloor, String(input.kind), size, nearRef?.floorId === onFloor ? near : undefined), ctx);
    }
    case "remove_room":
      return done(removeRoom(p, floorId, roomId));
    case "resize_room": {
      const w = typeof input.width === "number" ? toCm(input.width) : room!.bounds.w;
      const d = typeof input.depth === "number" ? toCm(input.depth) : room!.bounds.d;
      if (w === room!.bounds.w && d === room!.bounds.d) return { ok: true, project: p };
      return withGrow(p, floorId, (q) => resizeRoom(q, floorId, findRoom(q, floorId, roomId)!, w, d), ctx);
    }
    case "rename_room":
      return done(updateRoom(p, floorId, roomId, { name: String(input.name) }));
    case "change_room_use": {
      const use = USES[input.use as keyof typeof USES];
      let name = use.name;
      if (!name)
        if (room!.kind === "bedroom") name = room!.name;
        else {
          const taken = new Set(p.floors.flatMap((f) => f.rooms.map((r) => r.name)));
          let n = 1;
          while (taken.has(`Bedroom ${n}`)) n++;
          name = `Bedroom ${n}`;
        }
      // A new use gets its own furniture (the designer layout for it).
      return done(updateRoom(p, floorId, roomId, { kind: use.kind, name, furniture: undefined }));
    }
    case "swap_rooms": {
      const other = ctx.refs.rooms.get(String(input.b));
      const from = ctx.refs.rooms.get(String(input.a));
      if (!from || !other) return { ok: false, message: "That room isn’t in the home any more." };
      if (from.floorId !== other.floorId) return { ok: false, message: "Only rooms on the same floor can swap." };
      return done(swapRoomUses(p, from.floorId, from.roomId, other.roomId));
    }
    case "paint_walls":
      return done(setRoomWallColor(p, floorId, roomId, String(input.paint)));
    case "set_floor":
      return done(setRoomFloorMaterial(p, floorId, roomId, String(input.material)));
    case "accent_wall": {
      if (input.paint === "none") return done(setRoomAccentWall(p, floorId, roomId, null));
      const edge = room!.accentWall?.edge ?? roomFocalWall(room!, roomWalls(p, floorId)) ?? "north";
      return done(setRoomAccentWall(p, floorId, roomId, edge, String(input.paint)));
    }
    case "add_furniture": {
      const count = Math.round(Number(input.count ?? 1));
      let q = p;
      for (let i = 0; i < count; i++) {
        const r = addFurniture(q, floorId, roomId, String(input.item));
        if (!r.ok) return i === 0 ? { ok: false, message: why(q, r) } : { ok: true, project: q };
        q = r.project;
      }
      return { ok: true, project: q };
    }
    case "remove_furniture": {
      const piece = resolveFurniture(room!, roomWalls(p, floorId)).filter((i) => i.catalogId === input.item).at(-1);
      if (!piece) {
        const label = furnitureCatalogItem(String(input.item))?.label.toLowerCase() ?? "piece";
        return { ok: false, message: `There’s no ${label} in ${room!.name}.` };
      }
      return done(removeFurniture(p, floorId, roomId, piece.id));
    }
    case "furnish_room": {
      const q = room!.furnishing === "none" ? updateRoom(p, floorId, roomId, { furnishing: "auto" }) : { ok: true as const, project: p };
      return q.ok ? done(resetFurniture(q.project, floorId, roomId)) : done(q);
    }
    case "empty_room":
      return done(clearFurniture(p, floorId, roomId));
    case "make_it_nice": {
      const r = room!;
      const plan = plannerRoomPlan({
        kind: r.kind,
        name: r.name,
        w: r.bounds.w,
        d: r.bounds.d,
        items: (r.furniture ?? []).map((i) => i.catalogId),
        vibe: input.vibe as Vibe,
      });
      const next = applyRoomPlan(p, floorId, roomId, plan);
      return next === p ? { ok: false, message: `${r.name} couldn’t be restyled.` } : { ok: true, project: next };
    }
    case "add_door":
      return done(ensureRoomDoor(p, floorId, roomId));
    case "add_window":
      return done(addRoomWindow(p, floorId, roomId));
    case "add_attached_bathroom":
      return done(addAttachedBathroom(p, floorId, roomId));
    case "set_look":
      return done(applyStylePreset(p, String(input.look)));
    case "set_exterior":
      return done(setExterior(p, String(input.finish)));
    case "set_roof": {
      const roof = effectiveRoof(p);
      return done(setStyle(p, { roof: { style: input.style as RoofStyle, material: roof.material, pitch: roof.pitch } }));
    }
  }
  return { ok: false, message: "That isn’t something I can change yet." };
}

function viewOf(a: VoiceAction, ctx: Ctx): ViewIntent | null {
  const ref = typeof a.input.room === "string" ? ctx.refs.rooms.get(a.input.room) : undefined;
  switch (a.tool) {
    case "open_room":
      return ref ? { type: "open-room", ...ref } : null;
    case "go_home":
      return { type: "home" };
    case "explore":
      return { type: "explore", view: a.input.view as "orbit" | "walk" | "showcase" };
    case "set_time":
      return { type: "hour", hour: Math.round(Number(a.input.hour) * 4) / 4 };
    case "show_sunlight":
      return { type: "sunlight" };
    case "show_vastu":
      return { type: "vastu" };
    case "take_photo":
      return { type: "photo" };
    case "make_video":
      return { type: "video" };
  }
  return null;
}

type Lang = "en" | "hi";

/** Why an edit changed nothing: it was already so. */
function alreadySo(p: Project, a: VoiceAction, ctx: Ctx): string {
  const ref = typeof a.input.room === "string" ? ctx.refs.rooms.get(a.input.room) : undefined;
  const name = (ref && findRoom(p, ref.floorId, ref.roomId)?.name) || (ctx.lang === "hi" ? "यह" : "It");
  if (ctx.lang === "hi") {
    if (a.tool === "add_door") return `${name} में पहले से दरवाज़ा है।`;
    if (a.tool === "furnish_room") return `${name} में पहले से फ़र्नीचर है।`;
    if (a.tool === "resize_room") return `${name} पहले से इसी नाप का है।`;
    return "यह पहले से हो चुका है।";
  }
  if (a.tool === "add_door") return `${name} already has a door.`;
  if (a.tool === "furnish_room") return `${name} already has its furniture.`;
  if (a.tool === "resize_room") return `${name} is already that size.`;
  return "That was already done.";
}

const GROW: Record<Lang, string> = {
  en: "There isn’t room for that, so I’ll make the house bigger first. OK?",
  hi: "इसके लिए जगह नहीं है, तो पहले घर बड़ा कर दूँगा। ठीक है?",
};

/** What needs a yes first, in plain words; null when nothing does. */
export function confirmText(project: Project, actions: readonly VoiceAction[], refs: RefMap, lang: Lang = "en"): string | null {
  const a = actions.find((x) => isDestructive(x.tool));
  if (!a) return null;
  const ref = typeof a.input.room === "string" ? refs.rooms.get(a.input.room) : undefined;
  const name = (ref && findRoom(project, ref.floorId, ref.roomId)?.name) || (lang === "hi" ? "यह कमरा" : "this room");
  const look = STYLE_PRESET_INFO[a.input.look as StylePreset]?.label ?? "new";
  if (lang === "hi") {
    if (a.tool === "remove_room") return `मैं ${name} हटा दूँगा। ठीक है?`;
    if (a.tool === "empty_room") return `मैं ${name} का सारा फ़र्नीचर हटा दूँगा। ठीक है?`;
    return `मैं पूरे घर को ${look} लुक दे दूँगा। ठीक है?`;
  }
  if (a.tool === "remove_room") return `I’ll remove ${name}. OK?`;
  if (a.tool === "empty_room") return `I’ll take all the furniture out of ${name}. OK?`;
  return `I’ll give the whole home the ${look} look. OK?`;
}

/**
 * Runs the actions on `project`. Without `confirmed`, anything destructive (or
 * a house that must grow to make space) returns `confirm` and changes nothing.
 */
export function runActions(
  project: Project,
  actions: readonly VoiceAction[],
  refs: RefMap,
  opts: { unit: "ft" | "m"; activeFloorId: string; confirmed?: boolean; lang?: "en" | "hi" },
): RunOutcome {
  const lang = opts.lang ?? "en";
  const outcome: RunOutcome = { project, changed: false, views: [], history: [], notes: [] };
  // Undo and redo stand alone; mixed into other changes they'd undo those.
  const history = actions.filter((a) => toolGroup(a.tool) === "history");
  if (history.length) {
    if (history.length === actions.length) outcome.history = history.map((a) => a.tool as "undo" | "redo");
    else outcome.failure = lang === "hi" ? "अनडू अलग से बोलिए, बदलाव के बाद।" : "Say undo on its own, after the change.";
    return outcome;
  }
  if (!opts.confirmed) {
    const ask = confirmText(project, actions, refs, lang);
    if (ask) return { ...outcome, confirm: ask };
  }
  const ctx: Ctx = { refs, unit: opts.unit, activeFloorId: opts.activeFloorId, grow: !!opts.confirmed, lang };
  let p = project;
  for (const a of actions) {
    if (toolGroup(a.tool) === "view") {
      const v = viewOf(a, ctx);
      if (v) outcome.views.push(v);
      continue;
    }
    const step = editStep(p, a, ctx);
    if (step.ok === "grow")
      return { ...outcome, project, views: [], confirm: GROW[lang] };
    if (!step.ok) {
      outcome.failure = step.message;
      break;
    }
    if (step.project === p) outcome.notes.push(alreadySo(p, a, ctx));
    p = step.project;
    if (a.tool === "set_roof" || a.tool === "set_exterior") outcome.views.push({ type: "outside" });
  }
  outcome.project = p;
  outcome.changed = p !== project;
  return outcome;
}

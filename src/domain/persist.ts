// Shape checks and whitelisted copies for the optional v2 fields added by the
// sandbox (openings, furniture, materials, landscape). Absent fields stay absent,
// so older saves round-trip byte-for-byte. Semantic rules live in feature modules.
import { LIMITS } from "./limits";
import type {
  FurnitureItem,
  LandscapeItem,
  OpeningKind,
  PlacedOpening,
  Project,
  ProjectStyle,
  RailingKind,
  Room,
  SiteStyle,
  StyleDetails,
  StylePreset,
} from "./types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 80;
const num = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100000;
const optNum = (v: unknown) => v === undefined || num(v);
const optStr = (v: unknown) => v === undefined || str(v);
const turn = (v: unknown) => v === 0 || v === 90 || v === 180 || v === 270;
export const OPENING_KINDS: readonly OpeningKind[] = [
  "door",
  "french-door",
  "sliding-door",
  "archway",
  "window",
  "picture-window",
];
const OPENING_STYLES = ["panel", "flush", "glazed", "plain", "divided"];
const ROOF_STYLES = ["flat", "gable", "hip", "shed"];
export const STYLE_PRESETS: readonly StylePreset[] = ["indian-modern", "indian-classic", "diorama"];
export const RAILING_KINDS: readonly RailingKind[] = ["glass", "grille", "jaali"];
const optBool = (v: unknown) => v === undefined || typeof v === "boolean";

function checkOpening(v: unknown): v is PlacedOpening {
  return (
    obj(v) &&
    str(v.id) &&
    OPENING_KINDS.includes(v.kind as OpeningKind) &&
    (v.axis === "x" || v.axis === "z") &&
    ["line", "center", "width", "height", "sill"].every((k) => num(v[k])) &&
    (v.style === undefined || OPENING_STYLES.includes(v.style as string)) &&
    (v.hinge === undefined || v.hinge === "start" || v.hinge === "end") &&
    (v.swing === undefined || v.swing === 1 || v.swing === -1)
  );
}
export function copyOpening(o: PlacedOpening): PlacedOpening {
  return {
    id: o.id,
    kind: o.kind,
    axis: o.axis,
    line: o.line,
    center: o.center,
    width: o.width,
    height: o.height,
    sill: o.sill,
    ...(o.style !== undefined ? { style: o.style } : {}),
    ...(o.hinge !== undefined ? { hinge: o.hinge } : {}),
    ...(o.swing !== undefined ? { swing: o.swing } : {}),
  };
}
function checkFurniture(v: unknown): v is FurnitureItem {
  return (
    obj(v) &&
    str(v.id) &&
    str(v.catalogId) &&
    num(v.x) &&
    num(v.z) &&
    turn(v.rotation) &&
    optNum(v.w) &&
    optNum(v.d) &&
    optStr(v.finish)
  );
}
export function copyFurniture(f: FurnitureItem): FurnitureItem {
  return {
    id: f.id,
    catalogId: f.catalogId,
    x: f.x,
    z: f.z,
    rotation: f.rotation,
    ...(f.w !== undefined ? { w: f.w } : {}),
    ...(f.d !== undefined ? { d: f.d } : {}),
    ...(f.finish !== undefined ? { finish: f.finish } : {}),
  };
}
function checkLandscape(v: unknown): v is LandscapeItem {
  return (
    obj(v) &&
    str(v.id) &&
    str(v.kind) &&
    num(v.x) &&
    num(v.z) &&
    turn(v.rotation) &&
    optNum(v.w) &&
    optNum(v.d) &&
    optStr(v.variant)
  );
}
export function copyLandscape(l: LandscapeItem): LandscapeItem {
  return {
    id: l.id,
    kind: l.kind,
    x: l.x,
    z: l.z,
    rotation: l.rotation,
    ...(l.w !== undefined ? { w: l.w } : {}),
    ...(l.d !== undefined ? { d: l.d } : {}),
    ...(l.variant !== undefined ? { variant: l.variant } : {}),
  };
}
function checkDetails(v: unknown): v is StyleDetails {
  return (
    obj(v) &&
    optBool(v.chhajja) &&
    optBool(v.waterTank) &&
    optBool(v.carPorch) &&
    (v.railing === undefined || RAILING_KINDS.includes(v.railing as RailingKind))
  );
}
function copyDetails(d: StyleDetails): StyleDetails {
  return {
    ...(d.chhajja !== undefined ? { chhajja: d.chhajja } : {}),
    ...(d.waterTank !== undefined ? { waterTank: d.waterTank } : {}),
    ...(d.carPorch !== undefined ? { carPorch: d.carPorch } : {}),
    ...(d.railing !== undefined ? { railing: d.railing } : {}),
  };
}
function checkStyle(v: unknown): v is ProjectStyle {
  if (!obj(v)) return false;
  if (!optStr(v.exterior) || !optStr(v.trim) || !optStr(v.frontDoor))
    return false;
  if (v.preset !== undefined && !STYLE_PRESETS.includes(v.preset as StylePreset))
    return false;
  if (v.details !== undefined && !checkDetails(v.details)) return false;
  if (v.roof === undefined) return true;
  return (
    obj(v.roof) &&
    ROOF_STYLES.includes(v.roof.style as string) &&
    str(v.roof.material) &&
    [20, 30, 40].includes(v.roof.pitch as number)
  );
}
function copyStyle(s: ProjectStyle): ProjectStyle {
  return {
    ...(s.preset !== undefined ? { preset: s.preset } : {}),
    ...(s.details !== undefined ? { details: copyDetails(s.details) } : {}),
    ...(s.exterior !== undefined ? { exterior: s.exterior } : {}),
    ...(s.trim !== undefined ? { trim: s.trim } : {}),
    ...(s.frontDoor !== undefined ? { frontDoor: s.frontDoor } : {}),
    ...(s.roof !== undefined
      ? {
          roof: {
            style: s.roof.style,
            material: s.roof.material,
            pitch: s.roof.pitch,
          },
        }
      : {}),
  };
}
const checkSite = (v: unknown): v is SiteStyle =>
  obj(v) && optStr(v.ground) && optStr(v.fence);

/** Throws a user-facing error when an optional field has the wrong shape. */
export function checkRoomExtras(r: Obj) {
  if (!optStr(r.floorMaterial) || !optStr(r.wallColor))
    throw new Error("Project contains an invalid room finish.");
  if (!optStr(r.attachedTo) || (typeof r.attachedTo === "string" && r.attachedTo.length > 120))
    throw new Error("Project contains an invalid attached bathroom.");
  if (r.furniture === undefined) return;
  if (
    !Array.isArray(r.furniture) ||
    r.furniture.length > LIMITS.furniturePerRoom ||
    !r.furniture.every(checkFurniture)
  )
    throw new Error("Project contains an invalid furniture item.");
}
export function checkFloorExtras(f: Obj) {
  if (f.openings === undefined) return;
  if (
    !Array.isArray(f.openings) ||
    f.openings.length > LIMITS.openingsPerFloor ||
    !f.openings.every(checkOpening)
  )
    throw new Error("Project contains an invalid opening.");
}
export function checkProjectExtras(p: Obj) {
  if (p.style !== undefined && !checkStyle(p.style))
    throw new Error("Project contains an invalid style.");
  if (p.site !== undefined && !checkSite(p.site))
    throw new Error("Project contains an invalid style.");
  if (p.landscape === undefined) return;
  if (
    !Array.isArray(p.landscape) ||
    p.landscape.length > LIMITS.landscapeItems ||
    !p.landscape.every(checkLandscape)
  )
    throw new Error("Project contains an invalid garden item.");
}
export function copyRoomExtras(
  room: Room,
): Pick<Room, "floorMaterial" | "wallColor" | "furniture" | "attachedTo"> {
  return {
    ...(room.attachedTo !== undefined ? { attachedTo: room.attachedTo } : {}),
    ...(room.floorMaterial !== undefined
      ? { floorMaterial: room.floorMaterial }
      : {}),
    ...(room.wallColor !== undefined ? { wallColor: room.wallColor } : {}),
    ...(room.furniture !== undefined
      ? { furniture: room.furniture.map(copyFurniture) }
      : {}),
  };
}
export function copyProjectExtras(
  p: Project,
): Pick<Project, "style" | "site" | "landscape"> {
  return {
    ...(p.style !== undefined ? { style: copyStyle(p.style) } : {}),
    ...(p.site !== undefined
      ? {
          site: {
            ...(p.site.ground !== undefined ? { ground: p.site.ground } : {}),
            ...(p.site.fence !== undefined ? { fence: p.site.fence } : {}),
          },
        }
      : {}),
    ...(p.landscape !== undefined
      ? { landscape: p.landscape.map(copyLandscape) }
      : {}),
  };
}

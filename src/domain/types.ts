export type Rect = { x: number; z: number; w: number; d: number };
export type EdgeSide = "north" | "south" | "east" | "west";
export type RoomKind =
  "living" | "kitchen" | "bedroom" | "bathroom" | "dining" | "utility" | "shop";
export type QuarterTurn = 0 | 90 | 180 | 270;

// ---------------------------------------------------------------------------
// Openings: absent `Floor.openings` means "automatic" (derived from rooms).
// ---------------------------------------------------------------------------
export type OpeningKind =
  | "door"
  | "french-door"
  | "sliding-door"
  | "archway"
  | "window"
  | "picture-window";
export type OpeningStyle = "panel" | "flush" | "glazed" | "plain" | "divided";
export type PlacedOpening = {
  id: string;
  kind: OpeningKind;
  /** "x": the wall runs east–west at z = line; "z": north–south at x = line. */
  axis: "x" | "z";
  line: number;
  /** Centre along the wall, in plot centimetres. */
  center: number;
  width: number;
  height: number;
  sill: number;
  style?: OpeningStyle;
  hinge?: "start" | "end";
  /** Side of the wall line the leaf swings toward (+1 = +z / +x). */
  swing?: -1 | 1;
};
/** An opening resolved onto a derived wall segment (render/plan only). */
export type WallOpening = {
  id: string;
  kind: OpeningKind;
  /** Centre of the opening measured from the wall's start, in cm. */
  offset: number;
  width: number;
  height: number;
  sill: number;
  auto: boolean;
  style?: OpeningStyle;
  hinge?: "start" | "end";
  swing?: -1 | 1;
};

// ---------------------------------------------------------------------------
// Furniture: absent `Room.furniture` means the automatic layout.
// Coordinates are room-local centimetres (item centre from room NW corner).
// ---------------------------------------------------------------------------
export type FurnitureItem = {
  id: string;
  catalogId: string;
  x: number;
  z: number;
  /** Direction the item's back faces: 0 north, 90 east, 180 south, 270 west. */
  rotation: QuarterTurn;
  w?: number;
  d?: number;
  finish?: string;
};

// ---------------------------------------------------------------------------
// Landscape: absent `Project.landscape` means the automatic garden.
// Coordinates are plot centimetres (item centre).
// ---------------------------------------------------------------------------
export type LandscapeItem = {
  id: string;
  kind: string;
  x: number;
  z: number;
  rotation: QuarterTurn;
  w?: number;
  d?: number;
  variant?: string;
};

export type RoofStyle = "flat" | "gable" | "hip" | "shed";
/** A coherent look applied by `applyStylePreset` (absent = the original diorama look). */
export type StylePreset = "indian-modern" | "indian-classic" | "diorama";
export type RailingKind = "glass" | "grille" | "jaali";
/** Regional facade details; each absent flag means "off" (glass railings). */
export type StyleDetails = {
  /** Projecting concrete sunshades over exterior windows and doors. */
  chhajja?: boolean;
  /** Black water tank (and stair head-room) on a flat roof. */
  waterTank?: boolean;
  /** A slim canopy on two columns over the parking pad. */
  carPorch?: boolean;
  railing?: RailingKind;
};
export type ProjectStyle = {
  preset?: StylePreset;
  details?: StyleDetails;
  /** Wins over the legacy `finish`, which stays in sync with its family. */
  exterior?: string;
  trim?: string;
  frontDoor?: string;
  roof?: { style: RoofStyle; material: string; pitch: 20 | 30 | 40 };
};
export type SiteStyle = { ground?: string; fence?: string };

export type Room = {
  id: string;
  name: string;
  kind: RoomKind;
  bounds: Rect;
  unitId: string | null;
  furnishingRotation?: QuarterTurn;
  floorFinish?: "auto" | "wood" | "tile" | "stone";
  furnishing?: "auto" | "none";
  /** Richer floor material id; `floorFinish` keeps the nearest legacy family. */
  floorMaterial?: string;
  wallColor?: string;
  furniture?: FurnitureItem[];
  /** An attached (en-suite) bathroom: the id of the bedroom it opens into. */
  attachedTo?: string;
  /** One wall painted in a contrasting colour (a `WALL_PAINTS` id), seen from inside. */
  accentWall?: AccentWall;
};
export type AccentWall = { edge: EdgeSide; color: string };
export type StagedRoom = { room: Room; sourceFloorId: string };
export type Void = { id: string; kind: "courtyard" | "stairs"; bounds: Rect };
export type Balcony = {
  id: string;
  edge: EdgeSide;
  offset: number;
  width: number;
  depth: number;
};
export type Unit = {
  id: string;
  name: string;
  use: "residential" | "commercial";
};
export type UnitArea = { unitId: string; bounds: Rect };
export type VerticalSpace = Void & {
  floorIds: string[];
  unitId: string | null;
};
export type Floor = {
  id: string;
  name: string;
  elevation: number;
  height: number;
  footprint: Rect;
  rooms: Room[];
  balconies: Balcony[];
  unitAreas: UnitArea[];
  openings?: PlacedOpening[];
};
export type GeometryFloor = Floor & { voids: Void[] };
export type Project = {
  schemaVersion: 2;
  name: string;
  plot: {
    width: number;
    depth: number;
    north: number;
    road: EdgeSide;
    setback: number;
    /** Where the plot is, for a true sun path (rounded; never shared unless asked). */
    location?: PlotLocation;
  };
  floors: Floor[];
  units: Unit[];
  verticalSpaces: VerticalSpace[];
  stagedRooms?: StagedRoom[];
  garden: boolean;
  parking: boolean;
  finish?: "ivory" | "brick" | "sand";
  style?: ProjectStyle;
  site?: SiteStyle;
  landscape?: LandscapeItem[];
  /** Show Vastu tips for this home (opt-in). */
  vastu?: boolean;
  /** The shared home this one was remixed from. */
  remixOf?: { id: string; name: string };
};
export type PlotLocation = { city: string; lat: number; lon: number };
export type Wall = {
  id: string;
  axis: "x" | "z";
  x: number;
  z: number;
  length: number;
  exterior: boolean;
  /** Sorted by offset. */
  openings: WallOpening[];
};

// ---------------------------------------------------------------------------
// Structured edit feedback.
// ---------------------------------------------------------------------------
export type ComponentRef =
  | { kind: "room" | "balcony" | "opening"; id: string; floorId: string }
  | { kind: "furniture"; id: string; floorId: string | null; roomId: string }
  | {
      kind: "vertical" | "unit" | "landscape" | "staged" | "floor";
      id: string;
      floorId?: string;
    }
  | { kind: "project"; id: "project" };
export type IssueFix =
  | { kind: "swap-uses"; floorId: string; sourceId: string; targetId: string }
  | { kind: "set-aside"; floorId: string; roomId: string }
  | { kind: "add-door" | "add-window"; floorId: string; roomId: string }
  | { kind: "reset-openings"; floorId: string }
  | { kind: "edit"; target: ComponentRef; focus: "move" | "resize" }
  | { kind: "undo" };
export type IssueSeverity = "error" | "warning" | "notice";
export type EditIssue = {
  code: string;
  severity: IssueSeverity;
  message: string;
  source?: ComponentRef;
  blockers: ComponentRef[];
  floorIds: string[];
  attempted?: Rect;
  fixes: IssueFix[];
};
export type EditResult =
  | { ok: true; project: Project; focusId?: string; notices?: EditIssue[] }
  | { ok: false; error: string; issues?: EditIssue[] };
export type PresetId = "courtyard" | "compact" | "family";
export type ViewSettings = {
  floor: string | "all";
  stage: number;
  cutaway: boolean;
  walls: boolean;
  openings: boolean;
  landscape: boolean;
  labels: boolean;
  furnishings?: boolean;
  roof: boolean;
  resetKey: number;
  /** Animated street (people, animals, traffic) in Explore; absent = on. */
  streetLife?: boolean;
};
export const ROOM_META: Record<RoomKind, { label: string; color: string }> = {
  shop: { label: "Shop", color: "#d2b6c9" },
  living: { label: "Living room", color: "#e3b98f" },
  kitchen: { label: "Kitchen", color: "#a9c3a1" },
  bedroom: { label: "Bedroom", color: "#b7c4d6" },
  bathroom: { label: "Bathroom", color: "#b9d3d3" },
  dining: { label: "Dining", color: "#e2c98f" },
  utility: { label: "Utility", color: "#cdbfc9" },
};
export const STAGES = ["Plot", "Foundation", "Frame", "Walls", "Slabs", "Roof"];

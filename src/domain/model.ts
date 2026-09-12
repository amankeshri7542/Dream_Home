import {
  ROOM_META,
  type EditResult,
  type Floor,
  type PresetId,
  type Project,
  type Rect,
  type Room,
  type RoomKind,
  type Wall,
} from "./types";

const GRID = 10;
const KINDS: RoomKind[] = [
  "living",
  "kitchen",
  "bedroom",
  "bathroom",
  "dining",
  "utility",
];
const snap = (n: number) => Math.round(n / GRID) * GRID;
const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.z === b.z && a.w === b.w && a.d === b.d;
const contains = (a: Rect, b: Rect) =>
  b.x >= a.x && b.z >= a.z && b.x + b.w <= a.x + a.w && b.z + b.d <= a.z + a.d;
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
const inside = (r: Rect, x: number, z: number) =>
  x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d;
const validRect = (r: Rect, min = 10) =>
  [r.x, r.z, r.w, r.d].every(
    (n) =>
      Number.isFinite(n) &&
      Number.isInteger(n) &&
      n % GRID === 0 &&
      Math.abs(n) <= 10000,
  ) &&
  r.w >= min &&
  r.d >= min;
const rect = (x: number, z: number, w: number, d: number): Rect => ({
  x,
  z,
  w,
  d,
});
const componentIds = (project: Project) =>
  new Set(
    project.floors.flatMap((f) => [
      f.id,
      ...f.rooms.map((r) => r.id),
      ...f.voids.map((v) => v.id),
    ]),
  );
function allocateId(seed: string, used: Set<string>): string {
  let id = seed,
    suffix = 2;
  while (used.has(id)) id = `${seed}-${suffix++}`;
  used.add(id);
  return id;
}

export function balconyBounds(floor: Floor): Rect {
  const width = Math.min(360, floor.footprint.w);
  return rect(
    floor.footprint.x + snap((floor.footprint.w - width) / 2),
    floor.footprint.z + floor.footprint.d,
    width,
    150,
  );
}
const result = (project: Project): EditResult => {
  const errors = validateProject(project);
  return errors.length
    ? { ok: false, error: errors[0] }
    : { ok: true, project };
};

function makeFloor(index: number, footprint: Rect, courtyard: boolean): Floor {
  const id = `floor-${index}`;
  const { x, z, w, d } = footprint;
  const rooms: Room[] =
    w >= 1200
      ? [
          {
            id: `${id}-living`,
            name: index ? "Bedroom 2" : "Living room",
            kind: index ? "bedroom" : "living",
            bounds: rect(x, z, 450, 470),
          },
          {
            id: `${id}-kitchen`,
            name: index ? "Studio" : "Kitchen",
            kind: index ? "utility" : "kitchen",
            bounds: rect(x + w - 400, z, 400, 360),
          },
          {
            id: `${id}-dining`,
            name: index ? "Family lounge" : "Dining room",
            kind: index ? "living" : "dining",
            bounds: rect(x + w - 400, z + 400, 400, 430),
          },
          {
            id: `${id}-bedroom`,
            name: index ? "Bedroom 3" : "Bedroom 1",
            kind: "bedroom",
            bounds: rect(x, z + d - 530, 470, 530),
          },
          {
            id: `${id}-bathroom`,
            name: "Bathroom",
            kind: "bathroom",
            bounds: rect(x, z + 530, 280, 280),
          },
        ]
      : [
          {
            id: `${id}-living`,
            name: index ? "Bedroom 2" : "Living room",
            kind: index ? "bedroom" : "living",
            bounds: rect(x, z, 400, 380),
          },
          {
            id: `${id}-kitchen`,
            name: "Kitchen",
            kind: "kitchen",
            bounds: rect(x + w - 300, z, 300, 320),
          },
          {
            id: `${id}-bedroom`,
            name: "Bedroom 1",
            kind: "bedroom",
            bounds: rect(x, z + d - 400, 400, 400),
          },
          {
            id: `${id}-bathroom`,
            name: "Bathroom",
            kind: "bathroom",
            bounds: rect(x + w - 240, z + 370, 240, 240),
          },
        ];
  return {
    id,
    name:
      index === 0
        ? "Ground floor"
        : `${index === 1 ? "First" : "Second"} floor`,
    elevation: index * 300,
    height: 300,
    footprint: { ...footprint },
    rooms,
    voids: [
      ...(courtyard
        ? [
            {
              id: `${id}-courtyard`,
              kind: "courtyard" as const,
              bounds: rect(x + 480, z + 530, 240, 320),
            },
          ]
        : []),
      {
        id: `${id}-stairs`,
        kind: "stairs",
        bounds: rect(x + w - 260, z + d - 400, 260, 400),
      },
    ],
    balcony: index > 0,
  };
}

export function createPreset(id: PresetId): Project {
  const compact = id === "compact";
  const footprint = compact
    ? rect(250, 450, 900, 1100)
    : rect(300, 500, 1200, 1400);
  return {
    schemaVersion: 1,
    name:
      id === "courtyard"
        ? "The Courtyard House"
        : compact
          ? "A Little Sanctuary"
          : "Room to Grow",
    plot: {
      width: compact ? 1400 : 1800,
      depth: compact ? 1900 : 2400,
      north: 0,
      road: "south",
      setback: 200,
    },
    floors: Array.from({ length: compact ? 1 : 2 }, (_, i) =>
      makeFloor(i, footprint, id === "courtyard"),
    ),
    garden: true,
    parking: true,
  };
}

export function validateProject(project: Project): string[] {
  const errors: string[] = [];
  const { plot } = project;
  if (
    ![plot.width, plot.depth].every(
      (n) => Number.isInteger(n) && n >= 400 && n <= 10000,
    )
  )
    errors.push("Plot dimensions must be 4–100 m, in whole centimetres.");
  if (
    !Number.isInteger(plot.setback) ||
    plot.setback < 0 ||
    plot.setback > 2000 ||
    plot.setback % GRID !== 0
  )
    errors.push("Setback must be 0–20 m, in 0.1 m steps.");
  if (!Number.isFinite(plot.north) || plot.north < 0 || plot.north >= 360)
    errors.push("Orientation must be between 0 and 359 degrees.");
  if (!["south", "north", "east", "west"].includes(plot.road))
    errors.push("Choose a valid road-facing side.");
  if (project.floors.length < 1 || project.floors.length > 3)
    errors.push("Choose one to three floors.");
  const envelope = rect(
    plot.setback,
    plot.setback,
    plot.width - 2 * plot.setback,
    plot.depth - 2 * plot.setback,
  );
  const allIds = new Set<string>();
  const checkId = (id: string) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || allIds.has(id))
      errors.push("Every component must have a unique, valid ID.");
    allIds.add(id);
  };
  for (const [index, floor] of project.floors.entries()) {
    checkId(floor.id);
    if (floor.height !== 300 || floor.elevation !== index * 300)
      errors.push(
        "Floors must use aligned 3 m storeys, starting at ground level.",
      );
    if (
      !validRect(floor.footprint, 400) ||
      !contains(envelope, floor.footprint)
    )
      errors.push(
        "The home must fit inside the plot setbacks. Increase the plot or reduce the setback.",
      );
    if (floor.balcony && !contains(envelope, balconyBounds(floor)))
      errors.push(
        "The balcony must fit inside the plot setbacks. Increase plot depth or reduce the setback.",
      );
    if (index && !sameRect(floor.footprint, project.floors[0].footprint))
      errors.push("Floor footprints must stay aligned in this version.");
    if (floor.rooms.length > 24 || floor.voids.length > 8)
      errors.push("Each floor supports up to 24 rooms and 8 reserved spaces.");
    for (const [i, room] of floor.rooms.entries()) {
      checkId(room.id);
      if (!KINDS.includes(room.kind)) errors.push("Unknown room type.");
      if (!room.name.trim() || room.name.length > 80)
        errors.push("Room names must contain 1–80 characters.");
      if (!validRect(room.bounds, 120))
        errors.push("Rooms need dimensions of at least 1.2 m, in 0.1 m steps.");
      if (!contains(floor.footprint, room.bounds))
        errors.push(`${room.name} must stay inside the floor boundary.`);
      if (
        floor.rooms
          .slice(i + 1)
          .some((other) => overlaps(room.bounds, other.bounds))
      )
        errors.push(
          `${room.name} overlaps another room. Leave space before moving or resizing.`,
        );
      if (floor.voids.some((v) => overlaps(room.bounds, v.bounds)))
        errors.push(`${room.name} overlaps the courtyard or stair opening.`);
    }
    for (const [i, space] of floor.voids.entries()) {
      checkId(space.id);
      if (
        !["courtyard", "stairs"].includes(space.kind) ||
        !validRect(space.bounds, 120) ||
        !contains(floor.footprint, space.bounds)
      )
        errors.push("Reserved spaces must fit inside the floor boundary.");
      if (
        floor.voids
          .slice(i + 1)
          .some((other) => overlaps(space.bounds, other.bounds))
      )
        errors.push("Reserved spaces cannot overlap.");
    }
    const stairs = floor.voids.filter((v) => v.kind === "stairs").length;
    if (stairs > 1 || (project.floors.length > 1 && stairs !== 1))
      errors.push(
        "Multi-floor homes need one aligned stair connection on every floor.",
      );
    if (index) {
      const base = project.floors[0].voids;
      if (
        base.length !== floor.voids.length ||
        base.some(
          (v) =>
            !floor.voids.some(
              (other) =>
                other.kind === v.kind && sameRect(v.bounds, other.bounds),
            ),
        )
      )
        errors.push(
          "Courtyard and stair openings must align across every floor.",
        );
    }
  }
  return [...new Set(errors)];
}

export function updateRoom(
  project: Project,
  floorId: string,
  roomId: string,
  patch: Partial<Room>,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !room) return { ok: false, error: "Room not found." };
  if (patch.id && patch.id !== roomId)
    return { ok: false, error: "A room ID cannot change." };
  const bounds = patch.bounds
    ? (Object.fromEntries(
        Object.entries(patch.bounds).map(([k, v]) => [k, snap(v)]),
      ) as Rect)
    : room.bounds;
  const next = { ...room, ...patch, id: roomId, bounds };
  return result({
    ...project,
    floors: project.floors.map((f) =>
      f.id === floorId
        ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? next : r)) }
        : f,
    ),
  });
}

export function addRoom(
  project: Project,
  floorId: string,
  kind: RoomKind,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor || !KINDS.includes(kind))
    return { ok: false, error: "Choose a valid floor and room type." };
  if (floor.rooms.length >= 24)
    return { ok: false, error: "This floor already has the maximum 24 rooms." };
  const id = allocateId(`room-${kind}`, componentIds(project));
  const w = kind === "bathroom" ? 180 : 300;
  const d = kind === "bathroom" ? 240 : 300;
  for (
    let z = floor.footprint.z;
    z + d <= floor.footprint.z + floor.footprint.d;
    z += 50
  ) {
    for (
      let x = floor.footprint.x;
      x + w <= floor.footprint.x + floor.footprint.w;
      x += 50
    ) {
      const bounds = rect(x, z, w, d);
      if (
        ![...floor.rooms, ...floor.voids].some((r) =>
          overlaps(r.bounds, bounds),
        )
      ) {
        const room: Room = { id, name: ROOM_META[kind].label, kind, bounds };
        return result({
          ...project,
          floors: project.floors.map((f) =>
            f.id === floorId ? { ...f, rooms: [...f.rooms, room] } : f,
          ),
        });
      }
    }
  }
  return {
    ok: false,
    error: "No free space for this room. Move, resize or remove a room first.",
  };
}

export function removeRoom(
  project: Project,
  floorId: string,
  roomId: string,
): EditResult {
  if (
    !project.floors.some(
      (f) => f.id === floorId && f.rooms.some((r) => r.id === roomId),
    )
  )
    return { ok: false, error: "Room not found." };
  return result({
    ...project,
    floors: project.floors.map((f) =>
      f.id === floorId
        ? { ...f, rooms: f.rooms.filter((r) => r.id !== roomId) }
        : f,
    ),
  });
}

export function setFloorCount(project: Project, count: number): EditResult {
  if (!Number.isInteger(count) || count < 1 || count > 3)
    return { ok: false, error: "Choose one to three floors." };
  if (
    count > project.floors.length &&
    !project.floors[0].voids.some((v) => v.kind === "stairs")
  )
    return {
      ok: false,
      error:
        "This home has no reserved staircase. Start a new two-floor layout to include aligned stairs, or keep this single-floor plan.",
    };
  const floors = project.floors.slice(0, count);
  const usedIds = componentIds(project);
  while (floors.length < count) {
    const index = floors.length;
    const source = project.floors[project.floors.length - 1];
    const id = allocateId(`floor-${index}`, usedIds);
    floors.push({
      ...source,
      id,
      name: index === 1 ? "First floor" : "Second floor",
      elevation: index * 300,
      footprint: { ...source.footprint },
      balcony: false,
      rooms: source.rooms.map((r, i) => ({
        ...r,
        id: allocateId(`${id}-room-${i}`, usedIds),
        bounds: { ...r.bounds },
      })),
      voids: source.voids.map((v, i) => ({
        ...v,
        id: allocateId(`${id}-void-${i}`, usedIds),
        bounds: { ...v.bounds },
      })),
    });
  }
  return result({ ...project, floors });
}

export function updatePlot(
  project: Project,
  patch: Partial<Project["plot"]>,
): EditResult {
  const plot = { ...project.plot, ...patch };
  plot.width = Math.round(plot.width);
  plot.depth = Math.round(plot.depth);
  plot.setback = snap(plot.setback);
  return result({ ...project, plot });
}

type Edge = {
  axis: "x" | "z";
  fixed: number;
  start: number;
  end: number;
  exterior: boolean;
};
function edges(r: Rect, exterior: boolean): Edge[] {
  return [
    { axis: "x", fixed: r.z, start: r.x, end: r.x + r.w, exterior },
    { axis: "x", fixed: r.z + r.d, start: r.x, end: r.x + r.w, exterior },
    { axis: "z", fixed: r.x, start: r.z, end: r.z + r.d, exterior },
    { axis: "z", fixed: r.x + r.w, start: r.z, end: r.z + r.d, exterior },
  ];
}

export function deriveWalls(
  floor: Floor,
  road: Project["plot"]["road"] = "south",
): Wall[] {
  const allEdges = [
    ...edges(floor.footprint, true),
    ...floor.rooms.flatMap((r) => edges(r.bounds, false)),
    ...floor.voids
      .filter((v) => v.kind === "courtyard")
      .flatMap((v) => edges(v.bounds, true)),
  ];
  const groups = new Map<string, Edge[]>();
  for (const edge of allEdges) {
    const key = `${edge.axis}:${edge.fixed}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  const walls: Wall[] = [];
  for (const group of groups.values()) {
    const { axis, fixed } = group[0];
    // Split perimeter segments at stair and balcony limits so entrance placement
    // cannot span a reserved shaft or extend beyond its balcony landing.
    const extras = floor.voids
      .flatMap((v) => edges(v.bounds, false))
      .filter((e) => e.axis === axis && e.fixed === fixed)
      .flatMap((e) => [e.start, e.end]);
    if (
      floor.balcony &&
      axis === "x" &&
      fixed === floor.footprint.z + floor.footprint.d
    ) {
      const balcony = balconyBounds(floor);
      extras.push(balcony.x, balcony.x + balcony.w);
    }
    const cuts = [
      ...new Set([...group.flatMap((e) => [e.start, e.end]), ...extras]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i],
        end = cuts[i + 1];
      const covering = group.filter((e) => e.start <= start && e.end >= end);
      if (!covering.length) continue;
      const { axis, fixed } = group[0];
      walls.push({
        id: `${floor.id}-${axis}-${fixed}-${start}-${end}`,
        axis,
        x: axis === "x" ? start : fixed,
        z: axis === "z" ? start : fixed,
        length: end - start,
        exterior: covering.some((e) => e.exterior),
      });
    }
  }
  // One door per room, preferring a circulation boundary over a shared partition.
  for (const room of floor.rooms) {
    const candidates = walls.filter(
      (w) =>
        !w.exterior &&
        w.length >= 120 &&
        edges(room.bounds, false).some(
          (e) =>
            e.axis === w.axis &&
            e.fixed === (w.axis === "x" ? w.z : w.x) &&
            e.start <= (w.axis === "x" ? w.x : w.z) &&
            e.end >= (w.axis === "x" ? w.x : w.z) + w.length,
        ),
    );
    const owners = (w: Wall) =>
      floor.rooms.filter((r) => {
        const x = w.x + (w.axis === "x" ? w.length / 2 : 0),
          z = w.z + (w.axis === "z" ? w.length / 2 : 0);
        return (
          inside(
            r.bounds,
            x + (w.axis === "z" ? 1 : 0),
            z + (w.axis === "x" ? 1 : 0),
          ) ||
          inside(
            r.bounds,
            x - (w.axis === "z" ? 1 : 0),
            z - (w.axis === "x" ? 1 : 0),
          )
        );
      }).length;
    candidates.sort(
      (a, b) =>
        owners(a) - owners(b) ||
        b.length - a.length ||
        a.id.localeCompare(b.id),
    );
    if (candidates[0])
      candidates[0].opening = { kind: "door", width: 90, sill: 0, height: 215 };
  }
  for (const w of walls)
    if (w.exterior && w.length >= 180)
      w.opening = {
        kind: "window",
        width: Math.min(180, w.length - 60),
        sill: 90,
        height: 135,
      };
  const side = floor.elevation === 0 ? road : "south";
  const p = floor.footprint;
  const atSide = (w: Wall) =>
    side === "south"
      ? w.axis === "x" && w.z === p.z + p.d
      : side === "north"
        ? w.axis === "x" && w.z === p.z
        : side === "east"
          ? w.axis === "z" && w.x === p.x + p.w
          : w.axis === "z" && w.x === p.x;
  const landing = (w: Wall) => {
    const x = w.x + (w.axis === "x" ? w.length / 2 : 0),
      z = w.z + (w.axis === "z" ? w.length / 2 : 0);
    return w.axis === "x"
      ? rect(x - 55, z + (side === "north" ? 0 : -2), 110, 2)
      : rect(x + (side === "west" ? 0 : -2), z - 55, 2, 110);
  };
  const balcony = balconyBounds(floor);
  const front = walls.filter(
    (w) =>
      atSide(w) &&
      w.length >= 150 &&
      !floor.voids.some((v) => overlaps(v.bounds, landing(w))) &&
      (floor.elevation === 0 ||
        (floor.balcony &&
          w.x + w.length / 2 - 55 >= balcony.x &&
          w.x + w.length / 2 + 55 <= balcony.x + balcony.w)),
  );
  const frontScore = (w: Wall) =>
    floor.rooms.some((r) => overlaps(r.bounds, landing(w))) ? 1 : 0;
  front.sort((a, b) => frontScore(a) - frontScore(b) || b.length - a.length);
  if (front[0])
    front[0].opening = { kind: "door", width: 110, sill: 0, height: 230 };
  return walls.sort((a, b) => a.id.localeCompare(b.id));
}

export function slabTiles(floor: Floor, includeStairHole: boolean): Rect[] {
  let tiles = [{ ...floor.footprint }];
  for (const hole of floor.voids.filter(
    (v) => v.kind === "courtyard" || includeStairHole,
  )) {
    tiles = tiles.flatMap((tile) => {
      if (!overlaps(tile, hole.bounds)) return [tile];
      const x1 = Math.max(tile.x, hole.bounds.x),
        x2 = Math.min(tile.x + tile.w, hole.bounds.x + hole.bounds.w);
      const z1 = Math.max(tile.z, hole.bounds.z),
        z2 = Math.min(tile.z + tile.d, hole.bounds.z + hole.bounds.d);
      return [
        rect(tile.x, tile.z, tile.w, z1 - tile.z),
        rect(tile.x, z2, tile.w, tile.z + tile.d - z2),
        rect(tile.x, z1, x1 - tile.x, z2 - z1),
        rect(x2, z1, tile.x + tile.w - x2, z2 - z1),
      ].filter((r) => r.w > 0 && r.d > 0);
    });
  }
  return tiles;
}

export function parseProject(text: string): Project {
  if (text.length > 200_000)
    throw new Error("Project file is too large (maximum 200 KB).");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= 80;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const rectangle = (v: unknown) =>
    obj(v) && ["x", "z", "w", "d"].every((k) => num(v[k]));
  if (
    !obj(value) ||
    value.schemaVersion !== 1 ||
    !str(value.name) ||
    !obj(value.plot) ||
    !["width", "depth", "north", "setback"].every((k) =>
      num((value.plot as Record<string, unknown>)[k]),
    ) ||
    typeof value.plot.road !== "string" ||
    typeof value.garden !== "boolean" ||
    typeof value.parking !== "boolean" ||
    !Array.isArray(value.floors) ||
    value.floors.length < 1 ||
    value.floors.length > 3
  )
    throw new Error("This is not a supported Dream-Home project.");
  for (const floor of value.floors) {
    if (
      !obj(floor) ||
      !str(floor.id) ||
      !str(floor.name) ||
      !num(floor.elevation) ||
      !num(floor.height) ||
      !rectangle(floor.footprint) ||
      typeof floor.balcony !== "boolean" ||
      !Array.isArray(floor.rooms) ||
      floor.rooms.length > 24 ||
      !Array.isArray(floor.voids) ||
      floor.voids.length > 8
    )
      throw new Error("Project contains an invalid floor.");
    for (const room of floor.rooms)
      if (
        !obj(room) ||
        !str(room.id) ||
        !str(room.name) ||
        typeof room.kind !== "string" ||
        !rectangle(room.bounds)
      )
        throw new Error("Project contains an invalid room.");
    for (const space of floor.voids)
      if (
        !obj(space) ||
        !str(space.id) ||
        typeof space.kind !== "string" ||
        !rectangle(space.bounds)
      )
        throw new Error("Project contains an invalid reserved space.");
  }
  const project = value as Project;
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors[0]);
  // Copy only known fields: imported metadata cannot become executable or mutable application state.
  return {
    schemaVersion: 1,
    name: project.name,
    plot: {
      width: project.plot.width,
      depth: project.plot.depth,
      north: project.plot.north,
      road: project.plot.road,
      setback: project.plot.setback,
    },
    garden: project.garden,
    parking: project.parking,
    floors: project.floors.map((f) => ({
      id: f.id,
      name: f.name,
      elevation: f.elevation,
      height: f.height,
      footprint: {
        x: f.footprint.x,
        z: f.footprint.z,
        w: f.footprint.w,
        d: f.footprint.d,
      },
      balcony: f.balcony,
      rooms: f.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        bounds: { x: r.bounds.x, z: r.bounds.z, w: r.bounds.w, d: r.bounds.d },
      })),
      voids: f.voids.map((v) => ({
        id: v.id,
        kind: v.kind,
        bounds: { x: v.bounds.x, z: v.bounds.z, w: v.bounds.w, d: v.bounds.d },
      })),
    })),
  };
}

export function projectStats(project: Project): {
  plotArea: number;
  builtArea: number;
  bedrooms: number;
  coverage: number;
} {
  const plotArea = (project.plot.width * project.plot.depth) / 10000;
  const area = (floor: Floor) =>
    slabTiles(floor, false).reduce((sum, r) => sum + (r.w * r.d) / 10000, 0);
  return {
    plotArea,
    builtArea: project.floors.reduce((sum, f) => sum + area(f), 0),
    bedrooms: project.floors.reduce(
      (sum, f) => sum + f.rooms.filter((r) => r.kind === "bedroom").length,
      0,
    ),
    coverage: plotArea ? (area(project.floors[0]) / plotArea) * 100 : 0,
  };
}

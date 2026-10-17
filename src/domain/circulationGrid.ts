// A floor as a 10 cm grid, for asking "can a person walk here?". Rooms, open
// floor (halls and passages that aren't rooms), and blocked cells (stair and
// courtyard holes). Open floor counts as walkable only where a person fits:
// a strip narrower than ~70 cm is a gap between walls, not a hall.
//
// Pure and dependency-light: walls.ts uses it to choose doors, so it must not
// import walls.ts (circulation.ts builds the project-level checks on top).
import type { GeometryFloor, OpeningKind, Rect } from "./types";

export const CELL = 10;
/** Half-width (in cells) of the clearance a person needs: (2·3+1)·10 = 70 cm. */
const CLEAR = 3;
/** How far beyond a door the way must be clear, cm. */
export const APPROACH_DEPTH = 80;

const BLOCKED = -2,
  FREE = -1;

export type FloorGrid = {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Per cell: room index (≥ 0), FREE (-1) or BLOCKED (-2). */
  owner: Int16Array;
  /** Per free cell: unit-area index + 1 (0 = no unit), else -1. */
  label: Int16Array;
  /** Per cell: walkable component id (≥ 0) or -1. */
  comp: Int32Array;
  /** Cells per walkable component. */
  compSize: number[];
};

const cache = new WeakMap<object, { key: string; grid: FloorGrid }>();
function gridKey(floor: GeometryFloor) {
  return JSON.stringify([
    floor.footprint,
    floor.rooms.map((r) => r.bounds),
    floor.voids.map((v) => v.bounds),
    floor.unitAreas.map((a) => [a.unitId, a.bounds]),
  ]);
}

/** The floor's grid (cached per room list; rebuilt when anything moves). */
export function floorGrid(floor: GeometryFloor): FloorGrid {
  const key = gridKey(floor);
  const hit = cache.get(floor.rooms);
  if (hit && hit.key === key) return hit.grid;
  const grid = buildGrid(floor);
  cache.set(floor.rooms, { key, grid });
  return grid;
}

function buildGrid(floor: GeometryFloor): FloorGrid {
  const fp = floor.footprint;
  const nx = Math.max(1, Math.ceil(fp.w / CELL)),
    nz = Math.max(1, Math.ceil(fp.d / CELL));
  const n = nx * nz;
  const owner = new Int16Array(n).fill(FREE);
  const label = new Int16Array(n).fill(-1);
  const paint = (r: Rect, value: number, into: Int16Array) => {
    const i0 = Math.max(0, Math.floor((r.x - fp.x) / CELL)),
      i1 = Math.min(nx, Math.ceil((r.x + r.w - fp.x) / CELL)),
      j0 = Math.max(0, Math.floor((r.z - fp.z) / CELL)),
      j1 = Math.min(nz, Math.ceil((r.z + r.d - fp.z) / CELL));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) into[j * nx + i] = value;
  };
  floor.voids.forEach((v) => paint(v.bounds, BLOCKED, owner));
  floor.rooms.forEach((r, k) => paint(r.bounds, k, owner));
  // Open floor belongs to the unit area it sits in (walls run along unit edges).
  for (let c = 0; c < n; c++) if (owner[c] === FREE) label[c] = 0;
  floor.unitAreas.forEach((a, k) => {
    const lab = new Int16Array(n).fill(-1);
    paint(a.bounds, k + 1, lab);
    for (let c = 0; c < n; c++) if (owner[c] === FREE && lab[c] > 0) label[c] = lab[c];
  });
  // Walkable: a (2·CLEAR+1)² square of same-unit open floor around the cell.
  const row = new Uint8Array(n);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (label[c] < 0) continue;
      let ok = i - CLEAR >= 0 && i + CLEAR < nx;
      for (let k = -CLEAR; ok && k <= CLEAR; k++) ok = label[c + k] === label[c];
      row[c] = ok ? 1 : 0;
    }
  const walk = new Uint8Array(n);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (!row[c]) continue;
      let ok = j - CLEAR >= 0 && j + CLEAR < nz;
      for (let k = -CLEAR; ok && k <= CLEAR; k++) ok = row[c + k * nx] === 1 && label[c + k * nx] === label[c];
      walk[c] = ok ? 1 : 0;
    }
  // The clearance square's centre can reach the cells it covers: grow back so
  // a hall's own edge cells count too (opening with the same square).
  const reach = new Uint8Array(n);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (!walk[j * nx + i]) continue;
      for (let dj = -CLEAR; dj <= CLEAR; dj++)
        for (let di = -CLEAR; di <= CLEAR; di++) reach[(j + dj) * nx + (i + di)] = 1;
    }
  // Connected walkable components (4-neighbour, same unit).
  const comp = new Int32Array(n).fill(-1);
  const compSize: number[] = [];
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!reach[s] || comp[s] >= 0) continue;
    const id = compSize.length;
    let head = 0,
      tail = 0,
      size = 0;
    queue[tail++] = s;
    comp[s] = id;
    while (head < tail) {
      const c = queue[head++];
      size++;
      const i = c % nx,
        j = (c - i) / nx;
      const next = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < nz - 1 ? c + nx : -1];
      for (const m of next)
        if (m >= 0 && reach[m] && comp[m] < 0 && label[m] === label[c]) {
          comp[m] = id;
          queue[tail++] = m;
        }
    }
    compSize.push(size);
  }
  return { x0: fp.x, z0: fp.z, nx, nz, owner, label, comp, compSize };
}

/** What lies on one side of a doorway. */
export type Side =
  | { kind: "room"; room: number }
  | { kind: "open"; comp: number; size: number }
  | { kind: "outside" }
  | { kind: "blocked" };

/**
 * The area just beyond an opening on one side (+1: toward +x/+z), `depth`
 * deep and as wide as the opening: one room, walkable open floor, outside
 * the house, or blocked (a wall, a gap too narrow to walk, a stair hole).
 */
export function sideOf(
  grid: FloorGrid,
  o: { axis: "x" | "z"; line: number; center: number; width: number },
  side: 1 | -1,
  depth = APPROACH_DEPTH,
): Side {
  const half = Math.min(o.width, 90) / 2;
  const along0 = o.center - half,
    along1 = o.center + half;
  const across0 = side > 0 ? o.line : o.line - depth,
    across1 = side > 0 ? o.line + depth : o.line;
  const [x0, x1, z0, z1] = o.axis === "x" ? [along0, along1, across0, across1] : [across0, across1, along0, along1];
  const i0 = Math.floor((x0 - grid.x0) / CELL),
    i1 = Math.ceil((x1 - grid.x0) / CELL),
    j0 = Math.floor((z0 - grid.z0) / CELL),
    j1 = Math.ceil((z1 - grid.z0) / CELL);
  // Entirely beyond the footprint: outside (a garden, a road, a balcony).
  if (i1 <= 0 || j1 <= 0 || i0 >= grid.nx || j0 >= grid.nz) return { kind: "outside" };
  if (i0 < 0 || j0 < 0 || i1 > grid.nx || j1 > grid.nz) return { kind: "blocked" };
  let room = -3,
    comp = -1;
  for (let j = j0; j < j1; j++)
    for (let i = i0; i < i1; i++) {
      const c = j * grid.nx + i;
      const o2 = grid.owner[c];
      if (o2 === BLOCKED) return { kind: "blocked" };
      if (room === -3) room = o2;
      else if (room !== o2) return { kind: "blocked" };
      if (o2 === FREE) {
        if (grid.comp[c] < 0) return { kind: "blocked" };
        if (comp < 0) comp = grid.comp[c];
        else if (comp !== grid.comp[c]) return { kind: "blocked" };
      }
    }
  if (room >= 0) return { kind: "room", room };
  return { kind: "open", comp, size: grid.compSize[comp] ?? 0 };
}

/** Graph node for a side ("r3", "o1", "out"), or null when blocked. */
export const sideNode = (s: Side) =>
  s.kind === "room" ? `r${s.room}` : s.kind === "open" ? `o${s.comp}` : s.kind === "outside" ? "out" : null;

const PASSABLE = new Set<OpeningKind>(["door", "french-door", "sliding-door", "archway"]);
export type GridOpening = {
  id?: string;
  kind: OpeningKind;
  axis: "x" | "z";
  line: number;
  center: number;
  width: number;
};

/**
 * Nodes a person can reach on this floor, entering through outside doors on
 * the ground floor, or from the stairs on upper floors. Null when the floor
 * has no way in at all (the "stairs" check covers that).
 */
function doorGraph(grid: FloorGrid, openings: readonly GridOpening[]) {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const o of openings) {
    if (!PASSABLE.has(o.kind)) continue;
    const a = sideNode(sideOf(grid, o, 1)),
      b = sideNode(sideOf(grid, o, -1));
    if (a && b && a !== b) link(a, b);
  }
  return adj;
}
/** Nodes connected to `from` through doors (inside this floor only). */
export function connectedNodes(grid: FloorGrid, openings: readonly GridOpening[], from: string): Set<string> {
  const adj = doorGraph(grid, openings);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length)
    for (const m of adj.get(queue.pop()!) ?? [])
      if (m !== "out" && !seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
  return seen;
}

export function reachableNodes(
  floor: GeometryFloor,
  grid: FloorGrid,
  openings: readonly GridOpening[],
): Set<string> | null {
  const adj = doorGraph(grid, openings);
  const start: string[] = [];
  if (floor.elevation === 0) {
    for (const n of adj.get("out") ?? []) start.push(n);
  }
  // Upper floors: whatever walkable floor or room sits right beside the stair hole.
  for (const v of floor.voids) {
    if (v.kind !== "stairs" || floor.elevation === 0) continue;
    const b = v.bounds;
    const ring: Rect[] = [
      { x: b.x, z: b.z - CELL, w: b.w, d: CELL },
      { x: b.x, z: b.z + b.d, w: b.w, d: CELL },
      { x: b.x - CELL, z: b.z, w: CELL, d: b.d },
      { x: b.x + b.w, z: b.z, w: CELL, d: b.d },
    ];
    for (const r of ring)
      for (let z = r.z; z < r.z + r.d; z += CELL)
        for (let x = r.x; x < r.x + r.w; x += CELL) {
          const i = Math.floor((x - grid.x0) / CELL),
            j = Math.floor((z - grid.z0) / CELL);
          if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
          const c = j * grid.nx + i;
          const own = grid.owner[c];
          if (own >= 0) start.push(`r${own}`);
          else if (grid.comp[c] >= 0) start.push(`o${grid.comp[c]}`);
        }
  }
  const hasWayIn = floor.elevation === 0 || floor.voids.some((v) => v.kind === "stairs");
  if (!start.length) return hasWayIn ? new Set() : null;
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length) {
    const n = queue.pop()!;
    for (const m of adj.get(n) ?? []) {
      if (m === "out" || seen.has(m)) continue;
      seen.add(m);
      queue.push(m);
    }
  }
  return seen;
}

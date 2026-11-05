// Room light (pure): works out how daylight and lamps fill the rooms of a floor.
//
// A room here is a box with rectangular openings, so nothing needs ray tracing.
//  1. Each face is cut into patches; each window, door and lamp lights them.
//     Sun through a window is projected onto the patches it reaches.
//  2. A few gathering passes bounce that light round the room, so a ceiling
//     takes the floor's colour and a sunlit floor warms the room. Open doors
//     pass light between rooms.
//  3. Every grid cell sums each source's *irradiance vector* (Lambert's closed
//     form for a polygon, with Heitz's fit for θ/sinθ) into an ambient cube: the
//     exact irradiance on a surface facing each axis, which is what walls, floors
//     and ceilings are. Colour is one warm-to-cool number, so two textures hold it all.
// Units are three.js's: a white surface shows irradiance E as radiance E/π.

export type V3 = [number, number, number];
export type RGB = [number, number, number];

export type LightOpening = {
  /** Corner, then the two edge vectors (along the wall, then up). World metres. */
  p: V3;
  u: V3;
  v: V3;
  /** Unit normal pointing into the room. */
  inward: V3;
  kind: "window" | "door-out" | "portal";
  /** A portal's room on the other side. */
  to?: string;
};

export type LightLamp = { position: V3; color: RGB; intensity: number };

export type LightRoom = {
  id: string;
  /** Inner box, world metres. */
  min: V3;
  max: V3;
  /** Linear albedos. */
  walls: { xMin: RGB; xMax: RGB; zMin: RGB; zMax: RGB };
  floor: RGB;
  ceiling: RGB;
  openings: LightOpening[];
  lamps: LightLamp[];
};

export type LightSky = {
  /** Radiance through a window looking up at the sky, and down at the ground outside. */
  sky: RGB;
  ground: RGB;
  /** Direction towards the sun and its irradiance; null below the horizon. */
  sun: { dir: V3; irradiance: RGB } | null;
  /** The brightness (irradiance on a wall) a careful photographer exposes a room to. */
  target: number;
  /** How much of the light's colour to neutralise (0 keeps it, 1 removes it); default WHITE_BALANCE. */
  balance?: number;
  /** The light's colour temperature, for the debug bridge and tests. */
  kelvin?: number;
};

export type LightGridSpec = { min: V3; max: V3; cell: number; cellY: number };

export type LightGrid = {
  min: V3;
  /** World size of the grid (nx·cell etc). */
  size: V3;
  nx: number;
  ny: number;
  nz: number;
  /**
   * nx·ny·nz·4 floats. With E±x the luminance irradiance on a surface facing ±x:
   * (Ex+ − Ex−, Ey+ − Ey−, Ez+ − Ez−, mask: 1 inside rooms).
   */
  signed: Float32Array;
  /** nx·ny·nz·4 floats: (Ex+ + Ex−, Ey+ + Ey−, Ez+ + Ez−, warmth: (red − blue) ÷ green). */
  total: Float32Array;
  /** Per-room exposure, for tests and the debug panel. */
  gains: Record<string, number>;
};

type Patch = {
  cx: number;
  cy: number;
  cz: number;
  nx: number;
  ny: number;
  nz: number;
  area: number;
  albedo: RGB;
  /** Corner and edges, for the gather rectangles. */
  p: V3;
  u: V3;
  v: V3;
  /** Direct light on this patch. */
  e0: RGB;
  /** Irradiance after bouncing. */
  e: RGB;
  /** Which coarse rectangle it belongs to. */
  block: number;
};

/** A rectangle that lights cells: four corners, its radiance, and what's needed to pick a sign. */
type Emitter = { corners: Float64Array; rgb: RGB; cx: number; cy: number; cz: number; nx: number; ny: number; nz: number; split?: { y: number; band: number; sky: RGB; ground: RGB } };

const PATCH = 0.8;
const BOUNCES = 4;
const SUN_SAMPLES = 3;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lum = (c: RGB) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

/**
 * The form-factor vector of a rectangle at a point, added into `out` times `scale`:
 * 1/(2π) Σ (θ/sinθ) (vᵢ × vᵢ₊₁). `F·n` is the form factor seen by a surface facing n.
 */
const v = new Float64Array(12);
function formFactor(px: number, py: number, pz: number, c: Float64Array, out: Float64Array) {
  for (let i = 0; i < 4; i++) {
    const x = c[i * 3] - px,
      y = c[i * 3 + 1] - py,
      z = c[i * 3 + 2] - pz;
    const l = 1 / (Math.sqrt(x * x + y * y + z * z) + 1e-6);
    v[i * 3] = x * l;
    v[i * 3 + 1] = y * l;
    v[i * 3 + 2] = z * l;
  }
  let fx = 0,
    fy = 0,
    fz = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) & 3;
    const ax = v[i * 3],
      ay = v[i * 3 + 1],
      az = v[i * 3 + 2],
      bx = v[j * 3],
      by = v[j * 3 + 1],
      bz = v[j * 3 + 2];
    const d = ax * bx + ay * by + az * bz;
    const a = Math.abs(d);
    // Heitz's rational fit (LTC): θ/sinθ with no acos.
    const t = (0.8543985 + (0.4965155 + 0.0145206 * a) * a) / (3.417594 + (4.1616724 + a) * a);
    const k = d > 0 ? t : 0.5 / Math.sqrt(Math.max(1 - d * d, 1e-7)) - t;
    fx += (ay * bz - az * by) * k;
    fy += (az * bx - ax * bz) * k;
    fz += (ax * by - ay * bx) * k;
  }
  // The fit returns (θ/sinθ)/(2π)-scaled values; winding is fixed by the caller.
  out[0] = fx;
  out[1] = fy;
  out[2] = fz;
}

const F = new Float64Array(3);
/** F of an emitter at a point, signed so it points towards the emitter. */
function emitterVector(px: number, py: number, pz: number, e: Emitter) {
  formFactor(px, py, pz, e.corners, F);
  if (F[0] * (e.cx - px) + F[1] * (e.cy - py) + F[2] * (e.cz - pz) < 0) {
    F[0] = -F[0];
    F[1] = -F[1];
    F[2] = -F[2];
  }
}

function emitter(p: V3, u: V3, w: V3, normal: V3, rgb: RGB, split?: Emitter["split"]): Emitter {
  const c = new Float64Array(12);
  c.set([p[0], p[1], p[2], p[0] + u[0], p[1] + u[1], p[2] + u[2], p[0] + u[0] + w[0], p[1] + u[1] + w[1], p[2] + u[2] + w[2], p[0] + w[0], p[1] + w[1], p[2] + w[2]]);
  return { corners: c, rgb, cx: p[0] + (u[0] + w[0]) / 2, cy: p[1] + (u[1] + w[1]) / 2, cz: p[2] + (u[2] + w[2]) / 2, nx: normal[0], ny: normal[1], nz: normal[2], split };
}

/** Radiance of an emitter as seen from height y: windows show sky to what's below them, ground to what's above. */
function emitterRadiance(e: Emitter, y: number, out: RGB) {
  if (!e.split) {
    out[0] = e.rgb[0];
    out[1] = e.rgb[1];
    out[2] = e.rgb[2];
    return;
  }
  const t = clamp((e.split.y - y) / e.split.band + 0.5, 0, 1);
  const s = t * t * (3 - 2 * t);
  out[0] = e.split.ground[0] + (e.split.sky[0] - e.split.ground[0]) * s;
  out[1] = e.split.ground[1] + (e.split.sky[1] - e.split.ground[1]) * s;
  out[2] = e.split.ground[2] + (e.split.sky[2] - e.split.ground[2]) * s;
}

type Face = { p: V3; u: V3; v: V3; n: V3; albedo: RGB };

function roomFaces(r: LightRoom): Face[] {
  const [x0, y0, z0] = r.min,
    [x1, y1, z1] = r.max;
  const w = x1 - x0,
    h = y1 - y0,
    d = z1 - z0;
  return [
    { p: [x0, y0, z0], u: [w, 0, 0], v: [0, 0, d], n: [0, 1, 0], albedo: r.floor },
    { p: [x0, y1, z0], u: [w, 0, 0], v: [0, 0, d], n: [0, -1, 0], albedo: r.ceiling },
    { p: [x0, y0, z0], u: [0, 0, d], v: [0, h, 0], n: [1, 0, 0], albedo: r.walls.xMin },
    { p: [x1, y0, z0], u: [0, 0, d], v: [0, h, 0], n: [-1, 0, 0], albedo: r.walls.xMax },
    { p: [x0, y0, z0], u: [w, 0, 0], v: [0, h, 0], n: [0, 0, 1], albedo: r.walls.zMin },
    { p: [x0, y0, z1], u: [w, 0, 0], v: [0, h, 0], n: [0, 0, -1], albedo: r.walls.zMax },
  ];
}

const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

function makePatches(r: LightRoom) {
  const patches: Patch[] = [];
  const blocks: { first: number; list: number[]; face: Face; p: V3; u: V3; v: V3 }[] = [];
  for (const face of roomFaces(r)) {
    const lu = len(face.u),
      lv = len(face.v);
    const nu = Math.max(1, Math.round(lu / PATCH)),
      nv = Math.max(1, Math.round(lv / PATCH));
    // Blocks gather two by two (at most); fine patches do the bouncing.
    const bu = Math.max(1, Math.ceil(nu / 2)),
      bv = Math.max(1, Math.ceil(nv / 2));
    const firstBlock = blocks.length;
    for (let j = 0; j < bv; j++)
      for (let i = 0; i < bu; i++) {
        const s0 = (i * 2) / nu,
          t0 = (j * 2) / nv;
        const s1 = Math.min(1, ((i + 1) * 2) / nu),
          t1 = Math.min(1, ((j + 1) * 2) / nv);
        const p: V3 = [face.p[0] + face.u[0] * s0 + face.v[0] * t0, face.p[1] + face.u[1] * s0 + face.v[1] * t0, face.p[2] + face.u[2] * s0 + face.v[2] * t0];
        blocks.push({
          first: firstBlock,
          list: [],
          face,
          p,
          u: [face.u[0] * (s1 - s0), face.u[1] * (s1 - s0), face.u[2] * (s1 - s0)],
          v: [face.v[0] * (t1 - t0), face.v[1] * (t1 - t0), face.v[2] * (t1 - t0)],
        });
      }
    const area = (lu / nu) * (lv / nv);
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const su = (i + 0.5) / nu,
          sv = (j + 0.5) / nv;
        const u: V3 = [face.u[0] / nu, face.u[1] / nu, face.u[2] / nu],
          w: V3 = [face.v[0] / nv, face.v[1] / nv, face.v[2] / nv];
        const block = firstBlock + Math.floor(j / 2) * bu + Math.floor(i / 2);
        blocks[block].list.push(patches.length);
        patches.push({
          cx: face.p[0] + face.u[0] * su + face.v[0] * sv,
          cy: face.p[1] + face.u[1] * su + face.v[1] * sv,
          cz: face.p[2] + face.u[2] * su + face.v[2] * sv,
          nx: face.n[0],
          ny: face.n[1],
          nz: face.n[2],
          area,
          albedo: face.albedo,
          p: [face.p[0] + u[0] * i + w[0] * j, face.p[1] + u[1] * i + w[1] * j, face.p[2] + u[2] * i + w[2] * j],
          u,
          v: w,
          e0: [0, 0, 0],
          e: [0, 0, 0],
          block,
        });
      }
  }
  // Point-to-patch form factors: the classic disc approximation, good enough for bouncing.
  const n = patches.length;
  const ff = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const a = patches[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = patches[j];
      const dx = b.cx - a.cx,
        dy = b.cy - a.cy,
        dz = b.cz - a.cz;
      const r2 = dx * dx + dy * dy + dz * dz;
      const cosA = a.nx * dx + a.ny * dy + a.nz * dz,
        cosB = -(b.nx * dx + b.ny * dy + b.nz * dz);
      if (cosA <= 0 || cosB <= 0) continue;
      const r1 = Math.sqrt(r2);
      ff[i * n + j] = ((cosA / r1) * (cosB / r1) * b.area) / (Math.PI * r2 + b.area);
    }
  }
  return { patches, blocks, ff };
}

/** How much of a patch sees the sun through this room's windows (0–1). */
function sunFraction(patch: Patch, openings: LightOpening[], dir: V3) {
  let hits = 0;
  const total = SUN_SAMPLES * SUN_SAMPLES;
  for (let j = 0; j < SUN_SAMPLES; j++)
    for (let i = 0; i < SUN_SAMPLES; i++) {
      const s = (i + 0.5) / SUN_SAMPLES,
        t = (j + 0.5) / SUN_SAMPLES;
      const qx = patch.p[0] + patch.u[0] * s + patch.v[0] * t,
        qy = patch.p[1] + patch.u[1] * s + patch.v[1] * t,
        qz = patch.p[2] + patch.u[2] * s + patch.v[2] * t;
      for (const o of openings) {
        if (o.kind !== "window") continue;
        const outward = -(o.inward[0] * dir[0] + o.inward[1] * dir[1] + o.inward[2] * dir[2]);
        if (outward <= 0.02) continue;
        // Walk from the patch towards the sun as far as the window's plane.
        const dist = (o.inward[0] * (o.p[0] - qx) + o.inward[1] * (o.p[1] - qy) + o.inward[2] * (o.p[2] - qz)) / -outward;
        if (dist <= 0) continue;
        const hx = qx + dir[0] * dist - o.p[0],
          hy = qy + dir[1] * dist - o.p[1],
          hz = qz + dir[2] * dist - o.p[2];
        const lu = len(o.u),
          lv = len(o.v);
        const a = (hx * o.u[0] + hy * o.u[1] + hz * o.u[2]) / (lu * lu),
          b = (hx * o.v[0] + hy * o.v[1] + hz * o.v[2]) / (lv * lv);
        if (a >= 0 && a <= 1 && b >= 0 && b <= 1) {
          hits++;
          break;
        }
      }
    }
  return hits / total;
}

/** Glass and the sunshade over it take some of the light. */
const WINDOW_TRANSMIT = 0.82;
const OUTSIDE_DOOR_SHARE = 0.4;
const LAMP_SCALE = 3.4;
/** 0 keeps the light's colour, 1 neutralises it. */
const WHITE_BALANCE = 0.5;

type Solved = {
  room: LightRoom;
  patches: Patch[];
  blocks: ReturnType<typeof makePatches>["blocks"];
  ff: Float32Array;
  /** Mean radiance leaving the room's surfaces, for neighbours' doors. */
  mean: RGB;
  gain: number;
};

function bounce(s: Solved, portals: Emitter[]) {
  const { patches, ff } = s;
  const n = patches.length;
  const out: RGB = [0, 0, 0];
  // Portals add to what each patch sees directly.
  const direct: RGB[] = patches.map((p) => {
    const e: RGB = [p.e0[0], p.e0[1], p.e0[2]];
    for (const o of portals) {
      emitterVector(p.cx, p.cy, p.cz, o);
      const cos = Math.max(0, (F[0] * p.nx + F[1] * p.ny + F[2] * p.nz) * 2);
      emitterRadiance(o, p.cy, out);
      e[0] += out[0] * Math.PI * cos * 0.5;
      e[1] += out[1] * Math.PI * cos * 0.5;
      e[2] += out[2] * Math.PI * cos * 0.5;
    }
    return e;
  });
  const b = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = (direct[i][c] * patches[i].albedo[c]) / Math.PI;
  for (let pass = 0; pass < BOUNCES; pass++) {
    const next = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let r = 0,
        g = 0,
        bl = 0;
      const row = i * n;
      for (let j = 0; j < n; j++) {
        const k = ff[row + j];
        if (k === 0) continue;
        r += k * b[j * 3];
        g += k * b[j * 3 + 1];
        bl += k * b[j * 3 + 2];
      }
      const p = patches[i];
      const er = direct[i][0] + Math.PI * r,
        eg = direct[i][1] + Math.PI * g,
        eb = direct[i][2] + Math.PI * bl;
      p.e[0] = er;
      p.e[1] = eg;
      p.e[2] = eb;
      next[i * 3] = (er * p.albedo[0]) / Math.PI;
      next[i * 3 + 1] = (eg * p.albedo[1]) / Math.PI;
      next[i * 3 + 2] = (eb * p.albedo[2]) / Math.PI;
    }
    b.set(next);
  }
  let area = 0;
  const mean: RGB = [0, 0, 0];
  for (const p of patches) {
    area += p.area;
    for (let c = 0; c < 3; c++) mean[c] += ((p.e[c] * p.albedo[c]) / Math.PI) * p.area;
  }
  s.mean = [mean[0] / area, mean[1] / area, mean[2] / area];
}

function directSources(room: LightRoom, sky: LightSky) {
  const list: Emitter[] = [];
  for (const o of room.openings) {
    if (o.kind === "portal") continue;
    const share = o.kind === "door-out" ? OUTSIDE_DOOR_SHARE : WINDOW_TRANSMIT;
    const at = (a: RGB): RGB => [a[0] * share, a[1] * share, a[2] * share];
    const y = o.p[1] + o.v[1] / 2;
    list.push(emitter(o.p, o.u, o.v, o.inward, [0, 0, 0], { y, band: Math.max(0.6, o.v[1]), sky: at(sky.sky), ground: at(sky.ground) }));
  }
  return list;
}

/** Solves one floor's rooms into a light grid. */
export function solveLightGrid(rooms: readonly LightRoom[], sky: LightSky, spec: LightGridSpec): LightGrid {
  const solved: Solved[] = rooms.map((room) => {
    const { patches, blocks, ff } = makePatches(room);
    return { room, patches, blocks, ff, mean: [0, 0, 0], gain: 1 };
  });
  const byId = new Map(solved.map((s) => [s.room.id, s]));
  const sources = new Map<string, Emitter[]>();
  const tmp: RGB = [0, 0, 0];
  for (const s of solved) {
    const direct = directSources(s.room, sky);
    sources.set(s.room.id, direct);
    for (const p of s.patches) {
      p.e0 = [0, 0, 0];
      for (const e of direct) {
        emitterVector(p.cx, p.cy, p.cz, e);
        const cos = Math.max(0, F[0] * p.nx + F[1] * p.ny + F[2] * p.nz);
        emitterRadiance(e, p.cy, tmp);
        for (let c = 0; c < 3; c++) p.e0[c] += tmp[c] * Math.PI * cos;
      }
      if (sky.sun) {
        const cos = Math.max(0, p.nx * sky.sun.dir[0] + p.ny * sky.sun.dir[1] + p.nz * sky.sun.dir[2]);
        if (cos > 0) {
          const f = sunFraction(p, s.room.openings, sky.sun.dir);
          for (let c = 0; c < 3; c++) p.e0[c] += f * cos * sky.sun.irradiance[c] * WINDOW_TRANSMIT;
        }
      }
      for (const l of s.room.lamps) {
        const dx = l.position[0] - p.cx,
          dy = l.position[1] - p.cy,
          dz = l.position[2] - p.cz;
        const r2 = Math.max(0.06, dx * dx + dy * dy + dz * dz);
        const r1 = Math.sqrt(r2);
        const cos = Math.max(0, (dx * p.nx + dy * p.ny + dz * p.nz) / r1);
        for (let c = 0; c < 3; c++) p.e0[c] += (l.color[c] * l.intensity * LAMP_SCALE * cos) / r2;
      }
    }
    bounce(s, []);
  }
  // Doors pass on what the next room has, then each room settles again.
  const portalsOf = (s: Solved) =>
    s.room.openings
      .filter((o) => o.kind === "portal" && o.to && byId.has(o.to))
      .map((o) => {
        const other = byId.get(o.to!)!;
        return emitter(o.p, o.u, o.v, o.inward, [other.mean[0], other.mean[1], other.mean[2]]);
      });
  for (let pass = 0; pass < 2; pass++) for (const s of solved) bounce(s, portalsOf(s));

  // A photographer's exposure: each room moves towards the target, within reason.
  const gains: Record<string, number> = {};
  const balance = new Map<string, RGB>();
  for (const s of solved) {
    let area = 0,
      mean = 0;
    for (const p of s.patches) {
      if (p.ny !== 0) continue;
      area += p.area;
      mean += lum(p.e) * p.area;
    }
    mean /= area || 1;
    s.gain = mean > 1e-4 ? clamp(Math.pow(sky.target / mean, 0.86), 0.3, 4.2) : 1;
    gains[s.room.id] = s.gain;
    // And a photographer's white balance: the light's colour stays, but only part of it.
    const tint: RGB = [0, 0, 0];
    for (const p of s.patches) if (p.ny !== 0) for (let c = 0; c < 3; c++) tint[c] += p.e[c] * p.area;
    const l = lum(tint) || 1;
    const wbK = sky.balance ?? WHITE_BALANCE;
    balance.set(s.room.id, [Math.pow(l / Math.max(tint[0], 1e-5), wbK), Math.pow(l / Math.max(tint[1], 1e-5), wbK), Math.pow(l / Math.max(tint[2], 1e-5), wbK)]);
  }

  // The grid.
  const nx = Math.max(2, Math.ceil((spec.max[0] - spec.min[0]) / spec.cell)),
    ny = Math.max(2, Math.ceil((spec.max[1] - spec.min[1]) / spec.cellY)),
    nz = Math.max(2, Math.ceil((spec.max[2] - spec.min[2]) / spec.cell));
  const count = nx * ny * nz;
  const signed = new Float32Array(count * 4);
  const total = new Float32Array(count * 4);
  const filled = new Uint8Array(count);
  const index = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const cellX = (spec.max[0] - spec.min[0]) / nx,
    cellY = (spec.max[1] - spec.min[1]) / ny,
    cellZ = (spec.max[2] - spec.min[2]) / nz;
  for (const s of solved) {
    const room = s.room;
    const emitters: Emitter[] = [...sources.get(room.id)!, ...portalsOf(s)];
    // Each gather block shines with its patches' mean radiance.
    for (const b of s.blocks) {
      if (!b.list.length) continue;
      const rgb: RGB = [0, 0, 0];
      for (const i of b.list) {
        const p = s.patches[i];
        for (let c = 0; c < 3; c++) rgb[c] += (p.e[c] * p.albedo[c]) / Math.PI / b.list.length;
      }
      emitters.push(emitter(b.p, b.u, b.v, b.face.n, rgb));
    }
    const wb = balance.get(room.id)!;
    const i0 = clamp(Math.floor((room.min[0] - spec.min[0]) / cellX), 0, nx - 1),
      i1 = clamp(Math.ceil((room.max[0] - spec.min[0]) / cellX), 0, nx - 1),
      j0 = 0,
      j1 = ny - 1,
      k0 = clamp(Math.floor((room.min[2] - spec.min[2]) / cellZ), 0, nz - 1),
      k1 = clamp(Math.ceil((room.max[2] - spec.min[2]) / cellZ), 0, nz - 1);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = spec.min[0] + (i + 0.5) * cellX,
            y = spec.min[1] + (j + 0.5) * cellY,
            z = spec.min[2] + (k + 0.5) * cellZ;
          if (x < room.min[0] || x > room.max[0] || z < room.min[2] || z > room.max[2]) continue;
          // The layers above and below the room still take its light, for interpolation.
          const py = clamp(y, room.min[1] + 0.02, room.max[1] - 0.02);
          let vx = 0,
            vy = 0,
            vz = 0,
            sx = 0,
            sy = 0,
            sz = 0,
            cr = 0,
            cg = 0,
            cb = 0;
          for (const e of emitters) {
            emitterVector(x, py, z, e);
            emitterRadiance(e, py, tmp);
            const l = lum(tmp);
            if (l <= 0) continue;
            const fx = F[0] * l,
              fy = F[1] * l,
              fz = F[2] * l;
            vx += fx;
            vy += fy;
            vz += fz;
            sx += Math.abs(fx);
            sy += Math.abs(fy);
            sz += Math.abs(fz);
            const m = Math.sqrt(F[0] * F[0] + F[1] * F[1] + F[2] * F[2]);
            cr += tmp[0] * m;
            cg += tmp[1] * m;
            cb += tmp[2] * m;
          }
          for (const l of room.lamps) {
            const dx = l.position[0] - x,
              dy = l.position[1] - py,
              dz = l.position[2] - z;
            const r2 = Math.max(0.08, dx * dx + dy * dy + dz * dz);
            const r1 = Math.sqrt(r2);
            const k2 = (l.intensity * LAMP_SCALE) / r2 / Math.PI;
            const ll = lum(l.color) * k2;
            const fx = (dx / r1) * ll,
              fy = (dy / r1) * ll,
              fz = (dz / r1) * ll;
            vx += fx;
            vy += fy;
            vz += fz;
            sx += Math.abs(fx);
            sy += Math.abs(fy);
            sz += Math.abs(fz);
            cr += l.color[0] * k2;
            cg += l.color[1] * k2;
            cb += l.color[2] * k2;
          }
          const id = index(i, j, k);
          const scale = Math.PI * s.gain;
          signed[id * 4] = vx * scale;
          signed[id * 4 + 1] = vy * scale;
          signed[id * 4 + 2] = vz * scale;
          total[id * 4] = sx * scale;
          total[id * 4 + 1] = sy * scale;
          total[id * 4 + 2] = sz * scale;
          signed[id * 4 + 3] = 1;
          total[id * 4 + 3] = (cr * wb[0] - cb * wb[2]) / Math.max(cg * wb[1], 1e-5);
          filled[id] = 1;
        }
  }
  // Cells in the walls take the nearest room's light, so a lookup near a wall stays clean.
  const reach = 3;
  let frontier = filled;
  for (let pass = 0; pass < reach; pass++) {
    const next = frontier.slice();
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const id = index(i, j, k);
          if (frontier[id]) continue;
          let n = 0;
          const sum = [0, 0, 0, 0, 0, 0, 0, 0];
          for (const [di, dk] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]) {
            const a = i + di,
              c = k + dk;
            if (a < 0 || a >= nx || c < 0 || c >= nz) continue;
            const o = index(a, j, c);
            if (!frontier[o]) continue;
            n++;
            for (let q = 0; q < 4; q++) {
              sum[q] += signed[o * 4 + q];
              sum[q + 4] += total[o * 4 + q];
            }
          }
          if (!n) continue;
          for (let q = 0; q < 4; q++) {
            signed[id * 4 + q] = sum[q] / n;
            total[id * 4 + q] = sum[q + 4] / n;
          }
          // Only the first ring counts as inside: past that a wall's outer face reads as outdoors.
          if (pass > 0) signed[id * 4 + 3] = 0;
          next[id] = 1;
        }
    frontier = next;
  }
  return { min: spec.min, size: [cellX * nx, cellY * ny, cellZ * nz], nx, ny, nz, signed, total, gains };
}

/** Irradiance on a surface with normal n at grid cell (i, j, k): the same sum the shader does. */
export function gridIrradiance(g: LightGrid, i: number, j: number, k: number, n: V3): RGB {
  const id = i + g.nx * (j + g.ny * k);
  const axis = (q: number, c: number) => (g.total[id * 4 + q] + Math.sign(c) * g.signed[id * 4 + q]) * 0.5 * c * c;
  const l = axis(0, n[0]) + axis(1, n[1]) + axis(2, n[2]);
  const warmth = g.total[id * 4 + 3];
  const r = Math.max(0.1, 1 + warmth * 0.5),
    b = Math.max(0.1, 1 - warmth * 0.5);
  const norm = 1 / (0.2126 * r + 0.7152 + 0.0722 * b);
  return [l * r * norm, l * norm, l * b * norm];
}

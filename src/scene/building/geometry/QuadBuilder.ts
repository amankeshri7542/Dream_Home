// Accumulates quads/triangles/boxes (position, normal, uv, colour) into one
// BufferGeometry per material bucket. Colours are linear RGB triplets.
// UVs default to a planar projection in metres so textures tile physically.
import { BufferAttribute, BufferGeometry, Color } from "three";

export type V3 = [number, number, number];
export type RGB = [number, number, number];
export type UV = [number, number];

const scratch = new Color();
const rgbCache = new Map<string, RGB>();
/** sRGB hex → linear RGB triplet (cached). */
export function rgb(hex: string): RGB {
  let v = rgbCache.get(hex);
  if (!v) {
    scratch.set(hex);
    v = [scratch.r, scratch.g, scratch.b];
    rgbCache.set(hex, v);
  }
  return v;
}
export const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const scaleRgb = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const WHITE: RGB = [1, 1, 1];

/** Planar metre UVs chosen by the dominant normal axis. */
export function planarUv(p: V3, n: V3): UV {
  const ax = Math.abs(n[0]),
    ay = Math.abs(n[1]),
    az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0], -p[2]];
  if (ax >= az) return [n[0] > 0 ? -p[2] : p[2], p[1]];
  return [n[2] > 0 ? p[0] : -p[0], p[1]];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function normalOf(a: V3, b: V3, c: V3): V3 {
  const n = cross(sub(b, a), sub(c, a));
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

export class QuadBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private verts = 0;
  /** Triangle index at which each owner starts. */
  readonly owners: { start: number; id: string | null }[] = [];
  private owner: string | null = null;

  get triangles() {
    return this.idx.length / 3;
  }
  get empty() {
    return this.idx.length === 0;
  }

  setOwner(id: string | null) {
    if (id === this.owner) return;
    this.owner = id;
    const last = this.owners[this.owners.length - 1];
    if (last && last.start === this.triangles) last.id = id;
    else this.owners.push({ start: this.triangles, id });
  }

  /** Owner id for a picked triangle (faceIndex). */
  ownerAt(face: number): string | null {
    let found: string | null = null;
    for (const o of this.owners) {
      if (o.start <= face) found = o.id;
      else break;
    }
    return found;
  }

  private vertex(p: V3, n: V3, uv: UV, c: RGB) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uvs.push(uv[0], uv[1]);
    this.col.push(c[0], c[1], c[2]);
    return this.verts++;
  }

  /** Triangle a,b,c counter-clockwise when seen from the front. */
  tri(a: V3, b: V3, c: V3, color: RGB = WHITE, uvs?: [UV, UV, UV], normal?: V3) {
    const n = normal ?? normalOf(a, b, c);
    const i = this.vertex(a, n, uvs ? uvs[0] : planarUv(a, n), color);
    this.vertex(b, n, uvs ? uvs[1] : planarUv(b, n), color);
    this.vertex(c, n, uvs ? uvs[2] : planarUv(c, n), color);
    this.idx.push(i, i + 1, i + 2);
  }

  /** Quad a,b,c,d counter-clockwise when seen from the front. */
  quad(a: V3, b: V3, c: V3, d: V3, color: RGB = WHITE, uvs?: [UV, UV, UV, UV], normal?: V3) {
    const n = normal ?? normalOf(a, b, c);
    const i = this.vertex(a, n, uvs ? uvs[0] : planarUv(a, n), color);
    this.vertex(b, n, uvs ? uvs[1] : planarUv(b, n), color);
    this.vertex(c, n, uvs ? uvs[2] : planarUv(c, n), color);
    this.vertex(d, n, uvs ? uvs[3] : planarUv(d, n), color);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** Quad whose winding is flipped if needed so its front faces `normal`. */
  quadFacing(a: V3, b: V3, c: V3, d: V3, normal: V3, color: RGB = WHITE, uvs?: [UV, UV, UV, UV]) {
    const n = normalOf(a, b, c);
    if (n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2] >= 0) this.quad(a, b, c, d, color, uvs, normal);
    else this.quad(a, d, c, b, color, uvs ? [uvs[0], uvs[3], uvs[2], uvs[1]] : undefined, normal);
  }

  /** Triangle whose winding is flipped if needed so its front faces `normal`. */
  triFacing(a: V3, b: V3, c: V3, normal: V3, color: RGB = WHITE) {
    const n = normalOf(a, b, c);
    if (n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2] >= 0) this.tri(a, b, c, color, undefined, normal);
    else this.tri(a, c, b, color, undefined, normal);
  }

  /** Quad with per-vertex colours (gradients, e.g. soil strata or AO). */
  quadColors(a: V3, b: V3, c: V3, d: V3, colors: [RGB, RGB, RGB, RGB], uvs?: [UV, UV, UV, UV]) {
    const n = normalOf(a, b, c);
    const pts = [a, b, c, d];
    const i = this.verts;
    pts.forEach((p, k) => this.vertex(p, n, uvs ? uvs[k] : planarUv(p, n), colors[k]));
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** Axis-aligned face of a box: axis 0/1/2, side ±1, rect in the other two axes. */
  axisFace(axis: 0 | 1 | 2, side: 1 | -1, plane: number, u0: number, u1: number, v0: number, v1: number, color: RGB = WHITE) {
    // (u, v) are the two remaining axes in cyclic order: x→(y,z), y→(z,x), z→(x,y)
    const make = (u: number, v: number): V3 =>
      axis === 0 ? [plane, u, v] : axis === 1 ? [v, plane, u] : [u, v, plane];
    const a = make(u0, v0),
      b = make(u1, v0),
      c = make(u1, v1),
      d = make(u0, v1);
    const n: V3 = axis === 0 ? [side, 0, 0] : axis === 1 ? [0, side, 0] : [0, 0, side];
    // In cyclic (u,v) order a→b→c→d is CCW around +axis.
    if (side > 0) this.quad(a, b, c, d, color, undefined, n);
    else this.quad(a, d, c, b, color, undefined, n);
  }

  /** Closed axis-aligned box. `skip` omits faces by index: 0 −x,1 +x,2 −y,3 +y,4 −z,5 +z. */
  box(min: V3, max: V3, color: RGB = WHITE, skip?: readonly number[]) {
    if (max[0] - min[0] <= 1e-6 || max[1] - min[1] <= 1e-6 || max[2] - min[2] <= 1e-6) return;
    const faces: [0 | 1 | 2, 1 | -1][] = [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
      [2, -1],
      [2, 1],
    ];
    faces.forEach(([axis, side], k) => {
      if (skip?.includes(k)) return;
      const plane = side > 0 ? max[axis] : min[axis];
      const ua = ((axis + 1) % 3) as 0 | 1 | 2,
        va = ((axis + 2) % 3) as 0 | 1 | 2;
      this.axisFace(axis, side, plane, min[ua], max[ua], min[va], max[va], color);
    });
  }

  /** Box with chamfered edges (soft, toy-like furniture). */
  softBox(min: V3, max: V3, color: RGB, bevel: number) {
    const sx = max[0] - min[0],
      sy = max[1] - min[1],
      sz = max[2] - min[2];
    const c = Math.min(bevel, sx / 3, sy / 3, sz / 3);
    if (c < 0.004) return this.box(min, max, color);
    const xs = [min[0], min[0] + c, max[0] - c, max[0]];
    const ys = [min[1], min[1] + c, max[1] - c, max[1]];
    const zs = [min[2], min[2] + c, max[2] - c, max[2]];
    // Build as the convex hull of three inset boxes: emit 6 main faces,
    // 12 edge chamfers and 8 corner triangles.
    const P = (i: number, j: number, k: number): V3 => [xs[i], ys[j], zs[k]];
    const q = (a: V3, b: V3, cc: V3, d: V3) => this.quad(a, b, cc, d, color);
    // main faces
    q(P(0, 1, 1), P(0, 1, 2), P(0, 2, 2), P(0, 2, 1)); // −x
    q(P(3, 1, 1), P(3, 2, 1), P(3, 2, 2), P(3, 1, 2)); // +x
    q(P(1, 0, 1), P(2, 0, 1), P(2, 0, 2), P(1, 0, 2)); // −y
    q(P(1, 3, 1), P(1, 3, 2), P(2, 3, 2), P(2, 3, 1)); // +y
    q(P(1, 1, 0), P(1, 2, 0), P(2, 2, 0), P(2, 1, 0)); // −z
    q(P(1, 1, 3), P(2, 1, 3), P(2, 2, 3), P(1, 2, 3)); // +z
    // edges parallel to z (x/y corners)
    q(P(0, 1, 1), P(1, 0, 1), P(1, 0, 2), P(0, 1, 2));
    q(P(1, 3, 1), P(0, 2, 1), P(0, 2, 2), P(1, 3, 2));
    q(P(2, 0, 1), P(3, 1, 1), P(3, 1, 2), P(2, 0, 2));
    q(P(3, 2, 1), P(2, 3, 1), P(2, 3, 2), P(3, 2, 2));
    // edges parallel to x (y/z corners)
    q(P(1, 0, 1), P(1, 1, 0), P(2, 1, 0), P(2, 0, 1));
    q(P(1, 1, 3), P(1, 0, 2), P(2, 0, 2), P(2, 1, 3));
    q(P(1, 2, 0), P(1, 3, 1), P(2, 3, 1), P(2, 2, 0));
    q(P(1, 3, 2), P(1, 2, 3), P(2, 2, 3), P(2, 3, 2));
    // edges parallel to y (x/z corners)
    q(P(0, 1, 1), P(0, 2, 1), P(1, 2, 0), P(1, 1, 0));
    q(P(1, 1, 3), P(1, 2, 3), P(0, 2, 2), P(0, 1, 2));
    q(P(2, 1, 0), P(2, 2, 0), P(3, 2, 1), P(3, 1, 1));
    q(P(3, 1, 2), P(3, 2, 2), P(2, 2, 3), P(2, 1, 3));
    // corners
    const t = (a: V3, b: V3, cc: V3) => this.tri(a, b, cc, color);
    t(P(0, 1, 1), P(1, 1, 0), P(1, 0, 1));
    t(P(3, 1, 1), P(2, 0, 1), P(2, 1, 0));
    t(P(0, 1, 2), P(1, 0, 2), P(1, 1, 3));
    t(P(3, 1, 2), P(2, 1, 3), P(2, 0, 2));
    t(P(0, 2, 1), P(1, 3, 1), P(1, 2, 0));
    t(P(3, 2, 1), P(2, 2, 0), P(2, 3, 1));
    t(P(0, 2, 2), P(1, 2, 3), P(1, 3, 2));
    t(P(3, 2, 2), P(2, 3, 2), P(2, 2, 3));
  }

  /** Vertical cylinder (closed) for round furniture, posts and trunks. */
  cylinder(cx: number, cz: number, y0: number, y1: number, rx: number, rz: number, color: RGB, segments = 12) {
    const pts: [number, number][] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
    }
    for (let i = 0; i < segments; i++) {
      const [x0, z0] = pts[i],
        [x1, z1] = pts[(i + 1) % segments];
      const mx = (x0 + x1) / 2 - cx,
        mz = (z0 + z1) / 2 - cz;
      const l = Math.hypot(mx, mz) || 1;
      this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z1], [x1, y0, z1], color, undefined, [mx / l, 0, mz / l]);
    }
    for (let i = 1; i < segments - 1; i++) {
      this.tri([pts[0][0], y1, pts[0][1]], [pts[i + 1][0], y1, pts[i + 1][1]], [pts[i][0], y1, pts[i][1]], color);
      this.tri([pts[0][0], y0, pts[0][1]], [pts[i][0], y0, pts[i][1]], [pts[i + 1][0], y0, pts[i + 1][1]], color);
    }
  }

  /**
   * Extrude a convex 2D profile (s, y) — any winding — between n0 and n1.
   * World point = origin + s·S + y·(0,1,0) + n·N, with S ⟂ N horizontal units.
   */
  extrude(origin: V3, S: V3, N: V3, profile: readonly [number, number][], n0: number, n1: number, color: RGB = WHITE) {
    const P = (s: number, y: number, n: number): V3 => [
      origin[0] + S[0] * s + N[0] * n,
      origin[1] + y,
      origin[2] + S[2] * s + N[2] * n,
    ];
    const count = profile.length;
    if (count < 3) return;
    // Signed area → orientation of the profile in (s, y).
    let area = 0;
    for (let i = 0; i < count; i++) {
      const [s0, y0] = profile[i],
        [s1, y1] = profile[(i + 1) % count];
      area += s0 * y1 - s1 * y0;
    }
    const ccw = area > 0;
    const nNeg: V3 = [-N[0], -N[1], -N[2]];
    for (let i = 1; i < count - 1; i++) {
      const a = profile[0],
        b = profile[i],
        c = profile[i + 1];
      this.triFacing(P(a[0], a[1], n1), P(b[0], b[1], n1), P(c[0], c[1], n1), N, color);
      this.triFacing(P(a[0], a[1], n0), P(b[0], b[1], n0), P(c[0], c[1], n0), nNeg, color);
    }
    for (let i = 0; i < count; i++) {
      const [s0, y0] = profile[i],
        [s1, y1] = profile[(i + 1) % count];
      let ds = y1 - y0,
        dy = -(s1 - s0);
      if (!ccw) {
        ds = -ds;
        dy = -dy;
      }
      const l = Math.hypot(ds, dy) || 1;
      const normal: V3 = [(S[0] * ds) / l, dy / l, (S[2] * ds) / l];
      this.quadFacing(P(s0, y0, n0), P(s1, y1, n0), P(s1, y1, n1), P(s0, y0, n1), normal, color);
    }
  }

  /** Append another builder's data (keeps owners). */
  append(other: QuadBuilder) {
    const offset = this.verts,
      triOffset = this.triangles;
    this.pos.push(...other.pos);
    this.nor.push(...other.nor);
    this.uvs.push(...other.uvs);
    this.col.push(...other.col);
    for (const i of other.idx) this.idx.push(i + offset);
    this.verts += other.verts;
    for (const o of other.owners) this.owners.push({ start: o.start + triOffset, id: o.id });
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(this.uvs), 2));
    g.setAttribute("color", new BufferAttribute(new Float32Array(this.col), 3));
    const index =
      this.verts > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    g.setIndex(new BufferAttribute(index, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** A set of named builders (one per material bucket). */
export class Buckets<K extends string = string> {
  readonly map = new Map<K, QuadBuilder>();
  get(key: K): QuadBuilder {
    let b = this.map.get(key);
    if (!b) {
      b = new QuadBuilder();
      this.map.set(key, b);
    }
    return b;
  }
  entries() {
    return [...this.map.entries()].filter(([, b]) => !b.empty);
  }
}

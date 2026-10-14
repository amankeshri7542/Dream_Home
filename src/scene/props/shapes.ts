// Low-poly, flat-shaded toy shapes (trees, shrubs, car) emitted into builders.
import { IcosahedronGeometry } from "three";
import { hash2 } from "../materials/noise";
import { mixRgb, rgb, type QuadBuilder, type RGB, type V3 } from "../building/geometry/QuadBuilder";

const ICO = [0, 1].map((detail) => {
  const g = new IcosahedronGeometry(1, detail);
  const pos = g.getAttribute("position");
  const out: V3[] = [];
  for (let i = 0; i < pos.count; i++) out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  g.dispose();
  return out;
});

/** A faceted blob (icosahedron) with gentle per-face shading variety. */
export function blob(b: QuadBuilder, c: V3, r: [number, number, number], color: RGB, detail: 0 | 1 = 1, seed = 0) {
  const verts = ICO[detail];
  for (let i = 0; i < verts.length; i += 3) {
    const k = 0.92 + hash2(i, seed, 7) * 0.16;
    const col: RGB = [color[0] * k, color[1] * k, color[2] * k];
    const p = (v: V3): V3 => {
      // Squash the underside a little so blobs sit nicely.
      const y = v[1] < 0 ? v[1] * 0.8 : v[1];
      return [c[0] + v[0] * r[0], c[1] + y * r[1], c[2] + v[2] * r[2]];
    };
    b.tri(p(verts[i]), p(verts[i + 1]), p(verts[i + 2]), col);
  }
}

/** Faceted cone/frustum around a vertical axis. */
export function cone(b: QuadBuilder, cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, color: RGB, segs = 7) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2,
      a1 = ((i + 1) / segs) * Math.PI * 2;
    const p = (a: number, r: number, y: number): V3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    const mid = (a0 + a1) / 2;
    const slope = (r0 - r1) / Math.max(0.001, y1 - y0);
    const n: V3 = [Math.cos(mid), slope, Math.sin(mid)];
    if (r1 > 0.001) b.quadFacing(p(a0, r0, y0), p(a1, r0, y0), p(a1, r1, y1), p(a0, r1, y1), n, color);
    else b.triFacing(p(a0, r0, y0), p(a1, r0, y0), [cx, y1, cz], n, color);
    b.triFacing([cx, y0, cz], p(a1, r0, y0), p(a0, r0, y0), [0, -1, 0], color);
  }
}

/** Horizontal cylinder along x (wheels). */
export function wheelX(b: QuadBuilder, c: V3, r: number, width: number, color: RGB, segs = 10) {
  const x0 = c[0] - width / 2,
    x1 = c[0] + width / 2;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2,
      a1 = ((i + 1) / segs) * Math.PI * 2;
    const y = (a: number) => c[1] + Math.cos(a) * r,
      z = (a: number) => c[2] + Math.sin(a) * r;
    const mid = (a0 + a1) / 2;
    b.quadFacing([x0, y(a0), z(a0)], [x1, y(a0), z(a0)], [x1, y(a1), z(a1)], [x0, y(a1), z(a1)], [0, Math.cos(mid), Math.sin(mid)], color);
    const hub = mixRgb(color, [0.75, 0.75, 0.75], 0.5);
    b.triFacing([x1, c[1], c[2]], [x1, y(a0), z(a0)], [x1, y(a1), z(a1)], [1, 0, 0], hub);
    b.triFacing([x0, c[1], c[2]], [x0, y(a0), z(a0)], [x0, y(a1), z(a1)], [-1, 0, 0], hub);
  }
}

const FOLIAGE = ["#7fa36f", "#8db57a", "#6f9a68", "#9bbd7e"].map(rgb);
const BLOSSOM = ["#efb3c2", "#f4c6d1", "#e79fb2"].map(rgb);
const BARK = rgb("#8a6f55");

export type TreeKind = "oak" | "pine" | "palm" | "blossom";
/** A cute low-poly tree at (x, groundY, z), scale ≈ 1 → ~4 m tall. */
export function tree(b: QuadBuilder, x: number, y: number, z: number, scale: number, kind: TreeKind = "oak", seed = 0) {
  const s = scale;
  if (kind === "pine") {
    b.cylinder(x, z, y, y + 0.9 * s, 0.11 * s, 0.11 * s, BARK, 6);
    const green = rgb("#5f8a63");
    cone(b, x, z, y + 0.7 * s, y + 2.6 * s, 1.05 * s, 0.25 * s, green);
    cone(b, x, z, y + 1.8 * s, y + 3.6 * s, 0.8 * s, 0.15 * s, mixRgb(green, [1, 1, 1], 0.06));
    cone(b, x, z, y + 2.8 * s, y + 4.5 * s, 0.55 * s, 0, mixRgb(green, [1, 1, 1], 0.12));
    return;
  }
  if (kind === "palm") {
    b.cylinder(x, z, y, y + 3.6 * s, 0.12 * s, 0.12 * s, BARK, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + seed;
      blob(b, [x + Math.cos(a) * 0.75 * s, y + 3.55 * s, z + Math.sin(a) * 0.75 * s], [0.75 * s, 0.14 * s, 0.32 * s], FOLIAGE[i % 4], 0, seed + i);
    }
    return;
  }
  const palette = kind === "blossom" ? BLOSSOM : FOLIAGE;
  b.cylinder(x, z, y, y + 1.5 * s, 0.13 * s, 0.13 * s, BARK, 6);
  const puffs: [number, number, number, number][] = [
    [0, 2.15, 0, 0.95],
    [-0.42, 1.8, 0.24, 0.72],
    [0.45, 1.88, -0.18, 0.74],
    [0.1, 2.65, 0.05, 0.62],
  ];
  puffs.forEach(([dx, dy, dz, r], i) => {
    const j = hash2(seed, i, 5);
    blob(b, [x + dx * s, y + dy * s, z + dz * s], [r * s, r * s * 0.92, r * s], palette[(i + Math.floor(j * 3)) % palette.length], 1, seed * 7 + i);
  });
}

/** Rounded shrub. */
export function shrub(b: QuadBuilder, x: number, y: number, z: number, r: number, seed = 0, flowers = false) {
  blob(b, [x, y + r * 0.7, z], [r, r * 0.85, r], FOLIAGE[seed % 4], 1, seed);
  if (flowers)
    for (let i = 0; i < 5; i++) {
      const a = hash2(seed, i, 1) * Math.PI * 2,
        rr = r * (0.55 + hash2(seed, i, 2) * 0.35);
      const col = rgb(["#f6f1e4", "#f3cf5e", "#ee9fb4"][i % 3]);
      blob(b, [x + Math.cos(a) * rr, y + r * (0.9 + hash2(seed, i, 3) * 0.6), z + Math.sin(a) * rr], [0.07, 0.07, 0.07], col, 0, seed + i);
    }
}

// Canvas-generated, seamlessly tiling textures. Each kind yields a colour map
// (sRGB) and a detail map: height in R (bumpMap), roughness in G (roughnessMap).
// UVs are in metres; `Look.tile` (palette.ts) sets the physical repeat.
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import { fbm, hash2, periodicNoise } from "./noise";
import type { TextureKind } from "./palette";

type C3 = [number, number, number];
type Sample = { c: C3; h: number; r: number };
type Gen = (u: number, v: number, base: C3, tile: [number, number]) => Sample;

const hexToSrgb = (hex: string): C3 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mul = (c: C3, k: number): C3 => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const frac = (x: number) => x - Math.floor(x);
const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Anisotropic periodic fBm: fx, fy integer base frequencies. */
function anis(u: number, v: number, fx: number, fy: number, oct: number, seed: number) {
  let s = 0,
    a = 1,
    n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * periodicNoise(u * fx, v * fy, fx, fy, seed + i * 31);
    n += a;
    a *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return s / n;
}
const jitter = (c: C3, seed1: number, seed2: number, amt: number): C3 => {
  const k = 1 + (hash2(seed1, seed2, 3) - 0.5) * amt;
  const hue = (hash2(seed1, seed2, 9) - 0.5) * amt * 0.5;
  return [c[0] * k * (1 + hue), c[1] * k, c[2] * k * (1 - hue)];
};

/** Rectangular running-bond blocks: returns block ids + joint distance (metres). */
function blocks(x: number, y: number, bw: number, bh: number, cols: number, rows: number, stagger = 0.5) {
  const row = Math.floor(y / bh);
  const off = (row % 2) * stagger * bw;
  const bx = x + off;
  const col = Math.floor(bx / bw);
  const fx = bx - col * bw,
    fy = y - row * bh;
  const edge = Math.min(fx, bw - fx, fy, bh - fy);
  return { row: ((row % rows) + rows) % rows, col: ((col % cols) + cols) % cols, edge, fx, fy };
}

const plaster: Gen = (u, v, base) => {
  const m = fbm(u, v, 3, 4, 1);
  const fine = fbm(u, v, 48, 2, 2);
  return { c: mul(base, 0.94 + 0.1 * m + (fine - 0.5) * 0.04), h: 0.5 + (fbm(u, v, 12, 3, 3) - 0.5) * 0.8, r: 0.9 + (fine - 0.5) * 0.1 };
};
const stucco: Gen = (u, v, base) => {
  const m = fbm(u, v, 3, 3, 4);
  const s = fbm(u, v, 64, 2, 5);
  const bump = Math.pow(s, 2.2);
  return { c: mul(base, 0.95 + 0.06 * m + (s - 0.5) * 0.06), h: 0.3 + bump * 0.9, r: 0.93 };
};
const render: Gen = (u, v, base) => {
  const m = fbm(u, v, 2, 4, 6);
  const trowel = anis(u, v, 6, 2, 3, 7);
  return { c: mul(base, 0.95 + 0.08 * m + (trowel - 0.5) * 0.04), h: 0.5 + (trowel - 0.5) * 0.5, r: 0.88 };
};
const brick: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const b = blocks(x, y, 0.25, 0.075, 4, 8);
  const mortarW = 0.0065;
  const mortar = b.edge < mortarW;
  const n = fbm(u, v, 24, 3, 11);
  if (mortar) {
    const mc: C3 = [0.8, 0.76, 0.69];
    return { c: mul(mc, 0.92 + 0.1 * n), h: 0.15 + 0.1 * n, r: 0.97 };
  }
  let c = jitter(base, b.row, b.col, 0.32);
  const burnt = hash2(b.row, b.col, 21) > 0.82;
  if (burnt) c = mul(c, 0.78);
  const edgeDark = smooth(0, 0.02, b.edge - mortarW);
  c = mul(c, 0.86 + 0.14 * edgeDark + (n - 0.5) * 0.12);
  return { c, h: 0.55 + 0.3 * edgeDark + (n - 0.5) * 0.2, r: 0.84 + (n - 0.5) * 0.1 };
};
function coursed(u: number, v: number, base: C3, [w, h]: [number, number], rowsH: number[], seed: number, joint: C3, strata: number): Sample {
  const x = u * w,
    y = v * h;
  let acc = 0,
    row = 0;
  while (row < rowsH.length - 1 && y > acc + rowsH[row]) acc += rowsH[row++];
  const rh = rowsH[row];
  const fy = y - acc;
  const count = 2 + Math.floor(hash2(row, 0, seed) * 2);
  const shift = hash2(row, 1, seed) * w;
  const xs = frac((x + shift) / w) * w;
  const len = w / count;
  const col = Math.floor(xs / len);
  const fx = xs - col * len;
  const edge = Math.min(fx, len - fx, fy, rh - fy);
  const n = fbm(u, v, 16, 3, seed + 5);
  const layers = anis(u, v, 1, 24, 3, seed + 9);
  if (edge < 0.006) return { c: mul(joint, 0.95 + 0.1 * n), h: 0.2, r: 0.95 };
  let c = jitter(base, row, col, 0.16);
  c = mul(c, 0.92 + (layers - 0.5) * strata + (n - 0.5) * 0.1);
  return { c, h: 0.55 + smooth(0, 0.02, edge) * 0.3 + (n - 0.5) * 0.25, r: 0.88 };
}
const sandstone: Gen = (u, v, base, tile) => coursed(u, v, base, tile, [0.3, 0.3, 0.3, 0.3], 41, [0.86, 0.8, 0.7], 0.22);
const ashlar: Gen = (u, v, base, tile) => coursed(u, v, base, tile, [0.4, 0.3, 0.5], 57, [0.74, 0.71, 0.66], 0.08);
const timber: Gen = (u, v, base, [, h]) => {
  const boards = Math.round(h / 0.15);
  const by = v * boards;
  const row = Math.floor(by),
    fy = by - row;
  const grain = anis(u, v, 3, 48, 4, 13 + row);
  let c = jitter(base, row, 3, 0.2);
  c = mul(c, 0.86 + (grain - 0.5) * 0.35);
  const lap = smooth(0, 0.18, fy);
  if (fy < 0.05) return { c: mul(base, 0.35), h: 0.05, r: 0.9 };
  c = mul(c, 0.78 + 0.22 * lap);
  return { c, h: 0.35 + 0.5 * lap + (grain - 0.5) * 0.15, r: 0.78 };
};
const boardConcrete: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const row = Math.floor(y / 0.15);
  const fy = y / 0.15 - row;
  const m = fbm(u, v, 4, 4, 17);
  const wood = anis(u, v, 4, 40, 3, 18 + row);
  let c = mul(base, 0.92 + 0.08 * m + (wood - 0.5) * 0.06 + (hash2(row, 2, 19) - 0.5) * 0.05);
  let hh = 0.5 + (wood - 0.5) * 0.25;
  if (fy < 0.03) {
    c = mul(c, 0.9);
    hh = 0.35;
  }
  const tx = frac((x - 0.3) / 0.6),
    ty = frac((y - 0.3) / 0.6);
  const d = Math.hypot((tx > 0.5 ? tx - 1 : tx) * 0.6, (ty > 0.5 ? ty - 1 : ty) * 0.6);
  if (d < 0.013) return { c: mul(base, 0.55), h: 0.1, r: 0.95 };
  return { c, h: hh, r: 0.86 };
};
const planks: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const rows = Math.round(h / 0.18);
  const row = Math.floor((y / h) * rows);
  const fy = (y / h) * rows - row;
  const off = Math.floor(hash2(row, 0, 23) * 4) * 0.3;
  const xs = frac((x + off) / 1.2);
  const plank = Math.floor((x + off) / 1.2);
  const grain = anis(u, v, 2, 64, 4, 29 + row);
  const fine = anis(u, v, 8, 128, 2, 31);
  let c = jitter(base, row, plank, 0.22);
  c = mul(c, 0.85 + (grain - 0.5) * 0.4 + (fine - 0.5) * 0.08);
  const joint = fy < 0.025 || fy > 0.975 || xs < 0.004 || xs > 0.996;
  if (joint) return { c: mul(base, 0.5), h: 0.15, r: 0.8 };
  return { c, h: 0.6 + (grain - 0.5) * 0.15, r: 0.6 + (fine - 0.5) * 0.15 };
};
const herringbone: Gen = (u, v, base) => {
  const colW = 0.25;
  const col = Math.floor(u / colW);
  const lx = u - col * colW;
  const t = v + (col % 2 === 0 ? lx : colW - lx);
  const k = Math.floor(frac(t) * 12);
  const ft = frac(frac(t) * 12);
  const along = col % 2 === 0 ? u + v : u - v;
  const grain = periodicNoise(frac(along) * 40, ft * 3, 40, 3, 37) * 0.6 + fbm(u, v, 32, 2, 38) * 0.4;
  if (ft < 0.05 || lx < 0.004 || lx > colW - 0.004) return { c: mul(base, 0.52), h: 0.15, r: 0.8 };
  const c = mul(jitter(base, col, k, 0.24), 0.86 + (grain - 0.5) * 0.35);
  return { c, h: 0.6, r: 0.6 };
};
const tile: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const s = 0.6;
  const col = Math.floor(x / s),
    row = Math.floor(y / s);
  const fx = x - col * s,
    fy = y - row * s;
  const edge = Math.min(fx, s - fx, fy, s - fy);
  const n = fbm(u, v, 12, 3, 41);
  if (edge < 0.0035) return { c: mul(base, 0.82), h: 0.2, r: 0.9 };
  const c = mul(jitter(base, row, col, 0.05), 0.97 + (n - 0.5) * 0.05);
  return { c, h: 0.6 + smooth(0, 0.01, edge) * 0.2, r: 0.38 };
};
const CHIPS: C3[] = [
  [0.72, 0.62, 0.53],
  [0.55, 0.55, 0.52],
  [0.85, 0.79, 0.7],
  [0.66, 0.3, 0.24],
  [0.92, 0.89, 0.83],
  [0.44, 0.42, 0.39],
  [0.6, 0.66, 0.62],
];
const terrazzo: Gen = (u, v, base) => {
  const N = 48;
  const cx = u * N,
    cy = v * N;
  const ix = Math.floor(cx),
    iy = Math.floor(cy);
  let chip: C3 | null = null;
  for (let dy = -1; dy <= 1 && !chip; dy++)
    for (let dx = -1; dx <= 1 && !chip; dx++) {
      const gx = (((ix + dx) % N) + N) % N,
        gy = (((iy + dy) % N) + N) % N;
      if (hash2(gx, gy, 51) < 0.42) continue;
      const px = ix + dx + 0.2 + hash2(gx, gy, 52) * 0.6,
        py = iy + dy + 0.2 + hash2(gx, gy, 53) * 0.6;
      const r = 0.22 + hash2(gx, gy, 54) * 0.35;
      const ddx = cx - px,
        ddy = cy - py;
      const ang = hash2(gx, gy, 55) * Math.PI;
      const rx = ddx * Math.cos(ang) + ddy * Math.sin(ang),
        ry = -ddx * Math.sin(ang) + ddy * Math.cos(ang);
      if (Math.abs(rx) + Math.abs(ry) * 1.3 < r) chip = CHIPS[Math.floor(hash2(gx, gy, 56) * CHIPS.length)];
    }
  const n = fbm(u, v, 16, 2, 57);
  if (chip) return { c: mul(chip, 0.95 + (n - 0.5) * 0.1), h: 0.55, r: 0.3 };
  return { c: mul(base, 0.97 + (n - 0.5) * 0.06), h: 0.5, r: 0.34 };
};
const marble: Gen = (u, v, base) => {
  const w = fbm(u, v, 3, 5, 61);
  const val = Math.abs(Math.sin((2 * u + 2 * v + w * 2.4) * Math.PI * 2));
  const vein = Math.pow(1 - val, 10) * 0.8 + Math.pow(1 - Math.abs(Math.sin((u * 4 - v * 2 + w * 3) * Math.PI)), 30) * 0.4;
  const veinColor: C3 = [0.6, 0.58, 0.56];
  const x = u * 2,
    y = v * 2;
  const seam = Math.min(frac(x), 1 - frac(x), frac(y), 1 - frac(y)) < 0.004;
  let c = mix(mul(base, 0.97 + (w - 0.5) * 0.06), veinColor, sat(vein));
  if (seam) c = mul(c, 0.86);
  return { c, h: seam ? 0.3 : 0.6, r: 0.18 + vein * 0.1 };
};
const limestone: Gen = (u, v, base, [w, h]) => {
  const b = blocks(u * w, v * h, 0.6, 0.4, 2, 3);
  const n = fbm(u, v, 8, 4, 71);
  const speck = fbm(u, v, 96, 1, 72);
  if (b.edge < 0.003) return { c: mul(base, 0.8), h: 0.2, r: 0.8 };
  let c = mul(jitter(base, b.row, b.col, 0.08), 0.94 + (n - 0.5) * 0.12);
  if (speck > 0.82) c = mul(c, 0.86);
  return { c, h: 0.55 + (n - 0.5) * 0.2, r: 0.6 };
};
const slate: Gen = (u, v, base, [w, h]) => {
  const s = 0.4;
  const x = u * w,
    y = v * h;
  const col = Math.floor(x / s),
    row = Math.floor(y / s);
  const edge = Math.min(x - col * s, s - (x - col * s), y - row * s, s - (y - row * s));
  const cleft = fbm(u, v, 10, 5, 81);
  if (edge < 0.004) return { c: mul(base, 0.55), h: 0.1, r: 0.9 };
  return { c: mul(jitter(base, row, col, 0.2), 0.86 + (cleft - 0.5) * 0.35), h: 0.35 + cleft * 0.6, r: 0.65 + (cleft - 0.5) * 0.2 };
};
const polished: Gen = (u, v, base, [w, h]) => {
  const m = fbm(u, v, 3, 5, 91);
  const agg = fbm(u, v, 80, 1, 92);
  const x = u * w,
    y = v * h;
  const cut = Math.min(frac(x / 1.2), 1 - frac(x / 1.2), frac(y / 1.2), 1 - frac(y / 1.2)) * 1.2 < 0.003;
  let c = mul(base, 0.92 + (m - 0.5) * 0.16);
  if (agg > 0.78) c = mul(c, 0.9);
  if (cut) c = mul(c, 0.75);
  return { c, h: cut ? 0.2 : 0.5, r: 0.36 + (m - 0.5) * 0.1 };
};
const carpet: Gen = (u, v, base) => {
  const n = fbm(u, v, 128, 2, 101);
  const m = fbm(u, v, 6, 3, 102);
  return { c: mul(base, 0.92 + (n - 0.5) * 0.14 + (m - 0.5) * 0.06), h: 0.3 + n * 0.5, r: 0.98 };
};
const terracottaRoof: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const tw = 0.25,
    th = 0.3;
  const col = Math.floor(x / tw),
    row = Math.floor(y / th);
  const fx = x / tw - col,
    fy = y / th - row;
  const barrel = 0.5 + 0.5 * Math.cos(fx * Math.PI * 2);
  const n = fbm(u, v, 20, 3, 111);
  let c = jitter(base, row, col, 0.22);
  c = mul(c, 0.7 + 0.38 * barrel + (n - 0.5) * 0.1);
  // Shadow where the next course overlaps (top of each course in v).
  const overlap = smooth(0.82, 1, fy);
  c = mul(c, 1 - overlap * 0.45);
  return { c, h: 0.2 + 0.6 * barrel * (1 - overlap * 0.6) + fy * 0.15, r: 0.72 };
};
const slateRoof: Gen = (u, v, base, [w, h]) => {
  const b = blocks(u * w, v * h, 0.3, 0.22, 4, 4);
  const n = fbm(u, v, 14, 4, 121);
  if (b.fx < 0.006 || b.fx > 0.294) return { c: mul(base, 0.45), h: 0.1, r: 0.8 };
  const fy = b.fy / 0.22;
  let c = mul(jitter(base, b.row, b.col, 0.22), 0.85 + (n - 0.5) * 0.25);
  c = mul(c, 1 - smooth(0.85, 1, fy) * 0.4);
  return { c, h: 0.3 + fy * 0.5, r: 0.68 };
};
const metalRoof: Gen = (u, v, base) => {
  const p = frac(u * 2);
  const seam = Math.max(0, 1 - Math.min(p, 1 - p) / 0.025);
  const oil = anis(u, v, 2, 6, 3, 131);
  const c = mul(base, 0.92 + (oil - 0.5) * 0.1 + seam * 0.15);
  return { c, h: 0.4 + seam * 0.6 + (oil - 0.5) * 0.05, r: 0.42 + (oil - 0.5) * 0.1 };
};
const membrane: Gen = (u, v, base, [w]) => {
  const x = u * w;
  const seam = frac(x) < 0.01 ? 1 : 0;
  const g = fbm(u, v, 96, 2, 141);
  const m = fbm(u, v, 4, 3, 142);
  return { c: mul(base, 0.92 + (g - 0.5) * 0.16 + (m - 0.5) * 0.08 - seam * 0.08), h: 0.4 + g * 0.3 + seam * 0.3, r: 0.92 };
};
const lawn: Gen = (u, v, base) => {
  const stripe = u < 0.5 ? 1.07 : 0.93;
  const blend = smooth(0, 0.02, Math.min(Math.abs(u - 0.5), u, 1 - u));
  const s = 1 + (stripe - 1) * blend;
  const blades = anis(u, v, 200, 120, 2, 151);
  const clumps = fbm(u, v, 8, 4, 152);
  let c = mul(base, s * (0.88 + (clumps - 0.5) * 0.25 + (blades - 0.5) * 0.22));
  c = mix(c, [c[0] * 1.05, c[1] * 1.08, c[2] * 0.85], sat((clumps - 0.55) * 3));
  return { c, h: 0.3 + blades * 0.6, r: 0.96 };
};
const FLOWERS: C3[] = [
  [0.98, 0.97, 0.92],
  [0.99, 0.85, 0.35],
  [0.95, 0.62, 0.7],
  [0.75, 0.66, 0.9],
];
const meadow: Gen = (u, v, base, tile) => {
  const g = lawn(u, v, base, tile);
  g.c = mix(g.c, mul(base, 0.98), 0.5);
  const N = 30;
  const cx = u * N,
    cy = v * N;
  const ix = Math.floor(cx),
    iy = Math.floor(cy);
  if (hash2(ix, iy, 161) > 0.7) {
    const px = ix + 0.3 + hash2(ix, iy, 162) * 0.4,
      py = iy + 0.3 + hash2(ix, iy, 163) * 0.4;
    if (Math.hypot(cx - px, cy - py) < 0.16) return { c: FLOWERS[Math.floor(hash2(ix, iy, 164) * 4)], h: 0.9, r: 0.8 };
  }
  return g;
};
const gravel: Gen = (u, v, base) => {
  const N = 40;
  const cx = u * N,
    cy = v * N;
  const ix = Math.floor(cx),
    iy = Math.floor(cy);
  let best = 9,
    id: [number, number] = [0, 0];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const gx = (((ix + dx) % N) + N) % N,
        gy = (((iy + dy) % N) + N) % N;
      const px = ix + dx + hash2(gx, gy, 171),
        py = iy + dy + hash2(gx, gy, 172);
      const d = Math.hypot(cx - px, cy - py);
      if (d < best) {
        best = d;
        id = [gx, gy];
      }
    }
  const stone = jitter(base, id[0], id[1], 0.3);
  const rim = smooth(0.25, 0.55, best);
  return { c: mul(stone, 1 - rim * 0.45), h: 1 - rim, r: 0.95 };
};
const soil: Gen = (u, v, base) => {
  const n = fbm(u, v, 6, 5, 181);
  const crack = fbm(u, v, 24, 2, 182);
  return { c: mul(base, 0.85 + (n - 0.5) * 0.35 - (crack < 0.3 ? 0.15 : 0)), h: n, r: 0.98 };
};
const W: C3 = [1, 1, 1];
const paint: Gen = (u, v) => {
  const m = fbm(u, v, 4, 4, 191);
  const roller = anis(u, v, 24, 6, 2, 192);
  return { c: mul(W, 0.965 + (m - 0.5) * 0.05 + (roller - 0.5) * 0.02), h: 0.5 + (roller - 0.5) * 0.4, r: 0.9 };
};
const stoneSmall: Gen = (u, v, _b, [w, h]) => {
  const b = blocks(u * w, v * h, 0.3, 0.15, 4, 4);
  const n = fbm(u, v, 16, 3, 201);
  if (b.edge < 0.004) return { c: mul(W, 0.78), h: 0.2, r: 0.95 };
  return { c: mul(jitter(W, b.row, b.col, 0.1), 0.94 + (n - 0.5) * 0.12), h: 0.55 + (n - 0.5) * 0.3, r: 0.85 };
};
const concrete: Gen = (u, v) => {
  const m = fbm(u, v, 4, 5, 211);
  const pores = fbm(u, v, 96, 1, 212);
  return { c: mul(W, 0.92 + (m - 0.5) * 0.12 - (pores > 0.8 ? 0.06 : 0)), h: 0.5 + (m - 0.5) * 0.3, r: 0.9 };
};
const asphalt: Gen = (u, v) => {
  const agg = fbm(u, v, 160, 2, 221);
  const m = fbm(u, v, 5, 4, 222);
  return { c: mul(W, 0.88 + (agg - 0.5) * 0.28 + (m - 0.5) * 0.1), h: agg, r: 0.95 };
};
const pavers: Gen = (u, v, _b, [w, h]) => {
  const b = blocks(u * w, v * h, 0.2, 0.1, 6, 12);
  const n = fbm(u, v, 20, 3, 231);
  if (b.edge < 0.004) return { c: mul(W, 0.72), h: 0.15, r: 0.95 };
  return { c: mul(jitter(W, b.row, b.col, 0.12), 0.95 + (n - 0.5) * 0.1), h: 0.6, r: 0.88 };
};

const GENERATORS: Record<TextureKind, Gen> = {
  plaster,
  stucco,
  render,
  brick,
  sandstone,
  ashlar,
  timber,
  boardConcrete,
  planks,
  herringbone,
  tile,
  terrazzo,
  marble,
  limestone,
  slate,
  polished,
  carpet,
  terracottaRoof,
  slateRoof,
  metalRoof,
  membrane,
  lawn,
  meadow,
  gravel,
  soil,
  paint,
  stoneSmall,
  concrete,
  asphalt,
  pavers,
};

export type TexturePair = { map: CanvasTexture; detail: CanvasTexture };

/** Generate (uncached) colour + detail textures for a kind. */
export function generateTextures(
  kind: TextureKind,
  baseHex: string,
  tile: [number, number],
  size: number,
  anisotropy: number,
): TexturePair {
  const gen = GENERATORS[kind];
  const base = hexToSrgb(baseHex);
  const colorCanvas = document.createElement("canvas"),
    detailCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = detailCanvas.width = detailCanvas.height = size;
  const cctx = colorCanvas.getContext("2d")!,
    dctx = detailCanvas.getContext("2d")!;
  const cimg = cctx.createImageData(size, size),
    dimg = dctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    // Canvas row 0 is the top; textures flip Y, so v = 1 − row.
    const v = 1 - (py + 0.5) / size;
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const s = gen(u, v, base, tile);
      const i = (py * size + px) * 4;
      cimg.data[i] = sat(s.c[0]) * 255;
      cimg.data[i + 1] = sat(s.c[1]) * 255;
      cimg.data[i + 2] = sat(s.c[2]) * 255;
      cimg.data[i + 3] = 255;
      dimg.data[i] = sat(s.h) * 255;
      dimg.data[i + 1] = sat(s.r) * 255;
      dimg.data[i + 2] = 0;
      dimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  dctx.putImageData(dimg, 0, 0);
  const map = new CanvasTexture(colorCanvas),
    detail = new CanvasTexture(detailCanvas);
  map.colorSpace = SRGBColorSpace;
  detail.colorSpace = NoColorSpace;
  for (const t of [map, detail]) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = anisotropy;
    t.repeat.set(1 / tile[0], 1 / tile[1]);
  }
  return { map, detail };
}

/** A 1D falloff used as alphaMap for fake-AO strips and blob shadows. */
export function gradientTexture(kind: "strip" | "radial", size = 64): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = kind === "strip" ? 4 : size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < canvas.width; x++) {
      let a: number;
      if (kind === "strip") {
        // v = 0 at the wall (bottom row after flipY) → strong, fading out.
        const t = 1 - (y + 0.5) / size;
        a = Math.pow(1 - t, 2.2);
      } else {
        const dx = (x + 0.5) / size - 0.5,
          dy = (y + 0.5) / size - 0.5;
        const d = Math.min(1, Math.hypot(dx, dy) * 2);
        a = Math.pow(1 - smooth(0.35, 1, d), 1.6);
      }
      const i = (y * canvas.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace;
  return tex;
}

/**
 * Jaali (pierced screen) alpha pattern: one tile is a quatrefoil of four
 * round holes around a diamond, framed by a solid border. UVs are metres;
 * the texture repeats every `tile` metres.
 */
export function jaaliTexture(tile = 0.3, size = 128): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  const c = size / 2,
    r = size * 0.17;
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    ctx.beginPath();
    ctx.arc(c + dx * size * 0.2, c + dy * size * 0.2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Solid centre boss and corner diamonds keep the screen reading as stone.
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(c, c, size * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000000";
  for (const [x, y] of [
    [0, 0],
    [size, 0],
    [0, size],
    [size, size],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, y);
    ctx.lineTo(x, y - size * 0.12);
    ctx.lineTo(x + size * 0.12, y);
    ctx.lineTo(x, y + size * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(1 / tile, 1 / tile);
  return tex;
}

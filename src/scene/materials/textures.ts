// Canvas-generated, seamlessly tiling textures. Each kind yields a colour map
// (sRGB) and a detail map: height in R (bumpMap), roughness in G (roughnessMap).
// UVs are in metres; `Look.tile` (palette.ts) sets the physical repeat.
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import { fbm, hash2, periodicNoise } from "./noise";
import type { TextureKind } from "./palette";

type C3 = [number, number, number];
export type Sample = { c: C3; h: number; r: number };
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
/**
 * Boards laid in long random-length runs. Each board is its own piece of wood:
 * slight tone change, long streaky grain, the odd cathedral arch, and a thin
 * eased edge rather than a dark line drawn around it.
 */
const planks: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const rows = Math.round(h / 0.144);
  const rowF = (y / h) * rows;
  const row = Math.floor(rowF);
  const fy = rowF - row;
  // Lengths come from a whole number of cuts per tile, so the tile still repeats cleanly.
  const cuts = 2 + Math.floor(hash2(row, 1, 23) * 2);
  const shift = hash2(row, 0, 23) * w;
  const along = frac((x + shift) / w) * cuts;
  const board = Math.floor(along);
  const fx = along - board;
  const length = w / cuts;
  const id = row * 7 + board;
  const edgeY = Math.min(fy, 1 - fy) * (h / rows);
  const edgeX = Math.min(fx, 1 - fx) * length;
  const edge = Math.min(edgeX, edgeY);
  // Grain runs along the board and is different in each one.
  const seed = 29 + id * 13;
  const streak = anis(u, v, 2, 40, 4, seed);
  const fine = anis(u, v, 6, 160, 2, seed + 3);
  const lx = fx - 0.5,
    ly = fy - 0.5 + (hash2(id, 3, 23) - 0.5) * 0.6;
  const rings = Math.sin((Math.hypot(lx * 0.42, ly * 2.4) * 34 + streak * 7 + hash2(id, 5, 23) * 6) * 1.2);
  const cathedral = hash2(id, 7, 23) > 0.55 ? rings * 0.5 + 0.5 : 0.5;
  const tone = 1 + (hash2(id, 11, 23) - 0.5) * 0.11;
  const warm = (hash2(id, 13, 23) - 0.5) * 0.035;
  const k = tone * (0.93 + (streak - 0.5) * 0.3 + (fine - 0.5) * 0.11 + (cathedral - 0.5) * 0.09);
  const c: C3 = [base[0] * k * (1 + warm), base[1] * k, base[2] * k * (1 - warm)];
  const ease = smooth(0.0006, 0.0028, edge);
  return {
    c: mul(c, 0.68 + 0.32 * ease),
    h: 0.28 + ease * 0.34 + (streak - 0.5) * 0.08,
    r: 0.6 + (fine - 0.5) * 0.16 + (1 - ease) * 0.2,
  };
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
/**
 * Terrazzo that sits quietly under a room: packed broken stone in cement,
 * most of it close to the floor's own colour, a little darker and a little
 * terracotta, with the thin divider strip Indian mosaic floors have.
 */
const terrazzo: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const n = fbm(u, v, 4, 3, 57);
  if (gridEdge(x, y, 1.2) < 0.0022) return { c: mix(base, [0.62, 0.52, 0.38], 0.55), h: 0.62, r: 0.28 };
  // Nearest two stones (a Worley pattern): the gap between them is the cement.
  const N = 190;
  const cx = u * N,
    cy = v * N;
  const ix = Math.floor(cx),
    iy = Math.floor(cy);
  let d1 = 9,
    d2 = 9,
    idx = 0,
    idy = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const gx = (((ix + dx) % N) + N) % N,
        gy = (((iy + dy) % N) + N) % N;
      const px = ix + dx + hash2(gx, gy, 52),
        py = iy + dy + hash2(gx, gy, 53);
      const d = Math.hypot(cx - px, cy - py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        idx = gx;
        idy = gy;
      } else if (d < d2) d2 = d;
    }
  const pick = hash2(idx, idy, 56);
  const stone: C3 =
    pick < 0.7 ? mul(base, 0.97 + hash2(idx, idy, 57) * 0.07) : pick < 0.87 ? mul(base, 0.87) : pick < 0.94 ? mix(base, CHIPS[0], 0.4) : pick < 0.98 ? mix(base, CHIPS[3], 0.16) : mul(base, 0.72);
  const gap = smooth(0.05, 0.13, d2 - d1);
  const cement = mul(base, 0.93);
  const c = mix(cement, stone, gap);
  return { c: mul(c, 0.99 + (n - 0.5) * 0.05), h: 0.48 + gap * 0.06, r: 0.34 - gap * 0.05 };
};
/**
 * Polished marble, slab by slab. Veins drift across a slab in one direction
 * and fade in and out, so they read as stone and don't close up into the
 * contour lines plain noise makes. A soft cloud sits underneath.
 */
const SLAB = 0.6;
const marble: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const col = Math.floor(x / SLAB),
    row = Math.floor(y / SLAB);
  const seam = gridEdge(x, y, SLAB);
  const seed = col * 19 + row * 41;
  // Each slab is its own cut of the block: its own offset, and a direction close to its neighbours'.
  const ox = hash2(col, row, 61) * 37,
    oy = hash2(col, row, 62) * 37;
  const angle = 0.72 + (hash2(col, row, 63) - 0.5) * 0.7;
  const px = x / SLAB + ox,
    py = y / SLAB + oy;
  const n = (fx: number, fy: number, oct: number, s: number) => {
    let sum = 0,
      amp = 1,
      norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * periodicNoise(fx, fy, 4096, 4096, s + i * 17);
      norm += amp;
      amp *= 0.5;
      fx *= 2.03;
      fy *= 2.03;
    }
    return sum / norm;
  };
  const cloud = n(px * 1.4, py * 1.4, 4, 64);
  const warp = n(px * 0.9, py * 0.9, 3, 65) - 0.5;
  const warpFine = n(px * 3.2, py * 3.2, 3, 66) - 0.5;
  const along = px * Math.cos(angle) + py * Math.sin(angle);
  // One soft main vein family, and thin lines that branch off it.
  const main = Math.abs(Math.sin((along * 1.35 + warp * 1.25 + warpFine * 0.22) * Math.PI));
  const hair = Math.abs(Math.sin((along * 3.1 - py * 0.8 + warp * 1.9 + warpFine * 0.55) * Math.PI));
  const fade = smooth(0.42, 0.68, n(px * 0.7 + 9, py * 0.7 + 3, 2, 67));
  const fadeHair = smooth(0.48, 0.72, n(px * 1.3 + 2, py * 1.3 + 7, 2, 68));
  const soft = Math.pow(1 - main, 7) * 0.52 * (0.25 + 0.75 * fade);
  const thin = Math.pow(1 - hair, 30) * 0.3 * fadeHair;
  const vein = sat(soft + thin);
  const grey: C3 = [base[0] * 0.66, base[1] * 0.65, base[2] * 0.67];
  const tone = 1 + (hash2(seed, 1, 69) - 0.5) * 0.028;
  const body = mul(base, tone * (0.975 + (cloud - 0.5) * 0.085));
  const c = mix(body, grey, vein);
  const edge = smooth(0.0007, 0.0024, seam);
  return { c: mul(c, 0.84 + 0.16 * edge), h: 0.32 + edge * 0.3, r: 0.17 + vein * 0.1 + (1 - edge) * 0.4 };
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
  // Paint is never one flat colour: broad, faint patches about a roller's width.
  const broad = fbm(u, v, 1, 2, 193);
  const roller = anis(u, v, 24, 6, 2, 192);
  return { c: mul(W, 0.962 + (m - 0.5) * 0.05 + (broad - 0.5) * 0.045 + (roller - 0.5) * 0.022), h: 0.5 + (roller - 0.5) * 0.4, r: 0.9 + (broad - 0.5) * 0.06 };
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

// ---------------------------------------------------------------------------
// Regional materials (looks.ts). Periods divide the tile so every map tiles.
// ---------------------------------------------------------------------------
const CREAM: C3 = [0.93, 0.88, 0.76];
/** Distance (metres) to the nearest grout line of a square grid of `s`. */
const gridEdge = (x: number, y: number, s: number) => {
  const fx = frac(x / s) * s,
    fy = frac(y / s) * s;
  return Math.min(fx, s - fx, fy, s - fy);
};
/**
 * Athangudi: hand-made cement tiles (20 cm) with a glossy field colour, a
 * cream eight-petal flower in the middle and quarter circles in the corners
 * that join into rosettes across four tiles. Blue and green sets take a
 * yellow or red-oxide accent, as the real tiles do.
 */
const athangudi: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const s = 0.2;
  if (gridEdge(x, y, s) < 0.0022) return { c: mul(base, 0.42), h: 0.2, r: 0.7 };
  const col = Math.floor(x / s),
    row = Math.floor(y / s);
  const tu = frac(x / s),
    tv = frac(y / s);
  const cu = tu - 0.5,
    cv = tv - 0.5;
  const green = base[1] > base[0] && base[1] > base[2];
  const accent: C3 = green ? [0.62, 0.24, 0.18] : [0.86, 0.64, 0.24];
  const outline = mul(base, 0.45);
  const n = fbm(u, v, 24, 2, 251);
  const field = mul(jitter(base, row, col, 0.06), 0.96 + (n - 0.5) * 0.06);
  const r = Math.hypot(cu, cv),
    a = Math.atan2(cv, cu);
  const corner = Math.hypot(Math.min(tu, 1 - tu), Math.min(tv, 1 - tv));
  let c = field;
  if (corner < 0.3) c = corner < 0.21 ? (corner < 0.12 ? accent : CREAM) : corner < 0.235 ? outline : field;
  const diamond = Math.abs(cu) + Math.abs(cv);
  if (diamond > 0.34 && diamond < 0.37) c = CREAM;
  const petal = 0.1 + 0.15 * Math.abs(Math.cos(4 * a));
  if (r < petal + 0.012 && r > petal) c = outline;
  else if (r < petal) c = r < 0.055 ? accent : CREAM;
  return { c: mul(c, 0.97 + (n - 0.5) * 0.05), h: 0.55, r: 0.26 + (n - 0.5) * 0.06 };
};
/** Kota stone: honed blue-green slabs (60 cm) with faint wavy layering. */
const kota: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const s = 0.6;
  if (gridEdge(x, y, s) < 0.0025) return { c: mul(base, 0.62), h: 0.2, r: 0.8 };
  const col = Math.floor(x / s),
    row = Math.floor(y / s);
  const layers = anis(u, v, 2, 14, 3, 261 + col * 7 + row);
  const cloud = fbm(u, v, 4, 4, 262);
  const speck = fbm(u, v, 120, 1, 263);
  let c = jitter(base, row, col, 0.14);
  c = mix(c, [c[0] * 0.9, c[1] * 1.05, c[2] * 0.95], sat((cloud - 0.45) * 2));
  c = mul(c, 0.9 + (layers - 0.5) * 0.18 + (speck > 0.84 ? -0.06 : 0));
  return { c, h: 0.5 + (layers - 0.5) * 0.1, r: 0.42 + (cloud - 0.5) * 0.1 };
};
/** Red oxide: smooth, waxy cement floor in 1.2 m bays with soft mottling. */
const redOxide: Gen = (u, v, base, [w, h]) => {
  const m = fbm(u, v, 3, 5, 241);
  const cloud = fbm(u, v, 9, 3, 242);
  if (gridEdge(u * w, v * h, 1.2) < 0.003) return { c: mul(base, 0.72), h: 0.3, r: 0.5 };
  const c = mul(base, 0.9 + (m - 0.5) * 0.18 + (cloud - 0.5) * 0.08);
  return { c, h: 0.5 + (cloud - 0.5) * 0.06, r: 0.2 + (m - 0.5) * 0.08 };
};
/** Laterite: porous red-brown blocks (40 × 20 cm) in a running bond. */
const laterite: Gen = (u, v, base, [w, h]) => {
  const b = blocks(u * w, v * h, 0.4, 0.2, 4, 6);
  const mortarW = 0.008;
  const n = fbm(u, v, 20, 3, 271);
  if (b.edge < mortarW) return { c: mul([0.82, 0.76, 0.66], 0.92 + 0.1 * n), h: 0.15, r: 0.97 };
  const pores = fbm(u, v, 96, 2, 272);
  const pit = pores > 0.66 ? (pores - 0.66) * 2.2 : 0;
  let c = jitter(base, b.row, b.col, 0.28);
  c = mix(c, [c[0] * 1.08, c[1] * 0.95, c[2] * 0.82], sat((n - 0.5) * 2));
  c = mul(c, (0.9 + (n - 0.5) * 0.2) * (1 - pit * 0.55));
  return { c, h: 0.6 - pit * 0.5 + smooth(0, 0.02, b.edge - mortarW) * 0.2, r: 0.95 };
};
/**
 * Mangalore tiles: flat interlocking clay tiles (42 × 25 cm visible) with two
 * shallow channels each, laid in straight columns, each course shading the
 * one below; a little weathering and lichen.
 */
const mangaloreTile: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const tw = 0.42,
    th = 0.25;
  const col = Math.floor(x / tw),
    row = Math.floor(y / th);
  const fx = x / tw - col,
    fy = y / th - row;
  const channels = 0.5 + 0.5 * Math.cos(fx * Math.PI * 4);
  const rib = smooth(0.46, 0.5, fx) * (1 - smooth(0.5, 0.54, fx));
  const n = fbm(u, v, 18, 3, 281);
  const lichen = fbm(u, v, 40, 2, 282);
  let c = jitter(base, row, col, 0.2);
  c = mul(c, 0.78 + 0.22 * (1 - channels) + rib * 0.12 + (n - 0.5) * 0.12);
  if (lichen > 0.74) c = mix(c, [0.36, 0.34, 0.27], 0.35);
  const overlap = smooth(0.84, 1, fy);
  c = mul(c, 1 - overlap * 0.5);
  const side = Math.min(fx, 1 - fx) < 0.02 ? 0.8 : 1;
  return { c: mul(c, side), h: 0.25 + 0.4 * (1 - channels) + rib * 0.2 + fy * 0.12 - overlap * 0.2, r: 0.72 };
};
/** Azulejo: glazed white tiles (15 cm) painted with a blue rosette and corner arcs. */
const azulejo: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const s = 0.15;
  if (gridEdge(x, y, s) < 0.0018) return { c: [0.78, 0.77, 0.73], h: 0.2, r: 0.8 };
  const tu = frac(x / s),
    tv = frac(y / s);
  const cu = tu - 0.5,
    cv = tv - 0.5;
  const white: C3 = [0.95, 0.95, 0.92];
  const pale = mix(white, base, 0.35);
  const r = Math.hypot(cu, cv),
    a = Math.atan2(cv, cu);
  const corner = Math.hypot(Math.min(tu, 1 - tu), Math.min(tv, 1 - tv));
  let c = white;
  if (corner < 0.24 && corner > 0.17) c = base;
  else if (corner < 0.1) c = pale;
  const leaf = 0.12 + 0.2 * Math.pow(Math.abs(Math.cos(2 * a)), 3);
  if (r < leaf) c = r < 0.07 ? white : base;
  if (Math.abs(r - 0.38) < 0.015 && corner > 0.24) c = pale;
  const n = fbm(u, v, 30, 2, 291);
  return { c: mul(c, 0.97 + (n - 0.5) * 0.05), h: 0.55, r: 0.18 };
};
/** Vertical timber slats (7.5 cm) with shadowed gaps. */
const woodSlat: Gen = (u, v, base, [w]) => {
  const x = u * w;
  const s = 0.09;
  const slat = Math.floor(x / s);
  const fx = frac(x / s);
  if (fx > 0.83) return { c: mul(base, 0.22), h: 0.05, r: 0.9 };
  const grain = anis(u, v, 48, 3, 4, 301 + (slat % 13));
  let c = jitter(base, slat, 1, 0.22);
  c = mul(c, 0.84 + (grain - 0.5) * 0.3);
  const round = Math.sin((fx / 0.83) * Math.PI);
  return { c: mul(c, 0.86 + 0.14 * round), h: 0.4 + 0.5 * round, r: 0.68 };
};
/** Fair-faced concrete: smooth panels (1.2 m) with tie holes on a 60 cm grid. */
const fairFaced: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const m = fbm(u, v, 3, 5, 311);
  const cloud = fbm(u, v, 12, 2, 312);
  const pores = fbm(u, v, 110, 1, 313);
  let c = mul(base, 0.93 + (m - 0.5) * 0.12 + (cloud - 0.5) * 0.05 - (pores > 0.82 ? 0.05 : 0));
  let hh = 0.5 + (cloud - 0.5) * 0.08;
  if (gridEdge(x, y, 1.2) < 0.004) {
    c = mul(c, 0.82);
    hh = 0.3;
  }
  const tx = frac((x - 0.3) / 0.6),
    ty = frac((y - 0.3) / 0.6);
  if (Math.hypot((tx > 0.5 ? tx - 1 : tx) * 0.6, (ty > 0.5 ? ty - 1 : ty) * 0.6) < 0.012) return { c: mul(base, 0.5), h: 0.1, r: 0.95 };
  return { c, h: hh, r: 0.8 };
};
/** Vitrified tiles: large (80 cm) glossy porcelain, each printed slightly differently. */
const vitrified: Gen = (u, v, base, [w, h]) => {
  const x = u * w,
    y = v * h;
  const s = 0.8;
  const seam = gridEdge(x, y, s);
  const col = Math.floor(x / s),
    row = Math.floor(y / s);
  const px = x / s + hash2(col, row, 321) * 29,
    py = y / s + hash2(col, row, 322) * 29;
  const warp = periodicNoise(px * 1.1, py * 1.1, 4096, 4096, 323) * 0.7 + periodicNoise(px * 2.9, py * 2.9, 4096, 4096, 324) * 0.3;
  const cloud = periodicNoise(px * 1.6, py * 1.6, 4096, 4096, 325);
  const vein = Math.pow(1 - Math.abs(Math.sin((px * 0.8 + py * 0.55 + warp * 1.2) * Math.PI)), 12) * 0.16;
  const c = mix(mul(jitter(base, row, col, 0.022), 0.985 + (cloud - 0.5) * 0.035), mul(base, 0.84), vein);
  const edge = smooth(0.0006, 0.002, seam);
  return { c: mul(c, 0.82 + 0.18 * edge), h: 0.3 + edge * 0.28, r: 0.14 + vein * 0.08 + (1 - edge) * 0.45 };
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
  athangudi,
  kota,
  redOxide,
  laterite,
  mangaloreTile,
  azulejo,
  woodSlat,
  fairFaced,
  vitrified,
};

export type TexturePair = {
  map: CanvasTexture;
  detail: CanvasTexture;
  /** Mean of the roughness channel, so a Look's roughness can scale it. */
  meanRoughness: number;
};

/** One texel of a kind at (u, v) ∈ [0, 1)²: sRGB colour, height and roughness (tests). */
export function sampleTexture(kind: TextureKind, baseHex: string, tile: [number, number], u: number, v: number): Sample {
  return GENERATORS[kind](u, v, hexToSrgb(baseHex), tile);
}

type Canvases = {
  cctx: CanvasRenderingContext2D;
  dctx: CanvasRenderingContext2D;
  cimg: ImageData;
  dimg: ImageData;
  colorCanvas: HTMLCanvasElement;
  detailCanvas: HTMLCanvasElement;
};
function canvases(size: number): Canvases {
  const colorCanvas = document.createElement("canvas"),
    detailCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = detailCanvas.width = detailCanvas.height = size;
  const cctx = colorCanvas.getContext("2d")!,
    dctx = detailCanvas.getContext("2d")!;
  return { cctx, dctx, cimg: cctx.createImageData(size, size), dimg: dctx.createImageData(size, size), colorCanvas, detailCanvas };
}
/** Fills rows [from, to) and returns their summed roughness. */
function fillRows(kind: TextureKind, base: C3, tile: [number, number], size: number, c: Canvases, from: number, to: number) {
  const gen = GENERATORS[kind];
  let roughness = 0;
  for (let py = from; py < to; py++) {
    // Canvas row 0 is the top; textures flip Y, so v = 1 − row.
    const v = 1 - (py + 0.5) / size;
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const s = gen(u, v, base, tile);
      const i = (py * size + px) * 4;
      c.cimg.data[i] = sat(s.c[0]) * 255;
      c.cimg.data[i + 1] = sat(s.c[1]) * 255;
      c.cimg.data[i + 2] = sat(s.c[2]) * 255;
      c.cimg.data[i + 3] = 255;
      c.dimg.data[i] = sat(s.h) * 255;
      c.dimg.data[i + 1] = sat(s.r) * 255;
      roughness += sat(s.r);
      c.dimg.data[i + 2] = 0;
      c.dimg.data[i + 3] = 255;
    }
  }
  return roughness;
}
function finishPair(c: Canvases, tile: [number, number], size: number, anisotropy: number, roughness: number): TexturePair {
  const { cctx, dctx, cimg, dimg, colorCanvas, detailCanvas } = c;
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
  return { map, detail, meanRoughness: roughness / (size * size) };
}


/** Generate (uncached) colour + detail textures for a kind. */
export function generateTextures(
  kind: TextureKind,
  baseHex: string,
  tile: [number, number],
  size: number,
  anisotropy: number,
): TexturePair {
  const c = canvases(size);
  const roughness = fillRows(kind, hexToSrgb(baseHex), tile, size, c, 0, size);
  return finishPair(c, tile, size, anisotropy, roughness);
}

/**
 * The same textures, made a few rows at a time between frames, so a big floor
 * texture never freezes the page (a 1024 px floor takes about 300 ms on a Mac).
 */
export async function generateTexturesSliced(
  kind: TextureKind,
  baseHex: string,
  tile: [number, number],
  size: number,
  anisotropy: number,
  budgetMs = 6,
): Promise<TexturePair> {
  const c = canvases(size);
  const base = hexToSrgb(baseHex);
  let roughness = 0;
  let row = 0;
  while (row < size) {
    const started = performance.now();
    while (row < size && performance.now() - started < budgetMs) {
      const next = Math.min(size, row + 8);
      roughness += fillRows(kind, base, tile, size, c, row, next);
      row = next;
    }
    if (row < size) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return finishPair(c, tile, size, anisotropy, roughness);
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

// Seamless (periodic) value noise and fBm for procedural textures.

/** Deterministic 32-bit hash → [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash1(n: number, seed = 0) {
  return hash2(n, 0, seed);
}

const fade = (t: number) => t * t * (3 - 2 * t);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Value noise with integer period (px, py) — tiles seamlessly. */
export function periodicNoise(x: number, y: number, px: number, py: number, seed = 0): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const x0 = mod(xi, px),
    x1 = mod(xi + 1, px),
    y0 = mod(yi, py),
    y1 = mod(yi + 1, py);
  const a = hash2(x0, y0, seed),
    b = hash2(x1, y0, seed),
    c = hash2(x0, y1, seed),
    d = hash2(x1, y1, seed);
  const u = fade(xf),
    v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Periodic fBm on the unit square: (u, v) ∈ [0, 1)². `freq` is the base lattice
 * count; each octave doubles it, so every octave tiles. Returns ≈ [0, 1].
 */
export function fbm(u: number, v: number, freq: number, octaves = 4, seed = 0, gain = 0.5): number {
  let sum = 0,
    amp = 1,
    norm = 0,
    f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * periodicNoise(u * f, v * f, f, f, seed + i * 17);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

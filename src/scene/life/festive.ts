// Procedural Diwali pieces: a rangoli (powder colours on a floor quad) and
// the bulbs of a festoon of string lights, scalloped between hooks.
import { CanvasTexture, SRGBColorSpace } from "three";
import type { EdgeSide } from "../../domain/types";
import { hash2 } from "../materials/noise";
import { COMPOUND_WALL, type FencePlan } from "../props/fence";

const RANGOLI_COLOURS = {
  magenta: "#d2337a",
  saffron: "#f08a24",
  marigold: "#f6c33d",
  leaf: "#3f9a4c",
  sky: "#2f7fc8",
  white: "#fbf6ea",
};

/** One petal: a teardrop pointing outward from the centre. */
function petal(ctx: CanvasRenderingContext2D, angle: number, r0: number, r1: number, width: number) {
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(r0, 0);
  ctx.quadraticCurveTo((r0 + r1) / 2, -width, r1, 0);
  ctx.quadraticCurveTo((r0 + r1) / 2, width, r0, 0);
  ctx.fill();
  ctx.restore();
}
function ringOfDots(ctx: CanvasRenderingContext2D, n: number, r: number, size: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A round rangoli: petals in rings of magenta, saffron and marigold around a
 * green band and a flower, edged with white dots, with a powdery grain.
 * Transparent outside the design.
 */
export function rangoliTexture(size = 512): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const R = size / 2;
  ctx.translate(R, R);
  const c = RANGOLI_COLOURS;
  ctx.fillStyle = c.white;
  ringOfDots(ctx, 48, R * 0.95, R * 0.022);
  ctx.fillStyle = c.magenta;
  for (let i = 0; i < 16; i++) petal(ctx, (i / 16) * Math.PI * 2, R * 0.55, R * 0.92, R * 0.12);
  ctx.fillStyle = c.sky;
  for (let i = 0; i < 16; i++) petal(ctx, ((i + 0.5) / 16) * Math.PI * 2, R * 0.6, R * 0.8, R * 0.06);
  ctx.fillStyle = c.saffron;
  for (let i = 0; i < 8; i++) petal(ctx, (i / 8) * Math.PI * 2, R * 0.3, R * 0.66, R * 0.17);
  ctx.fillStyle = c.leaf;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.marigold;
  for (let i = 0; i < 8; i++) petal(ctx, ((i + 0.5) / 8) * Math.PI * 2, R * 0.05, R * 0.31, R * 0.1);
  ctx.fillStyle = c.white;
  ringOfDots(ctx, 24, R * 0.45, R * 0.018);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.magenta;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.045, 0, Math.PI * 2);
  ctx.fill();
  // Powder grain: speckled edges and slightly uneven colour.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (d[i + 3] === 0) continue;
      const n = hash2(x, y, 41);
      const k = 0.88 + n * 0.2;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
      if (d[i + 3] < 255) d[i + 3] = n > 0.5 ? 255 : 0;
    }
  ctx.putImageData(img, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Warm gold with amber and rose: the classic Diwali festoon. */
export const BULB_COLOURS = ["#ffd27a", "#ffb347", "#ffd27a", "#ff8fb1"];
export const BULB_SPACING = 0.12;
const HOOK_SPACING = 1.1;
const SAG = 0.09;

/**
 * Bulb positions (metres, along x from −length/2, drooping in y) of a
 * festoon hung from hooks every ~1.1 m, sagging ~9 cm between them.
 */
export function festoon(length: number): { x: number; y: number }[] {
  const spans = Math.max(1, Math.round(length / HOOK_SPACING));
  const span = length / spans;
  const count = Math.max(2, Math.round(length / BULB_SPACING) + 1);
  return Array.from({ length: count }, (_, i) => {
    const x = (i / (count - 1)) * length;
    const t = (x % span) / span;
    return { x: x - length / 2, y: -SAG * 4 * t * (1 - t) };
  });
}

/**
 * Diwali diyas along the road-side compound wall: one on every pillar cap and
 * a row along the coping between them (plot-local metres). Other boundaries
 * get none; the house and its porch carry the rest.
 */
export function wallDiyas(plan: FencePlan | null, road: EdgeSide, plot: { width: number; depth: number }): [number, number, number][] {
  if (plan?.kind !== "compound-wall") return [];
  const w = plot.width / 100,
    d = plot.depth / 100;
  const edge = road === "south" ? d : road === "north" ? 0 : road === "east" ? w : 0;
  const onRoad = (x: number, z: number) => Math.abs((road === "south" || road === "north" ? z : x) - edge) < 0.3;
  const out: [number, number, number][] = [];
  for (const [x, z] of plan.pillars) if (onRoad(x, z)) out.push([x, COMPOUND_WALL.pillarCap, z]);
  for (const r of plan.runs) {
    if (!onRoad(r.x0, r.z0) || !onRoad(r.x1, r.z1)) continue;
    const length = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const count = Math.floor(length / 0.6);
    for (let i = 1; i < count; i++) {
      const t = i / count;
      out.push([r.x0 + (r.x1 - r.x0) * t, COMPOUND_WALL.coping, r.z0 + (r.z1 - r.z0) * t]);
    }
  }
  return out;
}

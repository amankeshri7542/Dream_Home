// Curtains at the windows of the rooms people live in (pure, derived, never
// saved): a rod and two pleated panels gathered to the sides, so the window
// stays open and the room looks dressed. One merged mesh, one draw call.
import { BufferAttribute, BufferGeometry, Color } from "three";
import { autoLayoutKind } from "../../domain/furniture";
import { autoPalette } from "../../domain/materials";
import type { Project, Room } from "../../domain/types";
import { hash2 } from "../materials/noise";
import type { LightOpening, LightRoom, V3 } from "../roomlight/solve";

/** Rooms that get curtains: not kitchens, bathrooms, stores or shops. */
export const DRAPED = new Set(["living", "bedroom", "dining", "study", "kids", "guest"]);

const ROD_ABOVE = 0.13;
const OFF_WALL = 0.085;
/** Curtains stop just off the floor. */
const HEM = 0.025;
/** Soft furnishing colours stay light enough to glow a little in the window. */
const CREAM = new Color("#efe6d3");

const add = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

export type DrapePanel = {
  /** Bottom outer corner, world metres. */
  at: V3;
  /** Unit vector along the wall, towards the middle of the window. */
  along: V3;
  inward: V3;
  width: number;
  height: number;
  color: Color;
  seed: number;
};

/** Which panels a floor's rooms get (the geometry is built from these). */
export function drapePanels(project: Project, rooms: readonly LightRoom[], source: readonly Room[]): { panels: DrapePanel[]; rods: { from: V3; to: V3 }[] } {
  const panels: DrapePanel[] = [];
  const rods: { from: V3; to: V3 }[] = [];
  for (const room of rooms) {
    const original = source.find((r) => r.id === room.id);
    if (!original || !DRAPED.has(autoLayoutKind(original))) continue;
    const palette = autoPalette(project, original);
    const base = palette ? new Color(palette.soft).lerp(CREAM, 0.42) : CREAM.clone();
    room.openings.filter((o: LightOpening) => o.kind === "window").forEach((o, i) => {
      const width = Math.hypot(o.u[0], o.u[1], o.u[2]);
      if (width < 0.5) return;
      const unit: V3 = [o.u[0] / width, o.u[1] / width, o.u[2] / width];
      const head = o.p[1] + o.v[1];
      const rodY = Math.min(room.max[1] - 0.06, head + ROD_ABOVE);
      const hang = rodY - (room.min[1] + HEM);
      const panelW = Math.min(0.62, Math.max(0.3, width * 0.26));
      // The rod runs a little past the window, so the gathered panels clear the glass.
      const overhang = Math.min(0.16, panelW * 0.45);
      const left: V3 = add(add(o.p, unit, -overhang), o.inward, OFF_WALL);
      const right: V3 = add(add(o.p, unit, width + overhang), o.inward, OFF_WALL);
      rods.push({ from: [left[0], rodY, left[2]], to: [right[0], rodY, right[2]] });
      const seed = (hash2(i, Math.round(o.p[0] * 10), 601) * 1000) | 0;
      panels.push({ at: [left[0], room.min[1] + HEM, left[2]], along: unit, inward: o.inward, width: panelW, height: hang - 0.015, color: base, seed });
      panels.push({
        at: [right[0], room.min[1] + HEM, right[2]],
        along: [-unit[0], -unit[1], -unit[2]],
        inward: o.inward,
        width: panelW,
        height: hang - 0.015,
        color: base,
        seed: seed + 1,
      });
    });
  }
  return { panels, rods };
}

/** Everything merged into one geometry (position, normal, colour). */
export function drapeGeometry(panels: readonly DrapePanel[], rods: readonly { from: V3; to: V3 }[]): BufferGeometry | null {
  if (!panels.length) return null;
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    I: number[] = [];
  for (const panel of panels) {
    const rows = 5;
    const pleats = Math.max(4, Math.round(panel.width / 0.085));
    const cols = pleats * 4;
    const first = P.length / 3;
    const c = panel.color;
    const shadeJitter = 0.97 + hash2(panel.seed, 1, 603) * 0.06;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      // Tight at the rod, opening towards the hem.
      const spread = 0.84 + 0.2 * (1 - v) * (1 - v);
      const amp = 0.022 + 0.018 * (1 - v);
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const wander = (hash2(panel.seed, Math.floor(u * pleats), 605) - 0.5) * 0.3;
        const phase = u * pleats * Math.PI * 2 + wander * (1 - v);
        const depth = Math.sin(phase) * amp;
        const a = u * panel.width * spread;
        const slope = (Math.cos(phase) * amp * pleats * Math.PI * 2) / (panel.width * spread);
        const x = panel.at[0] + panel.along[0] * a + panel.inward[0] * depth,
          y = panel.at[1] + panel.height * v,
          z = panel.at[2] + panel.along[2] * a + panel.inward[2] * depth;
        P.push(x, y, z);
        const nx = panel.inward[0] - panel.along[0] * slope,
          nz = panel.inward[2] - panel.along[2] * slope;
        const l = Math.hypot(nx, nz) || 1;
        N.push(nx / l, 0, nz / l);
        // Folds go darker in their valleys: cheap, and it's most of what makes a curtain read.
        const fold = (0.8 + 0.2 * ((Math.sin(phase) + 1) / 2)) * shadeJitter;
        C.push(c.r * fold, c.g * fold, c.b * fold);
      }
    }
    const stride = cols + 1;
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < cols; i++) {
        const a = first + r * stride + i,
          b = a + 1,
          d = a + stride,
          e = d + 1;
        I.push(a, b, e, a, e, d);
      }
  }
  // The rods: dark bronze tubes.
  const bronze = new Color("#3a2c20");
  for (const rod of rods) {
    const sides = 8;
    const first = P.length / 3;
    const dx = rod.to[0] - rod.from[0],
      dz = rod.to[2] - rod.from[2];
    const l = Math.hypot(dx, dz) || 1;
    const sx = -dz / l,
      sz = dx / l;
    const radius = 0.012;
    for (const end of [rod.from, rod.to])
      for (let k = 0; k <= sides; k++) {
        const t = (k / sides) * Math.PI * 2;
        const ox = sx * Math.cos(t),
          oy = Math.sin(t),
          oz = sz * Math.cos(t);
        P.push(end[0] + ox * radius, end[1] + oy * radius, end[2] + oz * radius);
        N.push(ox, oy, oz);
        C.push(bronze.r, bronze.g, bronze.b);
      }
    const stride = sides + 1;
    for (let k = 0; k < sides; k++) {
      const a = first + k,
        b = a + 1,
        d = a + stride,
        e = d + 1;
      I.push(a, b, e, a, e, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(N), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(C), 3));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

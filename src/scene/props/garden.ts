// Pure garden plan: model placements (exterior kit ids) + flat beds/pads.
// Rendered with exterior.glb, or procedurally when the kit is unavailable.
import type { Project } from "../../domain/types";
import { GROUND_TOP } from "../coords";
import { ASSET_ITEMS } from "../assets/assetManifest";
import { hash2 } from "../materials/noise";
import type { SiteLayout } from "./site";

export type GardenModel = {
  model: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Scale relative to the model's natural (catalog) size. */
  scale: [number, number, number];
  /** Pickable landscape item id. */
  owner?: string;
};
export type GardenPad = { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; color: string; owner?: string };

export const modelSize = (model: string) => {
  const b = ASSET_ITEMS[model]?.bounds;
  return b ? { w: b.w / 100, d: b.d / 100, h: b.h / 100 } : { w: 1, d: 1, h: 1 };
};

/** Landscape catalog kind → exterior kit model id. */
export const KIND_MODEL: Record<string, string> = {
  parking: "car",
  hedge: "hedge-module",
  flowerbed: "flowerbed-module",
};

/** Tile a module model along a run (x0,z0)→(x1,z1) of thickness `depth`. */
function tileRun(out: GardenModel[], model: string, x0: number, z0: number, x1: number, z1: number, height: number, depth: number, owner?: string) {
  const size = modelSize(model);
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.round(len / size.w));
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * seg;
    out.push({
      model,
      x: alongX ? Math.min(x0, x1) + t : (x0 + x1) / 2,
      z: alongX ? (z0 + z1) / 2 : Math.min(z0, z1) + t,
      y: GROUND_TOP,
      yaw: alongX ? 0 : Math.PI / 2,
      scale: [seg / size.w, height / size.h, depth / size.d],
      owner,
    });
  }
}

export function gardenPlan(project: Project, layout: SiteLayout): { models: GardenModel[]; pads: GardenPad[] } {
  const models: GardenModel[] = [];
  const pads: GardenPad[] = [];
  const w = project.plot.width / 100,
    d = project.plot.depth / 100;
  if (project.landscape) {
    for (const item of project.landscape) {
      const x = item.x / 100,
        z = item.z / 100;
      const iw = (item.w ?? 80) / 100,
        id = (item.d ?? 80) / 100;
      const owner = item.id;
      const yaw = (-item.rotation * Math.PI) / 180;
      const vs = item.variant === "s" ? 0.75 : item.variant === "l" ? 1.25 : 1;
      if (item.kind === "path" || item.kind === "patio" || item.kind === "pool") {
        pads.push({ x0: x - iw / 2, z0: z - id / 2, x1: x + iw / 2, z1: z + id / 2, y0: GROUND_TOP - 0.01, y1: GROUND_TOP + 0.03, color: item.kind === "pool" ? "#e9e3d6" : "#d9cdb6", owner });
        if (item.kind === "pool")
          pads.push({ x0: x - iw / 2 + 0.2, z0: z - id / 2 + 0.2, x1: x + iw / 2 - 0.2, z1: z + id / 2 - 0.2, y0: GROUND_TOP, y1: GROUND_TOP + 0.034, color: "#6fb7c9", owner });
        continue;
      }
      if (item.kind === "hedge" || item.kind === "flowerbed") {
        const model = KIND_MODEL[item.kind];
        const turned = item.rotation % 180 !== 0;
        const len = turned ? id : iw,
          thick = turned ? iw : id;
        if (turned) tileRun(models, model, x, z - len / 2, x, z + len / 2, modelSize(model).h, thick, owner);
        else tileRun(models, model, x - len / 2, z, x + len / 2, z, modelSize(model).h, thick, owner);
        continue;
      }
      const model = KIND_MODEL[item.kind] ?? item.kind;
      if (!ASSET_ITEMS[model]) {
        pads.push({ x0: x - iw / 2, z0: z - id / 2, x1: x + iw / 2, z1: z + id / 2, y0: GROUND_TOP, y1: GROUND_TOP + 0.4, color: "#c8bda9", owner });
        continue;
      }
      if (model === "car") pads.push({ x0: x - 1.3, z0: z - 2.3, x1: x + 1.3, z1: z + 2.3, y0: GROUND_TOP - 0.01, y1: GROUND_TOP + 0.012, color: "#dcd8ce", owner });
      const tree = model.startsWith("tree-");
      models.push({ model, x, y: GROUND_TOP, z, yaw, scale: tree ? [vs * 0.75, vs * 0.75, vs * 0.75] : [vs, vs, vs], owner });
    }
  } else if (project.garden) {
    for (const t of layout.trees) {
      const s = t.scale * 0.72;
      models.push({ model: `tree-${t.kind}`, x: t.x, y: GROUND_TOP, z: t.z, yaw: hash2(Math.round(t.x * 10), Math.round(t.z * 10), 3) * Math.PI * 2, scale: [s, s, s] });
    }
    for (const s of layout.shrubs) {
      const k = (s.r * 2) / modelSize("shrub").w;
      models.push({ model: "shrub", x: s.x, y: GROUND_TOP, z: s.z, yaw: 0, scale: [k, k * 0.9, k] });
    }
    // Low hedges along the non-road boundaries, skipping the house and parking.
    const road = project.plot.road;
    const inset = 0.28,
      th = 0.38,
      hh = 0.62;
    const blocked = (ax: number, az: number, bx: number, bz: number) =>
      project.floors.some((f) => {
        const fp = f.footprint;
        return ax < (fp.x + fp.w) / 100 + 0.3 && bx > fp.x / 100 - 0.3 && az < (fp.z + fp.d) / 100 + 0.3 && bz > fp.z / 100 - 0.3;
      }) || layout.obstacles.slice(-2).some((o) => ax < o.x1 && bx > o.x0 && az < o.z1 && bz > o.z0);
    const runs: [number, number, number, number][] = [];
    if (road !== "north") runs.push([inset, inset + th / 2, w - inset, inset + th / 2]);
    if (road !== "south") runs.push([inset, d - inset - th / 2, w - inset, d - inset - th / 2]);
    const endZ = d - inset - (road === "south" ? 0.6 : th);
    if (road !== "west") runs.push([inset + th / 2, inset + th, inset + th / 2, endZ]);
    if (road !== "east") runs.push([w - inset - th / 2, inset + th, w - inset - th / 2, endZ]);
    for (const [x0, z0, x1, z1] of runs) {
      const segs: GardenModel[] = [];
      tileRun(segs, "hedge-module", x0, z0, x1, z1, hh, th);
      for (const s of segs) {
        const half = (modelSize("hedge-module").w * s.scale[0]) / 2;
        const alongX = s.yaw === 0;
        const bx0 = alongX ? s.x - half : s.x - th / 2,
          bx1 = alongX ? s.x + half : s.x + th / 2,
          bz0 = alongX ? s.z - th / 2 : s.z - half,
          bz1 = alongX ? s.z + th / 2 : s.z + half;
        if (!blocked(bx0, bz0, bx1, bz1)) models.push(s);
      }
    }
  }
  // Courtyard beds on the ground floor.
  const ground = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  project.verticalSpaces
    .filter((v) => v.kind === "courtyard" && v.floorIds.includes(ground.id))
    .forEach((c, i) => {
      const r = c.bounds;
      const x0 = r.x / 100,
        z0 = r.z / 100,
        x1 = (r.x + r.w) / 100,
        z1 = (r.z + r.d) / 100;
      pads.push({ x0: x0 + 0.12, z0: z0 + 0.12, x1: x1 - 0.12, z1: z1 - 0.12, y0: 0, y1: 0.16, color: "#cfc4ae" });
      pads.push({ x0: x0 + 0.22, z0: z0 + 0.22, x1: x1 - 0.22, z1: z1 - 0.22, y0: 0, y1: 0.17, color: "#7f9f6a" });
      const s = Math.min(0.55, Math.min(r.w, r.d) / 420);
      models.push({ model: "tree-blossom", x: (x0 + x1) / 2, y: 0.17, z: (z0 + z1) / 2, yaw: i, scale: [s, s, s] });
      models.push({ model: "shrub", x: x0 + 0.55, y: 0.17, z: z1 - 0.55, yaw: 0, scale: [0.6, 0.6, 0.6] });
    });
  return { models, pads };
}

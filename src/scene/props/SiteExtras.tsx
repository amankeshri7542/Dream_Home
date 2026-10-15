// Site structures driven by the style: the boundary (`site.fence`: compound
// wall with pillars and gates, low stone wall, picket/timber panels or a
// hedge) and the car porch over the parking pad. Procedural parts share two
// meshes (plaster, stone); gates, panels and hedges come from exterior.glb.
import { useMemo } from "react";
import { Color } from "three";
import { EXTERIOR_FINISHES, exteriorFinish, styleDetails, trimColor, TRIM_COLORS } from "../../domain/materials";
import { FENCE_STYLES } from "../../domain/landscape";
import type { Project } from "../../domain/types";
import { GROUND_TOP } from "../coords";
import { Buckets, mixRgb, rgb, type QuadBuilder, type RGB } from "../building/geometry/QuadBuilder";
import { useBuckets } from "../building/useBuckets";
import type { MaterialLibrary } from "../materials/library";
import type { Placement } from "./batched";
import { fencePlan, parkingSpots, type FencePlan, type ParkingSpot } from "./fence";
import { modelSize } from "./garden";
import { KitPlacements } from "./KitPlacements";
import { modelMatrix } from "./Landscape";
import { roadFrame, type SiteLayout } from "./site";

type Props = { project: Project; layout: SiteLayout; library: MaterialLibrary; landscape: boolean };

const WALL_T = 0.2;
const GATE_TINT: Record<string, string> = {
  "compound-wall": "#33373a",
  "low-wall": "#33373a",
  picket: "#efe9df",
  timber: "#9a6f4c",
};

/** Axis-aligned box along a run (x0,z0)→(x1,z1), `t` thick, y0..y1. */
function runBox(b: QuadBuilder, r: { x0: number; z0: number; x1: number; z1: number }, t: number, y0: number, y1: number, color: RGB, extend = 0) {
  const alongX = Math.abs(r.x1 - r.x0) >= Math.abs(r.z1 - r.z0);
  if (alongX)
    b.box([Math.min(r.x0, r.x1) - extend, y0, r.z0 - t / 2], [Math.max(r.x0, r.x1) + extend, y1, r.z0 + t / 2], color);
  else b.box([r.x0 - t / 2, y0, Math.min(r.z0, r.z1) - extend], [r.x0 + t / 2, y1, Math.max(r.z0, r.z1) + extend], color);
}
const square = (b: QuadBuilder, x: number, z: number, half: number, y0: number, y1: number, color: RGB) =>
  b.box([x - half, y0, z - half], [x + half, y1, z + half], color);

/**
 * The boundary. A compound wall is plastered like the house (a shade lighter),
 * with pillars in the trim colour as the accent, so a dark trim such as maroon
 * picks out the pillars instead of turning the whole wall heavy.
 */
export function emitBoundary(plan: FencePlan, trimHex: string, plaster: QuadBuilder, stone: QuadBuilder, wallHex = trimHex) {
  const g = GROUND_TOP - 0.02;
  const trim = rgb(trimHex);
  const body = mixRgb(rgb(wallHex), rgb("#f6f1e7"), 0.3);
  const coping = rgb("#e6e0d5"),
    plinth = mixRgb(trim, rgb("#8f877b"), 0.55);
  if (plan.kind === "compound-wall") {
    for (const r of plan.runs) {
      runBox(plaster, r, WALL_T, g, 1.1, body);
      runBox(stone, r, WALL_T + 0.02, g, GROUND_TOP + 0.16, plinth);
      runBox(stone, r, WALL_T + 0.08, 1.1, 1.16, coping, 0.04);
    }
    for (const [x, z] of plan.pillars) {
      square(plaster, x, z, 0.18, g, 1.34, trim);
      square(stone, x, z, 0.19, g, GROUND_TOP + 0.16, plinth);
      square(stone, x, z, 0.23, 1.34, 1.41, coping);
      square(stone, x, z, 0.15, 1.41, 1.46, coping);
    }
  } else if (plan.kind === "low-wall") {
    const wall = rgb(FENCE_STYLES["low-wall"]?.color ?? "#cbbfa8");
    for (const r of plan.runs) {
      runBox(stone, r, 0.28, g, 0.58, wall);
      runBox(stone, r, 0.34, 0.58, 0.64, coping, 0.03);
    }
    for (const [x, z] of plan.pillars) {
      square(plaster, x, z, 0.18, g, 0.82, trim);
      square(stone, x, z, 0.22, 0.82, 0.88, coping);
    }
  }
}

export function emitCarPorch(spot: ParkingSpot, trimHex: string, plaster: QuadBuilder, stone: QuadBuilder) {
  const trim = rgb(trimHex);
  const slab = rgb("#efebe3");
  const { cx, cz } = spot;
  const hx = spot.hx + 0.25,
    hz = spot.hz + 0.25;
  const y0 = 2.42,
    y1 = 2.54;
  plaster.box([cx - hx, y0, cz - hz], [cx + hx, y1, cz + hz], slab);
  // Slim fascia all round.
  const f = 0.05;
  stone.box([cx - hx - f, y0 - 0.06, cz - hz - f], [cx + hx + f, y1 + 0.04, cz - hz], trim);
  stone.box([cx - hx - f, y0 - 0.06, cz + hz], [cx + hx + f, y1 + 0.04, cz + hz + f], trim);
  stone.box([cx - hx - f, y0 - 0.06, cz - hz], [cx - hx, y1 + 0.04, cz + hz], trim);
  stone.box([cx + hx, y0 - 0.06, cz - hz], [cx + hx + f, y1 + 0.04, cz + hz], trim);
  // Two slim columns at the road end, with a beam between them.
  const [rx, rz] = spot.road;
  const endX = cx + rx * (hx - 0.2),
    endZ = cz + rz * (hz - 0.2);
  const side = rx !== 0 ? [cz - hz + 0.2, cz + hz - 0.2] : [cx - hx + 0.2, cx + hx - 0.2];
  for (const s of side) {
    const [x, z] = rx !== 0 ? [endX, s] : [s, endZ];
    square(plaster, x, z, 0.09, GROUND_TOP, y0, trim);
    square(stone, x, z, 0.13, GROUND_TOP - 0.01, GROUND_TOP + 0.12, rgb("#cfc8bb"));
  }
  if (rx !== 0) stone.box([endX - 0.1, y0 - 0.2, cz - hz + 0.1], [endX + 0.1, y0, cz + hz - 0.1], trim);
  else stone.box([cx - hx + 0.1, y0 - 0.2, endZ - 0.1], [cx + hx - 0.1, y0, endZ + 0.1], trim);
}

/** Kit placements for gates, fence panels and hedge modules. */
export function boundaryPlacements(plan: FencePlan): Placement[] {
  const out: Placement[] = [];
  const tintHex = GATE_TINT[plan.kind];
  const tints = tintHex ? { wood: new Color(tintHex), metal: plan.kind.includes("wall") ? new Color("#2a2d2f") : undefined } : undefined;
  const yawOf = (alongX: boolean) => (alongX ? 0 : Math.PI / 2);
  const tile = (model: string, height: number, depth: number) => {
    const size = modelSize(model);
    for (const r of plan.runs) {
      const alongX = Math.abs(r.x1 - r.x0) >= Math.abs(r.z1 - r.z0);
      const len = alongX ? Math.abs(r.x1 - r.x0) : Math.abs(r.z1 - r.z0);
      const n = Math.max(1, Math.round(len / size.w));
      const seg = len / n;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) * seg;
        const x = alongX ? Math.min(r.x0, r.x1) + t : r.x0,
          z = alongX ? r.z0 : Math.min(r.z0, r.z1) + t;
        out.push({
          model,
          matrix: modelMatrix({ x, y: GROUND_TOP, z, yaw: yawOf(alongX), scale: [seg / size.w, height / size.h, depth / size.d] }),
          owner: `fence:${out.length}`,
          tints,
        });
      }
    }
  };
  if (plan.kind === "picket" || plan.kind === "timber") tile("fence-panel", plan.kind === "picket" ? 1.0 : 1.2, modelSize("fence-panel").d);
  if (plan.kind === "hedge") tile("hedge-module", 1.0, 0.5);
  if (plan.kind === "hedge") return out;
  const gate = modelSize("gate");
  const height = plan.kind === "low-wall" ? 0.85 : plan.kind === "compound-wall" ? 1.25 : 1.1;
  for (const g of plan.gates) {
    const leaves = g.kind === "drive" ? 2 : 1;
    const lw = (g.width - 0.08) / leaves;
    for (let k = 0; k < leaves; k++) {
      const off = leaves === 1 ? 0 : (k === 0 ? -1 : 1) * (lw / 2 + 0.02);
      const x = g.alongX ? g.x + off : g.x,
        z = g.alongX ? g.z : g.z + off;
      out.push({
        model: "gate",
        matrix: modelMatrix({ x, y: GROUND_TOP, z, yaw: yawOf(g.alongX) + (k === 1 ? Math.PI : 0), scale: [lw / gate.w, height / gate.h, 1] }),
        owner: `gate:${out.length}`,
        tints,
      });
    }
  }
  return out;
}

const STREET_LIGHT_GAP = 9;
/** The kerb, between the pavement and the road, in metres out from the plot edge. */
const KERB_OUT = 0.62;
/**
 * Municipal street lights along the kerb of an Indian street: about every 9 m,
 * clear of the gates, arms reaching over the road.
 */
export function streetLightPlacements(project: Project, gates: FencePlan["gates"] = []): Placement[] {
  const frame = roadFrame(project);
  const size = modelSize("street-light");
  // The model's pole stands near its -x end; its arm points to +x.
  const poleOffset = size.w / 2 - size.d / 2;
  const yaw = { south: -Math.PI / 2, north: Math.PI / 2, east: 0, west: Math.PI }[frame.road];
  // Gates (walk and drive) and how far a pole keeps from each.
  const clear = gates.map((g) => ({ at: frame.horizontal ? g.x : g.z, gap: g.width / 2 + 1 }));
  const start = frame.alongMin + 1.2,
    end = frame.alongMax - 1.2;
  const count = Math.max(1, Math.floor((end - start) / STREET_LIGHT_GAP) + 1);
  const out: Placement[] = [];
  for (let i = 0; i < count; i++) {
    let along = count === 1 ? start : start + ((end - start) * i) / (count - 1);
    // Step aside from gates so people and cars never meet a pole.
    for (const g of clear) if (Math.abs(along - g.at) < g.gap) along = g.at + (along <= g.at ? -g.gap : g.gap);
    if (along < frame.alongMin + 0.3 || along > frame.alongMax - 0.3) continue;
    const [x, z] = frame.toPlot(along, KERB_OUT + poleOffset);
    out.push({
      model: "street-light",
      matrix: modelMatrix({ x, y: 0.05, z, yaw, scale: [1, 1, 1] }),
      owner: `street-light:${i}`,
    });
  }
  return out;
}

export function SiteExtras({ project, layout, library, landscape }: Props) {
  const trimHex = TRIM_COLORS[trimColor(project)].color;
  const wallHex = EXTERIOR_FINISHES[exteriorFinish(project)].color;
  const porch = styleDetails(project).carPorch;
  const key = JSON.stringify([project.plot, project.site?.fence ?? null, project.landscape ?? null, project.floors.map((f) => f.footprint), layout.path, layout.parking, landscape, porch, trimHex, wallHex]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => (landscape ? fencePlan(project, layout) : null), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spots = useMemo(() => (porch ? parkingSpots(project, layout) : []), [key]);
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"plaster" | "stone">();
    if (plan) emitBoundary(plan, trimHex, buckets.get("plaster"), buckets.get("stone"), wallHex);
    for (const s of spots) emitCarPorch(s, trimHex, buckets.get("plaster"), buckets.get("stone"));
    return { buckets };
  }, [plan, spots, trimHex, wallHex]);
  // Indian looks get a proper street, lit at night.
  const indian = project.style?.preset?.startsWith("indian") ?? false;
  const placements = useMemo(
    () => [...(plan ? boundaryPlacements(plan) : []), ...(indian && landscape ? streetLightPlacements(project, plan?.gates) : [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, indian, landscape, key],
  );
  const materials = { plaster: library.sitePlaster(), stone: library.siteStone() };
  if (!plan && !spots.length && !placements.length) return null;
  return (
    <group name="site-extras">
      {plan && <group name={`boundary-${plan.kind}`} userData={{ runs: plan.runs.length, gates: plan.gates.length, pillars: plan.pillars.length }} />}
      {spots.length > 0 && <group name="car-porch" userData={{ count: spots.length }} />}
      {indian && landscape && <group name="street-lights" userData={{ count: placements.filter((p) => p.model === "street-light").length }} />}
      {built.map((b) => (
        <mesh key={b.key} geometry={b.geometry} material={materials[b.key]} castShadow receiveShadow dispose={null} />
      ))}
      {placements.length > 0 && <KitPlacements kit="exterior" placements={placements} library={library} fallback={null} />}
    </group>
  );
}

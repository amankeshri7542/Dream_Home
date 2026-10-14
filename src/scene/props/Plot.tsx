// Plot dressing: setback chalk dashes, the stepping-stone path, the parking pad
// with driveway and a toy car. All merged per material.
import { useMemo } from "react";
import type { Project } from "../../domain/types";
import { GROUND_TOP } from "../coords";
import { Buckets, mixRgb, rgb, type QuadBuilder, type RGB } from "../building/geometry/QuadBuilder";
import { useBuckets } from "../building/useBuckets";
import type { MaterialLibrary } from "../materials/library";
import { hash2 } from "../materials/noise";
import type { SiteLayout } from "./site";
import { wheelX } from "./shapes";
import type { Placement } from "./batched";
import { KitPlacements } from "./KitPlacements";
import { modelMatrix } from "./Landscape";

type Props = { project: Project; layout: SiteLayout; landscape: boolean; library: MaterialLibrary };

export function Plot({ project, layout, landscape, library }: Props) {
  const plot = project.plot;
  const key = JSON.stringify([plot, layout.path, layout.parking, landscape]);
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"marks" | "pavers">();
    const marks = buckets.get("marks");
    const w = plot.width / 100,
      d = plot.depth / 100,
      s = plot.setback / 100;
    const chalk = rgb("#f4f1e6");
    const y = GROUND_TOP + 0.002;
    if (s > 0 && s * 2 < Math.min(w, d)) {
      const dash = 0.24,
        gap = 0.18,
        half = 0.022;
      const edge = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const dx = (x1 - x0) / len,
          dz = (z1 - z0) / len;
        for (let t = 0; t < len; t += dash + gap) {
          const t1 = Math.min(len, t + dash);
          const ax = x0 + dx * t,
            az = z0 + dz * t,
            bx = x0 + dx * t1,
            bz = z0 + dz * t1;
          marks.box(
            [Math.min(ax, bx) - Math.abs(dz) * half, y - 0.004, Math.min(az, bz) - Math.abs(dx) * half],
            [Math.max(ax, bx) + Math.abs(dz) * half, y, Math.max(az, bz) + Math.abs(dx) * half],
            chalk,
            [2],
          );
        }
      };
      edge(s, s, w - s, s);
      edge(w - s, s, w - s, d - s);
      edge(w - s, d - s, s, d - s);
      edge(s, d - s, s, s);
    }
    const pavers = buckets.get("pavers");
    if (landscape)
      for (const p of layout.path) {
        const alongZ = p.z1 - p.z0 > p.x1 - p.x0;
        const len = alongZ ? p.z1 - p.z0 : p.x1 - p.x0;
        const step = 0.5;
        for (let t = 0.06, i = 0; t + 0.36 <= len + 0.01; t += step, i++) {
          const tone = 0.92 + hash2(i, 1, 9) * 0.12;
          const c: RGB = mixRgb(rgb("#d8cdb8"), [tone, tone, tone], 0.2);
          const jitter = (hash2(i, 2, 9) - 0.5) * 0.08;
          if (alongZ)
            pavers.box([p.x0 + 0.02 + jitter, GROUND_TOP - 0.01, p.z0 + t], [p.x1 - 0.02 + jitter, GROUND_TOP + 0.022, p.z0 + t + 0.38], c, [2]);
          else
            pavers.box([p.x0 + t, GROUND_TOP - 0.01, p.z0 + 0.02 + jitter], [p.x0 + t + 0.38, GROUND_TOP + 0.022, p.z1 - 0.02 + jitter], c, [2]);
        }
      }
    const park = layout.parking;
    if (park) {
      const [cx, cz] = park.center;
      const hw = park.horizontal ? 1.3 : 2.3,
        hd = park.horizontal ? 2.3 : 1.3;
      const concrete = rgb("#dcd8ce");
      pavers.box([cx - hw, GROUND_TOP - 0.01, cz - hd], [cx + hw, GROUND_TOP + 0.012, cz + hd], concrete, [2]);
      const dw = park.driveway;
      pavers.box([dw.x0, GROUND_TOP - 0.01, dw.z0], [dw.x1, GROUND_TOP + 0.011, dw.z1], concrete, [2]);
      // Bay lines.
      const line = rgb("#fbfaf4");
      if (park.horizontal) {
        for (const sx of [-1.15, 1.15]) marks.box([cx + sx - 0.03, GROUND_TOP + 0.012, cz - 2.1], [cx + sx + 0.03, GROUND_TOP + 0.015, cz + 2.1], line, [2]);
      } else {
        for (const sz of [-1.15, 1.15]) marks.box([cx - 2.1, GROUND_TOP + 0.012, cz + sz - 0.03], [cx + 2.1, GROUND_TOP + 0.015, cz + sz + 0.03], line, [2]);
      }
    }
    return { buckets };
  }, [key]);
  const park = layout.parking;
  const carPlacement = useMemo<Placement[]>(() => {
    if (!park) return [];
    const road = project.plot.road;
    // Nose toward the road.
    const yaw = road === "south" ? 0 : road === "north" ? Math.PI : road === "east" ? Math.PI / 2 : -Math.PI / 2;
    return [{ model: "car", matrix: modelMatrix({ x: park.center[0], y: GROUND_TOP + 0.012, z: park.center[1], yaw, scale: [0.92, 0.92, 0.92] }), owner: "car" }];
  }, [park, project.plot.road]);
  const materials = {
    marks: library.vertexColor("marks", 0.7),
    pavers: library.pavers(),
  };
  return (
    <group name="plot">
      {built.map((b) => (
        <mesh key={b.key} geometry={b.geometry} material={materials[b.key]} receiveShadow dispose={null} />
      ))}
      {park && (
        <KitPlacements
          kit="exterior"
          placements={carPlacement}
          library={library}
          fallback={<ToyCar cx={park.center[0]} cz={park.center[1]} alongZ={park.horizontal} library={library} />}
        />
      )}
    </group>
  );
}

function ToyCar({ cx, cz, alongZ, library }: { cx: number; cz: number; alongZ: boolean; library: MaterialLibrary }) {
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"car">();
    toyCar(buckets.get("car"), cx, cz, alongZ);
    return { buckets };
  }, [cx, cz, alongZ]);
  return (
    <>
      {built.map((b) => (
        <mesh key={b.key} geometry={b.geometry} material={library.vertexColor("car", 0.35)} castShadow receiveShadow dispose={null} />
      ))}
    </>
  );
}

/** A cute rounded toy car (≈1.7 × 3.6 m) parked along the bay. */
function toyCar(b: QuadBuilder, cx: number, cz: number, alongZ: boolean) {
  const body = rgb("#8fb6c1"),
    roof = rgb("#f2efe8"),
    glass = rgb("#3f5560"),
    tyre = rgb("#34322f"),
    light = rgb("#fff1c9");
  const y0 = GROUND_TOP + 0.012;
  // Build along z then rotate for x-aligned bays by swapping axes.
  const box = (x0: number, y_0: number, z0: number, x1: number, y_1: number, z1: number, c: RGB, bevel = 0.08) => {
    const lo: [number, number, number] = alongZ ? [cx + x0, y0 + y_0, cz + z0] : [cx + z0, y0 + y_0, cz + x0];
    const hi: [number, number, number] = alongZ ? [cx + x1, y0 + y_1, cz + z1] : [cx + z1, y0 + y_1, cz + x1];
    b.softBox(lo, hi, c, bevel);
  };
  box(-0.82, 0.22, -1.78, 0.82, 0.78, 1.78, body, 0.16);
  box(-0.7, 0.74, -0.85, 0.7, 1.28, 0.75, roof, 0.14);
  box(-0.72, 0.8, -0.8, 0.72, 1.18, 0.7, glass, 0.08);
  box(-0.6, 0.5, 1.74, -0.36, 0.64, 1.8, light, 0.02);
  box(0.36, 0.5, 1.74, 0.6, 0.64, 1.8, light, 0.02);
  for (const sx of [-0.78, 0.78])
    for (const sz of [-1.12, 1.12]) {
      if (alongZ) wheelX(b, [cx + sx, y0 + 0.27, cz + sz], 0.27, 0.2, tyre);
      else {
        // Wheels along x for z-axis bays: emit as soft boxes (rounded) instead.
        b.softBox([cx + sz - 0.27, y0, cz + sx - 0.1], [cx + sz + 0.27, y0 + 0.54, cz + sx + 0.1], tyre, 0.1);
      }
    }
}

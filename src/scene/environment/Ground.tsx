// The diorama base: a plot-sized plinth (lawn top, soil-strata sides, a road
// band cut into it), a soft blob shadow, and a large backdrop disc tinted by
// the time of day that melts into the fog/sky.
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  Color,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";
import type { GroundId } from "../../domain/materials";
import type { Project } from "../../domain/types";
import { GROUND_TOP, PLINTH_BOTTOM } from "../coords";
import { Buckets, rgb, type RGB, type V3 } from "../building/geometry/QuadBuilder";
import { useBuckets } from "../building/useBuckets";
import type { MaterialLibrary } from "../materials/library";
import { gradientTexture } from "../materials/textures";
import { hash2 } from "../materials/noise";
import { plinthExtents, roadFrame } from "../props/site";
import type { Lighting } from "./timeOfDay";

const STRATA: [number, string][] = [
  [PLINTH_BOTTOM, "#6f5642"],
  [-0.56, "#7d614a"],
  [-0.4, "#a88664"],
  [-0.26, "#8a6a4e"],
  [-0.12, "#9b7a59"],
  [-0.03, "#6e5a3e"],
];

type Props = { project: Project; ground: GroundId; library: MaterialLibrary; light: Lighting };

export function Ground({ project, ground, library, light }: Props) {
  const ext = plinthExtents(project);
  const plot = project.plot;
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"soil" | "lawn" | "asphalt" | "pavers" | "marks">();
    const soil = buckets.get("soil");
    // Soil body with strata bands on the four sides.
    const sides: { a: [number, number]; b: [number, number]; n: V3 }[] = [
      { a: [ext.x0, ext.z1], b: [ext.x1, ext.z1], n: [0, 0, 1] },
      { a: [ext.x1, ext.z0], b: [ext.x0, ext.z0], n: [0, 0, -1] },
      { a: [ext.x1, ext.z1], b: [ext.x1, ext.z0], n: [1, 0, 0] },
      { a: [ext.x0, ext.z0], b: [ext.x0, ext.z1], n: [-1, 0, 0] },
    ];
    for (const s of sides) {
      for (let i = 0; i < STRATA.length; i++) {
        const y0 = STRATA[i][0],
          y1 = i + 1 < STRATA.length ? STRATA[i + 1][0] : 0;
        const c = rgb(STRATA[i][1]);
        // Wavy band edges: split long sides into segments with jittered tops.
        const segs = Math.max(2, Math.round(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / 1.5));
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs,
            t1 = (k + 1) / segs;
          const P = (t: number, y: number): V3 => [s.a[0] + (s.b[0] - s.a[0]) * t, y, s.a[1] + (s.b[1] - s.a[1]) * t];
          const j = (t: number, base: number) =>
            base + (i + 1 < STRATA.length ? (hash2(Math.round(t * segs), i, 3) - 0.5) * 0.05 : 0);
          const jb = (t: number) => (i > 0 ? y0 + (hash2(Math.round(t * segs), i - 1, 3) - 0.5) * 0.05 : y0);
          const shade = 0.96 + hash2(k, i, 4) * 0.08;
          const cc: RGB = [c[0] * shade, c[1] * shade, c[2] * shade];
          soil.quadFacing(P(t0, jb(t0)), P(t1, jb(t1)), P(t1, j(t1, y1)), P(t0, j(t0, y1)), s.n, cc);
        }
      }
    }
    // Lawn slab over the plot (and side pads) up to the road band.
    const frame = roadFrame(project);
    const w = plot.width / 100,
      d = plot.depth / 100;
    const lawn =
      frame.road === "south"
        ? { x0: ext.x0, x1: ext.x1, z0: ext.z0, z1: d }
        : frame.road === "north"
          ? { x0: ext.x0, x1: ext.x1, z0: 0, z1: ext.z1 }
          : frame.road === "east"
            ? { x0: ext.x0, x1: w, z0: ext.z0, z1: ext.z1 }
            : { x0: 0, x1: ext.x1, z0: ext.z0, z1: ext.z1 };
    buckets.get("lawn").box([lawn.x0, -0.03, lawn.z0], [lawn.x1, GROUND_TOP, lawn.z1], [1, 1, 1], [2]);
    // Road band: sidewalk, kerbs, asphalt, far kerb and a grass verge.
    const band = (b: "asphalt" | "pavers" | "lawn", o0: number, o1: number, y1: number, color: RGB) => {
      const [ax, az] = frame.toPlot(frame.alongMin, o0),
        [bx, bz] = frame.toPlot(frame.alongMax, o1);
      buckets
        .get(b)
        .box([Math.min(ax, bx), -0.03, Math.min(az, bz)], [Math.max(ax, bx), y1, Math.max(az, bz)], color, [2]);
    };
    band("pavers", 0, 0.55, 0.05, rgb("#d9d2c4"));
    band("pavers", 0.55, 0.67, 0.075, rgb("#e6e1d6"));
    band("asphalt", 0.67, 3.93, 0.012, rgb("#5f6466"));
    band("pavers", 3.93, 4.05, 0.075, rgb("#e6e1d6"));
    band("lawn", 4.05, 4.4, GROUND_TOP, [1, 1, 1]);
    // Merged lane dashes.
    const marks = buckets.get("marks");
    const mid = (0.67 + 3.93) / 2;
    for (let a = frame.alongMin + 0.6; a + 0.9 < frame.alongMax; a += 2) {
      const [x0, z0] = frame.toPlot(a, mid - 0.045),
        [x1, z1] = frame.toPlot(a + 0.9, mid + 0.045);
      marks.box([Math.min(x0, x1), 0.012, Math.min(z0, z1)], [Math.max(x0, x1), 0.0145, Math.max(z0, z1)], rgb("#f2efe6"), [2]);
    }
    return { buckets };
  }, [ext.x0, ext.x1, ext.z0, ext.z1, plot.width, plot.depth, plot.road]);

  const materials = {
    soil: library.vertexColor("soil", 0.95),
    lawn: library.ground(ground),
    asphalt: library.asphalt(),
    pavers: library.pavers(),
    marks: library.vertexColor("marks", 0.7),
  };

  // Backdrop disc: radial colour gradient (vertex colours) + fog.
  const ringDisc = useMemo(() => makeRingDisc(), []);
  useEffect(() => () => ringDisc.dispose(), [ringDisc]);
  const backdropMaterial = useMemo(() => new MeshBasicMaterial({ vertexColors: true }), []);
  const p = light.palette;
  useEffect(() => {
    // A soft studio backdrop: warm paper near the diorama, melting into the
    // horizon colour (which the fog also uses) far away. Night darkens it.
    const level = 1 - 0.82 * light.night;
    const paper = new Color("#efe8da").multiplyScalar(level);
    const near = paper.clone().lerp(p.ground, 0.22 + 0.5 * light.night);
    const far = p.horizon.clone().lerp(near, 0.35);
    const colors = ringDisc.getAttribute("color") as BufferAttribute;
    const positions = ringDisc.getAttribute("position");
    const c = new Color();
    for (let i = 0; i < positions.count; i++) {
      const r = Math.hypot(positions.getX(i), positions.getY(i));
      const t = Math.min(1, Math.max(0, (r - 14) / 160));
      const n = (hash2(i, 3, 11) - 0.5) * 0.04 * (1 - t);
      c.copy(near).lerp(far, Math.pow(t, 0.7));
      colors.setXYZ(i, c.r * (1 + n), c.g * (1 + n), c.b * (1 + n));
    }
    colors.needsUpdate = true;
  }, [p, ringDisc, light.night]);

  const blob = useMemo(() => {
    const mat = new MeshBasicMaterial({
      color: "#1d160f",
      transparent: true,
      opacity: 0.32,
      alphaMap: gradientTexture("radial", 128),
      depthWrite: false,
    });
    return mat;
  }, []);
  const blobGeometry = useMemo(
    () => new PlaneGeometry(ext.x1 - ext.x0 + 7, ext.z1 - ext.z0 + 7),
    [ext.x0, ext.x1, ext.z0, ext.z1],
  );
  useEffect(() => () => blobGeometry.dispose(), [blobGeometry]);
  const cx = (ext.x0 + ext.x1) / 2,
    cz = (ext.z0 + ext.z1) / 2;

  return (
    <group name="ground">
      {built.map((b) => (
        <mesh
          key={b.key}
          geometry={b.geometry}
          material={materials[b.key]}
          receiveShadow
          dispose={null}
        />
      ))}
      <mesh
        geometry={blobGeometry}
        material={blob}
        position={[cx, PLINTH_BOTTOM + 0.004, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-1}
        raycast={() => null}
        dispose={null}
      />
      <mesh
        geometry={ringDisc}
        material={backdropMaterial}
        position={[cx, PLINTH_BOTTOM, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-2}
        raycast={() => null}
        dispose={null}
      />
    </group>
  );
}

/** A disc with concentric rings (so vertex colours can form a radial gradient). */
function makeRingDisc() {
  const rings = [0, 6, 10, 14, 20, 28, 40, 60, 90, 130, 190, 300];
  const segs = 72;
  const positions: number[] = [];
  const index: number[] = [];
  positions.push(0, 0, 0);
  for (let r = 1; r < rings.length; r++)
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      positions.push(Math.cos(a) * rings[r], Math.sin(a) * rings[r], 0);
    }
  const ringStart = (r: number) => 1 + (r - 1) * segs;
  for (let s = 0; s < segs; s++) index.push(0, ringStart(1) + s, ringStart(1) + ((s + 1) % segs));
  for (let r = 1; r < rings.length - 1; r++)
    for (let s = 0; s < segs; s++) {
      const a = ringStart(r) + s,
        b = ringStart(r) + ((s + 1) % segs),
        c = ringStart(r + 1) + s,
        d = ringStart(r + 1) + ((s + 1) % segs);
      index.push(a, c, d, a, d, b);
    }
  const g = new PlaneGeometry(1, 1);
  g.setIndex(index);
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(positions.length), 3));
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  g.computeBoundingSphere();
  return g;
}

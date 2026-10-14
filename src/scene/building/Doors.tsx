// Door leaves as InstancedMesh per style per floor. Leaf geometry is a unit
// leaf (x 0..1 from the hinge, y 0..1, 4 cm thick) scaled per instance, with
// the pivot on the hinge edge so leaves can later swing open/closed.
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Matrix4, Object3D, type BufferGeometry, type InstancedMesh, type Material } from "three";
import { QuadBuilder, type RGB } from "./geometry/QuadBuilder";
import type { LeafInstance, LeafStyle } from "./geometry/walls";
import type { MaterialLibrary } from "../materials/library";

const W: RGB = [1, 1, 1];
const GROOVE: RGB = [0.82, 0.82, 0.82];
const T = 0.02;

function panelLeaf(): BufferGeometry {
  const b = new QuadBuilder();
  b.box([0, 0, -T], [1, 1, T], W);
  for (const [x0, x1] of [
    [0.14, 0.47],
    [0.53, 0.86],
  ])
    for (const [y0, y1] of [
      [0.08, 0.42],
      [0.5, 0.92],
    ]) {
      b.box([x0, y0, T], [x1, y1, T + 0.004], GROOVE);
      b.box([x0 + 0.04, y0 + 0.02, T + 0.004], [x1 - 0.04, y1 - 0.02, T + 0.008], W);
      b.box([x0, y0, -T - 0.004], [x1, y1, -T], GROOVE);
      b.box([x0 + 0.04, y0 + 0.02, -T - 0.008], [x1 - 0.04, y1 - 0.02, -T - 0.004], W);
    }
  return b.build();
}
function flushLeaf(): BufferGeometry {
  const b = new QuadBuilder();
  b.box([0, 0, -T], [1, 1, T], W);
  return b.build();
}
function glazedFrame(divided: boolean): BufferGeometry {
  const b = new QuadBuilder();
  b.box([0, 0, -T], [0.14, 1, T], W);
  b.box([0.86, 0, -T], [1, 1, T], W);
  b.box([0.14, 0, -T], [0.86, 0.3, T], W);
  b.box([0.14, 0.93, -T], [0.86, 1, T], W);
  // Kick panel detail.
  b.box([0.2, 0.06, T], [0.8, 0.24, T + 0.004], GROOVE);
  b.box([0.2, 0.06, -T - 0.004], [0.8, 0.24, -T], GROOVE);
  if (divided) {
    b.box([0.485, 0.3, -0.012], [0.515, 0.93, 0.012], W);
    for (const y of [0.505, 0.715]) b.box([0.14, y - 0.012, -0.012], [0.86, y + 0.012, 0.012], W);
  }
  return b.build();
}
function glassPane(): BufferGeometry {
  const b = new QuadBuilder();
  b.quad([0.14, 0.3, 0], [0.86, 0.3, 0], [0.86, 0.93, 0], [0.14, 0.93, 0]);
  return b.build();
}
function lever(): BufferGeometry {
  const b = new QuadBuilder();
  const c: RGB = [1, 1, 1];
  for (const s of [-1, 1]) {
    const z0 = s * T,
      z1 = s * (T + 0.008);
    b.box([-0.025, -0.06, Math.min(z0, z1)], [0.025, 0.06, Math.max(z0, z1)], c);
    const zz0 = s * (T + 0.008),
      zz1 = s * (T + 0.05);
    b.box([-0.012, -0.012, Math.min(zz0, zz1)], [0.012, 0.012, Math.max(zz0, zz1)], c);
    b.box([-0.12, -0.011, Math.min(s * (T + 0.038), s * (T + 0.058))], [0.012, 0.011, Math.max(s * (T + 0.038), s * (T + 0.058))], c);
  }
  return b.build();
}

type Geoms = Record<"panel" | "flush" | "glazed" | "divided" | "glass" | "lever", BufferGeometry>;
let shared: Geoms | null = null;
/** Shared unit geometries (module lifetime, never disposed). */
function geoms(): Geoms {
  if (!shared)
    shared = {
      panel: panelLeaf(),
      flush: flushLeaf(),
      glazed: glazedFrame(false),
      divided: glazedFrame(true),
      glass: glassPane(),
      lever: lever(),
    };
  return shared;
}

const tmp = new Object3D();
const color = new Color();

function Instances({
  geometry,
  material,
  items,
  matrix,
  tint,
}: {
  geometry: BufferGeometry;
  material: Material;
  items: LeafInstance[];
  matrix: (leaf: LeafInstance, out: Matrix4) => void;
  tint: (leaf: LeafInstance) => string | null;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    items.forEach((leaf, i) => {
      matrix(leaf, m);
      mesh.setMatrixAt(i, m);
      const c = tint(leaf);
      if (c) mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, matrix, tint]);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
      dispose={null}
    />
  );
}

const leafMatrix = (leaf: LeafInstance, out: Matrix4) => {
  tmp.position.set(leaf.pivot[0], leaf.pivot[1], leaf.pivot[2]);
  tmp.rotation.set(0, leaf.yaw, 0);
  tmp.scale.set(leaf.width, leaf.height, 1);
  tmp.updateMatrix();
  out.copy(tmp.matrix);
};
const handleMatrix = (leaf: LeafInstance, out: Matrix4) => {
  tmp.position.set(leaf.pivot[0], leaf.pivot[1], leaf.pivot[2]);
  tmp.rotation.set(0, leaf.yaw, 0);
  tmp.scale.set(1, 1, 1);
  tmp.updateMatrix();
  const local = new Matrix4().makeTranslation(leaf.width - 0.08, Math.min(1.02, leaf.height * 0.48), 0);
  out.copy(tmp.matrix).multiply(local);
};
const leafTint = (leaf: LeafInstance) => leaf.color;
const noTint = () => null;

export function Doors({ leaves, library }: { leaves: LeafInstance[]; library: MaterialLibrary }) {
  const g = geoms();
  const groups = useMemo(() => {
    const by: Record<LeafStyle, LeafInstance[]> = { panel: [], flush: [], glazed: [], divided: [] };
    for (const l of leaves) by[l.style].push(l);
    return {
      ...by,
      glass: leaves.filter((l) => l.style === "glazed" || l.style === "divided"),
      handles: leaves.filter((l) => l.handle),
    };
  }, [leaves]);
  const leafMat = library.doorLeaf();
  return (
    <group name="doors">
      <Instances geometry={g.panel} material={leafMat} items={groups.panel} matrix={leafMatrix} tint={leafTint} />
      <Instances geometry={g.flush} material={leafMat} items={groups.flush} matrix={leafMatrix} tint={leafTint} />
      <Instances geometry={g.glazed} material={leafMat} items={groups.glazed} matrix={leafMatrix} tint={leafTint} />
      <Instances geometry={g.divided} material={leafMat} items={groups.divided} matrix={leafMatrix} tint={leafTint} />
      <Instances geometry={g.glass} material={library.glass()} items={groups.glass} matrix={leafMatrix} tint={noTint} />
      <Instances geometry={g.lever} material={library.handle()} items={groups.handles} matrix={handleMatrix} tint={noTint} />
    </group>
  );
}

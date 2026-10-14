// Transient gesture preview: a translucent slab + ribbon in the status colour
// at the right floor height, alignment guides as thin bright lines, and red
// outlines on blockers. The text badge is a DOM overlay (see overlay/).
import { useEffect, useMemo } from "react";
import { MeshBasicMaterial } from "three";
import type { GhostPreview } from "../../editor/types";
import type { Project } from "../../domain/types";
import { FLOOR_SURFACE, GROUND_TOP, floorBase } from "../coords";
import { QuadBuilder } from "./geometry/QuadBuilder";
import { UI_COLORS } from "../materials/palette";
import { Outline, targetRect, useRibbonWidth } from "./SelectionOverlay";

export const GHOST_COLORS = { valid: UI_COLORS.valid, snap: UI_COLORS.snap, blocked: UI_COLORS.blocked } as const;

/** World-ish (plot-local) y of the ghost's floor surface. */
export function ghostY(project: Project, ghost: GhostPreview) {
  const floor = ghost.floorId ? project.floors.find((f) => f.id === ghost.floorId) : null;
  return floor ? floorBase(floor) + FLOOR_SURFACE : GROUND_TOP;
}

export function Ghost({ project, ghost, offset }: { project: Project; ghost: GhostPreview; offset: [number, number, number] }) {
  const y = ghostY(project, ghost);
  const color = GHOST_COLORS[ghost.status];
  const r = ghost.bounds;
  const rect = useMemo(
    () => ({ x0: r.x / 100, z0: r.z / 100, x1: (r.x + r.w) / 100, z1: (r.z + r.d) / 100 }),
    [r.x, r.z, r.w, r.d],
  );
  const width = useRibbonWidth([(rect.x0 + rect.x1) / 2 + offset[0], y, (rect.z0 + rect.z1) / 2 + offset[2]]);
  const slab = useMemo(() => {
    const b = new QuadBuilder();
    b.box([rect.x0, 0, rect.z0], [rect.x1, 0.12, rect.z1]);
    return b.build();
  }, [rect]);
  const guides = useMemo(() => {
    const b = new QuadBuilder();
    const w = Math.max(0.02, width * 0.35);
    for (const g of ghost.guides) {
      const v = g.value / 100,
        a = Math.min(g.from, g.to) / 100,
        c = Math.max(g.from, g.to) / 100;
      if (g.axis === "x") b.box([a, 0.14, v - w / 2], [c, 0.15, v + w / 2]);
      else b.box([v - w / 2, 0.14, a], [v + w / 2, 0.15, c]);
    }
    return b.build();
  }, [ghost.guides, width]);
  useEffect(() => () => slab.dispose(), [slab]);
  useEffect(() => () => guides.dispose(), [guides]);
  const slabMat = useMemo(
    // Drawn over the walls so the drop spot is never hidden while dragging.
    () => new MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, depthTest: false, toneMapped: false }),
    [color],
  );
  const guideMat = useMemo(() => new MeshBasicMaterial({ color: "#7fe3ff", toneMapped: false }), []);
  useEffect(() => () => slabMat.dispose(), [slabMat]);
  useEffect(() => () => guideMat.dispose(), [guideMat]);
  const blockers = ghost.blockers
    .map((id) => targetRect(project, "any", id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <group name="ghost">
      <group position={[0, y, 0]}>
        <mesh geometry={slab} material={slabMat} renderOrder={7} raycast={() => null} />
        {ghost.guides.length > 0 && <mesh geometry={guides} material={guideMat} renderOrder={8} raycast={() => null} />}
      </group>
      <Outline rect={rect} y={y + 0.12} color={color} tintOpacity={0} fence={ghost.status !== "valid"} width={width} />
      {blockers.map((b, i) => (
        <Outline key={i} rect={b.rect} y={floorBase(b.floor) + FLOOR_SURFACE + 0.016} color={UI_COLORS.blocked} tintOpacity={0.18} fence width={width} />
      ))}
    </group>
  );
}

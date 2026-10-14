// Roof of the top floor (effectiveRoof: flat around courtyards). Lifts off /
// drops on with a 1.5 m rise + fade when toggled; owns cloned materials so the
// fade never affects walls.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Material, MeshStandardMaterial } from "three";
import { floorForGeometry } from "../../domain/core";
import { effectiveRoof } from "../../domain/materials";
import type { Project } from "../../domain/types";
import { easeInOutCubic, floorBase } from "../coords";
import type { MaterialLibrary } from "../materials/library";
import { useSceneStore } from "../store";
import { Buckets } from "./geometry/QuadBuilder";
import { emitFlatRoof, emitPitchedRoof } from "./geometry/roof";
import { useBuckets } from "./useBuckets";
import { projectStyle } from "./useStableFloors";

type Props = {
  project: Project;
  floorId: string | null;
  visible: boolean;
  library: MaterialLibrary;
  reducedMotion: boolean;
};

export function Roof({ project, floorId, visible, library, reducedMotion }: Props) {
  const store = useSceneStore();
  const [progress, setProgress] = useState(visible ? 1 : 0);
  const shown = useRef(visible);
  const group = useRef<Group>(null);
  useEffect(() => {
    if (shown.current === visible) return;
    shown.current = visible;
    const from = progress;
    const to = visible ? 1 : 0;
    return store.tween(reducedMotion ? 0 : 0.42, (t) => setProgress(from + (to - from) * easeInOutCubic(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reducedMotion, store]);

  const floor = floorId ? project.floors.find((f) => f.id === floorId) : undefined;
  const roof = effectiveRoof(project);
  const style = projectStyle(project);
  const key = floor ? JSON.stringify([floor.footprint, floor.elevation, floor.height, roof, style, project.plot.road, project.verticalSpaces.filter((v) => v.floorIds.includes(floor.id))]) : "";
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"roof" | "trim" | "facade">();
    if (!floor) return { buckets };
    const top = floorBase(floor) + floor.height / 100;
    const out = { roof: buckets.get("roof"), trim: buckets.get("trim"), facade: buckets.get("facade") };
    if (roof.style === "flat") emitFlatRoof(floorForGeometry(project, floor.id), top, style.stone, out);
    else emitPitchedRoof(floor.footprint, roof.style, roof.pitch, top, project.plot.road, style.trim, out);
    return { buckets };
  }, [key]);

  const materials = useMemo(() => {
    const clone = (m: MeshStandardMaterial) => {
      const c = m.clone();
      c.onBeforeCompile = m.onBeforeCompile;
      c.customProgramCacheKey = m.customProgramCacheKey;
      c.clippingPlanes = null;
      return c;
    };
    return {
      roof: clone(library.roof(roof.material)),
      trim: clone(library.joinery()),
      facade: clone(library.facade(style.exterior)),
    } as Record<"roof" | "trim" | "facade", MeshStandardMaterial>;
  }, [library, roof.material, style.exterior]);
  useEffect(() => () => Object.values(materials).forEach((m: Material) => m.dispose()), [materials]);

  const fading = progress < 0.999;
  for (const m of Object.values(materials)) {
    if (m.transparent !== fading) {
      m.transparent = fading;
      m.depthWrite = !fading;
      m.needsUpdate = true;
    }
    m.opacity = Math.max(0, Math.min(1, progress));
  }
  if (!floor || progress <= 0.001) return null;
  return (
    <group ref={group} name="roof" position={[0, (1 - progress) * 1.5, 0]}>
      {built.map((b) => (
        <mesh
          key={b.key}
          geometry={b.geometry}
          material={materials[b.key]}
          castShadow={!fading}
          receiveShadow
          dispose={null}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </group>
  );
}

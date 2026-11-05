// The ceilings over the floor being walked (or photographed from inside): each
// room's own finish, false ceilings with their cove glow and downlights.
// Dollhouse views never see a ceiling, so this costs Home, Room and Build nothing.
import { useMemo } from "react";
import { AdditiveBlending, Color, MeshBasicMaterial, MeshStandardMaterial, type Material } from "three";
import { CEILING_FINISHES } from "../../domain/materials";
import type { Project } from "../../domain/types";
import { patchMaterial } from "../materials/patches";
import { generateTextures } from "../materials/textures";
import { buildCeilings, type CeilingBucket } from "./geometry/ceiling";
import { useBuckets } from "./useBuckets";

let materials: Record<CeilingBucket, Material> | null = null;
function ceilingMaterials(): Record<CeilingBucket, Material> {
  if (materials) return materials;
  const plaster = generateTextures("paint", "#ffffff", [2, 2], 256, 4);
  const teak = generateTextures("planks", CEILING_FINISHES["teak-panel"].color, [3.6, 1.44], 256, 4);
  const concrete = generateTextures("boardConcrete", CEILING_FINISHES["board-concrete"].color, [2.4, 1.2], 256, 4);
  const standard = (t: typeof plaster, roughness: number) =>
    patchMaterial(new MeshStandardMaterial({ map: t.map, vertexColors: true, roughness, metalness: 0 }), { room: true });
  materials = {
    plaster: standard(plaster, 0.95),
    teak: standard(teak, 0.7),
    concrete: standard(concrete, 0.9),
    glow: new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, color: new Color(0, 0, 0) }),
  };
  return materials;
}

type Props = {
  project: Project;
  floorId: string;
  /** 0 by day → 1 at night: how brightly the cove and downlights shine. */
  glow: number;
};

/** How much of the LED shows: off by day, coming on as the lamps do. */
export const coveLevel = (glow: number) => Math.max(0, Math.min(1, (glow - 0.04) / 0.36));

export function Ceilings({ project, floorId, glow }: Props) {
  const { built } = useBuckets(() => ({ buckets: buildCeilings(project, floorId) }), [project, floorId]);
  const mats = ceilingMaterials();
  const level = coveLevel(glow);
  // Off, the downlights' lenses still read as fittings; on, the whole cove glows.
  (mats.glow as MeshBasicMaterial).color.setScalar(0.12 + level * 1.15);
  const meshes = useMemo(() => built, [built]);
  return (
    <group name="ceilings">
      {meshes.map((b) => (
        <mesh
          key={b.key}
          name={`ceiling:${b.key}`}
          geometry={b.geometry}
          material={mats[b.key]}
          renderOrder={b.key === "glow" ? 3 : 0}
          receiveShadow={b.key !== "glow"}
          raycast={() => null}
          dispose={null}
        />
      ))}
    </group>
  );
}

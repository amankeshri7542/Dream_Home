// One floor: static bucketed geometry (memoised on the stable FloorModel),
// instanced door leaves and picking via owner tables.
import { memo, useEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { Material, Mesh } from "three";
import type { FloorMaterialId } from "../../domain/materials";
import type { MaterialLibrary } from "../materials/library";
import { riseDepthMaterial } from "../materials/patches";
import { buildFloor } from "./buildFloor";
import { Doors } from "./Doors";
import { parseOwner } from "./geometry/floors";
import { useBuckets } from "./useBuckets";
import type { FloorModel } from "./useStableFloors";

export type PickKind = "room" | "balcony" | "vertical" | "opening";
export type Interaction = {
  /** Called with a parsed owner; returns true if the event was consumed. */
  pick: (floorId: string, owner: { kind: PickKind; id: string }, e: ThreeEvent<MouseEvent>) => boolean;
  hover: (floorId: string, owner: { kind: PickKind; id: string } | null, e: ThreeEvent<PointerEvent>) => void;
  pickable: (kind: PickKind) => boolean;
  /** Register wall meshes used for label occlusion. */
  registerOccluders: (floorId: string, meshes: Mesh[]) => void;
};

const SHADOW_CASTERS = new Set(["facade", "paint", "joinery", "slab", "stone"]);
const RISE = new Set(["facade", "paint", "joinery", "slab", "stone"]);

function materialFor(key: string, model: FloorModel, lib: MaterialLibrary): Material {
  if (key.startsWith("floor:")) return lib.floor(key.slice(6) as FloorMaterialId);
  switch (key) {
    case "facade":
      return lib.facade(model.style.exterior);
    case "paint":
      return lib.paint();
    case "glass":
      return lib.glass();
    case "slab":
      return lib.slab();
    case "stone":
      return lib.stone();
    case "ao":
      return lib.ao();
    case "hit":
    case "openingHit":
      return lib.hit();
    case "lamp":
      return lib.lamp();
    default:
      return lib.joinery();
  }
}

type Props = { model: FloorModel; library: MaterialLibrary; interaction: Interaction; openingsPickable: boolean };

export const FloorView = memo(function FloorView({ model, library, interaction, openingsPickable }: Props) {
  const { built, extra } = useBuckets(() => {
    const r = buildFloor(model);
    return { buckets: r.buckets, extra: r.leaves };
  }, [model]);
  const meshes = useRef(new Map<string, Mesh>());
  const floorId = model.floor.id;
  useEffect(() => {
    const occluders = ["facade", "paint"].map((k) => meshes.current.get(k)).filter((m): m is Mesh => !!m);
    interaction.registerOccluders(floorId, occluders);
    return () => interaction.registerOccluders(floorId, []);
  }, [built, floorId, interaction]);
  return (
    <group name={`floor-${floorId}`}>
      {built.map((b) => {
        if (b.key === "openingHit" && !openingsPickable) return null;
        const pickBucket = b.key.startsWith("floor:") || b.key === "hit" || b.key === "openingHit";
        const ownerOf = (face: number | null | undefined) => {
          if (face == null) return null;
          const parsed = parseOwner(b.ownerAt(face));
          return parsed && interaction.pickable(parsed.kind) ? parsed : null;
        };
        return (
          <mesh
            key={b.key}
            ref={(m) => {
              if (m) meshes.current.set(b.key, m);
              else meshes.current.delete(b.key);
            }}
            geometry={b.geometry}
            material={materialFor(b.key, model, library)}
            castShadow={SHADOW_CASTERS.has(b.key)}
            receiveShadow={b.key !== "glass" && b.key !== "ao" && b.key !== "hit"}
            customDepthMaterial={RISE.has(b.key) ? riseDepthMaterial() : undefined}
            renderOrder={b.key === "ao" ? 1 : b.key === "glass" ? 2 : 0}
            dispose={null}
            onClick={
              pickBucket
                ? (e) => {
                    const owner = ownerOf(e.faceIndex);
                    if (owner && interaction.pick(floorId, owner, e)) e.stopPropagation();
                  }
                : b.key === "facade" || b.key === "paint"
                  ? (e) => e.stopPropagation()
                  : undefined
            }
            onPointerMove={
              pickBucket
                ? (e) => {
                    const owner = ownerOf(e.faceIndex);
                    if (owner) {
                      e.stopPropagation();
                      interaction.hover(floorId, owner, e);
                    }
                  }
                : undefined
            }
            onPointerOut={pickBucket ? (e) => interaction.hover(floorId, null, e) : undefined}
          />
        );
      })}
      {extra && extra.length > 0 && <Doors leaves={extra} library={library} />}
    </group>
  );
});

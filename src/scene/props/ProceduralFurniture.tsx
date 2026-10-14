// Procedural furniture from the domain's roomDetails descriptors, merged into
// three finish groups (soft / matte / gloss) per floor with an owners table so
// clicking furniture selects its room. Soft pieces get chamfered edges.
import { memo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { DETAIL_MATERIALS, roomDetails } from "../../domain/roomDetails";
import type { GeometryFloor, Wall } from "../../domain/types";
import { FLOOR_SURFACE } from "../coords";
import { Buckets, rgb } from "../building/geometry/QuadBuilder";
import { useBuckets } from "../building/useBuckets";
import type { MaterialLibrary } from "../materials/library";
import { FURNITURE_GROUP } from "../materials/palette";
import { popDepthMaterial } from "../materials/patches";

type Props = {
  floor: GeometryFloor;
  walls: Wall[];
  base: number;
  library: MaterialLibrary;
  onPick?: (roomId: string, itemId: string | null, event: ThreeEvent<MouseEvent>) => void;
  onHover?: (roomId: string | null, event: ThreeEvent<PointerEvent>) => void;
  /** Only emit parts owned by these furniture items (GLB fallback per item). */
  onlyOwners?: Set<string>;
};

export const ProceduralFurniture = memo(function ProceduralFurniture({ floor, walls, base, library, onPick, onHover, onlyOwners }: Props) {
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"soft" | "matte" | "gloss">();
    const y0 = base + FLOOR_SURFACE;
    for (const room of floor.rooms) {
      for (const part of roomDetails(room, walls)) {
        if (onlyOwners && !(part.ownerId && onlyOwners.has(part.ownerId))) continue;
        const group = FURNITURE_GROUP[part.material] ?? "matte";
        const b = buckets.get(group);
        b.setOwner(`${room.id}|${part.ownerId ?? ""}`);
        const look = DETAIL_MATERIALS[part.material];
        const c = rgb(part.color ?? look.color);
        const r = part.bounds;
        const x0 = r.x / 100,
          x1 = (r.x + r.w) / 100,
          z0 = r.z / 100,
          z1 = (r.z + r.d) / 100;
        const ya = y0 + part.y / 100,
          yb = y0 + (part.y + part.height) / 100;
        if (part.shape === "ellipse") b.cylinder((x0 + x1) / 2, (z0 + z1) / 2, ya, yb, (x1 - x0) / 2, (z1 - z0) / 2, c, 14);
        else if (part.soft) b.softBox([x0, ya, z0], [x1, yb, z1], c, 0.035);
        else b.softBox([x0, ya, z0], [x1, yb, z1], c, 0.008);
      }
    }
    return { buckets };
  }, [floor.rooms, walls, base, onlyOwners]);
  return (
    <group name="furniture">
      {built.map((b) => (
        <mesh
          key={b.key}
          geometry={b.geometry}
          material={library.furniture(b.key)}
          customDepthMaterial={popDepthMaterial()}
          castShadow
          receiveShadow
          dispose={null}
          onClick={
            onPick
              ? (e) => {
                  const owner = e.faceIndex != null ? b.ownerAt(e.faceIndex) : null;
                  if (!owner) return;
                  const [roomId, itemId] = owner.split("|");
                  onPick(roomId, itemId || null, e);
                }
              : undefined
          }
          onPointerMove={
            onHover
              ? (e) => {
                  const owner = e.faceIndex != null ? b.ownerAt(e.faceIndex) : null;
                  onHover(owner ? owner.split("|")[0] : null, e);
                }
              : undefined
          }
        />
      ))}
    </group>
  );
});

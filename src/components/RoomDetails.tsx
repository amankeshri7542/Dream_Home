import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  DETAIL_MATERIALS,
  roomDetails,
  type DetailMaterial,
} from "../domain/roomDetails";
import type { Room, Wall } from "../domain/types";
import { solidMaterial } from "./sceneMaterials";

const DETAIL_BOX = new BoxGeometry(1, 1, 1);
const DETAIL_ROUND = new CylinderGeometry(0.5, 0.5, 1, 16);

/** Floor-wide material batches keep a furnished building inexpensive to orbit. */
export function RoomDetails({
  rooms,
  walls,
  base,
  onSelect,
}: {
  rooms: readonly Room[];
  walls: readonly Wall[];
  base: number;
  onSelect: (id: string) => void;
}) {
  const batches = useMemo(() => {
    const groups = new Map<
      DetailMaterial,
      {
        geometries: BufferGeometry[];
        owners: { roomId: string; endFace: number }[];
        faces: number;
      }
    >();
    for (const room of rooms)
      for (const part of roomDetails(room, walls)) {
        const group = groups.get(part.material) ?? {
          geometries: [],
          owners: [],
          faces: 0,
        };
        if (!groups.has(part.material)) groups.set(part.material, group);
        const r = part.bounds;
        const geometry = (
          part.shape === "ellipse" ? DETAIL_ROUND : DETAIL_BOX
        ).clone();
        geometry.scale(r.w / 100, part.height / 100, r.d / 100);
        geometry.translate(
          (r.x + r.w / 2) / 100,
          base + 0.035 + (part.y + part.height / 2) / 100,
          (r.z + r.d / 2) / 100,
        );
        group.faces += geometry.index!.count / 3;
        group.owners.push({ roomId: room.id, endFace: group.faces });
        group.geometries.push(geometry);
      }
    return [...groups].map(([key, group]) => {
      const geometry = mergeGeometries(group.geometries)!;
      group.geometries.forEach((part) => part.dispose());
      return { key, geometry, owners: group.owners };
    });
  }, [rooms, walls, base]);
  useEffect(
    () => () => batches.forEach((batch) => batch.geometry.dispose()),
    [batches],
  );
  return (
    <group name="room-furnishings">
      {batches.map((batch) => {
        const palette = DETAIL_MATERIALS[batch.key];
        return (
          <mesh
            key={batch.key}
            geometry={batch.geometry}
            material={solidMaterial(palette.color, palette.roughness)}
            dispose={null}
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              if (event.faceIndex === undefined) return;
              const owner = batch.owners.find(
                (item) => item.endFace > event.faceIndex!,
              );
              if (owner) onSelect(owner.roomId);
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          />
        );
      })}
    </group>
  );
}

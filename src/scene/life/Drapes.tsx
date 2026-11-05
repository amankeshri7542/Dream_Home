// Draws a floor's curtains while you're standing in the home.
import { useEffect, useMemo } from "react";
import { DoubleSide, MeshStandardMaterial } from "three";
import { floorForGeometry } from "../../domain/core";
import type { Project } from "../../domain/types";
import { patchMaterial } from "../materials/patches";
import { lightRooms } from "../roomlight/input";
import { drapeGeometry, drapePanels } from "./drapePanels";

let cloth: MeshStandardMaterial | null = null;
function clothMaterial() {
  if (!cloth)
    cloth = patchMaterial(new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: DoubleSide }), {
      clip: true,
      room: true,
      surface: "cloth",
    });
  return cloth;
}

export function Drapes({ project, floorId }: { project: Project; floorId: string }) {
  const geometry = useMemo(() => {
    const { rooms } = lightRooms(project, floorId, false);
    const { panels, rods } = drapePanels(project, rooms, floorForGeometry(project, floorId).rooms);
    return drapeGeometry(panels, rods);
  }, [project, floorId]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh name="drapes" geometry={geometry} material={clothMaterial()} castShadow receiveShadow raycast={() => null} />;
}

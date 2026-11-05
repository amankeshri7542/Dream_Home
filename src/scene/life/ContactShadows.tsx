// Soft shadows where furniture and rugs meet the floor: what makes a piece
// sit in a room rather than float on it, even on tiers without screen-space
// AO. One merged mesh of soft-edged quads; Explore, Walk and photos only.
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, MeshBasicMaterial } from "three";
import { floorForGeometry } from "../../domain/core";
import { furnitureCatalogItem, furnitureFootprint, resolveFurniture } from "../../domain/furniture";
import type { Project } from "../../domain/types";
import { deriveWalls } from "../../domain/walls";
import { FLOOR_SURFACE, floorBase } from "../coords";

export type ShadowQuad = { x0: number; z0: number; x1: number; z1: number; strength: number };

/** Where the soft shadows go (plot metres), for a floor's furniture and rugs. */
export function contactShadows(project: Project, floorId: string): ShadowQuad[] {
  const floor = floorForGeometry(project, floorId);
  const walls = deriveWalls(floor, project.plot.road);
  const out: ShadowQuad[] = [];
  for (const room of floor.rooms)
    for (const item of resolveFurniture(room, walls)) {
      const entry = furnitureCatalogItem(item.catalogId);
      if (!entry) continue;
      const rug = /^rug|mat$/.test(item.catalogId);
      const standing = entry.layer === "standard" && entry.blocksWalk;
      if (!rug && !standing) continue;
      const fp = furnitureFootprint(item);
      if (fp.w * fp.d < 900) continue;
      // The shadow spreads a little past the piece: more for big low pieces, a hint for rugs.
      const spread = rug ? 0.03 : 0.07;
      const x0 = (room.bounds.x + fp.x) / 100,
        z0 = (room.bounds.z + fp.z) / 100;
      out.push({ x0: x0 - spread, z0: z0 - spread, x1: x0 + fp.w / 100 + spread, z1: z0 + fp.d / 100 + spread, strength: rug ? 0.35 : 1 });
    }
  return out;
}

let material: MeshBasicMaterial | null = null;
function shadowMaterial() {
  if (material) return material;
  // A soft-cornered box: dark in the middle, fading over the outer quarter.
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = Math.min(x + 0.5, size - x - 0.5) / (size / 2),
        v = Math.min(y + 0.5, size - y - 0.5) / (size / 2);
      const e = Math.min(1, Math.min(u, v) / 0.45);
      const a = e * e * (3 - 2 * e);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  material = new MeshBasicMaterial({
    color: "#2b2118",
    transparent: true,
    opacity: 0.3,
    alphaMap: new CanvasTexture(canvas),
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return material;
}

export function ContactShadows({ project, floorId }: { project: Project; floorId: string }) {
  const geometry = useMemo(() => {
    const floor = project.floors.find((f) => f.id === floorId);
    if (!floor) return null;
    const quads = contactShadows(project, floorId);
    if (!quads.length) return null;
    const y = floorBase(floor) + FLOOR_SURFACE + 0.0015;
    const P: number[] = [],
      U: number[] = [],
      C: number[] = [],
      I: number[] = [];
    quads.forEach((q, i) => {
      P.push(q.x0, y, q.z0, q.x1, y, q.z0, q.x1, y, q.z1, q.x0, y, q.z1);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      // Strength rides in the vertex alpha, which the alpha map multiplies.
      for (let k = 0; k < 4; k++) C.push(1, 1, 1, q.strength);
      const b = i * 4;
      I.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(U), 2));
    g.setAttribute("color", new BufferAttribute(new Float32Array(C), 4));
    g.setIndex(I);
    g.computeBoundingSphere();
    return g;
  }, [project, floorId]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh name="contact-shadows" geometry={geometry} material={shadowMaterial()} renderOrder={1} raycast={() => null} />;
}

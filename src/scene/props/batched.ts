// BatchedMesh per material slot: every placed model contributes its slot
// parts as instances, so a furnished floor costs one draw call per slot.
import { BatchedMesh, Color, Matrix4, type BufferGeometry, type Material } from "three";
import type { Kit } from "./kit";

export type Placement = {
  model: string;
  matrix: Matrix4;
  /** Per-slot tint colours (multiplied with the slot material). */
  tints?: Record<string, Color | undefined>;
  /** Owner key reported on picking. */
  owner: string;
};

export type Batch = {
  slot: string;
  mesh: BatchedMesh;
  /** instanceId → owner key */
  owners: string[];
  /** instanceId → model id (idle motion finds fans and curtains by it) */
  models: string[];
  /** instanceId → base matrix (for pop animations) */
  base: Matrix4[];
};

const WHITE = new Color(1, 1, 1);

export function buildBatches(kit: Kit, placements: Placement[], materialFor: (slot: string) => Material): Batch[] {
  const bySlot = new Map<string, { placement: Placement; geometry: BufferGeometry; key: string }[]>();
  for (const p of placements) {
    const parts = kit.models.get(p.model);
    if (!parts) continue;
    for (const part of parts) {
      const list = bySlot.get(part.slot) ?? bySlot.set(part.slot, []).get(part.slot)!;
      list.push({ placement: p, geometry: part.geometry, key: p.model });
    }
  }
  const batches: Batch[] = [];
  for (const [slot, entries] of bySlot) {
    const unique = new Map<string, BufferGeometry>();
    for (const e of entries) if (!unique.has(e.key)) unique.set(e.key, e.geometry);
    let vertices = 0,
      indices = 0;
    for (const g of unique.values()) {
      vertices += g.getAttribute("position").count;
      indices += g.getIndex()?.count ?? g.getAttribute("position").count;
    }
    const mesh = new BatchedMesh(entries.length, vertices, indices, materialFor(slot));
    mesh.name = `batch:${kit.name}:${slot}`;
    const ids = new Map<string, number>();
    for (const [key, g] of unique) ids.set(key, mesh.addGeometry(g));
    const owners: string[] = [];
    const models: string[] = [];
    const base: Matrix4[] = [];
    for (const e of entries) {
      const id = mesh.addInstance(ids.get(e.key)!);
      mesh.setMatrixAt(id, e.placement.matrix);
      mesh.setColorAt(id, e.placement.tints?.[slot] ?? kit.tintDefaults.get(slot) ?? WHITE);
      owners[id] = e.placement.owner;
      models[id] = e.placement.model;
      base[id] = e.placement.matrix.clone();
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    batches.push({ slot, mesh, owners, models, base });
  }
  return batches;
}

/**
 * Dispose batches once they are detached from the scene. Deferred so React
 * StrictMode's effect replay (cleanup + re-run with the same memoised meshes,
 * still attached) never disposes meshes that are about to render.
 */
export function disposeBatches(batches: Batch[]) {
  setTimeout(() => {
    for (const b of batches) if (!b.mesh.parent) b.mesh.dispose();
  }, 0);
}

// GLB furniture for the visible interior floor: one BatchedMesh per material
// slot (interior.glb, meshopt). Stretch items scale to their w/d, tile items
// (kitchen counter runs, display shelving) repeat their module models, tintable
// slots take the finish colour from furniture.json. While the kit loads — or if
// it fails — the procedural furniture renders instead; catalog items without a
// model always fall back to their procedural parts.
import { Component, Suspense, use, useEffect, useMemo, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, Matrix4, Vector3, type Material } from "three";
import { finishColor, furnitureCatalogItem, itemSize, resolveFurniture, type FurnitureCatalogItem } from "../../domain/furniture";
import type { FurnitureItem, GeometryFloor, Room, Wall } from "../../domain/types";
import { ASSET_ITEMS } from "../assets/assetManifest";
import { FLOOR_SURFACE } from "../coords";
import type { MaterialLibrary } from "../materials/library";
import { popUniforms } from "../materials/patches";
import { buildBatches, disposeBatches, type Placement } from "./batched";
import { loadKit, type Kit } from "./kit";
import { ProceduralFurniture } from "./ProceduralFurniture";

type Props = {
  floor: GeometryFloor;
  walls: Wall[];
  base: number;
  library: MaterialLibrary;
  onPick?: (roomId: string, itemId: string | null, event: ThreeEvent<MouseEvent>) => void;
  onHover?: (roomId: string | null, event: ThreeEvent<PointerEvent>) => void;
};

class KitBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Dream Home: furniture models unavailable, using procedural furniture", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Furniture(props: Props) {
  const fallback = <ProceduralFurniture {...props} />;
  return (
    <KitBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbFurniture {...props} />
      </Suspense>
    </KitBoundary>
  );
}

const hasModel = (id: string) => ASSET_ITEMS[id]?.kit === "interior";

/** Module sequence for tiled items (local x offsets in cm, centred). */
export function tileModules(entry: FurnitureCatalogItem, width: number): { model: string; x: number; scale: number }[] {
  const tile = entry.tile as Record<string, string | number> | undefined;
  if (!tile) return [];
  const module = String(tile.module);
  const mw = Number(tile.moduleWidth ?? 60);
  let seq: { model: string; w: number }[] = [];
  const sink = tile.sink ? String(tile.sink) : null,
    end = tile.end ? String(tile.end) : null;
  const sw = Number(tile.sinkWidth ?? 80),
    ew = Number(tile.endWidth ?? 60);
  if (sink && end && width >= sw + ew + mw) {
    const n = Math.max(0, Math.round((width - sw - ew) / mw));
    const a = Math.floor(n / 2);
    seq = [
      ...Array.from({ length: a }, () => ({ model: module, w: mw })),
      { model: sink, w: sw },
      ...Array.from({ length: n - a }, () => ({ model: module, w: mw })),
      { model: end, w: ew },
    ];
  } else {
    const n = Math.max(1, Math.round(width / mw));
    seq = Array.from({ length: n }, () => ({ model: module, w: mw }));
  }
  const total = seq.reduce((s, m) => s + m.w, 0);
  const scale = width / total;
  let cursor = -width / 2;
  return seq.map((m) => {
    const x = cursor + (m.w * scale) / 2;
    cursor += m.w * scale;
    return { model: m.model, x, scale };
  });
}

const up = new Vector3(0, 1, 0);

/** Placement matrices for one item (several for tiled items); null → procedural. */
export function itemPlacements(room: Room, item: FurnitureItem, floorY: number): Omit<Placement, "owner" | "tints">[] | null {
  const entry = furnitureCatalogItem(item.catalogId);
  if (!entry) return null;
  const { w, d } = itemSize(item);
  const x = (room.bounds.x + item.x) / 100,
    z = (room.bounds.z + item.z) / 100;
  const y = floorY + (entry.mountY ?? 0) / 100;
  // Back faces north at rotation 0; models face +z (front) → yaw = −rotation.
  const itemMatrix = new Matrix4().makeRotationAxis(up, (-item.rotation * Math.PI) / 180).setPosition(x, y, z);
  if (entry.tile) {
    const mods = tileModules(entry, w);
    if (!mods.length || mods.some((m) => !hasModel(m.model))) return null;
    return mods.map((m) => {
      const b = ASSET_ITEMS[m.model].bounds;
      const local = new Matrix4().makeScale(m.scale, 1, d / b.d).setPosition(m.x / 100, 0, 0);
      return { model: m.model, matrix: itemMatrix.clone().multiply(local) };
    });
  }
  if (!hasModel(item.catalogId)) return null;
  const b = ASSET_ITEMS[item.catalogId].bounds;
  const scale = new Matrix4().makeScale(w / b.w, 1, d / b.d);
  return [{ model: item.catalogId, matrix: itemMatrix.clone().multiply(scale) }];
}

function GlbFurniture({ floor, walls, base, library, onPick, onHover }: Props) {
  const kit: Kit = use(loadKit("interior"));
  const { batches, procedural } = useMemo(() => {
    const placements: Placement[] = [];
    const procedural = new Set<string>();
    const y = base + FLOOR_SURFACE;
    for (const room of floor.rooms)
      for (const item of resolveFurniture(room, walls)) {
        const ps = itemPlacements(room, item, y);
        if (!ps) {
          procedural.add(item.id);
          continue;
        }
        const entry = furnitureCatalogItem(item.catalogId)!;
        const tints: Record<string, Color | undefined> = {};
        const chosen = finishColor(entry, item.finish ?? entry.defaultFinish);
        if (chosen && entry.finishSlot) tints[entry.finishSlot] = new Color(chosen);
        for (const p of ps) placements.push({ ...p, tints, owner: `${room.id}|${item.id}` });
      }
    const materialFor = (slot: string): Material =>
      slot === "glass" ? library.glass() : (kit.materials.get(slot) ?? library.joinery());
    return { batches: buildBatches(kit, placements, materialFor), procedural };
  }, [kit, floor.rooms, walls, base, library]);
  useEffect(() => () => disposeBatches(batches), [batches]);

  // Pop animation: scale instances inside the active pop rect on the CPU.
  const tmp = useMemo(() => ({ m: new Matrix4(), s: new Matrix4(), p: new Vector3() }), []);
  useFrame(() => {
    const active = popUniforms.uPopY.value.w > 0.5;
    const rect = popUniforms.uPop.value;
    const [, scale, drop] = popUniforms.uPopY.value.toArray();
    for (const b of batches) {
      let touched = false;
      for (let i = 0; i < b.base.length; i++) {
        const baseM = b.base[i];
        if (!baseM) continue;
        tmp.p.setFromMatrixPosition(baseM);
        const inside = tmp.p.x >= rect.x && tmp.p.x <= rect.z && tmp.p.z >= rect.y && tmp.p.z <= rect.w;
        if (!inside && !b.mesh.userData.popped) continue;
        if (active && inside) {
          tmp.s.makeScale(scale, scale, scale);
          tmp.m.copy(baseM).multiply(tmp.s);
          tmp.m.elements[13] += drop;
          b.mesh.setMatrixAt(i, tmp.m);
        } else b.mesh.setMatrixAt(i, baseM);
        touched = true;
      }
      b.mesh.userData.popped = active;
      if (touched) b.mesh.computeBoundingSphere();
    }
  });

  return (
    <group name="furniture-glb">
      {batches.map((b) => (
        <primitive
          key={b.mesh.uuid}
          object={b.mesh}
          onClick={
            onPick
              ? (e: ThreeEvent<MouseEvent>) => {
                  const id = (e as unknown as { batchId?: number }).batchId;
                  const owner = id != null ? b.owners[id] : undefined;
                  if (!owner) return;
                  const [roomId, itemId] = owner.split("|");
                  onPick(roomId, itemId || null, e);
                }
              : undefined
          }
          onPointerMove={
            onHover
              ? (e: ThreeEvent<PointerEvent>) => {
                  const id = (e as unknown as { batchId?: number }).batchId;
                  const owner = id != null ? b.owners[id] : undefined;
                  onHover(owner ? owner.split("|")[0] : null, e);
                }
              : undefined
          }
        />
      ))}
      {procedural.size > 0 && (
        <ProceduralFurniture floor={floor} walls={walls} base={base} library={library} onPick={onPick} onHover={onHover} onlyOwners={procedural} />
      )}
    </group>
  );
}

// GLB furniture for the visible interior floor: one BatchedMesh per material
// slot (interior.glb, meshopt). Stretch items scale to their w/d, tile items
// (kitchen counter runs, display shelving, backsplashes) repeat their module
// models, tintable slots take the piece's finish — or, in a home with a Look,
// the room's coordinated palette. Decor rests on the surface below it and
// wall-hung pieces sit flush on the wall face. While the kit loads — or if it
// fails — the procedural furniture renders instead; catalog items without a
// model always fall back to their procedural parts.
import { Component, Suspense, use, useEffect, useMemo, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, Matrix4, Vector3, type Material } from "three";
import {
  finishColor,
  furnitureBaseY,
  furnitureCatalogItem,
  furnitureFootprint,
  itemSize,
  resolveFurniture,
  tileModules,
  type FinishSlot,
} from "../../domain/furniture";
import { autoPalette, paletteFinish, paletteTint, type RoomPalette } from "../../domain/materials";
import type { FurnitureItem, GeometryFloor, Room, Wall } from "../../domain/types";
import { wallThickness } from "../building/geometry/junctions";
import { ASSET_ITEMS } from "../assets/assetManifest";
import { FLOOR_SURFACE } from "../coords";
import type { MaterialLibrary } from "../materials/library";
import { popUniforms } from "../materials/patches";
import { buildBatches, disposeBatches, type Placement } from "./batched";
import { loadKit, type Kit } from "./kit";
import { ProceduralFurniture } from "./ProceduralFurniture";
import { useInterior } from "./interior";

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

export { tileModules };

const up = new Vector3(0, 1, 0);

const TINTABLE: readonly FinishSlot[] = ["fabric", "wood", "accent"];
/** Per-slot tint colours: the piece's finish, else its room palette, else the catalog default. */
export function itemTints(item: FurnitureItem, palette: RoomPalette | null): Record<string, Color | undefined> {
  const entry = furnitureCatalogItem(item.catalogId);
  const tints: Record<string, Color | undefined> = {};
  if (!entry) return tints;
  const chosen = finishColor(entry, item.finish ?? paletteFinish(palette, item.catalogId) ?? entry.defaultFinish);
  if (chosen && entry.finishSlot) tints[entry.finishSlot] = new Color(chosen);
  if (palette)
    for (const slot of TINTABLE) {
      if (slot === entry.finishSlot || !entry.slots.includes(slot)) continue;
      const hex = paletteTint(palette, slot);
      if (hex) tints[slot] = new Color(hex);
    }
  return tints;
}

const BACK: Record<number, "north" | "east" | "south" | "west"> = { 0: "north", 90: "east", 180: "south", 270: "west" };
/**
 * How far (cm) a wall-hung piece moves back so it sits flush on the wall's
 * inside face (room bounds run along wall centrelines); 0 when it isn't near one.
 */
export function wallFlush(room: Room, item: FurnitureItem, walls: readonly Wall[]): number {
  const entry = furnitureCatalogItem(item.catalogId);
  if (!entry?.wallSnap || (entry.layer !== "high" && entry.layer !== "wall")) return 0;
  const fp = furnitureFootprint(item),
    b = room.bounds,
    side = BACK[item.rotation];
  const gap = side === "north" ? fp.z : side === "south" ? b.d - fp.z - fp.d : side === "west" ? fp.x : b.w - fp.x - fp.w;
  const along: [number, number] =
    side === "north" || side === "south" ? [b.x + fp.x, b.x + fp.x + fp.w] : [b.z + fp.z, b.z + fp.z + fp.d];
  const line = side === "north" ? b.z : side === "south" ? b.z + b.d : side === "west" ? b.x : b.x + b.w;
  const axis = side === "north" || side === "south" ? "x" : "z";
  const wall = walls.find((w) => {
    if (w.axis !== axis || (axis === "x" ? w.z : w.x) !== line) return false;
    const s = axis === "x" ? w.x : w.z;
    return s < along[1] && s + w.length > along[0];
  });
  if (!wall) return 0;
  const shift = gap - (wallThickness(wall) * 100) / 2 - 0.3;
  return shift > 0 && shift < 25 ? shift : 0;
}

/** Placement matrices for one item (several for tiled items); null → procedural. */
export function itemPlacements(
  room: Room,
  item: FurnitureItem,
  floorY: number,
  opts: { baseY?: number; flush?: number } = {},
): Omit<Placement, "owner" | "tints">[] | null {
  const entry = furnitureCatalogItem(item.catalogId);
  if (!entry) return null;
  const { w, d } = itemSize(item);
  // Back faces north at rotation 0: moving "back" is −z turned by the rotation.
  const flush = opts.flush ?? 0;
  const yaw = (item.rotation * Math.PI) / 180;
  const x = (room.bounds.x + item.x + Math.sin(yaw) * flush) / 100,
    z = (room.bounds.z + item.z - Math.cos(yaw) * flush) / 100;
  const y = floorY + (opts.baseY ?? entry.mountY ?? 0) / 100;
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
  const style = useInterior().project?.style;
  const { batches, procedural } = useMemo(() => {
    const placements: Placement[] = [];
    const procedural = new Set<string>();
    const y = base + FLOOR_SURFACE;
    for (const room of floor.rooms) {
      const items = resolveFurniture(room, walls);
      const palette = autoPalette({ style }, room);
      for (const item of items) {
        const ps = itemPlacements(room, item, y, {
          baseY: furnitureBaseY(item, items),
          flush: wallFlush(room, item, walls),
        });
        if (!ps) {
          procedural.add(item.id);
          continue;
        }
        const tints = itemTints(item, palette);
        for (const p of ps) placements.push({ ...p, tints, owner: `${room.id}|${item.id}` });
      }
    }
    const materialFor = (slot: string): Material =>
      slot === "glass" ? library.glass() : (kit.materials.get(slot) ?? library.joinery());
    return { batches: buildBatches(kit, placements, materialFor), procedural };
  }, [kit, floor.rooms, walls, base, library, style]);
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

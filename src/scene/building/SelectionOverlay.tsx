// Selection (sun-gold), hover (soft gold tint) and blocked highlights
// (crimson): a thick ribbon outline whose width adapts to camera distance, a
// soft translucent tint and a short glowing fence that pops up on select.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, MeshBasicMaterial, Vector3, type BufferGeometry, type Group } from "three";
import { balconyBounds } from "../../domain/core";
import type { Floor, Project, Rect } from "../../domain/types";
import type { SelectionTarget } from "../../editor/types";
import { FLOOR_SURFACE, easeOutBack, floorBase } from "../coords";
import { QuadBuilder, type V3 } from "./geometry/QuadBuilder";
import { gradientTexture } from "../materials/textures";
import { UI_COLORS } from "../materials/palette";
import { useSceneStore } from "../store";

export type PlanRect = { x0: number; z0: number; x1: number; z1: number };

/** Resolve a selection-like target to its floor + plan rect (metres). */
export function targetRect(project: Project, kind: string, id: string, floorId?: string): { floor: Floor; rect: PlanRect } | null {
  const floors = floorId ? project.floors.filter((f) => f.id === floorId) : project.floors;
  const toRect = (r: Rect, inset: number): PlanRect => ({
    x0: r.x / 100 + inset,
    z0: r.z / 100 + inset,
    x1: (r.x + r.w) / 100 - inset,
    z1: (r.z + r.d) / 100 - inset,
  });
  for (const floor of floors) {
    if (kind === "room" || kind === "any") {
      const room = floor.rooms.find((r) => r.id === id);
      if (room) return { floor, rect: toRect(room.bounds, 0.07) };
    }
    if (kind === "balcony" || kind === "any") {
      const b = floor.balconies.find((x) => x.id === id);
      if (b) return { floor, rect: toRect(balconyBounds(floor, b), 0.04) };
    }
    if (kind === "vertical" || kind === "any") {
      const v = project.verticalSpaces.find((x) => x.id === id && x.floorIds.includes(floor.id));
      if (v) return { floor, rect: toRect(v.bounds, 0.04) };
    }
  }
  return null;
}

const fenceAlpha = gradientTexture("strip");

/** Ribbon outline + tint + fence for one rect. */
export function Outline({
  rect,
  y,
  color,
  tintOpacity,
  fence,
  width,
  pop = 1,
}: {
  rect: PlanRect;
  y: number;
  color: string;
  tintOpacity: number;
  fence: boolean;
  width: number;
  pop?: number;
}) {
  const geoms = useMemo(() => {
    const ribbon = new QuadBuilder();
    const { x0, z0, x1, z1 } = rect;
    const w = Math.min(width, (x1 - x0) / 3, (z1 - z0) / 3);
    const h = 0.05;
    ribbon.box([x0, 0, z0], [x1, h, z0 + w]);
    ribbon.box([x0, 0, z1 - w], [x1, h, z1]);
    ribbon.box([x0, 0, z0 + w], [x0 + w, h, z1 - w]);
    ribbon.box([x1 - w, 0, z0 + w], [x1, h, z1 - w]);
    const tint = new QuadBuilder();
    tint.quadFacing([x0, 0.004, z0], [x1, 0.004, z0], [x1, 0.004, z1], [x0, 0.004, z1], [0, 1, 0]);
    const wall = new QuadBuilder();
    const H = 1;
    const side = (a: V3, b: V3) => {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      wall.quad(a, b, [b[0], H, b[2]], [a[0], H, a[2]], [1, 1, 1], [
        [0, 0],
        [len, 0],
        [len, 1],
        [0, 1],
      ]);
    };
    side([x0, 0, z0], [x1, 0, z0]);
    side([x1, 0, z0], [x1, 0, z1]);
    side([x1, 0, z1], [x0, 0, z1]);
    side([x0, 0, z1], [x0, 0, z0]);
    return { ribbon: ribbon.build(), tint: tint.build(), fence: wall.build() };
  }, [rect, width]);
  useEffect(() => () => Object.values(geoms).forEach((g: BufferGeometry) => g.dispose()), [geoms]);
  const mats = useMemo(
    () => ({
      ribbon: new MeshBasicMaterial({ color, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      tint: new MeshBasicMaterial({ color, transparent: true, opacity: tintOpacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      fence: new MeshBasicMaterial({ color, transparent: true, opacity: 0.95, alphaMap: fenceAlpha, side: DoubleSide, depthWrite: false, toneMapped: false }),
    }),
    [color, tintOpacity],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  mats.tint.opacity = tintOpacity * Math.min(1, pop);
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={geoms.ribbon} material={mats.ribbon} renderOrder={5} raycast={() => null} />
      {tintOpacity > 0 && <mesh geometry={geoms.tint} material={mats.tint} renderOrder={4} raycast={() => null} />}
      {fence && (
        <mesh geometry={geoms.fence} material={mats.fence} scale={[1, 0.62 * Math.max(0.001, pop), 1]} renderOrder={6} raycast={() => null} />
      )}
    </group>
  );
}

/** Ribbon width that stays readable at every zoom (quantised to avoid rebuilds). */
export function useRibbonWidth(center: [number, number, number] | null) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const [width, setWidth] = useState(0.1);
  const v = useRef(new Vector3());
  useFrame(() => {
    if (!center) return;
    const d = v.current.set(...center).distanceTo(camera.position);
    // ~7 CSS px at the current distance.
    const fov = ((camera as { fov?: number }).fov ?? 32) * (Math.PI / 180);
    const worldPerPx = (2 * d * Math.tan(fov / 2)) / Math.max(1, size.height);
    const target = Math.min(0.5, Math.max(0.06, worldPerPx * 7));
    const q = Math.round(target * 50) / 50;
    if (Math.abs(q - width) > 0.019) setWidth(q);
  });
  return width;
}

type Props = {
  project: Project;
  offset: [number, number, number];
  selection: SelectionTarget | null;
  hover: SelectionTarget | null;
  highlight: string[];
  reducedMotion: boolean;
};

const SELECTABLE = new Set(["room", "balcony", "vertical"]);

export function SelectionOverlay({ project, offset, selection, hover, highlight, reducedMotion }: Props) {
  const store = useSceneStore();
  const group = useRef<Group>(null);
  const sel = selection && SELECTABLE.has(selection.kind) ? targetRect(project, selection.kind, selection.id, "floorId" in selection ? selection.floorId : undefined) : null;
  const furnitureRoom =
    selection && selection.kind === "furniture" ? targetRect(project, "room", selection.roomId, selection.floorId) : null;
  const selected = sel ?? furnitureRoom;
  const hov =
    hover && SELECTABLE.has(hover.kind) && !(selection && hover.id === selection.id)
      ? targetRect(project, hover.kind, hover.id, "floorId" in hover ? hover.floorId : undefined)
      : null;
  const blocked = highlight.map((id) => targetRect(project, "any", id)).filter((x): x is NonNullable<typeof x> => !!x);
  const yOf = (f: Floor) => floorBase(f) + FLOOR_SURFACE + 0.012;
  const center: [number, number, number] | null = selected
    ? [(selected.rect.x0 + selected.rect.x1) / 2 + offset[0], yOf(selected.floor), (selected.rect.z0 + selected.rect.z1) / 2 + offset[2]]
    : hov
      ? [(hov.rect.x0 + hov.rect.x1) / 2 + offset[0], yOf(hov.floor), (hov.rect.z0 + hov.rect.z1) / 2 + offset[2]]
      : blocked[0]
        ? [(blocked[0].rect.x0 + blocked[0].rect.x1) / 2 + offset[0], yOf(blocked[0].floor), (blocked[0].rect.z0 + blocked[0].rect.z1) / 2 + offset[2]]
        : null;
  const width = useRibbonWidth(center);
  // Pop-in animation on selection change.
  const [pop, setPop] = useState(1);
  const selKey = selected ? `${selection?.kind}:${selection?.id}` : "";
  useEffect(() => {
    if (!selKey) return;
    return store.tween(reducedMotion ? 0 : 0.32, (t) => setPop(easeOutBack(t, 2.2)));
  }, [selKey, reducedMotion, store]);
  return (
    <group ref={group} name="selection-overlay">
      {hov && (
        <Outline rect={hov.rect} y={yOf(hov.floor)} color={UI_COLORS.hover} tintOpacity={0.16} fence={false} width={width * 0.6} />
      )}
      {selected && (
        <Outline
          key={selKey}
          rect={selected.rect}
          y={yOf(selected.floor)}
          color={UI_COLORS.selection}
          tintOpacity={0.26}
          fence
          width={width}
          pop={pop}
        />
      )}
      {blocked.map((b, i) => (
        <Outline key={i} rect={b.rect} y={yOf(b.floor) + 0.004} color={UI_COLORS.blocked} tintOpacity={0.16} fence width={width} />
      ))}
    </group>
  );
}

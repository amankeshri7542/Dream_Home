// The building: stable per-floor views, roof, furniture on the visible
// interior floor, section-cut animation and picking → SelectionTarget.
import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import type { Project } from "../../domain/types";
import { PICKABLE, type EditorMode, type SelectionTarget } from "../../editor/types";
import type { SceneView } from "../types";
import { FLOOR_SURFACE, easeInOutCubic, floorBase, plotOffset } from "../coords";
import { CUT_OFF, cutHeight, setCutHeight } from "../materials/cutPlane";
import { focusState, setFocus, setFocusMix } from "../materials/focus";
import type { MaterialLibrary } from "../materials/library";
import { useSceneStore } from "../store";
import { FloorView, type Interaction, type PickKind } from "./FloorView";
import { Roof } from "./Roof";
import { useRiseAnimations } from "./riseAnimation";
import { useStableFloors } from "./useStableFloors";
import { Furniture } from "../props/Furniture";

type Props = {
  project: Project;
  view: SceneView;
  mode: EditorMode;
  library: MaterialLibrary;
  aoStrips: boolean;
  reducedMotion: boolean;
  onSelect: (target: SelectionTarget | null) => void;
  onHoverTarget: (target: SelectionTarget | null) => void;
  occluders: React.RefObject<Map<string, Mesh[]>>;
  groupRef?: React.RefObject<Group | null>;
};

export function Building({ project, view, mode, library, aoStrips, reducedMotion, onSelect, onHoverTarget, occluders, groupRef }: Props) {
  const store = useSceneStore();
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const { vis, models } = useStableFloors(project, view, aoStrips);
  useRiseAnimations(project, vis.stage, store, reducedMotion);

  // Latest-value refs keep the Interaction object stable (FloorView memo).
  const latest = useRef({ mode, onSelect, onHoverTarget });
  latest.current = { mode, onSelect, onHoverTarget };
  const hoverKey = useRef<string | null>(null);
  const interaction = useMemo<Interaction>(
    () => ({
      pickable: (kind: PickKind) => PICKABLE[latest.current.mode].includes(kind),
      pick: (floorId, owner, e) => {
        if (e.delta > 6) return false;
        const target = toTarget(floorId, owner);
        if (!target) return false;
        latest.current.onSelect(target);
        return true;
      },
      hover: (floorId, owner, e) => {
        const key = owner ? `${owner.kind}:${owner.id}` : null;
        if (key === hoverKey.current) return;
        hoverKey.current = key;
        gl.domElement.style.cursor = owner ? "pointer" : "";
        latest.current.onHoverTarget(owner ? toTarget(floorId, owner) : null);
        void e;
      },
      registerOccluders: (floorId, meshes) => {
        occluders.current?.set(floorId, meshes);
      },
    }),
    [gl, occluders],
  );

  // Section cut: animate the shared clip plane (instant with reduced motion).
  const targetCut = vis.cutActive ? vis.cutY : CUT_OFF;
  const topWall = vis.top ? floorBase(vis.top) + vis.top.height / 100 + 0.5 : CUT_OFF;
  useEffect(() => {
    const from = cutHeight() >= CUT_OFF ? topWall : cutHeight();
    const to = targetCut >= CUT_OFF ? topWall : targetCut;
    if (reducedMotion || Math.abs(from - to) < 0.001) {
      setCutHeight(targetCut);
      gl.shadowMap.needsUpdate = true;
      invalidate();
      return;
    }
    return store.tween(
      0.45,
      (t) => setCutHeight(from + (to - from) * easeInOutCubic(t)),
      () => setCutHeight(targetCut),
    );
  }, [targetCut, topWall, reducedMotion, store, gl, invalidate]);

  // Dollhouse hero room: neighbours fade and drop to a stub; the room glows.
  const focusKey = useMemo(() => {
    const f = view.focus;
    const floor = f ? project.floors.find((x) => x.id === f.floorId) : undefined;
    const room = floor?.rooms.find((r) => r.id === f!.roomId);
    if (!f || !floor || !room) return null;
    const [ox, , oz] = plotOffset(project);
    const pad = 0.14;
    return JSON.stringify({
      x0: room.bounds.x / 100 + ox - pad,
      z0: room.bounds.z / 100 + oz - pad,
      x1: (room.bounds.x + room.bounds.w) / 100 + ox + pad,
      z1: (room.bounds.z + room.bounds.d) / 100 + oz + pad,
      stubY: floorBase(floor) + FLOOR_SURFACE + 0.3,
      soft: !!f.soft,
    });
  }, [view.focus, project]);
  useEffect(() => {
    const target = focusKey ? (JSON.parse(focusKey) as { x0: number; z0: number; x1: number; z1: number; stubY: number; soft: boolean }) : null;
    const fadeTo = target ? (target.soft ? 0.3 : 1) : 0,
      glowTo = target && !target.soft ? 0.85 : 0;
    const fadeFrom = focusState.active ? focusState.fade : 0;
    if (target) setFocus(target, target.soft ? 1e6 : target.stubY);
    const done = () => {
      setFocusMix(fadeTo, glowTo);
      if (!target) setFocus(null);
      gl.shadowMap.needsUpdate = true;
      invalidate();
    };
    if (reducedMotion || Math.abs(fadeFrom - fadeTo) < 0.001) {
      done();
      return;
    }
    return store.tween(
      0.45,
      (t) => {
        const k = easeInOutCubic(t);
        setFocusMix(fadeFrom + (fadeTo - fadeFrom) * k, glowTo * k);
        gl.shadowMap.needsUpdate = true;
      },
      done,
    );
  }, [focusKey, reducedMotion, store, gl, invalidate]);

  const furnished = models.find((m) => m.floor.id === vis.furnishedFloorId && m.stage >= 4);
  const pickFurniture = useMemo(
    () => (roomId: string, itemId: string | null, e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 6) return;
      const kinds = PICKABLE[latest.current.mode];
      const floorId = furnishedId.current ?? "";
      if (itemId && kinds.includes("furniture")) {
        e.stopPropagation();
        latest.current.onSelect({ kind: "furniture", floorId, roomId, id: itemId });
      } else if (kinds.includes("room")) {
        e.stopPropagation();
        latest.current.onSelect({ kind: "room", floorId, id: roomId });
      }
    },
    [],
  );
  const furnishedId = useRef<string | null>(null);
  furnishedId.current = furnished?.floor.id ?? null;
  const hoverFurniture = useMemo(
    () => (roomId: string | null, e: ThreeEvent<PointerEvent>) => {
      if (!PICKABLE[latest.current.mode].includes("room")) return;
      if (roomId) e.stopPropagation();
      interaction.hover(furnishedId.current ?? "", roomId ? { kind: "room", id: roomId } : null, e);
    },
    [interaction],
  );
  const openingsPickable = PICKABLE[mode].includes("opening");
  return (
    <group ref={groupRef} name="building">
      {models.map((m) => (
        <FloorView key={m.floor.id} model={m} library={library} interaction={interaction} openingsPickable={openingsPickable} />
      ))}
      {furnished && (
        <Furniture
          floor={furnished.floor}
          walls={furnished.allWalls}
          base={furnished.base}
          library={library}
          onPick={pickFurniture}
          onHover={hoverFurniture}
        />
      )}
      <Roof
        project={project}
        floorId={vis.top?.id ?? null}
        visible={vis.roofVisible}
        library={library}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}

function toTarget(floorId: string, owner: { kind: PickKind; id: string }): SelectionTarget | null {
  switch (owner.kind) {
    case "room":
      return { kind: "room", floorId, id: owner.id };
    case "balcony":
      return { kind: "balcony", floorId, id: owner.id };
    case "vertical":
      return { kind: "vertical", floorId, id: owner.id };
    case "opening":
      return { kind: "opening", floorId, id: owner.id };
  }
}

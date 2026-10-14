// DOM overlay (sibling of the Canvas): room labels (`.scene-room-label`,
// clickable → selects the room) and the ghost badge (`.scene-ghost-badge`
// with data-status). Positions are written by OverlayProjector.
import { useLayoutEffect } from "react";
import type { GhostPreview, SelectionTarget } from "../../editor/types";
import type { Project } from "../../domain/types";
import { FLOOR_SURFACE, floorBase, plotToWorld } from "../coords";
import { ghostY } from "../building/Ghost";
import type { OverlayRegistry } from "./registry";

export type LabelItem = {
  id: string;
  floorId: string;
  name: string;
  area: string;
  /** Bigger rooms keep their label when labels collide. */
  priority: number;
  pos: [number, number, number];
};

export function roomLabels(
  project: Project,
  floorId: string | null,
  unit: "m" | "ft" = "m",
  hideId: string | null = null,
): LabelItem[] {
  const floor = floorId ? project.floors.find((f) => f.id === floorId) : undefined;
  if (!floor) return [];
  const y = floorBase(floor) + FLOOR_SURFACE + 0.32;
  return floor.rooms
    .filter((r) => r.id !== hideId)
    .map((r) => {
      const m2 = (r.bounds.w * r.bounds.d) / 10000;
      const area =
        unit === "ft"
          ? `${Math.round(m2 * 10.7639)} sq ft`
          : `${m2 >= 10 ? m2.toFixed(0) : m2.toFixed(1)} m²`;
      return {
        id: r.id,
        floorId: floor.id,
        name: r.name,
        area,
        priority: r.bounds.w * r.bounds.d,
        pos: plotToWorld(project, r.bounds.x + r.bounds.w / 2, r.bounds.z + r.bounds.d / 2, y),
      };
    });
}

type Props = {
  project: Project;
  labels: LabelItem[];
  selection: SelectionTarget | null;
  ghost: GhostPreview | null | undefined;
  registry: OverlayRegistry;
  onSelect: (target: SelectionTarget | null) => void;
  invalidate: () => void;
};

export function SceneOverlay({ project, labels, selection, ghost, registry, onSelect, invalidate }: Props) {
  // Keep registry anchor positions in sync; elements register via refs.
  const ghostPos = ghost
    ? plotToWorld(project, ghost.bounds.x + ghost.bounds.w / 2, ghost.bounds.z + ghost.bounds.d / 2, ghostY(project, ghost) + 0.75)
    : null;
  const selectedLabel =
    selection && (selection.kind === "room" || selection.kind === "furniture")
      ? selection.kind === "room"
        ? selection.id
        : selection.roomId
      : null;
  const key = JSON.stringify([labels.map((l) => [l.id, l.pos, l.priority]), ghostPos, selectedLabel]);
  useLayoutEffect(() => {
    for (const l of labels) {
      const a = registry.anchors.get(`label:${l.id}`);
      if (a) {
        a.pos = l.pos;
        a.floorId = l.floorId;
        a.priority = l.id === selectedLabel ? Number.POSITIVE_INFINITY : l.priority;
      }
    }
    const g = registry.anchors.get("ghost");
    if (g && ghostPos) g.pos = ghostPos;
    registry.version++;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registry, invalidate]);
  const selectedId = selectedLabel;
  return (
    <div className="scene-overlay" aria-hidden={false}>
      {labels.map((l) => (
        <div
          key={l.id}
          ref={(el) => {
            if (el)
              registry.anchors.set(`label:${l.id}`, {
                el,
                pos: l.pos,
                floorId: l.floorId,
                priority: l.id === selectedLabel ? Number.POSITIVE_INFINITY : l.priority,
              });
            else registry.anchors.delete(`label:${l.id}`);
          }}
          className={`scene-room-label${selectedId === l.id ? " selected" : ""}`}
          style={{ visibility: "hidden" }}
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "room", floorId: l.floorId, id: l.id });
          }}
        >
          <span className="scene-room-label-name">{l.name}</span>
          <span className="scene-room-label-area">{l.area}</span>
        </div>
      ))}
      {ghost && ghostPos && (
        <div
          ref={(el) => {
            if (el) registry.anchors.set("ghost", { el, pos: ghostPos, floorId: null });
            else registry.anchors.delete("ghost");
          }}
          className="scene-ghost-badge"
          data-status={ghost.status}
          style={{ visibility: "hidden" }}
        >
          {ghost.label}
        </div>
      )}
    </div>
  );
}

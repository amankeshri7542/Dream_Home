import { useRef } from "react";
import { ArrowUpRight, Check, RotateCcw, Trash2, X } from "lucide-react";
import { Dimension } from "./Controls";
import { RoomDetailsPlan } from "./RoomDetailsPlan";
import {
  removeStagedRoom,
  restoreStagedRoom,
  rotateStagedRoom,
  updateStagedRoom,
} from "../domain/tray";
import { length, unitLabel, type Unit } from "../domain/display";
import type { EditResult, Project } from "../domain/types";

export type TrayPointer = { id: string; clientX: number; clientY: number };
export default function RoomTray({
  project,
  floorId,
  unit,
  selected,
  targetUnit,
  onTargetUnit,
  onSelect,
  onPlace,
  onClose,
  onApply,
  onRestored,
  onDrag,
  onDrop,
}: {
  project: Project;
  floorId: string;
  unit: Unit;
  selected: string | null;
  targetUnit: string;
  onTargetUnit: (value: string) => void;
  onSelect: (id: string) => void;
  onPlace: (id: string) => void;
  onClose: () => void;
  onApply: (result: EditResult) => boolean;
  onRestored: (id: string) => void;
  onDrag: (pointer: TrayPointer | null) => void;
  onDrop: (pointer: TrayPointer) => void;
}) {
  const gesture = useRef<{
    pointerId: number;
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const wasDrag = useRef(false);
  const pieces = project.stagedRooms ?? [];
  const floor = project.floors.find((f) => f.id === floorId)!;
  const picked =
    pieces.find((piece) => piece.room.id === selected) ?? pieces[0];
  const unitId = targetUnit === "auto" ? undefined : targetUnit || null;
  return (
    <section className="room-tray" data-room-tray-drop aria-label="Room tray">
      <div className="tray-heading">
        <div>
          <strong>
            Room tray <span>{pieces.length}</span>
          </strong>
          <p>Keep pieces here while you make space.</p>
        </div>
        <button aria-label="Close room tray" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {!pieces.length ? (
        <div className="tray-empty">
          Drag a room here in Move mode, or choose <strong>Set aside</strong> in
          its details. Nothing is lost.
        </div>
      ) : (
        <>
          <div className="tray-pieces">
            {pieces.map(({ room }) => (
              <article
                className={`tray-piece ${selected === room.id ? "selected" : ""}`}
                key={room.id}
              >
                <button
                  className="tray-piece-grip"
                  aria-label={`Place ${room.name} from tray`}
                  onClick={(event) => {
                    if (event.detail > 0 && wasDrag.current) return;
                    onSelect(room.id);
                  }}
                  onPointerDown={(event) => {
                    if (
                      !event.isPrimary ||
                      event.button !== 0 ||
                      gesture.current
                    )
                      return;
                    wasDrag.current = false;
                    gesture.current = {
                      pointerId: event.pointerId,
                      id: room.id,
                      x: event.clientX,
                      y: event.clientY,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const g = gesture.current;
                    if (!g || g.pointerId !== event.pointerId) return;
                    if (
                      Math.hypot(event.clientX - g.x, event.clientY - g.y) > 6
                    ) {
                      g.moved = true;
                      onDrag({
                        id: g.id,
                        clientX: event.clientX,
                        clientY: event.clientY,
                      });
                    }
                  }}
                  onPointerUp={(event) => {
                    const g = gesture.current;
                    if (!g || g.pointerId !== event.pointerId) return;
                    gesture.current = null;
                    wasDrag.current = g.moved;
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    onDrag(null);
                    if (g.moved)
                      onDrop({
                        id: g.id,
                        clientX: event.clientX,
                        clientY: event.clientY,
                      });
                  }}
                  onPointerCancel={(event) => {
                    if (gesture.current?.pointerId !== event.pointerId) return;
                    gesture.current = null;
                    wasDrag.current = true;
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    onDrag(null);
                  }}
                  onLostPointerCapture={(event) => {
                    if (gesture.current?.pointerId !== event.pointerId) return;
                    gesture.current = null;
                    wasDrag.current = true;
                    onDrag(null);
                  }}
                >
                  <svg
                    viewBox={`${room.bounds.x - 10} ${room.bounds.z - 10} ${room.bounds.w + 20} ${room.bounds.d + 20}`}
                    aria-hidden="true"
                  >
                    <rect
                      x={room.bounds.x}
                      y={room.bounds.z}
                      width={room.bounds.w}
                      height={room.bounds.d}
                      fill="#e5ddcb"
                      stroke="#7c8e80"
                      strokeWidth={10}
                    />
                    <RoomDetailsPlan room={room} />
                  </svg>
                  <strong>{room.name}</strong>
                  <small>
                    {length(room.bounds.w, unit)} ×{" "}
                    {length(room.bounds.d, unit)} {unitLabel(unit)}
                  </small>
                </button>
                <div className="tray-piece-actions">
                  <button
                    aria-label={`Choose position for ${room.name}`}
                    onClick={() => onPlace(room.id)}
                  >
                    <ArrowUpRight size={17} />
                    Place
                  </button>
                  <button
                    aria-label={`Find space for ${room.name}`}
                    onClick={() => {
                      const result = restoreStagedRoom(
                        project,
                        room.id,
                        floorId,
                        { unitId },
                      );
                      if (onApply(result)) onRestored(room.id);
                    }}
                  >
                    <Check size={17} />
                    Fit
                  </button>
                  <button
                    aria-label={`Rotate ${room.name} in tray`}
                    onClick={() => onApply(rotateStagedRoom(project, room.id))}
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    aria-label={`Remove ${room.name} from tray`}
                    onClick={() => onApply(removeStagedRoom(project, room.id))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <details className="tray-options">
            <summary>Piece sizes & destination</summary>
            <label className="select-label">
              Place into
              <select
                aria-label="Tray destination group"
                value={targetUnit}
                onChange={(event) => onTargetUnit(event.target.value)}
              >
                <option value="auto">Original group, where possible</option>
                <option value="">Shared space</option>
                {floor.unitAreas.map((area) => (
                  <option key={area.unitId} value={area.unitId}>
                    {project.units.find((u) => u.id === area.unitId)?.name}
                  </option>
                ))}
              </select>
            </label>
            {picked && (
              <div className="field-pair">
                <Dimension
                  label="Tray room width"
                  cm={picked.room.bounds.w}
                  unit={unit}
                  language="en"
                  min={120}
                  onChange={(width) =>
                    onApply(
                      updateStagedRoom(project, picked.room.id, { width }),
                    )
                  }
                />
                <Dimension
                  label="Tray room depth"
                  cm={picked.room.bounds.d}
                  unit={unit}
                  language="en"
                  min={120}
                  onChange={(depth) =>
                    onApply(
                      updateStagedRoom(project, picked.room.id, { depth }),
                    )
                  }
                />
              </div>
            )}
          </details>
        </>
      )}
    </section>
  );
}

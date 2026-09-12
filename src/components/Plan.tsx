import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { Floor, Project, Rect, Room, ViewSettings } from "../domain/types";
import { ROOM_META } from "../domain/types";
import { balconyBounds, deriveWalls, updateRoom } from "../domain/model";
import { moveRoomSmart } from "../domain/builder";
import {
  floorName,
  length,
  unitLabel,
  type Language,
  type Unit,
} from "../domain/display";
import "./Plan.css";

type Tool = "select" | "move" | "resize";
type Feedback = { valid: boolean; message: string };
type Props = {
  project: Project;
  floor: Floor;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, bounds: Rect) => void;
  view: ViewSettings;
  language?: Language;
  unit?: Unit;
  editable?: boolean;
  tool?: Tool;
  onInteraction?: (feedback: Feedback) => void;
};
type Gesture = {
  pointerId: number;
  capture: Element;
  inverse: DOMMatrix;
  client: { x: number; y: number };
  start: { x: number; z: number };
  kind: Tool | "pan";
  room?: Room;
  pan: { x: number; z: number };
};
type Preview = {
  id: string;
  bounds: Rect;
  floor: Floor;
  valid: boolean;
  message: string;
};
const snap = (value: number) => Math.round(value / 10) * 10;

export default function Plan({
  project,
  floor,
  selected,
  onSelect,
  onMove,
  view,
  unit = "ft",
  editable = false,
  tool,
  onInteraction,
}: Props) {
  const activeTool = tool ?? (editable ? "move" : "select");
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastFeedback = useRef("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, z: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const { width, depth, setback } = project.plot;
  const viewWidth = (width + 360) / zoom;
  const viewHeight = (depth + 360) / zoom;
  const scale =
    Math.min(viewport.width / viewWidth, viewport.height / viewHeight) || 0.2;
  const pixel = 1 / scale;
  const displayFloor = preview?.floor ?? floor;
  const highlighted = preview?.id ?? selected;
  const selectedRoom = displayFloor.rooms.find(
    (room) => room.id === highlighted,
  );
  const road = project.plot.road;
  const balcony = balconyBounds(floor);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const old = gesture.current;
    gesture.current = null;
    if (old?.capture.hasPointerCapture(old.pointerId))
      old.capture.releasePointerCapture(old.pointerId);
    setZoom(1);
    setPan({ x: 0, z: 0 });
    setPreview(null);
    setFeedback(null);
  }, [floor.id, view.resetKey]);

  function report(next: Feedback) {
    const feedback = { valid: next.valid, message: next.message };
    setFeedback(feedback);
    const key = `${next.valid}:${next.message}`;
    if (key !== lastFeedback.current) {
      lastFeedback.current = key;
      onInteraction?.(feedback);
    }
  }
  function coordinates(event: ReactPointerEvent, inverse: DOMMatrix) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      inverse,
    );
    return { x: point.x, z: point.y };
  }
  function begin(event: ReactPointerEvent, kind: Gesture["kind"], room?: Room) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const inverse = matrix.inverse();
    gesture.current = {
      pointerId: event.pointerId,
      capture: event.currentTarget,
      inverse,
      client: { x: event.clientX, y: event.clientY },
      start: coordinates(event, inverse),
      kind,
      room,
      pan,
    };
    setFeedback(null);
  }
  function candidate(event: ReactPointerEvent, start: Gesture): Preview | null {
    if (!start.room) return null;
    const point = coordinates(event, start.inverse);
    const dx = point.x - start.start.x,
      dz = point.z - start.start.z;
    const original = start.room.bounds;
    const bounds =
      start.kind === "resize"
        ? {
            ...original,
            w: Math.max(120, snap(original.w + dx)),
            d: Math.max(120, snap(original.d + dz)),
          }
        : { ...original, x: snap(original.x + dx), z: snap(original.z + dz) };
    const result =
      start.kind === "resize"
        ? updateRoom(project, floor.id, start.room.id, { bounds })
        : moveRoomSmart(project, floor.id, start.room.id, bounds);
    if (!result.ok)
      return {
        id: start.room.id,
        bounds,
        floor: {
          ...floor,
          rooms: floor.rooms.map((room) =>
            room.id === start.room!.id ? { ...room, bounds } : room,
          ),
        },
        valid: false,
        message: result.error,
      };
    const nextFloor = result.project.floors.find((f) => f.id === floor.id)!;
    const other = nextFloor.rooms.find(
      (room) =>
        room.id !== start.room!.id &&
        floor.rooms.some(
          (before) =>
            before.id === room.id &&
            (before.bounds.x !== room.bounds.x ||
              before.bounds.z !== room.bounds.z),
        ),
    );
    return {
      id: start.room.id,
      bounds,
      floor: nextFloor,
      valid: true,
      message: other
        ? `Release to swap with ${other.name}`
        : start.kind === "resize"
          ? "Fits here · release to resize"
          : "Fits here · release to place",
    };
  }
  function move(event: ReactPointerEvent) {
    const start = gesture.current;
    if (
      !start ||
      start.pointerId !== event.pointerId ||
      Math.hypot(
        event.clientX - start.client.x,
        event.clientY - start.client.y,
      ) <= 5
    )
      return;
    if (start.kind === "pan") {
      if (zoom <= 1) return;
      const point = coordinates(event, start.inverse);
      setPan({
        x: Math.max(
          -width / 2,
          Math.min(width / 2, start.pan.x - point.x + start.start.x),
        ),
        z: Math.max(
          -depth / 2,
          Math.min(depth / 2, start.pan.z - point.z + start.start.z),
        ),
      });
      return;
    }
    if (start.kind === "select") return;
    const next = candidate(event, start);
    if (next) {
      setPreview(next);
      report(next);
    }
  }
  function clearGesture() {
    const start = gesture.current;
    gesture.current = null;
    if (start?.capture.hasPointerCapture(start.pointerId))
      start.capture.releasePointerCapture(start.pointerId);
    setPreview(null);
  }
  function end(event: ReactPointerEvent) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const moved =
      Math.hypot(
        event.clientX - start.client.x,
        event.clientY - start.client.y,
      ) > 5;
    const next =
      moved && (start.kind === "move" || start.kind === "resize")
        ? candidate(event, start)
        : null;
    clearGesture();
    // Selection can open the app's controls; it happens only after the final coordinate is resolved.
    if (next?.valid) {
      onMove(next.id, next.bounds);
      report({
        valid: true,
        message: start.kind === "resize" ? "Room resized" : "Room placed",
      });
    } else if (next) report(next);
    if (start.room && (!moved || start.kind !== "select"))
      onSelect(start.room.id);
    else if (!moved && start.kind === "pan") onSelect(null);
  }
  function changeZoom(next: number) {
    clearGesture();
    setZoom(next);
    if (next === 1) setPan({ x: 0, z: 0 });
  }
  function keyboardResize(dx: number, dz: number) {
    if (!selectedRoom) return;
    const bounds = {
      ...selectedRoom.bounds,
      w: selectedRoom.bounds.w + dx,
      d: selectedRoom.bounds.d + dz,
    };
    const result = updateRoom(project, floor.id, selectedRoom.id, { bounds });
    if (result.ok) {
      onMove(selectedRoom.id, bounds);
      report({ valid: true, message: "Room resized" });
    } else report({ valid: false, message: result.error });
  }
  const hint =
    activeTool === "move"
      ? "Drag a room · drop on another to swap"
      : activeTool === "resize"
        ? "Select a room · drag its corner to resize"
        : "Tap a room to choose it";
  return (
    <div
      className={`plan-wrap direct-plan tool-${activeTool}${preview ? " has-preview" : ""}`}
    >
      <svg
        ref={svg}
        className="plan-svg"
        viewBox={`${width / 2 + pan.x - viewWidth / 2} ${depth / 2 + pan.z - viewHeight / 2} ${viewWidth} ${viewHeight}`}
        role="group"
        aria-label={`${floorName(project.floors.findIndex((f) => f.id === floor.id))}. Interactive floor plan.`}
        onPointerDown={(event) => begin(event, "pan")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={(event) => {
          if (gesture.current?.pointerId !== event.pointerId) return;
          clearGesture();
          setFeedback(null);
        }}
        onLostPointerCapture={(event) => {
          if (gesture.current?.pointerId === event.pointerId) {
            clearGesture();
            setFeedback(null);
          }
        }}
        style={{ touchAction: "none", cursor: zoom > 1 ? "grab" : undefined }}
      >
        <defs>
          <pattern
            id="plan-grid"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 100 0 L 0 0 0 100"
              fill="none"
              stroke="#c6d2d4"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <rect
          width={width}
          height={depth}
          fill="#e6eddf"
          stroke="#73887c"
          strokeWidth="8"
        />
        <rect
          width={width}
          height={depth}
          fill="url(#plan-grid)"
          pointerEvents="none"
        />
        <rect
          x={setback}
          y={setback}
          width={width - 2 * setback}
          height={depth - 2 * setback}
          fill="none"
          stroke="#98a69e"
          strokeWidth="5"
          strokeDasharray="22 20"
          pointerEvents="none"
        />
        <rect
          x={floor.footprint.x}
          y={floor.footprint.z}
          width={floor.footprint.w}
          height={floor.footprint.d}
          fill="#faf9f3"
          stroke="#66746f"
          strokeWidth="12"
        />
        {displayFloor.rooms.map((room) => {
          const b = room.bounds,
            active = room.id === highlighted;
          const outline = active
            ? preview
              ? preview.valid
                ? "#248653"
                : "#cb4942"
              : "#285f4b"
            : "#a6aaa3";
          return (
            <g
              key={room.id}
              className={`plan-room${active ? " active" : ""}`}
              onPointerDown={(event) =>
                begin(
                  event,
                  activeTool === "move" ? "move" : "select",
                  floor.rooms.find((original) => original.id === room.id),
                )
              }
            >
              <title>
                {room.name}: {length(b.w, unit)} × {length(b.d, unit)}{" "}
                {unitLabel(unit)}
              </title>
              <rect
                x={b.x + 5}
                y={b.z + 5}
                width={b.w - 10}
                height={b.d - 10}
                fill={ROOM_META[room.kind].color}
                fillOpacity={active ? 0.94 : 0.72}
                stroke={outline}
                strokeWidth={active ? 3 * pixel : pixel}
              />
              <foreignObject
                x={b.x + 10}
                y={b.z + 10}
                width={Math.max(1, b.w - 20)}
                height={Math.max(1, b.d - 20)}
                pointerEvents="none"
              >
                <div
                  className="plan-room-caption"
                  style={{ fontSize: 12 * pixel }}
                >
                  <strong>{room.name}</strong>
                  {active && (
                    <span>
                      {length(b.w, unit)} × {length(b.d, unit)}{" "}
                      {unitLabel(unit)}
                    </span>
                  )}
                </div>
              </foreignObject>
            </g>
          );
        })}
        {floor.voids.map((space) => (
          <g key={space.id} pointerEvents="none">
            <rect
              x={space.bounds.x}
              y={space.bounds.z}
              width={space.bounds.w}
              height={space.bounds.d}
              fill={space.kind === "courtyard" ? "#b9c9a5" : "#e5e3d9"}
              stroke="#849783"
              strokeWidth="6"
            />
            {space.kind === "stairs" &&
              Array.from({ length: 12 }, (_, i) => (
                <line
                  key={i}
                  x1={space.bounds.x}
                  x2={space.bounds.x + space.bounds.w}
                  y1={space.bounds.z + (i * space.bounds.d) / 12}
                  y2={space.bounds.z + (i * space.bounds.d) / 12}
                  stroke="#aaa99d"
                  strokeWidth="4"
                />
              ))}
            <text
              x={space.bounds.x + space.bounds.w / 2}
              y={space.bounds.z + space.bounds.d / 2}
              textAnchor="middle"
              fontSize={11 * pixel}
              fill="#45634f"
            >
              {space.kind === "stairs" ? "Stairs ↑" : "Aangan"}
            </text>
          </g>
        ))}
        {view.walls &&
          deriveWalls(displayFloor, road).map((wall) => (
            <g key={wall.id} pointerEvents="none">
              <line
                x1={wall.x}
                y1={wall.z}
                x2={wall.x + (wall.axis === "x" ? wall.length : 0)}
                y2={wall.z + (wall.axis === "z" ? wall.length : 0)}
                stroke="#59675f"
                strokeWidth="14"
              />
              {view.openings && wall.opening && (
                <line
                  x1={
                    wall.x +
                    (wall.axis === "x"
                      ? (wall.length - wall.opening.width) / 2
                      : 0)
                  }
                  y1={
                    wall.z +
                    (wall.axis === "z"
                      ? (wall.length - wall.opening.width) / 2
                      : 0)
                  }
                  x2={
                    wall.x +
                    (wall.axis === "x"
                      ? (wall.length + wall.opening.width) / 2
                      : 0)
                  }
                  y2={
                    wall.z +
                    (wall.axis === "z"
                      ? (wall.length + wall.opening.width) / 2
                      : 0)
                  }
                  stroke={wall.opening.kind === "door" ? "#faf9f3" : "#99c8d4"}
                  strokeWidth="16"
                />
              )}
            </g>
          ))}
        {floor.balcony && (
          <rect
            x={balcony.x}
            y={balcony.z}
            width={balcony.w}
            height={balcony.d}
            fill="#cdb796"
            stroke="#73847c"
            strokeWidth="7"
            pointerEvents="none"
          />
        )}
        <g
          fill="#607669"
          fontSize={11 * pixel}
          textAnchor="middle"
          pointerEvents="none"
        >
          <text x={width / 2} y={-55}>
            {length(width, unit)} {unitLabel(unit)}
          </text>
          <text transform={`translate(-55 ${depth / 2}) rotate(-90)`}>
            {length(depth, unit)} {unitLabel(unit)}
          </text>
        </g>
        <text
          x={road === "west" ? -135 : road === "east" ? width + 135 : width / 2}
          y={
            road === "north" ? -135 : road === "south" ? depth + 135 : depth / 2
          }
          transform={
            road === "west" || road === "east"
              ? `rotate(-90 ${road === "west" ? -135 : width + 135} ${depth / 2})`
              : undefined
          }
          textAnchor="middle"
          fontSize={10 * pixel}
          fill="#6a7c72"
          pointerEvents="none"
        >
          ROAD
        </text>
        {activeTool === "resize" && selectedRoom && (
          <g
            className="plan-resize-handle"
            role="button"
            tabIndex={0}
            aria-label={`Resize ${selectedRoom.name}; drag the corner or use arrow keys`}
            transform={`translate(${selectedRoom.bounds.x + selectedRoom.bounds.w} ${selectedRoom.bounds.z + selectedRoom.bounds.d})`}
            onPointerDown={(event) =>
              begin(
                event,
                "resize",
                floor.rooms.find((room) => room.id === selectedRoom.id),
              )
            }
            onKeyDown={(event) => {
              const delta: Record<string, [number, number]> = {
                ArrowLeft: [-10, 0],
                ArrowRight: [10, 0],
                ArrowUp: [0, -10],
                ArrowDown: [0, 10],
              };
              if (delta[event.key]) {
                event.preventDefault();
                keyboardResize(...delta[event.key]);
              }
            }}
          >
            <rect
              x={-25 * pixel}
              y={-25 * pixel}
              width={50 * pixel}
              height={50 * pixel}
              fill="transparent"
            />
            <circle
              r={22 * pixel}
              fill={preview && !preview.valid ? "#cb4942" : "#285f4b"}
              stroke="#fffdf6"
              strokeWidth={3 * pixel}
            />
            <path
              d={`M ${-7 * pixel} ${7 * pixel} L ${7 * pixel} ${-7 * pixel} M ${-7 * pixel} 0 V ${7 * pixel} H 0 M 0 ${-7 * pixel} H ${7 * pixel} V 0`}
              fill="none"
              stroke="white"
              strokeWidth={2 * pixel}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
      <div className="plan-tools" role="group" aria-label="Floor plan zoom">
        <button
          type="button"
          aria-label="Zoom in on plan"
          disabled={zoom >= 4}
          onClick={() => changeZoom(Math.min(4, zoom * 1.3))}
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          aria-label="Zoom out of plan"
          disabled={zoom <= 1}
          onClick={() => changeZoom(Math.max(1, zoom / 1.3))}
        >
          <Minus size={20} />
        </button>
        <button
          type="button"
          aria-label="Fit plan"
          onClick={() => changeZoom(1)}
        >
          <Maximize2 size={17} />
          <span>Fit</span>
        </button>
      </div>
      <div
        className={`plan-hint${feedback ? (feedback.valid ? " is-valid" : " is-invalid") : ""}`}
        role="status"
      >
        {feedback?.message ??
          `${hint}${zoom > 1 ? " · drag empty space to pan" : ""}`}
      </div>
    </div>
  );
}

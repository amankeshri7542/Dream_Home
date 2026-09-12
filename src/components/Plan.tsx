import { useState, useRef } from "react";
import type { PointerEvent } from "react";
import type { Floor, Project, Rect, ViewSettings } from "../domain/types";
import { ROOM_META } from "../domain/types";
import { balconyBounds, deriveWalls } from "../domain/model";
import {
  floorName,
  length,
  roomName,
  text,
  unitLabel,
  type Language,
  type Unit,
} from "../domain/display";

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
};
export default function Plan({
  project,
  floor,
  selected,
  onSelect,
  onMove,
  view,
  language = "en",
  unit = "ft",
  editable = false,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    start: { x: number; y: number };
    client: { x: number; y: number };
    bounds: Rect;
    editable: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<{ id: string; bounds: Rect } | null>(
    null,
  );
  const { width, depth, setback } = project.plot;
  const [zoom, setZoom] = useState(1);
  const viewWidth = (width + 480) / zoom;
  const viewHeight = (depth + 440) / zoom;
  const point = (e: PointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.current!.getScreenCTM()!.inverse(),
    );
    return { x: p.x, y: p.y };
  };
  function move(e: PointerEvent) {
    if (
      !drag.current?.editable ||
      Math.hypot(
        e.clientX - drag.current.client.x,
        e.clientY - drag.current.client.y,
      ) <= 5
    )
      return;
    const start = drag.current;
    setPreview({
      id: start.id,
      bounds: movedBounds(e, start),
    });
  }
  function movedBounds(
    e: PointerEvent,
    start: NonNullable<typeof drag.current>,
  ): Rect {
    const p = point(e);
    return {
      ...start.bounds,
      x: Math.round((start.bounds.x + p.x - start.start.x) / 10) * 10,
      z: Math.round((start.bounds.z + p.y - start.start.y) / 10) * 10,
    };
  }
  function end(e: PointerEvent) {
    const start = drag.current;
    if (!start) return;
    // Resolve the last pointer position before selection can open a sheet and resize the SVG.
    const moved =
      Math.hypot(e.clientX - start.client.x, e.clientY - start.client.y) > 5;
    const bounds = start.editable && moved ? movedBounds(e, start) : null;
    drag.current = null;
    setPreview(null);
    if (bounds) onMove(start.id, bounds);
    if (!moved || start.editable) onSelect(start.id);
  }
  const road = project.plot.road;
  const balcony = balconyBounds(floor);
  return (
    <div className="plan-wrap">
      <svg
        ref={svg}
        className="plan-svg"
        viewBox={`${width / 2 - viewWidth / 2} ${depth / 2 - viewHeight / 2} ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label={`${floorName(
          project.floors.findIndex((f) => f.id === floor.id),
          language,
        )}. ${text(language, "Floor plan. Tap a room to select it.", "नक्शा। कमरा चुनने के लिए उस पर टैप करें।")}`}
        style={{ touchAction: "none" }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
        }}
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
          x="0"
          y="0"
          width={width}
          height={depth}
          fill="#edf1e8"
          stroke="#73887c"
          strokeWidth="8"
          onClick={() => onSelect(null)}
        />
        <rect
          x="0"
          y="0"
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
        {floor.rooms.map((room) => {
          const b = preview?.id === room.id ? preview.bounds : room.bounds;
          return (
            <g
              key={room.id}
              className="plan-room"
              onPointerDown={(e) => {
                if (!e.isPrimary || e.button !== 0) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  id: room.id,
                  start: point(e),
                  client: { x: e.clientX, y: e.clientY },
                  bounds: room.bounds,
                  editable,
                };
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <rect
                x={b.x + 5}
                y={b.z + 5}
                width={b.w - 10}
                height={b.d - 10}
                fill={ROOM_META[room.kind].color}
                fillOpacity={selected === room.id ? 0.85 : 0.48}
                stroke={selected === room.id ? "#355e51" : "#a6aaa3"}
                strokeWidth={selected === room.id ? 12 : 3}
              />
              <text
                x={b.x + b.w / 2}
                y={b.z + b.d / 2 - 12}
                textAnchor="middle"
                fontSize={Math.min(38, b.w / 8)}
                fill="#344c47"
                fontWeight="600"
                pointerEvents="none"
              >
                {roomName(room, language)}
              </text>
              <text
                x={b.x + b.w / 2}
                y={b.z + b.d / 2 + 38}
                textAnchor="middle"
                fontSize="28"
                fill="#5e716d"
                pointerEvents="none"
              >
                {length(b.w, unit)} × {length(b.d, unit)}{" "}
                {unitLabel(unit, language)}
              </text>
            </g>
          );
        })}
        {floor.voids.map((v) => (
          <g key={v.id}>
            <rect
              x={v.bounds.x}
              y={v.bounds.z}
              width={v.bounds.w}
              height={v.bounds.d}
              fill={v.kind === "courtyard" ? "#b9c9a5" : "#e5e3d9"}
              stroke="#849783"
              strokeWidth="6"
            />
            {v.kind === "stairs" &&
              Array.from({ length: 12 }, (_, i) => (
                <line
                  key={i}
                  x1={v.bounds.x}
                  x2={v.bounds.x + v.bounds.w}
                  y1={v.bounds.z + (i * v.bounds.d) / 12}
                  y2={v.bounds.z + (i * v.bounds.d) / 12}
                  stroke="#aaa99d"
                  strokeWidth="4"
                />
              ))}
            <text
              x={v.bounds.x + v.bounds.w / 2}
              y={v.bounds.z + v.bounds.d / 2}
              textAnchor="middle"
              fontSize="27"
              fill="#45634f"
            >
              {v.kind === "stairs"
                ? text(language, "Stairs ↑", "सीढ़ियाँ ↑")
                : text(language, "Aangan", "आँगन")}
            </text>
          </g>
        ))}
        {view.walls &&
          deriveWalls(floor, road).map((w) => (
            <g key={w.id} pointerEvents="none">
              <line
                x1={w.x}
                y1={w.z}
                x2={w.x + (w.axis === "x" ? w.length : 0)}
                y2={w.z + (w.axis === "z" ? w.length : 0)}
                stroke="#59675f"
                strokeWidth="14"
              />
              {view.openings && w.opening && (
                <line
                  x1={
                    w.x +
                    (w.axis === "x" ? (w.length - w.opening.width) / 2 : 0)
                  }
                  y1={
                    w.z +
                    (w.axis === "z" ? (w.length - w.opening.width) / 2 : 0)
                  }
                  x2={
                    w.x +
                    (w.axis === "x" ? (w.length + w.opening.width) / 2 : 0)
                  }
                  y2={
                    w.z +
                    (w.axis === "z" ? (w.length + w.opening.width) / 2 : 0)
                  }
                  stroke={w.opening.kind === "door" ? "#faf9f3" : "#99c8d4"}
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
          />
        )}
        <g fill="#718078" fontSize="35" textAnchor="middle">
          <text x={width / 2} y="-85">
            {length(width, unit)} {unitLabel(unit, language)}
          </text>
          <text transform={`translate(-90 ${depth / 2}) rotate(-90)`}>
            {length(depth, unit)} {unitLabel(unit, language)}
          </text>
        </g>
        <path
          d={`M0 -45V-20 M0 -35H${width} M${width} -45V-20 M-45 0H-20 M-35 0V${depth} M-45 ${depth}H-20`}
          stroke="#879b91"
          strokeWidth="4"
          fill="none"
        />
        <text
          x={road === "west" ? -150 : road === "east" ? width + 150 : width / 2}
          y={
            road === "north" ? -155 : road === "south" ? depth + 145 : depth / 2
          }
          transform={
            road === "west" || road === "east"
              ? `rotate(-90 ${road === "west" ? -150 : width + 150} ${depth / 2})`
              : undefined
          }
          textAnchor="middle"
          fontSize="30"
          letterSpacing="10"
          fill="#7e8b89"
        >
          {text(language, "ROAD", "सड़क")}
        </text>
      </svg>
      <div
        className="plan-tools"
        role="group"
        aria-label={text(language, "Floor plan zoom", "नक्शे का ज़ूम")}
      >
        <button
          type="button"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label={text(language, "Zoom in on plan", "नक्शा बड़ा करें")}
          disabled={zoom >= 4}
          onClick={() => setZoom((z) => Math.min(4, z * 1.3))}
        >
          ＋
        </button>
        <button
          type="button"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label={text(language, "Zoom out of plan", "नक्शा छोटा करें")}
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z / 1.3))}
        >
          −
        </button>
        <button
          type="button"
          style={{ minWidth: 44, minHeight: 44 }}
          onClick={() => setZoom(1)}
        >
          {text(language, "Fit", "पूरा")}
        </button>
      </div>
      <div className="plan-hint">
        {editable
          ? text(
              language,
              "Drag a room to move · 10 cm grid",
              "कमरा खींचकर खिसकाएँ · 10 सेमी ग्रिड",
            )
          : text(
              language,
              "Tap a room to change its size or position",
              "आकार या जगह बदलने के लिए कमरे पर टैप करें",
            )}
      </div>
    </div>
  );
}

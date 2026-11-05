// A small plan while walking: a blue dot for where you are; tap a room to go
// there, which also gives anyone a tap alternative to the joystick. It folds
// away, and it's an SVG moved by direct writes, so walking re-renders nothing
// and it adds no draw calls.
import { useEffect, useMemo, useRef } from "react";
import type { Floor, Project } from "../domain/types";
import { requestRoom, walkInput } from "./walkInput";

const shortName = (name: string) => (name.length > 14 ? `${name.slice(0, 13)}…` : name);

export function MiniPlan({ project, floorId, onChosen }: { project: Project; floorId?: string; onChosen: () => void }) {
  const floor: Floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
  const dot = useRef<SVGGElement>(null);
  const f = floor.footprint;
  const pad = 26;
  const view = `${f.x - pad} ${f.z - pad} ${f.w + pad * 2} ${f.d + pad * 2}`;
  // Text stays readable whatever the home's size, and follows the app's text size setting.
  const fontSize = useMemo(() => {
    const scale = Number(getComputedStyle(document.documentElement).getPropertyValue("--dh-text")) || 1;
    return (Math.max(f.w, f.d) / 24) * scale;
  }, [f.w, f.d]);
  useEffect(() => {
    const write = () => {
      const g = dot.current;
      if (!g) return;
      const { x, z, yaw, floorId: on } = walkInput.position;
      g.style.display = on && on !== floor.id ? "none" : "";
      // yaw 0 faces north (−z); the beam is drawn pointing up the plan.
      g.setAttribute("transform", `translate(${x} ${z}) rotate(${(-yaw * 180) / Math.PI})`);
    };
    write();
    walkInput.onMove = write;
    return () => {
      walkInput.onMove = null;
    };
  }, [floor.id]);
  const r = Math.max(f.w, f.d) / 42;
  return (
    <div className="dh-miniplan" role="group" aria-label={`Plan of ${floor.name}`}>
      <svg viewBox={view} preserveAspectRatio="xMidYMid meet" aria-hidden={false}>
        {floor.rooms.map((room) => {
          const b = room.bounds;
          return (
            <g
              key={room.id}
              role="button"
              tabIndex={0}
              aria-label={`Go to ${room.name}`}
              className="dh-miniplan-room"
              onClick={() => {
                requestRoom(floor.id, room.id);
                onChosen();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                requestRoom(floor.id, room.id);
                onChosen();
              }}
            >
              <rect x={b.x} y={b.z} width={b.w} height={b.d} rx={Math.min(b.w, b.d) * 0.03} />
              <text x={b.x + b.w / 2} y={b.z + b.d / 2} fontSize={fontSize} textAnchor="middle" dominantBaseline="middle">
                {shortName(room.name)}
              </text>
            </g>
          );
        })}
        <g ref={dot} className="dh-miniplan-dot" pointerEvents="none">
          <path d={`M0 ${-r * 3.2} L${r * 1.6} ${-r * 0.8} L${-r * 1.6} ${-r * 0.8} Z`} className="dh-miniplan-beam" />
          <circle r={r * 1.45} className="dh-miniplan-halo" />
          <circle r={r} />
        </g>
      </svg>
    </div>
  );
}

import { roomDetails, DETAIL_MATERIALS } from "../domain/roomDetails";
import type { Room, Wall } from "../domain/types";

export function RoomDetailsPlan({
  room,
  walls = [],
}: {
  room: Room;
  walls?: readonly Wall[];
}) {
  const details = roomDetails(room, walls)
    .slice()
    .sort((a, b) => a.y + a.height - b.y - b.height);
  return (
    <g pointerEvents="none" aria-hidden="true" data-room-details={room.id}>
      {details.map((detail, index) => {
        const r = detail.bounds;
        const style = {
          fill: DETAIL_MATERIALS[detail.material].color,
          stroke: "#4e5a514f",
          strokeWidth: 1.2,
        };
        return detail.shape === "ellipse" ? (
          <ellipse
            key={index}
            cx={r.x + r.w / 2}
            cy={r.z + r.d / 2}
            rx={r.w / 2}
            ry={r.d / 2}
            {...style}
          />
        ) : (
          <rect
            key={index}
            x={r.x}
            y={r.z}
            width={r.w}
            height={r.d}
            rx={detail.soft ? Math.min(5, r.w / 5, r.d / 5) : 1}
            {...style}
          />
        );
      })}
    </g>
  );
}

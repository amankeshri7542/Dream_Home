// "Check your plan": the reading as editable rooms on the 2D plan, with the
// photo faint underneath. Line the photo up, fix a room's type with one tap,
// look at the rooms the reading wasn't sure of, then "Make it 3D". Every
// change is an ordinary edit: Undo always works. Lazy (its own chunk).
import { updateRoom } from "../domain/model";
import type { RoomKind } from "../domain/types";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";
import type { PlanCheckState } from "./check";
import "../photo/photo.css";
import "./planread.css";

const TYPES: { label: string; kind: RoomKind; name?: string }[] = [
  { label: "Living", kind: "living", name: "Living room" },
  { label: "Bedroom", kind: "bedroom" },
  { label: "Kitchen", kind: "kitchen", name: "Kitchen" },
  { label: "Bathroom", kind: "bathroom", name: "Bathroom" },
  { label: "Dining", kind: "dining", name: "Dining" },
  { label: "Pooja", kind: "utility", name: "Pooja room" },
  { label: "Store", kind: "utility", name: "Store" },
  { label: "Study", kind: "utility", name: "Study" },
];
const STEP = 20;

export default function PlanCheck({ check, onChange, onDone }: { check: PlanCheckState; onChange: (next: PlanCheckState) => void; onDone: () => void }) {
  const { project, activeFloor, selected, dispatch, run } = useEditor();
  const target = selected?.target;
  const room = target?.kind === "room" ? activeFloor.rooms.find((r) => r.id === target.id) : undefined;
  const unsure = check.unsure.map((id) => activeFloor.rooms.find((r) => r.id === id)).filter((r) => !!r);
  const nudge = (x: number, z: number) => onChange({ ...check, offset: { x: check.offset.x + x, z: check.offset.z + z } });
  const zoom = (k: number) => onChange({ ...check, scale: Math.min(2, Math.max(0.5, check.scale * k)) });
  const checked = (id: string) => onChange({ ...check, unsure: check.unsure.filter((u) => u !== id) });
  const relabel = (type: (typeof TYPES)[number]) => {
    if (!room) return;
    const bedrooms = activeFloor.rooms.filter((r) => r.kind === "bedroom" && r.id !== room.id).length;
    const name = type.name ?? `Bedroom ${bedrooms + 1}`;
    if (run(updateRoom(project, activeFloor.id, room.id, { kind: type.kind, name }), `Make ${room.name} the ${name.toLowerCase()}`, { notice: `${name} it is.` }))
      checked(room.id);
  };
  return (
    <section className="dh-plan-check" aria-label="Check your plan">
      <div className="dh-plan-check-head">
        <h3>Check your plan</h3>
        <Button variant="primary" icon={Icon.building} onClick={onDone}>
          Make it 3D
        </Button>
      </div>
      {check.notes.map((n) => (
        <p key={n} className="dh-note">
          {n}
        </p>
      ))}
      {room ? (
        <div className="dh-plan-row" role="group" aria-label={`What is ${room.name}?`}>
          <span>What is {room.name}?</span>
          <div className="dh-photo-chips">
            {TYPES.map((t) => (
              <button
                key={t.label}
                type="button"
                aria-pressed={t.name ? room.kind === t.kind && room.name === t.name : room.kind === t.kind}
                onClick={() => relabel(t)}
              >
                {t.label}
              </button>
            ))}
            {check.unsure.includes(room.id) && (
              <button type="button" className="is-ok" onClick={() => checked(room.id)}>
                <Icon.check size={16} aria-hidden /> Looks right
              </button>
            )}
          </div>
        </div>
      ) : unsure.length ? (
        <div className="dh-plan-row" role="group" aria-label="Check these rooms">
          <span>The reading wasn’t sure of these (dashed). Tap one to check it:</span>
          <div className="dh-photo-chips">
            {unsure.map((r) => (
              <button key={r.id} type="button" onClick={() => dispatch({ type: "select", target: { kind: "room", floorId: activeFloor.id, id: r.id } })}>
                Check {r.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="dh-note">Tap a room to change its type. Move it or pull a dot to fix its size.</p>
      )}
      <div className="dh-plan-row" role="group" aria-label="Line up the photo">
        <span>Line up the photo</span>
        <div className="dh-photo-chips">
          <button type="button" aria-label="Move the photo left" onClick={() => nudge(-STEP, 0)}>
            ←
          </button>
          <button type="button" aria-label="Move the photo right" onClick={() => nudge(STEP, 0)}>
            →
          </button>
          <button type="button" aria-label="Move the photo up" onClick={() => nudge(0, -STEP)}>
            ↑
          </button>
          <button type="button" aria-label="Move the photo down" onClick={() => nudge(0, STEP)}>
            ↓
          </button>
          <button type="button" onClick={() => zoom(1 / 1.03)}>
            Smaller
          </button>
          <button type="button" onClick={() => zoom(1.03)}>
            Bigger
          </button>
          <button type="button" aria-pressed={!check.show} onClick={() => onChange({ ...check, show: !check.show })}>
            {check.show ? "Hide photo" : "Show photo"}
          </button>
        </div>
      </div>
    </section>
  );
}

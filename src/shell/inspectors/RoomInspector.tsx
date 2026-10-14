import { useState } from "react";
import { Dimension, Switch } from "../../components/Controls";
import { moveRoomToUnit, updateRoom } from "../../domain/model";
import { ROOM_META, type QuarterTurn, type RoomKind } from "../../domain/types";
import { area, areaLabel } from "../../domain/display";
import { useEditor } from "../../editor/EditorProvider";
import { useDesktop } from "../../editor/hooks";
import { useSelectionActions } from "../../editor/actions";
import { Icon, roomIcon } from "../../ui/icons";
import { ensuiteOf } from "../../domain/ensuite";
import { ensuiteHost } from "../../domain/walls";

const BathIcon = roomIcon("bathroom");
import { Button, Field, IconButton, Section } from "../../ui/primitives";

type Corner = "nw" | "ne" | "sw" | "se";

export function RoomInspector() {
  const editor = useEditor();
  const { project, selected, unit, run, state } = editor;
  const actions = useSelectionActions();
  const [fixedCorner, setFixedCorner] = useState<Corner>("nw");
  const desktop = useDesktop();
  const room = selected?.room;
  const floor = selected?.floor;
  if (!room || !floor) return null;
  const expanded = desktop || state.sheet !== "peek";
  const ensuite = room.kind === "bedroom" ? ensuiteOf(floor.rooms, room.id) : null;
  const host = ensuiteHost(floor.rooms, room);
  const resize = (axis: "w" | "d", value: number) => {
    const bounds = { ...room.bounds, [axis]: value };
    if (axis === "w" && fixedCorner.endsWith("e")) bounds.x += room.bounds.w - value;
    if (axis === "d" && fixedCorner.startsWith("s")) bounds.z += room.bounds.d - value;
    run(updateRoom(project, floor.id, room.id, { bounds }), `Resize ${room.name}`);
  };
  return (
    <div className="dh-inspector-body" hidden={!expanded}>
      <div className="dh-room-stat">
        <strong className="dh-num">
          {area((room.bounds.w * room.bounds.d) / 10000, unit)}
          <small>{areaLabel(unit)}</small>
        </strong>
        <span>Approximate room area</span>
      </div>
      {room.kind === "bedroom" &&
        (ensuite ? (
          <p className="dh-tip">
            <BathIcon size={16} aria-hidden />
            Has its own bathroom: {ensuite.name}
          </p>
        ) : (
          <Button icon={BathIcon} full onClick={actions.addEnsuite}>
            Add attached bathroom
          </Button>
        ))}
      {host && (
        <p className="dh-tip">
          <BathIcon size={16} aria-hidden />
          Attached to {host.name} — its door opens into the bedroom.
        </p>
      )}
      <Section title="Size" description="Width, depth and which corner stays put" open>
        <div className="field-pair">
          <Dimension
            label="Room width"
            stepper
            cm={room.bounds.w}
            unit={unit}
            language="en"
            min={120}
            max={floor.footprint.w}
            onChange={(w) => resize("w", w)}
          />
          <Dimension
            label="Room depth"
            stepper
            cm={room.bounds.d}
            unit={unit}
            language="en"
            min={120}
            max={floor.footprint.d}
            onChange={(d) => resize("d", d)}
          />
        </div>
        <Field label="Which corner stays still?">
          <select
            aria-label="Fixed corner for room dimensions"
            value={fixedCorner}
            onChange={(e) => setFixedCorner(e.target.value as Corner)}
          >
            <option value="nw">Top left</option>
            <option value="ne">Top right</option>
            <option value="sw">Bottom left</option>
            <option value="se">Bottom right</option>
          </select>
        </Field>
        <p className="dh-note">
          Sizes snap to a little {unit === "ft" ? "4-inch" : "10 cm"} grid, so rooms line up neatly.
        </p>
      </Section>
      <Section title="Room appearance" description="Floor and furniture">
        <Field label="Floor finish">
          <select
            aria-label="Room floor finish"
            value={room.floorFinish ?? "auto"}
            onChange={(e) =>
              run(
                updateRoom(project, floor.id, room.id, {
                  floorFinish: e.target.value as NonNullable<typeof room.floorFinish>,
                  floorMaterial: undefined,
                }),
                `Change ${room.name} floor`,
              )
            }
          >
            <option value="auto">Recommended for this room</option>
            <option value="wood">Warm wood</option>
            <option value="tile">Light tile</option>
            <option value="stone">Natural stone</option>
          </select>
        </Field>
        <Switch
          label="Furnish this room"
          description="Furniture helps everyone recognise the room"
          checked={room.furnishing !== "none"}
          onChange={() =>
            actions.patchRoom(
              { furnishing: room.furnishing === "none" ? "auto" : "none" },
              `Furnish ${room.name}`,
            )
          }
        />
        <Button
          icon={Icon.rotate}
          full
          onClick={() =>
            actions.patchRoom(
              {
                furnishingRotation: (((room.furnishingRotation ?? 0) + 90) % 360) as QuarterTurn,
              },
              `Turn ${room.name} furnishings`,
            )
          }
        >
          Turn furnishings
        </Button>
      </Section>
      <Section title="Position" description="Nudge, or type an exact spot">
        <div className="dh-nudge" role="group" aria-label="Move a little">
          <span>
            <strong>Move a little</strong>
            <small>10 cm each tap</small>
          </span>
          <div>
            <IconButton icon={Icon.left} label="Move left" onClick={() => actions.nudge(-10, 0)} />
            <IconButton icon={Icon.up} label="Move back" onClick={() => actions.nudge(0, -10)} />
            <IconButton icon={Icon.down} label="Move forward" onClick={() => actions.nudge(0, 10)} />
            <IconButton icon={Icon.right} label="Move right" onClick={() => actions.nudge(10, 0)} />
          </div>
        </div>
        <Field label="Room name">
          <input
            key={`${room.id}-${room.name}`}
            aria-label="Room name"
            defaultValue={room.name}
            maxLength={60}
            onBlur={(e) => {
              if (e.target.value === room.name) return;
              if (
                !run(
                  updateRoom(project, floor.id, room.id, { name: e.target.value }),
                  `Rename ${room.name}`,
                )
              )
                e.target.value = room.name;
            }}
          />
        </Field>
        <div className="field-pair">
          <Dimension
            label="From the left edge"
            cm={room.bounds.x}
            unit={unit}
            language="en"
            max={floor.footprint.x + floor.footprint.w - room.bounds.w}
            onChange={(x) =>
              run(
                updateRoom(project, floor.id, room.id, { bounds: { ...room.bounds, x } }),
                `Move ${room.name}`,
              )
            }
          />
          <Dimension
            label="From the top edge"
            cm={room.bounds.z}
            unit={unit}
            language="en"
            max={floor.footprint.z + floor.footprint.d - room.bounds.d}
            onChange={(z) =>
              run(
                updateRoom(project, floor.id, room.id, { bounds: { ...room.bounds, z } }),
                `Move ${room.name}`,
              )
            }
          />
        </div>
      </Section>
      <Section title="Use" description="What the room is for">
        <Field label="Use this room as">
          <select
            aria-label="Room use"
            value={room.kind}
            onChange={(e) => {
              const kind = e.target.value as RoomKind;
              run(
                updateRoom(project, floor.id, room.id, {
                  kind,
                  name: ROOM_META[kind].label,
                }),
                `Change ${room.name} use`,
              );
            }}
          >
            {Object.entries(ROOM_META).map(([kind, meta]) => (
              <option key={kind} value={kind}>
                {meta.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Swap room uses with"
          hint="Their walls and sizes stay in place; only the uses trade."
        >
          <select
            aria-label="Swap room uses with"
            value=""
            onChange={(e) => e.target.value && actions.swapWith(e.target.value)}
          >
            <option value="">Choose another room</option>
            {floor.rooms
              .filter((r) => r.id !== room.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
        {project.units.length > 0 && (
          <Field label="Move room to group">
            <select
              aria-label="Move room to group"
              value={room.unitId ?? ""}
              onChange={(e) =>
                run(
                  moveRoomToUnit(project, floor.id, room.id, e.target.value || null),
                  `Move ${room.name} to another group`,
                )
              }
            >
              <option value="">Shared space</option>
              {floor.unitAreas.map((a) => {
                const owner = project.units.find((u) => u.id === a.unitId);
                return owner ? (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ) : null;
              })}
            </select>
          </Field>
        )}
      </Section>
      <div className="dh-danger-zone">
        <Button variant="danger" icon={Icon.remove} onClick={actions.requestRemove}>
          Remove room
        </Button>
      </div>
    </div>
  );
}

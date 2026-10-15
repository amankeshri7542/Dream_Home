import { useMemo, useState } from "react";
import { floorForGeometry } from "../../domain/core";
import {
  FURNITURE_CATALOG,
  FURNITURE_FINISHES,
  furnitureCatalogItem,
  furnitureFitsRoom,
  furnitureLabel,
  resolveFurniture,
  suggestedFurniture,
} from "../../domain/furniture";
import {
  addFurniture,
  clearFurniture,
  duplicateFurniture,
  moveFurniture,
  removeFurniture,
  resetFurniture,
  rotateFurniture,
  updateFurniture,
} from "../../domain/furnitureCommands";
import {
  FLOOR_MATERIALS,
  WALL_PAINTS,
  roomFloorMaterial,
  roomWallPaint,
  setRoomFloorMaterial,
  setRoomWallColor,
} from "../../domain/materials";
import { deriveWalls } from "../../domain/walls";
import type { EditResult, Room } from "../../domain/types";
import { ROOM_META } from "../../domain/types";
import { useEditor } from "../../editor/EditorProvider";
import { THUMBS } from "../../scene/assets/assetManifest";
import { Icon } from "../../ui/icons";
import { Button, Field, IconButton, Section, Swatches } from "../../ui/primitives";
import { MakeItNice } from "../../ai/MakeItNice";

const CATEGORY_LABELS: Record<string, string> = {
  sleep: "Beds",
  seating: "Seating",
  tables: "Tables",
  storage: "Storage",
  kitchen: "Kitchen",
  bath: "Bathroom",
  work: "Work",
  utility: "Utility",
  retail: "Shop",
  decor: "Decor",
  lighting: "Lights",
};
const HIDDEN = new Set(["display-shelf-module"]);

export function Thumb({ id, label }: { id: string; label: string }) {
  const src = (THUMBS as Record<string, string>)[id];
  return src ? (
    <img src={src} alt="" loading="lazy" width={72} height={72} />
  ) : (
    <span className="dh-thumb-fallback" aria-hidden>
      {label.slice(0, 1)}
    </span>
  );
}

function useFurnitureRun(floorId: string, roomId: string) {
  const editor = useEditor();
  return (result: EditResult, label: string, extra: { notice?: string } = {}) =>
    editor.run(result, label, {
      select:
        result.ok && result.focusId
          ? { kind: "furniture", floorId, roomId, id: result.focusId }
          : undefined,
      quietError: true,
      ...extra,
    });
}

export function FurnitureCatalog({ room, floorId }: { room: Room; floorId: string }) {
  const { project } = useEditor();
  const run = useFurnitureRun(floorId, room.id);
  const [category, setCategory] = useState<string>("suggested");
  const suggested = useMemo(
    () => suggestedFurniture(room.kind).filter((i) => !HIDDEN.has(i.id)),
    [room.kind],
  );
  // Only pieces that belong in this kind of room: a kitchen never offers beds.
  const fitting = useMemo(
    () =>
      FURNITURE_CATALOG.filter((i) => !HIDDEN.has(i.id) && furnitureFitsRoom(i.id, room.kind)),
    [room.kind],
  );
  const categories = [...new Set(fitting.map((i) => i.category))];
  const items =
    category === "suggested" || !categories.includes(category)
      ? suggested
      : fitting.filter((i) => i.category === category);
  return (
    <div className="dh-catalog-picker">
      <div className="dh-chips" role="radiogroup" aria-label="Furniture categories">
        <button
          type="button"
          role="radio"
          aria-checked={category === "suggested"}
          onClick={() => setCategory("suggested")}
        >
          <Icon.sparkle size={15} aria-hidden /> For this room
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>
      <div className="dh-catalog-grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="dh-catalog-card"
            aria-label={`Add ${item.label.toLowerCase()} to ${room.name}`}
            onClick={() =>
              run(
                addFurniture(project, floorId, room.id, item.id),
                `Add ${item.label.toLowerCase()}`,
                { notice: `${item.label} added to ${room.name}!` },
              )
            }
          >
            <Thumb id={item.id} label={item.label} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Decorating one room: paint, floor and its furniture. */
export function DecorateRoomPanel({ room, floorId }: { room: Room; floorId: string }) {
  const editor = useEditor();
  const { project, select, run } = editor;
  const walls = useMemo(
    () => deriveWalls(floorForGeometry(project, floorId), project.plot.road),
    [project, floorId],
  );
  const items = resolveFurniture(room, walls);
  return (
    <div className="dh-inspector-body">
      {room.kind !== "shop" && <MakeItNice room={room} floorId={floorId} />}
      <Section title={`Furniture in ${room.name}`} description={`${items.length} piece${items.length === 1 ? "" : "s"}`} open>
        <div className="dh-furniture-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="dh-furniture-chip"
              onClick={() =>
                select({ kind: "furniture", floorId, roomId: room.id, id: item.id }, "list")
              }
            >
              <Thumb id={item.catalogId} label={furnitureLabel(item)} />
              <span>{furnitureLabel(item)}</span>
            </button>
          ))}
          {!items.length && <p className="dh-note">This room is empty. Add something below!</p>}
        </div>
        <div className="dh-cluster">
          <Button
            variant="ghost"
            icon={Icon.auto}
            onClick={() =>
              run(resetFurniture(project, floorId, room.id), `Auto-furnish ${room.name}`, {
                notice: `${room.name} is furnished automatically again.`,
              })
            }
          >
            Auto-furnish
          </Button>
          <Button
            variant="ghost"
            icon={Icon.remove}
            onClick={() =>
              run(clearFurniture(project, floorId, room.id), `Empty ${room.name}`, {
                notice: `${room.name} is empty now. Undo brings everything back.`,
              })
            }
          >
            Empty the room
          </Button>
        </div>
      </Section>
      <Section title="Add furniture" description="Tap to place it in a free spot" open>
        <FurnitureCatalog room={room} floorId={floorId} />
      </Section>
      <Section title="Walls & floor" description="Paint and flooring" open>
      <Swatches
        label="Wall paint"
        value={roomWallPaint(room)}
        options={Object.entries(WALL_PAINTS).map(([value, s]) => ({ value, label: s.label, color: s.color }))}
        onChange={(id) =>
          run(setRoomWallColor(project, floorId, room.id, id), `Paint ${room.name}`, {
            coalesceKey: `paint:${room.id}`,
          })
        }
      />
      <Swatches
        label="Floor"
        value={roomFloorMaterial(room)}
        options={Object.entries(FLOOR_MATERIALS).map(([value, s]) => ({ value, label: s.label, color: s.color }))}
        onChange={(id) =>
          run(setRoomFloorMaterial(project, floorId, room.id, id), `Change ${room.name} floor`, {
            coalesceKey: `floor:${room.id}`,
          })
        }
      />
      </Section>
    </div>
  );
}

/** One nudge: about a foot, so a few taps cross a room. */
const NUDGE = 30;

export function FurnitureInspector() {
  const editor = useEditor();
  const { project, selected, dispatch, unit } = editor;
  const item = selected?.furniture;
  const room = selected?.room;
  const floor = selected?.floor;
  const run = useFurnitureRun(floor?.id ?? "", room?.id ?? "");
  if (!item || !room || !floor) return null;
  const entry = furnitureCatalogItem(item.catalogId);
  const label = furnitureLabel(item);
  const nudge = (dx: number, dz: number) =>
    run(
      moveFurniture(project, floor.id, room.id, item.id, {
        x: item.x + dx,
        z: item.z + dz,
        rotation: item.rotation,
      }),
      `Move ${label.toLowerCase()}`,
    );
  const finishes =
    entry?.finishSlot && entry.finishes
      ? entry.finishes.map((f) => ({
          value: f,
          label: f[0].toUpperCase() + f.slice(1),
          color: FURNITURE_FINISHES[entry.finishSlot!][f] ?? "#ccc",
        }))
      : [];
  return (
    <div className="dh-inspector-body">
      <div className="dh-furniture-hero">
        <Thumb id={item.catalogId} label={label} />
        <p className="dh-note">
          {item.id.startsWith("auto:")
            ? "Placed automatically — change it and the room becomes yours to arrange."
            : `In ${room.name}`}
        </p>
      </div>
      <p className="dh-tip">
        <Icon.move size={16} aria-hidden />
        Drag it in the picture to move it — even into another room.
      </p>
      <div className="dh-nudge" role="group" aria-label="Move a little">
        <span>
          <strong>Move a little</strong>
          <small>{unit === "ft" ? "About 1 ft" : "30 cm"} each tap</small>
        </span>
        <div>
          <IconButton icon={Icon.left} label="Move left" onClick={() => nudge(-NUDGE, 0)} />
          <IconButton icon={Icon.up} label="Move back" onClick={() => nudge(0, -NUDGE)} />
          <IconButton icon={Icon.down} label="Move forward" onClick={() => nudge(0, NUDGE)} />
          <IconButton icon={Icon.right} label="Move right" onClick={() => nudge(NUDGE, 0)} />
        </div>
      </div>
      <div className="dh-cluster">
        <Button
          icon={Icon.rotate}
          onClick={() => run(rotateFurniture(project, floor.id, room.id, item.id, 1), `Turn ${label.toLowerCase()}`)}
        >
          Turn
        </Button>
        <Button
          icon={Icon.duplicate}
          onClick={() =>
            run(duplicateFurniture(project, floor.id, room.id, item.id), `Copy ${label.toLowerCase()}`, {
              notice: `Another ${label.toLowerCase()}!`,
            })
          }
        >
          Copy
        </Button>
      </div>
      {finishes.length > 0 && (
        <Swatches
          label="Colour"
          value={item.finish ?? entry?.defaultFinish ?? null}
          options={finishes}
          onChange={(finish) =>
            run(updateFurniture(project, floor.id, room.id, item.id, { finish }), `Recolour ${label.toLowerCase()}`)
          }
        />
      )}
      {floor.rooms.some((r) => r.id !== room.id && furnitureFitsRoom(item.catalogId, r.kind)) && (
        <Field label="Move to another room">
          <select
            aria-label="Move to another room"
            value=""
            onChange={(e) => {
              const to = floor.rooms.find((r) => r.id === e.target.value);
              if (!to) return;
              const result = moveFurniture(project, floor.id, room.id, item.id, {
                roomId: to.id,
                x: Math.round(to.bounds.w / 2 / 5) * 5,
                z: Math.round(to.bounds.d / 2 / 5) * 5,
                rotation: item.rotation,
              });
              editor.run(result, `Move ${label.toLowerCase()} to ${to.name}`, {
                select:
                  result.ok && result.focusId
                    ? { kind: "furniture", floorId: floor.id, roomId: to.id, id: result.focusId }
                    : undefined,
                quietError: true,
              });
            }}
          >
            <option value="">Choose a room</option>
            {floor.rooms
              .filter((r) => r.id !== room.id && furnitureFitsRoom(item.catalogId, r.kind))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({ROOM_META[r.kind].label})
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="dh-danger-zone dh-cluster">
        <Button
          variant="danger"
          icon={Icon.remove}
          onClick={() =>
            editor.run(removeFurniture(project, floor.id, room.id, item.id), `Remove ${label.toLowerCase()}`, {
              select: { kind: "room", floorId: floor.id, id: room.id },
              notice: `${label} removed. Undo brings it back.`,
            })
          }
        >
          Remove
        </Button>
        <Button
          variant="ghost"
          icon={Icon.left}
          onClick={() => dispatch({ type: "select", target: { kind: "room", floorId: floor.id, id: room.id } })}
        >
          Back to {room.name}
        </Button>
      </div>
    </div>
  );
}

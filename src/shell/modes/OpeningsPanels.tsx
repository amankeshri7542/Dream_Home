import { useState } from "react";
import { Dimension } from "../../components/Controls";
import { floorForGeometry } from "../../domain/core";
import {
  OPENING_KIND_LIST,
  OPENING_SPECS,
  openingLabel,
} from "../../domain/openings";
import {
  addOpening,
  listCompatibleWalls,
  moveOpening,
  removeOpening,
  resetOpenings,
  updateOpening,
  wallLabel,
} from "../../domain/openingCommands";
import { OPENING_CLASS, deriveWalls, touches } from "../../domain/walls";
import type { EditResult, OpeningKind, Room } from "../../domain/types";
import { length, unitLabel } from "../../domain/display";
import { useEditor } from "../../editor/EditorProvider";
import { Icon } from "../../ui/icons";
import { Button, Field, IconButton } from "../../ui/primitives";

export const OPENING_HINTS: Record<OpeningKind, string> = {
  door: "A classic swing door",
  "french-door": "Two glass doors that open wide",
  "sliding-door": "Glass panels that slide aside",
  archway: "An open arch between rooms",
  window: "A window with a sill",
  "picture-window": "A big window for the view",
};

function useOpeningRun() {
  const editor = useEditor();
  return (result: EditResult, label: string, floorId: string, notice?: string) => {
    const target =
      result.ok && result.focusId
        ? { kind: "opening" as const, floorId, id: result.focusId }
        : undefined;
    return editor.run(result, label, {
      select: target,
      quietError: true,
      ...(notice ? { notice } : {}),
    });
  };
}

/** Doors and windows on the walls around a room, plus quick ways to add more. */
export function RoomOpeningsPanel({ room, floorId }: { room: Room; floorId: string }) {
  const editor = useEditor();
  const { project, select, unit } = editor;
  const runOpening = useOpeningRun();
  const [kind, setKind] = useState<OpeningKind>("window");
  const geo = floorForGeometry(project, floorId);
  const walls = deriveWalls(geo, project.plot.road).filter((w) => touches(w, room.bounds));
  const openings = walls.flatMap((wall) =>
    wall.openings.map((o) => ({ o, wall, label: wallLabel(geo, wall, project.plot) })),
  );
  const add = () => {
    const candidates = listCompatibleWalls(project, floorId, kind).filter((c) => {
      const wall = walls.find((w) => w.id === c.wallId);
      return !!wall;
    });
    const name = openingLabel(kind);
    const best = candidates[0];
    if (!best) {
      // Walls full? Turn an existing window or door of the same family into
      // the one asked for, rather than saying no.
      const same = openings.find(
        ({ o }) => OPENING_CLASS[o.kind] === OPENING_CLASS[kind] && o.kind !== kind,
      );
      if (same) {
        const swapped = updateOpening(project, floorId, same.o.id, { kind });
        if (swapped.ok) {
          runOpening(
            swapped,
            `Change a ${openingLabel(same.o.kind).toLowerCase()} into a ${name.toLowerCase()}`,
            floorId,
            `No free wall left, so the ${openingLabel(same.o.kind).toLowerCase()} became a ${name.toLowerCase()}!`,
          );
          return;
        }
      }
      editor.notify(
        OPENING_CLASS[kind] === "window"
          ? `${room.name}’s outside walls already have all the windows that fit. Tap one to make it bigger or change its style.`
          : `There’s no free wall in ${room.name} for a ${name.toLowerCase()}. Try a narrower door.`,
        "info",
      );
      return;
    }
    runOpening(
      addOpening(
        project,
        floorId,
        kind,
        { axis: best.axis, line: best.line, center: best.center },
        // The wall may only fit the narrowest size of this kind.
        { width: best.width },
      ),
      `Add a ${name.toLowerCase()} to ${room.name}`,
      floorId,
      `${name} added!`,
    );
  };
  return (
    <div className="dh-inspector-body">
      <p className="dh-lead">
        Tap a door or window to slide it, resize it or change its style — or add a new one.
      </p>
      <div className="dh-opening-list" role="list" aria-label={`Doors and windows of ${room.name}`}>
        {openings.length === 0 && <p className="dh-note">No doors or windows yet.</p>}
        {openings.map(({ o, label }) => (
          <button
            key={o.id}
            type="button"
            role="listitem"
            className="dh-list-card"
            onClick={() => select({ kind: "opening", floorId, id: o.id }, "list")}
          >
            <span className={`dh-list-icon is-${OPENING_CLASS[o.kind]}`}>
              {OPENING_CLASS[o.kind] === "window" ? (
                <Icon.window size={18} aria-hidden />
              ) : (
                <Icon.openings size={18} aria-hidden />
              )}
            </span>
            <span>
              <strong>{openingLabel(o.kind)}</strong>
              <small>
                {label} · {length(o.width, unit)} {unitLabel(unit)}
              </small>
            </span>
            <Icon.right size={17} aria-hidden />
          </button>
        ))}
      </div>
      <fieldset className="dh-kind-grid">
        <legend>Add to {room.name}</legend>
        {OPENING_KIND_LIST.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            <strong>{openingLabel(k)}</strong>
            <small>{OPENING_HINTS[k]}</small>
          </button>
        ))}
      </fieldset>
      <Button variant="primary" icon={Icon.add} full onClick={add}>
        Add {openingLabel(kind).toLowerCase()}
      </Button>
    </div>
  );
}

export function OpeningInspector() {
  const editor = useEditor();
  const { project, selected, unit, dispatch } = editor;
  const runOpening = useOpeningRun();
  const opening = selected?.opening;
  const floor = selected?.floor;
  const wall = selected?.wall;
  if (!opening || !floor || !wall) return null;
  const spec = OPENING_SPECS[opening.kind];
  const isWindow = OPENING_CLASS[opening.kind] === "window";
  const isDoor = OPENING_CLASS[opening.kind] === "door";
  const update = (patch: Parameters<typeof updateOpening>[3], label: string) =>
    runOpening(updateOpening(project, floor.id, opening.id, patch), label, floor.id);
  const slide = (by: number) =>
    runOpening(
      moveOpening(project, floor.id, opening.id, {
        axis: opening.axis,
        line: opening.line,
        center: opening.center + by,
      }),
      `Slide ${openingLabel(opening.kind).toLowerCase()}`,
      floor.id,
    );
  const walls = listCompatibleWalls(project, floor.id, opening.kind);
  return (
    <div className="dh-inspector-body">
      {opening.auto && (
        <p className="dh-note">
          This one was placed automatically. Changing it makes this floor’s doors
          and windows yours to arrange.
        </p>
      )}
      <Field label="Style">
        <select
          aria-label="Opening style"
          value={opening.kind}
          onChange={(e) =>
            update({ kind: e.target.value as OpeningKind }, `Change to ${openingLabel(e.target.value as OpeningKind).toLowerCase()}`)
          }
        >
          {OPENING_KIND_LIST.map((k) => (
            <option key={k} value={k}>
              {openingLabel(k)}
            </option>
          ))}
        </select>
      </Field>
      <div className="dh-nudge" role="group" aria-label="Slide along the wall">
        <span>
          <strong>Slide along the wall</strong>
          <small>10 cm each tap</small>
        </span>
        <div>
          <IconButton icon={wall.axis === "x" ? Icon.left : Icon.up} label="Slide back" onClick={() => slide(-10)} />
          <IconButton icon={wall.axis === "x" ? Icon.right : Icon.down} label="Slide forward" onClick={() => slide(10)} />
        </div>
      </div>
      <div className="field-pair">
        <Dimension
          label="Width"
          cm={opening.width}
          unit={unit}
          language="en"
          min={spec.width.min}
          max={spec.width.max}
          stepper
          onChange={(width) => update({ width }, `Resize ${openingLabel(opening.kind).toLowerCase()}`)}
        />
        <Dimension
          label="Height"
          cm={opening.height}
          unit={unit}
          language="en"
          min={spec.height.min}
          max={spec.height.max}
          onChange={(height) => update({ height }, `Resize ${openingLabel(opening.kind).toLowerCase()}`)}
        />
      </div>
      {isWindow && (
        <Dimension
          label="Sill height"
          cm={opening.sill}
          unit={unit}
          language="en"
          min={spec.sill.min}
          max={spec.sill.max}
          onChange={(sill) => update({ sill }, "Change window sill")}
        />
      )}
      {walls.length > 1 && (
        <Field label="Move to another wall">
          <select
            aria-label="Move to another wall"
            value=""
            onChange={(e) => {
              const to = walls.find((w) => w.wallId === e.target.value);
              if (to)
                runOpening(
                  moveOpening(project, floor.id, opening.id, { axis: to.axis, line: to.line, center: to.center }),
                  `Move ${openingLabel(opening.kind).toLowerCase()}`,
                  floor.id,
                );
            }}
          >
            <option value="">Choose a wall</option>
            {walls
              .filter((w) => w.wallId !== wall.id)
              .map((w) => (
                <option key={w.wallId} value={w.wallId}>
                  {w.label}
                </option>
              ))}
          </select>
        </Field>
      )}
      {isDoor && (
        <Button
          icon={Icon.rotate}
          full
          onClick={() => update({ swing: opening.swing === 1 ? -1 : 1 }, "Flip door swing")}
        >
          Flip which way it opens
        </Button>
      )}
      <div className="dh-danger-zone dh-cluster">
        <Button
          variant="danger"
          icon={Icon.remove}
          onClick={() =>
            editor.run(removeOpening(project, floor.id, opening.id), `Remove ${openingLabel(opening.kind).toLowerCase()}`, {
              select: null,
              notice: `${openingLabel(opening.kind)} removed. Undo brings it back.`,
            })
          }
        >
          Remove
        </Button>
        {floor.openings && (
          <Button
            variant="ghost"
            icon={Icon.auto}
            onClick={() =>
              dispatch({
                type: "confirm",
                confirm: {
                  title: "Go back to automatic doors and windows?",
                  body: "Every door and window on this floor will be placed automatically again. Undo brings your arrangement back.",
                  confirmLabel: "Make them automatic",
                  action: `reset-openings:${floor.id}`,
                },
              })
            }
          >
            Make automatic again
          </Button>
        )}
      </div>
    </div>
  );
}

export function resetFloorOpenings(
  editor: ReturnType<typeof useEditor>,
  floorId: string,
) {
  editor.run(resetOpenings(editor.project, floorId), "Automatic doors and windows", {
    select: null,
    notice: "Doors and windows are automatic again.",
  });
}

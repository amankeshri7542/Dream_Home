import UnitEditor from "../../components/UnitEditor";
import { setFloorCount } from "../../domain/model";
import { planItems } from "../../domain/selection";
import { ROOM_META } from "../../domain/types";
import { floorName, length, unitLabel } from "../../domain/display";
import { useEditor } from "../../editor/EditorProvider";
import { targetFromPlanItem } from "../../editor/selection";
import { Icon, roomIcon } from "../../ui/icons";
import { Button, IconButton, Section } from "../../ui/primitives";

export function SpacesList() {
  const editor = useEditor();
  const { project, activeFloor, unit, run, dispatch, select } = editor;
  const items = planItems(project, activeFloor);
  return (
    <div className="dh-inspector-body">
      <p className="dh-lead">
        Tap a space to move it, resize it or change what it’s for.
        {project.floors.length > 1 &&
          ` Showing ${floorName(project.floors.indexOf(activeFloor)).toLowerCase()}.`}
      </p>
      <div className="room-list dh-room-list">
        {activeFloor.rooms.map((r) => {
          const Glyph = roomIcon(r.kind, r.name);
          return (
            <button
              className="room-card"
              key={r.id}
              type="button"
              onClick={() => select({ kind: "room", floorId: activeFloor.id, id: r.id }, "list")}
            >
              <span className="room-color" style={{ background: ROOM_META[r.kind].color }}>
                <Glyph size={18} aria-hidden />
              </span>
              <span>
                <strong>{r.name}</strong>
                <small>
                  {length(r.bounds.w, unit)} × {length(r.bounds.d, unit)} {unitLabel(unit)}
                  {r.unitId &&
                    project.units.length > 1 &&
                    ` · ${project.units.find((u) => u.id === r.unitId)?.name ?? ""}`}
                </small>
              </span>
              <Icon.right size={17} aria-hidden />
            </button>
          );
        })}
        {items
          .filter((item) => item.kind !== "room")
          .map((item) => (
            <button
              className="room-card"
              key={item.id}
              type="button"
              onClick={() => select(targetFromPlanItem(activeFloor.id, item), "list")}
            >
              <span className="room-color is-open-space">
                {item.kind === "stairs" ? (
                  <Icon.floors size={18} aria-hidden />
                ) : item.kind === "courtyard" ? (
                  <Icon.tree size={18} aria-hidden />
                ) : (
                  <Icon.day size={18} aria-hidden />
                )}
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {length(item.bounds.w, unit)} × {length(item.bounds.d, unit)} {unitLabel(unit)}
                </small>
              </span>
              <Icon.right size={17} aria-hidden />
            </button>
          ))}
      </div>
      <Button
        variant="primary"
        icon={Icon.add}
        full
        onClick={() => dispatch({ type: "open-panel", panel: "catalog" })}
      >
        Add a space
      </Button>
      <Section title="Floors" description={`${project.floors.length} of 8 floors`}>
        <div className="dh-stepper-row">
          <span>Total floors</span>
          <div>
            <IconButton
              icon={Icon.minus}
              tone="plain"
              label="Remove a floor"
              disabled={project.floors.length <= 1}
              onClick={() =>
                run(setFloorCount(project, project.floors.length - 1), "Remove top floor", {
                  quietError: true,
                })
              }
            />
            <strong className="dh-num">{project.floors.length}</strong>
            <IconButton
              icon={Icon.add}
              tone="plain"
              label="Add a floor"
              disabled={project.floors.length >= 8}
              onClick={() =>
                run(setFloorCount(project, project.floors.length + 1), "Add a floor", {
                  quietError: true,
                  notice: "New floor added. It starts as a copy of the floor below.",
                })
              }
            />
          </div>
        </div>
        <p className="dh-note">
          A new floor copies the top floor’s rooms and extends its stairs. Remove
          takes away the top floor; Undo brings it back.
        </p>
      </Section>
      <Section title="Groups & flats" description="Who owns which part of each floor">
        <UnitEditor project={project} floor={activeFloor} unit={unit} onApply={(r) => run(r, "Edit groups")} />
      </Section>
    </div>
  );
}

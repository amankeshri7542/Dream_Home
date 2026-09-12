import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Expand,
  Move,
  Trash2,
} from "lucide-react";
import { Dimension } from "./Controls";
import {
  removeBalcony,
  removeVerticalSpace,
  transformComponent,
  updateBalcony,
  updateVerticalSpace,
} from "../domain/model";
import type { EditResult, Floor, Project } from "../domain/types";
import type { PlanItem } from "../domain/selection";
import type { Unit } from "../domain/display";

export default function SpaceInspector({
  project,
  floor,
  item,
  unit,
  onApply,
  onTool,
  onRemove,
}: {
  project: Project;
  floor: Floor;
  item: PlanItem;
  unit: Unit;
  onApply: (result: EditResult) => boolean;
  onTool: (tool: "move" | "resize") => void;
  onRemove: () => void;
}) {
  const balcony = floor.balconies.find((part) => part.id === item.id);
  const vertical = project.verticalSpaces.find((part) => part.id === item.id);
  function changeBounds(patch: Partial<PlanItem["bounds"]>) {
    onApply(
      transformComponent(
        project,
        floor.id,
        item.id,
        { ...item.bounds, ...patch },
        "resize",
      ),
    );
  }
  return (
    <>
      <div className="room-quick-actions">
        <button onClick={() => onTool("move")}>
          <Move size={21} />
          Move {balcony ? "along an edge" : "space"}
        </button>
        <button onClick={() => onTool("resize")}>
          <Expand size={21} />
          Resize space
        </button>
      </div>
      {balcony ? (
        <>
          <p className="supporting">
            Choose a side, then slide along it. The balcony stays attached to
            your building.
          </p>
          <div className="edge-choices" role="group" aria-label="Balcony side">
            {(
              [
                ["south", "Front"],
                ["north", "Back"],
                ["west", "Left"],
                ["east", "Right"],
              ] as const
            ).map(([edge, label]) => (
              <button
                key={edge}
                aria-pressed={balcony.edge === edge}
                onClick={() =>
                  onApply(
                    updateBalcony(project, floor.id, balcony.id, { edge }),
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="field-pair">
            <Dimension
              label="Balcony width"
              cm={balcony.width}
              min={150}
              unit={unit}
              language="en"
              stepper
              onChange={(width) =>
                onApply(updateBalcony(project, floor.id, balcony.id, { width }))
              }
            />
            <Dimension
              label="Balcony depth"
              cm={balcony.depth}
              min={90}
              unit={unit}
              language="en"
              stepper
              onChange={(depth) =>
                onApply(updateBalcony(project, floor.id, balcony.id, { depth }))
              }
            />
          </div>
          <Dimension
            label="Position along this side"
            cm={balcony.offset}
            unit={unit}
            language="en"
            onChange={(offset) =>
              onApply(updateBalcony(project, floor.id, balcony.id, { offset }))
            }
          />
          <div className="room-quick-actions">
            <button
              onClick={() =>
                onApply(
                  updateBalcony(project, floor.id, balcony.id, {
                    offset: balcony.offset - 30,
                  }),
                )
              }
            >
              <ArrowLeft size={21} />
              Slide back
            </button>
            <button
              onClick={() =>
                onApply(
                  updateBalcony(project, floor.id, balcony.id, {
                    offset: balcony.offset + 30,
                  }),
                )
              }
            >
              Slide forward
              <ArrowRight size={21} />
            </button>
          </div>
          <p className="field-note">
            Front is the bottom edge of the plan. Back is the top. Your road can
            be on any side.
          </p>
        </>
      ) : (
        <>
          <p className="advice-note">
            This {item.name.toLowerCase()} is shared by{" "}
            {vertical?.floorIds.length}{" "}
            {vertical?.floorIds.length === 1 ? "floor" : "floors"}. Moving or
            resizing it updates every affected floor together.
          </p>
          <div className="field-pair">
            <Dimension
              label={`${item.name} width`}
              cm={item.bounds.w}
              min={120}
              unit={unit}
              language="en"
              stepper
              onChange={(w) => changeBounds({ w })}
            />
            <Dimension
              label={`${item.name} depth`}
              cm={item.bounds.d}
              min={120}
              unit={unit}
              language="en"
              stepper
              onChange={(d) => changeBounds({ d })}
            />
          </div>
          <div className="nudge-control">
            <span>
              <strong>Move a little</strong>
              <small>All connected floors stay aligned</small>
            </span>
            <div>
              {[
                { icon: ArrowLeft, x: -10, z: 0, label: "Move space left" },
                { icon: ArrowUp, x: 0, z: -10, label: "Move space back" },
                { icon: ArrowDown, x: 0, z: 10, label: "Move space forward" },
                { icon: ArrowRight, x: 10, z: 0, label: "Move space right" },
              ].map(({ icon: Icon, x, z, label }) => (
                <button
                  key={label}
                  aria-label={label}
                  onClick={() =>
                    changeBounds({ x: item.bounds.x + x, z: item.bounds.z + z })
                  }
                >
                  <Icon size={20} />
                </button>
              ))}
            </div>
          </div>
          <details className="plain-details">
            <summary>Position & connected floors</summary>
            <div className="field-pair">
              <Dimension
                label="Space from left edge"
                cm={item.bounds.x}
                unit={unit}
                language="en"
                onChange={(x) => changeBounds({ x })}
              />
              <Dimension
                label="Space from top edge"
                cm={item.bounds.z}
                unit={unit}
                language="en"
                onChange={(z) => changeBounds({ z })}
              />
            </div>
            {vertical && (
              <label className="select-label">
                Starts on
                <select
                  aria-label="Space starting floor"
                  value={vertical.floorIds[0]}
                  onChange={(event) => {
                    const start = project.floors.findIndex(
                      (f) => f.id === event.target.value,
                    );
                    onApply(
                      updateVerticalSpace(project, vertical.id, {
                        floorIds: project.floors.slice(start).map((f) => f.id),
                      }),
                    );
                  }}
                >
                  {project.floors.map((f, i) => (
                    <option key={f.id} value={f.id}>
                      {i === 0 ? "Ground floor" : `Floor ${i}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="field-note">
              The opening continues to the top floor. Move rooms aside on any
              blocked floor before moving this space.
            </p>
          </details>
        </>
      )}
      <button
        className="danger-link"
        onClick={() => {
          const result = balcony
            ? removeBalcony(project, floor.id, item.id)
            : removeVerticalSpace(project, item.id);
          if (onApply(result)) onRemove();
        }}
      >
        <Trash2 size={16} />
        Remove {item.name.toLowerCase()}
      </button>
    </>
  );
}

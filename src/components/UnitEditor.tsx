import { ChevronDown } from "lucide-react";
import { Dimension } from "./Controls";
import { renameUnit, updateUnitArea } from "../domain/model";
import type { EditResult, Floor, Project } from "../domain/types";
import type { Unit } from "../domain/display";

export default function UnitEditor({
  project,
  floor,
  unit,
  onApply,
}: {
  project: Project;
  floor: Floor;
  unit: Unit;
  onApply: (result: EditResult) => boolean;
}) {
  if (!floor.unitAreas.length) return null;
  return (
    <details className="plain-details unit-editor">
      <summary>
        Flats & shops on this floor <ChevronDown size={17} />
      </summary>
      <p className="field-note">
        Each group has its own area. The space between groups is shared. Move
        rooms inside their group before making its boundary smaller.
      </p>
      {floor.unitAreas.map((area) => {
        const owner = project.units.find((u) => u.id === area.unitId)!;
        const change = (patch: Partial<typeof area.bounds>) =>
          onApply(
            updateUnitArea(project, floor.id, owner.id, {
              ...area.bounds,
              ...patch,
            }),
          );
        return (
          <details className="unit-boundary" key={owner.id}>
            <summary>
              {owner.name}
              <span>
                {floor.rooms.filter((r) => r.unitId === owner.id).length} rooms
              </span>
            </summary>
            <label className="select-label">
              Group name
              <input
                key={`${owner.id}-${owner.name}`}
                aria-label={`Name for ${owner.name}`}
                defaultValue={owner.name}
                maxLength={60}
                onBlur={(event) => {
                  if (
                    !onApply(renameUnit(project, owner.id, event.target.value))
                  )
                    event.target.value = owner.name;
                }}
              />
            </label>
            <div className="field-pair">
              <Dimension
                label={`${owner.name} area width`}
                cm={area.bounds.w}
                min={120}
                unit={unit}
                language="en"
                onChange={(w) => change({ w })}
              />
              <Dimension
                label={`${owner.name} area depth`}
                cm={area.bounds.d}
                min={120}
                unit={unit}
                language="en"
                onChange={(d) => change({ d })}
              />
              <Dimension
                label={`${owner.name} from left`}
                cm={area.bounds.x}
                unit={unit}
                language="en"
                onChange={(x) => change({ x })}
              />
              <Dimension
                label={`${owner.name} from top`}
                cm={area.bounds.z}
                unit={unit}
                language="en"
                onChange={(z) => change({ z })}
              />
            </div>
          </details>
        );
      })}
    </details>
  );
}

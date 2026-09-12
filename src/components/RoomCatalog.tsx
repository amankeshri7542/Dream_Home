import { useMemo, useState } from "react";
import {
  BedDouble,
  Sofa,
  CookingPot,
  Bath,
  Utensils,
  WashingMachine,
  BookOpen,
  Flower2,
  UserRound,
  Plus,
  Expand,
} from "lucide-react";
import { ROOM_CATALOG, addCatalogRoom, type RoomSize } from "../domain/builder";
import type { Project } from "../domain/types";
import { length, unitLabel, type Unit } from "../domain/display";
import { DialogHeading } from "./Controls";
const icons = [
  BedDouble,
  Sofa,
  CookingPot,
  Bath,
  Utensils,
  WashingMachine,
  BookOpen,
  Flower2,
  UserRound,
];
export default function RoomCatalog({
  project,
  floorId,
  unit,
  onClose,
  onUse,
  onExpand,
}: {
  project: Project;
  floorId: string;
  unit: Unit;
  onClose: () => void;
  onUse: (project: Project, id: string) => void;
  onExpand: () => void;
}) {
  const [size, setSize] = useState<RoomSize>("regular");
  const [picked, setPicked] = useState(ROOM_CATALOG[0].id);
  const options = useMemo(
    () =>
      ROOM_CATALOG.map((item) => ({
        item,
        result: addCatalogRoom(project, floorId, item.id, size),
      })),
    [project, floorId, size],
  );
  const selected = options.find((option) => option.item.id === picked)!;
  const added = selected.result.ok
    ? selected.result.project.floors.find((f) => f.id === floorId)!.rooms.at(-1)
    : null;
  return (
    <>
      <DialogHeading
        title="What would you like to add?"
        language="en"
        onClose={onClose}
      />
      <div className="catalog-body">
        <p>
          Choose a room. We’ll find a clear place for it. You can move or resize
          it afterwards.
        </p>
        <div className="size-choices" aria-label="New room size">
          {(["small", "regular", "large"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={size === value}
              onClick={() => setSize(value)}
            >
              {value === "small"
                ? "Compact"
                : value === "regular"
                  ? "Regular"
                  : "Spacious"}
            </button>
          ))}
        </div>
        <div className="catalog-grid">
          {options.map(({ item, result }, i) => {
            const Icon = icons[i];
            return (
              <button
                key={item.id}
                className={`catalog-card ${picked === item.id ? "selected" : ""}`}
                aria-pressed={picked === item.id}
                onClick={() => setPicked(item.id)}
              >
                <Icon size={25} />
                <strong>{item.label}</strong>
                <small>{item.description}</small>
                <span className={result.ok ? "fits" : "needs-space"}>
                  {result.ok ? "Fits on this floor" : "Needs more room"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="catalog-footer">
        {added ? (
          <>
            <p>
              <strong>{selected.item.label}</strong> ·{" "}
              {length(added.bounds.w, unit)} × {length(added.bounds.d, unit)}{" "}
              {unitLabel(unit)}
            </p>
            <button
              className="primary-button"
              onClick={() => {
                if (selected.result.ok)
                  onUse(selected.result.project, added.id);
              }}
            >
              <Plus size={20} />
              Add {selected.item.label.toLowerCase()}
            </button>
          </>
        ) : (
          <>
            <p role="status">
              {selected.result.ok ? "" : selected.result.error}
            </p>
            <button className="secondary-button" onClick={onExpand}>
              <Expand size={20} />
              Adjust building area
            </button>
          </>
        )}
      </div>
    </>
  );
}

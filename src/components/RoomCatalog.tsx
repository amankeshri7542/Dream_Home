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
  Store,
  Sun,
  Footprints,
} from "lucide-react";
import { ROOM_CATALOG, addCatalogRoom, type RoomSize } from "../domain/builder";
import { suggestBalcony, suggestVerticalSpace } from "../domain/openSpaces";
import type { Project, EdgeSide } from "../domain/types";
import { length, unitLabel, type Unit } from "../domain/display";
import { DialogHeading } from "./Controls";
const icons = {
  bedroom: BedDouble,
  living: Sofa,
  kitchen: CookingPot,
  bathroom: Bath,
  dining: Utensils,
  utility: WashingMachine,
  study: BookOpen,
  prayer: Flower2,
  guest: UserRound,
  shop: Store,
};
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
  const floor = project.floors.find((f) => f.id === floorId)!;
  const [tab, setTab] = useState<"rooms" | "open">("rooms");
  const [owner, setOwner] = useState<string>(
    floor.unitAreas.length === 1 ? floor.unitAreas[0].unitId : "",
  );
  const [edge, setEdge] = useState<EdgeSide>(project.plot.road);
  const [space, setSpace] = useState<"balcony" | "courtyard" | "stairs">(
    "balcony",
  );
  const [size, setSize] = useState<RoomSize>("regular");
  const [picked, setPicked] = useState<(typeof ROOM_CATALOG)[number]["id"]>(
    floor.unitAreas.length > 0 &&
      floor.unitAreas.every(
        (area) =>
          project.units.find((u) => u.id === area.unitId)?.use === "commercial",
      )
      ? "shop"
      : "bedroom",
  );
  const options = useMemo(
    () =>
      ROOM_CATALOG.map((item) => ({
        item,
        result: addCatalogRoom(project, floorId, item.id, size, owner || null),
      })),
    [project, floorId, size, owner],
  );
  const selected = options.find((option) => option.item.id === picked)!;
  const added = selected.result.ok
    ? selected.result.project.floors.find((f) => f.id === floorId)!.rooms.at(-1)
    : null;
  const spaceSize =
    size === "small"
      ? { w: 180, d: 180 }
      : size === "large"
        ? { w: 360, d: 360 }
        : { w: 240, d: 300 };
  const spaceResult = useMemo(
    () =>
      tab === "open"
        ? space === "balcony"
          ? suggestBalcony(
              project,
              floorId,
              edge,
              size === "small" ? 180 : size === "large" ? 420 : 300,
              size === "small" ? 90 : size === "large" ? 180 : 120,
            )
          : suggestVerticalSpace(
              project,
              floorId,
              space,
              spaceSize.w,
              spaceSize.d,
              owner || null,
            )
        : null,
    [tab, space, project, floorId, edge, size, spaceSize.w, spaceSize.d, owner],
  );
  function useSpace() {
    if (!spaceResult?.ok) return;
    const next = spaceResult.project;
    const addedId =
      space === "balcony"
        ? next.floors.find((f) => f.id === floorId)!.balconies.at(-1)!.id
        : next.verticalSpaces.at(-1)!.id;
    onUse(next, addedId);
  }
  return (
    <>
      <DialogHeading
        title="What would you like to add?"
        language="en"
        onClose={onClose}
      />
      <div className="catalog-body">
        <div className="catalog-tabs" role="group" aria-label="Space category">
          <button
            aria-pressed={tab === "rooms"}
            onClick={() => setTab("rooms")}
          >
            Rooms
          </button>
          <button aria-pressed={tab === "open"} onClick={() => setTab("open")}>
            Balconies & open spaces
          </button>
        </div>
        <p>
          {tab === "rooms"
            ? "Choose a room. We’ll find a clear place for it. You can move or resize it afterwards."
            : "Add outdoor space or an opening through the building. Each one can be moved and resized."}
        </p>
        {floor.unitAreas.length > 0 && (
          <label className="select-label">
            Add to
            <select
              aria-label="Add space to group"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="">Shared space</option>
              {floor.unitAreas.map((area) => (
                <option key={area.unitId} value={area.unitId}>
                  {project.units.find((u) => u.id === area.unitId)!.name}
                </option>
              ))}
            </select>
          </label>
        )}
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
        {tab === "rooms" ? (
          <div className="catalog-grid">
            {options.map(({ item, result }) => {
              const Icon = icons[item.id];
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
        ) : (
          <>
            <div className="catalog-grid">
              {(
                [
                  {
                    id: "balcony",
                    name: floor.elevation > 0 ? "Balcony" : "Veranda",
                    icon: Sun,
                    description: "An outdoor space along any building edge.",
                  },
                  {
                    id: "courtyard",
                    name: "Courtyard",
                    icon: Flower2,
                    description:
                      "Open to the sky, aligned through upper floors.",
                  },
                  {
                    id: "stairs",
                    name: "Stairs",
                    icon: Footprints,
                    description: "A shared stair opening through upper floors.",
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  className={`catalog-card ${space === item.id ? "selected" : ""}`}
                  aria-pressed={space === item.id}
                  onClick={() => setSpace(item.id)}
                >
                  <item.icon size={25} />
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
            {space === "balcony" && (
              <div className="edge-choices" aria-label="New balcony side">
                {(
                  [
                    ["south", "Front"],
                    ["north", "Back"],
                    ["west", "Left"],
                    ["east", "Right"],
                  ] as const
                ).map(([side, name]) => (
                  <button
                    key={side}
                    aria-pressed={edge === side}
                    onClick={() => setEdge(side)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <p className="field-note">
              {space === "balcony"
                ? "Needs clear plot space beside your building. Ground-floor balconies become verandas."
                : "Uses one matching clear area from this floor to the top. Rooms on every affected floor must leave it clear."}
            </p>
          </>
        )}
      </div>
      <div className="catalog-footer">
        {tab === "open" ? (
          <>
            <p role="status">
              {spaceResult?.ok
                ? "Fits here. Move it or adjust the size after adding."
                : spaceResult && spaceResult.error}
            </p>
            <button
              className="primary-button"
              disabled={!spaceResult?.ok}
              onClick={useSpace}
            >
              <Plus size={20} />
              Add{" "}
              {space === "balcony" && floor.elevation === 0 ? "veranda" : space}
            </button>
          </>
        ) : (
          <>
            {added ? (
              <>
                <p>
                  <strong>{selected.item.label}</strong> ·{" "}
                  {length(added.bounds.w, unit)} ×{" "}
                  {length(added.bounds.d, unit)} {unitLabel(unit)}
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
          </>
        )}
      </div>
    </>
  );
}

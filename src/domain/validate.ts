// The single source of truth for project validity. Messages and their order are
// stable (they are user-facing and tested); structured fields add machine-readable
// sources, blockers and recovery hints for spatial feedback.
import { balconyBounds, deriveFloorVoids } from "./core";
import { contains, overlaps, rect, sameRect, validRect } from "./geometry";
import { makeIssue, type IssueExtra, type IssueSink } from "./issues";
import { LIMITS } from "./limits";
import { ROOM_META } from "./types";
import type { ComponentRef, EditIssue, Project, Room } from "./types";

export type ValidationExtension = (
  project: Project,
  issue: IssueSink,
  opts: { baseline?: Project },
) => void;
const extensions: ValidationExtension[] = [];
/** Feature modules (openings, furniture, landscape, materials) register checks here. */
export function registerValidation(check: ValidationExtension) {
  if (!extensions.includes(check)) extensions.push(check);
}

const sides = ["north", "south", "east", "west"];
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
export const validName = (name: string) =>
  typeof name === "string" && !!name.trim() && name.length <= 80;
export function validRoomPresentation(room: Room): boolean {
  return (
    (room.furnishingRotation === undefined ||
      [0, 90, 180, 270].includes(room.furnishingRotation)) &&
    (room.floorFinish === undefined ||
      ["auto", "wood", "tile", "stone"].includes(room.floorFinish)) &&
    (room.furnishing === undefined ||
      ["auto", "none"].includes(room.furnishing))
  );
}
const roomRef = (floorId: string, id: string): ComponentRef => ({
  kind: "room",
  id,
  floorId,
});

export function validateProjectIssues(
  project: Project,
  opts: { baseline?: Project } = {},
): EditIssue[] {
  const issues: EditIssue[] = [];
  const issue: IssueSink = (code, message, extra?: IssueExtra) =>
    issues.push(makeIssue(code, message, extra));
  const { plot } = project;
  if (project.schemaVersion !== 2)
    issue("schema", "This project must use schema version 2.");
  if (!validName(project.name))
    issue("name", "Project names must contain 1–80 characters.");
  if (
    project.finish !== undefined &&
    !["ivory", "brick", "sand"].includes(project.finish)
  )
    issue("finish", "Choose an ivory, brick or sand exterior finish.");
  if (
    ![plot.width, plot.depth].every(
      (n) => Number.isInteger(n) && n >= 400 && n <= 10000,
    )
  )
    issue("plot", "Plot dimensions must be 4–100 m, in whole centimetres.");
  if (
    !Number.isInteger(plot.setback) ||
    plot.setback < 0 ||
    plot.setback > 2000 ||
    plot.setback % 10 !== 0
  )
    issue("plot", "Setback must be 0–20 m, in 0.1 m steps.");
  if (!Number.isFinite(plot.north) || plot.north < 0 || plot.north >= 360)
    issue("plot", "Orientation must be between 0 and 359 degrees.");
  if (!sides.includes(plot.road))
    issue("plot", "Choose a valid road-facing side.");
  if (project.floors.length < 1 || project.floors.length > LIMITS.floors)
    issue("limit", "Choose one to eight floors.");
  if (project.units.length > LIMITS.units)
    issue("limit", "This building supports up to 64 units.");
  if (project.verticalSpaces.length > LIMITS.verticalSpaces)
    issue("limit", "This building supports up to 8 vertical spaces.");
  if ((project.stagedRooms?.length ?? 0) > LIMITS.stagedRooms)
    issue("limit", "The room tray holds up to 48 rooms.");
  const envelope = rect(
    plot.setback,
    plot.setback,
    plot.width - 2 * plot.setback,
    plot.depth - 2 * plot.setback,
  );
  const ids = new Set<string>(),
    unitIds = new Set(project.units.map((u) => u.id));
  const checkId = (id: string) => {
    if (typeof id !== "string" || !ID.test(id) || ids.has(id))
      issue("duplicate-id", "Every component must have a unique, valid ID.");
    ids.add(id);
  };
  for (const { room, sourceFloorId } of project.stagedRooms ?? []) {
    checkId(room.id);
    const source: ComponentRef = { kind: "staged", id: room.id };
    if (
      !Object.keys(ROOM_META).includes(room.kind) ||
      !validName(room.name) ||
      !validRect(room.bounds, 120)
    )
      issue(
        "staged",
        "A room in the tray needs a valid name, type and dimensions.",
        { source },
      );
    if (typeof sourceFloorId !== "string" || !ID.test(sourceFloorId))
      issue("staged", "A room in the tray needs a valid original floor ID.", {
        source,
      });
    if (
      room.unitId !== null &&
      (typeof room.unitId !== "string" || !ID.test(room.unitId))
    )
      issue("staged", "A room in the tray needs a valid original unit ID.", {
        source,
      });
    if (!validRoomPresentation(room))
      issue(
        "presentation",
        "Choose a valid room finish and furnishing setting.",
        { source },
      );
  }
  for (const unit of project.units) {
    checkId(unit.id);
    if (
      !validName(unit.name) ||
      !["residential", "commercial"].includes(unit.use)
    )
      issue(
        "unit",
        "Every unit needs a name and a residential or commercial use.",
        { source: { kind: "unit", id: unit.id } },
      );
  }
  for (const [index, floor] of project.floors.entries()) {
    checkId(floor.id);
    const floorIds = [floor.id];
    if (!validName(floor.name))
      issue("name", "Every floor needs a valid name.", { floorIds });
    if (floor.height !== 300 || floor.elevation !== index * 300)
      issue(
        "storey",
        "Floors must use aligned 3 m storeys, starting at ground level.",
        { floorIds },
      );
    if (!validRect(floor.footprint, 400) || !contains(envelope, floor.footprint))
      issue(
        "footprint",
        "The home must fit inside the plot setbacks. Increase the plot or reduce the setback.",
        { floorIds, attempted: floor.footprint },
      );
    if (index && !sameRect(floor.footprint, project.floors[0].footprint))
      issue("footprint", "Floor footprints must stay aligned in this version.", {
        floorIds,
      });
    if (floor.rooms.length > LIMITS.roomsPerFloor)
      issue("limit", "Each floor supports up to 48 rooms.", { floorIds });
    if (floor.balconies.length > LIMITS.balconiesPerFloor)
      issue("limit", "Each floor supports up to 4 balconies.", { floorIds });
    if (floor.unitAreas.length > LIMITS.units)
      issue("limit", "A floor has too many unit areas.", { floorIds });
    const localUnits = new Set<string>();
    for (const [i, area] of floor.unitAreas.entries()) {
      const source: ComponentRef = {
        kind: "unit",
        id: area.unitId,
        floorId: floor.id,
      };
      if (!unitIds.has(area.unitId) || localUnits.has(area.unitId))
        issue(
          "unit-area",
          "Each unit can have one valid area on each floor.",
          { source, floorIds },
        );
      localUnits.add(area.unitId);
      if (!validRect(area.bounds, 120) || !contains(floor.footprint, area.bounds))
        issue("unit-area", "Unit areas must fit inside their floor boundary.", {
          source,
          floorIds,
          attempted: area.bounds,
        });
      const others = floor.unitAreas
        .slice(i + 1)
        .filter((a) => overlaps(area.bounds, a.bounds));
      if (others.length)
        issue("unit-area", "Unit areas cannot overlap.", {
          source,
          floorIds,
          blockers: others.map((a) => ({
            kind: "unit",
            id: a.unitId,
            floorId: floor.id,
          })),
        });
    }
    const voids = deriveFloorVoids(project, floor.id);
    for (const [i, room] of floor.rooms.entries()) {
      checkId(room.id);
      const source = roomRef(floor.id, room.id);
      if (!Object.keys(ROOM_META).includes(room.kind))
        issue("room-kind", "Unknown room type.", { source, floorIds });
      if (!validName(room.name))
        issue("name", "Room names must contain 1–80 characters.", {
          source,
          floorIds,
        });
      if (!validRoomPresentation(room))
        issue(
          "presentation",
          "Choose a valid room finish and furnishing setting.",
          { source, floorIds },
        );
      if (!validRect(room.bounds, 120))
        issue(
          "room-size",
          "Rooms need dimensions of at least 1.2 m, in 0.1 m steps.",
          { source, floorIds, attempted: room.bounds },
        );
      if (!contains(floor.footprint, room.bounds))
        issue(
          "room-outside-floor",
          `${room.name} must stay inside the floor boundary.`,
          {
            source,
            floorIds,
            attempted: room.bounds,
            fixes: [{ kind: "edit", target: source, focus: "move" }],
          },
        );
      const overlapping = floor.rooms
        .slice(i + 1)
        .filter((r) => overlaps(room.bounds, r.bounds));
      if (overlapping.length)
        issue(
          "room-overlap",
          `${room.name} and ${overlapping[0].name} would overlap. Leave space before moving or resizing.`,
          {
            source,
            floorIds,
            attempted: room.bounds,
            blockers: overlapping.map((r) => roomRef(floor.id, r.id)),
          },
        );
      const voidBlockers = voids.filter((v) => overlaps(room.bounds, v.bounds));
      if (voidBlockers.length)
        issue(
          "room-in-void",
          `${room.name} overlaps the courtyard or stair opening.`,
          {
            source,
            floorIds,
            attempted: room.bounds,
            blockers: voidBlockers.map((v) => ({
              kind: "vertical",
              id: v.id,
              floorId: floor.id,
            })),
          },
        );
      if (room.unitId === null) {
        const areas = floor.unitAreas.filter((a) =>
          overlaps(a.bounds, room.bounds),
        );
        if (areas.length)
          issue(
            "room-in-private-unit",
            `${room.name} is shared space and cannot overlap a private unit.`,
            {
              source,
              floorIds,
              attempted: room.bounds,
              blockers: areas.map((a) => ({
                kind: "unit",
                id: a.unitId,
                floorId: floor.id,
              })),
            },
          );
      } else {
        const area = floor.unitAreas.find((a) => a.unitId === room.unitId);
        if (
          !unitIds.has(room.unitId) ||
          !area ||
          !contains(area.bounds, room.bounds)
        )
          issue(
            "room-outside-unit",
            `${room.name} must stay inside its assigned unit.`,
            { source, floorIds, attempted: room.bounds },
          );
      }
    }
    for (const [i, b] of floor.balconies.entries()) {
      checkId(b.id);
      const source: ComponentRef = {
        kind: "balcony",
        id: b.id,
        floorId: floor.id,
      };
      const span =
        b.edge === "north" || b.edge === "south"
          ? floor.footprint.w
          : floor.footprint.d;
      if (
        !sides.includes(b.edge) ||
        ![b.offset, b.width, b.depth].every(
          (n) => Number.isFinite(n) && Number.isInteger(n) && n % 10 === 0,
        ) ||
        b.offset < 0 ||
        b.width < 150 ||
        b.depth < 90 ||
        b.offset + b.width > span
      )
        issue(
          "balcony-shape",
          "A balcony must fit its edge, with at least 1.5 m width and 0.9 m depth.",
          { source, floorIds },
        );
      const bounds = balconyBounds(floor, b);
      if (!contains(envelope, bounds))
        issue(
          "balcony-setback",
          "The balcony must fit inside the plot setbacks. Increase the plot or reduce its depth.",
          { source, floorIds, attempted: bounds },
        );
      const others = floor.balconies
        .slice(i + 1)
        .filter((other) => overlaps(bounds, balconyBounds(floor, other)));
      if (others.length)
        issue("balcony-overlap", "Balconies on the same floor cannot overlap.", {
          source,
          floorIds,
          attempted: bounds,
          blockers: others.map((o) => ({
            kind: "balcony",
            id: o.id,
            floorId: floor.id,
          })),
        });
    }
  }
  const floorIds = project.floors.map((f) => f.id);
  for (const [i, space] of project.verticalSpaces.entries()) {
    checkId(space.id);
    const source: ComponentRef = { kind: "vertical", id: space.id };
    if (
      !["courtyard", "stairs"].includes(space.kind) ||
      !validRect(space.bounds, 120)
    )
      issue(
        "vertical-shape",
        "Vertical spaces need valid dimensions on the planning grid.",
        { source },
      );
    const indices = space.floorIds.map((id) => floorIds.indexOf(id));
    if (
      !indices.length ||
      indices.some((n) => n < 0) ||
      new Set(indices).size !== indices.length ||
      indices.some((n, j) => j > 0 && n !== indices[j - 1] + 1)
    )
      issue(
        "vertical-floors",
        "Vertical spaces must serve an ordered, contiguous set of floors.",
        { source },
      );
    if (space.kind === "courtyard" && indices.at(-1) !== floorIds.length - 1)
      issue("courtyard-roof", "An open-to-sky courtyard must reach the top floor.", {
        source,
      });
    if (space.unitId !== null && !unitIds.has(space.unitId))
      issue("vertical-unit", "A vertical space refers to an unknown unit.", {
        source,
      });
    for (const floor of project.floors.filter((f) =>
      space.floorIds.includes(f.id),
    )) {
      if (!contains(floor.footprint, space.bounds))
        issue(
          "vertical-outside",
          "The courtyard or staircase must fit inside every connected floor.",
          { source, floorIds: [floor.id], attempted: space.bounds },
        );
      if (space.unitId === null) {
        const areas = floor.unitAreas.filter((a) =>
          overlaps(a.bounds, space.bounds),
        );
        if (areas.length)
          issue(
            "vertical-unit",
            "Shared stairs and courtyards cannot overlap private unit areas.",
            {
              source,
              floorIds: [floor.id],
              attempted: space.bounds,
              blockers: areas.map((a) => ({
                kind: "unit",
                id: a.unitId,
                floorId: floor.id,
              })),
            },
          );
      } else {
        const area = floor.unitAreas.find((a) => a.unitId === space.unitId);
        if (!area || !contains(area.bounds, space.bounds))
          issue(
            "vertical-unit",
            "A private vertical space must stay inside its unit on every connected floor.",
            { source, floorIds: [floor.id], attempted: space.bounds },
          );
      }
    }
    const others = project.verticalSpaces
      .slice(i + 1)
      .filter(
        (v) =>
          v.floorIds.some((id) => space.floorIds.includes(id)) &&
          overlaps(v.bounds, space.bounds),
      );
    if (others.length)
      issue(
        "vertical-overlap",
        "Vertical spaces on the same floor cannot overlap.",
        {
          source,
          attempted: space.bounds,
          blockers: others.map((o) => ({ kind: "vertical", id: o.id })),
        },
      );
  }
  for (let i = 1; i < floorIds.length; i++)
    if (
      !project.verticalSpaces.some(
        (v) =>
          v.kind === "stairs" &&
          v.floorIds.includes(floorIds[i - 1]) &&
          v.floorIds.includes(floorIds[i]),
      )
    )
      issue(
        "stairs-missing",
        "Every pair of adjacent floors needs an aligned stair connection.",
        { floorIds: [floorIds[i - 1], floorIds[i]] },
      );
  for (const check of extensions) check(project, issue, opts);
  return issues;
}

/** Legacy string API: the de-duplicated error messages, in order. */
export function validateProject(project: Project): string[] {
  return [
    ...new Set(
      validateProjectIssues(project)
        .filter((i) => i.severity === "error")
        .map((i) => i.message),
    ),
  ];
}

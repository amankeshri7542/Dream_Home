import { addBalcony, addVerticalSpace } from "./model";
import type { EditResult, EdgeSide, Project, Rect } from "./types";

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
const contains = (a: Rect, b: Rect) =>
  b.x >= a.x && b.z >= a.z && b.x + b.w <= a.x + a.w && b.z + b.d <= a.z + a.d;

export function suggestBalcony(
  project: Project,
  floorId: string,
  edge: EdgeSide,
  width: number,
  depth: number,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Choose a floor first." };
  const horizontal = edge === "north" || edge === "south";
  const span = horizontal ? floor.footprint.w : floor.footprint.d;
  const offsets = [
    Math.round((span - width) / 20) * 10,
    0,
    ...floor.balconies
      .filter((b) => b.edge === edge)
      .flatMap((b) => [b.offset + b.width, b.offset - width]),
  ];
  let error =
    "There is no clear space on this side. Try another side or a smaller balcony.";
  for (const offset of offsets) {
    const result = addBalcony(project, floorId, { edge, offset, width, depth });
    if (result.ok) return result;
    error = result.error;
  }
  return { ok: false, error };
}

export function suggestVerticalSpace(
  project: Project,
  floorId: string,
  kind: "courtyard" | "stairs",
  w: number,
  d: number,
  unitId: string | null,
): EditResult {
  const start = project.floors.findIndex((f) => f.id === floorId);
  const floors = project.floors.slice(Math.max(0, start));
  if (start < 0) return { ok: false, error: "Choose a floor first." };
  const obstacles = floors.flatMap((f) => [
    ...f.rooms.map((room) => room.bounds),
    ...project.verticalSpaces
      .filter((space) => space.floorIds.includes(f.id))
      .map((space) => space.bounds),
  ]);
  const areas = floors.map((f) =>
    unitId ? f.unitAreas.find((a) => a.unitId === unitId)?.bounds : f.footprint,
  );
  if (areas.some((area) => !area))
    return {
      ok: false,
      error:
        "This group does not continue on every upper floor. Choose Shared space, or add the opening on its top floor.",
    };
  const snap = (n: number) => Math.ceil(n / 10) * 10;
  const xs = [
    ...new Set([
      ...areas.map((a) => snap(a!.x)),
      ...obstacles.map((b) => snap(b.x + b.w)),
    ]),
  ].sort((a, b) => a - b);
  const zs = [
    ...new Set([
      ...areas.map((a) => snap(a!.z)),
      ...obstacles.map((b) => snap(b.z + b.d)),
    ]),
  ].sort((a, b) => a - b);
  let error = `No clear place for ${kind === "courtyard" ? "a courtyard" : "stairs"} across these floors. Move rooms aside to leave a matching clear area on each floor, or choose a smaller size.`;
  for (const z of zs)
    for (const x of xs) {
      const bounds = { x, z, w, d };
      if (
        !areas.every((area) => contains(area!, bounds)) ||
        obstacles.some((b) => overlaps(b, bounds))
      )
        continue;
      const result = addVerticalSpace(project, {
        kind,
        bounds,
        floorIds: floors.map((f) => f.id),
        unitId,
      });
      if (result.ok) return result;
      error = result.error;
    }
  return { ok: false, error };
}

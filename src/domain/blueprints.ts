import type { EditResult, Project, Rect, RoomKind } from "./types";
import { validateProject } from "./model";
import { createStarter } from "./starters";

export type BlueprintKind =
  "home" | "apartments" | "market" | "mixed" | "blank";
export type HomeFlavor = "bungalow" | "villa" | "duplex";
export type BlueprintRequest = {
  widthCm: number;
  depthCm: number;
  marginCm: number;
  road: Project["plot"]["road"];
  north?: number;
  kind: BlueprintKind;
  flavor?: HomeFlavor;
  floors: number;
  bedrooms: number;
  unitsPerFloor: number;
  bedroomsPerUnit: number;
  shopsPerFloor: number;
  courtyard?: boolean;
};
export const BLUEPRINTS: Array<{
  id: BlueprintKind;
  name: string;
  description: string;
}> = [
  {
    id: "home",
    name: "Home",
    description: "One household, with rooms across your floors.",
  },
  {
    id: "apartments",
    name: "Apartments",
    description: "Separate flats around a shared entrance and stairs.",
  },
  {
    id: "market",
    name: "Shops & market",
    description: "Shops with shared access on each floor.",
  },
  {
    id: "mixed",
    name: "Shop + home",
    description: "Shops below, homes above. All in one building.",
  },
  {
    id: "blank",
    name: "Blank building",
    description: "An open outline, ready for your own arrangement.",
  },
];
const down = (n: number) => Math.floor(n / 10) * 10;
const box = (x: number, z: number, w: number, d: number): Rect => ({
  x,
  z,
  w,
  d,
});
type Need = { kind: RoomKind; name: string; minimum: number };
const bedroom = (n: number): Need => ({
  kind: "bedroom",
  name: `Bedroom ${n}`,
  minimum: 270,
});
function homeNeeds(beds: number, complete: boolean): Need[] {
  return [
    ...(complete
      ? [
          { kind: "living" as const, name: "Living / dining", minimum: 280 },
          { kind: "kitchen" as const, name: "Kitchen", minimum: 200 },
        ]
      : []),
    ...Array.from({ length: beds }, (_, i) => bedroom(i + 1)),
    { kind: "bathroom", name: "Bathroom", minimum: 150 },
  ];
}
/** Partition a unit into rooms beside a continuous private passage. */
function packRooms(
  area: Rect,
  needs: Need[],
): Array<{ need: Need; bounds: Rect }> | null {
  if (!needs.length) return [];
  // Try both orientations and one/two room banks. Rank compact, usable rooms,
  // never silently remove a requested room to make the layout fit.
  for (const rotated of [false, true]) {
    const width = rotated ? area.d : area.w;
    const depth = rotated ? area.w : area.d;
    for (const banks of [2, 1]) {
      const passage = 100;
      const bankWidth = down((width - passage) / banks);
      if (bankWidth < Math.max(...needs.map((n) => n.minimum))) continue;
      const rows = Math.ceil(needs.length / banks);
      const rowDepth = down(depth / rows);
      if (rowDepth < Math.max(...needs.map((n) => n.minimum))) continue;
      return needs.map((need, index) => {
        const column = index % banks,
          row = Math.floor(index / banks);
        const x = banks === 2 && column === 1 ? bankWidth + passage : 0;
        const bounds = rotated
          ? box(area.x + row * rowDepth, area.z + x, rowDepth, bankWidth)
          : box(area.x + x, area.z + row * rowDepth, bankWidth, rowDepth);
        return { need, bounds };
      });
    }
  }
  return null;
}

export function createBlueprint(request: BlueprintRequest): EditResult {
  const { widthCm, depthCm, marginCm, road, kind, floors } = request;
  const count = (n: number, low: number, high: number) =>
    Number.isInteger(n) && n >= low && n <= high;
  if (
    !count(widthCm, 400, 10000) ||
    !count(depthCm, 400, 10000) ||
    !count(marginCm, 0, 2000) ||
    marginCm % 10 !== 0 ||
    !count(floors, 1, 8) ||
    !BLUEPRINTS.some((b) => b.id === kind) ||
    !["south", "north", "east", "west"].includes(road) ||
    !count(request.north ?? 0, 0, 359) ||
    !count(request.bedrooms, 0, 12) ||
    !count(request.unitsPerFloor, 1, 4) ||
    !count(request.bedroomsPerUnit, 1, 4) ||
    !count(request.shopsPerFloor, 1, 8)
  )
    return {
      ok: false,
      error:
        "Choose a valid plot, 1–8 floors and counts within the shown ranges.",
    };
  if (
    kind === "home" &&
    request.bedrooms >= 1 &&
    request.bedrooms <= 3 &&
    floors <= 2
  ) {
    const result = createStarter(
      {
        ...request,
        bedrooms: request.bedrooms as 1 | 2 | 3,
        floors: floors as 1 | 2,
      },
      request.courtyard
        ? "courtyard"
        : request.flavor === "villa"
          ? "open"
          : "family",
    );
    if (result.ok) result.project.plot.north = request.north ?? 0;
    return result;
  }
  const horizontal = road === "south" || road === "north";
  const availableWidth = down((horizontal ? widthCm : depthCm) - 2 * marginCm);
  const availableDepth = down((horizontal ? depthCm : widthCm) - 2 * marginCm);
  const frontage =
    kind === "home" ? Math.min(1000, availableWidth) : availableWidth;
  const homeBanks = frontage >= 660 ? 2 : 1;
  const homeRows = Math.ceil(
    (Math.ceil(request.bedrooms / floors) + 3) / homeBanks,
  );
  const homeDepth =
    homeRows * 330 + (floors > 1 || request.courtyard ? 340 : 0);
  const depth =
    kind === "home"
      ? Math.min(3000, availableDepth, homeDepth)
      : availableDepth;
  if (frontage < 300 || depth < 300)
    return {
      ok: false,
      error:
        "The open margin leaves too little building space. Increase the plot or reduce the sketch margin.",
    };
  const transform = (r: Rect): Rect =>
    road === "north"
      ? box(marginCm + r.x, marginCm + r.z, r.w, r.d)
      : road === "south"
        ? box(marginCm + r.x, marginCm + depth - r.z - r.d, r.w, r.d)
        : road === "west"
          ? box(marginCm + r.z, marginCm + r.x, r.d, r.w)
          : box(marginCm + depth - r.z - r.d, marginCm + r.x, r.d, r.w);
  const project: Project = {
    schemaVersion: 2,
    name:
      kind === "home"
        ? "Our Family Home"
        : kind === "apartments"
          ? "Our Apartment Building"
          : kind === "market"
            ? "Our Market Building"
            : kind === "mixed"
              ? "Our Shops & Homes"
              : "Our Blank Building",
    plot: {
      width: widthCm,
      depth: depthCm,
      setback: marginCm,
      road,
      north: request.north ?? 0,
    },
    floors: [],
    units: [],
    verticalSpaces: [],
    garden: request.flavor === "villa",
    parking: false,
  };
  const floorIds = Array.from({ length: floors }, (_, i) => `floor-${i}`);
  const coreDepth = floors > 1 || request.courtyard ? 340 : 0;
  const privateCore = kind === "home";
  if (privateCore)
    project.units.push({ id: "home", name: "Our home", use: "residential" });
  if (floors > 1)
    project.verticalSpaces.push({
      id: "main-stairs",
      kind: "stairs",
      bounds: transform(box(0, 0, 220, 340)),
      floorIds,
      unitId: privateCore ? "home" : null,
    });
  if (request.courtyard)
    project.verticalSpaces.push({
      id: "main-courtyard",
      kind: "courtyard",
      bounds: transform(box(floors > 1 ? 240 : 0, 0, 200, 200)),
      floorIds,
      unitId: privateCore ? "home" : null,
    });
  const fail = (details: string): EditResult => ({
    ok: false,
    error: `This arrangement cannot fit ${details} on this plot. Try a larger plot, a smaller sketch margin, or change the requested counts. Your counts have not been reduced.`,
  });
  if (
    coreDepth &&
    (depth < coreDepth + 300 ||
      frontage < (request.courtyard && floors > 1 ? 540 : 320))
  )
    return fail("the shared stairs and open space");
  let bedroomNumber = 0;
  for (let i = 0; i < floors; i++) {
    const floor: Project["floors"][number] = {
      id: floorIds[i],
      name: i === 0 ? "Ground floor" : `Floor ${i}`,
      elevation: i * 300,
      height: 300,
      footprint: transform(box(0, 0, frontage, depth)),
      rooms: [],
      unitAreas: [],
      balconies: [],
    };
    project.floors.push(floor);
    const insert = (unitId: string, area: Rect, needs: Need[]) => {
      const packed = packRooms(area, needs);
      if (!packed) return false;
      for (const { need, bounds } of packed)
        floor.rooms.push({
          id: `${floor.id}-${unitId}-room-${floor.rooms.length + 1}`,
          unitId,
          name:
            need.kind === "bedroom" && kind === "home"
              ? `Bedroom ${++bedroomNumber}`
              : need.name,
          kind: need.kind,
          bounds: transform(bounds),
        });
      return true;
    };
    if (kind === "blank") continue;
    if (kind === "home") {
      floor.unitAreas.push({ unitId: "home", bounds: { ...floor.footprint } });
      const beds =
        Math.floor(request.bedrooms / floors) +
        (i < request.bedrooms % floors ? 1 : 0);
      const needs = homeNeeds(beds, i === 0);
      if (i > 0 && !beds)
        needs.unshift({ kind: "living", name: "Family lounge", minimum: 270 });
      if (
        !insert("home", box(0, coreDepth, frontage, depth - coreDepth), needs)
      )
        return fail(`${request.bedrooms} bedrooms on ${floors} floors`);
      continue;
    }
    const residentialFloor =
      kind === "apartments" || (kind === "mixed" && i > 0);
    const countUnits = residentialFloor
      ? request.unitsPerFloor
      : request.shopsPerFloor + (kind === "mixed" && floors === 1 ? 1 : 0);
    const corridor = 120;
    const banks = countUnits > 1 ? 2 : 1;
    const rows = Math.ceil(countUnits / banks);
    const unitWidth = down((frontage - corridor) / banks);
    const unitDepth = down((depth - coreDepth) / rows);
    if (unitWidth < 180 || unitDepth < 200)
      return fail(`${countUnits} units on ${floor.name.toLowerCase()}`);
    for (let n = 0; n < countUnits; n++) {
      const isHome =
        residentialFloor ||
        (kind === "mixed" && floors === 1 && n === countUnits - 1);
      const id = `${floor.id}-${isHome ? "flat" : "shop"}-${n + 1}`;
      const name = `${isHome ? "Flat" : "Shop"} ${n + 1}`;
      const area = box(
        n % banks === 1 ? unitWidth + corridor : 0,
        coreDepth + Math.floor(n / banks) * unitDepth,
        unitWidth,
        unitDepth,
      );
      project.units.push({
        id,
        name,
        use: isHome ? "residential" : "commercial",
      });
      floor.unitAreas.push({ unitId: id, bounds: transform(area) });
      if (isHome) {
        if (!insert(id, area, homeNeeds(request.bedroomsPerUnit, true)))
          return fail(
            kind === "mixed" && floors === 1
              ? `one home with ${request.bedroomsPerUnit} bedrooms beside ${request.shopsPerFloor} shops`
              : `${request.unitsPerFloor} flats with ${request.bedroomsPerUnit} bedrooms each on ${floor.name.toLowerCase()}`,
          );
      } else
        floor.rooms.push({
          id: `${id}-space`,
          unitId: id,
          name,
          kind: "shop",
          bounds: transform(area),
        });
    }
  }
  const errors = validateProject(project);
  return errors.length
    ? fail(errors[0].replace(/\.$/, ""))
    : { ok: true, project };
}

export function recommendBlueprints(request: BlueprintRequest): Array<{
  id: string;
  name: string;
  project: Project | null;
  reason: string;
}> {
  const variants = [
    {
      id: "balanced",
      name: request.courtyard
        ? "Around an open courtyard"
        : "An everyday arrangement",
      extra: 0,
    },
    { id: "open", name: "More open land", extra: 100 },
  ];
  return variants.map((variant) => {
    // Reserve extra land by increasing the explicit preview margin; shown in
    // the resulting model and editable afterward. Program counts stay exact.
    const result = createBlueprint({
      ...request,
      marginCm: request.marginCm + variant.extra,
    });
    return {
      id: variant.id,
      name: variant.name,
      project: result.ok ? result.project : null,
      reason: result.ok
        ? variant.extra
          ? "The same rooms and units, with an extra metre of open margin on every side."
          : "Your chosen floors, rooms and units, with clear shared access."
        : result.error,
    };
  });
}

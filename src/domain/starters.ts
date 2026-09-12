import { validateProject } from "./model";
import type {
  EditResult,
  Floor as CanonicalFloor,
  Project,
  Rect,
  Room as CanonicalRoom,
  RoomKind,
  Void,
} from "./types";

type Room = Omit<CanonicalRoom, "unitId">;
type Floor = Omit<CanonicalFloor, "unitAreas" | "balconies" | "rooms"> & {
  rooms: Room[];
  voids: Void[];
  balcony: boolean;
};
type LegacyProject = Omit<
  Project,
  "schemaVersion" | "floors" | "units" | "verticalSpaces"
> & { schemaVersion: 1; floors: Floor[] };
function canonicalHome(old: LegacyProject): Project {
  const verticalSpaces: Project["verticalSpaces"] = [];
  for (const floor of old.floors)
    for (const space of floor.voids) {
      const match = verticalSpaces.find(
        (v) =>
          v.kind === space.kind &&
          JSON.stringify(v.bounds) === JSON.stringify(space.bounds),
      );
      if (match) match.floorIds.push(floor.id);
      else
        verticalSpaces.push({ ...space, unitId: "home", floorIds: [floor.id] });
    }
  return {
    ...old,
    schemaVersion: 2,
    units: [{ id: "home", name: "Our home", use: "residential" }],
    verticalSpaces,
    floors: old.floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      elevation: floor.elevation,
      height: floor.height,
      footprint: { ...floor.footprint },
      rooms: floor.rooms.map((room) => ({ ...room, unitId: "home" })),
      unitAreas: [{ unitId: "home", bounds: { ...floor.footprint } }],
      balconies: [],
    })),
  };
}
export type HomeStyle = "family" | "courtyard" | "open";
export type StarterRequest = {
  widthCm: number;
  depthCm: number;
  road: Project["plot"]["road"];
  marginCm: number;
  bedrooms: 1 | 2 | 3;
  floors: 1 | 2;
};

const down = (n: number) => Math.floor(n / 10) * 10;
const STYLES: HomeStyle[] = ["family", "courtyard", "open"];
const rect = (x: number, z: number, w: number, d: number): Rect => ({
  x,
  z,
  w,
  d,
});

/** A small deterministic arrangement generator, not a building-code/layout solver. */
export function createStarter(
  request: StarterRequest,
  style: HomeStyle,
): EditResult {
  const { widthCm, depthCm, road, marginCm, bedrooms, floors } = request;
  if (
    !STYLES.includes(style) ||
    ![1, 2, 3].includes(bedrooms) ||
    ![1, 2].includes(floors) ||
    !["south", "north", "east", "west"].includes(road)
  )
    return {
      ok: false,
      error:
        "Choose a valid home style, bedroom count, floor count and road side.",
    };
  if (
    ![widthCm, depthCm].every(
      (n) => Number.isInteger(n) && n >= 400 && n <= 10000,
    ) ||
    !Number.isInteger(marginCm) ||
    marginCm < 0 ||
    marginCm > 2000 ||
    marginCm % 10 !== 0
  )
    return {
      ok: false,
      error:
        "Use plot dimensions between 4 and 100 m and a planning margin in 10 cm steps.",
    };

  const horizontal = road === "south" || road === "north";
  const frontStrip = style === "open" ? 240 : 0;
  const availableFrontage = down(
    (horizontal ? widthCm : depthCm) - 2 * marginCm,
  );
  const availableRun = down((horizontal ? depthCm : widthCm) - 2 * marginCm);
  // Larger plots should leave real outdoor space rather than stretch a bedroom
  // across tens of metres. The same bounded arrangement serves every plot.
  const frontage = Math.min(1000, availableFrontage);
  // Reserve a continuous side passage. These target sizes are sketch choices,
  // intentionally stronger than the free editor's generic geometry minimum.
  const passage = 100;
  const roomWidth = frontage - passage;
  const fitError = `This ${style === "courtyard" ? "courtyard" : style === "open" ? "front-yard" : "family"} arrangement cannot fit ${bedrooms} bedroom${bedrooms > 1 ? "s" : ""} on ${floors} floor${floors > 1 ? "s" : ""} inside your plot and planning margin. Try fewer bedrooms, a larger plot or another style.`;
  if (frontage < 400 || availableRun < 400 || roomWidth < 390)
    return { ok: false, error: fitError };

  const multilevel = floors === 2;
  const columns = roomWidth >= 560 ? 2 : 1;
  const groundBeds = floors === 1 ? bedrooms : 1;
  const upperBeds = bedrooms - groundBeds;
  const rearRows = Math.max(
    Math.ceil(groundBeds / columns),
    Math.ceil(Math.max(0, upperBeds - columns) / columns),
  );
  const courtDepth = style === "courtyard" ? 200 : 0;
  let livingDepth = 260;
  let kitchenDepth = multilevel ? 220 : 0;
  let serviceDepth = multilevel ? 340 : 240;
  let bedroomDepth = 270;
  const usedDepth = () =>
    livingDepth +
    kitchenDepth +
    serviceDepth +
    courtDepth +
    rearRows * bedroomDepth;
  const generousDepth =
    380 +
    (multilevel ? 280 : 0) +
    (multilevel ? 340 : 280) +
    courtDepth +
    rearRows * 400;
  // First choose useful indoor dimensions; do not fill the plot with an empty
  // slab. The open style trades a further 2.4 m of depth for its front yard.
  const depthBudget = Math.min(1700, availableRun, generousDepth) - frontStrip;
  if (depthBudget < usedDepth()) return { ok: false, error: fitError };
  let grew = true;
  while (grew) {
    grew = false;
    if (livingDepth < 380 && usedDepth() + 10 <= depthBudget) {
      livingDepth += 10;
      grew = true;
    }
    if (bedroomDepth < 400 && usedDepth() + 10 * rearRows <= depthBudget) {
      bedroomDepth += 10;
      grew = true;
    }
    if (!multilevel && serviceDepth < 280 && usedDepth() + 10 <= depthBudget) {
      serviceDepth += 10;
      grew = true;
    }
    if (multilevel && kitchenDepth < 280 && usedDepth() + 10 <= depthBudget) {
      kitchenDepth += 10;
      grew = true;
    }
  }
  const run = usedDepth();

  const footprint = horizontal
    ? rect(
        marginCm,
        marginCm + (road === "north" ? frontStrip : 0),
        frontage,
        run,
      )
    : rect(
        marginCm + (road === "west" ? frontStrip : 0),
        marginCm,
        run,
        frontage,
      );
  // Local coordinates are frontage u and distance v inward from the road.
  const transform = (r: Rect): Rect => {
    if (road === "north")
      return rect(footprint.x + r.x, footprint.z + r.z, r.w, r.d);
    if (road === "south")
      return rect(footprint.x + r.x, footprint.z + run - r.z - r.d, r.w, r.d);
    if (road === "west")
      return rect(footprint.x + r.z, footprint.z + r.x, r.d, r.w);
    return rect(footprint.x + run - r.z - r.d, footprint.z + r.x, r.d, r.w);
  };

  const serviceStart = livingDepth + kitchenDepth;
  const courtyardStart = serviceStart + serviceDepth;
  const rearStart = courtyardStart + (style === "courtyard" ? 200 : 0);
  const bedroomWidth = down(roomWidth / columns);
  const generated: Floor[] = [];
  let bedroomNumber = 0;

  for (let index = 0; index < floors; index++) {
    const id = `floor-${index}`;
    const rooms: Room[] = [];
    const voids: Void[] = [];
    const add = (key: string, name: string, kind: RoomKind, bounds: Rect) =>
      rooms.push({ id: `${id}-${key}`, name, kind, bounds: transform(bounds) });
    const floorBeds = index === 0 ? groundBeds : bedrooms - groundBeds;
    if (index === 0) {
      add(
        "living",
        "Living / dining",
        "living",
        rect(0, 0, roomWidth, livingDepth),
      );
      if (multilevel)
        add(
          "kitchen",
          "Kitchen",
          "kitchen",
          rect(0, livingDepth, roomWidth, kitchenDepth),
        );
      else
        add(
          "kitchen",
          "Kitchen",
          "kitchen",
          rect(0, serviceStart, roomWidth - 170, serviceDepth),
        );
    } else if (!floorBeds) {
      add(
        "lounge",
        "Family lounge",
        "living",
        rect(0, 0, roomWidth, livingDepth),
      );
    }
    if (multilevel) {
      voids.push({
        id: `${id}-stairs`,
        kind: "stairs",
        bounds: transform(rect(0, serviceStart, 220, serviceDepth)),
      });
      add(
        "bathroom",
        "Bathroom",
        "bathroom",
        rect(220, serviceStart, Math.min(220, roomWidth - 220), 180),
      );
    } else {
      add(
        "bathroom",
        "Bathroom",
        "bathroom",
        rect(roomWidth - 170, serviceStart, 170, serviceDepth),
      );
    }
    if (style === "courtyard") {
      const courtyardWidth = 300;
      voids.push({
        id: `${id}-courtyard`,
        kind: "courtyard",
        bounds: transform(
          rect(
            down((roomWidth - courtyardWidth) / 2),
            courtyardStart,
            courtyardWidth,
            200,
          ),
        ),
      });
    }
    // Upper bedrooms use the front band first; shafts stay aligned with ground.
    const frontBeds = index > 0 ? Math.min(columns, floorBeds) : 0;
    for (let i = 0; i < floorBeds; i++) {
      const isFront = i < frontBeds;
      const slot = isFront ? i : i - frontBeds;
      const z = isFront
        ? 0
        : rearStart + Math.floor(slot / columns) * bedroomDepth;
      const x = (slot % columns) * bedroomWidth;
      bedroomNumber++;
      add(
        `bedroom-${bedroomNumber}`,
        `Bedroom ${bedroomNumber}`,
        "bedroom",
        rect(x, z, bedroomWidth, bedroomDepth),
      );
    }
    // Check local extents before rotation; negative transformed coordinates must
    // never turn an overfull request into a seemingly valid alternative layout.
    const occupied = [
      ...rooms.map((r) => r.bounds),
      ...voids.map((v) => v.bounds),
    ];
    if (
      occupied.some(
        (r) =>
          r.x < footprint.x ||
          r.z < footprint.z ||
          r.x + r.w > footprint.x + footprint.w ||
          r.z + r.d > footprint.z + footprint.d,
      )
    )
      return { ok: false, error: fitError };
    generated.push({
      id,
      name: index ? "First floor" : "Ground floor",
      elevation: index * 300,
      height: 300,
      footprint: { ...footprint },
      rooms,
      voids,
      balcony: false,
    });
  }
  const legacy: LegacyProject = {
    schemaVersion: 1,
    name:
      style === "courtyard"
        ? "Our Courtyard Home"
        : style === "open"
          ? "Our Home with a Front Yard"
          : "Our Family Home",
    plot: { width: widthCm, depth: depthCm, north: 0, road, setback: marginCm },
    floors: generated,
    garden: style === "open",
    parking: false,
  };
  const project = canonicalHome(legacy);
  const errors = validateProject(project);
  return errors.length ? { ok: false, error: fitError } : { ok: true, project };
}

export function recommendHomes(
  request: StarterRequest,
): Array<{ id: HomeStyle; project: Project | null; reason: string }> {
  return STYLES.map((id) => {
    const result = createStarter(request, id);
    return result.ok
      ? {
          id,
          project: result.project,
          reason:
            id === "courtyard"
              ? "Matches your room and floor choices, with an aligned open-to-sky courtyard."
              : id === "open"
                ? "Matches your room and floor choices, with additional open space at the road-facing front."
                : "Matches your room and floor choices, with a bedroom on the ground floor and a simple shared passage.",
        }
      : { id, project: null, reason: result.error };
  });
}

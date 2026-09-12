import type { Rect, PresetId } from "./types";
import type { LegacyFloor, LegacyRoom, LegacyProjectV1 } from "./migration";
const rect = (x: number, z: number, w: number, d: number): Rect => ({
  x,
  z,
  w,
  d,
});
function makeFloor(
  index: number,
  footprint: Rect,
  courtyard: boolean,
): LegacyFloor {
  const id = `floor-${index}`;
  const { x, z, w, d } = footprint;
  const rooms: LegacyRoom[] =
    w >= 1200
      ? [
          {
            id: `${id}-living`,
            name: index ? "Bedroom 2" : "Living room",
            kind: index ? "bedroom" : "living",
            bounds: rect(x, z, 450, 470),
          },
          {
            id: `${id}-kitchen`,
            name: index ? "Studio" : "Kitchen",
            kind: index ? "utility" : "kitchen",
            bounds: rect(x + w - 400, z, 400, 360),
          },
          {
            id: `${id}-dining`,
            name: index ? "Family lounge" : "Dining room",
            kind: index ? "living" : "dining",
            bounds: rect(x + w - 400, z + 400, 400, 430),
          },
          {
            id: `${id}-bedroom`,
            name: index ? "Bedroom 3" : "Bedroom 1",
            kind: "bedroom",
            bounds: rect(x, z + d - 530, 470, 530),
          },
          {
            id: `${id}-bathroom`,
            name: "Bathroom",
            kind: "bathroom",
            bounds: rect(x, z + 530, 280, 280),
          },
        ]
      : [
          {
            id: `${id}-living`,
            name: index ? "Bedroom 2" : "Living room",
            kind: index ? "bedroom" : "living",
            bounds: rect(x, z, 400, 380),
          },
          {
            id: `${id}-kitchen`,
            name: "Kitchen",
            kind: "kitchen",
            bounds: rect(x + w - 300, z, 300, 320),
          },
          {
            id: `${id}-bedroom`,
            name: "Bedroom 1",
            kind: "bedroom",
            bounds: rect(x, z + d - 400, 400, 400),
          },
          {
            id: `${id}-bathroom`,
            name: "Bathroom",
            kind: "bathroom",
            bounds: rect(x + w - 240, z + 370, 240, 240),
          },
        ];
  return {
    id,
    name:
      index === 0
        ? "Ground floor"
        : `${index === 1 ? "First" : "Second"} floor`,
    elevation: index * 300,
    height: 300,
    footprint: { ...footprint },
    rooms,
    voids: [
      ...(courtyard
        ? [
            {
              id: `${id}-courtyard`,
              kind: "courtyard" as const,
              bounds: rect(x + 480, z + 530, 240, 320),
            },
          ]
        : []),
      {
        id: `${id}-stairs`,
        kind: "stairs",
        bounds: rect(x + w - 260, z + d - 400, 260, 400),
      },
    ],
    balcony: index > 0,
  };
}

export function createLegacyPreset(id: PresetId): LegacyProjectV1 {
  const compact = id === "compact";
  const footprint = compact
    ? rect(250, 450, 900, 1100)
    : rect(300, 500, 1200, 1400);
  return {
    schemaVersion: 1,
    name:
      id === "courtyard"
        ? "The Courtyard House"
        : compact
          ? "A Little Sanctuary"
          : "Room to Grow",
    plot: {
      width: compact ? 1400 : 1800,
      depth: compact ? 1900 : 2400,
      north: 0,
      road: "south",
      setback: 200,
    },
    floors: Array.from({ length: compact ? 1 : 2 }, (_, i) =>
      makeFloor(i, footprint, id === "courtyard"),
    ),
    garden: true,
    parking: true,
  };
}

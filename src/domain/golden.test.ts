import { describe, expect, it } from "vitest";
import { corpus } from "./__fixtures__/corpus";
import { deriveWalls, floorForGeometry } from "./model";
import { roomDetails } from "./roomDetails";
import type { Wall } from "./types";

// Golden behaviour captured before the multi-opening wall refactor. Automatic
// openings, wall topology and derived furnishings must stay byte-for-byte stable.
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function openingSummary(wall: Wall) {
  const start = wall.axis === "x" ? wall.x : wall.z;
  return wall.openings.map((o) => ({
    kind: o.kind,
    width: o.width,
    sill: o.sill,
    height: o.height,
    center: start + o.offset,
  }));
}
describe("golden derived geometry", () => {
  for (const { name, project } of corpus())
    it(`keeps ${name} walls, openings and furnishings stable`, () => {
      const summary = project.floors.map((floor) => {
        const walls = deriveWalls(
          floorForGeometry(project, floor.id),
          project.plot.road,
        );
        return {
          floor: floor.id,
          walls: walls.map((w) => ({
            id: w.id,
            exterior: w.exterior,
            openings: openingSummary(w),
          })),
          // Part ownership (ownerId) was added after capture; geometry is hashed.
          furnishings: hash(
            JSON.stringify(
              floor.rooms.map((room) =>
                roomDetails(room, walls).map(({ ownerId, ...part }) => {
                  void ownerId;
                  return part;
                }),
              ),
            ),
          ),
        };
      });
      expect(summary).toMatchSnapshot();
    });
});

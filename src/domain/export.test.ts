import { describe, expect, it } from "vitest";
import { buildPlanSvg } from "./export";
import {
  balconyBounds,
  createPreset,
  deriveWalls,
  floorForGeometry,
  projectStats,
} from "./model";
import { length } from "./display";

describe("one-floor family and architect image", () => {
  it("escapes imported project, unit, room names and IDs as XML", () => {
    const project = createPreset("compact");
    project.name = 'Home <script> & "family"';
    project.floors[0].rooms[0].name = '<img onerror="x">&';
    project.floors[0].rooms[0].id = 'room" onload="x';
    project.units[0].name = '<script>alert("unit")</script>';
    const svg = buildPlanSvg(project, "ft");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img");
    expect(svg).toContain("Home &lt;script&gt; &amp; &quot;family&quot;");
    expect(svg).toContain("&lt;img onerror=&quot;x&quot;&gt;&amp;");
    expect(svg).toContain('data-room="room&quot; onload=&quot;x"');
    expect(svg).toContain(
      "&lt;script&gt;alert(&quot;unit&quot;)&lt;/script&gt;",
    );
  });
  it("shows plot dimensions, units, road and building totals on every selected page", () => {
    const project = createPreset("family");
    project.plot.road = "east";
    project.plot.north = 90;
    const svg = buildPlanSvg(project, "ft", project.floors[1].id);
    expect(svg).toContain(`${length(project.plot.width, "ft")} ft</text>`);
    expect(svg).toContain(`${length(project.plot.depth, "ft")} ft</text>`);
    expect(svg).toContain('data-dimension="depth"');
    expect(svg).toContain('data-road="east"');
    expect(svg).toContain("Road side: Right");
    expect(svg).toContain("North 90°");
    expect(svg).toContain(`${projectStats(project).bedrooms} bedrooms`);
    expect(svg).toContain(`${project.floors.length} floors`);
    expect(svg).toContain('data-floor="1"');
    expect(svg).not.toContain('data-floor="0"');
    const metric = buildPlanSvg(project, "m");
    expect(metric).toContain(`${length(project.plot.depth, "m")} m</text>`);
    expect(metric).toContain("not a verified legal setback");
    expect(() => buildPlanSvg(project, "ft", "missing-floor")).toThrow();
  });
  it("bounds each of eight 48-room pages and preserves long names without footer overlap", () => {
    const project = createPreset("family"),
      first = project.floors[0];
    project.units = Array.from({ length: 64 }, (_, i) => ({
      id: `unit-${i}`,
      name: `Home ${i}: ${"Long family name ".repeat(5)}`.slice(0, 80),
      use: "residential" as const,
    }));
    project.floors = Array.from({ length: 8 }, (_, floorIndex) => ({
      ...structuredClone(first),
      id: `floor-${floorIndex}`,
      elevation: floorIndex * 300,
      unitAreas: project.units.map((unit) => ({
        unitId: unit.id,
        bounds: { ...first.footprint },
      })),
      rooms: Array.from({ length: 48 }, (_, i) => ({
        ...structuredClone(first.rooms[0]),
        id: `room-${floorIndex}-${i}`,
        unitId: `unit-${i}`,
        name: `Room ${floorIndex}-${i}: ${"Full room name without truncation ".repeat(3)}`.slice(
          0,
          80,
        ),
      })),
    }));
    project.verticalSpaces = [];
    for (const [floorIndex, floor] of project.floors.entries()) {
      const svg = buildPlanSvg(project, "ft", floor.id);
      expect([...svg.matchAll(/data-floor="\d+"/g)]).toHaveLength(1);
      expect([...svg.matchAll(/data-room="/g)]).toHaveLength(48);
      for (const room of floor.rooms) {
        const group = svg.match(
          new RegExp(`<g data-room="${room.id}">(.*?)</g>`),
        )![1];
        const names = [
          ...group.matchAll(
            /<text data-room-name="true" x="\d+" y="(\d+)"[^>]*>(.*?)<\/text>/g,
          ),
        ];
        expect(names.map((match) => match[2]).join("")).toBe(room.name);
        const noteY = Number(
          svg.match(
            new RegExp(`data-floor-note="${floorIndex}" x="54" y="(\\d+)"`),
          )![1],
        );
        expect(Number(names.at(-1)![1]) + 21).toBeLessThan(noteY);
      }
      const height = Number(svg.match(/^<svg[^>]*height="(\d+)"/)![1]);
      const footerY = Number(
        svg.match(/data-footer="true" x="54" y="(\d+)"/)![1],
      );
      const endY = Number(svg.match(/data-end="(\d+)"/)![1]);
      expect(footerY).toBeGreaterThan(endY);
      expect(footerY + 16).toBeLessThan(height);
      expect(height).toBeLessThan(6000);
      expect(1200 * height).toBeLessThan(6_000_000);
      expect(svg).toContain(project.units[63].name);
    }
  });
  it("renders all balcony edges, unit outlines and only vertical spaces serving the selected floor", () => {
    const project = createPreset("family"),
      floor = project.floors[1];
    project.plot.road = "east";
    floor.balconies = ["south", "east", "north", "west"].map((edge, i) => ({
      id: `balcony-${i}`,
      edge: edge as "south" | "east" | "north" | "west",
      offset: 100,
      width: 200,
      depth: 90,
    }));
    const svg = buildPlanSvg(project, "m", floor.id);
    for (const balcony of floor.balconies) {
      const bounds = balconyBounds(floor, balcony);
      expect(svg).toContain(
        `data-balcony="${balcony.id}" x="${bounds.x}" y="${bounds.z}" width="${bounds.w}" height="${bounds.d}"`,
      );
    }
    for (const area of floor.unitAreas)
      expect(svg).toContain(`data-unit="${area.unitId}"`);
    for (const space of project.verticalSpaces)
      expect(svg.includes(`data-vertical-space="${space.id}"`)).toBe(
        space.floorIds.includes(floor.id),
      );
    const geometryFloor = floorForGeometry(project, floor.id);
    for (const kind of ["door", "window"]) {
      const expected = deriveWalls(geometryFloor, project.plot.road).filter(
        (wall) => wall.opening?.kind === kind,
      ).length;
      expect([
        ...svg.matchAll(new RegExp(`data-opening="${kind}"`, "g")),
      ]).toHaveLength(expected);
    }
  });
});

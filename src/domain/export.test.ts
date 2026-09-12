import { describe, expect, it } from "vitest";
import { buildPlanSvg } from "./export";
import {
  balconyBounds,
  createPreset,
  deriveWalls,
  projectStats,
} from "./model";
import { length } from "./display";

describe("family and architect plan image", () => {
  it("escapes imported project, room names and IDs as XML", () => {
    const project = createPreset("compact");
    project.name = 'Home <script> & "family"';
    project.floors[0].rooms[0].name = '<img onerror="x">&';
    project.floors[0].rooms[0].id = 'room" onload="x';
    const svg = buildPlanSvg(project, "ft");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img");
    expect(svg).toContain("Home &lt;script&gt; &amp; &quot;family&quot;");
    expect(svg).toContain("&lt;img onerror=&quot;x&quot;&gt;&amp;");
    expect(svg).toContain('data-room="room&quot; onload=&quot;x"');
  });

  it("shows both plot dimensions, selected units, road position and total rooms/floors", () => {
    const project = createPreset("family");
    project.plot.road = "east";
    project.plot.north = 90;
    const svg = buildPlanSvg(project, "ft");
    expect(svg).toContain(`${length(project.plot.width, "ft")} ft</text>`);
    expect(svg).toContain(`${length(project.plot.depth, "ft")} ft</text>`);
    expect(svg).toContain('data-dimension="depth"');
    expect(svg).toContain('data-road="east"');
    expect(svg).toContain("Road side: Right");
    expect(svg).toContain("North 90°");
    expect(svg).toContain(`rotate(90)`);
    expect(svg).toContain(`${projectStats(project).bedrooms} bedrooms`);
    expect(svg).toContain(`${project.floors.length} floors`);
    const metric = buildPlanSvg(project, "m");
    expect(metric).toContain(`${length(project.plot.depth, "m")} m</text>`);
    expect(metric).toContain("not a verified legal setback");
  });

  it("keeps 24 full room names per floor and all notes/footer inside separate panels", () => {
    const project = createPreset("family");
    const floor = project.floors[0];
    project.floors = Array.from({ length: 3 }, (_, floorIndex) => ({
      ...structuredClone(floor),
      id: `floor-${floorIndex}`,
      rooms: Array.from({ length: 24 }, (_, i) => ({
        ...structuredClone(floor.rooms[0]),
        id: `room-${floorIndex}-${i}`,
        name: `Room ${floorIndex}-${i}: ${"Full room name without truncation ".repeat(2)}`.slice(
          0,
          80,
        ),
      })),
    }));
    const svg = buildPlanSvg(project, "ft");
    const panels = [
      ...svg.matchAll(
        /data-floor="(\d+)" data-start="(\d+)" data-end="(\d+)"/g,
      ),
    ];
    expect(panels).toHaveLength(3);
    project.floors.forEach((f, floorIndex) => {
      f.rooms.forEach((room) => {
        const group = svg.match(
          new RegExp(`<g data-room="${room.id}">(.*?)</g>`),
        )![1];
        const names = [
          ...group.matchAll(
            /<text x="768" y="(\d+)" font-size="17"[^>]*>(.*?)<\/text>/g,
          ),
        ];
        expect(names.map((match) => match[2]).join("")).toBe(room.name);
        const lastNameY = Number(names.at(-1)![1]);
        const noteY = Number(
          svg.match(
            new RegExp(`data-floor-note="${floorIndex}" x="54" y="(\\d+)"`),
          )![1],
        );
        expect(lastNameY + 20).toBeLessThan(noteY);
      });
      if (floorIndex > 0)
        expect(Number(panels[floorIndex][2])).toBeGreaterThanOrEqual(
          Number(panels[floorIndex - 1][3]),
        );
    });
    const height = Number(svg.match(/^<svg[^>]*height="(\d+)"/)![1]);
    const footerY = Number(
      svg.match(/data-footer="true" x="54" y="(\d+)"/)![1],
    );
    expect(footerY).toBeGreaterThan(Number(panels[2][3]));
    expect(footerY + 16).toBeLessThan(height);
    expect(1200 * height).toBeLessThan(12_000_000);
  });

  it("renders shared balcony geometry and the same wall openings as the scene", () => {
    const project = createPreset("family");
    project.plot.road = "east";
    project.floors[1].balcony = true;
    const bounds = balconyBounds(project.floors[1]);
    const svg = buildPlanSvg(project, "m");
    expect(svg).toContain(
      `data-balcony="true" x="${bounds.x}" y="${bounds.z}" width="${bounds.w}" height="${bounds.d}"`,
    );
    for (const kind of ["door", "window"]) {
      const expected = project.floors
        .flatMap((floor, index) =>
          deriveWalls(floor, index === 0 ? project.plot.road : "south"),
        )
        .filter((wall) => wall.opening?.kind === kind).length;
      expect([
        ...svg.matchAll(new RegExp(`data-opening="${kind}"`, "g")),
      ]).toHaveLength(expected);
    }
  });
});

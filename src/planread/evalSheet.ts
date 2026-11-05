// A builder-style plan drawing of a home's ground floor, for `npm run planeval`
// only. The home it's drawn from is the exact truth, so a reading of the sheet
// can be scored without drawing anything by hand. Clean sheets flatter any
// reader: they're a smoke test, never a replacement for real photographed plans.
import { balconyBounds, floorForGeometry } from "../domain/core";
import { deriveWalls, isWindow, wallStart, wallThicknessCm } from "../domain/walls";
import type { Project, Room } from "../domain/types";

const HINDI: [RegExp, string][] = [
  [/pooja/i, "पूजा"],
  [/kitchen/i, "रसोई"],
  [/bath|toilet/i, "शौचालय"],
  [/dining/i, "भोजन"],
  [/living|lounge|hall/i, "बैठक"],
  [/store|utility/i, "स्टोर"],
  [/bed|kids|guest/i, "शयन कक्ष"],
];
const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 1234 cm → 40'6", to the nearest inch, as builders write it. */
export function feetInches(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
const roomLabel = (room: Room, hindi: boolean) =>
  hindi ? (HINDI.find(([pattern]) => pattern.test(room.name))?.[1] ?? room.name) : room.name.toUpperCase();

const PX = 1.3; // px per cm
const MARGIN = 170;

/** The sheet as an SVG string, and its size in pixels. */
export function planSheetSvg(project: Project, options: { hindi?: boolean; dimensions?: boolean } = {}): { svg: string; width: number; height: number } {
  const hindi = !!options.hindi,
    dimensions = options.dimensions !== false;
  const floor = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  const fp = floor.footprint;
  const X = (v: number) => MARGIN + (v - fp.x) * PX,
    Y = (v: number) => MARGIN + (v - fp.z) * PX;
  const width = Math.round(fp.w * PX + MARGIN * 2),
    height = Math.round(fp.d * PX + MARGIN * 2);
  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, w: number) =>
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#111" stroke-width="${w}"/>`);
  const text = (x: number, y: number, s: string, size: number, extra = "") =>
    out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" text-anchor="middle" fill="#111" ${extra}>${escapeXml(s)}</text>`);

  // Walls with gaps for their openings; door leaves with their swing arcs; window sills.
  const walls = deriveWalls(floorForGeometry(project, floor.id), project.plot.road);
  for (const wall of walls) {
    const start = wallStart(wall);
    const at = (along: number): [number, number] => (wall.axis === "x" ? [X(along), Y(wall.z)] : [X(wall.x), Y(along)]);
    const thick = wallThicknessCm(wall) * PX;
    const gaps = [...wall.openings].sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    for (const o of gaps) {
      const a = o.offset - o.width / 2,
        b = o.offset + o.width / 2;
      if (a > cursor) line(...at(start + cursor), ...at(start + a), thick);
      cursor = Math.max(cursor, b);
      const [x0, y0] = at(start + a),
        [x1, y1] = at(start + b);
      if (isWindow(o.kind)) {
        const across = thick * 0.3;
        const [dx, dy] = wall.axis === "x" ? [0, across] : [across, 0];
        line(x0 - dx, y0 - dy, x1 - dx, y1 - dy, 1.2);
        line(x0 + dx, y0 + dy, x1 + dx, y1 + dy, 1.2);
      } else {
        // Hinged at the opening's start, swinging to the side the opening says.
        const hinge = o.hinge === "end" ? ([x1, y1] as const) : ([x0, y0] as const);
        const free = o.hinge === "end" ? ([x0, y0] as const) : ([x1, y1] as const);
        const r = o.width * PX;
        const side = o.swing ?? 1;
        const leaf: [number, number] = wall.axis === "x" ? [hinge[0], hinge[1] + side * r] : [hinge[0] + side * r, hinge[1]];
        line(hinge[0], hinge[1], leaf[0], leaf[1], 1.6);
        const sweep = (free[0] - hinge[0]) * (leaf[1] - hinge[1]) - (free[1] - hinge[1]) * (leaf[0] - hinge[0]) > 0 ? 0 : 1;
        out.push(`<path d="M${leaf[0].toFixed(1)} ${leaf[1].toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${sweep} ${free[0].toFixed(1)} ${free[1].toFixed(1)}" fill="none" stroke="#111" stroke-width="1"/>`);
      }
    }
    if (cursor < wall.length) line(...at(start + cursor), ...at(start + wall.length), thick);
  }

  for (const room of floor.rooms) {
    const b = room.bounds;
    const cx = X(b.x + b.w / 2),
      cy = Y(b.z + b.d / 2);
    const size = Math.max(11, Math.min(17, (b.w * PX) / 8));
    text(cx, cy - 3, roomLabel(room, hindi), size, 'font-weight="600"');
    if (dimensions) text(cx, cy + size + 1, `${feetInches(b.w)} X ${feetInches(b.d)}`, Math.max(9, size - 4));
  }
  for (const balcony of floor.balconies) {
    const b = balconyBounds(floor, balcony);
    out.push(`<rect x="${X(b.x).toFixed(1)}" y="${Y(b.z).toFixed(1)}" width="${(b.w * PX).toFixed(1)}" height="${(b.d * PX).toFixed(1)}" fill="none" stroke="#111" stroke-width="2"/>`);
    text(X(b.x + b.w / 2), Y(b.z + b.d / 2) + 4, hindi ? "बालकनी" : "BALCONY", 11);
  }
  for (const space of project.verticalSpaces.filter((v) => v.floorIds.includes(floor.id))) {
    const b = space.bounds;
    if (space.kind === "stairs") {
      const steps = Math.max(4, Math.floor(b.d / 25));
      for (let i = 0; i <= steps; i++) line(X(b.x), Y(b.z + (b.d * i) / steps), X(b.x + b.w), Y(b.z + (b.d * i) / steps), 1);
      text(X(b.x + b.w / 2), Y(b.z + b.d / 2) + 4, "UP", 12, 'font-weight="600"');
    } else text(X(b.x + b.w / 2), Y(b.z + b.d / 2) + 4, "OPEN TO SKY", 11);
  }
  if (dimensions) {
    const top = MARGIN - 40,
      left = MARGIN - 40;
    line(X(fp.x), top, X(fp.x + fp.w), top, 1);
    line(left, Y(fp.z), left, Y(fp.z + fp.d), 1);
    for (const x of [fp.x, fp.x + fp.w]) line(X(x), top - 8, X(x), top + 8, 1);
    for (const z of [fp.z, fp.z + fp.d]) line(left - 8, Y(z), left + 8, Y(z), 1);
    text(X(fp.x + fp.w / 2), top - 10, feetInches(fp.w), 15);
    text(left - 10, Y(fp.z + fp.d / 2), feetInches(fp.d), 15, `transform="rotate(-90 ${(left - 10).toFixed(1)} ${Y(fp.z + fp.d / 2).toFixed(1)})"`);
  }
  text(width / 2, height - 60, hindi ? "भूतल नक्शा" : "GROUND FLOOR PLAN", 18, 'font-weight="700"');
  text(width / 2, height - 36, `PLOT ${feetInches(project.plot.width)} X ${feetInches(project.plot.depth)}`, 13);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial, 'Noto Sans Devanagari', sans-serif"><rect width="${width}" height="${height}" fill="#fff"/>${out.join("")}</svg>`;
  return { svg, width, height };
}

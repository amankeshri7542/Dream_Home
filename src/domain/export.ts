import type { Project } from "./types";
import { ROOM_META } from "./types";
import { balconyBounds, deriveWalls, projectStats } from "./model";
import {
  area,
  areaLabel,
  floorName,
  length,
  roomName,
  roadName,
  unitLabel,
} from "./display";
import type { Unit } from "./display";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
// Fixed-width wrapping also handles imported names without spaces. Escape after
// splitting so entity strings cannot be broken across lines.
const wrap = (value: string, limit: number) => {
  const characters = Array.from(value);
  return Array.from(
    { length: Math.max(1, Math.ceil(characters.length / limit)) },
    (_, i) => characters.slice(i * limit, (i + 1) * limit).join(""),
  );
};
export function buildPlanSvg(project: Project, unit: Unit): string {
  const measure = (cm: number) => `${length(cm, unit)} ${unitLabel(unit)}`;
  const stats = projectStats(project);
  const titleLines = wrap(project.name, 64);
  const summaryY = 114 + titleLines.length * 34;
  let sectionY = summaryY + 62;
  const sections = project.floors
    .map((floor, index) => {
      const y = sectionY;
      let legendY = y + 98;
      const roomList = floor.rooms
        .map((room, i) => {
          const lines = wrap(roomName(room), 37);
          const nameY = legendY;
          const dimensionsY = nameY + lines.length * 20;
          legendY = dimensionsY + 30;
          return `<g data-room="${escape(room.id)}"><rect x="730" y="${nameY - 15}" width="24" height="24" rx="6" fill="${ROOM_META[room.kind].color}"/><text x="742" y="${nameY + 2}" text-anchor="middle" font-size="13">${i + 1}</text>${lines.map((line, lineIndex) => `<text x="768" y="${nameY + lineIndex * 20}" font-size="17"${Array.from(line).length > 22 ? ` textLength="${Math.min(372, Array.from(line).length * 9)}" lengthAdjust="spacingAndGlyphs"` : ""}>${escape(line)}</text>`).join("")}<text x="768" y="${dimensionsY}" font-size="14" fill="#6a7e70">${length(room.bounds.w, unit)} × ${measure(room.bounds.d)}</text></g>`;
        })
        .join("");
      const detailY = Math.max(y + 655, legendY + 16);
      sectionY = detailY + 84;
      const { width, depth, road } = project.plot;
      const horizontalRoad = road === "north" || road === "south";
      const roadX = road === "west" ? -180 : road === "east" ? width + 125 : 0;
      const roadY =
        road === "north" ? -180 : road === "south" ? depth + 125 : 0;
      const roadCenterX = roadX + (horizontalRoad ? width : 55) / 2;
      const roadCenterY = roadY + (horizontalRoad ? 55 : depth) / 2;
      const balcony = balconyBounds(floor);
      // Upper-floor entrances face their shared front balcony, matching the scene.
      const walls = deriveWalls(floor, index === 0 ? road : "south")
        .map((wall) => {
          const point = (offset: number) =>
            `${wall.x + (wall.axis === "x" ? offset : 0)} ${wall.z + (wall.axis === "z" ? offset : 0)}`;
          const start = wall.opening
            ? (wall.length - wall.opening.width) / 2
            : 0;
          const end = wall.opening ? (wall.length + wall.opening.width) / 2 : 0;
          return `<path d="M${point(0)} L${point(wall.length)}" stroke="#4e6556" stroke-width="10"/>${wall.opening ? `<path data-opening="${wall.opening.kind}" d="M${point(start)} L${point(end)}" stroke="${wall.opening.kind === "door" ? "#fffdf5" : "#8ebdce"}" stroke-width="12"/>` : ""}`;
        })
        .join("");
      return `<g data-floor="${index}" data-start="${y}" data-end="${sectionY}"><text x="54" y="${y}" font-size="25" font-weight="600">${escape(floorName(index))}</text>
      <svg x="54" y="${y + 26}" width="630" height="590" viewBox="-210 -210 ${width + 420} ${depth + 420}">
      <rect width="${width}" height="${depth}" fill="#e4eddd" stroke="#859b85" stroke-width="8"/>
      <rect data-road="${road}" x="${roadX}" y="${roadY}" width="${horizontalRoad ? width : 55}" height="${horizontalRoad ? 55 : depth}" fill="#dce1dd"/>
      <text x="${roadCenterX}" y="${roadCenterY}" dy="10" text-anchor="middle" font-size="30" transform="rotate(${horizontalRoad ? 0 : -90} ${roadCenterX} ${roadCenterY})">${"ROAD"}</text>
      <rect x="${floor.footprint.x}" y="${floor.footprint.z}" width="${floor.footprint.w}" height="${floor.footprint.d}" fill="#fffdf5"/>
      ${floor.balcony ? `<rect data-balcony="true" x="${balcony.x}" y="${balcony.z}" width="${balcony.w}" height="${balcony.d}" fill="#cdb796" stroke="#73847c" stroke-width="7"/><text x="${balcony.x + balcony.w / 2}" y="${balcony.z + balcony.d / 2}" text-anchor="middle" font-size="23">${"Balcony"}</text>` : ""}
      ${floor.rooms.map((room, i) => `<rect x="${room.bounds.x}" y="${room.bounds.z}" width="${room.bounds.w}" height="${room.bounds.d}" fill="${ROOM_META[room.kind].color}" fill-opacity=".62"/><text x="${room.bounds.x + room.bounds.w / 2}" y="${room.bounds.z + room.bounds.d / 2}" dy=".35em" text-anchor="middle" font-size="${Math.min(30, room.bounds.w / 3, room.bounds.d / 3)}" font-weight="600">${i + 1}</text>`).join("")}
      ${floor.voids.map((space) => `<rect x="${space.bounds.x}" y="${space.bounds.z}" width="${space.bounds.w}" height="${space.bounds.d}" fill="${space.kind === "courtyard" ? "#98b586" : "#c6cfc5"}"/><text x="${space.bounds.x + space.bounds.w / 2}" y="${space.bounds.z + space.bounds.d / 2}" dy=".35em" text-anchor="middle" font-size="20">${space.kind === "courtyard" ? "Aangan" : "Stairs"}</text>`).join("")}
      ${walls}
      <g fill="#607565" font-size="28" text-anchor="middle"><text data-dimension="width" x="${width / 2}" y="-75">${measure(width)}</text><text data-dimension="depth" transform="translate(-75 ${depth / 2}) rotate(-90)">${measure(depth)}</text></g>
      <path d="M0 -45V-20 M0 -35H${width} M${width} -45V-20 M-45 0H-20 M-35 0V${depth} M-45 ${depth}H-20" stroke="#879b91" stroke-width="4" fill="none"/>
      </svg>
      <text x="730" y="${y + 60}" font-size="17" fill="#738273">${"ROOM SIZES (APPROX.)"}</text>${roomList}
      <text data-floor-note="${index}" x="54" y="${detailY}" font-size="15" fill="#728775">${"Road side"}: ${escape(roadName(road))} · ${"Sketch margin"}: ${measure(project.plot.setback)}</text>
      <text x="54" y="${detailY + 24}" font-size="14" fill="#728775">${"Margin is a sketch setting, not a verified legal setback."}</text>
      <path d="M54 ${detailY + 48}H1146" stroke="#dce4d9"/></g>`;
    })
    .join("");
  const height = sectionY + 66;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><rect width="1200" height="${height}" fill="#fbfcf7"/><g font-family="Arial, sans-serif" fill="#284b3b"><text x="54" y="64" font-size="22">dream—home</text>${titleLines.map((line, i) => `<text x="54" y="${112 + i * 34}" font-size="28" font-weight="600"${Array.from(line).length > 40 ? ` textLength="${Math.min(1050, Array.from(line).length * 15)}" lengthAdjust="spacingAndGlyphs"` : ""}>${escape(line)}</text>`).join("")}<text x="54" y="${summaryY}" font-size="19" fill="#607565">${length(project.plot.width, unit)} × ${measure(project.plot.depth)} · ${area(stats.plotArea, unit)} ${areaLabel(unit)} · ${stats.bedrooms} ${stats.bedrooms === 1 ? "bedroom" : "bedrooms"} · ${project.floors.length} ${project.floors.length === 1 ? "floor" : "floors"}</text>
    <g transform="translate(1110 48)"><g transform="rotate(${project.plot.north})"><path d="M0 20V-20 M-7 -10L0 -20L7 -10" fill="none" stroke="#284b3b" stroke-width="3"/></g><text y="44" text-anchor="middle" font-size="15">${"North"} ${project.plot.north}°</text></g>
    ${sections}<text data-footer="true" x="54" y="${height - 32}" font-size="14" fill="#677a6b">${"Concept only. Review access, light, structure and local rules with your architect."}</text></g></svg>`;
}
export async function planImage(project: Project, unit: Unit): Promise<File> {
  const svg = buildPlanSvg(project, unit),
    url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image export failed"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export unavailable");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image export unavailable"))),
        "image/png",
      ),
    );
    return new File([blob], "dream-home-plan.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import type { Project } from "./types";
import { ROOM_META } from "./types";
import {
  balconyBounds,
  deriveWalls,
  floorForGeometry,
  projectStats,
} from "./model";
import {
  area,
  areaLabel,
  floorName,
  length,
  roomName,
  roadName,
  unitLabel,
  type Unit,
} from "./display";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
const wrap = (value: string, limit: number) => {
  const characters = Array.from(value);
  return Array.from(
    { length: Math.max(1, Math.ceil(characters.length / limit)) },
    (_, i) => characters.slice(i * limit, (i + 1) * limit).join(""),
  );
};
const fit = (value: string, width: number, average: number) =>
  Array.from(value).length > width / (average * 1.8)
    ? ` textLength="${Math.min(width, Array.from(value).length * average)}" lengthAdjust="spacingAndGlyphs"`
    : "";

// Images are intentionally one floor per page: eight floors with 48 rooms each
// must never allocate an enormous combined bitmap on a phone.
export function buildPlanSvg(
  project: Project,
  unit: Unit,
  floorId = project.floors[0].id,
): string {
  const floorIndex = project.floors.findIndex((floor) => floor.id === floorId);
  const floor = floorForGeometry(project, floorId);
  const measure = (cm: number) => `${length(cm, unit)} ${unitLabel(unit)}`;
  const stats = projectStats(project),
    titleLines = wrap(project.name, 64);
  const summaryY = 114 + titleLines.length * 34,
    start = summaryY + 56;
  const { width, depth, road } = project.plot;
  const horizontalRoad = road === "north" || road === "south";
  const roadX = road === "west" ? -180 : road === "east" ? width + 125 : 0;
  const roadY = road === "north" ? -180 : road === "south" ? depth + 125 : 0;
  const roadCenterX = roadX + (horizontalRoad ? width : 55) / 2,
    roadCenterY = roadY + (horizontalRoad ? 55 : depth) / 2;
  const unitIds = [...new Set(floor.unitAreas.map((area) => area.unitId))];
  const unitCode = (unitId: string | null) =>
    unitId
      ? `U${project.units.findIndex((home) => home.id === unitId) + 1}`
      : "Shared";
  const unitLegend = unitIds.map(
    (id) =>
      `${unitCode(id)} · ${project.units.find((home) => home.id === id)?.name ?? "Home"}`,
  );
  // Put the room schedule below the plan in two columns. The exported map stays
  // large enough to read, while even 48 long names fit within a bounded page.
  const mapY = start + 28,
    scheduleY = mapY + 680;
  const rows = Math.ceil(floor.rooms.length / 2);
  const roomRows = Array.from({ length: rows }, (_, i) =>
    [floor.rooms[i * 2], floor.rooms[i * 2 + 1]].filter(Boolean),
  );
  let rowY = scheduleY + 48;
  const roomList = roomRows
    .map((rooms, rowIndex) => {
      const lines = rooms.map((room) => wrap(roomName(room), 48));
      const rowHeight = Math.max(...lines.map((line) => line.length)) * 21 + 36;
      const currentY = rowY;
      rowY += rowHeight;
      return rooms
        .map((room, column) => {
          const x = column === 0 ? 54 : 626,
            number = rowIndex * 2 + column + 1;
          return `<g data-room="${escape(room.id)}"><rect x="${x}" y="${currentY - 16}" width="26" height="26" rx="6" fill="${ROOM_META[room.kind].color}"/><text x="${x + 13}" y="${currentY + 2}" text-anchor="middle" font-size="13">${number}</text>${lines[column].map((line, i) => `<text data-room-name="true" x="${x + 38}" y="${currentY + i * 21}" font-size="17"${fit(line, 472, 8.5)}>${escape(line)}</text>`).join("")}<text x="${x + 38}" y="${currentY + lines[column].length * 21}" font-size="14" fill="#64746b">${length(room.bounds.w, unit)} × ${measure(room.bounds.d)} · ${unitCode(room.unitId)}</text></g>`;
        })
        .join("");
    })
    .join("");
  const unitY = rowY + 12;
  const unitLines = unitLegend.flatMap((name) => wrap(name, 112));
  const detailY = unitY + unitLines.length * 24 + 32,
    height = detailY + 125;
  const walls = deriveWalls(floor, road)
    .map((wall) => {
      const point = (offset: number) =>
        `${wall.x + (wall.axis === "x" ? offset : 0)} ${wall.z + (wall.axis === "z" ? offset : 0)}`;
      const from = wall.opening ? (wall.length - wall.opening.width) / 2 : 0,
        to = wall.opening ? (wall.length + wall.opening.width) / 2 : 0;
      return `<path d="M${point(0)} L${point(wall.length)}" stroke="#4e6556" stroke-width="10"/>${wall.opening ? `<path data-opening="${wall.opening.kind}" d="M${point(from)} L${point(to)}" stroke="${wall.opening.kind === "door" ? "#fffdf5" : "#8ebdce"}" stroke-width="12"/>` : ""}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><rect width="1200" height="${height}" fill="#fbfcf7"/><g font-family="Arial, sans-serif" fill="#284b3b">
    <text x="54" y="64" font-size="22">dream—home</text>
    ${titleLines.map((line, i) => `<text x="54" y="${112 + i * 34}" font-size="28" font-weight="600"${fit(line, 1030, 15)}>${escape(line)}</text>`).join("")}
    <text x="54" y="${summaryY}" font-size="19" fill="#607565">${length(width, unit)} × ${measure(depth)} · ${area(stats.plotArea, unit)} ${areaLabel(unit)} · ${stats.bedrooms} ${stats.bedrooms === 1 ? "bedroom" : "bedrooms"} · ${project.floors.length} ${project.floors.length === 1 ? "floor" : "floors"}</text>
    <g transform="translate(1110 48)"><g transform="rotate(${project.plot.north})"><path d="M0 20V-20 M-7 -10L0 -20L7 -10" fill="none" stroke="#284b3b" stroke-width="3"/></g><text y="44" text-anchor="middle" font-size="15">North ${project.plot.north}°</text></g>
    <g data-floor="${floorIndex}" data-start="${start}" data-end="${detailY + 80}"><text x="54" y="${start}" font-size="25" font-weight="600">${escape(floorName(floorIndex))}</text><text x="1146" y="${start}" font-size="16" text-anchor="end" fill="#64746b">Floor ${floorIndex + 1} of ${project.floors.length}</text>
    <svg x="54" y="${mapY}" width="1092" height="640" viewBox="-210 -210 ${width + 420} ${depth + 420}">
    <rect width="${width}" height="${depth}" fill="#e4eddd" stroke="#859b85" stroke-width="8"/>
    <rect data-road="${road}" x="${roadX}" y="${roadY}" width="${horizontalRoad ? width : 55}" height="${horizontalRoad ? 55 : depth}" fill="#dce1dd"/><text x="${roadCenterX}" y="${roadCenterY}" dy="10" text-anchor="middle" font-size="30" transform="rotate(${horizontalRoad ? 0 : -90} ${roadCenterX} ${roadCenterY})">ROAD</text>
    <rect x="${floor.footprint.x}" y="${floor.footprint.z}" width="${floor.footprint.w}" height="${floor.footprint.d}" fill="#fffdf5"/>
    ${floor.balconies
      .map((balcony) => {
        const bounds = balconyBounds(floor, balcony);
        return `<rect data-balcony="${escape(balcony.id)}" x="${bounds.x}" y="${bounds.z}" width="${bounds.w}" height="${bounds.d}" fill="#cdb796" stroke="#73847c" stroke-width="7"/><text x="${bounds.x + bounds.w / 2}" y="${bounds.z + bounds.d / 2}" text-anchor="middle" font-size="23">Balcony</text>`;
      })
      .join("")}
    ${floor.rooms.map((room, i) => `<rect x="${room.bounds.x}" y="${room.bounds.z}" width="${room.bounds.w}" height="${room.bounds.d}" fill="${ROOM_META[room.kind].color}" fill-opacity=".62"/><text x="${room.bounds.x + room.bounds.w / 2}" y="${room.bounds.z + room.bounds.d / 2}" dy=".35em" text-anchor="middle" font-size="${Math.min(30, room.bounds.w / 3, room.bounds.d / 3)}" font-weight="600">${i + 1}</text>`).join("")}
    ${floor.voids.map((space) => `<rect data-vertical-space="${escape(space.id)}" x="${space.bounds.x}" y="${space.bounds.z}" width="${space.bounds.w}" height="${space.bounds.d}" fill="${space.kind === "courtyard" ? "#98b586" : "#c6cfc5"}"/><text x="${space.bounds.x + space.bounds.w / 2}" y="${space.bounds.z + space.bounds.d / 2}" dy=".35em" text-anchor="middle" font-size="20">${space.kind === "courtyard" ? "Courtyard" : "Stairs"}</text>`).join("")}
    ${walls}
    ${floor.unitAreas.map((home) => `<rect data-unit="${escape(home.unitId)}" x="${home.bounds.x + 8}" y="${home.bounds.z + 8}" width="${Math.max(0, home.bounds.w - 16)}" height="${Math.max(0, home.bounds.d - 16)}" fill="none" stroke="#63518a" stroke-width="5" stroke-dasharray="16 10"/><text x="${home.bounds.x + 24}" y="${home.bounds.z + 35}" font-size="25" fill="#63518a">${unitCode(home.unitId)}</text>`).join("")}
    <g fill="#607565" font-size="28" text-anchor="middle"><text data-dimension="width" x="${width / 2}" y="-75">${measure(width)}</text><text data-dimension="depth" transform="translate(-75 ${depth / 2}) rotate(-90)">${measure(depth)}</text></g><path d="M0 -45V-20 M0 -35H${width} M${width} -45V-20 M-45 0H-20 M-35 0V${depth} M-45 ${depth}H-20" stroke="#879b91" stroke-width="4" fill="none"/>
    </svg><text x="54" y="${scheduleY}" font-size="17" fill="#738273">ROOM SIZES (APPROX.)</text>${roomList}
    ${unitLines.map((line, i) => `<text data-unit-name="true" x="54" y="${unitY + i * 24}" font-size="16"${fit(line, 1092, 8)}>${escape(line)}</text>`).join("")}
    <text data-floor-note="${floorIndex}" x="54" y="${detailY}" font-size="15" fill="#728775">Road side: ${escape(roadName(road))} · Sketch margin: ${measure(project.plot.setback)}</text><text x="54" y="${detailY + 24}" font-size="14" fill="#728775">Margin is a sketch setting, not a verified legal setback.</text><path d="M54 ${detailY + 48}H1146" stroke="#dce4d9"/></g>
    <text data-footer="true" x="54" y="${height - 24}" font-size="14" fill="#677a6b">Concept only. Review access, light, structure and local rules with your architect.</text></g></svg>`;
}

export async function planImage(
  project: Project,
  unit: Unit,
  floorId = project.floors[0].id,
  signal?: AbortSignal,
): Promise<File> {
  const svg = buildPlanSvg(project, unit, floorId),
    url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        image.src = "";
        reject(new DOMException("Image preparation cancelled", "AbortError"));
      };
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      image.onload = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      image.onerror = () => {
        signal?.removeEventListener("abort", abort);
        reject(new Error("Image export failed"));
      };
      image.src = url;
    });
    if (signal?.aborted)
      throw new DOMException("Image preparation cancelled", "AbortError");
    if (
      image.naturalWidth * image.naturalHeight > 6_000_000 ||
      image.naturalHeight > 6000
    )
      throw new Error(
        "This floor is too large for an image. Download the editable project instead.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export unavailable");
      context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error("Image export unavailable")),
          "image/png",
        ),
      );
      return new File(
        [blob],
        `dream-home-floor-${project.floors.findIndex((floor) => floor.id === floorId) + 1}.png`,
        { type: "image/png" },
      );
    } finally {
      canvas.width = canvas.height = 1;
    }
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

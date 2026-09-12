import type { Rect, Room, Wall } from "./types";

export const DETAIL_MATERIALS = {
  timber: { color: "#967252", roughness: 0.72 },
  oak: { color: "#c1a47a", roughness: 0.7 },
  linen: { color: "#f3ede2", roughness: 0.96 },
  fabric: { color: "#819e9c", roughness: 0.98 },
  cushion: { color: "#c6d6cc", roughness: 0.98 },
  cabinet: { color: "#718778", roughness: 0.78 },
  stone: { color: "#ded8ca", roughness: 0.64 },
  ceramic: { color: "#f2f2e9", roughness: 0.34 },
  steel: { color: "#859697", roughness: 0.26 },
  dark: { color: "#374545", roughness: 0.45 },
  water: { color: "#aacfd2", roughness: 0.22 },
  clay: { color: "#c7855f", roughness: 0.8 },
} as const;
export type DetailMaterial = keyof typeof DETAIL_MATERIALS;
export type RoomDetail = {
  role: string;
  shape: "box" | "ellipse";
  bounds: Rect;
  y: number;
  height: number;
  material: DetailMaterial;
  soft?: boolean;
};
export type RoomFloorFinish = "wood" | "tile" | "stone";

export function roomFloorFinish(room: Room): RoomFloorFinish {
  if (room.floorFinish && room.floorFinish !== "auto") return room.floorFinish;
  return room.kind === "bedroom" || room.kind === "living"
    ? "wood"
    : room.kind === "bathroom" ||
        room.kind === "kitchen" ||
        room.kind === "utility"
      ? "tile"
      : "stone";
}

function overlapArea(a: Rect, b: Rect) {
  return (
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z))
  );
}

/** Illustrative door approaches, not regulatory clearance measurements. */
export function roomDoorApproaches(room: Room, walls: readonly Wall[]): Rect[] {
  const r = room.bounds;
  return walls.flatMap((wall) => {
    if (wall.opening?.kind !== "door") return [];
    const width = wall.opening.width + 20;
    if (wall.axis === "x" && (wall.z === r.z || wall.z === r.z + r.d)) {
      const center = wall.x + wall.length / 2;
      if (center <= r.x || center >= r.x + r.w) return [];
      return [
        {
          x: center - width / 2,
          z: wall.z === r.z ? r.z : r.z + r.d - 85,
          w: width,
          d: 85,
        },
      ];
    }
    if (wall.axis === "z" && (wall.x === r.x || wall.x === r.x + r.w)) {
      const center = wall.z + wall.length / 2;
      if (center <= r.z || center >= r.z + r.d) return [];
      return [
        {
          x: wall.x === r.x ? r.x : r.x + r.w - 85,
          z: center - width / 2,
          w: 85,
          d: width,
        },
      ];
    }
    return [];
  });
}

function localDetails(room: Room, w: number, d: number): RoomDetail[] {
  const parts: RoomDetail[] = [];
  const box = (
    role: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    y: number,
    height: number,
    material: DetailMaterial,
    soft = false,
  ) => {
    if (
      width <= 0 ||
      depth <= 0 ||
      x < 0 ||
      z < 0 ||
      x + width > w + 0.01 ||
      z + depth > d + 0.01
    )
      return;
    parts.push({
      role,
      shape: "box",
      bounds: { x, z, w: width, d: depth },
      y,
      height,
      material,
      soft,
    });
  };
  const ellipse = (
    role: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    y: number,
    height: number,
    material: DetailMaterial,
  ) => {
    box(role, x, z, width, depth, y, height, material, true);
    if (parts.at(-1)?.role === role) parts[parts.length - 1].shape = "ellipse";
  };
  const legs = (
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
  ) => {
    for (const dx of [6, width - 12])
      for (const dz of [6, depth - 12])
        box("leg", x + dx, z + dz, 6, 6, 0, height, "timber");
  };
  const chair = (x: number, z: number, back: "north" | "south" = "north") => {
    box("chair", x, z, 40, 40, 38, 9, "oak", true);
    box(
      "chair back",
      x,
      z + (back === "north" ? 0 : 35),
      40,
      5,
      47,
      35,
      "oak",
      true,
    );
    legs(x, z, 40, 40, 38);
  };
  const desk = () => {
    const width = Math.min(130, w);
    box("desk", 0, 0, width, 55, 70, 5, "oak");
    legs(0, 0, width, 55, 70);
    box("open book", 24, 15, 35, 26, 75, 2, "linen");
    box("desk screen", width - 47, 10, 39, 5, 80, 25, "dark");
    if (d >= 112) chair(width / 2 - 20, 68, "south");
  };
  if (room.kind === "bedroom") {
    const width = w >= 215 ? 155 : 90;
    if (w >= width && d >= 200) {
      const x = Math.max(0, (w - width) / 2);
      box("bed base", x, 0, width, 200, 9, 26, "timber");
      box("headboard", x, 0, width, 7, 0, 89, "oak", true);
      box("mattress", x + 2, 8, width - 4, 190, 35, 16, "linen", true);
      box("duvet", x + 1, 61, width - 2, 135, 51, 7, "fabric", true);
      box("duvet fold", x + 1, 59, width - 2, 17, 57, 3, "cushion", true);
      const pillows = width > 100 ? 2 : 1;
      for (let i = 0; i < pillows; i++)
        box(
          "pillow",
          x + 9 + i * 72,
          17,
          pillows === 2 ? 62 : 70,
          35,
          51,
          11,
          "linen",
          true,
        );
      if (x >= 36) box("bedside table", x - 36, 5, 30, 38, 0, 46, "oak");
    } else {
      // A folded sleeping mat identifies a too-small sleeping space without a tiny bed.
      box(
        "folded sleeping mat",
        Math.max(0, (w - 76) / 2),
        0,
        Math.min(76, w),
        Math.min(115, d),
        1,
        7,
        "fabric",
        true,
      );
      box(
        "pillow",
        Math.max(0, (w - 64) / 2),
        8,
        Math.min(64, w),
        32,
        8,
        9,
        "linen",
        true,
      );
    }
  } else if (room.kind === "kitchen") {
    const width = Math.min(w, 330),
      depth = 60;
    box("kitchen cabinets", 0, 0, width, depth, 0, 84, "cabinet");
    box("countertop", 0, 0, width, depth + 2, 84, 5, "stone");
    for (let x = 0; x < width - 25; x += 55) {
      box(
        "cabinet front",
        x + 2,
        60,
        Math.min(51, width - x - 4),
        2,
        5,
        73,
        "cabinet",
      );
      box(
        "cabinet handle",
        x + 12,
        62,
        Math.min(24, width - x - 16),
        2,
        66,
        2,
        "steel",
      );
    }
    const hobX = Math.max(4, width - 60);
    box("hob", hobX, 8, Math.min(52, width - hobX), 43, 89, 2, "dark", true);
    for (const dx of [8, 31])
      for (const dz of [5, 26]) {
        ellipse("burner", hobX + dx, 8 + dz, 13, 13, 91, 1, "steel");
        ellipse("burner center", hobX + dx + 3, 11 + dz, 7, 7, 92, 1, "dark");
      }
    ellipse("cooking pot", hobX + 4, 10, 22, 22, 92, 16, "steel");
    ellipse("pot lid", hobX + 3, 9, 24, 24, 108, 2, "dark");
    if (width >= 145) {
      box("sink rim", 10, 8, 48, 42, 89, 2, "steel", true);
      box("sink bowl", 14, 12, 40, 34, 90, 1, "dark", true);
      box("sink bottom", 18, 16, 32, 26, 91, 1, "water", true);
      box("tap", 29, 5, 4, 4, 91, 22, "steel");
      box("tap spout", 29, 5, 4, 17, 111, 3, "steel");
      box("chopping board", 67, 15, 27, 34, 89, 2, "oak", true);
    }
    if (d >= 190 && w >= 250) {
      box(
        "return cabinets",
        0,
        62,
        60,
        Math.min(120, d - 62),
        0,
        84,
        "cabinet",
      );
      box(
        "return countertop",
        0,
        62,
        62,
        Math.min(120, d - 62),
        84,
        5,
        "stone",
      );
    }
  } else if (room.kind === "dining") {
    const width = w >= 230 ? 145 : 90,
      depth = d >= 225 ? 86 : 66;
    const x = (w - width) / 2,
      z = (d - depth) / 2;
    box("dining table", x, z, width, depth, 73, 5, "oak", true);
    legs(x, z, width, depth, 73);
    const chairs = width > 100 ? 2 : 1;
    for (let i = 0; i < chairs; i++) {
      const cx = x + (width / (chairs + 1)) * (i + 1) - 20;
      if (z >= 43) chair(cx, z - 43);
      if (z + depth + 43 <= d) chair(cx, z + depth + 3, "south");
      ellipse("dinner plate", cx + 8, z + 8, 24, 24, 78, 2, "ceramic");
      ellipse("dinner plate", cx + 8, z + depth - 32, 24, 24, 78, 2, "ceramic");
    }
    if (depth >= 82)
      ellipse(
        "table bowl",
        x + width / 2 - 12,
        z + depth / 2 - 12,
        24,
        24,
        78,
        8,
        "clay",
      );
  } else if (room.kind === "living") {
    const width = Math.min(220, w),
      depth = Math.min(85, d);
    box("sofa base", 0, 0, width, depth, 7, 29, "fabric", true);
    box("sofa back", 0, 0, width, 18, 35, 43, "fabric", true);
    for (const x of [0, width - 15])
      box("sofa arm", x, 0, 15, depth, 35, 23, "fabric", true);
    const count = width > 170 ? 3 : 2,
      cushion = (width - 36) / count;
    for (let i = 0; i < count; i++) {
      box(
        "seat cushion",
        18 + i * cushion,
        20,
        cushion - 3,
        depth - 25,
        36,
        12,
        "cushion",
        true,
      );
      box(
        "back cushion",
        20 + i * cushion,
        18,
        cushion - 7,
        14,
        49,
        22,
        "cushion",
        true,
      );
    }
    if (d >= 210 && w >= 140) {
      box("coffee table", (width - 100) / 2, 127, 100, 55, 38, 5, "oak", true);
      legs((width - 100) / 2, 127, 100, 55, 38);
      box("magazine", width / 2 - 14, 138, 28, 33, 43, 2, "linen");
    }
  } else if (room.kind === "bathroom") {
    box("toilet cistern", 0, 0, 42, 20, 0, 70, "ceramic", true);
    ellipse("toilet pedestal", 7, 18, 28, 39, 0, 38, "ceramic");
    ellipse("toilet bowl", 0, 13, 42, 55, 38, 6, "ceramic");
    ellipse("toilet opening", 8, 23, 26, 35, 44, 1, "dark");
    ellipse("toilet water", 13, 29, 16, 24, 45, 1, "water");
    if (w >= 108) {
      box("vanity", w - 52, 0, 52, 43, 0, 77, "oak");
      box("basin rim", w - 54, 0, 54, 46, 77, 8, "ceramic", true);
      ellipse("basin", w - 46, 8, 36, 28, 85, 1, "water");
      box("basin tap", w - 29, 2, 4, 4, 85, 14, "steel");
    }
    if (w >= 150 && d >= 175) {
      box("shower tray", w - 82, d - 82, 82, 82, 0, 4, "ceramic");
      box("shower inset", w - 77, d - 77, 72, 72, 4, 1, "water");
      ellipse("shower drain", w - 48, d - 48, 10, 10, 5, 1, "steel");
      box("shower rail", w - 6, d - 44, 3, 3, 70, 125, "steel");
      ellipse("shower head", w - 23, d - 50, 18, 18, 195, 3, "steel");
    }
  } else if (/prayer|pooja|puja/i.test(room.name)) {
    box("prayer platform", (w - 80) / 2, 0, 80, 50, 0, 20, "oak");
    box("shrine back", (w - 70) / 2, 0, 70, 8, 20, 65, "timber");
    box("shrine shelf", (w - 70) / 2, 0, 70, 43, 55, 5, "oak");
    ellipse("lamp", w / 2 - 7, 22, 14, 14, 60, 12, "clay");
    if (d >= 120)
      box("prayer mat", (w - 65) / 2, 61, 65, 56, 0, 2, "fabric", true);
  } else if (/study|office/i.test(room.name)) desk();
  else if (room.kind === "shop") {
    const width = Math.min(w, 300);
    for (const y of [10, 55, 100]) {
      box("display shelf", 0, 0, width, 38, y, 5, "oak");
      for (let x = 10; x < width - 25; x += 48)
        box("display goods", x, 6, 27, 26, y + 5, 25, x % 3 ? "linen" : "clay");
    }
    box("shelf back", 0, 0, width, 5, 0, 130, "timber");
    if (d >= 220) {
      box(
        "shop counter",
        Math.max(0, w - 140),
        d - 60,
        Math.min(140, w),
        60,
        0,
        90,
        "cabinet",
      );
      box(
        "countertop",
        Math.max(0, w - 140),
        d - 60,
        Math.min(140, w),
        60,
        90,
        5,
        "stone",
      );
      box("till", w - 47, d - 43, 35, 30, 95, 15, "dark");
    }
  } else {
    box("washing machine", 0, 0, 60, 60, 0, 85, "ceramic", true);
    box("washer controls", 3, 60, 54, 2, 68, 10, "steel");
    // The dark horizontal lid reads from above while the front detail reads in orbit.
    ellipse("washer drum lid", 10, 12, 40, 37, 85, 1, "dark");
    ellipse("washer lid glass", 15, 17, 30, 27, 86, 1, "water");
    if (w >= 125) {
      box("utility worktop", 67, 0, Math.min(110, w - 67), 55, 84, 5, "oak");
      box("folded linen", 76, 10, 35, 31, 89, 10, "linen", true);
    }
  }
  return parts;
}

function turnRect(r: Rect, w: number, d: number, turns: number): Rect {
  if (turns === 1) return { x: d - r.z - r.d, z: r.x, w: r.d, d: r.w };
  if (turns === 2)
    return { x: w - r.x - r.w, z: d - r.z - r.d, w: r.w, d: r.d };
  if (turns === 3) return { x: r.z, z: w - r.x - r.w, w: r.d, d: r.w };
  return r;
}

/** Shared, deterministic, centimetre-scale furniture for the plan and 3D views. */
export function roomDetails(
  room: Room,
  walls: readonly Wall[] = [],
): RoomDetail[] {
  if (room.furnishing === "none") return [];
  const inset = 13,
    rw = room.bounds.w - inset * 2,
    rd = room.bounds.d - inset * 2;
  if (rw <= 0 || rd <= 0) return [];
  const doors = roomDoorApproaches(room, walls);
  const orientations =
    room.furnishingRotation === undefined
      ? [0, 1, 2, 3]
      : [room.furnishingRotation / 90];
  const candidates = orientations.map((turns) => {
    const w = turns % 2 ? rd : rw,
      d = turns % 2 ? rw : rd;
    const parts = localDetails(room, w, d).map((part) => {
      const r = turnRect(part.bounds, w, d, turns);
      return {
        ...part,
        bounds: {
          ...r,
          x: r.x + room.bounds.x + inset,
          z: r.z + room.bounds.z + inset,
        },
      };
    });
    const obstruction = parts.reduce(
      (sum, part) =>
        sum + doors.reduce((n, door) => n + overlapArea(part.bounds, door), 0),
      0,
    );
    return { parts, score: parts.length * 40 - obstruction };
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.parts ?? [];
}

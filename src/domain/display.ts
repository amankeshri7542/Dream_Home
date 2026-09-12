import type { Room, RoomKind } from "./types";
export type Language = "en" | "hi";
export type Unit = "ft" | "m";
export const text = (language: Language, english: string, hindi: string) =>
  language === "hi" ? hindi : english;
export const toDisplay = (cm: number, unit: Unit) =>
  cm / (unit === "ft" ? 30.48 : 100);
export const fromDisplay = (value: number, unit: Unit) =>
  Math.round(value * (unit === "ft" ? 30.48 : 100));
export const length = (cm: number, unit: Unit) =>
  Number(toDisplay(cm, unit).toFixed(1)).toLocaleString("en-IN");
export const area = (sqm: number, unit: Unit) =>
  Math.round(sqm * (unit === "ft" ? 10.7639104167 : 1)).toLocaleString("en-IN");
export const unitLabel = (unit: Unit, language: Language = "en") =>
  unit === "ft" ? text(language, "ft", "फ़ीट") : text(language, "m", "मी");
export const areaLabel = (unit: Unit, language: Language = "en") =>
  unit === "ft"
    ? text(language, "sq ft", "वर्ग फ़ीट")
    : text(language, "m²", "वर्ग मी");
export const roomKindName = (kind: RoomKind, language: Language) =>
  ({
    living: text(language, "Living room", "बैठक"),
    kitchen: text(language, "Kitchen", "रसोई"),
    bedroom: text(language, "Bedroom", "बेडरूम"),
    bathroom: text(language, "Bathroom", "बाथरूम"),
    dining: text(language, "Dining", "खाने की जगह"),
    utility: text(language, "Utility", "अन्य कमरा"),
  })[kind];
export function roomName(room: Room, language: Language) {
  if (language === "en") return room.name;
  const known: Record<string, string> = {
    "Living room": "बैठक",
    "Living & dining": "बैठक और खाने की जगह",
    Kitchen: "रसोई",
    Bathroom: "बाथरूम",
    "Dining room": "खाने की जगह",
    "Family lounge": "परिवार की बैठक",
    Studio: "स्टूडियो",
    Utility: "अन्य कमरा",
  };
  if (known[room.name]) return known[room.name];
  const bedroom = room.name.match(/^Bedroom(?: (\d+))?$/);
  return bedroom ? `बेडरूम${bedroom[1] ? " " + bedroom[1] : ""}` : room.name;
}
export const floorName = (index: number, language: Language) =>
  index === 0
    ? text(language, "Ground floor", "भूतल")
    : text(
        language,
        `Floor ${index}`,
        `${index === 1 ? "पहली" : index === 2 ? "दूसरी" : index + "वीं"} मंज़िल`,
      );
export const roadName = (road: string, language: Language) =>
  ({
    south: text(language, "Front", "सामने"),
    north: text(language, "Back", "पीछे"),
    east: text(language, "Right", "दाईं ओर"),
    west: text(language, "Left", "बाईं ओर"),
  })[road] ?? road;

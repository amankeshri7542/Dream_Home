// The Home score (pure): one friendly number out of 100 and badges to earn.
// It weighs the essentials (the checklist), the "make it yours" ideas,
// sunlight (every bedroom and living room catching some direct sun) and, when
// the homeowner has opted in, Vastu.
import { REGIONAL_VIBES } from "../ai/brief";
import { homeChecks } from "../domain/advice";
import { stylePreset } from "../domain/materials";
import type { PlotLocation, Project } from "../domain/types";
import { everyRoomSunny, sunHours, type RoomSun } from "./sun";

export type ScorePartId = "essentials" | "ideas" | "sunlight" | "vastu";
export type ScorePart = { id: ScorePartId; label: string; value: number; weight: number };
export type BadgeId = "sunlight" | "vastu" | "furnished" | "regional" | "shared";
export const BADGES: Record<BadgeId, { label: string; how: string; cheer: string }> = {
  sunlight: {
    label: "Every room has sunlight",
    how: "Every bedroom and living room catches direct sun.",
    cheer: "Every bedroom and living room catches direct sun.",
  },
  vastu: { label: "Vastu friendly", how: "A Vastu score of 75 or more.", cheer: "Your home scores 75 or more on Vastu." },
  furnished: {
    label: "Fully furnished",
    how: "Every bedroom, living room and kitchen furnished your way.",
    cheer: "Every bedroom, living room and kitchen is furnished your way.",
  },
  regional: {
    label: "Regional look",
    how: "A Kerala, Chettinad, Rajasthani, Goan, Mumbai or Bengaluru look.",
    cheer: "Your home wears a regional Indian look.",
  },
  shared: { label: "Shared with family", how: "A link anyone can open in 3D.", cheer: "Your family can walk around your home in 3D." },
};
export const BADGE_ORDER: BadgeId[] = ["sunlight", "vastu", "furnished", "regional", "shared"];

/** Without a city, sunlight is judged for the middle of India (Nagpur). */
export const CENTRAL_INDIA = { lat: 21.15, lon: 79.09 };
/** The score's sunlight looks at the September equinox: a fair, average day of the year. */
const scoreDay = (now = new Date()) => ({ year: now.getFullYear(), month: 9, day: 22 });

export type HomeScore = {
  score: number;
  parts: ScorePart[];
  badges: BadgeId[];
  /** Direct sun per room, every floor, on the score's day. */
  sun: RoomSun[];
  vastu: number | null;
};

const WEIGHT: Record<ScorePartId, number> = { essentials: 50, ideas: 20, sunlight: 15, vastu: 15 };

export function homeScore(
  project: Project,
  {
    shared = false,
    now = new Date(),
    checks = homeChecks(project),
    vastu = null,
  }: {
    shared?: boolean;
    now?: Date;
    checks?: ReturnType<typeof homeChecks>;
    /** The Vastu score (vastuReport, loaded lazily), when the homeowner has opted in and set the facing. */
    vastu?: number | null;
  } = {},
): HomeScore {
  const fraction = (list: { done: boolean }[]) => (list.length ? list.filter((c) => c.done).length / list.length : 1);
  const place: Pick<PlotLocation, "lat" | "lon"> = project.plot.location ?? CENTRAL_INDIA;
  const sun = project.floors.flatMap((f) => sunHours(project, f.id, place, scoreDay(now)));
  const lived = sun.filter((r) => r.kind === "bedroom" || r.kind === "living");
  const counted = project.vastu && vastu !== null ? vastu : null;
  const parts: ScorePart[] = [
    { id: "essentials", label: "Essentials", value: fraction(checks.essentials), weight: WEIGHT.essentials },
    { id: "ideas", label: "Made it yours", value: fraction(checks.quests), weight: WEIGHT.ideas },
    {
      id: "sunlight",
      label: "Sunlight",
      value: lived.length ? lived.filter((r) => r.hours > 0).length / lived.length : 1,
      weight: WEIGHT.sunlight,
    },
    ...(counted !== null ? [{ id: "vastu" as const, label: "Vastu", value: counted / 100, weight: WEIGHT.vastu }] : []),
  ];
  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round((100 * parts.reduce((s, p) => s + p.value * p.weight, 0)) / total);
  const rooms = project.floors.flatMap((f) => f.rooms).filter((r) => r.kind === "bedroom" || r.kind === "living" || r.kind === "kitchen");
  const preset = stylePreset(project);
  const badges: BadgeId[] = BADGE_ORDER.filter((id) => {
    if (id === "sunlight") return lived.length > 0 && everyRoomSunny(sun);
    if (id === "vastu") return counted !== null && counted >= 75;
    if (id === "furnished") return rooms.length > 0 && rooms.every((r) => !!r.furniture?.length);
    if (id === "regional") return !!preset && (REGIONAL_VIBES as readonly string[]).includes(preset);
    return shared;
  });
  return { score, parts, badges, sun, vastu: counted };
}

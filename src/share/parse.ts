import { parseProject } from "../domain/model";
import { STYLE_PRESETS } from "../domain/persist";
import type { Project } from "../domain/types";

/**
 * Reads a shared home leniently: a home made with a newer Dream Home may use a
 * look this copy of the app doesn't know yet, so that falls back to the default.
 */
export function parseShared(raw: unknown): { project: Project; simplified: boolean } {
  const text = JSON.stringify(raw);
  try {
    return { project: parseProject(text), simplified: false };
  } catch (error) {
    const copy = JSON.parse(text) as { style?: { preset?: unknown } };
    if (copy.style && !(STYLE_PRESETS as readonly unknown[]).includes(copy.style.preset)) {
      delete copy.style.preset;
      return { project: parseProject(JSON.stringify(copy)), simplified: true };
    }
    throw error;
  }
}

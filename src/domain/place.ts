// Where the home is and which way it faces: the plot's city (for a true sun
// path) and the compass. Both are undoable edits like any other.
import { northForFacing, type Compass8 } from "./compass";
import { updatePlot } from "./model";
import type { EditResult, PlotLocation, Project } from "./types";

/** Turns the compass so the home faces `facing`, and remembers that north is real. */
export const setFacing = (project: Project, facing: Compass8): EditResult =>
  updatePlot(project, { north: northForFacing(project, facing), compass: true });

/** Sets (or, with null, forgets) the plot's city; coordinates are rounded to 0.01°. */
export function setLocation(project: Project, location: PlotLocation | null): EditResult {
  if (!location) {
    const { location: _gone, ...plot } = project.plot;
    void _gone;
    return updatePlot({ ...project, plot }, {});
  }
  const city = location.city.trim().slice(0, 80);
  if (!city || !Number.isFinite(location.lat) || !Number.isFinite(location.lon) || Math.abs(location.lat) > 90 || Math.abs(location.lon) > 180)
    return { ok: false, error: "Choose a city from the list." };
  const round = (v: number) => Math.round(v * 100) / 100;
  return updatePlot(project, { location: { city, lat: round(location.lat), lon: round(location.lon) } });
}

/** A new home in a known city (unchanged when there's no city or it doesn't validate). */
export function withPlace(project: Project, location: PlotLocation | null | undefined): Project {
  if (!location) return project;
  const r = setLocation(project, location);
  return r.ok ? r.project : project;
}

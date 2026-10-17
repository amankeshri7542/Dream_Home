// The bundled list of Indian cities (loaded only when someone picks a city),
// searching it, and the nearest one to a point.
export type City = { name: string; state: string; lat: number; lon: number; aka?: string[] };

let cached: Promise<City[]> | null = null;
/** The city list, as its own small chunk the first time it's needed. */
export function loadCities(): Promise<City[]> {
  cached ??= import("./cities.json").then((m) => m.default as City[]);
  return cached;
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "");

/**
 * Cities matching what was typed: names (and old names like Bombay) that
 * start with it first, then any that contain it, then states. Empty: the
 * biggest cities.
 */
export function findCities(cities: City[], query: string, limit = 6): City[] {
  const q = fold(query.trim());
  if (!q) return cities.slice(0, limit);
  const names = (c: City) => [c.name, ...(c.aka ?? [])].map(fold);
  const starts = cities.filter((c) => names(c).some((n) => n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q))));
  const contains = cities.filter((c) => !starts.includes(c) && names(c).some((n) => n.includes(q)));
  const states = cities.filter((c) => !starts.includes(c) && !contains.includes(c) && fold(c.state).startsWith(q));
  return [...starts, ...contains, ...states].slice(0, limit);
}

/** The nearest listed city to a point, and how far it is (km). */
export function nearestCity(cities: City[], lat: number, lon: number): { city: City; km: number } | null {
  let best: { city: City; km: number } | null = null;
  for (const city of cities) {
    const dLat = ((city.lat - lat) * Math.PI) / 180,
      dLon = ((city.lon - lon) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((city.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (!best || km < best.km) best = { city, km };
  }
  return best;
}

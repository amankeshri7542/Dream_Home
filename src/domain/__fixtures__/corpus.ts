// A deterministic corpus of real generator output used by golden and property tests.
import compact from "../../../tests/fixtures/legacy-v1-compact.json";
import courtyard from "../../../tests/fixtures/legacy-v1-courtyard.json";
import family from "../../../tests/fixtures/legacy-v1-family.json";
import { createBlueprint, type BlueprintRequest } from "../blueprints";
import { createPreset, parseProject } from "../model";
import { createStarter, type HomeStyle } from "../starters";
import type { Project } from "../types";

const blueprint = (patch: Partial<BlueprintRequest>): BlueprintRequest => ({
  widthCm: 1219,
  depthCm: 1829,
  marginCm: 60,
  road: "south",
  kind: "home",
  floors: 1,
  bedrooms: 3,
  unitsPerFloor: 2,
  bedroomsPerUnit: 2,
  shopsPerFloor: 2,
  ...patch,
});

export function corpus(): Array<{ name: string; project: Project }> {
  const out: Array<{ name: string; project: Project }> = [];
  for (const id of ["compact", "courtyard", "family"] as const)
    out.push({ name: `preset-${id}`, project: createPreset(id) });
  for (const [name, file] of [
    ["v1-compact", compact],
    ["v1-courtyard", courtyard],
    ["v1-family", family],
  ] as const)
    out.push({ name, project: parseProject(JSON.stringify(file)) });
  for (const style of ["family", "courtyard", "open"] as HomeStyle[])
    for (const [w, d] of [
      [610, 1219],
      [914, 1524],
      [1219, 1829],
    ])
      for (const bedrooms of [1, 2, 3] as const)
        for (const floors of [1, 2] as const) {
          const result = createStarter(
            { widthCm: w, depthCm: d, road: "south", marginCm: 60, bedrooms, floors },
            style,
          );
          if (result.ok)
            out.push({
              name: `starter-${style}-${w}x${d}-${bedrooms}b-${floors}f`,
              project: result.project,
            });
        }
  const requests: Array<[string, Partial<BlueprintRequest>]> = [
    ["home-1f", {}],
    ["home-villa", { flavor: "villa" }],
    ["home-duplex", { flavor: "duplex", floors: 2 }],
    ["home-courtyard", { courtyard: true }],
    ["home-3f-east", { floors: 3, road: "east", bedrooms: 5 }],
    ["apartments-3f", { kind: "apartments", floors: 3 }],
    ["apartments-8f", { kind: "apartments", floors: 8, widthCm: 2400, depthCm: 3000 }],
    ["market-2f", { kind: "market", floors: 2 }],
    ["mixed-3f", { kind: "mixed", floors: 3 }],
    ["blank-2f", { kind: "blank", floors: 2 }],
  ];
  for (const [name, patch] of requests) {
    const result = createBlueprint(blueprint(patch));
    if (result.ok) out.push({ name: `blueprint-${name}`, project: result.project });
  }
  return out;
}

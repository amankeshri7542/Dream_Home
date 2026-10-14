import { describe, expect, it } from "vitest";
import { homeChecks } from "../domain/advice";
import { validateProject } from "../domain/model";
import { PLOT_SIZES, TEMPLATES, buildTemplate } from "./templates";

describe("starting home templates", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s builds at its default plot", (_id, template) => {
    const result = buildTemplate(template);
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (!result.ok) return;
    expect(result.project.floors).toHaveLength(template.request.floors);
    if (template.request.kind === "home")
      expect(
        result.project.floors.flatMap((f) => f.rooms).filter((r) => r.kind === "bedroom"),
      ).toHaveLength(template.request.bedrooms);
  });
  it("every tweak range builds at the template plot", () => {
    for (const t of TEMPLATES) {
      if (t.tweak.bedrooms)
        for (const bedrooms of t.tweak.bedrooms)
          expect(buildTemplate(t, { bedrooms }).ok, `${t.id} ${bedrooms} bd`).toBe(true);
      if (t.tweak.floors)
        for (const floors of t.tweak.floors)
          expect(buildTemplate(t, { floors }).ok, `${t.id} ${floors} fl`).toBe(true);
    }
  });
  it("every starting home passes its own checklist, at any plot size and bedroom count", () => {
    for (const t of TEMPLATES.filter((x) => x.id !== "blank"))
      for (const bedrooms of [undefined, ...(t.tweak.bedrooms ?? [])])
        for (const plot of [undefined, ...PLOT_SIZES]) {
          const result = buildTemplate(t, { bedrooms, plot });
          if (!result.ok) continue;
          expect(validateProject(result.project)).toEqual([]);
          const failing = homeChecks(result.project).essentials.filter((c) => !c.done).map((c) => c.id);
          expect(failing, `${t.id} ${bedrooms ?? "default"} bd ${plot?.label ?? "default plot"}`).toEqual([]);
        }
  });
  it("offers plot presets in feet", () => {
    expect(PLOT_SIZES.map((p) => p.label)).toContain("30 × 50 ft");
  });
});

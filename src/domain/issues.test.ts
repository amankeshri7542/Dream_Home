import { describe, expect, it } from "vitest";
import { corpus } from "./__fixtures__/corpus";
import { finalizeEdit } from "./edit";
import { focusIssues, makeIssue } from "./issues";
import {
  createPreset,
  transformComponent,
  updateRoom,
  validateProject,
  validateProjectIssues,
} from "./model";
import type { Project } from "./types";

const compact = () => createPreset("compact");

describe("structured validation issues", () => {
  it("keeps the legacy string API identical to issue messages", () => {
    for (const { project } of corpus()) {
      expect(validateProject(project)).toEqual([]);
      expect(validateProjectIssues(project)).toEqual([]);
    }
    const broken: Project = { ...compact(), name: "" };
    expect(validateProject(broken)).toEqual([
      "Project names must contain 1–80 characters.",
    ]);
    expect(validateProjectIssues(broken)[0]).toMatchObject({
      code: "name",
      severity: "error",
    });
  });

  it("names every overlapping room as a blocker with the attempted bounds", () => {
    const p = compact();
    const [a, b] = p.floors[0].rooms;
    const result = updateRoom(p, p.floors[0].id, b.id, {
      bounds: { ...a.bounds },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues![0];
    expect(issue.code).toBe("room-overlap");
    // The edited room is always the source, even though validation scans in order.
    expect(issue.source).toEqual({
      kind: "room",
      id: b.id,
      floorId: p.floors[0].id,
    });
    expect(issue.blockers.map((x) => x.id)).toContain(a.id);
    expect(result.error).toMatch(/overlaps another room/);
  });

  it("strict moves never swap uses but offer the swap as a fix", () => {
    const p = compact();
    const floor = p.floors[0];
    const source = floor.rooms.find((r) => r.kind === "bathroom")!,
      target = floor.rooms.find((r) => r.kind === "bedroom")!;
    const before = structuredClone(p);
    const strict = transformComponent(
      p,
      floor.id,
      source.id,
      { ...source.bounds, x: target.bounds.x, z: target.bounds.z },
      "move",
      { intent: "strict" },
    );
    expect(strict.ok).toBe(false);
    if (!strict.ok)
      expect(
        strict.issues!.find((i) => i.code === "room-overlap")!.fixes[0],
      ).toMatchObject({
        kind: "swap-uses",
        sourceId: source.id,
        targetId: target.id,
      });
    expect(p).toEqual(before);
  });

  it("focusIssues puts the edited component first and swaps source/blocker", () => {
    const issue = makeIssue("room-overlap", "x", {
      source: { kind: "room", id: "a", floorId: "f" },
      blockers: [{ kind: "room", id: "b", floorId: "f" }],
    });
    const other = makeIssue("name", "y");
    const [first] = focusIssues([other, issue], "b");
    expect(first.source?.id).toBe("b");
    expect(first.blockers[0].id).toBe("a");
  });
});

describe("finalizeEdit", () => {
  it("omits optional keys when empty so plain results stay comparable", () => {
    const p = compact();
    expect(finalizeEdit(p, p)).toEqual({ ok: true, project: p });
    expect(finalizeEdit(p, p, { focusId: "x" })).toEqual({
      ok: true,
      project: p,
      focusId: "x",
    });
  });
});

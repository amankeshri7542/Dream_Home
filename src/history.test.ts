import { describe, expect, it } from "vitest";
import { createPreset } from "./domain/model";
import {
  COALESCE_MS,
  HISTORY_LIMIT,
  createHistory,
  pushHistory,
  redoHistory,
  redoLabel,
  undoHistory,
  undoLabel,
} from "./history";
import type { Project } from "./domain/types";

const base = createPreset("compact");
const named = (name: string): Project => ({ ...base, name });

describe("history", () => {
  it("ignores identical projects and counts revisions", () => {
    const h0 = createHistory(base);
    expect(pushHistory(h0, structuredClone(base), undefined, 0)).toBe(h0);
    const h1 = pushHistory(h0, named("A"), { label: "Rename" }, 0);
    expect(h1.revision).toBe(1);
    expect(undoLabel(h1)).toBe("Rename");
  });
  it("undo and redo restore projects with the meta of the undone edit", () => {
    let h = createHistory(base);
    h = pushHistory(h, named("A"), { label: "Rename", selection: "room-1" }, 0);
    h = pushHistory(h, named("B"), { label: "Rename again" }, 5000);
    const undone = undoHistory(h);
    expect(undone.h.present.name).toBe("A");
    expect(undone.restored?.label).toBe("Rename again");
    expect(redoLabel(undone.h)).toBe("Rename again");
    const back = undoHistory(undone.h);
    expect(back.h.present).toBe(base);
    expect(back.restored?.selection).toBe("room-1");
    const redone = redoHistory(back.h);
    expect(redone.h.present.name).toBe("A");
    expect(redone.restored?.selection).toBe("room-1");
    expect(undoHistory(createHistory(base)).restored).toBeUndefined();
  });
  it("coalesces rapid edits with the same key into one undo step", () => {
    let h = createHistory(base);
    h = pushHistory(h, named("A"), { coalesceKey: "paint" }, 0);
    h = pushHistory(h, named("B"), { coalesceKey: "paint" }, 300);
    h = pushHistory(h, named("C"), { coalesceKey: "paint" }, 600);
    expect(h.past).toHaveLength(1);
    expect(undoHistory(h).h.present).toBe(base);
    h = pushHistory(h, named("D"), { coalesceKey: "paint" }, 600 + COALESCE_MS + 1);
    expect(h.past).toHaveLength(2);
    h = pushHistory(h, named("E"), { coalesceKey: "roof" }, 700 + COALESCE_MS);
    expect(h.past).toHaveLength(3);
  });
  it("keeps at most the history limit and clears redo on a new edit", () => {
    let h = createHistory(base);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++)
      h = pushHistory(h, named(`P${i}`), undefined, i * 5000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    const undone = undoHistory(h).h;
    expect(undone.future).toHaveLength(1);
    expect(pushHistory(undone, named("new"), undefined, 1e9).future).toHaveLength(0);
  });
});

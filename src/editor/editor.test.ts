import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Ray, Vector3 } from "three";
import { createPreset } from "../domain/model";
import { editorReducer, initialEditorState, modeView, sceneView } from "./state";
import { DRAG_THRESHOLD, IDLE, stepGesture, type Gesture } from "./gesture";
import { cmPerPixel, plotToWorld, rayToPlot, worldToPlot } from "./spatial";
import { previewMove, previewResize, snapCandidates, snapRect } from "./transformPreview";
import { normalizePreferences } from "./preferences";

describe("spatial conversions", () => {
  const plot = createPreset("compact").plot;
  it("round-trips plot centimetres through world metres", () => {
    const w = plotToWorld(plot, 250, 600, 1);
    expect(worldToPlot(plot, w)).toEqual({ x: 250, z: 600 });
  });
  it("intersects downward rays with a floor plane and rejects grazing rays", () => {
    const target = plotToWorld(plot, 400, 500, 0.175);
    const origin = target.clone().add(new Vector3(3, 10, 4));
    const ray = new Ray(origin, target.clone().sub(origin).normalize());
    const hit = rayToPlot(ray, 0.175, plot)!;
    expect(hit.x).toBeCloseTo(400, 3);
    expect(hit.z).toBeCloseTo(500, 3);
    expect(rayToPlot(new Ray(origin, new Vector3(1, 0, 0)), 0.175, plot)).toBeNull();
    expect(rayToPlot(new Ray(origin, new Vector3(0, 1, 0)), 0.175, plot)).toBeNull();
  });
  it("measures centimetres per pixel for a perspective camera", () => {
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const cm = cmPerPixel(camera, new Vector3(0, 0, 0), 800);
    expect(cm).toBeCloseTo(((2 * 10 * Math.tan((16 * Math.PI) / 180)) / 800) * 100, 6);
  });
});

describe("gesture state machine", () => {
  const down = (g: Gesture = IDLE) =>
    stepGesture(g, { t: "down", pointerId: 1, client: { x: 0, y: 0 }, kind: "move", revision: 3 }).g;
  it("commits exactly once after a real drag", () => {
    let g = down();
    let r = stepGesture(g, { t: "move", pointerId: 1, client: { x: DRAG_THRESHOLD - 1, y: 0 } });
    expect(r.effect).toBeUndefined();
    r = stepGesture(r.g, { t: "move", pointerId: 1, client: { x: 20, y: 0 } });
    expect(r.effect).toBe("preview");
    g = r.g;
    r = stepGesture(g, { t: "up", pointerId: 1, client: { x: 20, y: 0 } });
    expect(r.effect).toBe("commit");
    expect(stepGesture(r.g, { t: "up", pointerId: 1, client: { x: 20, y: 0 } }).effect).toBeUndefined();
  });
  it("treats a small press as a tap and ignores other pointers", () => {
    const g = down();
    expect(stepGesture(g, { t: "move", pointerId: 2, client: { x: 99, y: 0 } }).g).toBe(g);
    expect(stepGesture(g, { t: "up", pointerId: 2, client: { x: 0, y: 0 } }).g).toBe(g);
    expect(stepGesture(g, { t: "up", pointerId: 1, client: { x: 1, y: 1 } }).effect).toBe("tap");
  });
  it("cancels on escape, lost capture, a second pointer, stale documents or context changes", () => {
    const dragging = stepGesture(down(), { t: "move", pointerId: 1, client: { x: 30, y: 0 } }).g;
    for (const e of [
      { t: "escape" } as const,
      { t: "second-pointer" } as const,
      { t: "context-changed" } as const,
      { t: "lost", pointerId: 1 } as const,
      { t: "cancel", pointerId: 1 } as const,
      { t: "revision", revision: 4 } as const,
    ])
      expect(stepGesture(dragging, e)).toEqual({ g: IDLE, effect: "cancel" });
    expect(stepGesture(dragging, { t: "revision", revision: 3 }).g).toBe(dragging);
    expect(stepGesture(dragging, { t: "cancel", pointerId: 9 }).g).toBe(dragging);
  });
});

describe("transform previews", () => {
  const project = createPreset("compact");
  const floor = project.floors[0];
  const bathroom = floor.rooms.find((r) => r.kind === "bathroom")!;
  const opts = { attract: 30, release: 45 };
  it("snaps edges to nearby walls with hysteresis and guides", () => {
    const candidates = snapCandidates(project, floor.id, bathroom.id);
    expect(candidates.some((c) => c.sourceId === bathroom.id)).toBe(false);
    const near = { ...bathroom.bounds, x: bathroom.bounds.x + 17 };
    const all = { left: true, right: true, top: true, bottom: true };
    const snapped = snapRect(near, all, candidates, opts);
    expect(snapped.guides.length).toBeGreaterThan(0);
    expect(snapped.bounds.x % 10).toBe(0);
    const locked = snapRect(
      { ...near, x: near.x + 15 },
      all,
      candidates,
      { ...opts, lock: snapped.lock },
    );
    expect(locked.lock.x).toBe(snapped.lock.x);
  });
  it("previews strict moves with the same result a commit would give", () => {
    const blocked = previewMove(project, floor.id, bathroom.id, bathroom.bounds, { dx: 0, dz: 2000 }, opts);
    expect(blocked.status).toBe("blocked");
    expect(blocked.issue).toBeDefined();
    const nudge = previewMove(project, floor.id, bathroom.id, bathroom.bounds, { dx: 0, dz: 0 }, opts);
    expect(nudge.result.ok).toBe(true);
  });
  it("keeps the opposite corner fixed while resizing", () => {
    const r = previewResize(project, floor.id, bathroom.id, bathroom.bounds, "se", { dx: -40, dz: -40 }, opts);
    expect(r.bounds.x).toBe(bathroom.bounds.x);
    expect(r.bounds.z).toBe(bathroom.bounds.z);
    expect(r.bounds.w).toBeLessThan(bathroom.bounds.w);
  });
});

describe("editor reducer", () => {
  const s0 = initialEditorState();
  const room = { kind: "room" as const, floorId: "floor-0", id: "floor-0-kitchen" };
  const s0Rooms = [{ id: "floor-0-kitchen" }, { id: "floor-0-living" }];
  it("opens a tapped room as the hero, flying the camera in", () => {
    const s = editorReducer(s0, { type: "select", target: room });
    expect(s.focus).toEqual({ floorId: room.floorId, roomId: room.id });
    expect(s.mode).toBe("decorate");
    expect(s.sheet).toBe("medium");
    expect(s.view.floor).toBe(room.floorId);
    expect(s.camera).toMatchObject({ type: "fit", subject: "room", roomId: room.id, view: "room" });
    expect(sceneView(s).focus).toMatchObject({ roomId: room.id, soft: false });
    // Undo/redo never flies the camera into a room.
    expect(editorReducer(s0, { type: "select", target: room, origin: "history" }).focus).toBeNull();
  });
  it("switches tabs, rooms and back out", () => {
    let s = editorReducer(s0, { type: "select", target: room });
    s = editorReducer(s, { type: "room-tab", tab: "layout" });
    expect(s.mode).toBe("build");
    const other = s0Rooms.find((r) => r.id !== room.id)!;
    s = editorReducer(s, { type: "select", target: { kind: "room", floorId: room.floorId, id: other.id } });
    expect(s.focus?.roomId).toBe(other.id);
    expect(s.roomTab).toBe("layout");
    s = editorReducer(s, { type: "set-mode", mode: "outside" });
    expect(s.focus).toBeNull();
    expect(s.mode).toBe("outside");
  });
  it("steps back through layers with Escape", () => {
    let s = editorReducer(s0, { type: "select", target: room });
    s = editorReducer(s, { type: "room-tab", tab: "layout" });
    s = editorReducer(s, { type: "set-tool", tool: "move" });
    expect(sceneView(s).focus?.soft).toBe(true);
    s = editorReducer(s, { type: "escape" });
    expect(s.tool).toBe("select");
    s = editorReducer(s, { type: "room-tab", tab: "furniture" });
    s = editorReducer(s, { type: "select", target: { kind: "furniture", floorId: room.floorId, roomId: room.id, id: "f1" } });
    s = editorReducer(s, { type: "escape" });
    expect(s.selection).toMatchObject({ kind: "room", id: room.id });
    s = editorReducer(s, { type: "escape" });
    expect(s.focus).toBeNull();
    expect(s.selection).toBeNull();
    expect(s.camera).toMatchObject({ type: "fit", subject: "home", view: "return" });
  });
  it("keeps selections only where the next mode can pick them, and applies view presets", () => {
    const s = editorReducer(editorReducer(s0, { type: "select", target: room }), {
      type: "set-mode",
      mode: "outside",
    });
    expect(s.selection).toBeNull();
    expect(s.view.roof).toBe(true);
    expect(s.camera?.type).toBe("fit");
    expect(modeView("build", s.view).cutaway).toBe(true);
  });
  it("issues increasing camera command ids", () => {
    const a = editorReducer(s0, { type: "camera", command: { type: "dolly", factor: 0.8 } });
    const b = editorReducer(a, { type: "camera", command: { type: "dolly", factor: 0.8 } });
    expect(b.camera!.id).toBeGreaterThan(a.camera!.id);
  });
});

describe("preferences", () => {
  it("normalises unknown or legacy values safely", () => {
    expect(normalizePreferences({ language: "hi", unit: "m" })).toMatchObject({
      language: "en",
      unit: "m",
      tourSeen: false,
      quality: "auto",
    });
    expect(normalizePreferences("nonsense").unit).toBe("ft");
    expect(normalizePreferences({}).streetLife).toBe(true);
    expect(normalizePreferences({ streetLife: false }).streetLife).toBe(false);
    expect(normalizePreferences({}).livedIn).toBe("lived-in");
    expect(normalizePreferences({ livedIn: "tidy" }).livedIn).toBe("tidy");
    expect(normalizePreferences({ livedIn: "messy" }).livedIn).toBe("lived-in");
  });
  it("keeps text size and sounds, with safe defaults", () => {
    expect(normalizePreferences({})).toMatchObject({ textSize: "normal", sounds: true });
    expect(normalizePreferences({ textSize: "extra", sounds: false })).toMatchObject({ textSize: "extra", sounds: false });
    expect(normalizePreferences({ textSize: "huge" }).textSize).toBe("normal");
  });
});

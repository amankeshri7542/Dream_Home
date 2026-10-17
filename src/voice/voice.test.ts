// M7: talk to your home. Every tool maps onto the domain command it names and
// is checked before it runs; a request is one project (one undo step); the
// big changes ask first; the phone answers navigation itself; the context the
// AI sees stays small and id-free.
import { describe, expect, it } from "vitest";
import { createPreset, validateProject } from "../domain/model";
import { resolveFurniture, roomWalls } from "../domain/furniture";
import type { Project, Room } from "../domain/types";
import { TEMPLATES, buildTemplate } from "../onboarding/templates";
import { buildVoiceContext, placeOf, type RefMap } from "./context";
import { matchLocal } from "./local";
import { runActions } from "./runTools";
import { CONTEXT_MAX, TOOL_DEFS, TOOL_NAMES, cleanAction, cleanContext, refsOf, type ToolName, type VoiceAction } from "./tools";

const home = () => createPreset("family");
const view = { unit: "ft" as const, mode: "build" as const, focus: null };
function setup(project: Project = home()) {
  const { context, refs } = buildVoiceContext(project, view);
  const ref = (name: string) => context.rooms.find((r) => r.name === name)!.ref;
  return { project, context, refs, ref };
}
const act = (tool: ToolName, input: Record<string, string | number> = {}): VoiceAction => ({ tool, input });
const run = (p: Project, refs: RefMap, actions: VoiceAction[], confirmed = false) =>
  runActions(p, actions, refs, { unit: "ft", activeFloorId: p.floors[0].id, confirmed });
const rooms = (p: Project) => p.floors.flatMap((f) => f.rooms);
const byName = (p: Project, name: string) => rooms(p).find((r) => r.name === name) as Room;

describe("the tools", () => {
  it("has one definition per tool, each a closed object schema", () => {
    expect(TOOL_DEFS.map((d) => d.name)).toEqual(TOOL_NAMES);
    for (const d of TOOL_DEFS) {
      expect(d.input_schema.additionalProperties).toBe(false);
      for (const key of d.input_schema.required) expect(d.input_schema.properties).toHaveProperty(key);
    }
  });

  // Each edit tool, through the command it names, on a real home.
  const s = setup();
  const cases: [string, VoiceAction, (before: Project, after: Project) => void][] = [
    ["add_room", act("add_room", { kind: "pooja", near: s.ref("Living room") }), (b, a) => {
      expect(rooms(a)).toHaveLength(rooms(b).length + 1);
      expect(byName(a, "Pooja room").kind).toBe("utility");
    }],
    ["resize_room (smaller)", act("resize_room", { room: s.ref("Kitchen"), width: Math.round(byName(s.project, "Kitchen").bounds.w / 30.48) - 2 }), (b, a) =>
      expect(byName(a, "Kitchen").bounds.w).toBeLessThan(byName(b, "Kitchen").bounds.w)],
    ["rename_room", act("rename_room", { room: s.ref("Bedroom 1"), name: "Dadi's room" }), (_b, a) => expect(byName(a, "Dadi's room").kind).toBe("bedroom")],
    ["change_room_use", act("change_room_use", { room: s.ref("Studio"), use: "pooja" }), (_b, a) => expect(byName(a, "Pooja room").kind).toBe("utility")],
    ["change_room_use (to a bedroom)", act("change_room_use", { room: s.ref("Studio"), use: "bedroom" }), (_b, a) => expect(byName(a, "Bedroom 4").kind).toBe("bedroom")],
    ["swap_rooms", act("swap_rooms", { a: s.ref("Kitchen"), b: s.ref("Dining room") }), (b, a) =>
      expect(byName(a, "Kitchen").bounds).toEqual(byName(b, "Dining room").bounds)],
    ["paint_walls", act("paint_walls", { room: s.ref("Bedroom 1"), paint: "dusty-blue" }), (_b, a) => expect(byName(a, "Bedroom 1").wallColor).toBe("dusty-blue")],
    ["set_floor", act("set_floor", { room: s.ref("Living room"), material: "kota" }), (_b, a) => expect(byName(a, "Living room").floorMaterial).toBe("kota")],
    ["accent_wall", act("accent_wall", { room: s.ref("Living room"), paint: "terracotta" }), (_b, a) =>
      expect(byName(a, "Living room").accentWall?.color).toBe("terracotta")],
    ["add_furniture", act("add_furniture", { room: s.ref("Living room"), item: "plant-floor", count: 2 }), (_b, a) =>
      expect(byName(a, "Living room").furniture!.filter((i) => i.catalogId === "plant-floor").length).toBeGreaterThanOrEqual(2)],
    ["remove_furniture", act("remove_furniture", { room: s.ref("Bedroom 1"), item: "wardrobe" }), (b, a) => {
      const count = (p: Project) => resolveFurniture(byName(p, "Bedroom 1"), roomWalls(p, p.floors[0].id)).filter((i) => i.catalogId === "wardrobe").length;
      expect(count(a)).toBe(count(b) - 1);
    }],
    ["make_it_nice", act("make_it_nice", { room: s.ref("Bedroom 1"), vibe: "kerala" }), (b, a) => expect(byName(a, "Bedroom 1")).not.toEqual(byName(b, "Bedroom 1"))],
    ["add_window", act("add_window", { room: s.ref("Bedroom 1") }), (b, a) => expect(a.floors[0].openings).not.toEqual(b.floors[0].openings)],
    ["add_attached_bathroom", act("add_attached_bathroom", { room: s.ref("Bedroom 2") }), (b, a) =>
      expect(rooms(a).filter((r) => r.kind === "bathroom").length).toBe(rooms(b).filter((r) => r.kind === "bathroom").length + 1)],
    ["set_exterior", act("set_exterior", { finish: "laterite" }), (_b, a) => expect(a.style?.exterior).toBe("laterite")],
    ["set_roof", act("set_roof", { style: "gable" }), (_b, a) => expect(a.style?.roof?.style).toBe("gable")],
  ];
  it.each(cases)("%s changes the home through its command", (_name, action, check) => {
    const out = run(s.project, s.refs, [action]);
    expect(out.failure).toBeUndefined();
    expect(out.confirm).toBeUndefined();
    expect(out.changed).toBe(true);
    expect(validateProject(out.project)).toEqual([]);
    check(s.project, out.project);
  });

  it("furnishes an emptied room again, and says when something is already so", () => {
    const empty = run(s.project, s.refs, [act("empty_room", { room: s.ref("Bedroom 1") })], true).project;
    const out = run(empty, s.refs, [act("furnish_room", { room: s.ref("Bedroom 1") })]);
    expect(out.changed).toBe(true);
    expect(byName(out.project, "Bedroom 1").furniture).toBeUndefined();
    const again = run(out.project, s.refs, [act("furnish_room", { room: s.ref("Bedroom 1") }), act("add_door", { room: s.ref("Bedroom 1") })]);
    expect(again.changed).toBe(false);
    expect(again.notes).toEqual(["Bedroom 1 already has its furniture.", "Bedroom 1 already has a door."]);
  });

  it("asks before removing a room, emptying one or changing the look, and does it on a yes", () => {
    for (const [action, text] of [
      [act("remove_room", { room: s.ref("Bedroom 3") }), "I’ll remove Bedroom 3. OK?"],
      [act("empty_room", { room: s.ref("Living room") }), "I’ll take all the furniture out of Living room. OK?"],
      [act("set_look", { look: "kerala" }), "I’ll give the whole home the Kerala look. OK?"],
    ] as const) {
      const asked = run(s.project, s.refs, [action]);
      expect(asked.confirm).toBe(text);
      expect(asked.project).toBe(s.project);
      const done = run(s.project, s.refs, [action], true);
      expect(done.changed).toBe(true);
      expect(validateProject(done.project)).toEqual([]);
    }
    expect(rooms(run(s.project, s.refs, [act("remove_room", { room: s.ref("Bedroom 3") })], true).project).some((r) => r.name === "Bedroom 3")).toBe(false);
    expect(byName(run(s.project, s.refs, [act("empty_room", { room: s.ref("Living room") })], true).project, "Living room").furniture).toEqual([]);
  });

  it("asks to grow the house when a room needs more space, then grows it", () => {
    const bedroom = byName(s.project, "Bedroom 1");
    const deeper = act("resize_room", { room: s.ref("Bedroom 1"), depth: s.context.rooms.find((r) => r.name === "Bedroom 1")!.d + 4 });
    const asked = run(s.project, s.refs, [deeper]);
    expect(asked.confirm).toBe("There isn’t room for that, so I’ll make the house bigger first. OK?");
    expect(asked.project).toBe(s.project);
    const grown = run(s.project, s.refs, [deeper], true);
    expect(byName(grown.project, "Bedroom 1").bounds.d).toBeGreaterThan(bedroom.bounds.d);
    expect(grown.project.floors[0].footprint.d).toBeGreaterThan(s.project.floors[0].footprint.d);
    expect(validateProject(grown.project)).toEqual([]);
    // Too big even for a grown house: it says why instead.
    const tight = setup(createPreset("compact"));
    const huge = run(tight.project, tight.refs, [act("add_room", { kind: "bedroom", size: "large" })]);
    expect(huge.confirm).toBeUndefined();
    expect(huge.failure).toMatch(/needs more space/);
  });

  it("chains a request into one project and stops at the first thing it can't do", () => {
    const out = run(s.project, s.refs, [
      act("paint_walls", { room: s.ref("Kitchen"), paint: "sage" }),
      act("set_floor", { room: s.ref("Kitchen"), material: "terrazzo" }),
      act("remove_furniture", { room: s.ref("Kitchen"), item: "bathtub" }),
      act("paint_walls", { room: s.ref("Bedroom 1"), paint: "blush" }),
    ]);
    expect(byName(out.project, "Kitchen")).toMatchObject({ wallColor: "sage", floorMaterial: "terrazzo" });
    expect(out.failure).toBe("There’s no bathtub in Kitchen.");
    expect(byName(out.project, "Bedroom 1").wallColor).toBeUndefined();
  });

  it("returns views to show, and keeps undo and redo on their own", () => {
    const out = run(s.project, s.refs, [act("open_room", { room: s.ref("Kitchen") }), act("set_time", { hour: 20 }), act("show_vastu")]);
    expect(out.changed).toBe(false);
    expect(out.views).toEqual([
      { type: "open-room", floorId: s.project.floors[0].id, roomId: byName(s.project, "Kitchen").id },
      { type: "hour", hour: 20 },
      { type: "vastu" },
    ]);
    expect(run(s.project, s.refs, [act("undo")]).history).toEqual(["undo"]);
    expect(run(s.project, s.refs, [act("undo"), act("paint_walls", { room: s.ref("Kitchen"), paint: "sage" })]).failure).toMatch(/on its own/);
    expect(run(s.project, s.refs, [act("set_roof", { style: "hip" })]).views).toEqual([{ type: "outside" }]);
  });
});

describe("checking what the AI sends", () => {
  const s = setup();
  const refs = refsOf(s.context);
  it("keeps good calls and drops anything else", () => {
    expect(cleanAction({ name: "paint_walls", input: { room: "r1", paint: "sage" } }, refs)).toEqual(act("paint_walls", { room: "r1", paint: "sage" }));
    expect(cleanAction({ name: "rename_room", input: { room: "r1", name: "  <b>Nani’s   room</b> " } }, refs)?.input.name).toBe("bNani’s room/b");
    for (const bad of [
      { name: "delete_everything", input: {} },
      { name: "paint_walls", input: { room: "r1", paint: "neon" } },
      { name: "paint_walls", input: { room: "r99", paint: "sage" } },
      { name: "paint_walls", input: { room: "r1", paint: "sage", extra: 1 } },
      { name: "paint_walls", input: { room: "r1", paint: "sky" } },
      { name: "paint_walls", input: { room: "r1" } },
      { name: "paint_walls", input: "r1 sky" },
      { name: "add_furniture", input: { room: "r1", item: "sofa-3", count: 9 } },
      { name: "resize_room", input: { room: "r1", width: "huge" } },
      { name: "set_time", input: { hour: 25 } },
      { name: "add_room", input: { kind: "garage" } },
      { name: "add_room", input: { kind: "bedroom", floor: "f9" } },
      { name: "swap_rooms", input: { a: "r1", b: "r1" } },
      { name: "rename_room", input: { room: "r1", name: "<>" } },
    ])
      expect(cleanAction(bad, refs), JSON.stringify(bad)).toBeNull();
  });

  it("rebuilds the context field by field and refuses nonsense", () => {
    expect(cleanContext(s.context)).toEqual(s.context);
    expect(cleanContext({ ...s.context, secret: "x", rooms: [...s.context.rooms, { ref: "r9x", name: "x", kind: "bedroom", floor: "f1", w: 1, d: 1 }] })).toEqual(s.context);
    expect(cleanContext({ rooms: "all" })).toBeNull();
    expect(cleanContext({ floors: [], rooms: Array(61).fill({}) })).toBeNull();
  });
});

describe("the context", () => {
  it("stays under 3 KB, id-free, on every starting home and preset", () => {
    const homes = [
      ...TEMPLATES.flatMap((t) => {
        const r = buildTemplate(t);
        return r.ok ? [r.project] : [];
      }),
      createPreset("family"),
      createPreset("courtyard"),
    ];
    let biggest = 0;
    for (const p of homes) {
      const { context, refs } = buildVoiceContext(p, view);
      const text = JSON.stringify(context);
      biggest = Math.max(biggest, text.length);
      expect(text.length).toBeLessThanOrEqual(CONTEXT_MAX);
      for (const f of p.floors) for (const r of f.rooms) expect(text).not.toContain(r.id);
      for (const [ref, at] of refs.rooms) expect(context.rooms.find((r) => r.ref === ref)!.name).toBe(byName(p, rooms(p).find((r) => r.id === at.roomId)!.name).name);
    }
    expect(biggest).toBeGreaterThan(300);
  });

  it("names where each room sits as seen from the road", () => {
    const fp = { x: 0, z: 0, w: 900, d: 1200 };
    expect(placeOf("south", fp, { x: 0, z: 900, w: 300, d: 300 })).toBe("front-left");
    expect(placeOf("north", fp, { x: 0, z: 900, w: 300, d: 300 })).toBe("back-right");
    expect(placeOf("east", fp, { x: 600, z: 0, w: 300, d: 300 })).toBe("front-right");
    expect(placeOf("west", fp, { x: 300, z: 450, w: 300, d: 300 })).toBe("middle");
  });

  it("tells the AI what's in the open room", () => {
    const p = home();
    const kitchen = byName(p, "Kitchen");
    const { context } = buildVoiceContext(p, { ...view, focus: { floorId: p.floors[0].id, roomId: kitchen.id } });
    expect(context.mode).toBe("room");
    expect(context.rooms.find((r) => r.ref === context.open)!.name).toBe("Kitchen");
    expect(context.items).toContain("fridge");
  });
});

describe("answering on the phone", () => {
  const s = setup();
  const kitchen = s.ref("Kitchen");
  it.each([
    ["Undo", "undo"],
    ["undo that please", "undo"],
    ["अनडू", "undo"],
    ["पहले जैसा करो", "undo"],
    ["redo", "redo"],
    ["Night", "set_time"],
    ["Show me the house at night.", "set_time"],
    ["raat karo", "set_time"],
    ["रात", "set_time"],
    ["रात दिखाओ", "set_time"],
    ["day", "set_time"],
    ["din karo", "set_time"],
    ["explore", "explore"],
    ["घर घुमाओ", "explore"],
    ["walk inside", "explore"],
    ["show vastu", "show_vastu"],
    ["वास्तु दिखाओ", "show_vastu"],
    ["dhoop dikhao", "show_sunlight"],
    ["go home", "go_home"],
    ["पूरा घर दिखाओ", "go_home"],
  ])("“%s” → %s", (said, tool) => {
    expect(matchLocal(said, s.context.rooms)?.actions[0].tool).toBe(tool);
  });

  it.each([["open the kitchen"], ["Open kitchen"], ["show me the kitchen"], ["kitchen kholo"], ["रसोई खोलो"], ["किचन खोलो"], ["go to kitchen"]])(
    "“%s” opens the kitchen",
    (said) => expect(matchLocal(said, s.context.rooms)?.actions).toEqual([act("open_room", { room: kitchen })]),
  );

  it("opens a room by its own name, and asks which when there are several", () => {
    expect(matchLocal("open bedroom 2", s.context.rooms)?.actions[0].input.room).toBe(s.ref("Bedroom 2"));
    expect(matchLocal("open बेडरूम २", s.context.rooms)).toBeNull();
    expect(matchLocal("open Bedroom 2", s.context.rooms)?.reply.hi).toBe("Bedroom 2 खोल रहे हैं।");
    const which = matchLocal("open the bedroom", s.context.rooms)!;
    expect(which.actions).toEqual([]);
    expect(which.reply.en).toBe("Which one? Bedroom 1, Bedroom 2, Bedroom 3.");
  });

  it.each([["make the kitchen bigger"], ["Bedroom ko neela karo"], ["add a pooja room near the entrance"], ["open the garage"], ["night lights for the garden"], [""]])(
    "leaves “%s” to the AI",
    (said) => expect(matchLocal(said, s.context.rooms)).toBeNull(),
  );
});

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { homeChecks, type HomeCheck } from "../domain/advice";
import { addRoomWindow, ensureRoomDoor } from "../domain/openingCommands";
import { addAttachedBathroom } from "../domain/ensuite";
import { useEditor } from "../editor/EditorProvider";
import { targetForId } from "../editor/selection";
import type { EditorMode } from "../editor/types";
import type { IssueFix } from "../domain/types";
import { Icon } from "../ui/icons";
import { IconButton } from "../ui/primitives";
import { Celebration } from "./Celebration";

const QUEST_MODE: Record<string, EditorMode> = {
  furnish: "decorate",
  paint: "decorate",
  roof: "outside",
  garden: "outside",
};

/** A gentle, friendly checklist — "friendly checks, not building-code checks". */
export function ChecklistPill() {
  const editor = useEditor();
  const { project, dispatch, run } = editor;
  const checks = useMemo(() => homeChecks(project), [project]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const done = checks.essentials.filter((c) => c.done).length;
  const total = checks.essentials.length;
  const complete = done === total;
  const questsDone = checks.quests.filter((c) => c.done);
  // A quick cheer for each "make it yours" idea the moment it's done.
  const cheered = useRef(new Set(questsDone.map((c) => c.id)));
  useEffect(() => {
    for (const q of questsDone)
      if (!cheered.current.has(q.id)) {
        cheered.current.add(q.id);
        dispatch({ type: "notify", text: `Nice! “${q.label}” — done.`, tone: "success" });
      }
    // Re-run when the set of finished ideas changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questsDone.map((q) => q.id).join(","), dispatch]);
  const missing = checks.essentials.filter((c) => !c.done).map((c) => c.id);
  const wasMissing = useRef(missing);
  const celebrated = useRef(false);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    // Celebrate fixing a real essential — not opening a home that was already
    // complete, and not merely putting a set-aside room back. Once per visit.
    const fixedSomething = wasMissing.current.some((id) => id !== "tray");
    if (complete && fixedSomething && !celebrated.current) {
      celebrated.current = true;
      setCelebrate(true);
    }
    if (!complete) setCelebrate(false);
    wasMissing.current = missing;
    // `missing` is derived from `checks`; `complete` changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, checks]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const fix = (f: IssueFix) => {
    setOpen(false);
    if (f.kind === "add-door") {
      dispatch({ type: "set-mode", mode: "openings" });
      run(ensureRoomDoor(project, f.floorId, f.roomId), "Add a door", {
        select: { kind: "room", floorId: f.floorId, id: f.roomId },
        notice: "Door added!",
        quietError: true,
      });
    } else if (f.kind === "add-window") {
      dispatch({ type: "set-mode", mode: "openings" });
      run(addRoomWindow(project, f.floorId, f.roomId), "Add a window", {
        select: { kind: "room", floorId: f.floorId, id: f.roomId },
        notice: "Window added — let the light in!",
        quietError: true,
      });
    } else if (f.kind === "edit") {
      const t = targetForId(project, f.target.id, "floorId" in f.target ? f.target.floorId : null);
      if (!t) return;
      dispatch({ type: "set-mode", mode: "build" });
      dispatch({ type: "select", target: t });
      if (f.focus === "move" && t.kind === "room") {
        // An inner room: say why, and hand over the Move tool straight away.
        const name = project.floors.flatMap((fl) => fl.rooms).find((r) => r.id === t.id)?.name ?? "This room";
        dispatch({ type: "set-tool", tool: "move", lens: false });
        dispatch({
          type: "notify",
          text: `${name} has no outside wall for a window. Drag it to an edge of the house — or swap it with a room that has one.`,
        });
      }
    } else if (f.kind === "set-aside") {
      dispatch({ type: "open-panel", panel: "tray" });
    }
  };
  const showMe = (check: HomeCheck) => {
    if (check.fix) return fix(check.fix);
    setOpen(false);
    if (check.id === "tray") dispatch({ type: "open-panel", panel: "tray" });
    else if (check.id === "kitchen" || check.id === "bathroom") {
      // One already waiting in the tray? Show it there, ready to place.
      const waiting = project.stagedRooms?.find((s) => s.room.kind === check.id);
      dispatch({ type: "set-mode", mode: "build" });
      if (waiting) {
        dispatch({ type: "open-panel", panel: "tray" });
        dispatch({ type: "tray-select", id: waiting.room.id });
      } else dispatch({ type: "open-panel", panel: "catalog", pick: check.id });
    }
    else if (check.id === "stairs") dispatch({ type: "open-panel", panel: "catalog" });
    else if (check.id === "ensuite") {
      // Straight to it: the biggest bedroom gets its own bathroom.
      const bedrooms = project.floors.flatMap((f) =>
        f.rooms.filter((r) => r.kind === "bedroom").map((room) => ({ floorId: f.id, room })),
      );
      const biggest = bedrooms.sort(
        (a, b) => b.room.bounds.w * b.room.bounds.d - a.room.bounds.w * a.room.bounds.d,
      )[0];
      if (!biggest) return;
      dispatch({ type: "set-mode", mode: "build" });
      run(addAttachedBathroom(project, biggest.floorId, biggest.room.id), `Add a bathroom to ${biggest.room.name}`, {
        select: { kind: "room", floorId: biggest.floorId, id: biggest.room.id },
        notice: `${biggest.room.name} has its own bathroom now!`,
        quietError: true,
      });
    } else if (QUEST_MODE[check.id]) dispatch({ type: "set-mode", mode: QUEST_MODE[check.id] });
  };
  return (
    <div className="dh-checklist" ref={ref} data-chrome="checklist">
      {celebrate &&
        // Above every other surface: portalled to the app root, outside the
        // checklist's own layer.
        createPortal(
          <Celebration
            onExplore={() => {
              setCelebrate(false);
              dispatch({ type: "set-mode", mode: "explore" });
            }}
            onClose={() => setCelebrate(false)}
          />,
          ref.current?.closest(".dh-app") ?? document.body,
        )}
      <button
        type="button"
        className={`dh-checklist-pill ${complete ? "is-complete" : ""}`}
        aria-label={
          complete
            ? `Home checklist, ${done} of ${total} done, ${questsDone.length} of ${checks.quests.length} ideas tried`
            : `Home checklist, ${done} of ${total} done`
        }
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {complete ? <Icon.sparkle size={17} aria-hidden /> : <Icon.checklist size={17} aria-hidden />}
        <span className="dh-num">
          {complete ? `${questsDone.length}/${checks.quests.length}` : `${done}/${total}`}
        </span>
        {complete && <span className="dh-checklist-pill-label">ideas</span>}
      </button>
      {open && (
        <div className="dh-checklist-pop" role="dialog" aria-label="Home checklist">
          <div className="dh-popover-head">
            <h2>{complete ? "Ready to move in!" : "Home checklist"}</h2>
            <IconButton icon={Icon.close} tone="plain" label="Close checklist" onClick={() => setOpen(false)} />
          </div>
          <p className="dh-note">Friendly checks, not building-code checks.</p>
          <ul>
            {checks.essentials.map((c) => (
              <li key={c.id} className={c.done ? "is-done" : ""}>
                <span className="dh-check-mark" aria-hidden>
                  {c.done ? <Icon.check size={15} aria-hidden /> : null}
                </span>
                <span>{c.label}</span>
                {!c.done && (
                  <button type="button" onClick={() => showMe(c)}>
                    {c.fix ? "Fix it" : "Show me"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <h3>Make it yours</h3>
          <ul>
            {checks.quests.map((c) => (
              <li key={c.id} className={c.done ? "is-done" : ""}>
                <span className="dh-check-mark is-quest" aria-hidden>
                  {c.done ? <Icon.sparkle size={14} aria-hidden /> : null}
                </span>
                <span>{c.label}</span>
                {!c.done && (
                  <button type="button" onClick={() => showMe(c)}>
                    Try it
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

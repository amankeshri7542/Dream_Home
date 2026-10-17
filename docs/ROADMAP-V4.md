# Dream Home v4: living roadmap

This file is updated after every milestone. If work stops (for example because a usage limit is hit), start at **Resume here**. The full plan is in this conversation's plan file. The summary below is enough to continue.

## Resume here
- **M1** (doors that always work) is done. Its code is in `src/domain/circulationGrid.ts` and `circulation.ts`, plus changes to `walls.ts`, `openings.ts`, `advice.ts`, `ensuite.ts`, `geometry.ts` (`snugRect`) and `src/ai/buildHome.ts`.
- **M3** (designer interiors) is being built by a helper agent. Its running log is `docs/m3v4-progress.md`.
- **M2** (Room Studio) is in progress (me). Done so far:
  - **State:** `focus`, `roomTab` and `homeFloor`; the actions `enter-room`, `leave-room` and `room-tab`; `sceneView()`.
  - **Room order:** `src/editor/rooms.ts`.
  - **Dollhouse shader:** `src/scene/materials/focus.ts` and the patch in `patches.ts`/`library.ts`, tweened in `Building.tsx`, with focus-aware picking in `Scene.tsx`.
  - **Camera:** `roomHeroPose` and the `room`/`return` views; the joint inset cap in `fit.ts`; commands end the intro glide.
  - **UI:** `src/shell/studio/RoomStudio.tsx` (+ `studio.css`), `src/shell/HomeBar.tsx` (Home bar, Outside bar, `SpaceTabs`), and `src/shell/SheetParts.tsx` (Header and SheetHandle moved there). AppShell and TopBar use the HomeBar; the ModeBar and ToolPalette are no longer rendered.
  - **Browser tests migrated** (2026-10-17). Helpers in `tests/support/dreamHome.ts`: `tool`, `controls`, `dock`, `enterRoom` (steps through floors when a label is hidden), `goHome`, `homeAction`, `roomTab`, `ROOM_ACTIONS` (a room's bar, never "Home actions"), `settledInsets`.
  - Fixes found by the migration:
    - the Layout tab keeps the floor plan open;
    - the room tray shows "Show details" when tucked down;
    - the plan re-frames when its pane changes size, so a room can't drift off-screen;
    - one action bar at a time (the floating one while moving);
    - the More menu opens downward inside the panel;
    - the studio title and details are one line each;
    - the checklist stays mounted in a room, so finishing the home still celebrates;
    - the catalog region is named "Add room";
    - the Add room button says "Add room, n set aside";
    - the duplicate "Back to {room}" button is gone.
  - Cleanup done: `ModeBar.tsx`, `ToolPalette` and `ModeTools` were deleted with their CSS. Phones drop the zoom buttons (pinch) and the floating Hide button; Hide is now in View options. The desktop room actions fit the panel.
- **M2, M3 and M4 are done** (17 Oct). The full gate is green (see `docs/VERIFICATION.md`). Waiting for the owner to say whether to commit, push and deploy.

## Decisions (owner, 15 Oct 2026)
- **Dollhouse room hero.** Tapping a room flies the camera to it. Its neighbours fade, the walls are cut low and the room glows. The tools live in a short tray.
- **Two levels: Home and Room.**
  - Build, Doors & windows and Decorate become the room tabs Furniture · Colours · Layout · Doors.
  - The Home level keeps four big actions: Add room, Outside, Explore and ✨ AI.
- **A designer pack** of about 18 new Blender pieces, plus designer auto layouts.
- **Desktop** gets the same Home → Room flow, with the room tools in the side panel.
- **Commits and pushes** happen only when the owner's latest message asks. Ask before spending money on live AI calls.

## Milestones
- [x] **M1** Doors that always work:
  - a circulation module (reachability, door approach);
  - door choice;
  - placement without slivers;
  - checks.
- [x] **M2** Room Studio:
  - 2.0 groundwork;
  - 2.1 the dollhouse view;
  - 2.2 the Room Studio surface;
  - 2.3 the Home chrome;
  - 2.4 polish;
  - 2.5 cleanup.
- [x] **M3** Designer interiors:
  - the new pieces;
  - designer layouts;
  - coordinated palettes;
  - an accent wall;
  - night lights.
- [x] **M4** Review, docs, final checks.

## Progress log
- **2026-10-15:** Plan approved. M3 started in the background; M1 started.
- **2026-10-15 (M1):**
  - Before: 83 of 196 generated homes (every template × plot × bedroom count, plus the AI planner) had a room nobody could reach, or a door facing a wall or gap. Causes:
    - doors were chosen by probing just 1 cm and preferred "nothing behind the wall";
    - en-suites and added rooms cut off passages;
    - doors that had become explicit were never re-checked.
  - After: 0 of 196.
  - New rules:
    - door approaches must be walkable (90 × 80 cm, ≥ 70 cm clear);
    - every room must be reachable from the entrance or stairs, with a second or "bridge" door if needed;
    - reconcile moves blocked doors;
    - two new advisories, `door-blocked` and `room-unreachable`, feed the "doors" essential, and their one-tap fix is `ensureRoomDoor`;
    - en-suites can't strand anyone;
    - new rooms go into snug spots (`snugRect`);
    - the AI grows the house by exactly the room's depth.
  - Golden snapshots were regenerated for the doors.
  - Checks: 620 unit tests; 90 of 91 browser tests on the first run (one AI flow timed out under load and passed on retry).
- **2026-10-17 (M2–M4):** The browser tests were moved to the Home → Room flow, which surfaced real fixes (listed under Resume here). The interior screenshots were inspected. Cleanup is done, and the README and VERIFICATION docs are updated. Gate: 687 unit tests, 93 browser tests, build, lint and typecheck all passed.

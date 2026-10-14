# Dream Home — the warm diorama sandbox

This document records the product and technical direction of the October 2026
transformation: from a form-driven planner into a playful, immersive 3D
home-building sandbox. It supersedes `LIVING-BLUEPRINT-PLAN.md`, whose
foundation (an always-mounted canvas, an editor controller, structured issues,
strict physical moves) it adopts and extends.

## Experience principles

1. **The home is the interface.** One full-bleed 3D canvas is mounted once for
   the whole session — behind the title screen, while editing, in the plan
   lens and in Explore. Panels float over it and never resize or remount it.
   Camera framing follows the clear region between the chrome instead.
2. **Tap, then change.** Selecting anything opens a compact peek card and an
   action dock with the next obvious actions (Move, Resize, Rotate, Duplicate,
   Set aside). Full details are one tap away, grouped into short sections.
3. **Nothing is ever lost.** Every edit is undoable with a human label
   ("Undid: Move Bedroom 1"); undo re-selects what changed. Removing a room asks
   first and offers *Set aside instead* as the safe default. Rejected moves add
   no history.
4. **Feedback where the action is.** Green fits, amber snaps, red shows what is
   in the way — always with words and icons, never colour alone. Messages are
   friendly and never block taps on the home underneath.
5. **Grab it, drag it — or tap instead.** Rooms, balconies, stairs and
   courtyards move directly in 3D: press Move (or, with a mouse, just drag the
   selected piece) and drag the floor or the room's name label. A ghost shows
   where it lands and why ("Swap with Kitchen", "Bumps into Bathroom"); drop it
   on the Tray button to set it aside. Every drag still has a tap alternative —
   nudge arrows, exact numbers, keyboard shortcuts, "find space" and
   auto-placement — and the 2D plan stays one tap away.
6. **Warm diorama look.** Golden-hour sky and time-of-day sun, soft ambient
   occlusion, matte plaster, warm oak and terracotta, chunky rounded furniture
   modelled in Blender, a narrow-FOV perspective camera with gentle glides.

## Information architecture

| Mode | Purpose |
|---|---|
| Build | Rooms, balconies, courtyards, stairs, floors, plot, tray |
| Doors & windows | Place, slide, restyle and remove openings; reset to automatic |
| Decorate | Furniture catalog with Blender thumbnails, wall paint, floor materials |
| Outside | Exterior finish, roof style and material, trim; garden and site |
| Explore | Turntable showcase, time of day and night glow, photos, walkthrough |

Modes appear in the mode bar only once they are fully functional, so the app
never shows a dead button.

Shell surfaces (`src/shell/`): top bar (brand → home screen, project name,
save state, History, Share, More), mode bar, tool palette (desktop: left rail),
contextual action dock, inspector (phones: sheet with peek/medium/expanded;
desktop: right panel), floor "elevator", camera HUD and View options, plan lens
(phones: overlay with its own floor and view controls; desktop: docked beside
the rail; primary surface when WebGL is unavailable), notifications and
confirmations.

Onboarding (`src/onboarding/`): a title screen once per browser session
(Continue / Start a new home / Try the sample / Open a saved project, plus a
recovery banner for damaged saves), a template gallery of eight starting homes
with live 3D previews and simple steppers, a construction reveal and a
three-step coach-mark tour (remembered in preferences).

## Architecture

```
src/domain/    pure rules: types, validation with structured issues (validate.ts),
               the single edit gate finalizeEdit (edit.ts), walls with multiple
               openings (walls.ts), openings, furniture, landscape, materials,
               catalogs (catalog/*.json, shared with Blender)
src/history.ts pure undo/redo with labels, selection restore, coalescing, revision
src/useProject.ts  the only owner of the document; autosave, recovery
src/editor/    UI controller (pure reducer state.ts), EditorProvider (labelled
               runs, undo/redo restore, shortcuts), selection, spatial maths,
               gesture state machine, snapping previews, preferences
src/ui/        design tokens, fonts, primitives, icon registry (one meaning per glyph)
src/shell/     the workspace chrome
src/onboarding/ title screen, template gallery, coach marks
src/explore/   Explore HUD, photo dialog, first-person walkthrough (walk
               physics, joystick, tap-to-walk, floor changes, plaster ceiling)
src/scene/     renderer v2 (camera rig, sky/env/lights, materials, building
               geometry, props, quality tiers, lazy effects, debug bridge)
scripts/blender/ headless Blender asset kit → public/models + public/thumbs
```

### Compatibility rules

- The save format stays `schemaVersion: 2`. Every new field is optional and
  means "automatic, exactly as before" when absent: `Floor.openings`,
  `Room.furniture`, `Room.wallColor`, `Room.floorMaterial`, `Project.style`,
  `Project.site`, `Project.landscape`.
- Existing enums (`finish`, `floorFinish`) are never widened; richer ids live in
  new fields and the legacy field keeps the nearest family, so older builds can
  still open newer saves.
- Golden snapshot tests lock automatic walls, openings and furnishings to their
  pre-transformation output for 57 generated homes.
- `migration.ts` and the save keys are unchanged.

### Direct manipulation

`src/shell/MoveInteraction.tsx` (lazy, rendered inside the Canvas) listens on
the scene host in the capture phase, so a press on a movable piece is taken
before the orbit controls; presses anywhere else still orbit. Previews run once
per animation frame through `previewMove` — the same command that commits, so
the ghost and the result always agree — with edge/centre snapping scaled to
screen pixels. One gesture commits once; Escape, a second finger, a lost
pointer, a document change or leaving Build cancels it. Resizing stays in the
plan lens, which Resize opens automatically.

`src/shell/FurnitureDrag.tsx` does the same for furniture in Decorate: press
the selected piece (its top or its footprint) and drag it across the floor or
into another room; `moveFurniture` previews and commits. Choosing a room in
Decorate or Doors & windows glides the camera into it so pieces are big
enough to tap, and that room's floating label steps aside.

### Rendering budgets

Lazy scene chunk, separate lazy post-processing chunk (never loaded on the
Battery tier), demand frame loop (zero frames when idle), assets served from
the app origin only (no CDNs, no HDRI downloads, no Draco).

## Tooling notes

- `node_modules` is a symlink to `node_modules.nosync` because the project lives
  in an iCloud-synced folder; iCloud had evicted the dependencies to
  on-demand placeholders, which stalled every tool. After `npm install`
  replaces the symlink, move the folder back:
  `rm -rf node_modules.nosync && mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`.
- `npm run assets` rebuilds the Blender kit (needs Blender 5.1; override the
  path with `BLENDER_PATH`). The web build never needs Blender.

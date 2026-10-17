# M3 (v4) "Designer interiors" — progress log

Owner: interiors engineer. No git commands; the lead commits.

## Done
- D1 catalog: 19 new entries in `src/domain/catalog/furniture.json` (18 pieces + `backsplash-module`),
  new finishes (fabric/accent `peacock`, `maroon`; wood `teak`) appended to existing finish lists,
  `surface` heights for pieces decor can rest on, `light.y` now relative to the item's base,
  `diya` moved to the new `decor` layer. New layers: `wall` (flat wall coverings) and `decor`
  (tabletop styling that rests on the surface below it).
- `scripts/blender/dh/catalog.py`: slot defaults pinned (fabric sage / wood oak / accent sage) so new
  items never recolour existing models; `grounded` = not ceiling and no mountY.
- Blender models + thumbnails: delegated to a sub-agent (scripts/blender/items/designer.py).

- D2 designer auto layouts (furniture.ts): new engine `designer()` + recipes per kind (bedroom, living,
  kitchen with fridge-bay variant, dining, bathroom, pooja, study, utility, shop), 4-rotation scoring
  kept, bed/sofa size variants, door approaches + door/window spans per canonical wall, 80 cm
  walkway / snug rule, front-access zones, 5 cm same-layer gap (lossless 5 cm snapping), memo cache.
  `tileModules` moved to the domain. `furnitureBaseY` (decor rests on `surface`), `isAccessory`
  (use change → auto layout when only accessories remain). Procedural generators for all new ids.
  Tests: src/domain/designerLayouts.test.ts (1,575 layouts), furniture.test.ts/roomDetails.test.ts
  updated. Golden snapshots NOT yet updated (pending final tuning).
- Blender sub-agent relaunched (first one died at the usage limit before writing anything).

- D3 coordinated by default: `roomPalette(look, room)` / `autoPalette(project, room)` /
  `paletteFinish` / `paletteTint` / `effectiveFinish` in materials.ts; `roomWallPaint(room, look?)`,
  `roomFloorMaterial(room, look?)` use the look palette only when the room has none set (old saves
  without a preset unchanged). Furniture.tsx tints finish + secondary tintable slots from the palette.
  Look plumbing: FloorStyle.look (useStableFloors.ts) → WallContext.look / emitRoomFloors (buildFloor.ts,
  floors.ts). InteriorContext (src/scene/props/interior.ts) provided in SceneRoot.tsx.
- D4 accent wall: `Room.accentWall?: {edge, color}` (types.ts, persist.ts check+copy),
  `setRoomAccentWall`, `roomAccentWall`, `suggestAccentWall`, `ACCENT_FOR_PAINT` (materials.ts),
  validation; `facePaint` in scene walls.ts paints the inside face; `roomFocalWall` (furniture.ts).
- D5 night: Night.tsx fixed pool of 8 shadowless point lights (Explore, non-battery, glow ≥ 0.3) from
  `interiorLamps` (src/scene/props/lamps.ts); fake pools dimmed when real lamps are on.
- D6 AI: planner EXTRAS + feature walls; prompt designer guidance + finish lists from the catalog;
  schema `accentWall` (+ NOT_EXTRAS chimney/backsplash/bed-panel); brief PlannedRoom/RoomPlan.accentWall.
- Decor placement: findFurnitureSpot puts decor on surfaces (DECOR_HOSTS).
- Tests: src/domain/interiorStyle.test.ts.

- D1 models: scripts/blender/items/designer.py (sub-agent), `npm run assets` green:
  interior.glb 348,156 B (budget raised to 420,000 in build.mjs and src/scene/assets/kit.test.ts),
  32,898 tris; exterior/street unchanged. triBudget: shoe-rack 700, sideboard 850. 19 new thumbs.
- Living / dining rooms get a dining set (`diningSet`), dining table/chairs allowed in living.
- Night lights also from kitchen-chimney and mirror-cabinet (`light` fields).
- tests/interiors.spec.ts: perf (Build 76–79 calls, 0 idle frames; Explore walk at night ≈130 calls,
  lamps lit; battery: no lamp pool) + DH_SHOTS screenshots via the scene lab (LabApp `useProject`).

## Next
- golden snapshots (only furnishings), screenshots at all sizes, visual iteration, full gate.
- materials.ts: accent wall, look-based default paints/floors. persist.ts: accentWall.
- Furniture.tsx: palette tints, wall-flush, decor heights. Night.tsx: pooled lamp lights.
- planner/prompt/schema, tests, golden snapshots, screenshots, perf.

## Files touched
src/domain/catalog/furniture.json, scripts/blender/dh/catalog.py, docs/m3v4-progress.md,
src/domain/furniture.ts, furnitureCommands.ts, materials.ts, types.ts (accentWall), persist.ts,
src/domain/furniture.test.ts, roomDetails.test.ts, designerLayouts.test.ts (new), interiorStyle.test.ts (new),
src/scene/props/Furniture.tsx, interior.ts (new), lamps.ts (new), src/scene/environment/Night.tsx,
src/scene/building/geometry/walls.ts; outside my list (tiny plumbing, unowned): src/scene/SceneRoot.tsx,
src/scene/building/useStableFloors.ts, buildFloor.ts, geometry/floors.ts;
src/ai/planner.ts, prompt.ts, schema.ts, brief.ts.

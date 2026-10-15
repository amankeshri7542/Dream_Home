# M3 "Indian homes by default" — progress log

Owner: 3D/renderer engineer. No git commands; lead commits.

## Done
- D1 style presets: `ProjectStyle.preset`, `ProjectStyle.details` (types.ts), persist whitelist
  (check/copy), `applyStylePreset` / `withStylePreset` / `setStyleDetails` / `styleDetails` /
  `STYLE_PRESET_INFO` in materials.ts. Validation for preset + railing.
- D2 bright facades: saffron, peach, mint, sky, lime, rose, ochre, two-tone (band) in
  EXTERIOR_FINISHES + FACADE_LOOKS (`band?` on FacadeLook). New trims maroon/teal, doors teak/peacock.
- D10 defaults: `buildTemplate` + `createStarter` apply indian-modern. Look row + detail toggles in
  OutsidePanels (`src/shell/modes/outside.css` new). `compound-wall` fence id in landscape.json.

## Next
- D6 fence rendering (props/fence.ts + SiteExtras), D3 chhajja, D4 rooftop, D7 car porch,
  D5 railings, D8 rooms/props (Blender), D9 street life, tests, screenshots.

## Files touched
src/domain/types.ts, src/domain/persist.ts, src/domain/materials.ts, src/domain/starters.ts,
src/onboarding/templates.ts, src/domain/catalog/landscape.json, src/scene/materials/palette.ts,
src/shell/modes/OutsidePanels.tsx, src/shell/modes/outside.css (new)

## Update 2
- D6 fence: `src/scene/props/fence.ts` (fencePlan, parkingSpots), `src/scene/props/SiteExtras.tsx`
  (compound wall/low wall pillars + coping, picket/timber panels, hedge, gates; car porch).
  Auto hedge suppressed when a fence is chosen (garden.ts). Mounted in SceneRoot.
- D3 chhajja (walls.ts emitChhajja), two-tone band; D4 rooftop (geometry/rooftop.ts, Roof.tsx);
  D7 car porch (SiteExtras); D5 railings grille/jaali (balcony.ts, library.jaali, textures.jaaliTexture).
- D8: "Pooja room" label; Blender items in scripts/blender/items/india.py (tulsi-planter, tree-neem,
  street-light, diya); catalog entries in landscape.json / furniture.json.
- D9: scripts/blender/build_street.py, build.mjs `--step street` + STREET_ASSET in manifest,
  src/scene/street/{sim.ts,StreetLife.tsx}; View options "Street life" switch (Hud.tsx);
  SceneHost passes streetLife into the walk view (1-line edit).
- Next: run `npm run assets`, tests (vitest + tests/indian.spec.ts), draw calls, screenshots.

## Update 3
- Assets rebuilt (`npm run assets`): exterior.glb 131,532 B (≤150 KB), interior.glb 236,524 B,
  street.glb 67,776 B (≤120 KB, 7,522 tris). Thumbs: tulsi-planter, tree-neem, street-light, diya.
- Diya also needed a procedural fallback generator in src/domain/furniture.ts (catalog test).
- Tests: src/domain/indian.test.ts, materials.test.ts (bright finishes), src/scene/props/fence.test.ts,
  src/scene/street/sim.test.ts, tests/indian.spec.ts (screenshots behind DH_SHOTS=1).
- Measured (390×844, balanced): Build 75 draw calls, 0 idle frames / 2 s; Explore + street 71 calls, ~24 fps.
- Screenshots: docs/screenshots/indian/*.jpg
- Next: full Playwright + build, jaali check.

## Update 4 (done)
- Indian presets plant neem for oak and a tulsi planter by the door in the automatic garden (garden.ts).
- Full gate green: typecheck, lint, vitest 609/609, Playwright 89 passed + 8 screenshot tests skipped
  (run with DH_SHOTS=1; all 13 pass), build OK.

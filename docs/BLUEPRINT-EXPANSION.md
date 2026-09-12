# Blueprint expansion

Dream-Home helps a plot owner try a building idea before meeting an architect. This release expands the blueprint rather than adding furniture or engineering tools. The visual model remains central; room tiles, direct movement and large controls remain the interaction vocabulary.

## Confirmed decisions

- One building with editable floors and grouped flats or shops. Multiple independent buildings are out of scope.
- Swap a bedroom and kitchen by exchanging their uses and names, preserving the existing walls, dimensions and unit ownership. Physical movement and resizing remain separate actions.
- Home, apartments, market, shop + home and blank starting programs share one representation. Bungalow, villa and duplex are editable home defaults.
- Up to eight floors. Larger requests need a suitable plot; do not silently reduce room or unit counts to make a recommendation fit.
- English only, deterministic generation, local saving, no runtime AI service or new package dependency.

## Representation and editing

Schema v2 gives rooms an optional unit owner and floors rectangular unit areas. Shared circulation is outside private unit areas. Doors must not automatically connect unrelated flats or shops. Balconies become individually selectable edge-attached components with width, depth and along-edge position. Courtyard and stair openings have one canonical rectangle and a list of served floors. Movement validates all served floors atomically.

The domain owns placement, validation and transactions. SVG and Three.js render the same data; neither owns a separate layout. Each pointer preview uses the same domain operation as the final commit. Invalid moves keep the original project. Undo restores a whole edit. Dragging is optional: edge buttons, direction buttons and dimension fields offer the same capabilities.

The save key changes to `dream-home.project.v2`. Load v2 first; otherwise validate and migrate v1. Keep the original v1 string intact. A corrupt v2 must not silently load a stale v1. Imported files pass the same parser. Limits bound both input and rendering work.

## UX and delivery order

1. Domain schema, migrations, use swaps, unit boundaries and shared-space transactions.
2. Program-aware setup with honest fit recommendations and more floors/rooms.
3. Selectable open spaces, balcony edge controls, tap alternatives, unit context and SVG previews.
4. Matching 3D geometry and export. Cached procedural brick/plaster maps use real-world scale; glazing and shallow facade relief improve depth. One sun, capped pixel density and omission of hidden detail keep phones usable.
5. Domain regression tests, migration/reload/export tests, touch and desktop interaction checks, production build and actual visual inspection before pushing.

Rendering aims for more credible architectural materials and daylight. This is still an interactive conceptual model, not an offline photoreal renderer. Basements, arbitrary polygons, multiple buildings, detailed interiors and structural design remain future work.

## Research and how it informed the design

- [Floorplanner demo](https://floorplanner.com/demo): inspected room selection and room-type controls. Separating use from physical boundaries directly addresses unequal room swaps.
- [Sweet Home 3D guide](https://www.sweethome3d.com/users-guide/): room attributes, boundary editing and level navigation informed explicit editing modes and floor context.
- [HomeByMe room movement](https://homebyme.supporthero.io/article/show/176190-how-to-move-a-room), [floors](https://homebyme.supporthero.io/article/show/171602-how-to-add-a-floor) and [outdoor areas](https://homebyme.supporthero.io/article/show/25156-how-to-add-outdoors-and-gardens-to-your-project): documentation review informed reusable floor and outdoor primitives.
- [W3C dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html): every drag operation has a single-pointer alternative without dragging.
- [React Three Fiber performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) and current Three.js documentation obtained through Context7: shared resources, restrained shadows, pixel-density limits and geometry reuse.
- [Filament material reference](https://google.github.io/filament/Filament.md.html), [ambientCG](https://docs.ambientcg.com/license/) and [Poly Haven](https://polyhaven.com/license): material and licensing research. No external texture asset was downloaded; deterministic procedural maps were chosen.

Skills used: debugging, implementation-plan, frontend-design and find-docs. Release verification also uses release-check. Browser inspection, Playwright, Vitest, TypeScript, ESLint and Vite provide the verification path. Grouped unit ownership and canonical shared openings are product architecture decisions, not claims about competitor internals.

## Risks and rollback

Shared openings can be blocked by a room on another floor: name the blocker and reject the whole edit. An eight-floor building can create expensive repeated detail: verify exterior and isolated-floor views at phone dimensions. Recommendations are editable sketches, not guarantees of access, legal setbacks, ventilation or structural safety. Explain fit failures without presenting architectural approval.

Rollback is a Git revert and redeploy. v1 browser saves remain untouched; v2 exports remain available. Never erase a user's stored plan to recover a preview.

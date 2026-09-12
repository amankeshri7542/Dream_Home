# Rooms as pieces: research, decisions and implementation

Research and plan completed before implementation; updated 12 September 2026. This builds on the existing blueprint release and the user's new request for recognizable furnished rooms, a larger model and puzzle-like rearrangement.

## What changed in the product direction

The home is the main interaction surface. Everyday objects communicate what each room is for, while names become optional. These objects are useful visual cues, not an interior shopping catalog. The default editing flow is: look around → select a space → move, resize or set aside → restore a piece → share the idea. Plot setup, grouped flats/shops, up to eight editable floors, balconies, shared courtyards/stairs, undo and export remain available.

## Research and concrete decisions

- [Sweet Home 3D user guide](https://www.sweethome3d.com/users-guide/) links a furniture list, plan, levels and 3D views. Its invisible-furniture list demonstrates that an object need not be in the visible plan to remain in a project. Dream-Home applies this to whole rooms in a persistent tray. The guide also distinguishes interactive 3D from slower photo rendering; this release improves interactive materials and detail without calling the result photorealistic.
- [Floorplanner](https://floorplanner.com/) shows the usefulness of immediate plan/3D feedback and furniture for understanding scale. Dream-Home retains its own procedural model, restrained identity and building-first scope.
- [WCAG 2.2 dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) supports alternatives to precise dragging. Room placement has tap and automatic Fit alternatives; resizing has numeric dimensions and arrow-key handles. Large controls are a design target, not an accessibility certification.
- [React Three Fiber performance guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) informed demand rendering, shared geometry/materials and batching. Current docs were fetched through Context7. Decorative objects are merged by material on the exposed floor. Hidden floors and a closed roof do not spend geometry on furnishings.

The existing React/TypeScript/Vite + SVG + R3F stack stays. No new package, backend, asset download or paid API is required. SVG and 3D consume one deterministic room-detail descriptor layout. Door approach zones constrain furnishing arrangements. Small rooms use compact or minimal cues, rather than scaling beds to implausible sizes.

## Interaction specification

1. **See the home clearly.** Camera framing uses visible building bounds, not the full plot. Fit home, Fit plot, Top view, isolated floors and explicit room focus serve distinct tasks. Focus mode gives the model the viewport while retaining essential controls. Unrelated edits do not reset an orbit.
2. **Recognize rooms.** Bedrooms have beds; kitchens have counters, sink, hob and a pot; dining rooms have table settings; living rooms have seating; bathrooms have sanitary fixtures; utility rooms have washer/shelving; shops have shelving and counters. Names start off in both views. Floor finishes and furnishing direction can be changed in room details.
3. **Resize deliberately.** Eight handles anchor the opposite edge/corner. Handles support arrow keys. Small rooms receive a one-time closer plan view so their controls remain usable. Numeric changes offer four fixed-corner choices. A balcony remains attached to its building and exposes only free-edge handles.
4. **Set aside without losing work.** A room can be moved into a tray or sent there from its details. It keeps its identity, dimensions, use, ownership and appearance. It stops contributing to active floor geometry and area calculations. Restore by drag, tap or automatic Fit, on the chosen floor/group. Invalid placements leave the project unchanged.
5. **Make safe experiments.** Every completed move, resize, appearance edit, tray change and restore uses existing validated commands and undo. A cancelled gesture produces no edit. JSON export/import and device saves preserve staged rooms.

## Representation and limits

Optional additions to the version-2 project document preserve old files: `stagedRooms`, per-room `furnishingRotation`, `floorFinish` and `furnishing`. The tray holds up to 48 pieces. Shared vertical spaces and balconies retain their existing linked/attached semantics; they are not detached room pieces. Removing a floor cannot erase staged rooms. Restoring to another floor normalizes stale group membership through validation.

This is still a rectangular-space blueprint sandbox for one building. It does not allow arbitrary polygon drawing, detached buildings, basements, free placement of individual furniture, structural design, material estimates or guaranteed architectural feasibility. Furniture is illustrative and cannot establish adequate circulation, accessibility or construction suitability. Those remain discussion points with an architect.

## Delivery and verification strategy

Implementation order: shared domain/fixtures → tray/resize commands and regressions → shared SVG/3D detail → camera and mobile workspace → App controls → complete browser flows → production build and release review. Testing covers incompatible imports, invalid fits, old-file compatibility, all resize anchors, balcony attachment, pointer cancellation, room tray persistence, touch alternatives and large-building rendering.

Skills applied: implementation-plan, frontend-design, debugging, find-docs; release-check for the final verification. Independent agents handled geometry/interaction regressions and deterministic furnishings/rendering while the main agent integrated the product flow. Playwright uses isolated contexts, leaving existing browser saves untouched. Final results are recorded in `VERIFICATION.md`.

import RoomCatalog from "../../components/RoomCatalog";
import { useEditor } from "../../editor/EditorProvider";
import { targetForId } from "../../editor/selection";

export function CatalogPanel() {
  const editor = useEditor();
  const { project, activeFloor, unit, dispatch, commit, state } = editor;
  return (
    <section className="dh-legacy-skin dh-catalog" aria-label="Add room">
      <RoomCatalog
        key={state.catalogPick ?? ""}
        initialPick={state.catalogPick}
        project={project}
        floorId={activeFloor.id}
        unit={unit}
        onClose={() => dispatch({ type: "close-panel" })}
        // Not while the floor plan is open (tracing a plan photo, or editing in 2D).
        onFromPlan={
          state.lens
            ? undefined
            : () => {
                dispatch({ type: "close-panel" });
                dispatch({ type: "overlay", overlay: "plan" });
              }
        }
        onExpand={() => {
          dispatch({ type: "open-panel", panel: "plot" });
          dispatch({
            type: "notify",
            text: "Adjust the building area to leave a clear space for another room.",
          });
        }}
        onUse={(next, id) => {
          const target = targetForId(next, id, activeFloor.id);
          commit(next, "Add a space");
          dispatch({ type: "close-panel" });
          if (target) dispatch({ type: "select", target });
          dispatch({
            type: "notify",
            text: "Space added! Drag it with Move, or change its details.",
            tone: "success",
          });
        }}
      />
    </section>
  );
}

import SpaceInspector from "../../components/SpaceInspector";
import { useEditor } from "../../editor/EditorProvider";
import { useDesktop } from "../../editor/hooks";

export function SpaceDetails() {
  const editor = useEditor();
  const { project, selected, unit, run, dispatch, state } = editor;
  const desktop = useDesktop();
  if (!selected?.item || !selected.floor) return null;
  return (
    <div className="dh-inspector-body dh-legacy-skin" hidden={!desktop && state.sheet === "peek"}>
      <SpaceInspector
        project={project}
        floor={selected.floor}
        item={selected.item}
        unit={unit}
        onApply={(result) => run(result, `Edit ${selected.name}`)}
        onTool={(tool) => dispatch({ type: "set-tool", tool, lens: tool !== "move" })}
        onRemove={() => dispatch({ type: "select", target: null })}
      />
    </div>
  );
}

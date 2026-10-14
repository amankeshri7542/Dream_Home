import RoomTray, { type TrayPointer } from "../../components/RoomTray";
import { useEditor } from "../../editor/EditorProvider";

export function TrayPanel({
  onDrag,
  onDrop,
}: {
  onDrag: (pointer: TrayPointer | null) => void;
  onDrop: (pointer: TrayPointer) => void;
}) {
  const editor = useEditor();
  const { project, activeFloor, unit, state, dispatch, run } = editor;
  const arm = (id: string) => {
    dispatch({ type: "tray-select", id });
    dispatch({ type: "lens", open: true });
  };
  return (
    <div className="dh-legacy-skin dh-tray-panel">
      <RoomTray
        project={project}
        floorId={activeFloor.id}
        unit={unit}
        selected={state.tray.selected}
        targetUnit={state.tray.unit}
        onTargetUnit={(value) => dispatch({ type: "tray-unit", unit: value })}
        onPlace={arm}
        onSelect={arm}
        onClose={() => {
          dispatch({ type: "tray-select", id: null });
          dispatch({ type: "close-panel" });
          onDrag(null);
        }}
        onApply={(result) => run(result, "Place a room from the tray")}
        onRestored={(id) => {
          dispatch({ type: "tray-select", id: null });
          dispatch({ type: "close-panel" });
          dispatch({ type: "select", target: { kind: "room", floorId: activeFloor.id, id } });
          dispatch({ type: "notify", text: "Piece placed. Move or resize it to make it yours.", tone: "success" });
        }}
        onDrag={(pointer) => {
          onDrag(pointer);
          if (pointer) {
            dispatch({ type: "tray-select", id: pointer.id });
            dispatch({ type: "lens", open: true });
          }
        }}
        onDrop={onDrop}
      />
    </div>
  );
}

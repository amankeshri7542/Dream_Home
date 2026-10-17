// The Home level's one bar: four big actions around the 3D home. Rooms open
// by tapping them in the picture; everything room-specific lives in the Room
// Studio. Outside swaps the bar for its own tools and a way home.
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { ToolButton } from "../ui/primitives";

export function HomeBar({ onAi }: { onAi: () => void }) {
  const { state, dispatch, project } = useEditor();
  const staged = project.stagedRooms?.length ?? 0;
  const common = {
    role: "toolbar",
    "data-chrome": "palette",
    "aria-orientation": "horizontal" as const,
  };
  if (state.mode === "outside")
    return (
      <div {...common} className="dh-palette dh-homebar is-outside" aria-label="Outside tools">
        <ToolButton icon={Icon.home} label="Back to the house" caption="House" onClick={() => dispatch({ type: "set-mode", mode: "build" })} />
        <ToolButton
          icon={Icon.palette}
          label="House style"
          pressed={state.panel === "style"}
          onClick={() => dispatch({ type: "open-panel", panel: "style" })}
        />
        <ToolButton
          icon={Icon.tree}
          label="Garden"
          pressed={state.panel === "garden"}
          onClick={() => dispatch({ type: "open-panel", panel: "garden" })}
        />
        <ToolButton
          icon={Icon.fence}
          label="Ground & fence"
          caption="Ground"
          pressed={state.panel === "site"}
          onClick={() => dispatch({ type: "open-panel", panel: "site" })}
        />
        <ToolButton
          icon={Icon.plot}
          label="My plot"
          pressed={state.panel === "plot"}
          onClick={() => dispatch({ type: "open-panel", panel: "plot" })}
        />
      </div>
    );
  return (
    <div {...common} className="dh-palette dh-homebar" aria-label="Home actions">
      <ToolButton
        icon={Icon.add}
        label="Add room"
        className="dh-tool-primary"
        aria-label={staged ? `Add room, ${staged} kept for later` : "Add room"}
        pressed={state.panel === "catalog" || state.panel === "rooms" || state.panel === "tray"}
        badge={staged}
        onClick={() => dispatch({ type: "open-panel", panel: staged ? "tray" : "catalog" })}
      />
      <ToolButton icon={Icon.outside} label="Outside" onClick={() => dispatch({ type: "set-mode", mode: "outside" })} />
      <ToolButton icon={Icon.explore} label="Explore" onClick={() => dispatch({ type: "set-mode", mode: "explore" })} />
      <ToolButton icon={Icon.sparkle} label="Design with AI" caption="AI design" className="dh-tool-ai" onClick={onAi} />
    </div>
  );
}

/** "Add room" opens one sheet with three sides: new rooms, your rooms, rooms kept for later. */
export function SpaceTabs() {
  const { state, dispatch, project } = useEditor();
  const staged = project.stagedRooms?.length ?? 0;
  const tabs = [
    { panel: "catalog" as const, label: "Add new" },
    { panel: "rooms" as const, label: "Your rooms" },
    { panel: "tray" as const, label: staged ? `For later (${staged})` : "For later" },
  ];
  return (
    <div className="dh-segmented dh-space-tabs" role="tablist" aria-label="Rooms">
      {tabs.map((t) => (
        <button
          key={t.panel}
          type="button"
          role="tab"
          aria-selected={state.panel === t.panel}
          onClick={() => state.panel !== t.panel && dispatch({ type: "open-panel", panel: t.panel })}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

import { useEditor } from "../editor/EditorProvider";
import type { EditorMode } from "../editor/types";
import { Icon } from "../ui/icons";
import { ToolButton } from "../ui/primitives";

export const MODE_INFO: Record<
  EditorMode,
  { label: string; short: string; hint: string }
> = {
  build: {
    label: "Build",
    short: "Build",
    hint: "Rooms, floors, stairs and balconies",
  },
  openings: {
    label: "Doors & windows",
    short: "Doors",
    hint: "Place, slide and style doors and windows",
  },
  decorate: {
    label: "Decorate",
    short: "Decorate",
    hint: "Furniture, paint and floors",
  },
  outside: {
    label: "Outside",
    short: "Outside",
    hint: "Roof, walls outside and the garden",
  },
  explore: {
    label: "Explore",
    short: "Explore",
    hint: "Admire your home, walk inside, take photos",
  },
};

/** Modes become visible as they are implemented — never a dead button. */
export const AVAILABLE_MODES: EditorMode[] = ["build", "openings", "decorate", "outside", "explore"];

export function ModeBar({ placement }: { placement: "top" | "bottom" }) {
  const { state, dispatch } = useEditor();
  if (AVAILABLE_MODES.length < 2) return null;
  return (
    <nav
      className={`dh-modebar dh-modebar-${placement}`}
      aria-label="Modes"
      data-chrome="modes"
    >
      {AVAILABLE_MODES.map((mode) => (
        <ToolButton
          key={mode}
          icon={Icon[mode]}
          label={MODE_INFO[mode].label}
          aria-label={MODE_INFO[mode].label}
          caption={placement === "top" ? MODE_INFO[mode].label : MODE_INFO[mode].short}
          aria-current={state.mode === mode ? "page" : undefined}
          title={MODE_INFO[mode].hint}
          className={`dh-mode dh-mode-${mode}`}
          onClick={() => dispatch({ type: "set-mode", mode })}
        />
      ))}
    </nav>
  );
}

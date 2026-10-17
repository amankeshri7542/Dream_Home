import { projectStats } from "../domain/model";
import { length, unitLabel } from "../domain/display";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { IconButton } from "../ui/primitives";
import { HomeBar } from "./HomeBar";
import { BrandMark } from "../ui/BrandMark";
import { TalkButton } from "../voice/TalkButton";

export { BrandMark };

export function TopBar({
  desktop,
  onHome,
  onAi,
}: {
  desktop: boolean;
  onHome: () => void;
  onAi: () => void;
}) {
  const editor = useEditor();
  const { project, unit, state, dispatch } = editor;
  const stats = projectStats(project);
  const shops = project.floors.reduce(
    (n, f) => n + f.rooms.filter((r) => r.kind === "shop").length,
    0,
  );
  const meta = [
    `${length(project.plot.width, unit)} × ${length(project.plot.depth, unit)} ${unitLabel(unit)}`,
    project.units.some((u) => u.use === "commercial")
      ? `${shops} shop${shops === 1 ? "" : "s"}`
      : `${stats.bedrooms} bedroom${stats.bedrooms === 1 ? "" : "s"}`,
    project.floors.length === 1
      ? "1 floor"
      : `${project.floors.length} floors`,
  ];
  return (
    <header
      className="dh-topbar"
      data-inset="top"
      data-chrome="topbar"
      // Long names get a row of their own on phones (shell.css).
      data-name={project.name.length > 30 ? "longer" : project.name.length > 18 ? "long" : undefined}
    >
      <div className="dh-topbar-brand">
        <button
          type="button"
          className="dh-brand"
          aria-label="Dream Home — home screen"
          onClick={onHome}
        >
          <BrandMark />
        </button>
        {/* Phones: the name may take two lines, and "Saved" shrinks to a dot beside it. */}
        <div className={`dh-title ${editor.saved ? "is-saved" : "is-unsaved"}`}>
          <h1 className="dh-title-name">{project.name}</h1>
          <p className="dh-title-meta dh-truncate">
            {meta.join(" · ")}
            <span
              className={`dh-save ${editor.saved ? "is-saved" : "is-unsaved"}`}
              title={editor.saved ? "Saved on this device" : undefined}
            >
              <span className="dh-save-word">{editor.saved ? "Saved" : "Not saved"}</span>
            </span>
          </p>
        </div>
      </div>
      {desktop && state.mode !== "explore" && <HomeBar onAi={onAi} />}
      <div className="dh-topbar-actions">
        {desktop && <TalkButton place="top" />}
        <div className="dh-history" role="toolbar" aria-label="History">
          <IconButton
            icon={Icon.undo}
            tone="plain"
            label="Undo last change"
            title={editor.undoLabel ? `Undo: ${editor.undoLabel}` : "Undo"}
            disabled={!editor.canUndo}
            onClick={editor.undo}
          />
          {/* Phones show Redo only when there's something to redo: room for the name. */}
          <IconButton
            icon={Icon.redo}
            tone="plain"
            className={editor.canRedo ? undefined : "is-idle"}
            label="Redo last change"
            title={editor.redoLabel ? `Redo: ${editor.redoLabel}` : "Redo"}
            disabled={!editor.canRedo}
            onClick={editor.redo}
          />
        </div>
        <button
          type="button"
          className="dh-share"
          aria-label="Share your home"
          onClick={() => dispatch({ type: "overlay", overlay: "share" })}
        >
          <Icon.share size={18} aria-hidden />
          <span>Share</span>
        </button>
        <IconButton
          icon={Icon.more}
          tone="plain"
          label="More options"
          onClick={() => dispatch({ type: "overlay", overlay: "more" })}
        />
      </div>
    </header>
  );
}

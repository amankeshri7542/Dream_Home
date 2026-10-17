import { projectStats } from "../domain/model";
import { length, unitLabel } from "../domain/display";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { IconButton } from "../ui/primitives";
import { HomeBar } from "./HomeBar";

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="dh-brand-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
    >
      <rect width="40" height="40" rx="12" fill="var(--dh-terracotta-600)" />
      <path d="M9 21.5 20 11.5l11 10V32H9Z" fill="var(--dh-paper-1)" />
      <path d="M17 32v-7a3 3 0 0 1 6 0v7" fill="var(--dh-terracotta-600)" />
      <circle cx="29" cy="11" r="3.2" fill="var(--dh-sun-400)" />
    </svg>
  );
}

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
    <header className="dh-topbar" data-inset="top" data-chrome="topbar">
      <div className="dh-topbar-brand">
        <button
          type="button"
          className="dh-brand"
          aria-label="Dream Home — home screen"
          onClick={onHome}
        >
          <BrandMark />
        </button>
        <div className="dh-title">
          <h1 className="dh-title-name">{project.name}</h1>
          <p className="dh-title-meta dh-truncate">
            {meta.join(" · ")}
            <span
              className={`dh-save ${editor.saved ? "is-saved" : "is-unsaved"}`}
            >
              {editor.saved ? "Saved" : "Not saved"}
            </span>
          </p>
        </div>
      </div>
      {desktop && state.mode !== "explore" && <HomeBar onAi={onAi} />}
      <div className="dh-topbar-actions">
        <div className="dh-history" role="toolbar" aria-label="History">
          <IconButton
            icon={Icon.undo}
            tone="plain"
            label="Undo last change"
            title={editor.undoLabel ? `Undo: ${editor.undoLabel}` : "Undo"}
            disabled={!editor.canUndo}
            onClick={editor.undo}
          />
          <IconButton
            icon={Icon.redo}
            tone="plain"
            label="Redo last change"
            title={editor.redoLabel ? `Redo: ${editor.redoLabel}` : "Redo"}
            disabled={!editor.canRedo}
            onClick={editor.redo}
          />
        </div>
        <button
          type="button"
          className="dh-share"
          aria-label="Share home plan"
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

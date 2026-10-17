import { useRef } from "react";
import GuidedStart from "../components/GuidedStart";
import SharePlan from "../components/SharePlan";
import { Dialog, DialogHeading, Switch } from "../components/Controls";
import { parseProject } from "../domain/model";
import { download } from "../domain/export";
import type { Project } from "../domain/types";
import type { Unit } from "../domain/display";
import { friendlyError, useEditor, type EditorApi } from "../editor/EditorProvider";
import { MyHomesDialog } from "./MyHomes";
import { ShareSheet } from "../share/ShareSheet";
import { Icon } from "../ui/icons";
import { Kbd, Segmented } from "../ui/primitives";

export const SHORTCUTS: { keys: string[]; action: string; group: string }[] = [
  { keys: ["Ctrl/⌘", "Z"], action: "Undo", group: "Anywhere" },
  { keys: ["Ctrl/⌘", "Shift", "Z"], action: "Redo", group: "Anywhere" },
  { keys: ["?"], action: "Show these shortcuts", group: "Anywhere" },
  { keys: ["1–5"], action: "Switch mode", group: "Anywhere" },
  { keys: ["P"], action: "Open or close the floor plan", group: "Anywhere" },
  { keys: ["F"], action: "Fit the home in view", group: "Anywhere" },
  { keys: ["L"], action: "Show or hide room names", group: "Anywhere" },
  { keys: ["H"], action: "Hide or show the controls", group: "Anywhere" },
  { keys: ["Esc"], action: "Step back: close, cancel, deselect", group: "Anywhere" },
  { keys: ["←", "→", "↑", "↓"], action: "Turn and tilt the view", group: "3D view focused" },
  { keys: ["+", "−"], action: "Zoom in and out", group: "3D view focused" },
  { keys: ["T"], action: "Top view", group: "3D view focused" },
];

export function DialogHost({
  fileInput,
  onReplayTour,
  onStartNew,
  onHomeOpened,
  capture,
  onTakePhoto,
  onMakeVideo,
}: {
  fileInput: React.RefObject<HTMLInputElement | null>;
  onReplayTour: () => void;
  /** Opens the gallery of starting homes. */
  onStartNew: () => void;
  /** A home from My homes was opened. */
  onHomeOpened: () => void;
  /** A snapshot of the 3D view (for a share link's preview picture). */
  capture: () => Promise<Blob | null>;
  onTakePhoto: () => void;
  onMakeVideo: () => void;
}) {
  const editor = useEditor();
  const { state, dispatch, project, unit, setPrefs, error } = editor;
  const close = () => dispatch({ type: "overlay", overlay: null });
  const useStarter = async (next: Project, nextUnit: Unit) => {
    if (!(await addHome(editor, next, "Start a new home"))) return;
    setPrefs({ unit: nextUnit });
    dispatch({ type: "overlay", overlay: null });
    dispatch({ type: "close-panel" });
    dispatch({ type: "choose-floor", floor: "all" });
    dispatch({ type: "set-mode", mode: "build" });
    dispatch({ type: "view", patch: { stage: 4, cutaway: true, roof: false } });
    dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "hero" } });
    dispatch({
      type: "notify",
      text: "Your starting home is ready! Tap any room to change it, or Add space.",
      tone: "success",
    });
  };
  switch (state.overlay) {
    case "start":
      return (
        <Dialog label="Start your home" wide onClose={close}>
          <GuidedStart project={project} language="en" unit={unit} onClose={close} onUse={useStarter} />
        </Dialog>
      );
    case "share":
      return (
        <ShareSheet
          onClose={close}
          capture={capture}
          onTakePhoto={() => {
            close();
            onTakePhoto();
          }}
          onMakeVideo={() => {
            close();
            onMakeVideo();
          }}
          onPlans={() => dispatch({ type: "overlay", overlay: "plans" })}
        />
      );
    case "plans":
      return (
        <Dialog label="Plan drawings" onClose={close}>
          <SharePlan project={project} unit={unit} language="en" onClose={close} />
        </Dialog>
      );
    case "homes":
      return <MyHomesDialog onClose={close} onOpened={onHomeOpened} onStartNew={onStartNew} />;
    case "help":
      return <HelpDialog onClose={close} />;
    case "shortcuts":
      return <ShortcutsDialog onClose={close} />;
    case "more":
      return (
        <Dialog label="More options" onClose={close}>
          <DialogHeading title="Your home & settings" language="en" onClose={close} />
          <div className="menu-body dh-menu-body">
            {error && (
              <p className="inline-error" role="alert">
                {friendlyError(error)}
              </p>
            )}
            {editor.recovery && (
              <button
                className="secondary-button"
                onClick={() =>
                  download(
                    new Blob([editor.recovery!], { type: "application/json" }),
                    "dream-home-recovery.json",
                  )
                }
              >
                Recover saved file
              </button>
            )}
            <label className="dh-field dh-rename">
              <span>Home name</span>
              <input
                key={project.name}
                aria-label="Home name"
                defaultValue={project.name}
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name || name === project.name) {
                    e.target.value = project.name;
                    return;
                  }
                  editor.commit({ ...project, name }, "Rename home");
                }}
              />
            </label>
            <button className="menu-row" onClick={() => dispatch({ type: "overlay", overlay: "homes" })}>
              <Icon.homes size={21} aria-hidden />
              My homes ({editor.homes.list.length})
              <Icon.right size={17} aria-hidden />
            </button>
            <button
              className="menu-row"
              onClick={() => {
                dispatch({ type: "overlay", overlay: null });
                onStartNew();
              }}
            >
              <Icon.home size={21} aria-hidden />
              Start a new home
              <Icon.right size={17} aria-hidden />
            </button>
            <button className="menu-row" onClick={() => fileInput.current?.click()}>
              <Icon.upload size={21} aria-hidden />
              Open a saved file
              <Icon.right size={17} aria-hidden />
            </button>
            <button
              className="menu-row"
              onClick={() =>
                download(
                  new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
                  "dream-home.json",
                )
              }
            >
              <Icon.download size={21} aria-hidden />
              Save a copy of my home
              <Icon.right size={17} aria-hidden />
            </button>
            <div className="menu-unit">
              <span>Measurements</span>
              <Segmented
                label="Measurements"
                value={unit}
                options={[
                  { value: "ft", label: "Feet" },
                  { value: "m", label: "Metres" },
                ]}
                onChange={(value) => setPrefs({ unit: value })}
              />
            </div>
            <div className="menu-unit is-stacked">
              <span>Text size</span>
              <Segmented
                label="Text size"
                value={editor.prefs.textSize}
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "large", label: "Large" },
                  { value: "extra", label: "Extra large" },
                ]}
                onChange={(value) => setPrefs({ textSize: value })}
              />
            </div>
            <Switch
              label="Sounds & vibration"
              description="Soft pops when things change"
              icon={<Icon.sound size={21} aria-hidden />}
              checked={editor.prefs.sounds}
              onChange={() => setPrefs({ sounds: !editor.prefs.sounds })}
            />
            <button className="menu-row" onClick={() => dispatch({ type: "overlay", overlay: "help" })}>
              <Icon.help size={21} aria-hidden />
              Tips & how to use
              <Icon.right size={17} aria-hidden />
            </button>
            <button
              className="menu-row"
              onClick={() => {
                dispatch({ type: "overlay", overlay: null });
                onReplayTour();
              }}
            >
              <Icon.sparkle size={21} aria-hidden />
              Replay the tour
              <Icon.right size={17} aria-hidden />
            </button>
            <button className="menu-row" onClick={() => dispatch({ type: "overlay", overlay: "shortcuts" })}>
              <Icon.shortcuts size={21} aria-hidden />
              Keyboard shortcuts
              <Icon.right size={17} aria-hidden />
            </button>
            <details className="plain-details">
              <summary>Keep it on your phone</summary>
              <p className="field-note">
                Open this app’s link in your phone’s browser. On Android, use the
                browser menu → Add to home screen. On iPhone, use Safari’s Share
                menu → Add to Home Screen.
              </p>
              <p className="field-note">
                Your work stays in that browser. Download a project backup before
                changing phones or clearing browser data.
              </p>
            </details>
            <p className="privacy-note">
              A concept to discuss with your architect. No engineering or
              local-rule checks. No account, saved on this device.
            </p>
          </div>
        </Dialog>
      );
    default:
      return null;
  }
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const tips = [
    {
      icon: Icon.home,
      title: "Start with what you know",
      body: "Your plot size, how many bedrooms and floors — that’s enough to begin. Pick a starting home and make it yours.",
    },
    {
      icon: Icon.move,
      title: "Tap, then change",
      body: "Tap any room to select it. Press Move and drag it in 3D, or Edit in 2D to move and resize it on the floor plan. Green means it fits; red shows what’s in the way.",
    },
    {
      icon: Icon.tray,
      title: "Make space: keep rooms for later",
      body: "Keep a room for later while you rearrange. Place it back by tapping an empty spot, or let it find a place on its own.",
    },
    {
      icon: Icon.undo,
      title: "Nothing is ever lost",
      body: "Undo is always at the top. Try anything — you can always go back.",
    },
    {
      icon: Icon.share,
      title: "Share the dream",
      body: "Share makes a clear plan image for family or your architect.",
    },
  ];
  return (
    <Dialog label="Tips & how to use" onClose={onClose}>
      <DialogHeading title="Small steps. A home that feels yours." language="en" onClose={onClose} />
      <div className="help-body dh-help">
        {tips.map((tip) => (
          <div className="help-item" key={tip.title}>
            <tip.icon size={22} aria-hidden />
            <div>
              <h3>{tip.title}</h3>
              <p>{tip.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useEditor();
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <Dialog label="Keyboard shortcuts" onClose={onClose}>
      <DialogHeading title="Keyboard shortcuts" language="en" onClose={onClose} />
      <div className="dh-shortcuts">
        {groups.map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                <div key={s.action}>
                  <dt>
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dt>
                  <dd>{s.action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <label className="dh-check">
          <input
            type="checkbox"
            checked={prefs.singleKeyShortcuts}
            onChange={(e) => setPrefs({ singleKeyShortcuts: e.target.checked })}
          />
          Single-key shortcuts (letters and numbers)
        </label>
      </div>
    </Dialog>
  );
}

/**
 * Adds a home to My homes and opens it. Browsers that keep only one home get an
 * undoable replacement instead. False when it couldn't be added (told why).
 */
export async function addHome(editor: EditorApi, next: Project, label: string): Promise<boolean> {
  const outcome = await editor.homes.create(next);
  if (outcome === "ok") return true;
  if (outcome === "unsupported") {
    editor.commit(next, label, { select: null });
    editor.notify("This browser keeps one home at a time. Undo brings back your previous home.");
    return true;
  }
  editor.notify(editor.homes.explain(outcome), "error");
  if (outcome === "full") editor.dispatch({ type: "overlay", overlay: "homes" });
  return false;
}

/** Hidden file input for opening saved projects. */
export function ProjectFileInput({
  inputRef,
  onOpened,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onOpened?: () => void;
}) {
  const editor = useEditor();
  const busy = useRef(false);
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".json,application/json"
      hidden
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file || busy.current) return;
        busy.current = true;
        try {
          if (file.size > 1000000) throw new Error("Choose a project file smaller than 1 MB.");
          const next = parseProject(await file.text());
          if (!(await addHome(editor, next, "Open a saved project"))) return;
          editor.dispatch({ type: "overlay", overlay: null });
          editor.dispatch({ type: "close-panel" });
          editor.dispatch({ type: "choose-floor", floor: "all" });
          editor.dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "hero" } });
          editor.notify(`${next.name} opened. Your other homes are safe in My homes.`, "success");
          onOpened?.();
        } catch (err) {
          editor.setError(err instanceof Error ? err.message : "Could not read this file.");
        } finally {
          busy.current = false;
          if (inputRef.current) inputRef.current.value = "";
        }
      }}
    />
  );
}

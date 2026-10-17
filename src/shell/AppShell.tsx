import { useCallback, useEffect, useRef, useState } from "react";
import { createStarter } from "../domain/starters";
import type { Project } from "../domain/types";
import { loadSession, saveSession } from "../editor/preferences";
import { useReducedMotion } from "../editor/hooks";
import { CoachMarks, TemplateGallery, TitleScreen } from "../onboarding/Onboarding";
import { AiDesigner, type AiResult } from "../ai/AiDesigner";
import { DesignNotes } from "../ai/DesignNotes";
import { ExploreHud } from "../explore/ExploreHud";
import { PhotoDialog } from "../explore/PhotoDialog";
import type { TrayPointer } from "../components/RoomTray";
import { useEditor } from "../editor/EditorProvider";
import { useChromeInsets, useDesktop } from "../editor/hooks";
import { Icon } from "../ui/icons";
import { IconButton } from "../ui/primitives";
import { DialogHost, ProjectFileInput, addHome } from "./Dialogs";
import { ImportFromLink, MoveBanner } from "./MoveHomes";
import { REMIXED_KEY } from "../share/remix";
import { ConfirmDialog, Notifications } from "./Feedback";
import { CameraHud, FloorSwitcher, ViewOptions } from "./Hud";
import { Inspector } from "./Inspector";
import { HomeBar } from "./HomeBar";
import { ActionDock, ModeHint } from "./Palette";
import { ChecklistPill } from "./Checklist";
import { SelectionAnnouncer } from "./Announcer";
import { useBackButton } from "./useBackButton";
import { PlanLens } from "./PlanLens";
import { SceneHost } from "./SceneHost";
import { TopBar } from "./TopBar";
import "./shell.css";
import "./studio/studio.css";

/** The construction reveal: five steps, then "Ta-da!" for a moment. */
const REVEAL_MS = 5 * 520 + 1800;

export function AppShell() {
  const editor = useEditor();
  const { state, dispatch, selected } = editor;
  const desktop = useDesktop();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const insets = useChromeInsets(root);
  const fileInput = useRef<HTMLInputElement>(null);
  const [noWebGL, setNoWebGL] = useState(false);
  const onWebGL = useCallback((value: boolean) => setNoWebGL(value), []);
  const [trayDrag, setTrayDrag] = useState<TrayPointer | null>(null);
  const [trayDrop, setTrayDrop] = useState<(TrayPointer & { key: number }) | null>(null);
  const [screen, setScreen] = useState<"title" | "gallery" | "ai" | "workspace">(() =>
    loadSession().titleDismissed ? "workspace" : "title",
  );
  const [preview, setPreview] = useState<Project | null>(null);
  const [tour, setTour] = useState(false);
  const reduced = useReducedMotion();
  const reveal = useRef<number[]>([]);
  useEffect(() => () => reveal.current.forEach((t) => window.clearTimeout(t)), []);
  /** The AI-designed home on screen, while its design notes are open. */
  const [design, setDesign] = useState<AiResult | null>(null);
  /** Design notes wait for the construction reveal to finish. */
  const [notesReady, setNotesReady] = useState(false);
  const showDesign = useCallback(
    (result: AiResult) => {
      setDesign(result);
      setNotesReady(reduced);
      if (!reduced) reveal.current.push(window.setTimeout(() => setNotesReady(true), REVEAL_MS));
    },
    [reduced],
  );
  // The notes describe one design: once the home changes (an undo, an edit), they're done.
  useEffect(() => {
    if (design && editor.project !== design.project) setDesign(null);
  }, [design, editor.project]);
  // Just remixed a shared home: welcome them to their own copy.
  useEffect(() => {
    try {
      const from = sessionStorage.getItem(REMIXED_KEY);
      if (!from) return;
      sessionStorage.removeItem(REMIXED_KEY);
      dispatch({ type: "notify", text: `This is your own copy of ${from}. Make it yours!`, tone: "success" });
    } catch {
      /* No session storage: no welcome, nothing lost. */
    }
  }, [dispatch]);
  const enterWorkspace = useCallback(() => {
    saveSession({ titleDismissed: true });
    setScreen("workspace");
    setPreview(null);
    dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "hero" } });
  }, [dispatch]);
  const startTourIfNew = useCallback(() => {
    if (!editor.prefs.tourSeen) setTour(true);
  }, [editor.prefs.tourSeen]);
  const [caption, setCaption] = useState<string | null>(null);
  /** A gentle "construction" sequence: foundation, frame, walls, floors. */
  const constructionReveal = useCallback(() => {
    reveal.current.forEach((t) => window.clearTimeout(t));
    if (reduced) {
      dispatch({ type: "view", patch: { stage: 4, roof: false, cutaway: true } });
      return;
    }
    const steps = [
      "Clearing the plot…",
      "Laying the foundation…",
      "Raising the frame…",
      "Building the walls…",
      "Adding the floors…",
    ];
    steps.forEach((text, stage) => {
      reveal.current.push(
        window.setTimeout(() => {
          dispatch({ type: "view", patch: { stage, roof: false, cutaway: true } });
          setCaption(text);
        }, stage * 520),
      );
    });
    reveal.current.push(
      window.setTimeout(() => setCaption("Ta-da! Your home is ready."), steps.length * 520),
      window.setTimeout(() => setCaption(null), REVEAL_MS),
    );
  }, [dispatch, reduced]);
  const onPreview = useCallback((project: Project | null) => setPreview(project), []);
  /**
   * A new home joins My homes and opens with a fresh history; the home that
   * was open stays safe on the shelf. (A first visit's untouched starter home
   * is simply replaced.) Browsers that can keep only one home fall back to an
   * undoable replacement.
   */
  const adopt = (project: Project, label: string) => addHome(editor, project, label);
  const [photoRequest, setPhotoRequest] = useState<{ id: number } | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [flash, setFlash] = useState(0);
  const [walkStatus, setWalkStatus] = useState("");
  const [walkFloorId, setWalkFloorId] = useState<string | undefined>();
  const onWalkStatus = useCallback(
    ({ floorId, roomId }: { floorId: string; roomId: string | null }) => {
      const floor = editor.project.floors.find((f) => f.id === floorId);
      const room = floor?.rooms.find((r) => r.id === roomId);
      const floorName = editor.project.floors.length > 1 && floor ? ` · ${floor.name}` : "";
      setWalkFloorId(floorId);
      setWalkStatus(room ? `${room.name}${floorName}` : `Hallway${floorName}`);
    },
    [editor.project],
  );
  // A snapshot for a share link's picture goes to whoever asked, not the photo dialog.
  const snapshotFor = useRef<((blob: Blob | null) => void) | null>(null);
  const capture = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const timer = window.setTimeout(() => {
          snapshotFor.current = null;
          resolve(null);
        }, 6000);
        snapshotFor.current = (blob) => {
          window.clearTimeout(timer);
          snapshotFor.current = null;
          resolve(blob);
        };
        setPhotoRequest((r) => ({ id: (r?.id ?? 0) + 1 }));
      }),
    [],
  );
  const onPhoto = useCallback((blob: Blob) => {
    if (snapshotFor.current) snapshotFor.current(blob);
    else setPhoto(blob);
  }, []);
  const takePhoto = useCallback(() => {
    setPhotoRequest((r) => ({ id: (r?.id ?? 0) + 1 }));
    if (!reduced) setFlash((n) => n + 1);
  }, [reduced]);
  const explore = state.mode === "explore";
  const chromeHidden = state.chromeHidden || screen !== "workspace";
  const layerOpen =
    screen === "gallery" ||
    screen === "ai" ||
    (screen === "workspace" &&
      (!!state.selection ||
        !!state.panel ||
        state.lens ||
        state.viewOptions ||
        !!state.overlay ||
        state.tool !== "select" ||
        state.chromeHidden ||
        state.mode === "outside" ||
        explore));
  useBackButton(layerOpen, () => {
    if (screen === "gallery" || screen === "ai") setScreen("title");
    else if (state.overlay) dispatch({ type: "overlay", overlay: null });
    else if (explore && state.explore !== "walk")
      dispatch({ type: "set-mode", mode: state.lastEditMode });
    // Back from Outside (nothing open there) returns to the house.
    else if (state.mode === "outside" && !state.panel && !state.selection && !state.viewOptions)
      dispatch({ type: "set-mode", mode: "build" });
    else dispatch({ type: "escape" });
  });
  const inspector = (
    <Inspector
      desktop={desktop}
      onTrayDrag={setTrayDrag}
      onTrayDrop={(pointer) => setTrayDrop({ ...pointer, key: Date.now() })}
    />
  );
  // Balconies and stairs at Home keep the action bar; inside a room it lives
  // in the Layout tab, and stands alone only while moving or resizing.
  const showDock = !!selected && state.mode === "build" && (!state.focus || state.tool !== "select");
  const openAi = () => setScreen("ai");
  return (
    <div
      ref={setRoot}
      className={`dh-app ${desktop ? "is-desktop" : "is-compact"}`}
      data-mode={state.mode}
      data-chrome-hidden={chromeHidden || undefined}
      data-lens={state.lens || noWebGL ? "open" : "closed"}
      data-selection={selected?.target.kind ?? undefined}
      data-dock={showDock || undefined}
      data-tool={state.tool}
      data-level={state.focus ? "room" : "home"}
    >
      <SceneHost
        insets={insets}
        onWebGLUnavailable={onWebGL}
        preview={screen === "gallery" ? preview : null}
        showcase={screen !== "workspace"}
        photoRequest={photoRequest}
        onPhoto={onPhoto}
        onWalkStatus={onWalkStatus}
      />
      {flash > 0 && <div key={flash} className="dh-photo-flash" aria-hidden />}
      {caption && (
        <div
          key={caption}
          className={`dh-reveal ${caption.startsWith("Ta-da") ? "is-done" : ""}`}
          role="status"
          aria-live="polite"
        >
          {caption.startsWith("Ta-da") && <Icon.sparkle size={20} aria-hidden />}
          {caption}
        </div>
      )}
      {explore && screen === "workspace" && !state.chromeHidden && (
        <ExploreHud
          onPhoto={takePhoto}
          walkAvailable
          walkStatus={state.explore === "walk" ? walkStatus : undefined}
          walkFloorId={walkFloorId}
        />
      )}
      {photo && (
        <PhotoDialog blob={photo} name={editor.project.name} onClose={() => setPhoto(null)} />
      )}
      <PlanLens
        desktop={desktop}
        primary={noWebGL}
        trayDrag={trayDrag}
        trayDrop={trayDrop}
        onTrayDropHandled={() => setTrayDrop(null)}
      />
      {screen === "title" && (
        <TitleScreen
          onContinue={enterWorkspace}
          onNew={() => setScreen("gallery")}
          onSample={async () => {
            const sample = createStarter(
              { widthCm: 914, depthCm: 1524, road: "south", marginCm: 60, bedrooms: 2, floors: 1 },
              "family",
            );
            if (sample.ok && !(await adopt(sample.project, "Try the sample home"))) return;
            enterWorkspace();
            constructionReveal();
            startTourIfNew();
          }}
          onOpen={() => fileInput.current?.click()}
          onAi={() => setScreen("ai")}
          onHomes={() => dispatch({ type: "overlay", overlay: "homes" })}
        />
      )}
      {screen === "ai" && (
        <AiDesigner
          onBack={() => setScreen("title")}
          onDone={async (result) => {
            if (!(await adopt(result.project, "Design my home with AI"))) return;
            dispatch({ type: "choose-floor", floor: "all" });
            enterWorkspace();
            constructionReveal();
            showDesign(result);
          }}
        />
      )}
      {screen === "gallery" && (
        <TemplateGallery
          onBack={() => setScreen("title")}
          onPreview={onPreview}
          onBuild={async (project, template) => {
            if (!(await adopt(project, `Start a ${template.name.toLowerCase()}`))) return;
            dispatch({ type: "choose-floor", floor: "all" });
            enterWorkspace();
            constructionReveal();
            if (editor.prefs.tourSeen)
              dispatch({
                type: "notify",
                text: `Ta-da! Your ${template.name.toLowerCase()} is ready. Tap any room to make it yours.`,
                tone: "success",
              });
            // The tour waits for the "Ta-da!" so it never covers the reveal.
            if (reduced) startTourIfNew();
            else reveal.current.push(window.setTimeout(startTourIfNew, REVEAL_MS));
          }}
          onCustom={() => {
            enterWorkspace();
            dispatch({ type: "overlay", overlay: "start" });
          }}
          onAi={() => setScreen("ai")}
        />
      )}
      {design && notesReady && screen === "workspace" && !explore && !chromeHidden && !tour && (
        <DesignNotes
          key={design.variant}
          result={design}
          onReplace={(next) => {
            editor.commit(next.project, "Try another AI design", { select: null });
            constructionReveal();
            showDesign(next);
          }}
          onClose={() => {
            setDesign(null);
            startTourIfNew();
          }}
        />
      )}
      {tour && screen === "workspace" && (
        <CoachMarks
          onDone={() => {
            setTour(false);
            editor.setPrefs({ tourSeen: true });
          }}
        />
      )}
      {screen !== "workspace" || explore ? null : chromeHidden ? (
        <IconButton
          icon={Icon.showInside}
          className="dh-show-chrome"
          label="Show controls"
          onClick={() => dispatch({ type: "chrome", hidden: false })}
        />
      ) : (
        <>
          <TopBar
            desktop={desktop}
            onAi={openAi}
            onHome={() => {
              saveSession({ titleDismissed: false });
              setScreen("title");
            }}
          />
          {desktop && inspector}
          {/* Hidden in a room, but still mounted so finishing the home celebrates. */}
          {!design && <ChecklistPill hidden={!!state.focus} />}
          {!state.focus && <MoveBanner />}
          {!explore && !state.focus && <FloorSwitcher />}
          <CameraHud />
          {!explore && (
            <IconButton
              icon={Icon.hideControls}
              className="dh-hide-chrome"
              label="Hide controls"
              onClick={() => dispatch({ type: "chrome", hidden: true })}
            />
          )}
          {desktop ? (
            <>
              <ModeHint />
              <div className="dh-bottom is-desktop" data-chrome="bottom">
                {showDock && <ActionDock />}
              </div>
            </>
          ) : (
            <div className="dh-bottom" data-inset="bottom" data-chrome="bottom">
              {state.tool === "select" && inspector}
              <ModeHint />
              {showDock ? <ActionDock /> : !state.focus && <HomeBar onAi={openAi} />}
            </div>
          )}
        </>
      )}
      {state.viewOptions && !chromeHidden && <ViewOptions />}
      <Notifications />
      <SelectionAnnouncer />
      <ConfirmDialog />
      <DialogHost
        fileInput={fileInput}
        onReplayTour={() => setTour(true)}
        onStartNew={() => setScreen("gallery")}
        onHomeOpened={() => {
          if (screen !== "workspace") enterWorkspace();
        }}
        capture={capture}
        onTakePhoto={takePhoto}
      />
      <ImportFromLink
        onAdded={() => {
          if (screen !== "workspace") enterWorkspace();
        }}
      />
      <ProjectFileInput
        inputRef={fileInput}
        onOpened={() => {
          if (screen !== "workspace") enterWorkspace();
        }}
      />
    </div>
  );
}

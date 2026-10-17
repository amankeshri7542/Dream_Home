import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStarter } from "../domain/starters";
import type { Project } from "../domain/types";
import { loadSession, saveSession } from "../editor/preferences";
import { useReducedMotion } from "../editor/hooks";
import { CoachMarks, TemplateGallery, TitleScreen } from "../onboarding/Onboarding";
import { AiDesigner, type AiResult } from "../ai/AiDesigner";
import { DesignNotes } from "../ai/DesignNotes";
import { ExploreHud } from "../explore/ExploreHud";
import { PhotoStudio, type PhotoSettings } from "../photo/PhotoStudio";
import type { PhotoJobRequest, PhotoOutcome } from "../photo/PhotoRenderer";
import { photoQuality, type PhotoScene } from "../photo/settings";
import { GOLDEN_HOUR } from "../editor/state";
import {
  createFeed,
  reelQuality,
  type ReelJobRequest,
  type ReelOutcome,
  type ReelProgress,
  type ReelScene,
  type ReelSettings,
} from "../reel/settings";
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
import { photoRect, type PlanCheckState } from "../planread/check";
import type { PlanStartResult } from "../planread/PlanStart";
import { SelectionAnnouncer } from "./Announcer";
import { useBackButton } from "./useBackButton";
import { PlanLens } from "./PlanLens";
import { SceneHost } from "./SceneHost";
import { TopBar } from "./TopBar";
import "./shell.css";
import "./studio/studio.css";

// The video studio loads only when opened (the filming itself loads later still).
const ReelStudio = lazy(() => import("../reel/ReelStudio"));
const SunlightSheet = lazy(() => import("../insights/SunlightSheet"));
// Starting from a builder's plan: the steps load when chosen.
const PlanStart = lazy(() => import("../planread/PlanStart"));
const PlanCheck = lazy(() => import("../planread/PlanCheck"));

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
  const [screen, setScreen] = useState<"title" | "gallery" | "ai" | "plan" | "workspace">(() =>
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
  // Checking a home read from a builder's plan: its photo under the 2D plan.
  const [planCheck, setPlanCheck] = useState<PlanCheckState | null>(null);
  const planOpen = screen === "plan" || (screen === "workspace" && state.overlay === "plan");
  const closePlanStart = () => (screen === "plan" ? setScreen("title") : dispatch({ type: "overlay", overlay: null }));
  const fromPlan = async ({ plan, photo, read }: PlanStartResult) => {
    if (!(await adopt(plan.project, read ? "Start from my builder’s plan" : "Draw my builder’s plan"))) return URL.revokeObjectURL(photo.url);
    if (planCheck) URL.revokeObjectURL(planCheck.url);
    dispatch({ type: "overlay", overlay: null });
    enterWorkspace();
    dispatch({ type: "choose-floor", floor: plan.project.floors[0].id });
    dispatch({ type: "lens", open: true });
    setPlanCheck({
      homeId: "",
      url: photo.url,
      rect: plan.photo,
      offset: { x: 0, z: 0 },
      scale: 1,
      show: true,
      unsure: plan.unsure,
      notes: read
        ? plan.notes
        : ["Your photo is under the plan. Add rooms with Add room, then move and resize them to match the drawing.", ...plan.notes],
    });
  };
  // The check belongs to the home it was made for.
  useEffect(() => {
    if (planCheck && !planCheck.homeId) setPlanCheck({ ...planCheck, homeId: editor.homes.activeId });
    else if (planCheck && planCheck.homeId !== editor.homes.activeId) {
      URL.revokeObjectURL(planCheck.url);
      setPlanCheck(null);
    }
  }, [planCheck, editor.homes.activeId]);
  const makeIt3d = () => {
    if (planCheck) URL.revokeObjectURL(planCheck.url);
    setPlanCheck(null);
    dispatch({ type: "lens", open: false });
    dispatch({ type: "select", target: null });
    dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "hero" } });
    constructionReveal();
    dispatch({ type: "notify", text: "Your plan is in 3D! Tap any room to make it yours.", tone: "success" });
  };
  const [photoRequest, setPhotoRequest] = useState<{ id: number } | null>(null);
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
  const onPhoto = useCallback((blob: Blob) => snapshotFor.current?.(blob), []);

  // Render-quality photos (src/photo): the studio, and share-link pictures.
  const [photoScene, setPhotoScene] = useState<PhotoScene | null>(null);
  const [photoJob, setPhotoJob] = useState<PhotoJobRequest | null>(null);
  const [photoProgress, setPhotoProgress] = useState(0);
  const photoCancel = useMemo(() => ({ current: false }), []);
  const photoWaiter = useRef<((outcome: PhotoOutcome) => void) | null>(null);
  const onPhotoDone = useCallback((outcome: PhotoOutcome) => {
    setPhotoJob(null);
    const resolve = photoWaiter.current;
    photoWaiter.current = null;
    resolve?.(outcome);
  }, []);
  const makePhoto = useCallback(
    (settings: PhotoSettings & { longEdge?: number; samples?: number }) =>
      new Promise<PhotoOutcome>((resolve) => {
        const quality = photoQuality({ phone: !desktop, maxTexture: Infinity });
        photoCancel.current = false;
        photoWaiter.current = resolve;
        setPhotoProgress(0);
        setPhotoJob({ id: Date.now(), ...quality, ...settings });
      }),
    [desktop, photoCancel],
  );
  const openPhotoStudio = useCallback(() => dispatch({ type: "overlay", overlay: "photo" }), [dispatch]);
  /** The share link's picture: the whole home, opened up, in golden light. */
  const sharePicture = useCallback(async () => {
    setPhotoScene({ framing: "aerial", hour: GOLDEN_HOUR, livedIn: state.view.livedIn !== false, festive: false });
    const outcome = await makePhoto({ framing: "aerial", mood: "golden", aspect: 1200 / 630, watermark: false, longEdge: 1200, samples: 10 });
    setPhotoScene(null);
    return "blob" in outcome ? outcome.blob : capture();
  }, [makePhoto, capture, state.view.livedIn]);

  // The "My dream home" reel (src/reel): the studio's preview and each shot's
  // scene, the job the canvas films, and its progress (a feed, so filming
  // never re-renders the editor).
  const [reelScene, setReelScene] = useState<ReelScene | null>(null);
  const [reelJob, setReelJob] = useState<ReelJobRequest | null>(null);
  const reelCancel = useMemo(() => ({ current: false }), []);
  const reelFeed = useMemo(() => createFeed<ReelProgress | null>(null), []);
  const reelWaiter = useRef<((outcome: ReelOutcome) => void) | null>(null);
  const onReelDone = useCallback((outcome: ReelOutcome) => {
    setReelJob(null);
    const resolve = reelWaiter.current;
    reelWaiter.current = null;
    resolve?.(outcome);
  }, []);
  const makeReel = useCallback(
    (settings: ReelSettings) =>
      new Promise<ReelOutcome>((resolve) => {
        reelCancel.current = false;
        reelWaiter.current = resolve;
        reelFeed.set(null);
        setReelJob({ id: Date.now(), ...reelQuality({ phone: !desktop }), ...settings });
      }),
    [desktop, reelCancel, reelFeed],
  );
  const openReelStudio = useCallback(() => dispatch({ type: "overlay", overlay: "reel" }), [dispatch]);
  const explore = state.mode === "explore";
  const studioOpen = (state.overlay === "photo" || state.overlay === "reel" || state.overlay === "sunlight") && screen === "workspace";
  const chromeHidden = state.chromeHidden || screen !== "workspace" || studioOpen;
  const layerOpen =
    screen === "gallery" ||
    screen === "ai" ||
    screen === "plan" ||
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
    if (screen === "gallery" || screen === "ai" || screen === "plan") setScreen("title");
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
        photo={photoScene}
        photoJob={photoJob}
        photoCancel={photoCancel}
        onPhotoProgress={setPhotoProgress}
        onPhotoDone={onPhotoDone}
        reel={reelScene}
        reelJob={reelJob}
        reelCancel={reelCancel}
        onReelScene={setReelScene}
        onReelProgress={reelFeed.set}
        onReelDone={onReelDone}
      />
      {studioOpen && state.overlay === "reel" && (
        <Suspense fallback={null}>
          <ReelStudio
            onClose={() => dispatch({ type: "overlay", overlay: null })}
            onScene={setReelScene}
            render={makeReel}
            feed={reelFeed}
            onCancel={() => (reelCancel.current = true)}
            capture={sharePicture}
            onTakePhoto={openPhotoStudio}
          />
        </Suspense>
      )}
      {studioOpen && state.overlay === "sunlight" && (
        <Suspense fallback={null}>
          <SunlightSheet onClose={() => dispatch({ type: "overlay", overlay: null })} />
        </Suspense>
      )}
      {studioOpen && state.overlay === "photo" && (
        <PhotoStudio
          onClose={() => dispatch({ type: "overlay", overlay: null })}
          onScene={setPhotoScene}
          render={makePhoto}
          progress={photoProgress}
          onCancel={() => (photoCancel.current = true)}
          snapshot={capture}
        />
      )}
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
      {explore && screen === "workspace" && !state.chromeHidden && !studioOpen && (
        <ExploreHud
          onPhoto={openPhotoStudio}
          onVideo={openReelStudio}
          walkAvailable
          walkStatus={state.explore === "walk" ? walkStatus : undefined}
          walkFloorId={walkFloorId}
        />
      )}
      <PlanLens
        desktop={desktop}
        primary={noWebGL}
        trayDrag={trayDrag}
        trayDrop={trayDrop}
        onTrayDropHandled={() => setTrayDrop(null)}
        underlay={planCheck?.show ? { href: planCheck.url, rect: photoRect(planCheck) } : null}
        unsure={planCheck?.unsure}
        check={
          planCheck && (
            <Suspense fallback={null}>
              <PlanCheck check={planCheck} onChange={setPlanCheck} onDone={makeIt3d} />
            </Suspense>
          )
        }
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
          onPlan={() => setScreen("plan")}
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
      {planOpen && (
        <Suspense fallback={null}>
          <PlanStart onBack={closePlanStart} onDone={(result) => void fromPlan(result)} />
        </Suspense>
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
      {screen !== "workspace" || explore || studioOpen ? null : chromeHidden ? (
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
        capture={sharePicture}
        onTakePhoto={openPhotoStudio}
        onMakeVideo={openReelStudio}
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

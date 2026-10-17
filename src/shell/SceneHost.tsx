import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useEditor } from "../editor/EditorProvider";
import type { GhostPreview, Insets, SelectionTarget } from "../editor/types";
import type { Project } from "../domain/types";
import { DEFAULT_VIEW, sceneView, GOLDEN_HOUR } from "../editor/state";
import { BrandMark } from "./TopBar";
import { useReducedMotion } from "../editor/hooks";
import { setAsideRoom } from "../domain/tray";
import type { PhotoJobRequest, PhotoOutcome } from "../photo/PhotoRenderer";
import type { PhotoScene } from "../photo/settings";
import type { SceneView } from "../scene/types";

/**
 * What a photo shows: "Front" is the finished house from the street (roof on);
 * "Aerial" the whole home opened up like a dollhouse; "This view" and "Room"
 * keep what's on screen (a room stays the cut-open hero). A room photo leaves
 * out street life: a passing bird is a big dark blot at room scale. Lived-in
 * details and the Diwali set follow the studio's choices in every framing.
 */
function photoView(photo: PhotoScene, current: SceneView, streetLife: boolean | undefined): SceneView {
  const life = { livedIn: photo.livedIn, festive: photo.festive };
  if (photo.framing === "front")
    return { ...DEFAULT_VIEW, floor: "all", stage: 5, roof: true, cutaway: false, labels: false, walls: true, streetLife, ...life };
  if (photo.framing === "aerial") return { ...DEFAULT_VIEW, floor: "all", labels: false, streetLife, ...life };
  if (photo.framing === "room") return { ...current, labels: false, streetLife: false, ...life };
  return { ...current, labels: false, ...life };
}

// The single, always-mounted 3D canvas. It never unmounts when panels, the
// plan lens or tools change — only overlays move around it.
/** Renderer v2 (perspective diorama). */
export const RENDERER_V2 = true;
const Scene = lazy(() => import("../scene/Scene"));
const Walkthrough = lazy(() => import("../explore/Walkthrough"));
// Three.js lives in the lazy scene chunk; so does the 3D move gesture. It is
// loaded into state rather than suspending inside the Canvas, whose first
// render would otherwise never retry the suspended child.
type Gestures = Pick<typeof import("./MoveInteraction"), "MoveInteraction" | "FurnitureDrag">;

export function SceneHost({
  insets,
  onWebGLUnavailable,
  preview,
  showcase = false,
  photoRequest,
  onPhoto,
  onWalkStatus,
  photo,
  photoJob,
  photoCancel,
  onPhotoProgress,
  onPhotoDone,
}: {
  /** While the photo studio is open (or a share picture is made): the mood's hour and the framing's view. */
  photo?: PhotoScene | null;
  photoJob?: PhotoJobRequest | null;
  photoCancel?: { current: boolean };
  onPhotoProgress?: (fraction: number) => void;
  onPhotoDone?: (outcome: PhotoOutcome) => void;
  onWalkStatus?: (status: { floorId: string; roomId: string | null }) => void;
  photoRequest?: { id: number } | null;
  onPhoto?: (blob: Blob) => void;
  insets: Insets;
  onWebGLUnavailable: (unavailable: boolean) => void;
  /** A transient project shown instead of the document (template previews). */
  preview?: Project | null;
  /** Title and gallery screens show the home as a slowly turning hero. */
  showcase?: boolean;
}) {
  const { state, project, select, selected, dispatch, activeFloor, run, revision, unit } = useEditor();
  const [ghost, setGhost] = useState<GhostPreview | null>(null);
  const [gestures, setGestures] = useState<Gestures | null>(null);
  useEffect(() => {
    let live = true;
    void import("./MoveInteraction").then((m) => {
      if (live) setGestures({ MoveInteraction: m.MoveInteraction, FurnitureDrag: m.FurnitureDrag });
    });
    return () => {
      live = false;
    };
  }, []);
  const editing = !showcase && !preview && state.mode === "build";
  const decorating = !showcase && !preview && state.mode === "decorate";
  const MoveInteraction = gestures?.MoveInteraction;
  const FurnitureDrag = gestures?.FurnitureDrag;
  const reduced = useReducedMotion();
  const walking = RENDERER_V2 && !showcase && state.mode === "explore" && state.explore === "walk";
  // The floor the visitor is on while walking; its rooms are furnished.
  const [walkFloor, setWalkFloor] = useState<string | null>(null);
  useEffect(() => {
    if (!walking) setWalkFloor(null);
  }, [walking]);
  const walkStatus = useCallback(
    (status: { floorId: string; roomId: string | null }) => {
      setWalkFloor(status.floorId);
      onWalkStatus?.(status);
    },
    [onWalkStatus],
  );
  const [unsupported] = useState(() => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2");
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      return !context;
    } catch {
      return true;
    }
  });
  useEffect(() => onWebGLUnavailable(unsupported), [unsupported, onWebGLUnavailable]);
  const onSelect = useCallback(
    (target: SelectionTarget | null) => {
      if (target) select(target, "canvas");
      else if (state.tool === "select") dispatch({ type: "select", target: null });
    },
    [select, dispatch, state.tool],
  );
  return (
    <div
      className="dh-scene-host model-canvas mode-3d"
      data-chrome="canvas"
    >
      <div className="scene-pane">
        <Suspense
          fallback={
            <div className="dh-scene-loading">
              <BrandMark size={44} />
              <span>Getting your home ready…</span>
            </div>
          }
        >
          <Scene
            project={preview ?? project}
            view={
              photo && !showcase && !(walking && photo.framing === "view")
                ? photoView(photo, sceneView(state), state.view.streetLife)
                : showcase
                ? { ...DEFAULT_VIEW, stage: 5, roof: true, cutaway: false, labels: false }
                : walking
                  ? {
                      ...DEFAULT_VIEW,
                      floor: "all",
                      stage: 5,
                      roof: true,
                      cutaway: false,
                      labels: false,
                      walls: true,
                      furnishings: true,
                      walkFloorId: walkFloor ?? activeFloor.id,
                      streetLife: state.view.streetLife,
                      // A photo "through your eyes" keeps the studio's details.
                      livedIn: photo ? photo.livedIn : state.view.livedIn,
                      festive: photo?.festive,
                    }
                  : sceneView(state)
            }
            mode={showcase || photo ? "explore" : state.mode}
            selection={showcase || photo ? null : (selected?.target ?? null)}
            onSelect={onSelect}
            highlight={state.flash}
            cameraCommand={state.camera}
            insets={insets}
            hour={showcase ? GOLDEN_HOUR : photo ? photo.hour : state.hour}
            quality={state.quality}
            onQualityResolved={() => undefined}
            explore={showcase ? "showcase" : photo && !walking ? "orbit" : state.explore}
            photoJob={photoJob}
            photoCancel={photoCancel}
            onPhotoProgress={onPhotoProgress}
            onPhotoDone={onPhotoDone}
            photoRequest={photoRequest}
            onPhoto={onPhoto}
            onWalkStatus={walkStatus}
            areaUnit={unit === "ft" ? "ft" : "m"}
            ghost={editing || decorating ? ghost : null}
          >
            {editing && MoveInteraction && (
              <MoveInteraction
                project={project}
                revision={revision}
                mode={state.mode}
                tool={state.tool}
                floorId={activeFloor.id}
                selection={selected?.target ?? null}
                onGhost={setGhost}
                onSelect={(target) => select(target, "canvas")}
                onCommit={(result, label) =>
                  run(result, label, { notice: "Moved! Undo is always here." })
                }
                onBlocked={(result) => run(result, "Move", { quietError: true })}
                onSetAside={(room) => {
                  if (
                    run(setAsideRoom(project, room.floorId, room.id), `Keep ${room.name} for later`, {
                      select: null,
                      quietError: true,
                    })
                  )
                    dispatch({
                      type: "notify",
                      text: `${room.name} is kept for later. Place it back whenever you like.`,
                      tone: "success",
                      undo: true,
                    });
                }}
              />
            )}
            {decorating && FurnitureDrag && (
              <FurnitureDrag
                project={project}
                revision={revision}
                mode={state.mode}
                selection={selected?.target ?? null}
                onGhost={setGhost}
                onCommit={(result, label, target) =>
                  run(result, label, { select: target, notice: "Moved! Undo is always here." })
                }
                onBlocked={(result) => run(result, "Move furniture", { quietError: true })}
              />
            )}
            {walking && (
              <Suspense fallback={null}>
                <Walkthrough
                  project={project}
                  startFloorId={activeFloor.id}
                  reducedMotion={reduced}
                  night={state.hour >= 19 || state.hour < 6.5}
                  onStatus={walkStatus}
                />
              </Suspense>
            )}
          </Scene>
        </Suspense>
      </div>
    </div>
  );
}

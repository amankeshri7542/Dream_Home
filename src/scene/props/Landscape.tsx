// Garden: automatic trees/shrubs/hedges (absent Project.landscape), explicit
// landscape items, and courtyard beds. Models come from exterior.glb (batched
// per slot); procedural toy shapes stand in while it loads or if it fails.
// Explicit items are pickable in "outside" mode.
import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Color, Matrix4, Vector3 } from "three";
import type { Project } from "../../domain/types";
import { Buckets, rgb } from "../building/geometry/QuadBuilder";
import { useBuckets } from "../building/useBuckets";
import type { MaterialLibrary } from "../materials/library";
import type { Placement } from "./batched";
import { gardenPlan, modelSize, type GardenModel, type GardenPad } from "./garden";
import { KitPlacements } from "./KitPlacements";
import type { SiteLayout } from "./site";
import { blob, shrub, tree, type TreeKind } from "./shapes";

type Props = {
  project: Project;
  layout: SiteLayout;
  library: MaterialLibrary;
  pickable: boolean;
  onPick: (id: string, event: ThreeEvent<MouseEvent>) => void;
};

const up = new Vector3(0, 1, 0);
/** Garden accents: blossom petals and flower beds. */
const MODEL_TINTS: Record<string, Record<string, Color>> = {
  "tree-blossom": { accent: new Color("#f3b4c6") },
  "flowerbed-module": { accent: new Color("#f4c95d") },
};
export function modelMatrix(m: Pick<GardenModel, "x" | "y" | "z" | "yaw" | "scale">) {
  return new Matrix4()
    .makeRotationAxis(up, m.yaw)
    .multiply(new Matrix4().makeScale(...m.scale))
    .setPosition(m.x, m.y, m.z);
}

export function Landscape({ project, layout, library, pickable, onPick }: Props) {
  const key = JSON.stringify([project.plot, project.garden, project.landscape ?? null, layout.trees, layout.shrubs, layout.obstacles, project.verticalSpaces]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => gardenPlan(project, layout), [key]);
  const placements = useMemo<Placement[]>(
    () =>
      plan.models.map((m, i) => ({
        model: m.model,
        matrix: modelMatrix(m),
        owner: m.owner ?? `auto:${i}`,
        tints: MODEL_TINTS[m.model],
      })),
    [plan],
  );
  const pick = pickable && project.landscape ? (owner: string, e: ThreeEvent<MouseEvent>) => {
    if (owner.startsWith("auto:")) return;
    e.stopPropagation();
    onPick(owner, e);
  } : undefined;
  return (
    <group name="landscape">
      <Pads pads={plan.pads} library={library} onPick={pick} />
      <KitPlacements
        kit="exterior"
        placements={placements}
        library={library}
        onPick={pick}
        fallback={<ProceduralModels models={plan.models} library={library} onPick={pick} />}
      />
    </group>
  );
}

function Pads({ pads, library, onPick }: { pads: GardenPad[]; library: MaterialLibrary; onPick?: (owner: string, e: ThreeEvent<MouseEvent>) => void }) {
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"beds">();
    const b = buckets.get("beds");
    for (const p of pads) {
      b.setOwner(p.owner ?? null);
      b.box([p.x0, p.y0, p.z0], [p.x1, p.y1, p.z1], rgb(p.color), [2]);
    }
    return { buckets };
  }, [pads]);
  return (
    <>
      {built.map((b) => (
        <mesh
          key={b.key}
          geometry={b.geometry}
          material={library.vertexColor("beds", 0.9)}
          receiveShadow
          castShadow
          dispose={null}
          onClick={
            onPick
              ? (e) => {
                  const owner = e.faceIndex != null ? b.ownerAt(e.faceIndex) : null;
                  if (owner) onPick(owner, e);
                }
              : undefined
          }
        />
      ))}
    </>
  );
}

const HEDGE = rgb("#6d965f");

/** Procedural stand-ins for kit models (used while loading / on failure). */
function ProceduralModels({ models, library, onPick }: { models: GardenModel[]; library: MaterialLibrary; onPick?: (owner: string, e: ThreeEvent<MouseEvent>) => void }) {
  const { built } = useBuckets(() => {
    const buckets = new Buckets<"foliage">();
    const fol = buckets.get("foliage");
    models.forEach((m, i) => {
      fol.setOwner(m.owner ?? null);
      const size = modelSize(m.model);
      if (m.model.startsWith("tree-")) {
        const kind = m.model.slice(5) as TreeKind;
        tree(fol, m.x, m.y, m.z, m.scale[1] * (size.h / 4.2), kind, i + 1);
      } else if (m.model === "shrub") shrub(fol, m.x, m.y, m.z, (size.w * m.scale[0]) / 2, i + 3, true);
      else if (m.model === "hedge-module" || m.model === "flowerbed-module") {
        const along = (size.w * m.scale[0]) / 2 - 0.02,
          across = (size.d * m.scale[2]) / 2;
        const [hx, hz] = Math.abs(Math.sin(m.yaw)) > 0.5 ? [across, along] : [along, across];
        fol.softBox([m.x - hx, m.y, m.z - hz], [m.x + hx, m.y + size.h * m.scale[1], m.z + hz], HEDGE, 0.1);
      } else if (m.model === "rock") blob(fol, [m.x, m.y + 0.12, m.z], [0.35, 0.25, 0.3], rgb("#a9a296"), 0, i);
      else {
        const hx = (size.w * m.scale[0]) / 2,
          hz = (size.d * m.scale[2]) / 2;
        fol.softBox([m.x - hx, m.y, m.z - hz], [m.x + hx, m.y + size.h * m.scale[1], m.z + hz], rgb(m.model === "car" ? "#8fb6c1" : "#c8bda9"), 0.08);
      }
    });
    return { buckets };
  }, [models]);
  return (
    <>
      {built.map((b) => (
        <mesh
          key={b.key}
          geometry={b.geometry}
          material={library.vertexColor("foliage", 0.88)}
          castShadow
          receiveShadow
          dispose={null}
          onClick={
            onPick
              ? (e) => {
                  const owner = e.faceIndex != null ? b.ownerAt(e.faceIndex) : null;
                  if (owner) onPick(owner, e);
                }
              : undefined
          }
        />
      ))}
    </>
  );
}

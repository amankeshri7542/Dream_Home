// Lived-in details in Explore and Photo: the everyday set (shoes, chai, a
// sleeping cat…) and the Diwali set (diyas, string lights, rangoli), placed
// by livedInDecor. Kit pieces come from public/models/life.glb, loaded only
// here; static pieces share one BatchedMesh per material slot and each moving
// part (the cat's breathing body, the diya flames) has its own, so the whole
// layer costs a handful of draw calls. Idle motion follows the scene's shared
// clock and only runs when SceneRoot opens the gate.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  type Material,
} from "three";
import { PORCH } from "../../domain/entrance";
import { livedInDecor, type LivedInItem } from "../../domain/livedIn";
import type { Floor, Project } from "../../domain/types";
import { roofDeck } from "../building/geometry/rooftop";
import { FLOOR_SURFACE, GROUND_TOP, floorBase } from "../coords";
import type { MaterialLibrary } from "../materials/library";
import { hash2 } from "../materials/noise";
import { patchMaterial } from "../materials/patches";
import { buildBatches, disposeBatches, type Batch, type Placement } from "../props/batched";
import { fencePlan } from "../props/fence";
import type { SiteLayout } from "../props/site";
import { loadKit, type Kit } from "../props/kit";
import { useSceneStore } from "../store";
import { BULB_COLOURS, festoon, rangoliTexture, wallDiyas } from "./festive";

export type LivedInProps = {
  project: Project;
  /** The floors on show, lowest first. */
  floors: readonly Floor[];
  /** Room pieces only on the floor whose furniture shows. */
  furnishedFloorId: string | null;
  /** Terrace pieces only when the roof shows. */
  roofVisible: boolean;
  everyday: boolean;
  diwali: boolean;
  /** Idle motion gate (Explore or Photo, not battery, not reduced motion). */
  motion: boolean;
  /** 0 by day → 1 at night: how brightly flames and bulbs glow. */
  glow: number;
  library: MaterialLibrary;
  /** The site plan: at Diwali the front compound wall gets a row of diyas. */
  layout: SiteLayout;
};

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
/** Rangoli lies just above the garden path pads. */
const RANGOLI_LIFT = 0.034;

/** The pieces on show, given what the view reveals. */
export function shownDecor(
  project: Project,
  floors: readonly Floor[],
  opts: Pick<LivedInProps, "furnishedFloorId" | "roofVisible" | "everyday" | "diwali">,
): LivedInItem[] {
  const top = floors.at(-1)?.id;
  return floors
    .flatMap((f) => livedInDecor(project, f.id))
    .filter(
      (item) =>
        (item.set === "everyday" ? opts.everyday : opts.diwali) &&
        (item.roomId ? item.floorId === opts.furnishedFloorId : item.on !== "roof" || (opts.roofVisible && item.floorId === top)),
    );
}

/** World height (plot-local metres) of a piece's base. */
export function decorBaseY(item: LivedInItem, floor: Floor): number {
  const y = item.y / 100;
  if (item.on === "porch") return PORCH.landing.top / 100 + y;
  if (item.on === "ground") return GROUND_TOP + RANGOLI_LIFT + y;
  if (item.on === "roof") return roofDeck(floorBase(floor) + floor.height / 100) + y;
  return floorBase(floor) + FLOOR_SURFACE + y;
}

/** A piece's placement: back to `rotation`, model front facing +z, like furniture. */
function decorMatrix(item: LivedInItem, floor: Floor): Matrix4 {
  return new Matrix4().makeRotationAxis(UP, -item.rotation * DEG).setPosition(item.x / 100, decorBaseY(item, floor), item.z / 100);
}

export function LivedIn(props: LivedInProps) {
  const { project, floors, furnishedFloorId, roofVisible, everyday, diwali } = props;
  const floorKey = floors.map((f) => f.id).join(",");
  const items = useMemo(
    () => shownDecor(project, floors, { furnishedFloorId, roofVisible, everyday, diwali }),
    // floors is a fresh array each render; its ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, floorKey, furnishedFloorId, roofVisible, everyday, diwali],
  );
  const floorOf = useMemo(() => new Map(project.floors.map((f) => [f.id, f])), [project]);
  const kitItems = useMemo(() => items.filter((i) => i.model !== "rangoli" && i.model !== "string-lights"), [items]);
  const { layout } = props;
  const lamps = useMemo(
    () => (diwali ? wallDiyas(fencePlan(project, layout), project.plot.road, project.plot) : []),
    [diwali, project, layout],
  );
  const rangoli = useMemo(() => items.filter((i) => i.model === "rangoli"), [items]);
  const strings = useMemo(() => items.filter((i) => i.model === "string-lights"), [items]);
  if (!items.length && !lamps.length) return null;
  return (
    <group name="lived-in" userData={{ pieces: items.length + lamps.length }}>
      {kitItems.length + lamps.length > 0 && <KitDecor {...props} items={kitItems} lamps={lamps} floorOf={floorOf} />}
      {rangoli.length > 0 && <Rangoli items={rangoli} floorOf={floorOf} />}
      {strings.length > 0 && <StringLights items={strings} floorOf={floorOf} glow={props.glow} />}
    </group>
  );
}

type Pieces = { items: LivedInItem[]; floorOf: Map<string, Floor> };

/** The life kit, loaded on first use; the photo waits for it (store hold). */
function useLifeKit(): Kit | null {
  const store = useSceneStore();
  const [kit, setKit] = useState<Kit | null>(null);
  useEffect(() => {
    if (kit) return;
    let live = true;
    const release = store.hold();
    loadKit("life")
      .then((k) => live && setKit(k))
      .catch((e) => console.warn("Dream Home: lived-in details unavailable", e))
      .finally(release);
    return () => {
      live = false;
      release();
    };
  }, [kit, store]);
  return kit;
}

const noRaycast = () => undefined;

/** Diyas placed by the scene (on the compound wall), plot-local metres. */
type Lamps = { lamps: [number, number, number][] };
const LAMP = "diwali-diya";

function KitDecor({ items, lamps, floorOf, library, motion, glow }: Pieces & Lamps & Pick<LivedInProps, "library" | "motion" | "glow">) {
  const kit = useLifeKit();
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const store = useSceneStore();
  const built = useMemo(() => {
    if (!kit) return null;
    const statics: Placement[] = [];
    const parts = new Map<string, Placement[]>();
    const place = (model: string, matrix: Matrix4, owner: string) => {
      if (kit.models.has(model)) statics.push({ model, matrix, owner });
      for (const [name, pivot] of kit.pivots) {
        if (!name.startsWith(`${model}:`)) continue;
        const list = parts.get(name) ?? parts.set(name, []).get(name)!;
        list.push({ model: name, matrix: matrix.clone().multiply(new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)), owner });
      }
    };
    for (const item of items) {
      const floor = floorOf.get(item.floorId);
      if (floor) place(item.model, decorMatrix(item, floor), item.id);
    }
    lamps.forEach(([x, y, z], i) => place(LAMP, new Matrix4().makeRotationAxis(UP, hash2(i, 5, 9) * Math.PI * 2).setPosition(x, y, z), `wall:${LAMP}-${i}`));
    const materialFor = (slot: string): Material => kit.materials.get(slot) ?? library.joinery();
    const still = buildBatches(kit, statics, materialFor);
    const moving = [...parts].map(([name, list]) => ({ name, batches: buildBatches(kit, list, materialFor) }));
    for (const b of [...still, ...moving.flatMap((m) => m.batches)]) {
      b.mesh.raycast = noRaycast;
      b.mesh.name = `lived-in:${b.slot}`;
    }
    // Small moving parts don't cast shadows (the shadow map isn't redrawn while they move).
    for (const m of moving) for (const b of m.batches) b.mesh.castShadow = false;
    return { still, moving };
  }, [kit, items, lamps, floorOf, library]);
  useEffect(() => {
    if (!built) return;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    return () => disposeBatches([...built.still, ...built.moving.flatMap((m) => m.batches)]);
  }, [built, gl, invalidate]);

  const flame = kit?.materials.get("flame") ?? null;
  useEffect(() => {
    if (flame) flame.emissiveIntensity = flameGlow(glow);
    invalidate();
  }, [flame, glow, invalidate]);

  const tmp = useMemo(() => new Matrix4(), []);
  const scale = useMemo(() => new Matrix4(), []);
  const animated = useRef(false);
  useFrame(() => {
    if (!built) return;
    if (motion) {
      const t = store.time();
      for (const { name, batches } of built.moving) for (const b of batches) animateParts(name, b, t, tmp, scale);
      if (flame) flame.emissiveIntensity = flameGlow(glow) * (0.86 + 0.14 * flicker(t, 0));
      animated.current = true;
    } else if (animated.current) {
      // Motion stopped (tab hidden, Build, reduced motion): back to rest.
      for (const { batches } of built.moving) for (const b of batches) b.base.forEach((m, id) => b.mesh.setMatrixAt(id, m));
      if (flame) flame.emissiveIntensity = flameGlow(glow);
      animated.current = false;
    }
  });
  if (!built) return null;
  return (
    <>
      {[...built.still, ...built.moving.flatMap((m) => m.batches)].map((b) => (
        <primitive key={b.mesh.uuid} object={b.mesh} />
      ))}
    </>
  );
}

const flameGlow = (glow: number) => 1.1 + glow * 4;
/** Two beating sines: a candle-like, never-repeating-looking flicker in [-1, 1]. */
const flicker = (t: number, phase: number) => Math.sin(t * 11.3 + phase) * 0.6 + Math.sin(t * 17.9 + phase * 2.1) * 0.4;

/** The cat breathes; flames flicker. Matrices are the part's rest pose × a small scale about its pivot. */
function animateParts(name: string, b: Batch, t: number, out: Matrix4, scale: Matrix4) {
  for (let id = 0; id < b.base.length; id++) {
    const base = b.base[id];
    if (!base) continue;
    const phase = hash2(id, 3, name.length) * 6.28;
    if (name.endsWith(":body")) {
      const breath = Math.sin((t / 3.4) * Math.PI * 2 + phase);
      scale.makeScale(1 + 0.012 * breath, 1 + 0.035 * breath, 1 + 0.02 * breath);
    } else if (name.endsWith(":flame")) {
      const f = flicker(t, phase);
      scale.makeScale(1 - 0.06 * f, 1 + 0.18 * f, 1 - 0.06 * f);
    } else continue;
    b.mesh.setMatrixAt(id, out.copy(base).multiply(scale));
  }
}

function Rangoli({ items, floorOf }: Pieces) {
  const built = useMemo(() => {
    const texture = rangoliTexture();
    const material = patchMaterial(
      new MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.3, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      { clip: true, focus: "fade" },
    );
    const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mesh = new InstancedMesh(plane, material, items.length);
    mesh.name = "lived-in:rangoli";
    mesh.raycast = noRaycast;
    mesh.receiveShadow = true;
    const o = new Object3D();
    items.forEach((item, i) => {
      const floor = floorOf.get(item.floorId)!;
      const size = (item.size ?? 90) / 100;
      o.position.set(item.x / 100, decorBaseY(item, floor) + 0.003, item.z / 100);
      o.rotation.set(0, -item.rotation * DEG, 0);
      o.scale.set(size, 1, size);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.computeBoundingSphere();
    return { mesh, texture, material, plane };
  }, [items, floorOf]);
  useEffect(
    () => () =>
      void setTimeout(() => {
        if (built.mesh.parent) return;
        built.mesh.dispose();
        built.texture.dispose();
        built.material.dispose();
        built.plane.dispose();
      }, 0),
    [built],
  );
  return <primitive object={built.mesh} />;
}

function StringLights({ items, floorOf, glow }: Pieces & { glow: number }) {
  const built = useMemo(() => {
    const points: Vector3[][] = [];
    const m = new Matrix4();
    for (const item of items) {
      const floor = floorOf.get(item.floorId)!;
      m.copy(decorMatrix(item, floor));
      points.push(festoon((item.size ?? 100) / 100).map((p) => new Vector3(p.x, p.y, 0).applyMatrix4(m)));
    }
    const count = points.reduce((n, run) => n + run.length, 0);
    const bulbGeometry = new SphereGeometry(0.026, 8, 6);
    const bulbs = patchMaterial(new MeshBasicMaterial({ color: "#ffffff" }), { clip: true, focus: "fade" });
    const mesh = new InstancedMesh(bulbGeometry, bulbs, count);
    mesh.name = "lived-in:bulbs";
    mesh.raycast = noRaycast;
    const o = new Object3D();
    const colour = new Color();
    let i = 0;
    for (const run of points)
      run.forEach((p, k) => {
        // Each bulb hangs a little below the wire.
        o.position.set(p.x, p.y - 0.03, p.z);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, colour.set(BULB_COLOURS[k % BULB_COLOURS.length]));
        i++;
      });
    mesh.computeBoundingSphere();
    // The wire the bulbs hang from.
    const wire: number[] = [];
    for (const run of points)
      for (let k = 0; k + 1 < run.length; k++) wire.push(...run[k].toArray(), ...run[k + 1].toArray());
    const wireGeometry = new BufferGeometry();
    wireGeometry.setAttribute("position", new BufferAttribute(new Float32Array(wire), 3));
    const wireMaterial = patchMaterial(new LineBasicMaterial({ color: "#2b2621" }), { clip: true });
    const line = new LineSegments(wireGeometry, wireMaterial);
    line.name = "lived-in:wire";
    line.raycast = noRaycast;
    return { mesh, bulbs, bulbGeometry, line, wireGeometry, wireMaterial };
  }, [items, floorOf]);
  useEffect(() => {
    // Bright enough to bloom at night; soft coloured beads by day.
    built.bulbs.color.setScalar(0.85 + glow * 4.5);
  }, [built, glow]);
  useEffect(
    () => () =>
      void setTimeout(() => {
        if (built.mesh.parent) return;
        built.mesh.dispose();
        built.bulbs.dispose();
        built.bulbGeometry.dispose();
        built.wireGeometry.dispose();
        built.wireMaterial.dispose();
      }, 0),
    [built],
  );
  return (
    <>
      <primitive object={built.mesh} />
      <primitive object={built.line} />
    </>
  );
}

// Street life (Explore and the title showcase only): toy people, a dog, a
// lazy cow, an auto-rickshaw, a scooter and circling birds from street.glb,
// plus grass tufts and roadside plants. Every actor part is one instance of a
// single BatchedMesh (one draw call); blob shadows and greenery are instanced.
// SceneRoot's idle ticker asks for ~24 frames a second while this is enabled,
// so the editor keeps a fully idle (zero-frame) demand loop otherwise. Poses
// follow the scene's shared clock.
import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Mesh,
} from "three";
import { STREET_ASSET } from "../assets/assetManifest";
import { IDLE_FPS, usePageVisible } from "../motion";
import { useSceneStore } from "../store";
import type { Project } from "../../domain/types";
import { gradientTexture } from "../materials/textures";
import { hash2 } from "../materials/noise";
import { gltfName, normalise } from "../props/kit";
import type { SiteLayout } from "../props/site";
import { BIRDS, STREET_CAST, actorPose, birdPose, greenery, streetFrame, type Pose } from "./sim";

export const STREET_FPS = IDLE_FPS;

type StreetPart = { suffix: string; geometry: BufferGeometry; rest: Matrix4 };
type StreetKit = Map<string, StreetPart[]>;

/** A street actor part's name after `<actor>:` (leg-l, wheel-f…): the key its pose animates. */
export const streetPart = (mesh: Object3D) => {
  const name = gltfName(mesh);
  return name.split(":")[1] ?? name;
};

let kitPromise: Promise<StreetKit> | null = null;
function loadStreetKit(): Promise<StreetKit> {
  if (!STREET_ASSET) return Promise.reject(new Error("street.glb not built"));
  if (!kitPromise) {
    kitPromise = (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(STREET_ASSET!.url);
      const kit: StreetKit = new Map();
      for (const root of gltf.scene.children) {
        const parts: StreetPart[] = [];
        for (const child of root.children) {
          const mesh = child as Mesh;
          if (!mesh.isMesh) continue;
          mesh.updateMatrix();
          parts.push({ suffix: streetPart(mesh), geometry: normalise(mesh.geometry), rest: mesh.matrix.clone() });
        }
        kit.set(gltfName(root), parts);
      }
      return kit;
    })();
    kitPromise.catch(() => {
      kitPromise = null;
    });
  }
  return kitPromise;
}

type Props = { project: Project; layout: SiteLayout; enabled: boolean };

/** Mounted inside the plot-offset group. `enabled` = mode/tier/motion gate. */
export function StreetLife({ project, layout, enabled }: Props) {
  const visible = usePageVisible();
  const active = enabled && visible;
  const [kit, setKit] = useState<StreetKit | null>(null);
  useEffect(() => {
    if (!active || kit) return;
    let live = true;
    loadStreetKit()
      .then((k) => live && setKit(k))
      .catch((e) => console.warn("Dream Home: street life unavailable", e));
    return () => {
      live = false;
    };
  }, [active, kit]);
  if (!active) return null;
  return (
    <group name="street-life" userData={{ active: true }}>
      <Greenery project={project} layout={layout} />
      {kit && <Actors project={project} kit={kit} />}
    </group>
  );
}

const tmp = {
  m: new Matrix4(),
  actor: new Matrix4(),
  part: new Matrix4(),
  q: new Quaternion(),
  e: new Euler(),
  p: new Vector3(),
  s: new Vector3(),
  up: new Vector3(0, 1, 0),
};

function Actors({ project, kit }: { project: Project; kit: StreetKit }) {
  const built = useMemo(() => {
    type Slot = { id: number; part: StreetPart };
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    const models = [...new Set([...STREET_CAST.map((a) => a.model), "bird"])].filter((m) => kit.has(m));
    let vertices = 0,
      indices = 0,
      instances = 0;
    for (const m of models)
      for (const p of kit.get(m)!) {
        vertices += p.geometry.getAttribute("position").count;
        indices += p.geometry.getIndex()?.count ?? p.geometry.getAttribute("position").count;
      }
    for (const a of STREET_CAST) instances += kit.get(a.model)?.length ?? 0;
    instances += BIRDS * (kit.get("bird")?.length ?? 0);
    const mesh = new BatchedMesh(instances, vertices, indices, material);
    mesh.name = "street-actors";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const geomIds = new Map<BufferGeometry, number>();
    for (const m of models) for (const p of kit.get(m)!) geomIds.set(p.geometry, mesh.addGeometry(p.geometry));
    const slots = (model: string): Slot[] =>
      (kit.get(model) ?? []).map((part) => ({ id: mesh.addInstance(geomIds.get(part.geometry)!), part }));
    const cast = STREET_CAST.filter((a) => kit.has(a.model)).map((a) => ({ actor: a, slots: slots(a.model) }));
    const birds = kit.has("bird") ? Array.from({ length: BIRDS }, () => slots("bird")) : [];
    // Blob shadows (ground actors only).
    const shadowMat = new MeshBasicMaterial({
      color: "#1d160f",
      transparent: true,
      opacity: 0.3,
      alphaMap: gradientTexture("radial", 64),
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadows = new InstancedMesh(plane, shadowMat, cast.length);
    shadows.name = "street-shadows";
    shadows.frustumCulled = false;
    shadows.renderOrder = 1;
    return { mesh, material, cast, birds, shadows, shadowMat, plane };
  }, [kit]);
  // Deferred, and only once detached: StrictMode replays effects on the same
  // memoised objects, which must not be disposed while still rendering.
  useEffect(
    () => () =>
      void setTimeout(() => {
        if (built.mesh.parent) return;
        built.mesh.dispose();
        built.material.dispose();
        built.shadows.dispose();
        built.shadowMat.alphaMap?.dispose();
        built.shadowMat.dispose();
        built.plane.dispose();
      }, 0),
    [built],
  );
  const frame = useMemo(() => streetFrame(project), [project]);
  const store = useSceneStore();
  useFrame(() => {
    const t = store.time();
    const place = (pose: Pose, slots: { id: number; part: StreetPart }[]) => {
      tmp.q.setFromAxisAngle(tmp.up, pose.yaw);
      const k = Math.max(0.0001, pose.scale);
      tmp.actor.compose(tmp.p.set(pose.x, pose.y + pose.bob, pose.z), tmp.q, tmp.s.set(k, k, k));
      for (const { id, part } of slots) {
        const r = pose.parts[part.suffix];
        tmp.part.copy(part.rest);
        if (r) tmp.part.multiply(tmp.m.makeRotationFromEuler(tmp.e.set(r[0], r[1], r[2], "YXZ")));
        built.mesh.setMatrixAt(id, tmp.m.multiplyMatrices(tmp.actor, tmp.part));
      }
    };
    built.cast.forEach(({ actor, slots }, i) => {
      const pose = actorPose(project, actor, t, frame);
      place(pose, slots);
      const [w, l] = actor.shadow;
      tmp.q.setFromAxisAngle(tmp.up, pose.yaw);
      built.shadows.setMatrixAt(i, tmp.m.compose(tmp.p.set(pose.x, pose.y + 0.004, pose.z), tmp.q, tmp.s.set(w * pose.scale + 0.0001, 1, l * pose.scale + 0.0001)));
    });
    built.shadows.instanceMatrix.needsUpdate = true;
    built.birds.forEach((slots, i) => place(birdPose(project, i, t), slots));
  });
  return (
    <>
      <primitive object={built.mesh} />
      <primitive object={built.shadows} />
    </>
  );
}

/** A grass tuft: five thin blades, dark at the root, light at the tip. */
function tuftGeometry() {
  const pos: number[] = [],
    col: number[] = [],
    nor: number[] = [];
  const base = new Color("#4f6b35"),
    tip = new Color("#b5c77a");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + hash2(i, 1, 5);
    const lean = 0.03 + hash2(i, 2, 5) * 0.04;
    const h = 0.12 + hash2(i, 3, 5) * 0.1;
    const cx = Math.cos(a) * 0.02,
      cz = Math.sin(a) * 0.02;
    const px = -Math.sin(a) * 0.018,
      pz = Math.cos(a) * 0.018;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  return g;
}

function Greenery({ project, layout }: { project: Project; layout: SiteLayout }) {
  const key = JSON.stringify([project.plot, layout.obstacles]);
  const built = useMemo(() => {
    const { tufts, plants } = greenery(project, layout.obstacles);
    const o = new Object3D();
    const tuftMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide });
    const tuftGeo = tuftGeometry();
    const grass = new InstancedMesh(tuftGeo, tuftMat, tufts.length);
    grass.name = "street-tufts";
    tufts.forEach((t, i) => {
      o.position.set(t.x, t.y, t.z);
      o.rotation.set(0, t.yaw, 0);
      o.scale.setScalar(t.s);
      o.updateMatrix();
      grass.setMatrixAt(i, o.matrix);
      grass.setColorAt(i, new Color().setHSL(0.22 + t.shade * 0.06, 0.45, 0.8 + t.shade * 0.25));
    });
    const plantGeo = new IcosahedronGeometry(0.09, 0);
    const plantMat = new MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const bush = new InstancedMesh(plantGeo, plantMat, plants.length);
    bush.name = "street-plants";
    const flowers = ["#e8a33d", "#d9534f", "#f2d16b", "#6f9e4c"];
    plants.forEach((p, i) => {
      o.position.set(p.x, p.y + 0.06 * p.s, p.z);
      o.rotation.set(0, p.flower * 6, 0);
      o.scale.set(p.s, p.s * 0.8, p.s);
      o.updateMatrix();
      bush.setMatrixAt(i, o.matrix);
      bush.setColorAt(i, new Color(p.flower > 0.6 ? flowers[Math.floor(p.flower * 10) % 3] : flowers[3]));
    });
    for (const m of [grass, bush]) {
      m.receiveShadow = true;
      m.castShadow = false;
      m.computeBoundingSphere();
    }
    const dispose = () =>
      setTimeout(() => {
        if (grass.parent) return;
        grass.dispose();
        bush.dispose();
        [tuftMat, tuftGeo, plantGeo, plantMat].forEach((x) => x.dispose());
      }, 0);
    return { grass, bush, dispose };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => void built.dispose(), [built]);
  return (
    <>
      <primitive object={built.grass} />
      {built.bush.count > 0 && <primitive object={built.bush} />}
    </>
  );
}

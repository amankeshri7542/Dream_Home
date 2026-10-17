// GLB asset kits (public/models/*.glb, meshopt-compressed, no Draco/CDN).
// Each root node is a model id; children `<id>__<slot>` hold one mesh per
// material slot. Moving parts are their own roots, `<id>:<part>`, placed at
// their pivot. Geometry is normalised (float position/normal, RGB colour) so
// every part can share BatchedMesh buffers.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  Vector3,
  type Mesh,
  type Object3D,
} from "three";
import { ASSET_MANIFEST, type AssetKit } from "../assets/assetManifest";
import { patchMaterial } from "../materials/patches";

export type KitPart = { slot: string; geometry: BufferGeometry };
export type Kit = {
  name: AssetKit;
  models: Map<string, KitPart[]>;
  /** One shared material per slot (vertex-colour AO, clipped, poché). */
  materials: Map<string, MeshStandardMaterial>;
  /** Tintable slots → default colour. */
  tintDefaults: Map<string, Color>;
  /** Moving parts (`<id>:<part>`) → pivot in their model's space (metres). */
  pivots: Map<string, Vector3>;
};

const cache = new Map<AssetKit, Promise<Kit>>();
/** Materials whose emissive follows the time of day (glow slots). */
export const glowMaterials = new Set<MeshStandardMaterial>();

export function loadKit(name: AssetKit): Promise<Kit> {
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      // Loaders live in their own lazy chunk: the procedural fallback renders
      // first, so the initial Scene chunk stays lean.
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(ASSET_MANIFEST[name].url);
      return parseKit(name, gltf.scene);
    })();
    cache.set(name, p);
    // Allow a retry after a failure.
    p.catch(() => cache.delete(name));
  }
  return p;
}

/**
 * A node's name as written in the GLB. GLTFLoader strips characters that
 * animation bindings reserve (`:` among them) from `name` and keeps the
 * original in `userData.name`, so `cat:body` would otherwise read `catbody`.
 */
export const gltfName = (o: Object3D): string => (typeof o.userData?.name === "string" ? o.userData.name : o.name);

export function normalise(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  const pos = src.getAttribute("position");
  const nor = src.getAttribute("normal");
  const col = src.getAttribute("color");
  const n = pos.count;
  const P = new Float32Array(n * 3),
    N = new Float32Array(n * 3),
    C = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    P[i * 3] = pos.getX(i);
    P[i * 3 + 1] = pos.getY(i);
    P[i * 3 + 2] = pos.getZ(i);
    if (nor) {
      N[i * 3] = nor.getX(i);
      N[i * 3 + 1] = nor.getY(i);
      N[i * 3 + 2] = nor.getZ(i);
    }
    if (col) {
      C[i * 3] = col.getX(i);
      C[i * 3 + 1] = col.getY(i);
      C[i * 3 + 2] = col.getZ(i);
    } else C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 1;
  }
  g.setAttribute("position", new BufferAttribute(P, 3));
  g.setAttribute("normal", new BufferAttribute(N, 3));
  g.setAttribute("color", new BufferAttribute(C, 3));
  const index = src.getIndex();
  if (index) g.setIndex(new BufferAttribute(new Uint32Array(index.array as ArrayLike<number>), 1));
  if (!nor) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A loaded kit's scene → per-model parts and one material per slot (exported for tests). */
export function parseKit(name: AssetKit, root: Object3D): Kit {
  root.updateMatrixWorld(true);
  const models = new Map<string, KitPart[]>();
  const materials = new Map<string, MeshStandardMaterial>();
  const tintDefaults = new Map<string, Color>();
  const pivots = new Map<string, Vector3>();
  for (const node of root.children) {
    const id = gltfName(node);
    if (id.includes(":")) pivots.set(id, node.position.clone());
    const parts: KitPart[] = [];
    node.updateMatrixWorld(true);
    const inv = node.matrixWorld.clone().invert();
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const meshName = gltfName(mesh);
      const slot = meshName.includes("__") ? meshName.split("__")[1] : (mesh.material as MeshStandardMaterial).name;
      const geometry = normalise(mesh.geometry);
      geometry.applyMatrix4(inv.clone().multiply(mesh.matrixWorld));
      parts.push({ slot, geometry });
      if (!materials.has(slot)) {
        const src = mesh.material as MeshStandardMaterial;
        const m = new MeshStandardMaterial({
          color: src.color,
          roughness: src.roughness,
          metalness: src.metalness,
          vertexColors: true,
          side: DoubleSide,
        });
        m.name = `kit:${name}:${slot}`;
        if (src.userData?.tint) tintDefaults.set(slot, new Color(src.userData.default ?? "#ffffff"));
        if (slot === "glow") {
          m.emissive = new Color(src.color);
          m.emissiveIntensity = 0.3;
          glowMaterials.add(m);
        }
        // Lived-in flames: their owner drives the flicker and the night glow.
        if (slot === "flame") {
          m.emissive = new Color(src.color);
          m.emissiveIntensity = 1;
        }
        // Interior furniture and lived-in details are cut with the section;
        // garden models never are.
        if (name !== "exterior") patchMaterial(m, { clip: true, poche: true, focus: "fade" });
        materials.set(slot, m);
      }
    });
    models.set(id, parts);
  }
  return { name, models, materials, tintDefaults, pivots };
}

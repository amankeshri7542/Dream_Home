// Contract test for the Blender-built asset kit (public/models/*.glb).
// Rebuild assets with `npm run assets`; run with
// `npx vitest run src/scene/assets/kit.test.ts`.
import { Box3, Mesh, Vector3, type Material, type Object3D } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { beforeAll, describe, expect, it } from "vitest";
import furniture from "../../domain/catalog/furniture.json";
import landscape from "../../domain/catalog/landscape.json";
import life from "../../domain/catalog/life.json";
import { gltfName, parseKit } from "../props/kit";
import { ASSET_ITEMS, ASSET_MANIFEST, STREET_ASSET, THUMBS } from "./assetManifest";

type Kit = keyof typeof ASSET_MANIFEST;
type Size = { w: number; d: number; h: number };
type Model = { id: string; kit: Kit; size: Size; slots: string[]; triBudget: number };

// node:fs is loaded dynamically with a minimal local type because the
// project ships no @types/node (keeps `tsc -b` happy).
type NodeFs = {
  readFileSync(path: URL): Uint8Array;
  existsSync(path: URL): boolean;
  statSync(path: URL): { size: number };
};
const fs = (await import(/* @vite-ignore */ "node:fs" as string)) as NodeFs;
const fromRoot = (rel: string) => new URL(`../../../${rel}`, import.meta.url);

async function sha10(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

function glbJson(bytes: Uint8Array): { extensionsUsed?: string[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
}

const BYTE_BUDGET: Record<Kit, number> = { interior: 420_000, exterior: 150_000, life: 160_000 };
const KITS: Kit[] = ["interior", "exterior", "life"];
const TOL_CM = 1.5;

// Every buildable model id: non-tile furniture items, non-procedural garden
// models (tile items contribute their module) and garden modules.
function catalogModels(): Model[] {
  const out: Model[] = [];
  for (const it of furniture.items as Array<Record<string, unknown>>) {
    if ("tile" in it) continue;
    out.push({ id: it.id as string, kit: "interior", size: it.size as Size, slots: it.slots as string[], triBudget: it.triBudget as number });
  }
  const seen = new Set<string>();
  for (const it of landscape.items as Array<Record<string, unknown>>) {
    if (it.procedural) continue;
    const model = it.model as string;
    if (seen.has(model)) continue;
    seen.add(model);
    const size = { ...(it.size as Size) };
    const tile = it.tile as { moduleWidth: number } | undefined;
    if (tile) size.w = tile.moduleWidth;
    out.push({ id: model, kit: "exterior", size, slots: it.slots as string[], triBudget: it.triBudget as number });
  }
  for (const m of landscape.modules) {
    out.push({ id: m.id, kit: "exterior", size: m.size, slots: m.slots, triBudget: m.triBudget });
  }
  return out;
}

function glbPath(kit: Kit) {
  return fromRoot(`public/models/${kit}.glb`);
}

async function loadKit(kit: Kit | "street"): Promise<GLTF> {
  const buf = fs.readFileSync(kit === "street" ? fromRoot("public/models/street.glb") : glbPath(kit));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise<GLTF>((resolve, reject) => loader.parse(ab, "", resolve, reject));
}

function meshesOf(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

function triCount(mesh: Mesh) {
  const g = mesh.geometry;
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}

const models = catalogModels();
const kits: Partial<Record<Kit, GLTF>> = {};

beforeAll(async () => {
  await MeshoptDecoder.ready;
  for (const kit of KITS) kits[kit] = await loadKit(kit);
});

describe("asset kit files", () => {
  for (const kit of KITS) {
    it(`${kit}.glb exists, fits its byte budget and matches the manifest`, async () => {
      const path = glbPath(kit);
      expect(fs.existsSync(path)).toBe(true);
      const bytes = fs.statSync(path).size;
      expect(bytes).toBeLessThanOrEqual(BYTE_BUDGET[kit]);
      expect(ASSET_MANIFEST[kit].bytes).toBe(bytes);
      const hash = await sha10(fs.readFileSync(path));
      expect(ASSET_MANIFEST[kit].url).toBe(`/models/${kit}.glb?v=${hash}`);
    });
  }

  it("uses EXT_meshopt_compression (not KHR meshopt / Draco)", () => {
    for (const kit of KITS) {
      const json = glbJson(fs.readFileSync(glbPath(kit)));
      expect(json.extensionsUsed).toContain("EXT_meshopt_compression");
      expect(json.extensionsUsed).not.toContain("KHR_meshopt_compression");
      expect(json.extensionsUsed).not.toContain("KHR_draco_mesh_compression");
    }
  });
});

describe("catalog models", () => {
  for (const model of models) {
    it(`${model.id} (${model.kit}) matches the catalog contract`, () => {
      const gltf = kits[model.kit]!;
      const root = gltf.scene.getObjectByName(model.id);
      expect(root, `root node ${model.id}`).toBeTruthy();
      root!.updateWorldMatrix(true, true);

      const meshes = meshesOf(root!);
      expect(meshes.length).toBeGreaterThan(0);
      const slots = new Set<string>();
      let tris = 0;
      for (const mesh of meshes) {
        const m = /^(.+)__([a-z_]+)$/.exec(mesh.name);
        expect(m, `mesh name ${mesh.name}`).toBeTruthy();
        expect(m![1]).toBe(model.id);
        const slot = m![2];
        expect(model.slots, `${mesh.name} slot`).toContain(slot);
        expect(slots.has(slot), `one mesh per slot (${slot})`).toBe(false);
        slots.add(slot);
        expect((mesh.material as Material).name).toBe(slot);
        expect(mesh.geometry.attributes.color, `${mesh.name} AO colours`).toBeTruthy();
        expect(mesh.geometry.attributes.normal).toBeTruthy();
        tris += triCount(mesh);
      }
      expect(tris).toBeLessThanOrEqual(model.triBudget);

      // three: X = width, Y = up, Z = depth (front toward +Z); metres -> cm.
      const box = new Box3().setFromObject(root!);
      const size = box.getSize(new Vector3()).multiplyScalar(100);
      const centre = box.getCenter(new Vector3()).multiplyScalar(100);
      expect(Math.abs(size.x - model.size.w), `w ${size.x}`).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(size.z - model.size.d), `d ${size.z}`).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(size.y - model.size.h), `h ${size.y}`).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(centre.x)).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(centre.z)).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(box.min.y * 100)).toBeLessThanOrEqual(TOL_CM);

      const entry = ASSET_ITEMS[model.id];
      expect(entry, `ASSET_ITEMS[${model.id}]`).toBeTruthy();
      expect(entry.kit).toBe(model.kit);
      expect(entry.tris).toBe(tris);
    });
  }

  it("shares one material per slot; tintable slots are white with tint/default extras", () => {
    for (const kit of ["interior", "exterior"] as Kit[]) {
      const byName = new Map<string, Material>();
      gltfMaterials(kits[kit]!).forEach((m) => byName.set(m.name, m));
      for (const [name, mat] of byName) {
        const cfg = (furniture.slots as Record<string, { tint?: boolean }>)[name];
        expect(cfg, `material ${name} is a catalog slot`).toBeTruthy();
        if (cfg.tint) {
          expect(mat.userData.tint).toBe(true);
          expect(mat.userData.default).toMatch(/^#[0-9a-f]{6}$/i);
          const color = (mat as Material & { color: { r: number; g: number; b: number } }).color;
          expect([color.r, color.g, color.b]).toEqual([1, 1, 1]);
        }
      }
    }
  });
});

/** A node by the name written in the GLB (three strips `:` from `name`). */
const byName = (root: Object3D, name: string) => {
  let found: Object3D | undefined;
  root.traverse((o) => {
    if (!found && gltfName(o) === name) found = o;
  });
  return found;
};

// Lived-in details (life.glb): per-vertex colours on three slots; moving
// parts are their own `<id>:<part>` roots placed at their pivot.
describe("lived-in models", () => {
  const sizeOf = (objects: Object3D[]) => {
    const box = new Box3();
    for (const o of objects) {
      o.updateWorldMatrix(true, true);
      box.expandByObject(o);
    }
    return { size: box.getSize(new Vector3()).multiplyScalar(100), centre: box.getCenter(new Vector3()).multiplyScalar(100), min: box.min.y * 100 };
  };
  for (const item of life.items as Array<{ id: string; size: Size; slots: string[]; triBudget: number; parts?: string[] }>)
    it(`${item.id} matches the lived-in catalog`, () => {
      const scene = kits.life!.scene;
      const root = byName(scene, item.id);
      expect(root, `root node ${item.id}`).toBeTruthy();
      const parts = (item.parts ?? []).map((part) => byName(scene, `${item.id}:${part}`));
      for (const [i, part] of parts.entries()) expect(part, `${item.id}:${item.parts![i]}`).toBeTruthy();
      let tris = 0;
      for (const node of [root!, ...parts.map((p) => p!)])
        for (const mesh of meshesOf(node)) {
          const m = /^(.+)__([a-z]+)$/.exec(gltfName(mesh));
          expect(m, `mesh name ${gltfName(mesh)}`).toBeTruthy();
          expect(m![1]).toBe(gltfName(node));
          expect(item.slots, `${mesh.name} slot`).toContain(m![2]);
          expect((mesh.material as Material).name).toBe(m![2]);
          expect(mesh.geometry.attributes.color, `${mesh.name} colours`).toBeTruthy();
          tris += triCount(mesh);
        }
      expect(tris).toBeLessThanOrEqual(item.triBudget);
      const { size, centre, min } = sizeOf([root!, ...parts.map((p) => p!)]);
      expect(Math.abs(size.x - item.size.w), `w ${size.x}`).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(size.z - item.size.d), `d ${size.z}`).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(size.y - item.size.h), `h ${size.y}`).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(centre.x)).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(centre.z)).toBeLessThanOrEqual(TOL_CM);
      expect(Math.abs(min)).toBeLessThanOrEqual(TOL_CM);
      expect(ASSET_ITEMS[item.id]?.kit).toBe("life");
    });
});

describe("parsed kits", () => {
  it("cut furniture and lived-in details with the section, never the garden", () => {
    const clipped = (kit: Kit) => [...parseKit(kit, kits[kit]!.scene.clone()).materials.values()].map((m) => !!m.clippingPlanes?.length);
    expect(clipped("interior").every(Boolean)).toBe(true);
    expect(clipped("life").every(Boolean)).toBe(true);
    expect(clipped("exterior").some(Boolean)).toBe(false);
  });
  it("record each moving part's pivot", () => {
    const life = parseKit("life", kits.life!.scene.clone());
    expect([...life.pivots.keys()].sort()).toEqual(["cat:body", "diwali-diya:flame"]);
    expect(life.models.has("cat:body")).toBe(true);
  });
});

describe("street life parts", () => {
  it("keep their `<actor>:<part>` names through the loader, so poses can find them", async () => {
    expect(STREET_ASSET).toBeTruthy();
    const street = await loadKit("street");
    const parts = new Set<string>();
    street.scene.traverse((o) => {
      if ((o as Mesh).isMesh) parts.add(gltfName(o).split(":")[1]);
    });
    for (const part of ["leg-l", "leg-r", "arm-l", "arm-r", "head", "wheel-f", "tail"]) expect(parts, part).toContain(part);
  });
});

function gltfMaterials(gltf: GLTF): Material[] {
  const mats = new Set<Material>();
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) mats.add((o as Mesh).material as Material);
  });
  return [...mats];
}

describe("thumbnails", () => {
  const ids = [...furniture.items.map((i) => i.id), ...landscape.items.map((i) => i.id), ...landscape.modules.map((m) => m.id)];
  for (const id of ids) {
    it(`${id} has a thumbnail`, () => {
      expect(THUMBS[id]).toBe(`/thumbs/${id}.webp`);
      expect(fs.existsSync(fromRoot(`public/thumbs/${id}.webp`))).toBe(true);
    });
  }
});

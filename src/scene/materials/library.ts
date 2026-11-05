// Keyed material cache. Materials are shared across floors/rooms and never
// disposed per room; one library exists per texture quality (size/anisotropy).
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Texture,
} from "three";
import type { ExteriorFinishId, FloorMaterialId, GroundId, RoofMaterialId } from "../../domain/materials";
import {
  FACADE_LOOKS,
  FLOOR_LOOKS,
  GROUND_LOOKS,
  NEUTRAL_LOOKS,
  ROOF_LOOKS,
  type Look,
} from "./palette";
import { patchMaterial, type PatchOptions } from "./patches";
import { generateTextures, generateTexturesSliced, gradientTexture, jaaliTexture } from "./textures";

/**
 * `floorSize`: floors fill the frame at eye level, so walking sharpens them to this
 * (sharpenFloors). They start at `textureSize`, so Build and Home pay nothing for it.
 */
export type LibraryOptions = { textureSize: number; floorSize?: number; anisotropy: number };

/**
 * The material roughness factor that gives a texture's roughness map the
 * Look's mean roughness (three multiplies the map by this factor).
 */
export const lookRoughness = (look: Pick<Look, "roughness">, meanRoughness: number) =>
  meanRoughness > 0.01 ? look.roughness / meanRoughness : look.roughness;

export class MaterialLibrary {
  private cache = new Map<string, MeshStandardMaterial | MeshBasicMaterial>();
  private textures = new Map<string, { map: Texture; detail: Texture; meanRoughness: number }>();
  constructor(readonly opts: LibraryOptions) {}

  private tex(look: Look, size = this.opts.textureSize) {
    const key = `${look.texture}:${look.color}:${look.tile.join("x")}:${size}`;
    let t = this.textures.get(key);
    if (!t) {
      t = generateTextures(look.texture, look.color, look.tile, size, this.opts.anisotropy);
      this.textures.set(key, t);
    }
    return t;
  }

  private sharpened = new Set<string>();
  private sharpening: Promise<boolean> | null = null;
  /**
   * Remakes every floor made so far at `floorSize`, a slice at a time, then
   * swaps the textures in (same maps, so no shader recompiles). True if anything changed.
   */
  sharpenFloors(): Promise<boolean> {
    const size = this.opts.floorSize ?? this.opts.textureSize;
    if (size <= this.opts.textureSize) return Promise.resolve(false);
    if (this.sharpening) return this.sharpening;
    this.sharpening = (async () => {
      let changed = false;
      for (const [key, material] of this.cache) {
        if (!key.startsWith("floor:") || this.sharpened.has(key) || !(material instanceof MeshStandardMaterial)) continue;
        const look = FLOOR_LOOKS[key.slice(6) as FloorMaterialId];
        if (!look) continue;
        this.sharpened.add(key);
        const t = await generateTexturesSliced(look.texture, look.color, look.tile, size, this.opts.anisotropy);
        const old = [material.map, material.bumpMap];
        material.map = t.map;
        material.bumpMap = t.detail;
        material.roughnessMap = t.detail;
        material.roughness = lookRoughness(look, t.meanRoughness);
        for (const o of old) if (o && o !== t.map && o !== t.detail) o.dispose();
        this.textures.set(`${look.texture}:${look.color}:${look.tile.join("x")}:${this.opts.textureSize}`, t);
        changed = true;
      }
      return changed;
    })().finally(() => {
      this.sharpening = null;
    });
    return this.sharpening;
  }

  private standard(key: string, make: () => MeshStandardMaterial): MeshStandardMaterial {
    let m = this.cache.get(key) as MeshStandardMaterial | undefined;
    if (!m) {
      m = make();
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  private textured(look: Look, patch: PatchOptions, vertexColors = false, colorHex?: string, size?: number) {
    const t = this.tex(look, size);
    return patchMaterial(
      new MeshStandardMaterial({
        color: colorHex ?? "#ffffff",
        map: t.map,
        bumpMap: t.detail,
        bumpScale: look.bumpScale,
        roughnessMap: t.detail,
        // The map keeps its variation (joints rougher, veins glossier); the
        // Look sets the overall sheen, so marble and red oxide can shine.
        roughness: lookRoughness(look, t.meanRoughness),
        metalness: look.metalness ?? 0,
        vertexColors,
      }),
      patch,
    );
  }

  facade(id: ExteriorFinishId) {
    return this.standard(`facade:${id}`, () => this.textured(FACADE_LOOKS[id], { clip: true, poche: true, rise: true, focus: "cut" }));
  }
  /** Interior paint: vertex colours (per room) × subtle plaster texture. */
  paint() {
    return this.standard("paint", () => this.textured(NEUTRAL_LOOKS.paint, { clip: true, poche: true, rise: true, focus: "cut", room: true }, true));
  }
  joinery() {
    return this.standard("joinery", () =>
      patchMaterial(new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }), {
        clip: true,
        poche: true,
        rise: true,
        focus: "cut",
        room: true,
      }),
    );
  }
  stone() {
    return this.standard("stone", () => this.textured(NEUTRAL_LOOKS.stone, { clip: true, poche: true, rise: true, focus: "cut", room: true }, true));
  }
  slab() {
    return this.standard("slab", () => this.textured(NEUTRAL_LOOKS.slab, { clip: true, poche: true, rise: true, focus: "fade", room: true }, true));
  }
  glass() {
    return this.standard("glass", () =>
      patchMaterial(
        new MeshStandardMaterial({
          color: "#9fb3ba",
          transparent: true,
          opacity: 0.5,
          roughness: 0.04,
          metalness: 0.1,
          envMapIntensity: 2.2,
          side: DoubleSide,
          depthWrite: false,
          emissive: new Color("#ffcf8a"),
          emissiveIntensity: 0,
        }),
        { clip: true, focus: "cut", glass: true },
      ),
    );
  }
  floor(id: FloorMaterialId) {
    return this.standard(`floor:${id}`, () => this.textured(FLOOR_LOOKS[id], { clip: true, focus: "fade", room: true }));
  }
  roof(id: RoofMaterialId) {
    return this.standard(`roof:${id}`, () => this.textured(ROOF_LOOKS[id], {}, true));
  }
  ground(id: GroundId) {
    return this.standard(`ground:${id}`, () => this.textured(GROUND_LOOKS[id], {}));
  }
  asphalt() {
    return this.standard("ground:asphalt", () => this.textured(NEUTRAL_LOOKS.asphalt, {}, true));
  }
  pavers() {
    return this.standard("ground:pavers", () => this.textured(NEUTRAL_LOOKS.pavers, {}, true));
  }
  /** Pierced jaali screens: vertex colour, alpha-tested pattern (metre UVs). */
  jaali() {
    return this.standard("jaali", () =>
      patchMaterial(
        new MeshStandardMaterial({
          vertexColors: true,
          alphaMap: jaaliTexture(),
          alphaTest: 0.5,
          side: DoubleSide,
          roughness: 0.85,
          metalness: 0,
        }),
        { clip: true, focus: "cut" },
      ),
    );
  }
  /** The street's ground beyond the plinth: packed earth × vertex colour. */
  worldGround() {
    return this.standard("world:ground", () => this.textured({ texture: "soil", color: "#ffffff", tile: [6, 6], roughness: 0.97, bumpScale: 0.8 }, {}, true));
  }
  /** Site structures (compound wall, car porch): plaster × vertex colour, never section-cut. */
  sitePlaster() {
    return this.standard("site:plaster", () => this.textured(NEUTRAL_LOOKS.paint, {}, true));
  }
  siteStone() {
    return this.standard("site:stone", () => this.textured(NEUTRAL_LOOKS.stone, {}, true));
  }
  /** Diorama soil strata, foliage, car body etc. — plain vertex colours. */
  vertexColor(name: string, roughness = 0.85, patch: PatchOptions = {}) {
    return this.standard(`vc:${name}`, () =>
      patchMaterial(new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 }), patch),
    );
  }
  /** Procedural furniture finish groups (vertex colours, pop animation). */
  furniture(group: "soft" | "matte" | "gloss") {
    const roughness = group === "soft" ? 0.95 : group === "matte" ? 0.62 : 0.3;
    return this.standard(`furniture:${group}`, () =>
      patchMaterial(new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 }), {
        clip: true,
        poche: true,
        pop: true,
        focus: "fade",
        room: true,
      }),
    );
  }
  doorLeaf() {
    return this.standard("door:leaf", () =>
      patchMaterial(new MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, metalness: 0, vertexColors: true }), {
        clip: true,
        poche: true,
        focus: "cut",
        room: true,
      }),
    );
  }
  handle() {
    return this.standard("door:handle", () =>
      patchMaterial(new MeshStandardMaterial({ color: "#c9c2b5", roughness: 0.28, metalness: 0.85 }), { clip: true, focus: "cut", room: true }),
    );
  }
  /** Warm lamp bodies (porch sconces); emissive driven by the time of day. */
  lamp() {
    return this.standard("lamp", () =>
      new MeshStandardMaterial({ color: "#fff6e2", emissive: new Color("#ffcf8a"), emissiveIntensity: 0.2, roughness: 0.4 }),
    );
  }
  /** Fake contact-AO strips (alpha gradient). */
  ao() {
    let m = this.cache.get("ao") as MeshBasicMaterial | undefined;
    if (!m) {
      const alpha = gradientTexture("strip");
      m = new MeshBasicMaterial({
        color: "#2b2118",
        transparent: true,
        opacity: 0.32,
        alphaMap: alpha,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      patchMaterial(m, { clip: true, focus: "cut" });
      m.name = "ao";
      this.cache.set("ao", m);
    }
    return m;
  }
  /** Invisible but raycastable picking surfaces. */
  hit() {
    let m = this.cache.get("hit") as MeshBasicMaterial | undefined;
    if (!m) {
      m = new MeshBasicMaterial({ visible: false });
      m.name = "hit";
      this.cache.set("hit", m);
    }
    return m;
  }
}

const libraries = new Map<string, MaterialLibrary>();
export function getLibrary(opts: LibraryOptions): MaterialLibrary {
  const key = `${opts.textureSize}:${opts.floorSize ?? 0}:${opts.anisotropy}`;
  let lib = libraries.get(key);
  if (!lib) {
    lib = new MaterialLibrary(opts);
    libraries.set(key, lib);
  }
  return lib;
}

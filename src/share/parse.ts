import { furnitureCatalogItem } from "../domain/furniture";
import { isFence, landscapeCatalogItem } from "../domain/landscape";
import {
  ROOF_STYLES,
  isDoorColor,
  isExterior,
  isFloorMaterial,
  isGround,
  isRoofMaterial,
  isTrim,
  isWallPaint,
} from "../domain/materials";
import { parseProject } from "../domain/model";
import { RAILING_KINDS, STYLE_PRESETS } from "../domain/persist";
import type { Project } from "../domain/types";

type Loose = Record<string, unknown>;
const loose = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
/** Deletes `key` when it is present and fails `known`. */
function forget(o: unknown, key: string, known: (v: unknown) => boolean) {
  if (loose(o) && o[key] !== undefined && !known(o[key])) delete o[key];
}

const isOneOf = (list: readonly string[]) => (v: unknown) => typeof v === "string" && list.includes(v);
/** Keeps the array items `known` accepts (a missing array stays missing). */
function keep(o: Loose, key: string, known: (v: unknown) => boolean) {
  const list = o[key];
  if (Array.isArray(list)) o[key] = list.filter(known);
}
/** A piece of furniture from the catalog, minus a finish this app doesn't offer for it. */
function knownFurniture(item: unknown): boolean {
  if (!loose(item) || typeof item.catalogId !== "string") return false;
  const entry = furnitureCatalogItem(item.catalogId);
  if (!entry) return false;
  if (item.finish !== undefined && !entry.finishes?.includes(item.finish as string)) delete item.finish;
  return true;
}
/** A garden piece from the catalog, minus a variant this app doesn't know. */
function knownLandscape(item: unknown): boolean {
  if (!loose(item) || typeof item.kind !== "string") return false;
  const entry = landscapeCatalogItem(item.kind);
  if (!entry) return false;
  if (item.variant !== undefined && !(entry.variants ?? []).includes(item.variant as string)) delete item.variant;
  return true;
}

/**
 * Removes the looks, finishes and pieces this copy of the app doesn't know (a
 * home made with a newer Dream Home may use them): they fall back to the
 * defaults, or are left out.
 */
function simplify(copy: Loose) {
  const style = copy.style;
  forget(style, "preset", isOneOf(STYLE_PRESETS));
  forget(style, "exterior", isExterior);
  forget(style, "trim", isTrim);
  forget(style, "frontDoor", isDoorColor);
  if (loose(style) && loose(style.roof) && !(isRoofMaterial(style.roof.material) && Object.hasOwn(ROOF_STYLES, String(style.roof.style))))
    delete style.roof;
  if (loose(style)) forget(style.details, "railing", isOneOf(RAILING_KINDS));
  forget(copy.site, "ground", isGround);
  forget(copy.site, "fence", isFence);
  keep(copy, "landscape", knownLandscape);
  const rooms = [
    ...(Array.isArray(copy.floors) ? copy.floors : []).flatMap((f) => (loose(f) && Array.isArray(f.rooms) ? f.rooms : [])),
    ...(Array.isArray(copy.stagedRooms) ? copy.stagedRooms : []).map((s) => (loose(s) ? s.room : null)),
  ];
  for (const room of rooms) {
    if (!loose(room)) continue;
    forget(room, "floorMaterial", isFloorMaterial);
    forget(room, "wallColor", isWallPaint);
    if (loose(room.accentWall) && !isWallPaint(room.accentWall.color)) delete room.accentWall;
    keep(room, "furniture", knownFurniture);
  }
}

/**
 * Reads a shared home leniently: a home made with a newer Dream Home may use a
 * look, finish or piece this copy of the app doesn't know yet, so those fall
 * back to the defaults or are left out.
 */
export function parseShared(raw: unknown): { project: Project; simplified: boolean } {
  const text = JSON.stringify(raw);
  try {
    return { project: parseProject(text), simplified: false };
  } catch (error) {
    const copy = JSON.parse(text) as unknown;
    if (!loose(copy)) throw error;
    simplify(copy);
    const simpler = JSON.stringify(copy);
    if (simpler === text) throw error;
    return { project: parseProject(simpler), simplified: true };
  }
}

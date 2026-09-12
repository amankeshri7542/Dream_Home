import {
  BoxGeometry,
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type PlaneGeometry,
} from "three";
import type { RoomFloorFinish } from "../domain/roomDetails";

export type SurfaceFinish = "ivory" | "brick" | "sand";
export const UNIT_BOX = new BoxGeometry(1, 1, 1);
// A finite application palette is shared across all floors. These resources live
// for the scene module's lifetime rather than being recreated for every room edit.
const solids = new Map<string, MeshStandardMaterial>();
const surfaces = new Map<SurfaceFinish, MeshStandardMaterial>();
const floors = new Map<RoomFloorFinish, MeshStandardMaterial>();
export function solidMaterial(color: string, roughness = 0.8) {
  const key = `${color}:${roughness}`;
  let material = solids.get(key);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness: 0 });
    solids.set(key, material);
  }
  return material;
}
export const WINDOW_GLASS = new MeshStandardMaterial({
  color: "#6b9098",
  roughness: 0.17,
  metalness: 0,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
});

export function surfaceMaterial(finish: SurfaceFinish) {
  const cached = surfaces.get(finish);
  if (cached) return cached;
  const size = 256;
  const color = document.createElement("canvas"),
    detail = document.createElement("canvas");
  color.width = color.height = detail.width = detail.height = size;
  const colorContext = color.getContext("2d")!,
    detailContext = detail.getContext("2d")!;
  const colorImage = colorContext.createImageData(size, size),
    detailImage = detailContext.createImageData(size, size);
  const base =
    finish === "brick"
      ? [164, 88, 62]
      : finish === "sand"
        ? [205, 179, 137]
        : [228, 223, 208];
  // A repeating tile spans 0.92 m horizontally and 0.40 m vertically. Four
  // staggered courses make brick scale independent of wall length and height.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 64),
        shiftedX = (x + (row % 2) * 32) % size;
      const joint = finish === "brick" && (y % 64 < 5 || shiftedX % 64 < 3);
      const brick = Math.floor(shiftedX / 64);
      const variation = ((row * 19 + brick * 37) % 23) - 11;
      const noise = ((x * 73 + y * 151 + x * y * 13) % 31) / 31 - 0.5;
      const offset =
        (finish === "brick" ? variation : 0) +
        noise * (finish === "brick" ? 8 : 5);
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        colorImage.data[index + channel] = joint
          ? [171, 160, 137][channel] + noise * 4
          : base[channel] + offset;
      colorImage.data[index + 3] = 255;
      // Three.js bumpMap reads red; roughnessMap reads green. One data texture
      // holds independent shallow height and roughness information.
      detailImage.data[index] = joint
        ? 65
        : 150 + noise * (finish === "brick" ? 15 : 8);
      detailImage.data[index + 1] = joint ? 252 : 232 + noise * 14;
      detailImage.data[index + 2] = 0;
      detailImage.data[index + 3] = 255;
    }
  colorContext.putImageData(colorImage, 0, 0);
  detailContext.putImageData(detailImage, 0, 0);
  const colorMap = new CanvasTexture(color),
    detailMap = new CanvasTexture(detail);
  colorMap.colorSpace = SRGBColorSpace;
  for (const texture of [colorMap, detailMap]) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 2;
  }
  const material = new MeshStandardMaterial({
    map: colorMap,
    bumpMap: detailMap,
    roughnessMap: detailMap,
    bumpScale: finish === "brick" ? 0.007 : 0.003,
    roughness: 0.97,
    metalness: 0,
  });
  surfaces.set(finish, material);
  return material;
}

export function setMetreUvs(
  geometry: BoxGeometry,
  horizontalOrigin: number,
  verticalOrigin: number,
) {
  const positions = geometry.getAttribute("position"),
    normals = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    const side = Math.abs(normals.getX(i)) > 0.5;
    uv.setXY(
      i,
      ((side ? positions.getZ(i) : positions.getX(i)) + horizontalOrigin) /
        0.92,
      (positions.getY(i) + verticalOrigin) / 0.4,
    );
  }
  uv.needsUpdate = true;
}

export function floorSurfaceMaterial(finish: RoomFloorFinish) {
  const cached = floors.get(finish);
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const data = context.createImageData(size, size);
  const base =
    finish === "wood"
      ? [192, 164, 126]
      : finish === "tile"
        ? [212, 222, 216]
        : [219, 215, 204];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 64);
      const grain = Math.sin(x * 0.095 + Math.sin(y * 0.35) * 1.3) * 2.2;
      const noise = ((x * 31 + y * 71 + x * y * 7) % 31) / 31 - 0.5;
      const joint =
        finish === "wood"
          ? y % 64 < 2 || (x + row * 71) % 256 < 2
          : x < 2 || y < 2;
      const variation =
        finish === "wood" ? row * 3 - 4 + grain + noise * 3 : noise * 3;
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++)
        data.data[offset + c] = base[c] + (joint ? -21 : variation);
      data.data[offset + 3] = 255;
    }
  context.putImageData(data, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({
    map: texture,
    roughness: finish === "wood" ? 0.72 : 0.57,
    metalness: 0,
  });
  floors.set(finish, material);
  return material;
}

export function setFloorMetreUvs(
  geometry: PlaneGeometry,
  finish: RoomFloorFinish,
  x: number,
  z: number,
) {
  const positions = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  const width = finish === "wood" ? 1.8 : finish === "tile" ? 0.6 : 0.8;
  const depth = finish === "wood" ? 0.72 : width;
  for (let i = 0; i < positions.count; i++)
    uv.setXY(
      i,
      (positions.getX(i) + x) / width,
      (-positions.getY(i) + z) / depth,
    );
  uv.needsUpdate = true;
}

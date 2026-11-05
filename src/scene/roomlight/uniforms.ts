// The room-light uniforms every interior material shares. One permanent shader
// path, so switching it on or moving rooms never recompiles anything.
import { ClampToEdgeWrapping, Data3DTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat, Vector3 } from "three";
import type { LightGrid } from "./solve";

function make3D(data: Uint16Array, nx: number, ny: number, nz: number) {
  const t = new Data3DTexture(data, nx, ny, nz);
  t.format = RGBAFormat;
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const emptyA = make3D(new Uint16Array(4), 1, 1, 1);
const emptyB = make3D(new Uint16Array(4), 1, 1, 1);

export const roomLightUniforms = {
  uRoomA: { value: emptyA },
  uRoomB: { value: emptyB },
  uRoomMin: { value: new Vector3() },
  uRoomInv: { value: new Vector3(1, 1, 1) },
  /** 0 off, 1 on: a float so a view can ease it if it wants. */
  uRoomOn: { value: 0 },
};

/** Puts a solved grid into the shared uniforms. Old textures are freed. */
export function setRoomLight(grid: LightGrid | null) {
  const u = roomLightUniforms;
  if (!grid) {
    u.uRoomOn.value = 0;
    return;
  }
  const halves = (from: Float32Array) => {
    const half = new Uint16Array(from.length);
    for (let i = 0; i < half.length; i++) half[i] = DataUtils.toHalfFloat(Math.max(-60, Math.min(from[i], 60)));
    return half;
  };
  const a = make3D(halves(grid.signed), grid.nx, grid.ny, grid.nz);
  const b = make3D(halves(grid.total), grid.nx, grid.ny, grid.nz);
  if (u.uRoomA.value !== emptyA) u.uRoomA.value.dispose();
  if (u.uRoomB.value !== emptyB) u.uRoomB.value.dispose();
  u.uRoomA.value = a;
  u.uRoomB.value = b;
  u.uRoomMin.value.set(grid.min[0], grid.min[1], grid.min[2]);
  u.uRoomInv.value.set(1 / grid.size[0], 1 / grid.size[1], 1 / grid.size[2]);
  u.uRoomOn.value = 1;
}

export const ROOM_VERTEX_DECL = /* glsl */ `
#ifdef DH_ROOM
varying vec3 vRoomWorld;
#endif
`;

export const ROOM_VERTEX = /* glsl */ `
#ifdef DH_ROOM
  {
    vec4 roomWorld = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      roomWorld = batchingMatrix * roomWorld;
    #endif
    #ifdef USE_INSTANCING
      roomWorld = instanceMatrix * roomWorld;
    #endif
    vRoomWorld = (modelMatrix * roomWorld).xyz;
  }
#endif
`;

export const ROOM_FRAGMENT_DECL = /* glsl */ `
#ifdef DH_ROOM
varying vec3 vRoomWorld;
uniform highp sampler3D uRoomA;
uniform highp sampler3D uRoomB;
uniform vec3 uRoomMin;
uniform vec3 uRoomInv;
uniform float uRoomOn;
#endif
`;

/**
 * Inside a room, its light replaces the sky's ambient and the sky map's
 * reflections; outside (mask 0) nothing changes. Nudging along the normal keeps
 * the lookup on this side of the wall. The sum matches gridIrradiance in solve.ts.
 */
export const ROOM_FRAGMENT = /* glsl */ `
#ifdef DH_ROOM
  if (uRoomOn > 0.5) {
    vec3 roomN = inverseTransformDirection(geometryNormal, viewMatrix);
    vec3 roomUvw = (vRoomWorld + roomN * 0.16 - uRoomMin) * uRoomInv;
    if (all(greaterThan(roomUvw, vec3(0.0))) && all(lessThan(roomUvw, vec3(1.0)))) {
      vec4 roomA = texture(uRoomA, roomUvw);
      vec4 roomB = texture(uRoomB, roomUvw);
      float roomMask = smoothstep(0.35, 0.8, roomA.a);
      if (roomMask > 0.0) {
        // An ambient cube: exact for walls, floors and ceilings; a smooth blend between.
        vec3 roomSq = roomN * roomN;
        vec3 roomCube = (roomB.xyz + sign(roomN) * roomA.xyz) * 0.5;
        float roomL = max(0.0, dot(roomCube, roomSq));
        vec3 roomTint = vec3(max(1.0 + roomB.a * 0.5, 0.1), 1.0, max(1.0 - roomB.a * 0.5, 0.1));
        roomTint /= dot(roomTint, vec3(0.2126, 0.7152, 0.0722));
        vec3 roomE = roomL * roomTint;
        irradiance = mix(irradiance, roomE, roomMask);
        #ifdef USE_ENVMAP
          // Reflections see the room, with a soft sheen towards where the light comes from.
          vec3 roomView = inverseTransformDirection(geometryViewDir, viewMatrix);
          vec3 roomR = reflect(-roomView, roomN);
          float roomRough = clamp(material.roughness, 0.05, 1.0);
          float roomPower = 2.0 / max(roomRough * roomRough * roomRough * roomRough, 0.004);
          vec3 roomDir = roomA.xyz;
          float roomDirLen = length(roomDir);
          roomDir = roomDirLen > 1e-3 ? roomDir / roomDirLen : vec3(0.0, 1.0, 0.0);
          float roomSpread = dot(roomB.xyz, vec3(0.3333));
          float roomLobe = pow(max(dot(roomR, roomDir), 0.0), min(roomPower, 160.0)) * (roomPower + 2.0) * 0.16;
          vec3 roomSpec = roomTint * (roomSpread * 0.065 + roomDirLen * min(roomLobe, 6.0) * 0.14);
          radiance = mix(radiance, roomSpec, roomMask);
          iblIrradiance = mix(iblIrradiance, vec3(0.0), roomMask);
        #endif
      }
    }
  }
#endif
`;

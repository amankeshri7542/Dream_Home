// Evening/night dressing: warm glowing glass, lit porch sconces and soft warm
// light pools on room floors (additive quads). In Explore on the balanced and
// beautiful tiers, the furnished floor's lamps also cast real light: a fixed
// pool of shadowless point lights (one per room, at most LAMP_POOL) placed at
// lamp, pendant and sconce bulbs. The pool only changes with the hour or the
// project, so an idle scene renders no frames.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { AdditiveBlending, MeshBasicMaterial, type PointLight } from "three";
import type { GeometryFloor } from "../../domain/types";
import { FLOOR_SURFACE } from "../coords";
import { QuadBuilder } from "../building/geometry/QuadBuilder";
import type { MaterialLibrary } from "../materials/library";
import { gradientTexture } from "../materials/textures";
import { useInterior } from "../props/interior";
import { glowMaterials } from "../props/kit";
import { interiorLamps, type Lamp } from "../props/lamps";
import type { Lighting } from "./timeOfDay";

type Props = { light: Lighting; library: MaterialLibrary; floors: { floor: GeometryFloor; base: number }[] };

/** Point lights in the pool (a fixed count, so shaders never recompile per room). */
export const LAMP_POOL = 8;
/** Glow above which interiors switch their lamps on. */
const LAMPS_ON = 0.3;

export function Night({ light, library, floors }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const interior = useInterior();
  const glow = light.palette.windowGlow;
  useLayoutEffect(() => {
    const glass = library.glass();
    glass.emissiveIntensity = glow * 2.4;
    glass.opacity = 0.5 + glow * 0.35;
    library.lamp().emissiveIntensity = 0.25 + glow * 5;
    for (const m of glowMaterials) m.emissiveIntensity = 0.3 + glow * 3.5;
    invalidate();
  }, [glow, library, invalidate]);
  const lamps = useMemo(() => {
    const { project, furnishedFloorId, explore, tier } = interior;
    if (!explore || tier === "battery" || !project || !furnishedFloorId) return null;
    return interiorLamps(project, furnishedFloorId, LAMP_POOL);
  }, [interior]);
  const lit = !!lamps?.length && glow >= LAMPS_ON;
  const geometry = useMemo(() => {
    const b = new QuadBuilder();
    for (const { floor, base } of floors)
      for (const r of floor.rooms) {
        const cx = (r.bounds.x + r.bounds.w / 2) / 100,
          cz = (r.bounds.z + r.bounds.d / 2) / 100;
        const s = Math.min(r.bounds.w, r.bounds.d) / 100;
        const h = s * 0.55;
        const y = base + FLOOR_SURFACE + 0.006;
        b.quadFacing([cx - h, y, cz - h], [cx + h, y, cz - h], [cx + h, y, cz + h], [cx - h, y, cz + h], [0, 1, 0], [1, 1, 1], [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]);
      }
    return b.build();
  }, [floors]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#ffb866",
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        alphaMap: gradientTexture("radial", 64),
        opacity: 0,
      }),
    [],
  );
  // Real lamps light the rooms; the fake pools only soften the floor then.
  material.opacity = glow * (lit ? 0.22 : 0.55);
  if (glow < 0.05) return null;
  return (
    <>
      {floors.length > 0 && <mesh geometry={geometry} material={material} renderOrder={3} raycast={() => null} />}
      {lit && <LampPool lamps={lamps!} glow={glow} />}
    </>
  );
}

/** Exactly LAMP_POOL point lights; unused ones stay dark and out of the way. */
function LampPool({ lamps, glow }: { lamps: Lamp[]; glow: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const refs = useRef<(PointLight | null)[]>([]);
  useLayoutEffect(() => {
    refs.current.forEach((l, i) => {
      if (!l) return;
      const lamp = lamps[i];
      if (!lamp) {
        l.intensity = 0;
        l.position.set(0, -50, 0);
        return;
      }
      l.position.set(...lamp.position);
      l.color.set(lamp.color);
      l.intensity = lamp.intensity * glow * 5.5;
    });
    invalidate();
  }, [lamps, glow, invalidate]);
  return (
    <group name="interior-lamps" userData={{ lamps: lamps.length }}>
      {Array.from({ length: LAMP_POOL }, (_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            refs.current[i] = l;
          }}
          distance={4.5}
          decay={2}
          intensity={0}
          position={[0, -50, 0]}
        />
      ))}
    </group>
  );
}

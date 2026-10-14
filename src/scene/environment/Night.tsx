// Evening/night dressing: warm glowing glass, lit porch sconces and soft warm
// light pools on room floors (additive quads — no extra real lights).
import { useEffect, useLayoutEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { AdditiveBlending, MeshBasicMaterial } from "three";
import type { GeometryFloor } from "../../domain/types";
import { FLOOR_SURFACE } from "../coords";
import { QuadBuilder } from "../building/geometry/QuadBuilder";
import type { MaterialLibrary } from "../materials/library";
import { gradientTexture } from "../materials/textures";
import { glowMaterials } from "../props/kit";
import type { Lighting } from "./timeOfDay";

type Props = { light: Lighting; library: MaterialLibrary; floors: { floor: GeometryFloor; base: number }[] };

export function Night({ light, library, floors }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const glow = light.palette.windowGlow;
  useLayoutEffect(() => {
    const glass = library.glass();
    glass.emissiveIntensity = glow * 2.4;
    glass.opacity = 0.5 + glow * 0.35;
    library.lamp().emissiveIntensity = 0.25 + glow * 5;
    for (const m of glowMaterials) m.emissiveIntensity = 0.3 + glow * 3.5;
    invalidate();
  }, [glow, library, invalidate]);
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
  material.opacity = glow * 0.55;
  if (glow < 0.05 || !floors.length) return null;
  return <mesh geometry={geometry} material={material} renderOrder={3} raycast={() => null} />;
}

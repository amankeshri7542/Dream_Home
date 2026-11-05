// The real street round the home, for eye and street level: Walk, street-level
// photos and reels, and an Explore orbit dropped low. From above the home stays
// the clean model on its plinth, so this hides itself up there and costs nothing.
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, type Group, type Material } from "three";
import type { Project } from "../../domain/types";
import { useBuckets } from "../building/useBuckets";
import type { MaterialLibrary } from "../materials/library";
import type { Lighting } from "../environment/timeOfDay";
import { hash2 } from "../materials/noise";
import { buildStreet, type WorldBucket } from "./streetPlan";
import { plinthExtents } from "../props/site";
import { plotOffset } from "../coords";

/** Below this camera height (metres) an Explore orbit counts as standing in the street. */
const STREET_LEVEL = 6.5;
/** …but only on the plot or its road: a camera further out would stand inside a neighbour's house. */
const NEAR = 1;

/** The leaf atlas: small neem sprays, broad mango leaves, ashoka and a palm frond. Generated, nothing to download. */
function leafAtlas() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const leaf = (x: number, y: number, len: number, width: number, angle: number, shade: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const v = Math.round(150 + shade * 105);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -width, len, 0);
    ctx.quadraticCurveTo(len * 0.45, width, 0, 0);
    ctx.fill();
    ctx.restore();
  };
  const cell = (cx: number, cy: number, count: number, len: number, width: number, seed: number) => {
    const half = size / 4;
    for (let i = 0; i < count; i++) {
      const a = hash2(i, 1, seed) * Math.PI * 2;
      // Denser in the middle, thinning out to a broken edge.
      const r = Math.pow(hash2(i, 2, seed), 0.62) * half * 0.86;
      const x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r;
      leaf(x, y, len * (0.7 + hash2(i, 3, seed) * 0.6), width * (0.8 + hash2(i, 4, seed) * 0.4), hash2(i, 5, seed) * Math.PI * 2, hash2(i, 6, seed));
    }
  };
  cell(size * 0.25, size * 0.25, 900, 9, 1.9, 3);
  cell(size * 0.75, size * 0.25, 420, 15, 3.2, 5);
  cell(size * 0.25, size * 0.75, 520, 16, 2.3, 7);
  // A palm frond: leaflets off a midrib, narrowing to the tip (v up the frond).
  const x0 = size * 0.75;
  ctx.fillStyle = "#c8c8c8";
  ctx.fillRect(x0 - 1.5, size * 0.5, 3, size * 0.5);
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const y = size - t * size * 0.5;
    const reach = (1 - t * 0.82) * size * 0.235;
    for (const side of [-1, 1]) leaf(x0, y, reach, 3.4, side > 0 ? -0.5 - t * 0.2 : Math.PI + 0.5 + t * 0.2, hash2(i, side + 2, 11));
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

let leaves: MeshStandardMaterial | null = null;
function leafMaterial() {
  if (!leaves) {
    leaves = new MeshStandardMaterial({ map: leafAtlas(), vertexColors: true, alphaTest: 0.42, side: DoubleSide, roughness: 0.78, metalness: 0 });
    // Cards light as one soft crown, whichever way each happens to face.
    leaves.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        "float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;",
      );
    };
  }
  return leaves;
}

type Props = { project: Project; library: MaterialLibrary; light: Lighting; forced: boolean };

/** Only builds its geometry the first time it's wanted. */
export const Neighbourhood = memo(function Neighbourhood({ project, library, light, forced }: Props) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const { width, depth, road } = project.plot;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = useMemo(() => project, [width, depth, road, project.floors.length]);
  const { built } = useBuckets(() => ({ buckets: buildStreet(key) }), [key]);
  const materials = useMemo(() => {
    const glass = new MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.2, envMapIntensity: 1.7 });
    const lit = new MeshBasicMaterial({ vertexColors: true, toneMapped: true, color: new Color(1, 1, 1) });
    return { glass, lit };
  }, []);
  useEffect(
    () => () => {
      materials.glass.dispose();
      materials.lit.dispose();
    },
    [materials],
  );
  const bark = useMemo(() => library.vertexColor("world:bark", 0.92), [library]);
  const marks = useMemo(() => library.vertexColor("marks", 0.7), [library]);
  const materialFor: Record<WorldBucket, Material> = {
    plaster: library.sitePlaster(),
    glass: materials.glass,
    lit: materials.lit,
    ground: library.worldGround(),
    asphalt: library.asphalt(),
    pavers: library.pavers(),
    marks,
    leaves: leafMaterial(),
    bark,
  };
  // Lit windows come on with the home's own lamps.
  const glow = light.palette.windowGlow;
  useLayoutEffect(() => {
    materials.lit.color.setScalar(1.6);
    materials.lit.needsUpdate = true;
    invalidate();
  }, [materials, invalidate]);
  const ext = plinthExtents(project);
  const [ox, , oz] = plotOffset(project);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const x = camera.position.x - ox,
      z = camera.position.z - oz;
    const onPlot = x > ext.x0 - NEAR && x < ext.x1 + NEAR && z > ext.z0 - NEAR && z < ext.z1 + NEAR;
    const want = forced || (camera.position.y < STREET_LEVEL && onPlot);
    if (g.visible !== want) {
      g.visible = want;
      invalidate();
    }
  });
  return (
    <group ref={group} name="neighbourhood" visible={forced}>
      {built.map((b) =>
        b.key === "lit" && glow < 0.3 ? null : (
          <mesh key={b.key} geometry={b.geometry} material={materialFor[b.key]} raycast={() => null} dispose={null} receiveShadow={false} castShadow={false} />
        ),
      )}
    </group>
  );
});

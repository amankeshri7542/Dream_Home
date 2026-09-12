import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import {
  BoxGeometry,
  OrthographicCamera,
  Vector3,
  type MeshStandardMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  UNIT_BOX,
  WINDOW_GLASS,
  setMetreUvs,
  solidMaterial,
  surfaceMaterial,
  type SurfaceFinish,
} from "./sceneMaterials";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  balconyBounds,
  deriveWalls,
  floorForGeometry,
  slabTiles,
} from "../domain/model";
import {
  length,
  roomName,
  unitLabel,
  type Language,
  type Unit,
} from "../domain/display";
import {
  type GeometryFloor,
  type Balcony as BalconyModel,
  type Void,
  type Project,
  type Rect,
  type ViewSettings,
  type Wall,
} from "../domain/types";
import "./Scene.css";

type Props = {
  project: Project;
  selected: string | null;
  onSelect: (id: string | null) => void;
  view: ViewSettings;
  language?: Language;
  unit?: Unit;
  cameraView?: "orbit" | "front" | "top";
  zoomStep?: number;
};
const FINISHES = {
  ivory: { wall: "#e6e0d2", trim: "#c8c1af", roof: "#c3bba7" },
  brick: { wall: "#ad634b", trim: "#d4b99b", roof: "#c0ad94" },
  sand: { wall: "#ceb48b", trim: "#aa9170", roof: "#c9bda5" },
};
type Finish = typeof FINISHES.ivory;
const ROOM_FLOORS = {
  living: "#dbd3bf",
  kitchen: "#c1cac1",
  bedroom: "#d8c4ac",
  bathroom: "#bbc9ca",
  dining: "#d6ceb9",
  utility: "#c6c3ba",
  shop: "#d1c2ce",
};

type BoxProps = {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  roughness?: number;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
};

function Box({ position, size, color, roughness = 0.8, onClick }: BoxProps) {
  return (
    <mesh
      position={position}
      scale={size}
      geometry={UNIT_BOX}
      material={solidMaterial(color, roughness)}
      dispose={null}
      castShadow
      receiveShadow
      onClick={onClick}
    />
  );
}

function Plate({
  rect,
  y,
  height,
  color,
}: {
  rect: Rect;
  y: number;
  height: number;
  color: string;
}) {
  return (
    <Box
      position={[(rect.x + rect.w / 2) / 100, y, (rect.z + rect.d / 2) / 100]}
      size={[rect.w / 100, height, rect.d / 100]}
      color={color}
    />
  );
}

function CameraControls({
  project,
  resetKey,
  cameraView = "orbit",
  zoomStep = 0,
}: {
  project: Project;
  resetKey: number;
  cameraView?: Props["cameraView"];
  zoomStep?: number;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const previousZoom = useRef(zoomStep);
  const latestZoom = useRef(zoomStep);
  latestZoom.current = zoomStep;
  const { camera, size, invalidate } = useThree();
  const extent = Math.max(project.plot.width, project.plot.depth) / 100;
  const buildingHeight =
    Math.max(...project.floors.map((floor) => floor.elevation + floor.height)) /
    100;
  const road = project.plot.road;
  const frontage =
    (road === "north" || road === "south"
      ? project.plot.width
      : project.plot.depth) / 100;
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    // A reframe already restores the fit; do not also apply old zoom-step deltas.
    previousZoom.current = latestZoom.current;
    const target = new Vector3(
      0,
      cameraView === "top" ? 0 : buildingHeight * 0.4,
      0,
    );
    const distance = extent * 1.6;
    if (cameraView === "top")
      camera.position.set(0, distance + buildingHeight, 0.001);
    else if (cameraView === "front") {
      camera.position.set(
        road === "east" ? distance : road === "west" ? -distance : 0,
        buildingHeight * 0.7 + 1.8,
        road === "south" ? distance : road === "north" ? -distance : 0,
      );
    } else
      camera.position.set(
        extent * 0.95,
        extent * 0.82 + buildingHeight * 0.45,
        extent * 1.2,
      );
    camera.zoom =
      cameraView === "front"
        ? Math.min(
            size.width / ((frontage + 3) * 1.3),
            size.height / ((buildingHeight + 3) * 1.5),
          )
        : Math.min(
            size.width / (extent * 1.7),
            size.height /
              (cameraView === "top"
                ? extent * 1.5
                : extent * 0.95 + buildingHeight * 0.9),
          );
    if (size.width < 600 && cameraView === "orbit") camera.zoom *= 1.1;
    camera.near = 0.1;
    camera.far = extent * 15;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
    invalidate();
  }, [
    camera,
    extent,
    frontage,
    buildingHeight,
    road,
    cameraView,
    invalidate,
    resetKey,
    size.width,
    size.height,
  ]);
  useEffect(() => {
    const delta = zoomStep - previousZoom.current;
    previousZoom.current = zoomStep;
    if (!(camera instanceof OrthographicCamera) || !delta) return;
    camera.zoom = Math.max(
      0.8,
      Math.min(110, camera.zoom * Math.pow(1.2, delta)),
    );
    camera.updateProjectionMatrix();
    controls.current?.update();
    invalidate();
  }, [camera, invalidate, zoomStep]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      enableRotate={cameraView !== "top"}
      minZoom={0.8}
      maxZoom={110}
      minPolarAngle={0.00001}
      maxPolarAngle={Math.PI / 2.08}
      maxDistance={extent * 5}
    />
  );
}

function Tree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0.12, z]} scale={scale}>
      <Box position={[0, 0.68, 0]} size={[0.14, 1.36, 0.14]} color="#847763" />
      {[
        [0, 1.95, 0, 0.83],
        [-0.35, 1.63, 0.2, 0.65],
        [0.38, 1.72, -0.14, 0.67],
      ].map(([tx, ty, tz, r], i) => (
        <mesh key={i} position={[tx, ty, tz]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial
            color={["#729a75", "#88a782", "#668c6b"][i]}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  );
}

function Road({ project }: { project: Project }) {
  const w = project.plot.width / 100;
  const d = project.plot.depth / 100;
  const horizontal =
    project.plot.road === "north" || project.plot.road === "south";
  const length = (horizontal ? w : d) + 3;
  const x = horizontal ? w / 2 : project.plot.road === "east" ? w + 1.9 : -1.9;
  const z = horizontal
    ? project.plot.road === "south"
      ? d + 1.9
      : -1.9
    : d / 2;
  return (
    <group
      position={[x, -0.16, z]}
      rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}
    >
      <Box position={[0, 0, 0]} size={[length, 0.13, 3.5]} color="#818b88" />
      <Box
        position={[0, 0.07, -1.55]}
        size={[length, 0.06, 0.24]}
        color="#cccac1"
      />
      <Box
        position={[0, 0.07, 1.55]}
        size={[length, 0.06, 0.24]}
        color="#cccac1"
      />
      {Array.from({ length: Math.floor(length / 2) }, (_, i) => (
        <Box
          key={i}
          position={[-length / 2 + i * 2 + 1, 0.075, 0]}
          size={[0.8, 0.012, 0.065]}
          color="#e9eeee"
        />
      ))}
    </group>
  );
}

function Plot({
  project,
  landscape,
}: {
  project: Project;
  landscape: boolean;
}) {
  const { width, depth, setback } = project.plot;
  const w = width / 100;
  const d = depth / 100;
  const s = setback / 100;
  const footprint = project.floors[0].footprint;
  const horizontal =
    project.plot.road === "south" || project.plot.road === "north";
  const margin =
    (project.plot.road === "south"
      ? depth - footprint.z - footprint.d
      : project.plot.road === "north"
        ? footprint.z
        : project.plot.road === "east"
          ? width - footprint.x - footprint.w
          : footprint.x) / 100;
  const exteriorDoor = deriveWalls(
    floorForGeometry(project, project.floors[0].id),
    project.plot.road,
  ).find((wall) => wall.exterior && wall.opening?.kind === "door");
  const entryAlong = exteriorDoor
    ? (horizontal
        ? exteriorDoor.x + exteriorDoor.length / 2
        : exteriorDoor.z + exteriorDoor.length / 2) / 100
    : (horizontal ? w : d) / 2;
  const parkingAlong =
    entryAlong > (horizontal ? w : d) / 2
      ? (horizontal ? w : d) / 4
      : ((horizontal ? w : d) * 3) / 4;
  const parkingPosition: [number, number, number] = horizontal
    ? [
        parkingAlong,
        0.075,
        project.plot.road === "south" ? d - margin / 2 : margin / 2,
      ]
    : [
        project.plot.road === "east" ? w - margin / 2 : margin / 2,
        0.075,
        parkingAlong,
      ];
  const parkingFits =
    margin >= 4.8 &&
    Math.abs(parkingAlong - entryAlong) > 2.1 &&
    parkingAlong >= 1.3 &&
    parkingAlong <= (horizontal ? w : d) - 1.3;
  const gardenTrees = [
    { x: 0.85, z: 1.2, scale: 1.05 },
    { x: w - 0.95, z: 1.25, scale: 1.2 },
    { x: w - 0.9, z: d - 1.45, scale: 0.78 },
    { x: 0.9, z: d * 0.68, scale: 0.8 },
  ].filter((tree) => {
    const clearance = (tree.scale * 1.05 + 0.15) * 100;
    return (
      tree.x * 100 + clearance < footprint.x ||
      tree.x * 100 - clearance > footprint.x + footprint.w ||
      tree.z * 100 + clearance < footprint.z ||
      tree.z * 100 - clearance > footprint.z + footprint.d
    );
  });
  const pathPosition = (distance: number): [number, number, number] =>
    horizontal
      ? [
          entryAlong,
          0.07,
          project.plot.road === "south" ? d - distance : distance,
        ]
      : [
          project.plot.road === "east" ? w - distance : distance,
          0.07,
          entryAlong,
        ];
  return (
    <>
      <Box
        position={[w / 2, -0.18, d / 2]}
        size={[w + 0.14, 0.38, d + 0.14]}
        color="#c3b8a0"
      />
      <Box
        position={[w / 2, 0.018, d / 2]}
        size={[w, 0.04, d]}
        color={project.garden && landscape ? "#8fa782" : "#d0c7b5"}
      />
      <Road project={project} />
      <Line
        points={[
          [s, 0.052, s],
          [w - s, 0.052, s],
          [w - s, 0.052, d - s],
          [s, 0.052, d - s],
          [s, 0.052, s],
        ]}
        color="#859a85"
        lineWidth={1}
        dashed
        dashSize={0.22}
        gapSize={0.17}
      />
      {project.garden && landscape && (
        <>
          {gardenTrees.map((tree, i) => (
            <Tree key={i} {...tree} />
          ))}
        </>
      )}
      {landscape &&
        exteriorDoor &&
        Array.from({ length: Math.floor(margin / 0.46) }, (_, i) => (
          <Box
            key={`path${i}`}
            position={pathPosition(0.25 + i * 0.46)}
            size={horizontal ? [1.12, 0.07, 0.3] : [0.3, 0.07, 1.12]}
            color="#bdb4a0"
          />
        ))}
      {project.parking && parkingFits && (
        <group
          position={parkingPosition}
          rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}
        >
          <Box position={[0, 0, 0]} size={[2.6, 0.04, 4.5]} color="#d3d7cf" />
          <Line
            points={[
              [-1.12, 0.03, 1.95],
              [-1.12, 0.03, -1.95],
              [1.12, 0.03, -1.95],
              [1.12, 0.03, 1.95],
            ]}
            color="#f5f5e9"
            lineWidth={1.5}
          />
          <Box
            position={[0, 0.28, 0]}
            size={[1.65, 0.5, 3.5]}
            color="#e5e9e7"
          />
          <Box
            position={[0, 0.69, -0.1]}
            size={[1.4, 0.38, 1.8]}
            color="#8fa5ad"
          />
          {[-0.84, 0.84].flatMap((tx) =>
            [-1.05, 1.05].map((tz) => (
              <mesh
                key={`${tx}-${tz}`}
                position={[tx, 0.2, tz]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.23, 0.23, 0.12, 12]} />
                <meshStandardMaterial color="#667077" />
              </mesh>
            )),
          )}
        </group>
      )}
    </>
  );
}

function WallBatches({
  walls,
  floor,
  base,
  height,
  openings,
  cut,
  finish,
  finishId,
  ground,
}: {
  walls: Wall[];
  floor: GeometryFloor;
  base: number;
  height: number;
  openings: boolean;
  cut: boolean;
  finish: Finish;
  finishId: SurfaceFinish;
  ground: boolean;
}) {
  const batches = useMemo(() => {
    const groups = new Map<
      string,
      {
        material: MeshStandardMaterial;
        geometries: BoxGeometry[];
        shadow: boolean;
      }
    >();
    for (const wall of walls) {
      const span = wall.length / 100,
        thickness = wall.exterior ? 0.17 : 0.12;
      const opening = wall.opening,
        openingWidth = opening ? Math.min(opening.width / 100, span - 0.12) : 0;
      const sill = opening ? opening.sill / 100 : 0,
        lintel = opening ? (opening.sill + opening.height) / 100 : 0;
      const courtyard = floor.voids.find(
        (space) =>
          space.kind === "courtyard" &&
          (wall.axis === "x"
            ? (wall.z === space.bounds.z ||
                wall.z === space.bounds.z + space.bounds.d) &&
              wall.x >= space.bounds.x &&
              wall.x + wall.length <= space.bounds.x + space.bounds.w
            : (wall.x === space.bounds.x ||
                wall.x === space.bounds.x + space.bounds.w) &&
              wall.z >= space.bounds.z &&
              wall.z + wall.length <= space.bounds.z + space.bounds.d),
      );
      const outward = courtyard
        ? wall.axis === "x"
          ? wall.z === courtyard.bounds.z
            ? 1
            : -1
          : wall.x === courtyard.bounds.x
            ? -1
            : 1
        : wall.axis === "x"
          ? wall.z <= floor.footprint.z
            ? -1
            : 1
          : wall.x <= floor.footprint.x
            ? 1
            : -1;
      const add = (
        position: [number, number, number],
        size: [number, number, number],
        color: string,
        textured = false,
        rotation = 0,
      ) => {
        if (size.some((dimension) => dimension <= 0)) return;
        const key = textured ? "surface" : color;
        const geometry = new BoxGeometry(...size);
        if (textured)
          setMetreUvs(
            geometry,
            (wall.axis === "x" ? wall.x : wall.z) / 100 + position[0],
            base + position[1],
          );
        geometry.rotateY(rotation);
        geometry.translate(...position);
        geometry.rotateY(wall.axis === "z" ? -Math.PI / 2 : 0);
        geometry.translate(wall.x / 100, base, wall.z / 100);
        let group = groups.get(key);
        if (!group) {
          group = {
            material: textured
              ? surfaceMaterial(finishId)
              : color === "glass"
                ? WINDOW_GLASS
                : solidMaterial(color),
            geometries: [],
            shadow: textured || color === "#e3ded1" || color === "#846448",
          };
          groups.set(key, group);
        }
        group.geometries.push(geometry);
      };
      const pieces =
        opening && openingWidth > 0
          ? [
              {
                start: 0,
                length: (span - openingWidth) / 2,
                bottom: 0,
                height,
              },
              {
                start: (span + openingWidth) / 2,
                length: (span - openingWidth) / 2,
                bottom: 0,
                height,
              },
              ...(sill > 0
                ? [
                    {
                      start: (span - openingWidth) / 2,
                      length: openingWidth,
                      bottom: 0,
                      height: Math.min(sill, height),
                    },
                  ]
                : []),
              ...(height > lintel
                ? [
                    {
                      start: (span - openingWidth) / 2,
                      length: openingWidth,
                      bottom: lintel,
                      height: height - lintel,
                    },
                  ]
                : []),
            ]
          : [{ start: 0, length: span, bottom: 0, height }];
      for (const piece of pieces) {
        add(
          [piece.start + piece.length / 2, piece.bottom + piece.height / 2, 0],
          [piece.length, piece.height, thickness],
          "#e3ded1",
          wall.exterior,
        );
        if (wall.exterior)
          add(
            [
              piece.start + piece.length / 2,
              piece.bottom + piece.height / 2,
              -outward * (thickness / 2 + 0.002),
            ],
            [piece.length, piece.height, 0.003],
            "#e3ded1",
          );
        if (cut && piece.bottom + piece.height >= height - 0.001)
          add(
            [piece.start + piece.length / 2, height + 0.005, 0],
            [piece.length, 0.018, thickness + 0.016],
            finish.trim,
          );
      }
      const glassHeight = Math.min(lintel, height) - sill;
      if (!openings || !opening || openingWidth <= 0 || glassHeight <= 0)
        continue;
      if (opening.kind === "window") {
        add(
          [span / 2, sill + glassHeight / 2, -outward * 0.035],
          [openingWidth, glassHeight, 0.018],
          "glass",
        );
        for (const offset of [
          -openingWidth / 2 + 0.025,
          0,
          openingWidth / 2 - 0.025,
        ])
          add(
            [span / 2 + offset, sill + glassHeight / 2, -outward * 0.015],
            [0.05, glassHeight, 0.11],
            "#394b4a",
          );
        add(
          [span / 2, sill, outward * 0.045],
          [openingWidth + 0.12, 0.055, 0.28],
          finish.trim,
        );
        if (!cut) {
          add(
            [span / 2, lintel, 0],
            [openingWidth + 0.06, 0.05, 0.11],
            "#394b4a",
          );
          if (wall.exterior)
            add(
              [span / 2, lintel + 0.12, outward * 0.2],
              [openingWidth + 0.24, 0.07, 0.65],
              finish.trim,
            );
        }
      } else {
        const angle = -Math.PI / 3.5,
          half = (openingWidth - 0.04) / 2;
        add(
          [
            (span - openingWidth) / 2 + Math.cos(angle) * half,
            Math.min(lintel, height) / 2,
            -Math.sin(angle) * half,
          ],
          [openingWidth - 0.04, Math.min(lintel, height), 0.045],
          "#846448",
          false,
          angle,
        );
        if (ground && wall.exterior && !cut) {
          add(
            [span / 2, lintel + 0.18, outward * 0.36],
            [openingWidth + 0.55, 0.13, 0.95],
            finish.trim,
          );
          add(
            [span / 2, -0.05, outward * 0.32],
            [openingWidth + 0.3, 0.1, 0.7],
            "#adab9d",
          );
          for (const side of [-1, 1])
            add(
              [
                span / 2 + side * (openingWidth / 2 + 0.045),
                lintel / 2,
                outward * 0.035,
              ],
              [0.08, lintel, thickness + 0.06],
              "#846448",
            );
        }
      }
    }
    return [...groups].map(([key, group]) => {
      const geometry = mergeGeometries(group.geometries)!;
      group.geometries.forEach((part) => part.dispose());
      return { key, geometry, material: group.material, shadow: group.shadow };
    });
  }, [
    walls,
    floor.footprint,
    floor.voids,
    base,
    height,
    openings,
    cut,
    finish,
    finishId,
    ground,
  ]);
  useEffect(
    () => () => batches.forEach((batch) => batch.geometry.dispose()),
    [batches],
  );
  return (
    <group>
      {batches.map((batch) => (
        <mesh
          key={batch.key}
          geometry={batch.geometry}
          material={batch.material}
          castShadow={batch.shadow}
          receiveShadow={batch.key !== "glass"}
          dispose={null}
        />
      ))}
    </group>
  );
}

function StructuralFrame({ floor }: { floor: GeometryFloor }) {
  const points = new Map<string, [number, number]>();
  const { footprint } = floor;
  // A perimeter-only schematic keeps both the courtyard and stair shaft clear.
  const xs = [footprint.x, footprint.x + footprint.w];
  const zs = [footprint.z, footprint.z + footprint.d];
  xs.forEach((x) =>
    zs.forEach((z) => points.set(`${x},${z}`, [x / 100, z / 100])),
  );
  const elevation = floor.elevation / 100 + 0.12;
  const height = floor.height / 100;
  return (
    <group>
      {[...points].map(([id, [x, z]]) => (
        <Box
          key={id}
          position={[x, elevation + height / 2, z]}
          size={[0.22, height, 0.22]}
          color="#c5c3b9"
        />
      ))}
      {xs.map((x) => (
        <Box
          key={`x${x}`}
          position={[
            x / 100,
            elevation + height - 0.12,
            (footprint.z + footprint.d / 2) / 100,
          ]}
          size={[0.2, 0.26, footprint.d / 100]}
          color="#bbbdb5"
        />
      ))}
      {zs.map((z) => (
        <Box
          key={`z${z}`}
          position={[
            (footprint.x + footprint.w / 2) / 100,
            elevation + height - 0.12,
            z / 100,
          ]}
          size={[footprint.w / 100, 0.26, 0.2]}
          color="#bbbdb5"
        />
      ))}
    </group>
  );
}

function Stairs({ floor, stairs }: { floor: GeometryFloor; stairs: Void }) {
  const { bounds } = stairs;
  const count = 16;
  const tread = bounds.d / 100 / count;
  const rise = floor.height / 100 / count;
  return (
    <group
      position={[bounds.x / 100, floor.elevation / 100 + 0.15, bounds.z / 100]}
    >
      {Array.from({ length: count }, (_, i) => (
        <Box
          key={i}
          position={[bounds.w / 200, rise * (i + 1) - 0.06, tread * (i + 0.5)]}
          size={[bounds.w / 100 - 0.08, 0.12, tread + 0.015]}
          color={i % 2 === 0 ? "#c2ad8e" : "#c9b699"}
        />
      ))}
      <Line
        points={[
          [0.05, 0.95, 0],
          [0.05, floor.height / 100 + 0.95, bounds.d / 100],
        ]}
        color="#9b998a"
        lineWidth={1.5}
      />
    </group>
  );
}

function Balcony({
  floor,
  balcony,
  selected,
  onSelect,
}: {
  floor: GeometryFloor;
  balcony: BalconyModel;
  selected: string | null;
  onSelect: Props["onSelect"];
}) {
  const bounds = balconyBounds(floor, balcony),
    width = balcony.width / 100,
    depth = balcony.depth / 100;
  const angle =
    balcony.edge === "north"
      ? Math.PI
      : balcony.edge === "east"
        ? Math.PI / 2
        : balcony.edge === "west"
          ? -Math.PI / 2
          : 0;
  const railing = useMemo(() => {
    const positions: [number, number, number][] = [];
    const count = Math.max(3, Math.ceil(width / 0.3));
    for (let i = 0; i < count; i++)
      positions.push([
        -width / 2 + (width * i) / (count - 1),
        0.54,
        depth / 2 - 0.03,
      ]);
    const sideCount = Math.max(2, Math.ceil(depth / 0.3));
    for (const side of [-1, 1])
      for (let i = 0; i < sideCount - 1; i++)
        positions.push([
          (side * width) / 2,
          0.54,
          -depth / 2 + (depth * i) / (sideCount - 1),
        ]);
    const parts = positions.map((position) =>
      new BoxGeometry(0.035, 0.95, 0.035).translate(...position),
    );
    const geometry = mergeGeometries(parts)!;
    parts.forEach((part) => part.dispose());
    return geometry;
  }, [width, depth]);
  useEffect(() => () => railing.dispose(), [railing]);
  return (
    <group
      position={[
        (bounds.x + bounds.w / 2) / 100,
        floor.elevation / 100 + 0.15,
        (bounds.z + bounds.d / 2) / 100,
      ]}
      rotation={[0, angle, 0]}
    >
      <Box
        position={[0, 0, 0]}
        size={[width, 0.18, depth]}
        color={selected === balcony.id ? "#e7bb73" : "#d2c6ac"}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(balcony.id);
        }}
      />
      <Line
        points={[
          [-width / 2, 1, -depth / 2],
          [-width / 2, 1, depth / 2],
          [width / 2, 1, depth / 2],
          [width / 2, 1, -depth / 2],
        ]}
        color="#455550"
        lineWidth={2}
      />
      <mesh
        geometry={railing}
        material={solidMaterial("#5b655b")}
        dispose={null}
      />
    </group>
  );
}

function RoofEdge({
  floor,
  base,
  finish,
}: {
  floor: GeometryFloor;
  base: number;
  finish: Finish;
}) {
  const segments = useMemo(() => {
    const groups = new Map<
      string,
      {
        axis: "x" | "z";
        fixed: number;
        edges: { start: number; end: number; outward: number }[];
      }
    >();
    for (const tile of slabTiles(floor, false)) {
      const edges = [
        {
          axis: "x" as const,
          fixed: tile.z,
          start: tile.x,
          end: tile.x + tile.w,
          outward: -1,
        },
        {
          axis: "x" as const,
          fixed: tile.z + tile.d,
          start: tile.x,
          end: tile.x + tile.w,
          outward: 1,
        },
        {
          axis: "z" as const,
          fixed: tile.x,
          start: tile.z,
          end: tile.z + tile.d,
          outward: -1,
        },
        {
          axis: "z" as const,
          fixed: tile.x + tile.w,
          start: tile.z,
          end: tile.z + tile.d,
          outward: 1,
        },
      ];
      for (const edge of edges) {
        const key = `${edge.axis}:${edge.fixed}`;
        if (!groups.has(key))
          groups.set(key, { axis: edge.axis, fixed: edge.fixed, edges: [] });
        groups.get(key)!.edges.push(edge);
      }
    }
    return [...groups.values()].flatMap((group) => {
      const cuts = [
        ...new Set(group.edges.flatMap((edge) => [edge.start, edge.end])),
      ].sort((a, b) => a - b);
      return cuts.slice(0, -1).flatMap((start, i) => {
        const end = cuts[i + 1],
          midpoint = (start + end) / 2;
        const normal = group.edges
          .filter((edge) => edge.start < midpoint && edge.end > midpoint)
          .reduce((sum, edge) => sum + edge.outward, 0);
        if (!normal) return [];
        const along = (start + end) / 200,
          across = group.fixed / 100 - Math.sign(normal) * 0.09,
          span = (end - start) / 100;
        return [
          {
            position: [
              group.axis === "x" ? along : across,
              base + 0.38,
              group.axis === "x" ? across : along,
            ] as [number, number, number],
            size: [
              group.axis === "x" ? span : 0.15,
              0.55,
              group.axis === "x" ? 0.15 : span,
            ] as [number, number, number],
          },
        ];
      });
    });
  }, [floor, base]);
  return (
    <group>
      {segments.map((segment, i) => (
        <group key={i}>
          <Box {...segment} color={finish.wall} />
          <Box
            position={[segment.position[0], base + 0.69, segment.position[2]]}
            size={[segment.size[0] + 0.03, 0.065, segment.size[2] + 0.03]}
            color={finish.trim}
          />
        </group>
      ))}
    </group>
  );
}

function FloorGeometry({
  floor,
  selected,
  onSelect,
  view,
  top,
  ground,
  hasAbove,
  road,
  unit,
  finish,
  finishId,
  exteriorOnly,
  stairsToNext,
}: {
  floor: GeometryFloor;
  selected: string | null;
  onSelect: Props["onSelect"];
  view: ViewSettings;
  top: boolean;
  ground: boolean;
  hasAbove: boolean;
  road: Project["plot"]["road"];
  language: Language;
  unit: Unit;
  finish: Finish;
  finishId: SurfaceFinish;
  exteriorOnly: boolean;
  stairsToNext: string[];
}) {
  const walls = useMemo(
    () =>
      deriveWalls(floor, road).filter((wall) => !exteriorOnly || wall.exterior),
    [floor, road, exteriorOnly],
  );
  const tiles = useMemo(() => slabTiles(floor, !ground), [floor, ground]);
  const roofTiles = useMemo(() => slabTiles(floor, false), [floor]);
  const base = floor.elevation / 100 + 0.15;
  const cut =
    view.cutaway && top && !(view.roof && view.stage >= 5 && !hasAbove);
  const height = cut ? 0.95 : floor.height / 100;
  return (
    <group>
      {view.stage >= 1 &&
        ground &&
        tiles.map((tile, i) => (
          <Plate
            key={`foundation${i}`}
            rect={tile}
            y={-0.02}
            height={0.2}
            color="#c7c7ba"
          />
        ))}
      {view.stage === 2 && <StructuralFrame floor={floor} />}
      {view.stage >= 4 &&
        tiles.map((tile, i) => (
          <Plate
            key={`slab${i}`}
            rect={tile}
            y={base - 0.08}
            height={0.18}
            color="#e2ded1"
          />
        ))}
      {view.stage >= 3 && (
        <>
          {view.stage >= 4 &&
            !exteriorOnly &&
            floor.rooms.map((room) => (
              <group key={room.id}>
                <mesh
                  position={[
                    (room.bounds.x + room.bounds.w / 2) / 100,
                    base + 0.025,
                    (room.bounds.z + room.bounds.d / 2) / 100,
                  ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  receiveShadow
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(room.id);
                  }}
                  onPointerOver={(event) => {
                    event.stopPropagation();
                    document.body.style.cursor = "pointer";
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = "";
                  }}
                >
                  <planeGeometry
                    args={[
                      room.bounds.w / 100 - 0.015,
                      room.bounds.d / 100 - 0.015,
                    ]}
                  />
                  <meshStandardMaterial
                    color={
                      selected === room.id ? "#e7bb73" : ROOM_FLOORS[room.kind]
                    }
                    roughness={0.9}
                  />
                </mesh>
                {selected === room.id && (
                  <Line
                    points={[
                      [
                        room.bounds.x / 100 + 0.08,
                        base + 0.04,
                        room.bounds.z / 100 + 0.08,
                      ],
                      [
                        (room.bounds.x + room.bounds.w) / 100 - 0.08,
                        base + 0.04,
                        room.bounds.z / 100 + 0.08,
                      ],
                      [
                        (room.bounds.x + room.bounds.w) / 100 - 0.08,
                        base + 0.04,
                        (room.bounds.z + room.bounds.d) / 100 - 0.08,
                      ],
                      [
                        room.bounds.x / 100 + 0.08,
                        base + 0.04,
                        (room.bounds.z + room.bounds.d) / 100 - 0.08,
                      ],
                      [
                        room.bounds.x / 100 + 0.08,
                        base + 0.04,
                        room.bounds.z / 100 + 0.08,
                      ],
                    ]}
                    lineWidth={2}
                    color="#b77730"
                  />
                )}
                {view.labels && top && (
                  <Html
                    center
                    position={[
                      (room.bounds.x + room.bounds.w / 2) / 100,
                      base + 0.18,
                      (room.bounds.z + room.bounds.d / 2) / 100,
                    ]}
                    occlude
                    zIndexRange={[5, 0]}
                    style={{ pointerEvents: "none" }}
                  >
                    <div
                      className={`scene-room-label${selected === room.id ? " selected" : ""}`}
                    >
                      {roomName(room)}
                      <span>
                        {length(room.bounds.w, unit)} ×{" "}
                        {length(room.bounds.d, unit)} {unitLabel(unit)}
                      </span>
                    </div>
                  </Html>
                )}
              </group>
            ))}
          {view.walls && (
            <WallBatches
              walls={walls}
              floor={floor}
              base={base}
              height={height}
              openings={view.openings}
              cut={cut}
              finish={finish}
              finishId={finishId}
              ground={ground}
            />
          )}
          {hasAbove &&
            !exteriorOnly &&
            floor.voids
              .filter(
                (space) =>
                  space.kind === "stairs" && stairsToNext.includes(space.id),
              )
              .map((stairs) => (
                <Stairs key={stairs.id} floor={floor} stairs={stairs} />
              ))}
          {view.stage >= 4 &&
            floor.balconies.map((balcony) => (
              <Balcony
                key={balcony.id}
                floor={floor}
                balcony={balcony}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
        </>
      )}
      {view.stage >= 3 &&
        floor.voids.map((space) => (
          <mesh
            key={`select-${space.id}`}
            position={[
              (space.bounds.x + space.bounds.w / 2) / 100,
              base - 0.09,
              (space.bounds.z + space.bounds.d / 2) / 100,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(space.id);
            }}
          >
            <planeGeometry
              args={[space.bounds.w / 100, space.bounds.d / 100]}
            />
            <meshBasicMaterial
              transparent
              opacity={selected === space.id ? 0.2 : 0}
              color="#dda749"
              depthWrite={false}
            />
          </mesh>
        ))}
      {ground &&
        view.landscape &&
        floor.voids
          .filter((v) => v.kind === "courtyard")
          .map((v) => (
            <group key={v.id}>
              <Plate rect={v.bounds} y={0.04} height={0.05} color="#aabf96" />
              <Tree
                x={(v.bounds.x + v.bounds.w / 2) / 100}
                z={(v.bounds.z + v.bounds.d / 2) / 100}
                scale={Math.min(0.78, Math.min(v.bounds.w, v.bounds.d) / 240)}
              />
            </group>
          ))}
      {view.stage >= 5 && !hasAbove && view.roof && top && (
        <>
          {roofTiles.map((tile, i) => (
            <Plate
              key={`roof${i}`}
              rect={tile}
              y={base + floor.height / 100 + 0.05}
              height={0.16}
              color={finish.roof}
            />
          ))}
          {view.walls && (
            <RoofEdge
              floor={floor}
              base={base + floor.height / 100}
              finish={finish}
            />
          )}
        </>
      )}
    </group>
  );
}

function House({
  project,
  selected,
  onSelect,
  view,
  language = "en",
  unit = "ft",
  cameraView = "orbit",
  zoomStep = 0,
}: Props) {
  const finish = FINISHES[project.finish ?? "ivory"];
  const visible = useMemo(
    () =>
      project.floors
        .filter((floor) => view.floor === "all" || floor.id === view.floor)
        .map((floor) => floorForGeometry(project, floor.id)),
    [project, view.floor],
  );
  const shadowExtent = Math.max(project.plot.width, project.plot.depth) / 100;
  const buildingHeight =
    Math.max(...project.floors.map((floor) => floor.elevation + floor.height)) /
    100;
  const shadowRadius = Math.hypot(shadowExtent, buildingHeight) * 0.75 + 5;
  const { size } = useThree();
  const top = visible.reduce(
    (highest, floor) => (floor.elevation > highest ? floor.elevation : highest),
    -Infinity,
  );
  return (
    <>
      <color attach="background" args={["#dce5e4"]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#fffaf0", "#859182", 0.8]} />
      <directionalLight
        position={[
          -shadowExtent * 0.7,
          buildingHeight + shadowExtent * 1.3,
          shadowExtent * 0.7,
        ]}
        intensity={2.2}
        castShadow
        shadow-mapSize={size.width < 768 ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-camera-far={shadowRadius * 6}
        shadow-normalBias={0.035}
        shadow-bias={-0.0001}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.41, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <shadowMaterial transparent opacity={0.19} />
      </mesh>
      <group
        position={[-project.plot.width / 200, 0, -project.plot.depth / 200]}
      >
        <Plot project={project} landscape={view.landscape} />
        {visible.map((floor) => (
          <FloorGeometry
            key={floor.id}
            floor={floor}
            selected={selected}
            onSelect={onSelect}
            view={view}
            top={floor.elevation === top}
            ground={floor.elevation === 0}
            road={project.plot.road}
            language={language}
            unit={unit}
            finish={finish}
            finishId={project.finish ?? "ivory"}
            stairsToNext={project.verticalSpaces
              .filter(
                (space) =>
                  space.kind === "stairs" &&
                  space.floorIds.includes(floor.id) &&
                  project.floors.some(
                    (next) =>
                      next.elevation === floor.elevation + floor.height &&
                      space.floorIds.includes(next.id),
                  ),
              )
              .map((space) => space.id)}
            exteriorOnly={
              view.floor === "all" &&
              view.roof &&
              view.walls &&
              !view.cutaway &&
              view.stage >= 5
            }
            hasAbove={project.floors.some(
              (other) => other.elevation === floor.elevation + floor.height,
            )}
          />
        ))}
      </group>
      <CameraControls
        project={project}
        resetKey={view.resetKey}
        cameraView={cameraView}
        zoomStep={zoomStep}
      />
    </>
  );
}

function Fallback() {
  return (
    <div role="status" className="scene-fallback">
      <strong>{"3D isn’t available in this browser"}</strong>
      <p>
        {
          "Choose 2D plan to keep shaping your home. To explore in 3D, try a browser with WebGL enabled."
        }
      </p>
    </div>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode; language: Language },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

export default function Scene(props: Props) {
  const language = props.language ?? "en";
  const [supported] = useState(() => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2");
      if (!context) return false;
      context.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch {
      return false;
    }
  });
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );
  if (!supported) return <Fallback />;
  return (
    <SceneBoundary language={language}>
      <Canvas
        orthographic
        shadows
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [24, 28, 30], zoom: 22 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onPointerMissed={() => props.onSelect(null)}
        fallback={
          <span>
            {
              "Interactive 3D home. Use the Rooms list or 2D plan to edit with the keyboard."
            }
          </span>
        }
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <House {...props} />
      </Canvas>
    </SceneBoundary>
  );
}

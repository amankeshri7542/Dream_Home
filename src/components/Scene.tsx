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
import { OrthographicCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { balconyBounds, deriveWalls, slabTiles } from "../domain/model";
import {
  length,
  roomName,
  unitLabel,
  type Language,
  type Unit,
} from "../domain/display";
import {
  type Floor,
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
    <mesh position={position} castShadow receiveShadow onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
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
  const exteriorDoor = deriveWalls(project.floors[0], project.plot.road).find(
    (wall) => wall.exterior && wall.opening?.kind === "door",
  );
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

function WallGeometry({
  wall,
  base,
  height,
  openings,
  cut,
  finish,
  outward,
  entry,
}: {
  wall: Wall;
  base: number;
  height: number;
  openings: boolean;
  cut: boolean;
  finish: Finish;
  outward: number;
  entry: boolean;
}) {
  const length = wall.length / 100;
  const thickness = wall.exterior ? 0.17 : 0.12;
  const opening = wall.opening;
  const pieces: {
    start: number;
    length: number;
    bottom: number;
    height: number;
  }[] = [];
  const openingWidth = opening
    ? Math.min(opening.width / 100, length - 0.12)
    : 0;
  const sill = opening ? opening.sill / 100 : 0;
  const lintel = opening ? (opening.sill + opening.height) / 100 : 0;
  if (opening && openingWidth > 0) {
    const side = (length - openingWidth) / 2;
    pieces.push(
      { start: 0, length: side, bottom: 0, height },
      { start: side + openingWidth, length: side, bottom: 0, height },
    );
    if (sill > 0)
      pieces.push({
        start: side,
        length: openingWidth,
        bottom: 0,
        height: Math.min(sill, height),
      });
    if (height > lintel)
      pieces.push({
        start: side,
        length: openingWidth,
        bottom: lintel,
        height: height - lintel,
      });
  } else pieces.push({ start: 0, length, bottom: 0, height });
  const glassHeight = Math.min(lintel, height) - sill;
  return (
    <group
      position={[wall.x / 100, base, wall.z / 100]}
      rotation={[0, wall.axis === "z" ? -Math.PI / 2 : 0, 0]}
    >
      {pieces.map((piece, i) => (
        <group key={i}>
          <Box
            position={[
              piece.start + piece.length / 2,
              piece.bottom + piece.height / 2,
              0,
            ]}
            size={[piece.length, piece.height, thickness]}
            color={wall.exterior ? finish.wall : "#e3ded1"}
          />
          {cut && piece.bottom + piece.height >= height - 0.001 && (
            <Box
              position={[piece.start + piece.length / 2, height + 0.005, 0]}
              size={[piece.length, 0.018, thickness + 0.016]}
              color={finish.trim}
            />
          )}
        </group>
      ))}
      {entry && !cut && openings && opening?.kind === "door" && (
        <>
          <Box
            position={[length / 2, lintel + 0.18, outward * 0.36]}
            size={[openingWidth + 0.55, 0.13, 0.95]}
            color={finish.trim}
          />
          <Box
            position={[length / 2, -0.05, outward * 0.32]}
            size={[openingWidth + 0.3, 0.1, 0.7]}
            color="#adab9d"
          />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              position={[
                length / 2 + side * (openingWidth / 2 + 0.045),
                lintel / 2,
                outward * 0.035,
              ]}
              size={[0.08, lintel, thickness + 0.06]}
              color="#846448"
            />
          ))}
        </>
      )}
      {openings && opening && openingWidth > 0 && glassHeight > 0 && (
        <>
          {opening.kind === "window" ? (
            <>
              <mesh position={[length / 2, sill + glassHeight / 2, 0]}>
                <boxGeometry args={[openingWidth, glassHeight, 0.035]} />
                <meshStandardMaterial
                  color="#557d88"
                  transparent
                  opacity={0.64}
                  roughness={0.12}
                  depthWrite={false}
                />
              </mesh>
              <Box
                position={[length / 2, sill + glassHeight / 2, 0]}
                size={[0.045, glassHeight, 0.09]}
                color="#394b4a"
              />
              <Box
                position={[length / 2, sill, 0]}
                size={[openingWidth + 0.06, 0.045, 0.23]}
                color={finish.trim}
              />
              {[-1, 1].map((side) => (
                <Box
                  key={side}
                  position={[
                    length / 2 + side * (openingWidth / 2 - 0.025),
                    sill + glassHeight / 2,
                    0,
                  ]}
                  size={[0.055, glassHeight, 0.11]}
                  color="#394b4a"
                  roughness={0.4}
                />
              ))}
              {!cut && wall.exterior && (
                <Box
                  position={[length / 2, lintel + 0.12, outward * 0.2]}
                  size={[openingWidth + 0.24, 0.07, 0.65]}
                  color={finish.trim}
                />
              )}
              {!cut && (
                <Box
                  position={[length / 2, lintel, 0]}
                  size={[openingWidth + 0.06, 0.045, 0.09]}
                  color="#394b4a"
                />
              )}
            </>
          ) : (
            <group
              position={[(length - openingWidth) / 2, 0, 0]}
              rotation={[0, -Math.PI / 3.5, 0]}
            >
              <Box
                position={[openingWidth / 2, Math.min(lintel, height) / 2, 0]}
                size={[openingWidth - 0.04, Math.min(lintel, height), 0.045]}
                color="#846448"
              />
            </group>
          )}
        </>
      )}
    </group>
  );
}

function StructuralFrame({ floor }: { floor: Floor }) {
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

function Stairs({ floor }: { floor: Floor }) {
  const stairs = floor.voids.find((v) => v.kind === "stairs");
  if (!stairs) return null;
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

function Balcony({ floor }: { floor: Floor }) {
  if (!floor.balcony) return null;
  const bounds = balconyBounds(floor);
  const width = bounds.w / 100;
  const depth = bounds.d / 100;
  return (
    <group
      position={[
        (bounds.x + bounds.w / 2) / 100,
        floor.elevation / 100 + 0.15,
        (bounds.z + bounds.d / 2) / 100,
      ]}
    >
      <Box position={[0, 0, 0]} size={[width, 0.18, depth]} color="#e1d8c6" />
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
      {Array.from({ length: 10 }, (_, i) => (
        <Box
          key={i}
          position={[-width / 2 + (width * i) / 9, 0.54, depth / 2 - 0.03]}
          size={[0.035, 0.95, 0.035]}
          color="#5b655b"
        />
      ))}
    </group>
  );
}

function RoofEdge({
  floor,
  base,
  finish,
}: {
  floor: Floor;
  base: number;
  finish: Finish;
}) {
  const rings = [
    floor.footprint,
    ...floor.voids
      .filter((space) => space.kind === "courtyard")
      .map((space) => space.bounds),
  ];
  return (
    <group>
      {rings.flatMap((bounds, ringIndex) => {
        const x = bounds.x / 100,
          z = bounds.z / 100,
          w = bounds.w / 100,
          d = bounds.d / 100;
        // Courtyard guards sit on the slab side, leaving the whole opening clear.
        const offset = ringIndex === 0 ? 0.075 : -0.075;
        const segments = [
          {
            position: [x + w / 2, base + 0.38, z + offset] as [
              number,
              number,
              number,
            ],
            size: [w, 0.55, 0.15] as [number, number, number],
          },
          {
            position: [x + w / 2, base + 0.38, z + d - offset] as [
              number,
              number,
              number,
            ],
            size: [w, 0.55, 0.15] as [number, number, number],
          },
          {
            position: [x + offset, base + 0.38, z + d / 2] as [
              number,
              number,
              number,
            ],
            size: [0.15, 0.55, d] as [number, number, number],
          },
          {
            position: [x + w - offset, base + 0.38, z + d / 2] as [
              number,
              number,
              number,
            ],
            size: [0.15, 0.55, d] as [number, number, number],
          },
        ];
        return segments.map((segment, i) => (
          <group key={`${ringIndex}-${i}`}>
            <Box {...segment} color={finish.wall} />
            <Box
              position={[segment.position[0], base + 0.69, segment.position[2]]}
              size={[segment.size[0] + 0.035, 0.065, segment.size[2] + 0.035]}
              color={finish.trim}
            />
          </group>
        ));
      })}
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
}: {
  floor: Floor;
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
}) {
  const walls = useMemo(
    () => deriveWalls(floor, ground ? road : "south"),
    [floor, ground, road],
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
          {view.walls &&
            walls.map((wall) => (
              <WallGeometry
                key={wall.id}
                wall={wall}
                base={base}
                height={height}
                openings={view.openings}
                cut={cut}
                finish={finish}
                outward={
                  wall.axis === "x"
                    ? wall.z <= floor.footprint.z
                      ? -1
                      : 1
                    : wall.x <= floor.footprint.x
                      ? 1
                      : -1
                }
                entry={ground && wall.exterior}
              />
            ))}
          {hasAbove && <Stairs floor={floor} />}
          {view.stage >= 4 && <Balcony floor={floor} />}
        </>
      )}
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
  const visible = project.floors.filter(
    (f) => view.floor === "all" || f.id === view.floor,
  );
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
        position={[-12, 25, 12]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
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

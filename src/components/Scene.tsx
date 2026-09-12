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
  text,
  unitLabel,
  type Language,
  type Unit,
} from "../domain/display";
import {
  ROOM_META,
  type Floor,
  type Project,
  type Rect,
  type ViewSettings,
  type Wall,
} from "../domain/types";

type Props = {
  project: Project;
  selected: string | null;
  onSelect: (id: string | null) => void;
  view: ViewSettings;
  language?: Language;
  unit?: Unit;
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
}: {
  project: Project;
  resetKey: number;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const extent = Math.max(project.plot.width, project.plot.depth) / 100;
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    const target = new Vector3(0, 1.2, 0);
    camera.position.set(extent * 0.95, extent * 1.1, extent * 1.25);
    camera.zoom = Math.min(
      size.width / (extent * 1.8),
      size.height / (extent * 1.45),
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
  }, [camera, extent, invalidate, resetKey, size.width, size.height]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      minZoom={0.8}
      maxZoom={110}
      minPolarAngle={0.15}
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
      <Box position={[0, 0, 0]} size={[length, 0.13, 3.5]} color="#bdc7cc" />
      <Box
        position={[0, 0.07, -1.55]}
        size={[length, 0.06, 0.24]}
        color="#f6f3eb"
      />
      <Box
        position={[0, 0.07, 1.55]}
        size={[length, 0.06, 0.24]}
        color="#f6f3eb"
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
        color="#d8d5c9"
      />
      <Box
        position={[w / 2, 0.018, d / 2]}
        size={[w, 0.04, d]}
        color={project.garden && landscape ? "#b8c8a6" : "#e7e2d6"}
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
            color="#ebe6d8"
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
}: {
  wall: Wall;
  base: number;
  height: number;
  openings: boolean;
  cut: boolean;
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
            color={wall.exterior ? "#f3f0e7" : "#e7e4da"}
          />
          {cut && piece.bottom + piece.height >= height - 0.001 && (
            <Box
              position={[piece.start + piece.length / 2, height + 0.005, 0]}
              size={[piece.length, 0.018, thickness + 0.016]}
              color="#d1c9b8"
            />
          )}
        </group>
      ))}
      {openings && opening && openingWidth > 0 && glassHeight > 0 && (
        <>
          {opening.kind === "window" ? (
            <>
              <mesh position={[length / 2, sill + glassHeight / 2, 0]}>
                <boxGeometry args={[openingWidth, glassHeight, 0.035]} />
                <meshStandardMaterial
                  color="#9dbac3"
                  transparent
                  opacity={0.4}
                  roughness={0.2}
                  depthWrite={false}
                />
              </mesh>
              <Box
                position={[length / 2, sill + glassHeight / 2, 0]}
                size={[0.045, glassHeight, 0.09]}
                color="#7d8b89"
              />
              <Box
                position={[length / 2, sill, 0]}
                size={[openingWidth + 0.06, 0.045, 0.23]}
                color="#cbc7bb"
              />
              {!cut && (
                <Box
                  position={[length / 2, lintel, 0]}
                  size={[openingWidth + 0.06, 0.045, 0.09]}
                  color="#7d8b89"
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
                color="#b89a73"
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
        color="#a3a99e"
        lineWidth={2}
      />
      {Array.from({ length: 10 }, (_, i) => (
        <Box
          key={i}
          position={[-width / 2 + (width * i) / 9, 0.54, depth / 2 - 0.03]}
          size={[0.035, 0.95, 0.035]}
          color="#adb2a7"
        />
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
  language,
  unit,
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
                      selected === room.id
                        ? "#e7bb73"
                        : ROOM_META[room.kind].color
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
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: 10,
                        color: "#39463e",
                        background: "rgba(255,255,250,.83)",
                        padding: "4px 7px",
                        borderRadius: 5,
                        border: "1px solid rgba(87,99,86,.12)",
                        textAlign: "center",
                        boxShadow: "0 2px 7px #4152400d",
                      }}
                    >
                      {roomName(room, language)}
                      <span
                        style={{
                          display: "block",
                          fontSize: 9,
                          opacity: 0.6,
                          marginTop: 1,
                        }}
                      >
                        {length(room.bounds.w, unit)} ×{" "}
                        {length(room.bounds.d, unit)}{" "}
                        {unitLabel(unit, language)}
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
      {view.stage >= 5 &&
        !hasAbove &&
        view.roof &&
        top &&
        roofTiles.map((tile, i) => (
          <Plate
            key={`roof${i}`}
            rect={tile}
            y={base + floor.height / 100 + 0.05}
            height={0.16}
            color="#9ca69d"
          />
        ))}
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
}: Props) {
  const visible = project.floors.filter(
    (f) => view.floor === "all" || f.id === view.floor,
  );
  const top = visible.reduce(
    (highest, floor) => (floor.elevation > highest ? floor.elevation : highest),
    -Infinity,
  );
  return (
    <>
      <color attach="background" args={["#e8eef1"]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#fffaf0", "#cad6d1", 1]} />
      <directionalLight
        position={[-12, 25, 12]}
        intensity={1.8}
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
        <shadowMaterial transparent opacity={0.11} />
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
            hasAbove={project.floors.some(
              (other) => other.elevation === floor.elevation + floor.height,
            )}
          />
        ))}
      </group>
      <CameraControls project={project} resetKey={view.resetKey} />
    </>
  );
}

function Fallback({ language = "en" }: { language?: Language }) {
  return (
    <div
      role="status"
      style={{
        height: "100%",
        display: "grid",
        placeContent: "center",
        textAlign: "center",
        padding: 28,
        background: "#e8eef1",
        color: "#3f524a",
      }}
    >
      <strong>
        {text(
          language,
          "3D isn’t available in this browser",
          "इस ब्राउज़र में 3D उपलब्ध नहीं है",
        )}
      </strong>
      <p style={{ maxWidth: 320, lineHeight: 1.6 }}>
        {text(
          language,
          "Choose 2D plan to keep shaping your home. To explore in 3D, try a browser with WebGL enabled.",
          "घर का नक्शा बनाने के लिए 2D नक्शा चुनें। 3D देखने के लिए WebGL वाले ब्राउज़र का उपयोग करें।",
        )}
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
    return this.state.failed ? (
      <Fallback language={this.props.language} />
    ) : (
      this.props.children
    );
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
  if (!supported) return <Fallback language={language} />;
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
            {text(
              language,
              "Interactive 3D home. Use the Rooms list or 2D plan to edit with the keyboard.",
              "इंटरैक्टिव 3D घर। कीबोर्ड से बदलाव करने के लिए कमरों की सूची या 2D नक्शा चुनें।",
            )}
          </span>
        }
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <House {...props} />
      </Canvas>
    </SceneBoundary>
  );
}

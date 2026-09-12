import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { OrthographicCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { balconyBounds } from "../domain/model";
import type { Project } from "../domain/types";

export function CameraControls({
  project,
  floorId,
  resetKey,
  cameraView = "orbit",
  zoomStep = 0,
  framing = "home",
  focusRoomId = null,
  cutaway = false,
}: {
  project: Project;
  floorId: string;
  resetKey: number;
  cameraView?: "orbit" | "front" | "top";
  zoomStep?: number;
  framing?: "home" | "plot";
  focusRoomId?: string | null;
  cutaway?: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const previousZoom = useRef(zoomStep),
    latestZoom = useRef(zoomStep);
  latestZoom.current = zoomStep;
  const { camera, size, invalidate } = useThree();
  const visible = project.floors.filter(
    (floor) => floorId === "all" || floor.id === floorId,
  );
  const floors = visible.length ? visible : project.floors;
  const focusedFloor = focusRoomId
    ? floors.find((floor) =>
        floor.rooms.some((room) => room.id === focusRoomId),
      )
    : undefined;
  const focusedRoom = focusedFloor?.rooms.find(
    (room) => room.id === focusRoomId,
  );
  const rectangles = focusedRoom
    ? [focusedRoom.bounds]
    : floors.flatMap((floor) => [
        floor.footprint,
        ...floor.balconies.map((balcony) => balconyBounds(floor, balcony)),
      ]);
  const plot = framing === "plot" && !focusedRoom;
  const left =
    (plot ? -200 : Math.min(...rectangles.map((r) => r.x))) / 100 -
    project.plot.width / 200;
  const right =
    (plot
      ? project.plot.width + 200
      : Math.max(...rectangles.map((r) => r.x + r.w))) /
      100 -
    project.plot.width / 200;
  const back =
    (plot ? -200 : Math.min(...rectangles.map((r) => r.z))) / 100 -
    project.plot.depth / 200;
  const front =
    (plot
      ? project.plot.depth + 200
      : Math.max(...rectangles.map((r) => r.z + r.d))) /
      100 -
    project.plot.depth / 200;
  const minY = plot
    ? -0.3
    : (focusedFloor?.elevation ?? Math.min(...floors.map((f) => f.elevation))) /
      100;
  // A dollhouse has no full-height roof over the exposed floor. Framing that
  // invisible volume pushes the actual home down the phone screen.
  const topElevation =
    focusedFloor?.elevation ?? Math.max(...floors.map((f) => f.elevation));
  const maxY = cutaway
    ? topElevation / 100 + 2.05
    : (focusedFloor
        ? focusedFloor.elevation + focusedFloor.height
        : Math.max(...floors.map((f) => f.elevation + f.height))) /
        100 +
      0.75;
  const road = project.plot.road;

  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    previousZoom.current = latestZoom.current;
    const target = new Vector3(
      (left + right) / 2,
      (minY + maxY) / 2,
      (back + front) / 2,
    );
    const span = Math.max(right - left, front - back, maxY - minY, 3);
    const direction =
      cameraView === "top"
        ? new Vector3(0, 1, 0.00001)
        : cameraView === "front"
          ? new Vector3(
              road === "east" ? 1 : road === "west" ? -1 : 0,
              0.08,
              road === "south" ? 1 : road === "north" ? -1 : 0,
            )
          : new Vector3(0.75, 1.8, 1);
    camera.position
      .copy(target)
      .add(direction.normalize().multiplyScalar(span * 3));
    camera.near = 0.1;
    camera.far = Math.max(500, span * 12);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    const corners = [left, right].flatMap((x) =>
      [back, front].flatMap((z) =>
        [minY, maxY].map((y) =>
          new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse),
        ),
      ),
    );
    const projectedWidth =
      Math.max(...corners.map((p) => p.x)) -
      Math.min(...corners.map((p) => p.x));
    const projectedHeight =
      Math.max(...corners.map((p) => p.y)) -
      Math.min(...corners.map((p) => p.y));
    camera.zoom = Math.min(
      (size.width * 0.88) / Math.max(1, projectedWidth),
      (size.height * 0.88) / Math.max(1, projectedHeight),
    );
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
    invalidate();
  }, [
    camera,
    left,
    right,
    back,
    front,
    minY,
    maxY,
    road,
    cameraView,
    size.width,
    size.height,
    resetKey,
    invalidate,
  ]);

  useEffect(() => {
    const delta = zoomStep - previousZoom.current;
    previousZoom.current = zoomStep;
    if (!(camera instanceof OrthographicCamera) || !delta) return;
    camera.zoom = Math.max(
      0.5,
      Math.min(500, camera.zoom * Math.pow(1.2, delta)),
    );
    camera.updateProjectionMatrix();
    controls.current?.update();
    invalidate();
  }, [camera, zoomStep, invalidate]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      enableRotate={cameraView !== "top"}
      minZoom={0.5}
      maxZoom={500}
      minPolarAngle={0.00001}
      maxPolarAngle={Math.PI / 2.08}
    />
  );
}

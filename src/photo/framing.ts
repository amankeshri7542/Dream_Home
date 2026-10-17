// Where the photo camera stands for each framing. Unlike the live camera it
// fits the subject to the whole photo (no panels to dodge), centred.
import type { EdgeSide, Project } from "../domain/types";
import { PerspectiveCamera, Vector3 } from "three";
import { boxCorners, fitBox, type Vec3 } from "../scene/camera/fit";
import { HERO_OFFSET, HERO_POLAR, ROAD_AZIMUTH, frontPose, plotBox, roomBox, roomHeroPose, type Box, type Pose } from "../scene/camera/poses";
import type { SceneView } from "../scene/types";
import type { Framing } from "./settings";

export type Shot = { position: Vec3; target: Vec3 };
/** The live camera, for "This view": where it looks and from where. */
export type LiveCamera = { target: Vec3; azimuth: number; polar: number; distance: number };

/** A point on the sphere around `target`, in camera-controls' convention. */
export function orbitPoint(target: Vec3, azimuth: number, polar: number, distance: number): Vec3 {
  return [
    target[0] + distance * Math.sin(polar) * Math.sin(azimuth),
    target[1] + distance * Math.cos(polar),
    target[2] + distance * Math.sin(polar) * Math.cos(azimuth),
  ];
}

const DEG = Math.PI / 180;

/**
 * The aerial pose for a photo shape. Tall shapes look more steeply down and
 * more along the plot, so the home fills the frame instead of a sliver of it
 * floating in empty sky; wide shapes keep the usual hero view.
 */
export function aerialPose(road: EdgeSide, aspect: number): Pose {
  const tall = Math.min(1, Math.max(0, (1 - aspect) / (1 - 9 / 16)));
  return {
    azimuth: ROAD_AZIMUTH[road] - (HERO_OFFSET - tall * 15 * DEG),
    polar: HERO_POLAR - tall * 17 * DEG,
  };
}

export function photoShot(
  framing: Framing,
  {
    project,
    view,
    live,
    fov,
    width,
    height,
  }: { project: Project; view: SceneView; live: LiveCamera; fov: number; width: number; height: number },
): Shot {
  if (framing === "view") return { target: live.target, position: orbitPoint(live.target, live.azimuth, live.polar, live.distance) };
  const focus = view.focus;
  const room = framing === "room" && focus ? roomBox(project, view, focus.floorId, focus.roomId) : null;
  const pose =
    framing === "front"
      ? frontPose(project.plot.road)
      : room
        ? roomHeroPose({ azimuth: live.azimuth, polar: live.polar })
        : aerialPose(project.plot.road, width / height);
  // The whole plot (compound wall, garden, a strip of street), not just the
  // house: a photo of the house with its wall cut off looks like a mistake.
  return frameBox(room ?? plotBox(project, view), pose, fov, width, height);
}

/** Breathing room kept around the subject, as a fraction of the half-frame. */
const MARGIN = 0.1;

/** Where to stand, looking along `pose`, so the box fills the frame, centred. */
export function frameBox(box: Box, pose: Pose, fov: number, width: number, height: number, margin = MARGIN): Shot {
  const fit = fitBox({ min: box.min, max: box.max, azimuth: pose.azimuth, polar: pose.polar, fov, width, height, margin });
  return centre({ target: fit.target, position: fit.position }, boxCorners(box.min, box.max), fov, width / height, margin);
}

/**
 * fitBox fits around the box's middle, and perspective leaves one side of the
 * picture emptier than the other. A few passes of "look at the middle of what
 * you see, then step to fill the frame" centre the subject and fill the photo.
 */
function centre(shot: Shot, corners: Vec3[], fov: number, aspect: number, margin: number): Shot {
  const camera = new PerspectiveCamera(fov, aspect, 0.05, 5000);
  const target = new Vector3(...shot.target),
    position = new Vector3(...shot.position);
  const tanV = Math.tan((fov * Math.PI) / 360),
    tanH = tanV * aspect;
  const right = new Vector3(),
    up = new Vector3(),
    p = new Vector3();
  for (let pass = 0; pass < 6; pass++) {
    camera.position.copy(position);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const c of corners) {
      p.set(...c).project(camera);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const distance = position.distanceTo(target);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const shift = right
      .clone()
      .multiplyScalar(((minX + maxX) / 2) * distance * tanH)
      .addScaledVector(up, ((minY + maxY) / 2) * distance * tanV);
    target.add(shift);
    const fill = Math.max(maxX - minX, maxY - minY) / 2 / (1 - margin);
    position.sub(target).normalize().multiplyScalar(distance * fill).add(target);
  }
  return { target: target.toArray() as Vec3, position: position.toArray() as Vec3 };
}

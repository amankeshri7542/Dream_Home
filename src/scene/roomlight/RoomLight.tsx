// Keeps the room-light grid in step with the home and the hour. It solves only
// when one of those changes, then the scene renders no differently from any
// other material, so idle frames stay at zero. Off where the home is open from above.
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { Project } from "../../domain/types";
import type { Lighting } from "../environment/timeOfDay";
import { bridge } from "../debug/DebugBridge";
import { lightRooms, lightSky } from "./input";
import { solveLightGrid } from "./solve";
import { setRoomLight } from "./uniforms";

type Props = { project: Project; floorId: string | null; light: Lighting };

/** The hour's light changes slowly: solve every 7.5 minutes of it at most. */
const hourKey = (h: number) => Math.round(h * 8);

export function RoomLight({ project, floorId, light }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const key = floorId ? hourKey(light.hour) : -1;
  const grid = useMemo(() => {
    if (!floorId) return null;
    const started = performance.now();
    const lampsOn = light.palette.windowGlow >= 0.3;
    const { rooms, spec } = lightRooms(project, floorId, lampsOn);
    const solved = solveLightGrid(rooms, lightSky(light), spec);
    const b = bridge();
    if (b) {
      b.roomLightMs = performance.now() - started;
      b.roomLightLamps = rooms.reduce((n, r) => n + r.lamps.length, 0);
    }
    return solved;
    // The hour key stands in for the light itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, floorId, key, light.keyDir[0], light.keyDir[2]]);
  useEffect(() => {
    setRoomLight(grid);
    invalidate();
    return () => {
      setRoomLight(null);
      invalidate();
    };
  }, [grid, invalidate]);
  return null;
}

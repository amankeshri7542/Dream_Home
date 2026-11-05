// A tiny shared input channel between DOM controls (joystick, buttons) and the
// in-canvas walkthrough. Values are unit-less: forward/strafe in [-1, 1].
export const walkInput = {
  forward: 0,
  strafe: 0,
  turn: 0,
  run: false,
  /** Incremented to request a floor change: +1 up, -1 down. */
  floorRequest: 0,
  floorRequestId: 0,
  /** Set by the walkthrough: asks the on-demand render loop for a frame. */
  wake: null as (() => void) | null,
  /** Where the visitor stands (plot cm) and faces, written every frame they move. */
  position: { floorId: "", x: 0, z: 0, yaw: 0 },
  /** Called when the visitor moves (the small plan's dot); never re-renders React. */
  onMove: null as (() => void) | null,
  /** A room to go to, from the small plan: incremented id, like the floor request. */
  roomRequest: null as { floorId: string; roomId: string } | null,
  roomRequestId: 0,
  /** Set by the walkthrough on desktop: asks the browser to lock the pointer for mouse look. */
  lockPointer: null as (() => void) | null,
};
export function requestRoom(floorId: string, roomId: string) {
  walkInput.roomRequest = { floorId, roomId };
  walkInput.roomRequestId++;
  walkInput.wake?.();
}
export function requestFloor(direction: 1 | -1) {
  walkInput.floorRequest = direction;
  walkInput.floorRequestId++;
  walkInput.wake?.();
}

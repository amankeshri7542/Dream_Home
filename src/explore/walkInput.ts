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
};
export function requestFloor(direction: 1 | -1) {
  walkInput.floorRequest = direction;
  walkInput.floorRequestId++;
  walkInput.wake?.();
}

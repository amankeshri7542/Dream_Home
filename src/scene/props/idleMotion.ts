// Idle motion for furniture in Explore and Photo: ceiling fans turn and
// curtains sway. Both only rewrite instance matrices (no extra draw calls,
// no material changes): a fan turns about its hub, a curtain leans its hem
// into the room from the rod, like a drape in a breeze.
import { Matrix4, type BufferGeometry } from "three";

/** A calm turn: slow enough not to strobe at the idle frame rate. */
export const FAN_TURNS_PER_SECOND = 0.55;

/**
 * The hub of a ceiling fan (model metres, x and z): its blades are identical
 * copies turned about the hub and its canopy, rod and motor are turned
 * (lathe) parts, so the mean of all its vertices lies on the hub's axis.
 */
export function spinAxis(parts: readonly { geometry: BufferGeometry }[]): [number, number] {
  let x = 0,
    z = 0,
    n = 0;
  for (const { geometry } of parts) {
    const pos = geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      x += pos.getX(i);
      z += pos.getZ(i);
    }
    n += pos.count;
  }
  return n ? [x / n, z / n] : [0, 0];
}

const turn = new Matrix4(),
  shift = new Matrix4(),
  back = new Matrix4(),
  shear = new Matrix4();

/** A fan's matrix at time `t`: its base placement, turned about the hub. */
export function fanMatrix(base: Matrix4, hub: readonly [number, number], t: number, out: Matrix4): Matrix4 {
  const angle = (t * FAN_TURNS_PER_SECOND * Math.PI * 2) % (Math.PI * 2);
  shift.makeTranslation(hub[0], 0, hub[1]);
  back.makeTranslation(-hub[0], 0, -hub[1]);
  turn.makeRotationY(-angle);
  return out.copy(base).multiply(shift).multiply(turn).multiply(back);
}

/**
 * A curtain's matrix at time `t`: the rod (model top, `height` metres) stays
 * put while the hem drifts up to ~3 cm into the room and a little sideways.
 * Only ever toward the room (+z, the model's front), never into the wall.
 */
export function swayMatrix(base: Matrix4, height: number, t: number, phase: number, out: Matrix4): Matrix4 {
  const lean = 0.012 * (0.5 + 0.5 * Math.sin(t * 1.3 + phase));
  const drift = 0.004 * Math.sin(t * 0.9 + phase * 1.7);
  // x' = x + drift·(y − h), z' = z + lean·(h − y), y' = y.
  shear.set(1, drift, 0, -drift * height, 0, 1, 0, 0, 0, -lean, 1, lean * height, 0, 0, 0, 1);
  return out.copy(base).multiply(shear);
}

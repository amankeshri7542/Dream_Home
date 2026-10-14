// One shared section plane for every clipped material. The plane count never
// changes (no shader recompiles): when the cutaway is off it sits far above.
import { Plane, Vector3 } from "three";

export const CUT_OFF = 1e6;
/** Keeps points with y ≤ constant. */
export const cutPlane = new Plane(new Vector3(0, -1, 0), CUT_OFF);
export const CUT_PLANES = [cutPlane];

export function setCutHeight(y: number) {
  cutPlane.constant = y;
}
export const cutHeight = () => cutPlane.constant;

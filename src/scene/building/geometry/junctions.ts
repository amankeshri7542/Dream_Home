// Wall junction rules (pure). Walls are centred on their domain line; at each
// endpoint we extend or shorten the wall so the union of wall boxes has no
// overlapping volumes and no coplanar caps:
//   straight continuation          → unchanged
//   T (perpendicular passes)       → stem shortened by t_perp/2
//   + (both continue)              → x-walls unchanged, z-walls shortened by t_x/2
//   L corner (perpendicular ends)  → x-walls extend by t_z/2, z-walls shorten by t_x/2
//   free end                       → unchanged
import type { Wall } from "../../../domain/types";
import { EXTERIOR_WALL, INTERIOR_WALL } from "../../coords";

export type JunctionWall = Pick<Wall, "id" | "axis" | "x" | "z" | "length" | "exterior">;
export type EndKind = "free" | "continue" | "tee" | "cross" | "corner";
export type Adjust = { start: number; end: number; startKind: EndKind; endKind: EndKind };

export const wallThickness = (w: Pick<Wall, "exterior">) =>
  w.exterior ? EXTERIOR_WALL : INTERIOR_WALL;

const lineOf = (w: JunctionWall) => (w.axis === "x" ? w.z : w.x);
const startOf = (w: JunctionWall) => (w.axis === "x" ? w.x : w.z);

/** Per-wall end adjustments in metres (positive extends the wall). */
export function junctionAdjustments(
  walls: readonly JunctionWall[],
  thickness: (w: JunctionWall) => number = wallThickness,
): Map<string, Adjust> {
  // Index walls by axis + line for continuation, and by axis for perpendiculars.
  const byLine = new Map<string, JunctionWall[]>();
  const byAxisLine = { x: new Map<number, JunctionWall[]>(), z: new Map<number, JunctionWall[]>() };
  for (const w of walls) {
    const key = `${w.axis}:${lineOf(w)}`;
    (byLine.get(key) ?? byLine.set(key, []).get(key)!).push(w);
    const m = byAxisLine[w.axis];
    (m.get(lineOf(w)) ?? m.set(lineOf(w), []).get(lineOf(w))!).push(w);
  }
  const result = new Map<string, Adjust>();
  for (const w of walls) {
    const line = lineOf(w),
      s = startOf(w),
      e = s + w.length;
    const same = byLine.get(`${w.axis}:${line}`) ?? [];
    const perpAxis = w.axis === "x" ? "z" : "x";
    const evaluate = (at: number, isStart: boolean): { delta: number; kind: EndKind } => {
      const continuation = same.some(
        (o) => o !== w && (isStart ? startOf(o) + o.length === at : startOf(o) === at),
      );
      // Perpendicular walls whose line is at `at` and whose span touches `line`.
      const perps = byAxisLine[perpAxis].get(at) ?? [];
      let before = false,
        after = false,
        tPerp = 0;
      for (const p of perps) {
        const ps = startOf(p),
          pe = ps + p.length;
        if (pe < line || ps > line) continue;
        if (ps < line) before = true;
        if (pe > line) after = true;
        tPerp = Math.max(tPerp, thickness(p));
      }
      if (!before && !after) return { delta: 0, kind: continuation ? "continue" : "free" };
      const passes = before && after;
      if (continuation && passes)
        return { delta: w.axis === "x" ? 0 : -tPerp / 2, kind: "cross" };
      if (continuation) return { delta: 0, kind: "continue" };
      if (passes) return { delta: -tPerp / 2, kind: "tee" };
      return { delta: w.axis === "x" ? tPerp / 2 : -tPerp / 2, kind: "corner" };
    };
    const a = evaluate(s, true),
      b = evaluate(e, false);
    result.set(w.id, { start: a.delta, end: b.delta, startKind: a.kind, endKind: b.kind });
  }
  return result;
}

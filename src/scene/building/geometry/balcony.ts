// Balconies: slab with a drip lip, stone deck, and a balustrade on the three
// open edges: glass (posts, panels, top rail), an MS grille (square bars) or a
// pierced jaali screen (alpha-tested texture in the `jaali` bucket).
import { balconyBounds } from "../../../domain/core";
import type { Balcony, GeometryFloor, RailingKind } from "../../../domain/types";
import { rgb, type Buckets, type V3 } from "./QuadBuilder";
import { ownerKey, upQuad } from "./floors";

export function emitBalcony(
  floor: GeometryFloor,
  balcony: Balcony,
  base: number,
  trimHex: string,
  buckets: Buckets<string>,
  railing: RailingKind = "glass",
) {
  const r = balconyBounds(floor, balcony);
  const x0 = r.x / 100,
    x1 = (r.x + r.w) / 100,
    z0 = r.z / 100,
    z1 = (r.z + r.d) / 100;
  const slab = buckets.get("slab"),
    stone = buckets.get("stone"),
    joinery = buckets.get("joinery"),
    glass = buckets.get("glass");
  // The building-side edge.
  const attached = balcony.edge === "north" ? "z1" : balcony.edge === "south" ? "z0" : balcony.edge === "west" ? "x1" : "x0";
  slab.box([x0, base - 0.16, z0], [x1, base - 0.005, z1], rgb("#e2ddd2"));
  stone.box([x0 + 0.01, base - 0.005, z0 + 0.01], [x1 - 0.01, base + 0.012, z1 - 0.01], rgb("#d8cfbf"));
  // Drip lip under the open edges.
  const lip = rgb("#cfc9bd");
  type Edge = { id: string; a: [number, number]; b: [number, number] };
  const all: Edge[] = [
    { id: "z0", a: [x0, z0], b: [x1, z0] },
    { id: "z1", a: [x0, z1], b: [x1, z1] },
    { id: "x0", a: [x0, z0], b: [x0, z1] },
    { id: "x1", a: [x1, z0], b: [x1, z1] },
  ];
  const edges = all.filter((e) => e.id !== attached);
  for (const e of edges) {
    const horizontal = e.a[1] === e.b[1];
    const inward = e.id === "z0" || e.id === "x0" ? 1 : -1;
    if (horizontal)
      slab.box([e.a[0], base - 0.19, Math.min(e.a[1], e.a[1] + inward * 0.03)], [e.b[0], base - 0.16, Math.max(e.a[1], e.a[1] + inward * 0.03)], lip);
    else
      slab.box([Math.min(e.a[0], e.a[0] + inward * 0.03), base - 0.19, e.a[1]], [Math.max(e.a[0], e.a[0] + inward * 0.03), base - 0.16, e.b[1]], lip);
  }
  // Balustrade.
  const post = rgb("#3f3c38"),
    rail = rgb(trimHex);
  const yb = base + 0.012,
    yt = base + 1.02;
  for (const e of edges) {
    const inward = e.id === "z0" || e.id === "x0" ? 1 : -1;
    const horizontal = e.a[1] === e.b[1];
    const len = horizontal ? e.b[0] - e.a[0] : e.b[1] - e.a[1];
    const count = Math.max(1, Math.ceil(len / 1.2));
    const P = (t: number, off: number, y: number): V3 =>
      horizontal ? [e.a[0] + t, y, e.a[1] + inward * off] : [e.a[0] + inward * off, y, e.a[1] + t];
    const bx = (t0: number, t1: number, o0: number, o1: number, y0: number, y1: number, color: [number, number, number]) => {
      const p = P(t0, o0, y0),
        q = P(t1, o1, y1);
      joinery.box(
        [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])],
        [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])],
        color,
      );
    };
    if (railing === "grille") {
      // Mild-steel grille: square bars every 11 cm between two flats, with a
      // painted top rail.
      const iron = rgb("#2e2f31");
      const bars = Math.max(2, Math.round(len / 0.11));
      for (let i = 0; i <= bars; i++) {
        const t = Math.min(len - 0.01, Math.max(0.01, (i / bars) * len));
        bx(t - 0.008, t + 0.008, 0.042, 0.058, yb, yt - 0.03, iron);
      }
      for (const y of [yb + 0.1, yb + 0.72]) bx(0, len, 0.04, 0.06, y, y + 0.025, iron);
      bx(0, len, 0.03, 0.07, yt - 0.03, yt + 0.02, rail);
      continue;
    }
    if (railing === "jaali") {
      // Solid stone-coloured jaali panels between plastered piers.
      const panel = rgb("#e9dcc2");
      const jaali = buckets.get("jaali");
      for (let i = 0; i <= count; i++) {
        const t = Math.min(len - 0.05, Math.max(0.05, (i / count) * len));
        bx(t - 0.05, t + 0.05, 0.0, 0.1, yb, yt + 0.03, rail);
      }
      bx(0, len, 0.0, 0.1, yt - 0.04, yt + 0.04, rail);
      bx(0, len, 0.01, 0.09, yb, yb + 0.08, rail);
      for (let i = 0; i < count; i++) {
        const t0 = (i / count) * len + 0.05,
          t1 = ((i + 1) / count) * len - 0.05;
        const a = P(t0, 0.05, yb + 0.08),
          b = P(t1, 0.05, yb + 0.08),
          c = P(t1, 0.05, yt - 0.04),
          d = P(t0, 0.05, yt - 0.04);
        // Metre UVs so the pattern keeps its size on any balcony.
        const u0 = e.a[0] + e.a[1] + t0,
          u1 = e.a[0] + e.a[1] + t1;
        jaali.quad(a, b, c, d, panel, [
          [u0, yb + 0.08],
          [u1, yb + 0.08],
          [u1, yt - 0.04],
          [u0, yt - 0.04],
        ]);
      }
      continue;
    }
    for (let i = 0; i <= count; i++) {
      const t = Math.min(len - 0.02, Math.max(0.02, (i / count) * len));
      bx(t - 0.02, t + 0.02, 0.03, 0.07, yb, yt - 0.02, post);
    }
    bx(0, len, 0.025, 0.075, yt - 0.03, yt + 0.02, rail);
    bx(0, len, 0.035, 0.065, yb, yb + 0.05, post);
    for (let i = 0; i < count; i++) {
      const t0 = (i / count) * len + 0.03,
        t1 = ((i + 1) / count) * len - 0.03;
      const a = P(t0, 0.05, yb + 0.06),
        b = P(t1, 0.05, yb + 0.06),
        c = P(t1, 0.05, yt - 0.04),
        d = P(t0, 0.05, yt - 0.04);
      glass.quad(a, b, c, d);
    }
  }
  const hit = buckets.get("hit");
  hit.setOwner(ownerKey("balcony", balcony.id));
  upQuad(hit, x0, z0, x1, z1, base + 0.02);
  hit.setOwner(null);
}

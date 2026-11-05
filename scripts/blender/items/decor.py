"""Rugs, mats, plants, lamps and the prayer shrine."""

import math
import random

from dh import shapes as S

from . import builder
from .common import pot


@builder("rug-rect")
def rug_rect(it):
    w, d, h = it.w, it.d, it.h
    it.slab("fabric", S.rrect(w, d, 6.0, seg=2), 0.0, h * 0.55, b=0.0, cap_bottom=False)
    it.slab("fabric", S.rrect(w - 22.0, d - 22.0, 4.0, seg=1), h * 0.5, h, b=0.0, cap_bottom=False)


@builder("rug-round")
def rug_round(it):
    w, d, h = it.w, it.d, it.h
    it.slab("fabric", S.circle(w / 2, 20), 0.0, h * 0.55, b=0.0, cap_bottom=False)
    it.slab("fabric", S.circle(w / 2 - 10.0, 20, phase=math.pi / 20), h * 0.5, h, b=0.0, cap_bottom=False)


@builder("prayer-mat")
def prayer_mat(it):
    w, d, h = it.w, it.d, it.h
    it.box("fabric", -w / 2, w / 2, -d / 2, d / 2, 0.0, h * 0.6)
    # raised mihrab arch panel pointing to the back (+Y)
    panel = S.slab(S.arch(w - 14.0, d - 10.0, n_arc=7, rb=1.5, v0=-(d - 10.0) / 2), h * 0.55, h, b=0.0, cap_bottom=False)
    it.add("fabric", panel)


def _leaves(it, rng, centre, spread, count, length, width, droop, lift=0.25):
    """Single leaves round a crown, pointing out and a little up, as a real plant holds them."""
    cx, cy, cz = centre
    for _ in range(count):
        a = rng.uniform(0.0, 2.0 * math.pi)
        up = rng.uniform(-0.5, 1.0)
        ring = math.sqrt(max(0.0, 1.0 - up * up))
        bx = cx + math.cos(a) * ring * spread[0] * rng.uniform(0.45, 1.0)
        by = cy + math.sin(a) * ring * spread[0] * rng.uniform(0.45, 1.0)
        bz = cz + up * spread[1] * rng.uniform(0.55, 1.0)
        ln = length * rng.uniform(0.75, 1.2)
        tip = (bx + math.cos(a) * ring * ln, by + math.sin(a) * ring * ln, bz + (up * 0.5 + lift) * ln)
        it.add("leaf", S.leaf_sheet((bx, by, bz), tip, width * rng.uniform(0.8, 1.2), droop=droop * ln, segs=2))


@builder("plant-floor")
def plant_floor(it):
    """Potted rubber plant: a slender stem, a crown of broad single leaves."""
    w, d, h = it.w, it.d, it.h
    rng = random.Random(7)
    pot(it, "terracotta", 0.0, 0.0, 0.0, 12.0, 16.5, 34.0, rim=1.6, sides=20)
    it.tube("terracotta", [(0.0, 0.0, 30.0), (1.5, 0.5, 55.0), (-0.5, 1.0, 72.0), (0.5, 0.0, h - 30.0)], [1.7, 1.4, 1.2, 1.0], sides=8)
    _leaves(it, rng, (0.0, 0.0, h - 30.0), (11.0, 18.0), 64, 11.0, 3.4, 0.24)
    _leaves(it, rng, (0.5, 0.5, 62.0), (5.0, 12.0), 9, 10.0, 2.8, 0.2)


@builder("plant-small")
def plant_small(it):
    """A snake plant: stiff sword leaves straight up out of the pot, each a little different."""
    w, d, h = it.w, it.d, it.h
    rng = random.Random(11)
    pot(it, "terracotta", 0.0, 0.0, 0.0, 8.5, 11.5, 20.0, rim=1.2, sides=16)
    for k in range(13):
        a = k * 2.399963 + rng.uniform(-0.2, 0.2)
        r = rng.uniform(0.5, 5.5)
        bx, by = math.cos(a) * r, math.sin(a) * r
        lean = rng.uniform(0.04, 0.22)
        top = rng.uniform(h - 18.0, h - 1.0)
        tip = (bx + math.cos(a) * lean * (top - 18.0), by + math.sin(a) * lean * (top - 18.0), top)
        it.add("leaf", S.leaf_sheet((bx, by, 17.0), tip, rng.uniform(1.8, 2.8), droop=0.0, segs=3, up=(math.cos(a + 1.57), math.sin(a + 1.57), 0.0)))


@builder("floor-lamp")
def floor_lamp(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    it.cyl("metal", 0.0, 0.0, 0.0, 2.4, 15.0, sides=28, b=0.5)
    it.cyl("metal", 0.0, 0.0, 2.0, h - 30.0, 1.2, sides=12, b=0.0)
    z0, z1 = h - 40.0, h
    # drum shade: shell (accent) with a glowing liner and bulb
    it.lathe("accent", [(r, z0), (r * 0.7, z1), (r * 0.7 - 1.0, z1), (r - 1.0, z0)], 32, closed=True)
    liner = S.lathe([(r - 1.2, z0 + 0.4), (r * 0.7 - 1.2, z1 - 0.4)], 32)
    liner.flip()
    it.add("glow", liner)
    it.sphere("glow", 0.0, 0.0, z0 + 12.0, 5.0, sides=8, rings=5)
    # top diffuser disc so the glow reads from above
    it.cyl("glow", 0.0, 0.0, z1 - 6.0, z1 - 5.4, r * 0.7 - 1.5, sides=32, b=0.0)


@builder("pendant-light")
def pendant_light(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    shade_h = 24.0
    # ceiling canopy and cord
    it.cyl("metal", 0.0, 0.0, h - 2.2, h, 7.0, sides=10, b=0.0)
    it.cyl("metal", 0.0, 0.0, shade_h - 1.0, h - 2.0, 0.45, sides=6, b=0.0)
    # dome shade: outer (accent), rim, glowing inside
    outer = [(r, 0.0), (r * 0.9, shade_h * 0.45), (r * 0.55, shade_h * 0.86), (2.6, shade_h), (0.0, shade_h)]
    it.lathe("accent", outer, 28)
    it.lathe("accent", [(r - 1.4, 0.0), (r, 0.0)], 28)
    inner = S.lathe([(r - 1.4, 0.0), (r * 0.9 - 1.4, shade_h * 0.45 - 0.6), (r * 0.55 - 1.2, shade_h * 0.86 - 1.2), (0.0, shade_h - 1.4)], 12)
    inner.flip()
    it.add("glow", inner)
    it.sphere("glow", 0.0, 0.0, shade_h * 0.36, 5.0, sides=8, rings=5)


@builder("prayer-shrine")
def prayer_shrine(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # stepped platform
    it.rbox("wood", -hw, hw, -hd, hd, 0.0, 12.0, r=2.2)
    it.rbox("wood", -hw + 9.0, hw - 9.0, -hd + 9.0, hd, 12.0, 22.0, r=2.0)
    # little arched shrine
    sw, sh = 40.0, 58.0
    y0 = hd - 16.0
    it.slab("wood", S.arch(sw, sh, n_arc=6, rb=2.0, v0=22.0), y0, hd, b=1.6, seg=1, axis="Y")
    it.slab("wood", S.arch(sw + 2.0, sh + 1.0, n_arc=6, rb=2.0, v0=21.5), y0 - 2.5, y0 + 0.4, b=0.0, axis="Y", hole=S.arch(sw - 9.0, sh - 9.0, n_arc=6, rb=1.0, v0=26.0))
    it.slab("terracotta", S.arch(sw - 8.6, sh - 8.6, n_arc=6, rb=1.0, v0=25.8), y0 - 0.4, y0 + 0.2, b=0.0, axis="Y", cap_bottom=False)
    # finial on the arch
    top = 22.0 + sh + 1.0
    it.lathe("wood", [(0.0, top - 1.0), (3.6, top - 1.0), (3.0, top + 2.5), (1.4, top + 5.0), (0.0, h)], 8, sharp=(1,))
    # diya oil lamp with a glowing flame, plus two little pots
    ly = -hd + 13.0
    it.lathe("terracotta", [(0.0, 22.0), (3.0, 22.0), (5.6, 24.4), (5.0, 25.0), (0.0, 24.0)], 8, sharp=(1, 3), cy=ly)
    it.lathe("glow", [(0.0, 24.0), (1.5, 25.6), (1.0, 28.0), (0.0, 30.5)], 8, cy=ly)
    for sx in (-1, 1):
        it.lathe("terracotta", [(0.0, 12.0), (3.0, 12.0), (4.2, 15.5), (2.6, 19.0), (3.2, 20.0), (0.0, 20.0)], 6, sharp=(1, 4), cx=sx * (hw - 5.0), cy=-hd + 5.0)

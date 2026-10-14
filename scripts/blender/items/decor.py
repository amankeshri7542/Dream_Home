"""Rugs, mats, plants, lamps and the prayer shrine."""

import math

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


@builder("plant-floor")
def plant_floor(it):
    """Potted standard tree (ficus-style): slender stem rising out of a
    terracotta pot into a lush, rounded leafy crown."""
    w, d, h = it.w, it.d, it.h
    pot(it, "terracotta", 0.0, 0.0, 0.0, 12.0, 16.5, 34.0, rim=1.6, sides=11)
    it.tube("terracotta", [(0.0, 0.0, 30.0), (1.5, 0.5, 55.0), (-0.5, 1.0, 72.0), (0.5, 0.0, 86.0)], [1.9, 1.6, 1.4, 1.2], sides=6)
    crown = [
        (0.0, 0.0, h - 21.0, 15.5, 14.0),
        (-11.0, 5.0, h - 30.0, 12.0, 11.0),
        (11.0, -4.0, h - 31.0, 12.0, 11.0),
        (3.0, 11.0, h - 34.0, 11.0, 10.0),
        (-3.0, -11.0, h - 35.0, 11.0, 10.0),
        (4.0, 2.0, h - 12.5, 11.0, 9.5),
    ]
    for (x, y, z, r, rz) in crown:
        it.blob("leaf", x, y, z, r, r, rz, subdiv=1, jitter=0.08)
    # a couple of little sprigs on the stem and at the soil
    it.blob("leaf", 4.0, -1.0, 62.0, 6.0, 5.5, 5.0, subdiv=0, jitter=0.05)
    it.blob("leaf", -3.5, 1.5, 50.0, 5.0, 5.0, 4.5, subdiv=0, jitter=0.05)
    it.blob("leaf", 6.0, 6.0, 33.5, 6.5, 6.0, 4.0, subdiv=0, jitter=0.05)


@builder("plant-small")
def plant_small(it):
    w, d, h = it.w, it.d, it.h
    pot(it, "terracotta", 0.0, 0.0, 0.0, 8.5, 11.5, 20.0, rim=1.2, sides=8)
    it.blob("leaf", -2.5, 1.5, h - 15.0, 11.0, 10.5, 11.0, subdiv=1, jitter=0.07)
    it.blob("leaf", 5.0, -3.5, h - 24.0, 8.5, 8.5, 7.5, subdiv=1, jitter=0.07)
    it.blob("leaf", -6.5, -5.0, h - 26.0, 5.5, 5.5, 5.0, subdiv=0, jitter=0.05)


@builder("floor-lamp")
def floor_lamp(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    it.cyl("metal", 0.0, 0.0, 0.0, 2.4, 15.0, sides=14, b=0.0)
    it.cyl("metal", 0.0, 0.0, 2.0, h - 30.0, 1.2, sides=8, b=0.0)
    z0, z1 = h - 40.0, h
    # drum shade: shell (accent) with a glowing liner and bulb
    it.lathe("accent", [(r, z0), (r * 0.7, z1), (r * 0.7 - 1.0, z1), (r - 1.0, z0)], 16, closed=True)
    liner = S.lathe([(r - 1.2, z0 + 0.4), (r * 0.7 - 1.2, z1 - 0.4)], 16)
    liner.flip()
    it.add("glow", liner)
    it.sphere("glow", 0.0, 0.0, z0 + 12.0, 5.0, sides=8, rings=5)
    # top diffuser disc so the glow reads from above
    it.cyl("glow", 0.0, 0.0, z1 - 6.0, z1 - 5.4, r * 0.7 - 1.5, sides=16, b=0.0)


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
    it.lathe("accent", outer, 12)
    it.lathe("accent", [(r - 1.4, 0.0), (r, 0.0)], 12)
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

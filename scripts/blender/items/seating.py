"""Sofas, armchair and chairs."""

import math

from dh import shapes as S

from . import builder
from .common import cushion, leg, legs4, wrinkle


def _sofa(it, n, arm_w):
    """A tailored sofa: slim track arms, a low firm back, box cushions with a
    soft crown and visible gaps. Soft, not inflated."""
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    leg_h = 14.0
    seat_z0, seat_z1 = 34.0, 45.0
    arm_top = 60.0
    # tapered dark-wood legs on a slim rail
    legs4(it, "wood_dark", hw - 6, hd - 6, 0.0, leg_h + 1.0, r0=2.5, r1=1.3, sides=10)
    it.cbox("fabric", -hw + 1.0, hw - 1.0, -hd + 2.0, hd - 2.0, leg_h, seat_z0 + 1.0, r=1.6)
    # arms: upright with a softly rounded top edge
    for s in (-1, 1):
        x0, x1 = sorted((s * hw, s * (hw - arm_w)))
        it.rbox("fabric", x0, x1, -hd + 1.0, hd, leg_h, arm_top, r=min(4.2, arm_w * 0.3), seg=4)
    # back frame
    it.rbox("fabric", -hw + arm_w - 2, hw - arm_w + 2, hd - 13, hd, leg_h, h - 8, r=3.4, seg=4)
    sx0, sx1 = -hw + arm_w, hw - arm_w
    cw = (sx1 - sx0) / n
    for k in range(n):
        a, b = sx0 + k * cw + 0.45, sx0 + (k + 1) * cw - 0.45
        # seat cushion: a box with a crown, a touch proud of the front
        # Lived-in, not showroom: each cushion sits a touch differently.
        jx = math.sin(k * 2.7 + n) * 0.5
        seat = S.rbox(a + jx, b + jx, -hd + 0.4, hd - 19, seat_z0, seat_z1 + math.cos(k * 1.9) * 0.4, r=2.6, seg=2, div=(4, 4, 1), puff=(0.2, 0.3, 1.1))
        it.add("fabric", wrinkle(seat, 0.18, seed=k * 2.1 + 0.4))
        # back cushion, leaning back, with a little give in the middle
        back = S.rbox(a + 0.3, b - 0.3, hd - 28, hd - 13, seat_z1 - 2, h - 2.0, r=3.2, seg=2, div=(4, 1, 4), puff=(0.3, 1.5, 0.4))
        back.rot("X", -7.0 - math.sin(k * 3.1 + n) * 1.6, ((a + b) / 2, hd - 18, seat_z1 - 2))
        back.rot("Z", math.sin(k * 1.7 + 0.5) * 1.2, ((a + b) / 2, hd - 18, seat_z1 - 2))
        it.add("fabric", wrinkle(back, 0.12, seed=k * 1.3 + 2.2))


@builder("sofa-3")
def sofa3(it):
    _sofa(it, 3, 15.0)


@builder("sofa-2")
def sofa2(it):
    _sofa(it, 2, 15.0)


@builder("armchair")
def armchair(it):
    _sofa(it, 1, 12.0)


@builder("dining-chair")
def dining_chair(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    seat_z = 46.0
    # chunky rounded seat
    it.rbox("wood", -hw, hw, -hd, hd - 4, seat_z - 4.5, seat_z, r=2.2)
    # front legs
    for sx in (-1, 1):
        leg(it, "wood", sx * (hw - 4), -hd + 4.5, 0.0, seat_z - 4, r0=2.1, r1=1.6)
    # rear legs continue up as gently raked back posts
    for sx in (-1, 1):
        x = sx * (hw - 4)
        it.tube("wood", [(x, hd - 5.0, 0.0), (x, hd - 4.5, seat_z - 4), (x, hd - 3.0, 70.0), (x, hd - 2.1, h - 1.0)], [1.7, 2.0, 1.9, 1.8], sides=8)
    # curved back rest hugging the sitter
    back = S.slab(S.rrect(w - 2.0, 15.0, 4.0, seg=2, cv=h - 9.0, edge_div=(4, 0)), hd - 4.6, hd - 1.6, b=1.0, seg=1, axis="Y")
    back.bend_z(40.0, hd - 3.1)
    it.add("wood", back)


@builder("office-chair")
def office_chair(it):
    w, d, h = it.w, it.d, it.h
    hw = w / 2
    # five-star base with casters
    arm_r = hw - 3.6
    for k in range(5):
        a = math.radians(90 + 72 * k)
        ex, ey = arm_r * math.cos(a), arm_r * math.sin(a)
        it.tube("metal", [(0.0, 0.0, 9.0), (ex, ey, 6.5)], [2.4, 1.5], sides=6)
        cyl = S.cyl(0.0, 0.0, -2.0, 2.0, 3.4, sides=6, b=0.0)
        cyl.rot("Y", 90)
        cyl.rot("Z", math.degrees(a))
        cyl.move(ex, ey, 3.4)
        it.add("rubber", cyl)
    # gas column
    it.cyl("metal", 0.0, 0.0, 7.0, 43.0, 2.6, sides=10, b=0.0)
    # seat pan + plump seat
    it.cbox("rubber", -21.0, 21.0, -20.0, 20.0, 40.5, 44.0, r=1.2)
    cushion(it, "fabric", -hw + 3, hw - 3, -hw + 4, hw - 7, 43.0, 53.0, r=5.0, puff=(0.6, 0.8, 1.8), div=(2, 2, 1))
    # back support stem
    it.cbox("rubber", -3.0, 3.0, hw - 9.0, hw - 5.5, 42.0, 62.0, r=1.0)
    # curved back cushion, leaning back
    back = S.rbox(-hw + 6, hw - 6, hw - 12.0, hw - 4.0, 57.0, h, r=5.0, div=(2, 1, 2), puff=(0.5, 1.8, 0.6))
    back.rot("X", -9.0, (0.0, hw - 8.0, 57.0))
    it.add("fabric", back)

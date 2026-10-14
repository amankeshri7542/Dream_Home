"""Tables and desk."""

from dh import shapes as S

from . import builder
from .common import bowl, leg, plate


def _splayed_legs(it, slot, x, y, z1, r0=2.4, r1=1.6, splay=5.0, sides=8):
    for sx in (-1, 1):
        for sy in (-1, 1):
            g = S.lathe([(0.0, 0.0), (r1, 0.0), (r0, z1), (0.0, z1)], sides, sharp=(1, 2))
            g.rot("Y", -sx * splay, (0, 0, z1)).rot("X", sy * splay, (0, 0, z1))
            g.move(sx * x, sy * y, 0.0)
            it.add(slot, g)


@builder("coffee-table")
def coffee_table(it):
    w, d, h = it.w, it.d, it.h
    top_z1 = h - 3.0
    it.slab("wood", S.rrect(w, d, 16.0, seg=3), top_z1 - 5.0, top_z1, b=2.2, seg=2)
    _splayed_legs(it, "wood", w / 2 - 13.0, d / 2 - 11.0, top_z1 - 4.5, r0=2.6, r1=1.8, splay=6.0)
    book = S.cbox(-13.0, 13.0, -9.0, 9.0, top_z1, h, r=0.7)
    book.rot("Z", 14.0).move(w * 0.16, -2.0, 0.0)
    it.add("linen", book)


@builder("side-table")
def side_table(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    it.slab("wood", S.circle(r, 16), h - 4.0, h, b=1.6, seg=2)
    prof = [(0.0, 0.0), (r * 0.62, 0.0), (r * 0.62, 1.8), (r * 0.2, 4.5), (3.0, 14.0), (3.4, h - 10.0), (6.5, h - 4.5), (0.0, h - 4.0)]
    it.lathe("wood", prof, 9, sharp=(1, 2))


@builder("dining-table")
def dining_table(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    top = h - 4.0
    it.slab("wood", S.rrect(w, d, 12.0, seg=3), top - 4.2, top, b=1.8, seg=2)
    _splayed_legs(it, "wood", hw - 12.0, hd - 10.0, top - 3.8, r0=2.9, r1=2.0, splay=3.0)
    for sx in (-1, 1):
        plate(it, "ceramic", sx * hw * 0.45, -hd * 0.38, top, r=13.5, sides=12)
    bowl(it, "terracotta", 0.0, 6.0, top, r=15.0, h=4.0, sides=12)


@builder("dining-table-round")
def dining_table_round(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    it.slab("wood", S.circle(r, 22), h - 4.5, h, b=2.0, seg=2)
    prof = [(0.0, 0.0), (r * 0.42, 0.0), (r * 0.42, 2.4), (r * 0.12, 6.5), (5.2, 18.0), (5.6, h - 18.0), (10.0, h - 8.0), (14.0, h - 4.5), (0.0, h - 4.5)]
    it.lathe("wood", prof, 12, sharp=(1, 2, 7))


@builder("desk")
def desk(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    top = h - 1.6
    it.slab("wood", S.rrect(w, d, 5.0, seg=2), top - 3.4, top, b=1.4, seg=2)
    for sx, sy in ((-1, -1), (-1, 1)):
        leg(it, "wood", sx * (hw - 5.0), sy * (hd - 5.0), 0.0, top - 3.0, r0=2.4, r1=1.8)
    # drawer pedestal on the right
    it.rbox("wood", hw - 36.0, hw - 1.0, -hd + 2.5, hd - 1.0, 0.0, top - 3.2, r=2.0)
    for z0, z1 in ((top - 20.0, top - 5.0), (4.0, top - 21.5)):
        it.cbox("wood", hw - 34.5, hw - 2.5, -hd + 0.6, -hd + 2.8, z0, z1, r=0.9)
        it.cbox("wood", hw - 24.0, hw - 13.0, -hd, -hd + 0.8, z1 - 3.4, z1 - 1.8, r=0.5)
    # closed laptop and a linen notebook
    lap = S.cbox(-16.0, 16.0, -11.0, 11.0, top, h, r=0.6)
    lap.rot("Z", -8.0).move(-14.0, -3.0, 0.0)
    it.add("rubber", lap)
    pad = S.cbox(-7.5, 7.5, -10.0, 10.0, top, top + 0.8, r=0.4)
    pad.rot("Z", 16.0).move(18.0, -6.0, 0.0)
    it.add("linen", pad)

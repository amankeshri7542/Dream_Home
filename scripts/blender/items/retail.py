"""Shop display bay and counter."""

from dh import shapes as S

from . import builder


@builder("display-shelf-module")
def display_shelf_module(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    t = 2.6
    # side posts are half-thickness at each edge so tiled bays share a post
    for sx in (-1, 1):
        x0, x1 = sorted((sx * hw, sx * (hw - t)))
        it.box("wood", x0, x1, -hd, hd, 0.0, h - 3.0)
    it.box("wood", -hw + t, hw - t, -hd + 3.0, hd - 1.0, 0.0, 9.0)
    it.box("wood", -hw + t, hw - t, hd - 1.2, hd, 9.0, h - 4.0)
    for z in (52.0, 94.0, 136.0):
        it.box("wood", -hw + t, hw - t, -hd + 0.6, hd - 1.0, z - 2.4, z)
    it.box("wood", -hw + t, hw - t, -hd + 0.6, hd - 1.0, 8.0, 10.4)
    it.cbox("wood", -hw, hw, -hd, hd, h - 4.0, h, r=1.2)
    rng = it.rng
    # level 1: two chunky storage boxes
    it.cbox("accent", -hw + 4.0, -1.5, -hd + 5.0, hd - 5.0, 10.4, 30.0, r=1.8)
    it.cbox("linen", 1.5, hw - 4.0, -hd + 6.0, hd - 6.0, 10.4, 26.0, r=1.8)
    # level 2: terracotta pots
    for k, x in enumerate((-16.0, -2.0, 12.0)):
        r = 5.5 + (k % 2) * 1.2
        it.lathe("terracotta", [(0.0, 52.0), (r * 0.75, 52.0), (r, 52.0 + r * 2.0), (r * 0.82, 52.0 + r * 2.2), (0.0, 52.0 + r * 2.1)], 6, sharp=(1, 2), cx=x, cy=-2.0)
    it.box("accent", 19.5, 25.0, -hd + 8.0, hd - 8.0, 52.0, 71.0)
    # level 3: folded linen + a fat accent jar
    for k in range(2):
        it.cbox("linen", -hw + 5.0, -1.0, -hd + 7.0, hd - 7.0, 94.0 + k * 5.0, 94.0 + (k + 1) * 5.0 - 0.2, r=1.8)
    it.cyl("accent", 13.0, -2.0, 94.0, 110.0, 6.5, sides=6, b=0.0)
    # level 4: a few books and a vase
    x = -hw + 5.0
    for k in range(4):
        tw = rng.uniform(4.6, 6.0)
        hh = rng.uniform(19.0, 26.0)
        it.box("accent" if k % 2 == 0 else "linen", x, x + tw - 0.3, -hd + 6.0, hd - 4.0, 136.0, 136.0 + hh)
        x += tw
    it.lathe("terracotta", [(0.0, 136.0), (5.0, 136.0), (6.5, 144.0), (3.5, 152.0), (0.0, 153.0)], 6, sharp=(1,), cx=15.0, cy=-1.0)


@builder("shop-counter")
def shop_counter(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    top = 86.0
    it.box("rubber", -hw + 3.0, hw - 3.0, -hd + 5.0, hd - 3.0, 0.0, 8.0)
    it.rbox("accent", -hw + 1.0, hw - 1.0, -hd + 3.0, hd, 7.5, top - 3.5, r=2.5)
    # fluted front
    n = 5
    span = w - 14.0
    for k in range(n):
        x = -span / 2 + (k + 0.5) * span / n
        it.cbox("accent", x - span / n / 2 + 0.8, x + span / n / 2 - 0.8, -hd + 1.2, -hd + 3.4, 12.0, top - 7.0, r=2.4)
    it.rbox("stone", -hw, hw, -hd, hd, top - 3.5, top, r=1.6)
    # little till: drawer base, slanted keypad, display on a stalk
    tx, ty = hw - 32.0, 4.0
    it.box("rubber", tx - 15.0, tx + 15.0, ty - 12.0, ty + 12.0, top, top + 6.0)
    key = S.cbox(tx - 12.0, tx + 12.0, ty - 9.0, ty + 7.0, top + 5.0, top + 9.0, r=1.0)
    key.rot("X", 12.0, (tx, ty, top + 6.0))
    it.add("accent", key)
    it.cyl("rubber", tx, ty + 8.0, top + 6.0, h - 6.0, 1.2, sides=6, b=0.0)
    disp = S.cbox(tx - 8.0, tx + 8.0, ty + 6.0, ty + 10.0, h - 7.0, h, r=0.9)
    disp.rot("X", -14.0, (tx, ty + 8.0, h - 6.0))
    it.add("rubber", disp)

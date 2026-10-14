"""Wardrobe, dresser, bookshelf, media unit."""

from dh import shapes as S

from . import builder
from .common import bar_handle, book_row, legs4


@builder("wardrobe")
def wardrobe(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # Scandinavian wardrobe on short tapered legs
    legs4(it, "wood", hw - 7.0, hd - 7.0, 0.0, 13.0, r0=3.0, r1=2.2)
    it.rbox("wood", -hw + 1.0, hw - 1.0, -hd + 4.0, hd, 12.0, h - 6.0, r=3.0)
    # soft cornice cap
    it.rbox("wood", -hw, hw, -hd + 1.0, hd, h - 7.0, h, r=3.0)
    for x0, x1 in ((-hw + 2.0, -0.4), (0.4, hw - 2.0)):
        it.cbox("wood", x0, x1, -hd + 2.4, -hd + 4.4, 14.5, h - 9.0, r=1.2)
        # raised, rounded door panels (upper and lower)
        it.cbox("wood", x0 + 6.0, x1 - 6.0, -hd + 1.6, -hd + 2.6, 112.0, h - 22.0, r=1.4)
        it.cbox("wood", x0 + 6.0, x1 - 6.0, -hd + 1.6, -hd + 2.6, 28.0, 98.0, r=1.4)
    for sx in (-1, 1):
        bar_handle(it, "metal", sx * 3.4, 90.0, -hd + 1.6, 120.0, t=1.6, stand=0.0, vertical=True)


@builder("dresser")
def dresser(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    legs4(it, "wood", hw - 6.0, hd - 7.0, 0.0, 12.0, r0=2.4, r1=1.7)
    it.rbox("wood", -hw, hw, -hd + 4.0, hd, 11.0, h, r=3.0)
    top = h - 3.5
    bottom = 14.0
    gap = 1.2
    hh = (top - bottom - 2 * gap) / 3
    for k in range(3):
        z0 = bottom + k * (hh + gap)
        it.cbox("wood", -hw + 3.0, hw - 3.0, -hd + 2.0, -hd + 4.4, z0, z0 + hh, r=1.1)
        for sx in (-1, 1):
            g = S.cyl(0.0, 0.0, 0.0, 2.0, 1.8, sides=8, b=0.0)
            g.rot("X", 90).move(sx * hw * 0.5, -hd + 2.0, z0 + hh / 2)
            it.add("metal", g)


@builder("bookshelf")
def bookshelf(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    t = 2.8
    # frame
    for sx in (-1, 1):
        it.cbox("wood", sx * hw - (t if sx > 0 else 0), sx * hw + (0 if sx > 0 else t), -hd, hd, 0.0, h - 2.0, r=0.9)
    it.rbox("wood", -hw, hw, -hd, hd, h - 3.5, h, r=1.5)
    it.box("wood", -hw + t, hw - t, -hd + 2.0, hd - 2.0, 0.0, 8.0)
    it.box("wood", -hw + t, hw - t, hd - 1.2, hd, 8.0, h - 3.0)
    shelf_z = [8.0, 52.0, 94.0, 136.0]
    for z in shelf_z[1:]:
        it.cbox("wood", -hw + t - 0.2, hw - t + 0.2, -hd + 0.5, hd - 1.0, z - 2.4, z, r=0.8)
    it.cbox("wood", -hw + t - 0.2, hw - t + 0.2, -hd + 0.5, hd - 1.0, 8.0, 10.4, r=0.8)
    rng = it.rng
    pal = ["accent", "linen", "accent", "accent", "linen"]
    x_in0, x_in1 = -hw + t + 0.6, hw - t - 0.6
    # shelf 1: full row of tall books
    book_row(it, pal, x_in0, x_in1 - 18.0, -hd + 3.0, hd - 2.0, 10.4, 26.0, 33.0, rng, tmin=4.6, tmax=6.4)
    # a little stack lying flat
    for k in range(3):
        it.box(pal[k + 1], x_in1 - 16.0 + k * 0.6, x_in1 - 1.5 - k * 0.5, -hd + 5.0, hd - 4.0, 10.4 + k * 3.2, 10.4 + (k + 1) * 3.2 - 0.1)
    # shelf 2: half books + a leaning one + gap
    x = book_row(it, pal[1:], x_in0 + 4.0, 10.0, -hd + 3.0, hd - 2.0, 52.0, 24.0, 32.0, rng, tmin=4.6, tmax=6.2)
    lean = S.box(0.0, 3.4, -hd + 4.0, hd - 3.0, 0.0, 29.0)
    lean.rot("Y", 16.0, (3.4, 0.0, 0.0)).move(x + 1.0, 0.0, 52.0)
    it.add("accent", lean)
    # shelf 3: books on the right, stack on the left
    book_row(it, pal[2:] + pal[:2], x_in0 + 26.0, x_in1, -hd + 3.0, hd - 2.0, 94.0, 25.0, 33.0, rng, tmin=4.8, tmax=6.6)
    for k in range(2):
        it.box(pal[k], x_in0 + 2.0 + k * 0.8, x_in0 + 20.0 - k * 0.6, -hd + 5.0, hd - 4.0, 94.0 + k * 3.5, 94.0 + (k + 1) * 3.5 - 0.1)
    # shelf 4: a few books
    book_row(it, pal, x_in0 + 8.0, x_in0 + 46.0, -hd + 3.0, hd - 2.0, 136.0, 22.0, 30.0, rng, tmin=4.8, tmax=6.6)


@builder("media-unit")
def media_unit(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    con_top = 50.0
    legs4(it, "wood", hw - 10.0, hd - 9.0, 0.0, 12.0, r0=2.6, r1=1.8)
    it.rbox("wood", -hw, hw, -hd + 3.0, hd, 11.0, con_top, r=3.0)
    n = 3
    fw = (w - 5.0) / n
    for k in range(n):
        x0 = -hw + 2.5 + k * fw + 0.4
        it.cbox("wood", x0, x0 + fw - 0.8, -hd + 0.8, -hd + 3.2, 14.0, con_top - 3.0, r=1.0)
    # TV on a small foot
    tv_w = 124.0
    it.cbox("rubber", -14.0, 14.0, -6.0, 8.0, con_top, con_top + 1.6, r=0.6)
    it.cbox("rubber", -3.0, 3.0, 0.5, 4.0, con_top + 1.0, con_top + 8.0, r=0.6)
    it.rbox("rubber", -tv_w / 2, tv_w / 2, -1.5, 3.5, con_top + 5.5, h, r=1.6)
    # cartoon screen glare: two diagonal glass streaks on the dark screen
    z0, z1 = con_top + 9.0, h - 3.5
    for (xa, wa) in ((-38.0, 16.0), (-14.0, 6.0)):
        def streak(inset, xa=xa, wa=wa):
            sk = (z1 - z0) * 0.55
            return [(xa, z0), (xa + wa, z0), (xa + wa + sk, z1), (xa + sk, z1)]
        it.add("glass", S.panel(streak, -1.62, axis="Y", facing=-1.0))

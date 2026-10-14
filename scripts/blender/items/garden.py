"""Garden items, fence modules, pool ladder, cloud and thumbnail-only
procedural stand-ins (pool, path, patio)."""

import math

from mathutils import Vector

from dh import shapes as S

from . import builder, procedural


@builder("shrub")
def shrub(it):
    w, d, h = it.w, it.d, it.h
    lumps = [
        (0.0, 4.0, h * 0.5, w * 0.34, h * 0.42),
        (-w * 0.2, -w * 0.12, h * 0.36, w * 0.27, h * 0.34),
        (w * 0.21, -w * 0.08, h * 0.38, w * 0.26, h * 0.34),
        (w * 0.05, w * 0.22, h * 0.36, w * 0.25, h * 0.32),
        (-w * 0.04, -w * 0.06, h * 0.72, w * 0.24, h * 0.27),
    ]
    for (x, y, z, r, rz) in lumps:
        it.blob("leaf", x, y, z, r, r, rz, subdiv=1, jitter=0.06, flat_bottom=z * 0.92)
    for k in range(4):
        a = math.tau * k / 4 + 0.5
        it.blob("leaf", math.cos(a) * w * 0.36, math.sin(a) * w * 0.34, h * 0.14, w * 0.12, w * 0.12, h * 0.13, subdiv=0, jitter=0.04, flat_bottom=h * 0.12)


@builder("planter")
def planter(it):
    w, d, h = it.w, it.d, it.h

    def sq(s, r, z):
        return S.ring_pts(S.rrect(s, s, r, seg=2), z)

    body_h = 42.0
    it.add("terracotta", S.loft([sq(w - 10.0, 5.0, 0.0), sq(w - 4.0, 7.0, body_h - 7.0), sq(w, 8.0, body_h - 6.0), sq(w, 8.0, body_h), sq(w - 8.0, 5.0, body_h), sq(w - 9.0, 4.5, body_h - 3.0)]))
    it.blob("leaf", 0.0, 0.0, body_h + (h - body_h) * 0.45, w * 0.44, w * 0.44, (h - body_h) * 0.58, subdiv=2, jitter=0.06)


@builder("rock")
def rock(it):
    w, d, h = it.w, it.d, it.h
    it.blob("stone", -4.0, 2.0, h * 0.42, w * 0.42, d * 0.44, h * 0.6, subdiv=1, jitter=0.16, flat_bottom=h * 0.36, normals=None)
    it.blob("stone", w * 0.36, -d * 0.24, 6.0, 9.0, 8.0, 7.0, subdiv=0, jitter=0.1, flat_bottom=5.0, normals=None)


@builder("flowerbed-module")
def flowerbed_module(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    rng = it.rng
    # timber edging front and back (runs straight through so modules tile)
    for sy in (-1, 1):
        y0, y1 = sorted((sy * hd, sy * (hd - 5.0)))
        it.cbox("bark", -hw, hw, y0, y1, 0.0, 13.0, r=1.4)
    it.box("bark", -hw, hw, -hd + 4.0, hd - 4.0, 0.0, 9.5)
    mounds = [(-34.0, -6.0, 15.0, 13.0), (-8.0, 6.0, 15.0, 19.0), (18.0, -5.0, 14.0, 15.0), (36.0, 7.0, 13.5, 12.0)]
    for (x, y, rx, rz) in mounds:
        it.blob("leaf", x, y, 9.0 + rz * 0.35, rx, 16.0, rz, subdiv=1, jitter=0.08, flat_bottom=rz * 0.3)
    flowers = 0
    for (x, y, rx, rz) in mounds:
        for k in range(3 if rz > 14 else 3):
            a = rng.uniform(0, math.tau)
            fx = max(-hw + 6.0, min(hw - 6.0, x + math.cos(a) * rx * 0.5))
            fy = y + math.sin(a) * 9.0
            fz = 9.0 + rz * 0.35 + rz * 0.75 * rng.uniform(0.8, 1.0)
            it.blob("accent", fx, fy, fz, 6.2, 6.2, 5.4, subdiv=0, jitter=0.05)
            flowers += 1


@builder("hedge-module")
def hedge_module(it):
    """Living hedge: two plump leafy lumps per module over a hidden core.
    Lumps are clipped flat at x = +-w/2 so neighbouring modules fuse into a
    continuous, gently scalloped hedge (cut faces coincide and hide)."""
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    it.box("leaf", -hw, hw, -hd + 9.0, hd - 9.0, 0.0, h * 0.4)
    for k, cx in enumerate((-hw / 2, hw / 2)):
        g = S.blob(cx, 0.0, h * 0.45, hw * 0.95, hd, h * 0.58, subdiv=1, jitter=0.04, rng=it.rng, flat_bottom=h * 0.45)
        for i, p in enumerate(g.v):
            if abs(p.x) > hw:
                p.x = math.copysign(hw, p.x)
                g.n[i] = Vector((0.0, g.n[i].y, g.n[i].z)).normalized() if g.n[i] is not None else None
        it.add("leaf", g)


@builder("bench")
def bench(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    seat = 43.0
    for sx in (-1, 1):
        x = sx * (hw - 9.0)
        it.tube("metal", [(x, -hd + 6.0, 0.0), (x, -hd + 7.5, 22.0), (x, -hd + 9.0, seat - 2.0), (x, 0.0, seat - 1.0), (x, hd - 13.0, seat - 2.0), (x, hd - 9.0, 22.0), (x, hd - 7.0, 0.0)], 1.8, sides=6)
        it.tube("metal", [(x, hd - 13.0, seat - 2.0), (x, hd - 6.5, 62.0), (x, hd - 2.0, h - 2.0)], 1.8, sides=6)
        it.tube("metal", [(x, -hd + 9.0, seat - 2.0), (x, -hd + 8.0, 60.0)], 1.6, sides=6)
        it.cbox("wood", x - 3.2, x + 3.2, -hd + 2.0, hd - 12.0, 60.0, 63.5, r=1.2)
    for k in range(3):
        y0 = -hd + 2.0 + k * 14.0
        it.cbox("wood", -hw, hw, y0, y0 + 11.5, seat, seat + 3.5, r=1.3)
    for k in range(2):
        g = S.cbox(-hw + 3.0, hw - 3.0, -1.6, 1.6, 0.0, 11.0, r=1.2)
        g.rot("X", -14.0).move(0.0, hd - 9.5 + k * 3.0, 52.0 + k * 15.0)
        it.add("wood", g)


@builder("sun-lounger")
def sun_lounger(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    for sx in (-1, 1):
        x0, x1 = sorted((sx * hw, sx * (hw - 4.5)))
        it.cbox("wood", x0, x1, -hd, hd - 2.0, 12.0, 20.0, r=1.4)
        for y in (-hd + 8.0, hd - 14.0):
            it.box("wood", x0 + 0.5, x1 - 0.5, y - 2.5, y + 2.5, 0.0, 14.0)
    it.cbox("wood", -hw + 4.0, hw - 4.0, -hd + 2.0, hd - 60.0, 15.0, 18.0, r=1.0)
    # raised back rest
    back = S.cbox(-hw + 4.5, hw - 4.5, 0.0, 58.0, -1.5, 1.5, r=1.0)
    back.rot("X", 18.0).move(0.0, hd - 62.0, 18.0)
    it.add("wood", back)
    it.rbox("fabric", -hw + 5.0, hw - 5.0, -hd + 3.0, hd - 60.0, 17.0, 24.0, r=3.0, div=(1, 3, 1), puff=(0.0, 0.0, 1.0))
    cush = S.rbox(-hw + 5.0, hw - 5.0, 0.0, 52.0, 0.0, 6.5, r=3.0, div=(1, 2, 1), puff=(0.0, 0.0, 1.0))
    cush.rot("X", 18.0).move(0.0, hd - 60.0, 19.0)
    it.add("fabric", cush)
    roll = S.cyl(0.0, 0.0, -hw + 9.0, hw - 9.0, 5.5, sides=10, b=2.0, seg=1)
    roll.rot("Y", 90).rot("X", 18.0).move(0.0, hd - 21.0, 33.5)
    it.add("fabric", roll)


@builder("parasol")
def parasol(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    it.cyl("metal", 0.0, 0.0, 0.0, 6.0, 24.0, sides=12, b=0.0)
    it.cyl("metal", 0.0, 0.0, 5.0, h - 9.0, 2.0, sides=8, b=0.0)
    brim = h - 50.0
    apex = h - 8.0
    it.lathe("accent", [(0.0, brim + 6.0), (r, brim), (r * 0.985, brim + 3.0), (0.0, apex)], 8, smooth=False)
    it.lathe("accent", [(r, brim + 1.0), (r * 1.0, brim - 9.0), (r * 0.985, brim - 9.0), (r * 0.985, brim + 1.0)], 8, closed=True, smooth=False)
    for k in range(8):
        a = 2 * math.pi * k / 8
        it.tube("metal", [(0.0, 0.0, brim - 30.0), (r * 0.9 * math.cos(a), r * 0.9 * math.sin(a), brim + 4.0)], 0.8, sides=4)
    it.sphere("metal", 0.0, 0.0, h - 4.5, 4.5, sides=8, rings=4)


@builder("lamp-post")
def lamp_post(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    it.lathe("metal", [(0.0, 0.0), (r, 0.0), (r, 5.0), (r * 0.72, 9.0), (r * 0.48, 16.0), (r * 0.36, 22.0), (0.0, 22.0)], 10, sharp=(1, 2))
    it.cyl("metal", 0.0, 0.0, 20.0, h - 40.0, 4.2, r1=3.2, sides=10, b=0.0)
    it.cyl("metal", 0.0, 0.0, h - 42.0, h - 36.0, 6.0, sides=10, b=0.0)
    lz = h - 36.0
    it.lathe("metal", [(0.0, lz), (9.5, lz), (9.5, lz + 2.0), (0.0, lz + 2.0)], 6, smooth=False)
    it.lathe("glow", [(0.0, lz + 2.0), (7.6, lz + 2.0), (11.0, lz + 20.0), (0.0, lz + 20.0)], 6, smooth=False)
    it.lathe("metal", [(0.0, lz + 19.5), (r * 0.98, lz + 19.5), (r * 0.9, lz + 22.0), (3.5, lz + 30.0), (0.0, lz + 30.5)], 6, smooth=False)
    it.sphere("metal", 0.0, 0.0, h - 3.0, 3.0, sides=8, rings=4)


@builder("mailbox")
def mailbox(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    it.cbox("metal", -4.0, 4.0, -4.0, 4.0, 0.0, 92.0, r=1.2)
    it.box("metal", -10.0, 10.0, -8.0, 8.0, 0.0, 2.0)
    bw = w - 4.0
    it.slab("accent", S.arch(bw, h - 90.0, n_arc=8, rb=2.5, v0=90.0), -hd + 1.0, hd, b=1.6, seg=1, axis="Y")
    it.cbox("metal", -9.0, 9.0, -hd, -hd + 1.4, 102.0, 105.0, r=0.6)
    # little flag on the right, latch on the left
    it.box("metal", bw / 2 - 0.4, hw - 0.6, 2.0, 4.0, 98.0, 108.0)
    it.cbox("metal", hw - 1.6, hw, -4.0, 8.0, 104.0, 112.0, r=0.5)
    it.box("metal", -hw, -bw / 2 + 0.4, -hd + 4.0, -hd + 7.0, 100.0, 104.0)


@builder("fence-panel")
def fence_panel(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    n = 10
    span = w - 10.0
    pw = 11.0
    for k in range(n):
        x = -span / 2 + (k + 0.5) * span / n
        top = h - 6.0

        def picket(inset, x=x, top=top):
            return [(x - pw / 2, 0.0), (x + pw / 2, 0.0), (x + pw / 2, top - 6.0), (x, top), (x - pw / 2, top - 6.0)]

        it.slab("wood", picket, -hd, -hd + 2.6, b=0.0, axis="Y")
    for z in (20.0, h - 34.0):
        it.box("wood", -hw + 2.0, hw - 2.0, -hd + 2.6, -hd + 6.0, z, z + 8.0)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * hw, sx * (hw - 3.5)))
        it.cbox("wood", x0, x1, -hd, hd, 0.0, h - 2.0, r=0.8)
        it.box("metal", x0 - 0.2 * sx, x1, -hd, hd, h - 2.0, h)


@builder("gate")
def gate(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    post = 6.0
    for sx in (-1, 1):
        x0, x1 = sorted((sx * hw, sx * (hw - post)))
        it.cbox("wood", x0, x1, -hd, hd, 0.0, h - 6.0, r=1.0)
        it.lathe("metal", [(0.0, h - 6.0), (3.2, h - 6.0), (3.4, h - 3.5), (0.0, h)], 8, sharp=(1,), cx=(x0 + x1) / 2)
    gx0, gx1 = -hw + post + 1.5, hw - post - 1.5
    n = 5
    pw = 11.0
    span = gx1 - gx0
    for k in range(n):
        x = gx0 + (k + 0.5) * span / n
        top = h - 14.0 + (8.0 * math.sin(math.pi * (k + 0.5) / n))

        def picket(inset, x=x, top=top):
            return [(x - pw / 2, 6.0), (x + pw / 2, 6.0), (x + pw / 2, top - 6.0), (x, top), (x - pw / 2, top - 6.0)]

        it.slab("wood", picket, -hd + 0.5, -hd + 3.0, b=0.0, axis="Y")
    for z in (16.0, h - 40.0):
        it.box("wood", gx0, gx1, -hd + 3.0, -hd + 6.0, z, z + 8.0)
    brace = S.box(-1.6 * 0 - 3.5, 3.5, -hd + 3.0, -hd + 6.0, 0.0, math.hypot(span, h - 66.0) - 4.0)
    ang = math.degrees(math.atan2(span - 6.0, h - 66.0))
    brace.rot("Y", ang).move(gx0 + 4.0, 0.0, 22.0)
    it.add("wood", brace)
    for z in (22.0, h - 34.0):
        it.box("metal", gx0 - 4.0, gx0 + 9.0, -hd + 2.4, -hd + 3.2, z - 1.5, z + 3.5)
    it.cbox("metal", gx1 - 6.0, gx1 + 3.0, -hd, -hd + 3.0, h - 50.0, h - 45.0, r=0.8)


@builder("pool-ladder")
def pool_ladder(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    rr = 2.0
    for sx in (-1, 1):
        x = sx * (hw - rr)
        pts = [(x, -hd + 4.0, 0.0), (x, -hd + 4.0, 60.0), (x, -hd + 4.0, 92.0)]
        cy, cz, rad = -1.0, 103.0, hd - 5.0 - 1.0
        for k in range(1, 6):
            a = math.pi - math.pi * k / 5
            pts.append((x, cy + rad * math.cos(a), cz + rad * 0.9 * math.sin(a) * 1.0 + 0.0))
        pts.append((x, hd - rr - 0.5, 70.0))
        it.tube("metal", pts, rr, sides=6)
    for z in (18.0, 42.0, 66.0):
        it.box("metal", -hw + rr, hw - rr, -hd + 1.0, -hd + 9.0, z, z + 2.4)
    for sx in (-1, 1):
        it.box("metal", sx * (hw - rr) - 3.0, sx * (hw - rr) + 3.0, hd - 6.0, hd, 67.0, 70.0)


@builder("cloud")
def cloud(it):
    lumps = [
        (0.0, 0.0, 70.0, 170.0, 118.0, 92.0, 1),
        (-180.0, 14.0, 50.0, 120.0, 92.0, 62.0, 1),
        (182.0, -12.0, 54.0, 118.0, 90.0, 66.0, 1),
        (70.0, 22.0, 118.0, 88.0, 72.0, 52.0, 0),
        (-78.0, -14.0, 108.0, 80.0, 66.0, 48.0, 0),
        (240.0, 10.0, 40.0, 62.0, 56.0, 40.0, 0),
    ]
    for (x, y, z, rx, ry, rz, sd) in lumps:
        it.blob("linen", x, y, z, rx, ry, rz, subdiv=sd, jitter=0.05, flat_bottom=z * 0.62)


# ---------------------------------------------------------------------------
# Thumbnail-only stand-ins for procedural landscape items
# ---------------------------------------------------------------------------

@procedural("pool")
def pool_thumb(it):
    w, d, h = it.w, it.d, it.h
    cope = 32.0
    it.slab("stone", S.rrect(w, d, 26.0, seg=4), 0.0, h, b=2.5, seg=2, hole=S.rrect(w - 2 * cope, d - 2 * cope, 14.0, seg=4), hole_b=0.0)
    it.slab("water", S.rrect(w - 2 * cope + 1.0, d - 2 * cope + 1.0, 14.5, seg=4), 0.0, h - 7.0, b=0.0, cap_bottom=False)
    for sx in (-1, 1):
        x = sx * 24.0
        it.tube("metal", [(x, -d / 2 + cope - 2.0, h - 10.0), (x, -d / 2 + cope - 2.0, h + 40.0), (x, -d / 2 + cope - 18.0, h + 52.0), (x, -d / 2 + cope - 30.0, h + 2.0)], 2.0, sides=6)


@procedural("path")
def path_thumb(it):
    w, d, h = it.w, it.d, it.h
    rng = it.rng
    n = 5
    step = d / n
    for k in range(n):
        y = -d / 2 + (k + 0.5) * step
        g = S.slab(S.rrect(w - 10.0, step - 10.0, 9.0, seg=3), 0.0, h, b=0.6, seg=1, cap_bottom=False)
        g.rot("Z", rng.uniform(-5.0, 5.0)).move(rng.uniform(-3.0, 3.0), y, 0.0)
        it.add("stone", g)


@procedural("patio")
def patio_thumb(it):
    w, d, h = it.w, it.d, it.h
    rng = it.rng
    n = 4
    cell = w / n
    for i in range(n):
        for j in range(n):
            x = -w / 2 + (i + 0.5) * cell
            y = -d / 2 + (j + 0.5) * cell
            hh = h * rng.uniform(0.82, 1.0)
            it.slab("stone", S.rrect(cell - 4.0, cell - 4.0, 4.0, seg=2, cu=x, cv=y), 0.0, hh, b=0.7, seg=1, cap_bottom=False)

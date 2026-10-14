"""Trees: oak, pine, palm, blossom. Trunks stay centred on the origin so the
model sits on its catalog footprint."""

import math

from mathutils import Vector

from dh import shapes as S

from . import builder


def _trunk(it, profile, sides=9, wobble=0.0):
    g = S.lathe(profile, sides, sharp=(1,))
    if wobble:
        rng = it.rng
        ph = rng.uniform(0, math.tau)

        def fn(p):
            k = math.sin(p.z * 0.02 + ph) * wobble * min(1.0, p.z / 120.0)
            return (p.x + k, p.y + k * 0.6, p.z)

        g.warp(fn).smooth_normals()
    it.add("bark", g)


def _branch(it, slot, pts, r0, r1, sides=6):
    n = len(pts)
    rads = [r0 + (r1 - r0) * i / (n - 1) for i in range(n)]
    it.tube(slot, pts, rads, sides=sides)


@builder("tree-oak")
def tree_oak(it):
    _trunk(it, [(0.0, 0.0), (40.0, 0.0), (28.0, 8.0), (22.0, 26.0), (20.0, 80.0), (18.0, 150.0), (15.0, 210.0), (10.0, 260.0), (0.0, 275.0)], sides=10, wobble=4.0)
    for (ex, ey, ez) in ((-92.0, 28.0, 300.0), (88.0, -26.0, 305.0), (18.0, 90.0, 312.0), (-30.0, -86.0, 300.0)):
        _branch(it, "bark", [(0.0, 0.0, 170.0), (ex * 0.42, ey * 0.42, 225.0), (ex * 0.78, ey * 0.78, ez - 6.0)], 10.0, 5.0)
    lumps = [
        (0.0, 0.0, 400.0, 138.0, 2),
        (-34.0, 18.0, 480.0, 96.0, 1),
        (-104.0, 30.0, 330.0, 92.0, 2),
        (100.0, -28.0, 338.0, 94.0, 1),
        (20.0, 104.0, 350.0, 92.0, 1),
        (-30.0, -100.0, 330.0, 90.0, 1),
        (72.0, 62.0, 440.0, 86.0, 1),
    ]
    for (x, y, z, r, sd) in lumps:
        it.blob("leaf", x, y, z, r, r, r * 0.84, subdiv=sd, jitter=0.07)


@builder("tree-pine")
def tree_pine(it):
    _trunk(it, [(0.0, 0.0), (17.0, 0.0), (11.0, 8.0), (9.0, 70.0), (7.0, 160.0), (0.0, 180.0)], sides=8)
    tiers = [(70.0, 115.0, 175.0), (170.0, 97.0, 165.0), (262.0, 79.0, 155.0), (350.0, 60.0, 145.0), (432.0, 40.0, 188.0)]
    for i, (z0, r, ht) in enumerate(tiers):
        prof = [(0.0, z0 + 10.0), (r, z0), (r * 0.96, z0 + 7.0), (r * 0.52, z0 + ht * 0.5), (0.0, z0 + ht)]
        g = S.lathe(prof, 12, sharp=(1,), phase=i * 0.4)

        def scallop(p, z0=z0, r=r):
            rr = math.hypot(p.x, p.y)
            if rr < 1e-6:
                return (p.x, p.y, p.z)
            a = math.atan2(p.y, p.x)
            k = 1.0 + 0.09 * math.cos(6 * a) * min(1.0, rr / r)
            dz = -6.0 * (0.5 + 0.5 * math.cos(6 * a)) * (rr / r) ** 2
            return (p.x * k, p.y * k, p.z + dz)

        g.warp(scallop).smooth_normals()
        it.add("leaf", g)


def _frond(base, angle, length, droop, width, rise=30.0, segs=8, tilt=0.0):
    d = Vector((math.cos(angle), math.sin(angle), 0.0))
    side = Vector((-d.y, d.x, 0.0))
    up = Vector((0.0, 0.0, 1.0))
    g = S.Geo()
    rows = []
    for k in range(segs + 1):
        t = k / segs
        c = Vector(base) + d * (length * t) + up * (rise * t - droop * t * t)
        wv = width * (math.sin(math.pi * min(1.0, 0.08 + t)) ** 0.7) * (1.0 if k % 2 == 0 else 0.62)
        lift = up * (wv * 0.32)
        rows.append((g.add_v(c + side * wv + lift), g.add_v(c + up * 1.5), g.add_v(c - side * wv + lift)))
    for k in range(segs):
        a, b = rows[k], rows[k + 1]
        g.add_f((a[0], a[1], b[1], b[0]))
        g.add_f((a[1], a[2], b[2], b[1]))
    g.smooth_normals()
    return g


@builder("tree-palm")
def tree_palm(it):
    rng = it.rng
    # gently bowed, ringed trunk whose crown sits back over its base
    path = [(0.0, 0.0, 0.0)]
    n = 12
    for i in range(1, n + 1):
        t = i / n
        path.append((22.0 * math.sin(math.pi * t), 0.0, 540.0 * t))
    rads = [22.0] + [(16.0 - 4.5 * i / n) * (1.0 if i % 2 else 1.12) for i in range(1, n + 1)]
    it.tube("bark", path, rads, sides=8)
    top = Vector((0.0, 0.0, 540.0))
    k = 10
    for i in range(k):
        a = 2 * math.pi * i / k + rng.uniform(-0.1, 0.1)
        it.add("leaf", _frond(top, a, rng.uniform(168.0, 182.0), rng.uniform(165.0, 190.0), 34.0, rise=58.0, segs=9))
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        it.add("leaf", _frond(top + Vector((0, 0, 4.0)), a, 105.0, 46.0, 24.0, rise=75.0, segs=6))
    for i in range(4):
        a = 2 * math.pi * i / 4 + 0.6
        it.sphere("bark", 13.0 * math.cos(a), 13.0 * math.sin(a), 527.0 + (i % 2) * 5.0, 9.5, sides=8, rings=5)


@builder("tree-blossom")
def tree_blossom(it):
    rng = it.rng
    _trunk(it, [(0.0, 0.0), (22.0, 0.0), (14.0, 7.0), (11.5, 45.0), (10.5, 120.0), (8.0, 175.0), (0.0, 185.0)], sides=8, wobble=4.0)
    for (ex, ey, ez) in ((-70.0, 18.0, 275.0), (68.0, -14.0, 285.0), (8.0, 66.0, 285.0), (-14.0, -62.0, 280.0)):
        _branch(it, "bark", [(0.0, 0.0, 150.0), (ex * 0.45, ey * 0.45, 210.0), (ex * 0.85, ey * 0.85, ez - 15.0)], 7.0, 3.2)
    blossoms = [
        (0.0, 0.0, 335.0, 102.0, 2),
        (-82.0, 22.0, 290.0, 70.0, 1),
        (78.0, -16.0, 300.0, 72.0, 1),
        (10.0, 78.0, 298.0, 68.0, 1),
        (-18.0, -74.0, 292.0, 66.0, 1),
    ]
    for (x, y, z, r, sd) in blossoms:
        it.blob("accent", x, y, z, r, r, r * 0.86, subdiv=sd, jitter=0.07)
    leaves = [(-60.0, -46.0, 262.0, 46.0), (58.0, 52.0, 270.0, 48.0), (-52.0, 60.0, 340.0, 44.0)]
    for (x, y, z, r) in leaves:
        it.blob("leaf", x, y, z, r, r, r * 0.8, subdiv=1, jitter=0.08)
    # little blossom puffs dotted around the crown
    for i in range(12):
        a = 2 * math.pi * i / 12 + rng.uniform(-0.2, 0.2)
        rad = rng.uniform(85.0, 118.0)
        z = rng.uniform(300.0, 400.0)
        rr = rng.uniform(15.0, 22.0)
        it.blob("accent", rad * math.cos(a), rad * math.sin(a) * 0.95, z, rr, subdiv=0, jitter=0.05)

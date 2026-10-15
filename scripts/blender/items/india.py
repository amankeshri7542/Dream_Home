"""Indian site items: tulsi planter (vrindavan), neem street tree, street
light and the diya (clay oil lamp, interior decor)."""

import math

from dh import shapes as S

from . import builder


@builder("tulsi-planter")
def tulsi_planter(it):
    """A raised square masonry planter (tulsi vrindavan): stepped plinth,
    painted body with an arched niche on each face, crowned bowl, tulsi bush."""
    w, d, h = it.w, it.d, it.h
    hw = w / 2
    # stepped stone plinth
    it.box("stone", -hw, hw, -hw, hw, 0.0, 8.0)
    it.box("stone", -hw + 5.0, hw - 5.0, -hw + 5.0, hw - 5.0, 8.0, 14.0)
    # painted body
    b = hw - 9.0
    it.cbox("terracotta", -b, b, -b, b, 14.0, 52.0, r=1.2)
    # arched niches (stone inlays) on the four faces
    for k in range(4):
        niche = S.slab(S.arch(16.0, 22.0, n_arc=4, rb=0.0, v0=22.0), 0.0, 1.6, b=0.0, seg=1, axis="Y")
        niche.move(0.0, -b - 0.8, 0.0)
        niche.rot("Z", 90.0 * k)
        it.add("stone", niche)
    # cornice + bowl
    it.box("stone", -b - 3.0, b + 3.0, -b - 3.0, b + 3.0, 52.0, 57.0)
    it.lathe("terracotta", [(0.0, 57.0), (b - 1.0, 57.0), (b + 2.0, 64.0), (b + 1.0, 66.0), (b - 3.0, 66.0), (b - 3.5, 63.0), (0.0, 63.0)], 10, sharp=(1, 3, 4))
    # tulsi: a few slim stems with small leafy clusters
    rng = it.rng
    tops = [(0.0, 0.0, h - 8.0), (-9.0, 5.0, h - 18.0), (8.0, -6.0, h - 16.0), (-5.0, -8.0, h - 22.0)]
    for (x, y, z) in tops:
        it.tube("leaf", [(x * 0.2, y * 0.2, 63.0), (x, y, z)], [1.0, 0.6], sides=3, caps=False)
        it.blob("leaf", x, y, z, 6.5 + rng.uniform(-1, 1), 6.5, 7.5, subdiv=1, jitter=0.12)
    it.blob("leaf", 0.0, 0.0, 71.0, 12.0, 12.0, 7.0, subdiv=1, jitter=0.1)


@builder("tree-neem")
def tree_neem(it):
    """Neem: a straight, slightly leaning trunk, spreading limbs and a broad,
    clumpy canopy of small leaves."""
    prof = [(0.0, 0.0), (36.0, 0.0), (24.0, 10.0), (19.0, 40.0), (17.0, 120.0), (15.0, 200.0), (11.0, 250.0), (0.0, 262.0)]
    g = S.lathe(prof, 9, sharp=(1,))

    def lean(p):
        k = min(1.0, p.z / 250.0) ** 1.5
        return (p.x + 10.0 * k, p.y, p.z)

    g.warp(lean).smooth_normals()
    it.add("bark", g)
    limbs = [(-120.0, 30.0, 330.0), (115.0, -40.0, 340.0), (20.0, 120.0, 350.0), (-30.0, -115.0, 335.0), (70.0, 80.0, 380.0)]
    for (ex, ey, ez) in limbs:
        pts = [(8.0, 0.0, 180.0), (ex * 0.45 + 6.0, ey * 0.45, 250.0), (ex * 0.85, ey * 0.85, ez - 10.0)]
        it.tube("bark", pts, [9.0, 6.0, 3.5], sides=6)
    rng = it.rng
    clumps = [
        (0.0, 0.0, 430.0, 120.0),
        (-130.0, 30.0, 360.0, 80.0),
        (125.0, -40.0, 368.0, 82.0),
        (25.0, 130.0, 372.0, 80.0),
        (-30.0, -125.0, 360.0, 78.0),
        (80.0, 85.0, 430.0, 74.0),
        (-80.0, -60.0, 470.0, 70.0),
        (-70.0, 85.0, 450.0, 70.0),
        (60.0, -85.0, 470.0, 68.0),
    ]
    for (x, y, z, r) in clumps:
        it.blob("leaf", x, y, z, r, r * rng.uniform(0.9, 1.05), r * 0.62, subdiv=1, jitter=0.12)


@builder("street-light")
def street_light(it):
    """Municipal street light: tapered steel pole, curved outreach arm and a
    flat LED head (glow underneath)."""
    w, d, h = it.w, it.d, it.h
    hd = d / 2
    base_x = -w / 2 + hd
    it.lathe("metal", [(0.0, 0.0), (13.0, 0.0), (13.0, 30.0), (9.0, 34.0), (0.0, 34.0)], 8, sharp=(1, 2), cx=base_x)
    it.cyl("metal", base_x, 0.0, 30.0, h - 30.0, 6.5, r1=4.0, sides=8, b=0.0)
    arm = [(base_x, 0.0, h - 40.0), (base_x + 10.0, 0.0, h - 16.0), (base_x + 40.0, 0.0, h - 6.0), (w / 2 - 34.0, 0.0, h - 6.0)]
    it.tube("metal", S.catmull(arm, per_seg=3), 3.0, sides=6)
    hx0 = w / 2 - 44.0
    it.cbox("metal", hx0, w / 2, -12.0, 12.0, h - 12.0, h, r=2.0)
    it.box("glow", hx0 + 4.0, w / 2 - 4.0, -9.0, 9.0, h - 14.0, h - 11.0)


@builder("diya")
def diya(it):
    """Clay oil lamp: a shallow bowl pinched into a spout, with a flame."""
    w, d, h = it.w, it.d, it.h
    r = w / 2 - 1.0
    bowl = S.lathe([(0.0, 0.0), (r * 0.55, 0.0), (r * 0.9, 1.8), (r, 3.8), (r * 0.86, 4.0), (r * 0.74, 2.6), (0.0, 2.2)], 12, sharp=(1, 4))

    def pinch(p):
        a = math.atan2(p.y, p.x)
        k = 1.0 + 0.35 * max(0.0, math.cos(a)) ** 6 * min(1.0, p.z / 3.0)
        return (p.x * k, p.y * (1.0 - 0.12 * max(0.0, math.cos(a)) ** 4), p.z)

    bowl.warp(pinch).smooth_normals()
    it.add("terracotta", bowl)
    flame = S.lathe([(0.0, 3.4), (1.2, 4.6), (0.9, 6.6), (0.0, h)], 6)
    flame.move(r * 1.05, 0.0, 0.0)
    it.add("glow", flame)

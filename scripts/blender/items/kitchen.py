"""Kitchen modules (tile into kitchen-counter runs), wall cabinet, fridge,
island.

Counter runs: every base module shares the same stone worktop height (89 cm)
and a 3 cm stone upstand at the back reaching the catalog height (92 cm), so
modules line up seamlessly and the sink's bridge tap stays inside the box.
"""

from dh import shapes as S

from . import builder
from .common import bar_handle, knob

TOP_Z0, TOP_Z1 = 85.5, 89.0
PLINTH = 10.5
FRONT_IN = 2.6  # fronts start this far behind the worktop nose


def _module_body(it, worktop=True):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    it.box("accent", -hw + 1.5, hw - 1.5, -hd + 7.0, hd - 1.0, 0.0, PLINTH + 0.5)
    it.cbox("accent", -hw + 0.2, hw - 0.2, -hd + FRONT_IN + 2.0, hd, PLINTH, TOP_Z0 + 0.3, r=1.0)
    if worktop:
        it.rbox("stone", -hw, hw, -hd, hd, TOP_Z0, TOP_Z1, r=1.4)
    it.box("stone", -hw, hw, hd - 2.4, hd, TOP_Z1 - 0.5, h)


def _front(it, x0, x1, z0, z1):
    hd = it.d / 2
    it.cbox("accent", x0, x1, -hd + FRONT_IN, -hd + FRONT_IN + 2.0, z0, z1, r=1.1)


@builder("kitchen-base")
def kitchen_base(it):
    hw, hd = it.w / 2, it.d / 2
    _module_body(it)
    _front(it, -hw + 0.6, hw - 0.6, 68.5, TOP_Z0 - 0.7)
    _front(it, -hw + 0.6, hw - 0.6, PLINTH + 1.0, 67.5)
    bar_handle(it, "metal", -hw * 0.45, hw * 0.45, -hd + FRONT_IN, 78.5, t=1.4, stand=0.0)
    bar_handle(it, "metal", -hw * 0.45, hw * 0.45, -hd + FRONT_IN, 62.0, t=1.4, stand=0.0)


@builder("kitchen-sink")
def kitchen_sink(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    _module_body(it, worktop=False)
    # worktop with a cut-out for the basin
    hole_w, hole_d, hole_cy = 50.0, 36.0, -2.0
    it.slab("stone", S.rrect(w, d, 1.6, seg=2), TOP_Z0, TOP_Z1, b=1.4, seg=1, hole=S.rrect(hole_w, hole_d, 5.0, seg=2, cv=hole_cy), hole_b=0.0)
    # brushed basin: thin rim + inside-out bowl
    it.slab("metal", S.rrect(hole_w + 4.0, hole_d + 4.0, 7.0, seg=2, cv=hole_cy), TOP_Z1 - 0.3, TOP_Z1 + 0.35, b=0.0, hole=S.rrect(hole_w - 0.6, hole_d - 0.6, 4.8, seg=2, cv=hole_cy))
    bowl = S.loft([S.ring_pts(S.rrect(hole_w - 6.0, hole_d - 6.0, 3.5, seg=2, cv=hole_cy), 72.0), S.ring_pts(S.rrect(hole_w - 0.6, hole_d - 0.6, 4.8, seg=2, cv=hole_cy), TOP_Z1 + 0.05)], cap_bottom=True, cap_top=False)
    bowl.flip()
    it.add("metal", bowl)
    # water resting in the basin
    it.slab("water", S.rrect(hole_w - 3.0, hole_d - 3.0, 4.2, seg=2, cv=hole_cy), 76.0, 83.0, b=0.0, cap_bottom=False)
    # wall-mounted bridge tap arching over the basin + two little valve knobs
    ty = hd - 2.4
    it.tube("metal", [(0.0, ty + 0.5, 90.2), (0.0, ty - 4.0, 90.6), (0.0, ty - 9.0, 90.6), (0.0, ty - 12.5, 89.8), (0.0, ty - 13.6, 88.0)], [1.0, 1.0, 0.95, 0.9, 0.85], sides=6)
    # single lever mixer beside the spout
    it.cbox("metal", 6.0, 8.6, ty - 5.0, ty, 89.4, 91.2, r=0.6)
    # two doors with vertical bar handles near the meeting stiles
    _front(it, -hw + 0.6, -0.4, PLINTH + 1.0, TOP_Z0 - 0.7)
    _front(it, 0.4, hw - 0.6, PLINTH + 1.0, TOP_Z0 - 0.7)
    for sx in (-1, 1):
        bar_handle(it, "metal", sx * 5.0, 62.0, -hd + FRONT_IN, 79.0, t=1.4, stand=0.0, vertical=True)


@builder("kitchen-stove")
def kitchen_stove(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    _module_body(it)
    # black ceramic hob with four chunky burners
    it.cbox("rubber", -hw + 3.0, hw - 3.0, -hd + 5.0, hd - 5.0, TOP_Z1 - 0.4, TOP_Z1 + 0.6, r=0.5)
    for bx in (-12.5, 12.5):
        for by in (-9.5, 10.5):
            r = 5.0 if by < 0 else 4.2
            it.cyl("metal", bx, by, TOP_Z1 + 0.5, TOP_Z1 + 1.6, r, sides=10, b=0.0)
    # oven: door, dark window, bar handle; control strip with knobs
    _front(it, -hw + 0.6, hw - 0.6, PLINTH + 1.0, 70.0)
    it.cbox("rubber", -hw + 7.5, hw - 7.5, -hd + FRONT_IN - 0.5, -hd + FRONT_IN + 0.5, 21.0, 58.0, r=1.5)
    bar_handle(it, "metal", -hw * 0.7, hw * 0.7, -hd + FRONT_IN, 64.5, t=1.5, stand=0.0)
    _front(it, -hw + 0.6, hw - 0.6, 71.0, TOP_Z0 - 0.7)
    for k in range(4):
        x = -hw + 10.0 + k * (w - 20.0) / 3
        g = S.cyl(0.0, 0.0, 0.0, 1.6, 1.9, sides=8, b=0.0)
        g.rot("X", 90).move(x, -hd + FRONT_IN, 78.3)
        it.add("metal", g)


@builder("kitchen-upper")
def kitchen_upper(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    it.rbox("accent", -hw, hw, -hd + 4.2, hd, 0.0, h, r=2.0)
    it.cbox("accent", -hw + 0.8, hw - 0.8, -hd + 2.2, -hd + 4.4, 1.0, h - 1.0, r=1.1)
    bar_handle(it, "metal", hw - 6.0, 4.0, -hd + 2.2, 18.0, t=1.4, stand=0.0, vertical=True)


@builder("fridge")
def fridge(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # retro rounded body on little metal feet
    it.rbox("accent", -hw, hw, -hd + 4.0, hd, 4.0, h, r=9.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.box("metal", sx * (hw - 8) - 3, sx * (hw - 8) + 3, sy * (hd - 9) - 3, sy * (hd - 9) + 3, 0.0, 4.5)
    split = 128.0
    it.rbox("accent", -hw + 1.5, hw - 1.5, -hd + 1.6, -hd + 6.0, split + 1.0, h - 4.0, r=4.0)
    it.rbox("accent", -hw + 1.5, hw - 1.5, -hd + 1.6, -hd + 6.0, 8.0, split - 1.0, r=4.0)
    # chunky chrome handles
    for z0, z1 in ((split + 8.0, split + 40.0), (split - 50.0, split - 10.0)):
        it.cbox("metal", -hw + 6.0, -hw + 9.5, -hd, -hd + 2.0, z0, z1, r=1.1)


@builder("kitchen-island")
def kitchen_island(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # warm wood plinth, painted body, stone top overhanging the seating side (+Y)
    it.box("wood", -hw + 4, hw - 4, -hd + 7, hd - 22, 0.0, 10.5)
    it.rbox("accent", -hw + 3, hw - 3, -hd + 4.5, hd - 18, 10.0, h - 4.4, r=2.0)
    it.rbox("stone", -hw, hw, -hd, hd, h - 4.6, h - 0.8, r=1.8)
    n = 3
    fw = (w - 6.0 - 2.0) / n
    for k in range(n):
        x0 = -hw + 4.0 + k * fw + 0.4
        it.cbox("accent", x0, x0 + fw - 0.8, -hd + 2.5, -hd + 4.7, 13.0, h - 7.5, r=1.1)
        knob(it, "wood", x0 + fw / 2 - 0.4, -hd + 2.5, h - 16.0, r=2.0, depth=2.5, sides=8)
    # wooden chopping board resting on the worktop
    it.cbox("wood", hw - 52.0, hw - 16.0, -hd + 12.0, -hd + 38.0, h - 1.4, h, r=0.5)

"""Beds, sleeping mat and bedside table."""

from dh import shapes as S

from . import builder
from .common import cushion, knob, legs4


def _bed(it, pillows):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # chunky wooden legs and frame
    legs4(it, "wood", hw - 6.5, hd - 11, 0.0, 12.0, r0=3.6, r1=2.9)
    it.rbox("wood", -hw, hw, -hd, hd - 6, 10.0, 30.0, r=4.0)
    # rounded headboard with an upholstered panel
    hb_h = h - 10.0
    it.slab("wood", S.rrect(w, hb_h, 20.0, seg=3, cv=10.0 + hb_h / 2), hd - 7.0, hd, b=2.5, seg=2, axis="Y")
    it.rbox("fabric", -hw + 13, hw - 13, hd - 10.5, hd - 5.0, 38.0, h - 11.0, r=3.5, div=(2, 1, 2), puff=(0.0, 1.8, 0.0))
    # thick soft mattress
    it.rbox("linen", -hw + 3, hw - 3, -hd + 2.5, hd - 8, 26.0, 50.0, r=7.0, div=(2, 2, 1), puff=(0.6, 0.6, 1.2))
    # duvet over the foot two-thirds with a turned-back cuff
    dy1 = -hd + 0.62 * d
    it.rbox("fabric", -hw + 0.5, hw - 0.5, -hd, dy1, 34.0, 55.0, r=8.0, div=(2, 2, 1), puff=(0.5, 0.6, 2.2))
    it.rbox("fabric", -hw + 1.0, hw - 1.0, dy1 - 15.0, dy1 + 1.5, 50.0, 58.5, r=4.0, div=(2, 1, 1), puff=(0.0, 0.8, 1.0))
    # pillows propped against the headboard
    pw = min(64.0, (w - 16.0 - (pillows - 1) * 4.0) / pillows)
    total = pillows * pw + (pillows - 1) * 4.0
    for k in range(pillows):
        x0 = -total / 2 + k * (pw + 4.0)
        cx = x0 + pw / 2
        cushion(it, "linen", x0, x0 + pw, hd - 46.0, hd - 13.0, 48.0, 63.0, r=7.0, puff=(1.4, 1.6, 2.8), div=(2, 2, 1), tilt=-14.0, pivot=(cx, hd - 30.0, 48.0))


@builder("bed-double")
def bed_double(it):
    _bed(it, 2)


@builder("bed-single")
def bed_single(it):
    _bed(it, 1)


@builder("sleeping-mat")
def sleeping_mat(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # tufted futon mat
    it.rbox("fabric", -hw, hw, -hd, hd - 9.0, 0.0, 6.5, r=2.8, div=(2, 2, 1), puff=(0.0, 0.0, 1.0))
    # rolled pillow at the head
    roll = S.cyl(0.0, 0.0, -hw + 5.0, hw - 5.0, h / 2, sides=10, b=2.0, seg=1)
    roll.rot("Y", 90)
    roll.move(0.0, hd - h / 2, h / 2)
    it.add("linen", roll)
    # folded blanket at the foot
    it.cbox("linen", -hw + 6, hw - 6, -hd + 7, -hd + 30, 6.0, 9.0, r=1.4)


@builder("bedside-table")
def bedside_table(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    legs4(it, "wood", hw - 4.5, hd - 6.5, 0.0, 12.0, r0=2.2, r1=1.6, sides=6)
    it.rbox("wood", -hw, hw, -hd + 4.0, hd, 11.0, h, r=3.0)
    for z0, z1 in ((30.5, h - 4.0), (14.0, 29.0)):
        it.cbox("wood", -hw + 3.0, hw - 3.0, -hd + 2.0, -hd + 4.2, z0, z1, r=1.0)
        knob(it, "metal", 0.0, -hd + 2.0, (z0 + z1) / 2, r=1.7, depth=2.0, sides=8)

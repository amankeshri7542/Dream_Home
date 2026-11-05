"""Beds, sleeping mat and bedside table."""

from dh import shapes as S

from . import builder
from .common import cushion, knob, legs4, wrinkle


def _bed(it, pillows):
    """A made bed: firm mattress, a duvet that falls over the sides with soft
    folds, the white sheet turned back over it, and pillows in two layers."""
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # low wooden frame and tapered legs
    legs4(it, "wood", hw - 6.5, hd - 11, 0.0, 12.0, r0=3.2, r1=2.2, sides=10)
    it.rbox("wood", -hw + 1.0, hw - 1.0, -hd + 1.0, hd - 6, 10.0, 28.0, r=1.8, seg=2)
    # headboard with an upholstered panel
    hb_h = h - 10.0
    it.slab("wood", S.rrect(w, hb_h, 8.0, seg=3, cv=10.0 + hb_h / 2), hd - 6.0, hd, b=1.6, seg=2, axis="Y")
    it.rbox("fabric", -hw + 8, hw - 8, hd - 8.5, hd - 4.5, 36.0, h - 7.0, r=2.4, seg=2, div=(3, 1, 2), puff=(0.0, 1.2, 0.0))
    # mattress
    it.rbox("linen", -hw + 3, hw - 3, -hd + 2.5, hd - 7, 26.0, 47.0, r=3.4, seg=2, div=(2, 2, 1), puff=(0.2, 0.2, 0.5))
    # duvet: down over both sides and the foot, with folds across the top
    fold_y = -hd + 0.68 * d
    duvet = S.rbox(-hw + 0.5, hw - 0.5, -hd + 0.5, fold_y, 22.0, 52.0, r=4.2, seg=2, div=(6, 8, 2), puff=(0.3, 0.3, 1.1))
    it.add("fabric", wrinkle(duvet, 0.75, seed=1.1))
    # the top sheet turned back over the duvet
    sheet = S.rbox(-hw + 0.2, hw - 0.2, fold_y - 27.0, fold_y + 1.5, 50.2, 54.2, r=1.8, seg=2, div=(6, 3, 1), puff=(0.1, 0.2, 0.5))
    it.add("linen", wrinkle(sheet, 0.32, seed=2.7))
    # pillows propped against the headboard: sleeping pillows behind, smaller ones in front
    pw = min(66.0, (w - 14.0 - (pillows - 1) * 2.0) / pillows)
    total = pillows * pw + (pillows - 1) * 2.0
    for k in range(pillows):
        x0 = -total / 2 + k * (pw + 2.0)
        cushion(it, "linen", x0, x0 + pw, hd - 26.0, hd - 9.0, 45.0, 69.0, r=5.5, puff=(1.0, 2.4, 1.6), div=(3, 1, 2), tilt=-16.0)
        small = pw * 0.72
        cx = x0 + pw / 2
        cushion(it, "fabric", cx - small / 2, cx + small / 2, hd - 37.0, hd - 25.0, 46.0, 64.0, r=4.8, puff=(0.8, 2.0, 1.2), div=(3, 1, 2), tilt=-20.0)


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

"""Shared furniture details (legs, knobs, handles, cushions)."""

import math

from dh import shapes as S


def leg(it, slot, x, y, z0, z1, r0=2.4, r1=1.7, sides=8):
    """Tapered round leg (wide at the top, z1)."""
    it.lathe(slot, [(0.0, z0), (r1, z0), (r0, z1), (0.0, z1)], sides, sharp=(1, 2), cx=x, cy=y)


def legs4(it, slot, x, y, z0, z1, **kw):
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(it, slot, sx * x, sy * y, z0, z1, **kw)


def knob(it, slot, x, y_front, z, r=1.6, depth=2.0, sides=8, axis_y=True):
    """Round mushroom knob protruding toward -Y from y_front."""
    prof = [(0.0, 0.0), (r * 0.55, 0.0), (r, depth * 0.55), (r * 0.82, depth), (0.0, depth)]
    g = S.lathe(prof, sides, sharp=(1,))
    g.rot("X", 90)  # +Z -> -Y
    g.move(x, y_front, z)
    it.add(slot, g)


def bar_handle(it, slot, x0, x1, y_front, z, t=1.2, stand=1.6, vertical=False):
    """Rounded bar in front of y_front. Horizontal: spans x0..x1 at height z.
    Vertical: at x=x0 spanning heights between x1 and z."""
    if vertical:
        za, zb = sorted((x1, z))
        it.cbox(slot, x0 - t / 2, x0 + t / 2, y_front - stand - t, y_front - stand, za, zb, r=0.5)
        if stand > 0.05:
            for zz in (za + 1.5, zb - 1.5):
                it.box(slot, x0 - t * 0.3, x0 + t * 0.3, y_front - stand - 0.1, y_front, zz - t * 0.3, zz + t * 0.3)
    else:
        it.cbox(slot, x0, x1, y_front - stand - t, y_front - stand, z - t / 2, z + t / 2, r=0.5)
        if stand > 0.05:
            for xx in (x0 + 1.5, x1 - 1.5):
                it.box(slot, xx - t * 0.3, xx + t * 0.3, y_front - stand - 0.1, y_front, z - t * 0.3, z + t * 0.3)


def cushion(it, slot, x0, x1, y0, y1, z0, z1, r=6.0, puff=(0.6, 0.8, 2.0), div=(2, 2, 1), tilt=0.0, pivot=None):
    g = S.rbox(x0, x1, y0, y1, z0, z1, r=r, div=div, puff=puff)
    if tilt:
        g.rot("X", tilt, pivot or ((x0 + x1) / 2, (y0 + y1) / 2, z0))
    it.add(slot, g)
    return g


def book_row(it, slots, x0, x1, y0, y1, z0, hmin, hmax, rng, tmin=2.2, tmax=4.2, lean_last=True, gap=0.0):
    """A row of chunky books cycling through ``slots``. Returns x where it ended."""
    x = x0
    k = 0
    while x < x1 - tmin:
        t = min(rng.uniform(tmin, tmax), x1 - x)
        hh = rng.uniform(hmin, hmax)
        dd = rng.uniform(0.82, 1.0) * (y1 - y0)
        it.box(slots[k % len(slots)], x, x + t - 0.15, y0 + (y1 - y0 - dd), y1, z0, z0 + hh)
        x += t + gap
        k += 1
    return x


def plate(it, slot, x, y, z, r=11.0, sides=12):
    prof = [(0.0, z), (r * 0.66, z), (r, z + 1.4), (r * 0.9, z + 1.6), (0.0, z + 0.6)]
    it.lathe(slot, prof, sides, sharp=(1, 3), cx=x, cy=y)


def bowl(it, slot, x, y, z, r=9.0, h=6.5, sides=12):
    prof = [(0.0, z), (r * 0.45, z), (r * 0.8, z + h * 0.35), (r, z + h), (r * 0.86, z + h), (r * 0.62, z + h * 0.45), (0.0, z + h * 0.3)]
    it.lathe(slot, prof, sides, sharp=(1, 3, 4), cx=x, cy=y)


def pot(it, slot, x, y, z0, r_bot, r_top, h, rim=1.4, sides=12, soil_drop=2.5):
    """Terracotta flower pot with a rolled rim (top closed slightly below rim)."""
    prof = [
        (0.0, z0),
        (r_bot, z0),
        (r_top - rim * 0.6, z0 + h - rim * 2.2),
        (r_top, z0 + h - rim * 2.0),
        (r_top + 0.2, z0 + h - rim * 0.6),
        (r_top - 0.2, z0 + h),
        (r_top - rim * 1.1, z0 + h),
        (r_top - rim * 1.2, z0 + h - soil_drop),
        (0.0, z0 + h - soil_drop),
    ]
    it.lathe(slot, prof, sides, sharp=(1, 2, 6, 7), cx=x, cy=y)


def angle_pts(n, r, cx=0.0, cy=0.0, phase=0.0):
    return [(cx + r * math.cos(phase + 2 * math.pi * k / n), cy + r * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]

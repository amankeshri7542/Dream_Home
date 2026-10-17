"""Designer pack: curtains, wall art, TV wall, ceiling fan, wall light, table
lamp, jhula swing, diwan, shoe rack, crockery sideboard, console table, pouf,
headboard panel, chimney hood, backsplash tile module, mirror cabinet and the
styling pieces (cushion set, vase & books)."""

import math

from mathutils import Vector

from dh import shapes as S

from . import builder
from .common import knob, leg


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _flutes(it, slot, x0, x1, z0, z1, y_back, depth, n, cap=True):
    """``n`` vertical rounded flutes facing -Y between x0..x1: grooves on the
    plane y=y_back, crests at y_back-depth. Three columns per flute with
    analytic normals so each reads as a half-round reed (5 tris each)."""
    g = S.Geo()
    fw = (x1 - x0) / n
    for k in range(n):
        xa = x0 + k * fw
        cols = ((xa, y_back, (-0.78, -0.62, 0.0)), (xa + fw / 2, y_back - depth, (0.0, -1.0, 0.0)), (xa + fw, y_back, (0.78, -0.62, 0.0)))
        bot = [g.add_v((x, y, z0), nn) for x, y, nn in cols]
        top = [g.add_v((x, y, z1), nn) for x, y, nn in cols]
        for i in range(2):
            g.add_f((bot[i], bot[i + 1], top[i + 1], top[i]))
        if cap:
            g.add_f(tuple(g.add_v((x, y, z1), (0.0, 0.0, 1.0)) for x, y, _ in cols))
    it.add(slot, g)


def _channels(it, slot, x0, x1, z0, z1, y_back, depth, n, end=6.0):
    """Vertical channel tufting facing -Y: ``n`` puffed channels whose ends
    round back into the seams at z0 and z1 (24 tris each)."""
    g = S.Geo()
    fw = (x1 - x0) / n
    angs = (-90.0, -45.0, 0.0, 45.0, 90.0)
    for k in range(n):
        xa = x0 + k * fw
        xc = xa + fw / 2
        rows = []
        for z, f, nz in ((z0, 0.0, -1.0), (z0 + end, 1.0, -0.2), (z1 - end, 1.0, 0.2), (z1, 0.0, 1.0)):
            row = []
            for a in angs:
                s, c = math.sin(math.radians(a)), math.cos(math.radians(a))
                x = xc + (fw / 2) * s
                y = y_back - depth * c * f
                if f > 0.0:
                    nrm = (0.85 * s, -max(c, 0.35), nz)
                else:
                    nrm = (0.3 * s, -0.45, nz)
                row.append(g.add_v((x, y, z), nrm))
            rows.append(row)
        for r in range(len(rows) - 1):
            for i in range(len(angs) - 1):
                g.add_f((rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i]))
    it.add(slot, g)


def _ry(g, deg, about):
    """Rotate a Geo about a vertical axis through ``about``."""
    return g.rot("Z", deg, about)


# ---------------------------------------------------------------------------
# 1. Curtains
# ---------------------------------------------------------------------------

def _drape_section(xa, xb, z, yc, t, amp, waves=3):
    """Closed horizontal section of a pleated drape (CCW from +Z): a wavy
    front (4 samples per fold) and a flat back."""
    pts = []
    m = 4 * waves
    yf = yc - t / 2
    for i in range(m + 1):
        x = xa + (xb - xa) * i / m
        y = yf - amp * (1.0 - math.cos(2.0 * math.pi * i / 4.0)) / 2.0
        pts.append(Vector((x, y, z)))
    yb = yc + t / 2
    for x in (xb, (xa + xb) / 2, xa):
        pts.append(Vector((x, yb, z)))
    return pts


@builder("curtains")
def curtains(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    yc = 0.0
    rod_z = 245.0
    top = 241.0
    # rows: (z, panel width, fold amplitude)
    rows = ((0.0, 62.0, 5.6), (16.0, 58.0, 5.4), (66.0, 35.0, 5.6), (104.0, 23.0, 5.4), (152.0, 40.0, 5.0), (top, 57.0, 4.2))
    x_out = hw - 3.5
    for sgn in (-1, 1):
        secs = []
        for z, wd, amp in rows:
            xa, xb = (-x_out, -x_out + wd) if sgn < 0 else (x_out - wd, x_out)
            secs.append(_drape_section(xa, xb, z, yc, 3.0, amp))
        it.add("fabric", S.loft(secs, cap_bottom=False, cap_top=True))
        # metal tie-back band hugging the pinched drape
        z, wd, amp = rows[3]
        xa, xb = (-x_out, -x_out + wd) if sgn < 0 else (x_out - wd, x_out)
        it.cbox("metal", xa - 1.0, xb + 1.0, yc - 1.5 - amp - 0.8, yc + 1.5 + 0.8, z - 3.0, z + 3.0, r=1.2)
        # rings gathering the drape on the rod
        for f in (0.15, 0.85):
            wd_top = rows[-1][1]
            x = sgn * (x_out - wd_top * f)
            g = S.cyl(0.0, 0.0, -0.8, 0.8, 2.8, sides=6, b=0.0)
            g.rot("Y", 90).move(x, yc, rod_z)
            it.add("metal", g)
        # wall bracket
        bx = sgn * (hw - 14.0)
        it.box("metal", bx - 1.2, bx + 1.2, yc, hd, rod_z - 1.2, rod_z + 1.2)
        # ball finial
        fin = S.lathe([(0.0, 0.0), (1.8, 0.0), (3.5, 2.6), (2.4, 5.2), (0.0, 5.8)], 8, sharp=(1,))
        fin.rot("Y", 90 * sgn).move(sgn * (hw - 5.8), yc, rod_z)
        it.add("metal", fin)
    it.tube("metal", [(-hw + 5.8, yc, rod_z), (hw - 5.8, yc, rod_z)], 1.5, sides=8)


# ---------------------------------------------------------------------------
# 2. Wall art
# ---------------------------------------------------------------------------

def _mughal_arch(cu, wd, v0, rect_h, n=4, rr=0.75):
    """Pointed (two-centred) arch outline, CCW: base at v0, straight jambs
    up to the springing line, then two arcs meeting in a point."""
    R = rr * wd
    th = math.acos(1.0 - wd / (2.0 * R))
    vs = v0 + rect_h

    def fn(inset):
        pts = [(cu - wd / 2, v0), (cu + wd / 2, v0), (cu + wd / 2, vs)]
        cx = cu + wd / 2 - R
        for k in range(1, n + 1):
            a = th * k / n
            pts.append((cx + R * math.cos(a), vs + R * math.sin(a)))
        cx = cu - wd / 2 + R
        for k in range(n - 1, -1, -1):
            a = th * k / n
            pts.append((cx - R * math.cos(a), vs + R * math.sin(a)))
        return pts

    return fn, vs + R * math.sin(th)


def _hill(xa, xb, zb, H, n=8, skew=0.0):
    def fn(inset):
        pts = [(xa, zb), (xb, zb)]
        for k in range(1, n):
            t = 1.0 - k / n
            tt = t + skew * t * (1 - t)
            pts.append((xa + (xb - xa) * t, zb + H * math.sin(math.pi * tt) ** 0.85))
        return pts

    return fn


@builder("wall-art")
def wall_art(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    fw = 5.0
    # chunky wood frame and a recessed linen mount
    it.slab("wood", S.rrect(w, h, 2.2, seg=1, cv=h / 2), -hd, hd, b=0.9, seg=1, axis="Y", hole=S.rrect(w - 2 * fw, h - 2 * fw, 0.4, seg=1, cv=h / 2), hole_b=0.0)
    y_mat = -hd + 2.0
    it.box("linen", -hw + fw - 0.5, hw - fw + 0.5, y_mat, hd - 0.5, fw - 0.5, h - fw + 0.5)
    zb = fw
    # rolling hills (wood) running across the bottom
    it.slab("wood", _hill(-hw + fw, 8.0, zb, 15.0, n=6, skew=-0.3), y_mat - 0.7, y_mat, b=0.0, axis="Y", cap_bottom=False)
    it.slab("wood", _hill(-4.0, hw - fw, zb, 11.0, n=6, skew=0.25), y_mat - 0.9, y_mat, b=0.0, axis="Y", cap_bottom=False)
    # the jharokha: a bold pointed arch window frame (accent)
    outer, top_v = _mughal_arch(-6.0, 34.0, zb, 20.0, n=3)
    inner, _ = _mughal_arch(-6.0, 25.0, zb + 0.01, 17.5, n=3)
    it.slab("accent", outer, y_mat - 1.6, y_mat, b=0.0, axis="Y", hole=inner)
    # terracotta sun rising inside the arch
    it.slab("terracotta", S.circle(7.0, 10, cu=-6.0, cv=zb + 25.0, phase=math.pi / 10), y_mat - 1.1, y_mat, b=0.0, axis="Y", cap_bottom=False)
    # two little side arches (accent) flanking it
    for cu in (-31.0, 21.0):
        side, _ = _mughal_arch(cu, 11.0, zb, 9.0, n=3)
        it.slab("accent", side, y_mat - 1.0, y_mat, b=0.0, axis="Y", cap_bottom=False)


# ---------------------------------------------------------------------------
# 3. TV wall
# ---------------------------------------------------------------------------

@builder("tv-panel")
def tv_panel(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    y_groove = hd - 5.0
    depth = 1.6
    # full-height fluted wood panel
    it.box("wood", -hw, hw, y_groove + 0.3, hd, 0.0, h)
    _flutes(it, "wood", -hw, hw, 0.0, h, y_groove, depth, 28)
    y_face = y_groove - depth
    # floating console
    con_z0, con_top = 15.0, 45.0
    cw = 172.0
    it.rbox("wood", -cw / 2, cw / 2, -hd + 2.2, y_face, con_z0, con_top, r=2.4)
    n = 4
    fw = (cw - 3.0) / n
    for k in range(n):
        x0 = -cw / 2 + 1.5 + k * fw + 0.4
        x1 = x0 + fw - 0.8
        it.cbox("wood", x0, x1, -hd, -hd + 2.4, con_z0 + 2.2, con_top - 2.4, r=0.9)
        # short bar pulls near the meeting edges of each door pair
        pa, pb = (x1 - 14.0, x1 - 4.0) if k % 2 == 0 else (x0 + 4.0, x0 + 14.0)
        it.cbox("metal", pa, pb, -hd - 1.2, -hd + 0.3, con_top - 8.6, con_top - 6.8, r=0.6)
    # wall-mounted TV with cartoon glare
    tv_w, tv_z0, tv_z1 = 122.0, 86.0, 156.0
    ty0, ty1 = y_face - 4.6, y_face - 0.6
    it.rbox("rubber", -tv_w / 2, tv_w / 2, ty0, ty1, tv_z0, tv_z1, r=1.5)
    # slim raised bezel; the glare streaks run between its lips (which also
    # gives their ends some baked AO, so the glass keeps its colour stream)
    bz, bt = 2.2, 0.7
    xi = tv_w / 2 - 0.6
    it.box("rubber", -xi, xi, ty0 - bt, ty0 + 0.2, tv_z0 + 0.6, tv_z0 + 0.6 + bz)
    it.box("rubber", -xi, xi, ty0 - bt, ty0 + 0.2, tv_z1 - 0.6 - bz, tv_z1 - 0.6)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * xi, sx * (xi - bz)))
        it.box("rubber", x0, x1, ty0 - bt, ty0 + 0.2, tv_z0 + 0.6 + bz, tv_z1 - 0.6 - bz)
    z0, z1 = tv_z0 + 0.6 + bz, tv_z1 - 0.6 - bz
    for (xa, wa) in ((-36.0, 15.0), (-13.0, 6.0)):
        def streak(inset, xa=xa, wa=wa):
            sk = (z1 - z0) * 0.55
            return [(xa, z0), (xa + wa, z0), (xa + wa + sk, z1), (xa + sk, z1)]
        it.add("glass", S.panel(streak, ty0 - 0.03, axis="Y", facing=-1.0))
    # slim soundbar under the screen
    it.rbox("rubber", -34.0, 34.0, y_face - 7.0, y_face - 0.6, 72.0, 78.0, r=1.4)


# ---------------------------------------------------------------------------
# 4. Ceiling fan
# ---------------------------------------------------------------------------

def _fan_blade(R, r0=11.0, hw0=4.6, hw1=7.6):
    def fn(inset):
        return _blade_pts(R - inset, r0 + inset, hw0 - inset, hw1 - inset)

    return fn


def _blade_pts(R, r0, hw0, hw1):
    """Paddle outline (CCW): narrow root at r0, rounded tip at R."""
    pts = [(r0, -hw0), (R - hw1, -hw1)]
    for k in range(1, 6):
        a = -math.pi / 2 + math.pi * k / 6
        pts.append((R - hw1 + hw1 * math.cos(a), hw1 * math.sin(a)))
    pts += [(R - hw1, hw1), (r0, hw0)]
    return pts


def _fan_span(R, phi):
    xs, ys = [], []
    for k in range(3):
        a = math.radians(phi + 120 * k)
        for u, v in _fan_blade(R)(0.0):
            xs.append(u * math.cos(a) - v * math.sin(a))
            ys.append(u * math.sin(a) + v * math.cos(a))
    return max(xs) - min(xs), max(ys) - min(ys)


@builder("ceiling-fan")
def ceiling_fan(it):
    w, d, h = it.w, it.d, it.h
    # Three blades: oriented so the footprint's bounding box is square (a
    # three-fold fan can never be centred in both axes; the hub sits ~8 cm
    # off the box centre on the diagonal).
    phi = 105.0
    R = 62.0
    for _ in range(3):
        R *= w / _fan_span(R, phi)[0]
    bz = 7.5
    for k in range(3):
        a = phi + 120.0 * k
        blade = S.slab(_fan_blade(R), bz - 0.6, bz + 0.6, b=0.5, seg=1)
        blade.rot("X", 9.0, (0.0, 0.0, bz))
        blade.rot("Z", a)
        it.add("wood", blade)
        iron = S.box(6.0, 19.0, -2.2, 2.2, bz - 1.9, bz - 0.5)
        iron.rot("Z", a)
        it.add("metal", iron)
    # motor housing with a rounded bottom cap
    it.lathe("metal", [(0.0, 0.0), (5.0, 0.4), (9.8, 3.2), (11.4, 8.0), (9.6, 12.6), (4.0, 14.6), (0.0, 14.8)], 16)
    # downrod and ceiling canopy
    it.cyl("metal", 0.0, 0.0, 14.0, h - 3.2, 1.4, sides=6, b=0.0)
    it.lathe("metal", [(0.0, h - 4.6), (3.0, h - 4.6), (7.0, h - 2.2), (7.4, h), (0.0, h)], 10, sharp=(1, 3))


# ---------------------------------------------------------------------------
# 5. Wall light
# ---------------------------------------------------------------------------

@builder("wall-light")
def wall_light(it):
    w, d, h = it.w, it.d, it.h
    hd = d / 2
    ys = -1.6
    # pill-shaped back plate
    it.slab("metal", S.rrect(7.0, 24.0, 3.4, seg=1, cv=12.0), hd - 2.0, hd, b=0.5, seg=1, axis="Y", cap_bottom=False)
    # short swan-neck arm
    it.tube("metal", [(0.0, hd - 2.0, 8.0), (0.0, 2.0, 9.0), (0.0, ys, 12.2), (0.0, ys, 15.6)], 1.1, sides=6)
    # upturned tulip shade (oval so it hugs the wall), glowing inside
    sy = 0.66
    z0 = 14.6
    shade = S.lathe([(2.6, z0), (7.6, z0 + 4.2), (10.0, h), (9.0, h)], 14, sharp=(3,))
    liner = S.lathe([(0.0, z0 + 1.7), (1.9, z0 + 1.8), (6.8, z0 + 5.2), (9.1, h - 0.2)], 12)
    liner.flip()
    bulb = S.sphere(0.0, 0.0, z0 + 7.5, 3.0, sides=8, rings=4, rz=3.6)
    for g in (shade, liner, bulb):
        g.scl(1.0, sy, 1.0).move(0.0, ys, 0.0)
    it.add("accent", shade)
    it.add("glow", liner)
    it.add("glow", bulb)


# ---------------------------------------------------------------------------
# 6. Table lamp
# ---------------------------------------------------------------------------

@builder("table-lamp")
def table_lamp(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    # ginger-jar base
    it.lathe("accent", [(0.0, 0.0), (5.4, 0.0), (9.0, 3.2), (10.6, 8.4), (10.0, 13.8), (7.4, 18.4), (4.4, 21.4), (0.0, 22.0)], 14, sharp=(1,))
    # brass neck
    it.cyl("metal", 0.0, 0.0, 21.0, 36.0, 1.2, sides=6, b=0.0)
    # linen drum shade with a glowing liner and a lit top
    z0, z1 = 29.0, h
    rt = r * 0.8
    it.lathe("linen", [(r - 0.9, z0), (r, z0), (rt, z1), (rt - 0.9, z1)], 14, sharp=(1, 2))
    liner = S.lathe([(r - 0.9, z0 + 0.1), (rt - 0.9, z1 - 0.1)], 14)
    liner.flip()
    it.add("glow", liner)
    it.add("glow", S.panel(S.circle(rt - 1.0, 14), z1 - 4.0, axis="Z", facing=1.0))


# ---------------------------------------------------------------------------
# 7. Jhula swing
# ---------------------------------------------------------------------------

@builder("jhula")
def jhula(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    beam_z0, beam_z1 = h - 14.0, h - 4.0
    px = hw - 6.0
    for sx in (-1, 1):
        x = sx * px
        # broad foot spanning the depth
        it.rbox("wood", x - 5.5, x + 5.5, -hd, hd, 0.0, 9.5, r=3.2)
        # carved, turned post
        prof = [(0.0, 9.0), (6.0, 9.0), (4.3, 20.0), (4.0, 92.0), (6.0, 98.0), (4.0, 104.0), (4.3, beam_z0 - 8.0), (6.0, beam_z0), (0.0, beam_z0)]
        it.lathe("wood", prof, 8, sharp=(1, 7), cx=x)
        # diagonal braces from the foot into the post
        for sy in (-1, 1):
            it.tube("wood", [(x, sy * (hd - 14.0), 8.0), (x, sy * 3.5, 62.0)], 2.5, sides=6)
        # finial above the beam
        it.lathe("wood", [(0.0, beam_z1 - 0.5), (4.2, beam_z1 - 0.5), (2.4, beam_z1 + 2.0), (0.0, h)], 8, sharp=(1,), cx=x)
    # top beam
    it.rbox("wood", -hw, hw, -5.0, 5.0, beam_z0, beam_z1, r=2.6)
    # carved seat with low back and arm rails
    sw, sd = 130.0, 55.0
    sx0, sx1 = -sw / 2, sw / 2
    sy0, sy1 = -sd / 2, sd / 2
    seat_z = 45.0
    it.rbox("wood", sx0, sx1, sy0, sy1, seat_z - 6.0, seat_z, r=2.4)
    it.cbox("wood", sx0 + 3.0, sx1 - 3.0, sy0 + 0.5, sy0 + 3.5, seat_z - 12.0, seat_z - 5.0, r=1.2)
    rail_t = 3.6
    back_top = seat_z + 21.0
    arm_top = seat_z + 16.0
    it.cbox("wood", sx0 + 1.0, sx1 - 1.0, sy1 - rail_t - 1.0, sy1 - 1.0, back_top - 4.0, back_top, r=1.4)
    for k in range(5):
        bx = sx0 + 10.0 + k * (sw - 20.0) / 4
        it.box("wood", bx - 1.3, bx + 1.3, sy1 - rail_t, sy1 - 2.0, seat_z, back_top - 3.0)
    for s in (-1, 1):
        ax = s * (sw / 2 - 2.8)
        it.cbox("wood", ax - 2.2, ax + 2.2, sy0 + 2.0, sy1 - 1.0, arm_top - 4.0, arm_top, r=1.4)
        for fy in (sy0 + 4.0, sy0 + 18.0, sy0 + 32.0):
            it.box("wood", ax - 1.2, ax + 1.2, fy - 1.2, fy + 1.2, seat_z, arm_top - 3.0)
    # cushion and a round bolster along the back
    it.rbox("fabric", sx0 + 6.0, sx1 - 6.0, sy0 + 3.0, sy1 - 6.0, seat_z - 0.5, seat_z + 6.0, r=3.0, div=(2, 2, 1), puff=(0.4, 0.4, 1.4))
    bol = S.cyl(0.0, 0.0, sx0 + 8.0, sx1 - 8.0, 6.0, sides=8, b=2.0, seg=1)
    bol.rot("Y", 90).move(0.0, sy1 - 10.5, seat_z + 11.0)
    it.add("fabric", bol)
    # four chains up to the beam
    for s in (-1, 1):
        cx = s * (sw / 2 - 2.8)
        for cy, cz in ((sy0 + 4.0, arm_top), (sy1 - 3.0, back_top)):
            it.tube("metal", [(cx, cy, cz - 1.0), (cx, cy * 0.05, beam_z0 + 0.5)], 1.4, sides=5)


# ---------------------------------------------------------------------------
# 8. Diwan
# ---------------------------------------------------------------------------

@builder("diwan")
def diwan(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.lathe("wood", [(0.0, 0.0), (2.2, 0.0), (3.5, 5.0), (2.3, 10.0), (3.4, 15.0), (0.0, 15.0)], 6, sharp=(1, 4), cx=sx * (hw - 7.0), cy=sy * (hd - 7.0))
    it.rbox("wood", -hw, hw, -hd, hd, 14.0, 27.0, r=2.6)
    # thick mattress
    it.rbox("fabric", -hw + 2.0, hw - 2.0, -hd + 1.0, hd - 2.5, 25.0, 40.0, r=6.0, div=(2, 1, 1), puff=(0.5, 0.6, 1.4))
    # round bolsters (gol takiya) at both ends
    br = 9.0
    for sx in (-1, 1):
        g = S.cyl(0.0, 0.0, -hd + 9.0, hd - 9.5, br, sides=8, b=2.4, seg=1)
        g.rot("X", -90).move(sx * (hw - br - 2.5), 0.0, 40.0 + br - 1.5)
        it.add("linen", g)
    # three back cushions leaning against the back
    x0, x1 = -hw + 2.5 + 2 * br + 1.0, hw - 2.5 - 2 * br - 1.0
    cw = (x1 - x0) / 3
    for k in range(3):
        a, b = x0 + k * cw + 0.6, x0 + (k + 1) * cw - 0.6
        cx = (a + b) / 2
        g = S.rbox(a, b, hd - 16.0, hd - 3.0, 38.0, h + 1.0, r=5.0, div=(2, 1, 2), puff=(0.6, 2.2, 0.8))
        g.rot("X", -11.0, (cx, hd - 9.0, 38.0))
        it.add("fabric", g)


# ---------------------------------------------------------------------------
# 9. Shoe rack
# ---------------------------------------------------------------------------

def _shoe(it, x0, x1, y_toe, z0, kind):
    """A chunky shoe: rubber sole and a terracotta upper extruded from its
    side profile (toe toward -Y)."""
    L = 22.0 if kind != "boot" else 21.0
    it.box("rubber", x0, x1, y_toe, y_toe + L, z0, z0 + 1.4)
    zs = z0 + 1.4
    if kind == "sneaker":
        prof = [(0.0, 0.0), (L, 0.0), (L + 0.3, 6.6), (L - 4.5, 7.6), (L - 8.5, 5.6), (L - 14.0, 4.8), (2.2, 3.6), (-0.3, 1.6)]
    elif kind == "boot":
        prof = [(0.0, 0.0), (L, 0.0), (L + 0.2, 13.5), (L - 6.0, 13.8), (L - 9.5, 6.0), (L - 14.0, 4.8), (2.4, 3.6), (-0.3, 1.6)]
    else:  # loafer
        prof = [(0.0, 0.0), (L, 0.0), (L + 0.2, 4.4), (L - 3.5, 4.2), (L - 8.0, 3.8), (L - 13.0, 3.9), (2.4, 3.1), (-0.3, 1.4)]

    def fn(inset):
        return [(y_toe + u, zs + v) for u, v in prof]

    it.slab("terracotta", fn, x0 + 0.3, x1 - 0.3, b=0.0, axis="X")


@builder("shoe-rack")
def shoe_rack(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    t = 2.6
    # carcass: sides, flat top, back, shelves
    for sx in (-1, 1):
        it.cbox("wood", min(sx * hw, sx * (hw - t)), max(sx * hw, sx * (hw - t)), -hd + 0.5, hd, 0.0, h - 3.0, r=0.9)
    it.cbox("wood", -hw, hw, -hd, hd, h - 3.6, h, r=1.0)
    it.box("wood", -hw + t, hw - t, hd - 1.6, hd, 0.0, h - 3.0)
    it.box("wood", -hw + t, hw - t, -hd + 1.5, hd - 1.0, 1.5, 4.5)
    shelf_z = 33.0
    it.cbox("wood", -hw + t - 0.2, hw - t + 0.2, -hd + 0.8, hd - 1.0, shelf_z - 3.0, shelf_z, r=0.8)
    # two louvred doors
    dz0, dz1 = shelf_z + 0.4, h - 4.0
    yd = -hd + 3.2  # door face
    for x0, x1 in ((-hw + t + 0.2, -0.4), (0.4, hw - t - 0.2)):
        it.cbox("wood", x0, x1, yd, yd + 2.2, dz0, dz1, r=1.0)
        nl = 5
        span = (dz1 - dz0 - 9.0) / nl
        for k in range(nl):
            zc = dz0 + 4.5 + span * (k + 0.5)
            g = S.box(x0 + 3.2, x1 - 3.2, -0.6, 0.6, -span * 0.48, span * 0.48)
            g.rot("X", -32.0)
            g.move(0.0, yd - 0.1, zc)
            it.add("wood", g)
        kx = x1 - 4.0 if x0 < 0 else x0 + 4.0
        g = S.cyl(0.0, 0.0, 0.0, 1.6, 1.5, sides=6, b=0.0)
        g.rot("X", 90).move(kx, yd - 1.2, (dz0 + dz1) / 2 + 2.0)
        it.add("metal", g)
    # three pairs of chunky shoes on the open shelf
    zf = 4.5
    pairs = (("sneaker", -hw + t + 3.0), ("boot", -11.0), ("loafer", hw - t - 23.0))
    for kind, xl in pairs:
        sw = 9.2
        for j in range(2):
            xa = xl + j * (sw + 1.0)
            _shoe(it, xa, xa + sw, -hd + 2.5 + (1.0 if j else 0.0), zf, kind)


# ---------------------------------------------------------------------------
# 10. Crockery sideboard
# ---------------------------------------------------------------------------

@builder("sideboard")
def sideboard(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    leg_h = 13.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(it, "wood", sx * (hw - 7.0), sy * (hd - 7.0), 0.0, leg_h + 1.0, r0=2.6, r1=1.7, sides=6)
    yf = -hd + 2.6  # carcass front
    top0 = h - 4.0
    niche_x = -hw + 40.0  # right edge of the open crockery niche
    # right cabinet (three fluted doors)
    it.cbox("wood", niche_x, hw, yf, hd, leg_h, top0 + 0.4, r=1.4)
    # left: low cabinet under an open niche, side cheek and back
    it.cbox("wood", -hw + 3.0, niche_x + 0.5, yf, hd, leg_h, 47.0, r=1.2)
    it.cbox("wood", -hw, -hw + 3.4, yf - 0.4, hd, leg_h, top0 + 0.4, r=1.0)
    it.box("wood", -hw + 3.0, niche_x, hd - 2.6, hd, 46.0, top0 + 0.2)
    # top board overhanging slightly
    it.rbox("wood", -hw, hw, -hd, hd, top0, h, r=1.6)
    # fluted doors
    dz0, dz1 = leg_h + 2.5, top0 - 2.0
    dw = (hw - niche_x - 2.0) / 3
    for k in range(3):
        x0 = niche_x + 1.0 + k * dw + 0.5
        x1 = x0 + dw - 1.0
        _flutes(it, "wood", x0, x1, dz0, dz1, yf, 1.5, 7)
        hx = x1 - 3.2 if k == 0 else (x0 + 3.2 if k == 2 else x1 - 3.2)
        g = S.cyl(0.0, 0.0, 0.0, 1.4, 1.5, sides=6, b=0.0)
        g.rot("X", 90).move(hx, yf - 1.4, (dz0 + dz1) / 2 + 4.0)
        it.add("metal", g)
    _flutes(it, "wood", -hw + 4.0, niche_x - 0.5, dz0, 44.5, yf, 1.5, 6)
    g = S.cyl(0.0, 0.0, 0.0, 1.4, 1.5, sides=6, b=0.0)
    g.rot("X", 90).move(niche_x - 4.0, yf - 1.4, 34.0)
    it.add("metal", g)
    # crockery in the niche: a stack of plates and a lidded jar
    nz = 47.0
    jx, jy = -hw + 13.0, -3.0
    it.lathe("ceramic", [(0.0, nz), (5.0, nz), (7.8, nz + 6.0), (6.6, nz + 13.0), (3.4, nz + 15.6), (2.2, nz + 18.6), (0.0, nz + 19.4)], 12, sharp=(1,), cx=jx, cy=jy)
    px, py = niche_x - 12.0, -6.0
    for k, (dx, dz) in enumerate(((0.0, 0.0), (0.6, 1.6), (-0.4, 3.2))):
        it.lathe("ceramic", [(0.0, nz + dz), (6.4, nz + dz), (9.4, nz + dz + 1.4), (0.0, nz + dz + 1.2)], 10, sharp=(1, 2), cx=px + dx, cy=py)


# ---------------------------------------------------------------------------
# 11. Console table
# ---------------------------------------------------------------------------

@builder("console-table")
def console_table(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    top0 = h - 3.6
    it.rbox("wood", -hw, hw, -hd, hd, top0, h, r=1.6)
    # apron with a drawer
    it.cbox("wood", -hw + 3.0, hw - 3.0, -hd + 3.0, hd - 2.0, top0 - 10.0, top0 + 0.2, r=1.0)
    it.cbox("wood", -hw * 0.6, hw * 0.6, -hd + 1.6, -hd + 3.4, top0 - 9.0, top0 - 1.0, r=0.8)
    for sx in (-1, 1):
        g = S.cyl(0.0, 0.0, 0.0, 1.8, 1.3, sides=6, b=0.0)
        g.rot("X", 90).move(sx * hw * 0.3, -hd + 1.6, top0 - 5.0)
        it.add("metal", g)
    # tapered legs and a lower shelf
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg(it, "wood", sx * (hw - 5.0), sy * (hd - 5.0), 0.0, top0 - 9.5, r0=2.5, r1=1.6, sides=6)
    it.cbox("wood", -hw + 3.5, hw - 3.5, -hd + 3.0, hd - 3.0, 14.0, 17.0, r=1.0)


# ---------------------------------------------------------------------------
# 12. Pouf
# ---------------------------------------------------------------------------

@builder("ottoman")
def ottoman(it):
    w, d, h = it.w, it.d, it.h
    r = w / 2
    prof = [(0.0, 0.0), (r - 5.5, 0.0), (r - 1.4, 4.0), (r, 18.0), (r - 1.2, 32.0), (r - 5.5, 39.6), (r - 13.0, h), (3.0, h - 1.0), (0.0, h - 1.8)]
    it.lathe("fabric", prof, 20, sharp=(1,))
    it.lathe("fabric", [(0.0, h - 1.9), (2.0, h - 1.7), (1.6, h - 0.8), (0.0, h - 0.6)], 6)


# ---------------------------------------------------------------------------
# 13. Headboard panel
# ---------------------------------------------------------------------------

@builder("bed-panel")
def bed_panel(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    trim = 3.6
    it.slab("wood", S.rrect(w, h, 1.8, seg=1, cv=h / 2), -hd, hd, b=0.8, seg=1, axis="Y", hole=S.rrect(w - 2 * trim, h - 2 * trim, 0.4, seg=1, cv=h / 2), hole_b=0.0)
    x0, x1 = -hw + trim - 0.2, hw - trim + 0.2
    it.box("fabric", x0, x1, 0.0, hd - 0.5, trim - 0.2, h - trim + 0.2)
    n = max(6, round((x1 - x0) / 19.0))
    _channels(it, "fabric", x0, x1, trim - 0.2, h - trim + 0.2, 0.2, hd - 0.8, n, end=6.0)


# ---------------------------------------------------------------------------
# 14. Chimney hood
# ---------------------------------------------------------------------------

@builder("kitchen-chimney")
def kitchen_chimney(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # metal filter/trim band at the bottom edge
    it.cbox("metal", -hw, hw, -hd, hd, 0.4, 3.4, r=1.0)
    # hood body and a sloped canopy into the duct
    it.cbox("accent", -hw + 0.5, hw - 0.5, -hd + 0.5, hd, 3.0, 11.0, r=1.4)
    dw, dd = 28.0, 25.0
    lo = S.ring_pts(S.rrect(w - 1.6, d - 1.6, 2.0, seg=2, cv=0.4), 10.6)
    hi = S.ring_pts(S.rrect(dw + 2.0, dd + 1.0, 2.0, seg=2, cv=hd - (dd + 1.0) / 2), 30.0)
    it.add("accent", S.loft([lo, hi], cap_bottom=False, cap_top=False, smooth=False))
    # metal collar and the vertical duct
    it.cbox("metal", -dw / 2 - 1.2, dw / 2 + 1.2, hd - dd - 1.4, hd, 29.0, 32.5, r=0.8)
    it.cbox("accent", -dw / 2, dw / 2, hd - dd, hd, 32.0, h, r=1.2)
    # touch panel on the front band
    it.box("glow", -10.0, 10.0, -hd + 0.3, -hd + 0.6, 6.0, 8.0)
    for k in range(3):
        bx = 13.0 + k * 4.0
        it.box("metal", bx - 1.2, bx + 1.2, -hd + 0.1, -hd + 0.6, 6.0, 8.0)
    # two lights on the underside
    for sx in (-1, 1):
        it.cyl("glow", sx * 18.0, -6.0, 0.0, 0.6, 3.2, sides=8, b=0.0)


# ---------------------------------------------------------------------------
# 15. Backsplash tile module
# ---------------------------------------------------------------------------

def _face(g, pts, ref):
    """Flat face with its own vertices, wound to face away from ``ref``."""
    pts = [Vector(p) for p in pts]
    n = S.face_normal(pts, list(range(len(pts))))
    c = sum(pts, Vector()) / len(pts)
    if n.dot(c - Vector(ref)) < 0:
        pts.reverse()
        n = -n
    g.add_f([g.add_v(p, n) for p in pts])


def _tile_flat(x0, x1, z0, z1, yb, yf, bev):
    """Bevelled tile facing -Y without a back face (10 tris)."""
    g = S.Geo()
    B = [(x0, yb, z0), (x1, yb, z0), (x1, yb, z1), (x0, yb, z1)]
    F = [(x0 + bev, yf, z0 + bev), (x1 - bev, yf, z0 + bev), (x1 - bev, yf, z1 - bev), (x0 + bev, yf, z1 - bev)]
    ref = ((x0 + x1) / 2, yb + 2.0, (z0 + z1) / 2)
    _face(g, F, ref)
    for a in range(4):
        b = (a + 1) % 4
        _face(g, [B[a], B[b], F[b], F[a]], ref)
    return g


def _tile_diamond(x0, x1, z0, z1, yb, ys, ya):
    """Diamond-cut tile: a low step then four facets meeting in a point."""
    g = S.Geo()
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    B = [(x0, yb, z0), (x1, yb, z0), (x1, yb, z1), (x0, yb, z1)]
    E = [(x0, ys, z0), (x1, ys, z0), (x1, ys, z1), (x0, ys, z1)]
    A = (cx, ya, cz)
    ref = (cx, yb + 2.0, cz)
    for i in range(4):
        j = (i + 1) % 4
        _face(g, [B[i], B[j], E[j], E[i]], ref)
        _face(g, [E[i], E[j], A], ref)
    return g


@builder("backsplash-module")
def backsplash_module(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    yb = hd - 0.9
    it.box("ceramic", -hw, hw, yb, hd, 0.0, h)
    cols, rows = 4, 4
    cw, ch = w / cols, h / rows
    gap = 0.9
    for i in range(cols):
        for j in range(rows):
            x0 = -hw + i * cw + gap / 2
            z0 = j * ch + gap / 2
            x1, z1 = x0 + cw - gap, z0 + ch - gap
            if (i + j) % 2 == 0:
                it.add("accent", _tile_diamond(x0, x1, z0, z1, yb, yb - 0.45, -hd))
            else:
                it.add("ceramic", _tile_flat(x0, x1, z0, z1, yb, -hd + 0.25, 0.9))


# ---------------------------------------------------------------------------
# 16. Mirror cabinet
# ---------------------------------------------------------------------------

@builder("mirror-cabinet")
def mirror_cabinet(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    body_z0 = 13.0
    yf = -hd + 2.4
    it.cbox("wood", -hw, hw, yf, hd, body_z0, h, r=1.4)
    # mirror door
    it.slab("glass", S.rrect(w - 9.0, h - body_z0 - 9.0, 3.0, seg=2, cv=(h + body_z0) / 2), yf - 1.2, yf + 0.2, b=0.0, axis="Y", cap_bottom=False)
    # door frame proud of the carcass
    it.slab("wood", S.rrect(w - 2.0, h - body_z0 - 2.0, 2.4, seg=1, cv=(h + body_z0) / 2), -hd, yf + 0.2, b=0.6, seg=1, axis="Y", hole=S.rrect(w - 9.0, h - body_z0 - 9.0, 2.0, seg=1, cv=(h + body_z0) / 2), hole_b=0.0)
    # open shelf below with an LED strip under its bottom edge
    it.cbox("wood", -hw, hw, yf + 0.6, hd, 2.0, 5.0, r=1.0)
    for sx in (-1, 1):
        it.box("wood", sx * hw - (2.2 if sx > 0 else 0.0), sx * hw + (0.0 if sx > 0 else 2.2), yf + 1.0, hd, 4.5, body_z0 + 0.5)
    it.box("glow", -hw + 6.0, hw - 6.0, yf + 1.5, 2.0, 0.0, 2.2)


# ---------------------------------------------------------------------------
# 17. Cushion set
# ---------------------------------------------------------------------------

def _pillow(x0, x1, y0, y1, z0, z1, puff):
    """Plump cushion: puffed rounded box whose corners pinch thin."""
    g = S.rbox(x0, x1, y0, y1, z0, z1, r=6.0, div=(2, 1, 2), puff=puff)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    hx, hz = (x1 - x0) / 2, (z1 - z0) / 2

    def pinch(p):
        u, v = (p.x - cx) / hx, (p.z - cz) / hz
        k = (u * u) * (v * v)
        return (cx + (p.x - cx) * (1 + 0.04 * k), cy + (p.y - cy) * (1 - 0.5 * k), cz + (p.z - cz) * (1 + 0.04 * k))

    return g.warp(pinch).smooth_normals()


@builder("cushions")
def cushions(it):
    w, d, h = it.w, it.d, it.h
    hw = w / 2
    t = 12.0
    side = 38.0
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (hw - 0.5), sx * (hw - 0.5 - side)))
        cx = (x0 + x1) / 2
        g = _pillow(x0, x1, -t / 2, t / 2, 0.0, side + 1.0, (1.4, 3.0, 1.4))
        g.rot("X", -7.0, (cx, 0.0, 0.0))
        g.rot("Z", -sx * 3.0, (cx, 0.0, 0.0))
        it.add("fabric", g)
    # smaller accent cushion in front, with a linen tufting button
    mw, mh, my = 34.0, 31.0, -1.5
    g = _pillow(-mw / 2, mw / 2, my - t / 2, my + t / 2, 0.0, mh, (1.4, 3.0, 1.4))
    g.rot("X", -6.0, (0.0, my, 0.0))
    it.add("accent", g)
    btn = S.lathe([(0.0, 0.0), (2.0, 0.4), (0.0, 1.3)], 6)
    btn.rot("X", 90).move(0.0, my - t / 2 - 2.8 + 0.5, mh * 0.5)
    btn.rot("X", -6.0, (0.0, my, 0.0))
    it.add("linen", btn)


# ---------------------------------------------------------------------------
# 18. Vase & books
# ---------------------------------------------------------------------------

def _sprig(it, pts, leaves, rng):
    """A slim stem through ``pts`` with flat leaves: ``leaves`` is a list of
    (t along the stem, side -1/0/1, length)."""
    path = pts
    it.tube("leaf", path, [0.55 - 0.2 * k / (len(path) - 1) for k in range(len(path))], sides=3, caps=False)
    P = [Vector(p) for p in pts]
    for t, side, ln in leaves:
        seg = min(int(t * (len(P) - 1)), len(P) - 2)
        f = t * (len(P) - 1) - seg
        base = P[seg].lerp(P[seg + 1], f)
        stem = (P[seg + 1] - P[seg]).normalized()
        if side == 0:
            tip = base + stem * ln
            up = Vector((0.0, -1.0, 0.2))
        else:
            out = stem.cross(Vector((0.0, -1.0, 0.0))).normalized() * side
            tip = base + (out * 0.75 + stem * 0.65).normalized() * ln
            up = Vector((0.0, -0.4, 1.0))
        it.add("leaf", S.leaf_sheet(base, tip, 1.35, droop=0.08 if side else 0.0, segs=2, up=up, curl=0.15))


@builder("vase-books")
def vase_books(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    # a short stack of books lying flat (covers + page blocks)
    books = (("accent", 23.0, 19.0, 3.6, -4.0), ("linen", 21.0, 17.5, 3.2, 3.0), ("accent", 18.0, 15.0, 2.8, -8.0))
    z = 0.0
    bx, by = -hw + 12.0, -1.5
    for slot, bw, bd, bt, rot in books:
        cov = S.box(-bw / 2, bw / 2, -bd / 2, bd / 2, 0.0, bt)
        pages = S.box(-bw / 2 - 0.3, bw / 2 + 0.3, -bd / 2 - 0.3, bd / 2 - 1.4, 0.55, bt - 0.55)
        for g in (cov, pages):
            g.rot("Z", rot).move(bx, by, z)
        it.add(slot, cov)
        it.add("ceramic", pages)
        z += bt
    # round ceramic vase on the right
    vx, vy = hw - 10.0, 2.0
    top = 20.6
    it.lathe("ceramic", [(0.0, 0.0), (5.2, 0.0), (9.6, 6.5), (9.0, 13.0), (4.4, 18.0), (4.9, top), (0.0, top - 0.8)], 12, sharp=(1, 5), cx=vx, cy=vy)
    # leafy sprigs
    rng = it.rng
    base = (vx, vy, top - 1.0)
    sprigs = (
        ([base, (vx - 3.0, vy - 1.5, 27.0), (vx - 7.0, vy - 4.0, h - 8.0)], ((0.5, -1, 5.0), (0.62, 1, 5.0), (0.85, -1, 4.6), (1.0, 0, 4.6))),
        ([base, (vx + 0.6, vy + 2.5, 28.5), (vx + 1.5, vy + 6.0, h - 5.0)], ((0.55, 1, 5.0), (0.7, -1, 5.0), (0.88, 1, 4.4), (1.0, 0, 4.6))),
        ([base, (vx + 3.4, vy - 1.5, 24.5), (vx + 5.5, vy - 4.5, h - 12.5)], ((0.5, 1, 4.4), (0.72, -1, 4.4), (1.0, 0, 4.4))),
    )
    for pts, leaves in sprigs:
        _sprig(it, pts, leaves, rng)

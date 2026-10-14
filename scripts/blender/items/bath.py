"""Bathroom and laundry items."""

from dh import shapes as S

from . import builder


def _ell(rx, ry, z, cy=0.0, n=16):
    return S.ring_pts(S.ellipse(rx, ry, n, cv=cy), z)


@builder("toilet")
def toilet(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    bowl_cy = -hd + 25.5
    # pedestal flaring into the bowl
    it.add("ceramic", S.loft([_ell(12.0, 17.0, 0.0, bowl_cy + 2), _ell(10.8, 15.5, 13.0, bowl_cy + 2), _ell(15.5, 21.5, 27.0, bowl_cy), _ell(18.6, 25.0, 36.0, bowl_cy), _ell(18.8, 25.3, 38.0, bowl_cy)]))
    # seat ring and closed lid
    it.slab("ceramic", S.ellipse(19.6, 25.6, 16, cv=bowl_cy), 38.0, 40.0, b=0.0, hole=S.ellipse(11.5, 15.5, 16, cv=bowl_cy - 1.0))
    it.slab("ceramic", S.ellipse(19.2, 25.3, 16, cv=bowl_cy - 0.3), 40.0, 43.2, b=1.3, seg=2)
    # cistern with a slightly wider lid and chrome flush button
    it.rbox("ceramic", -hw + 1.5, hw - 1.5, hd - 17.5, hd, 39.0, h - 3.2, r=4.0)
    it.rbox("ceramic", -hw, hw, hd - 18.5, hd, h - 3.6, h - 0.7, r=1.3)
    it.cyl("metal", 0.0, hd - 9.0, h - 1.0, h, 2.8, sides=10, b=0.0)


@builder("vanity")
def vanity(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    top_z = 74.0
    it.box("wood", -hw + 2.5, hw - 2.5, -hd + 6.0, hd - 1.0, 0.0, 10.5)
    it.rbox("wood", -hw, hw, -hd + 4.2, hd, 10.0, top_z, r=2.0)
    for x0, x1 in ((-hw + 0.8, -0.4), (0.4, hw - 0.8)):
        it.cbox("wood", x0, x1, -hd + 2.0, -hd + 4.4, 12.0, top_z - 3.0, r=1.0)
        g = S.cyl(0.0, 0.0, 0.0, 2.0, 1.4, sides=8, b=0.0)
        g.rot("X", 90).move((x0 + x1) / 2 + (6.0 if x0 < 0 else -6.0), -hd + 2.0, top_z - 12.0)
        it.add("metal", g)
    # ceramic top with a round vessel basin
    it.rbox("ceramic", -hw, hw, -hd, hd, top_z, top_z + 3.5, r=1.4)
    bz = top_z + 3.5
    by = -2.0
    prof = [(0.0, bz), (10.5, bz), (14.8, bz + 2.6), (16.6, bz + 6.6), (16.2, bz + 7.4), (15.1, bz + 7.0), (13.6, bz + 3.6), (9.0, bz + 1.9), (0.0, bz + 1.7)]
    it.lathe("ceramic", prof, 14, sharp=(1,), cy=by)
    it.cyl("water", 0.0, by, bz + 1.6, bz + 3.9, 12.6, sides=14, b=0.0)
    # deck tap behind the bowl
    ty = hd - 5.0
    it.cyl("metal", 0.0, ty, bz - 0.5, h - 2.4, 1.5, sides=8, b=0.0)
    it.tube("metal", [(0.0, ty + 0.2, h - 2.6), (0.0, ty - 3.0, h - 2.5), (0.0, ty - 7.0, h - 3.0), (0.0, ty - 8.6, h - 4.6)], 0.95, sides=8)
    it.cbox("metal", -0.8, 0.8, ty - 0.8, ty + 3.5, h - 1.6, h, r=0.4)


@builder("mirror")
def mirror(it):
    w, d, h = it.w, it.d, it.h
    hd = d / 2
    it.slab("wood", S.rrect(w, h, 17.0, seg=3, cv=h / 2), -hd, hd, b=0.0, axis="Y", hole=S.rrect(w - 11.0, h - 11.0, 11.5, seg=3, cv=h / 2))
    it.add("glass", S.panel(S.rrect(w - 10.6, h - 10.6, 11.8, seg=3, cv=h / 2), -hd + 1.6, axis="Y", facing=-1.0))


@builder("shower")
def shower(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    tray_h = 6.0
    it.rbox("ceramic", -hw, hw, -hd, hd, 0.0, tray_h, r=2.2)
    it.cyl("water", 0.0, 0.0, tray_h - 0.1, tray_h + 0.25, 17.0, sides=16, b=0.0)
    it.cyl("metal", 0.0, 0.0, tray_h + 0.2, tray_h + 0.45, 4.0, sides=10, b=0.0)
    # glass screens: front (with an entry gap on the left) and right side
    top = h - 6.0
    it.cbox("glass", -hw + 32.0, hw - 1.0, -hd + 1.0, -hd + 2.0, tray_h, top, r=0.4)
    it.cbox("glass", hw - 2.0, hw - 1.0, -hd + 1.0, hd, tray_h, top, r=0.4)
    # chrome frame: corner post and top rails
    it.cbox("metal", hw - 2.4, hw, -hd + 0.6, -hd + 2.4, tray_h, top + 1.2, r=0.6)
    it.box("metal", -hw + 31.0, hw, -hd + 0.6, -hd + 2.4, top, top + 1.2)
    it.box("metal", hw - 2.4, hw - 0.6, -hd + 0.6, hd, top, top + 1.2)
    it.box("metal", -hw + 31.0, -hw + 32.8, -hd + 0.6, -hd + 2.4, tray_h, top + 1.2)
    # riser pipe, arm and a big round rain head
    px, py = -hw + 9.0, hd - 3.0
    it.cyl("metal", px, py, 95.0, h - 5.0, 1.2, sides=8, b=0.0)
    it.tube("metal", [(px, py, h - 5.5), (px + 6.0, py - 6.0, h - 2.0), (-6.0, 6.0, h - 2.0)], 1.0, sides=6)
    it.cyl("metal", -6.0, 6.0, h - 3.2, h, 12.0, sides=14, b=0.8, seg=1)
    g = S.cyl(0.0, 0.0, 0.0, 2.6, 4.2, sides=10, b=0.0)
    g.rot("X", 90).move(px, hd, 105.0)
    it.add("metal", g)


@builder("bathtub")
def bathtub(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    feet = 7.0
    rim = h - 4.0

    def rr(ww, dd, r, z):
        return S.ring_pts(S.rrect(ww, dd, r, seg=4), z)

    sections = [
        rr(w - 14.0, d - 12.0, 22.0, feet),
        rr(w - 4.0, d - 3.0, 26.0, feet + 6.0),
        rr(w, d - 0.5, 28.0, rim - 12.0),
        rr(w, d, 28.0, rim - 2.0),
        rr(w - 3.0, d - 3.0, 26.5, rim),
        rr(w - 16.0, d - 16.0, 20.0, rim),
        rr(w - 20.0, d - 20.0, 18.0, rim - 4.0),
        rr(w - 30.0, d - 26.0, 14.0, feet + 9.0),
    ]
    it.add("ceramic", S.loft(sections, cap_bottom=True, cap_top=True))
    it.slab("water", S.rrect(w - 24.0, d - 22.0, 15.0, seg=4), feet + 8.0, rim - 9.0, b=0.0, cap_bottom=False)
    # little chrome ball feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            it.sphere("metal", sx * (hw - 24.0), sy * (hd - 13.0), feet / 2 + 0.6, feet / 2 + 0.6, sides=8, rings=4, rz=feet / 2 + 0.6)
    # spout hooking over the rim at the left end + two valves
    ex = -hw + 6.0
    it.tube("metal", [(ex - 3.0, 0.0, rim - 4.0), (ex - 1.0, 0.0, h - 1.2), (ex + 5.0, 0.0, h - 1.2), (ex + 8.5, 0.0, rim - 1.0)], [1.2, 1.2, 1.1, 1.0], sides=8)
    for sy in (-1, 1):
        it.cyl("metal", ex - 1.0, sy * 7.0, rim - 1.0, h - 0.5, 1.7, sides=8, b=0.0)


@builder("washing-machine")
def washing_machine(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    it.rbox("ceramic", -hw, hw, -hd + 1.6, hd, 0.0, h, r=4.0)
    cz = 37.0
    it.slab("metal", S.circle(18.0, 14, cv=cz), -hd + 0.2, -hd + 2.0, b=0.0, hole=S.circle(13.0, 14, cv=cz), axis="Y")
    it.slab("rubber", S.circle(13.4, 14, cv=cz), -hd + 1.0, -hd + 1.8, b=0.0, hole=S.circle(11.4, 14, cv=cz), axis="Y")
    it.slab("glass", S.circle(11.8, 14, cv=cz), -hd + 0.8, -hd + 1.7, b=0.0, axis="Y", cap_bottom=False)
    # control strip, dial, detergent drawer
    it.cbox("rubber", -hw + 3.0, hw - 3.0, -hd + 0.9, -hd + 2.0, h - 13.0, h - 3.5, r=0.8)
    g = S.cyl(0.0, 0.0, 0.0, 1.8, 3.4, sides=12, b=0.5, seg=1)
    g.rot("X", 90).move(hw - 12.0, -hd + 1.0, h - 8.2)
    it.add("metal", g)
    it.box("ceramic", -hw + 5.0, -hw + 22.0, -hd, -hd + 1.0, h - 12.0, h - 4.5)


@builder("laundry-counter")
def laundry_counter(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    top_z = 86.0
    it.rbox("wood", -hw, hw, -hd, hd, top_z - 4.0, top_z, r=1.6)
    for sx in (-1, 1):
        it.cbox("wood", sx * hw - 4.0 * sx - 2.0, sx * hw - 4.0 * sx + 2.0, -hd + 2.0, hd - 1.0, 0.0, top_z - 4.0, r=1.0)
    it.cbox("wood", -hw + 5.0, hw - 5.0, -hd + 3.0, hd - 2.0, 10.0, 13.0, r=1.0)
    # stacks of folded linen on the worktop and the shelf
    rng = it.rng
    z = top_z
    for k in range(3):
        dx = rng.uniform(-1.2, 1.2)
        it.cbox("linen", -hw + 12.0 + dx, -hw + 42.0 + dx, -hd + 10.0, -hd + 34.0, z, z + 1.33, r=0.6)
        z += 1.33
    for k in range(2):
        x0 = 6.0 + k * 1.0
        it.cbox("linen", x0, x0 + 34.0, -hd + 8.0, -hd + 36.0, 13.0 + k * 7.0, 20.0 + k * 7.0, r=2.6)

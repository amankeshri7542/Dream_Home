"""A cute rounded hatchback. Length along Y, front toward -Y (three +Z)."""

from dh import shapes as S

from . import builder

BODY_Z0, BODY_Z1 = 20.0, 86.0
CAB_Y0, CAB_Y1 = -58.0, 186.0
CAB_Z0 = 82.0


def _cabin_warp(h):
    ymid = (CAB_Y0 + CAB_Y1) / 2
    span_f = ymid - CAB_Y0
    span_r = CAB_Y1 - ymid

    def fn(p):
        if p.z <= CAB_Z0:
            return (p.x, p.y, p.z)
        dz = p.z - CAB_Z0
        tf = max(0.0, min(1.0, (ymid - p.y) / span_f))
        tr = max(0.0, min(1.0, (p.y - ymid) / span_r))
        # windscreen raked back, hatch slightly forward, gentle tumblehome
        y = p.y + dz * (0.62 * tf ** 1.2 - 0.16 * tr ** 1.5)
        x = p.x * (1.0 - 0.10 * (dz / (h - CAB_Z0)) ** 1.6)
        return (x, y, p.z)

    return fn


@builder("car")
def car(it):
    w, d, h = it.w, it.d, it.h
    hw, hd = w / 2, d / 2
    warp = _cabin_warp(h)
    # wheels stick out a little past the body: toy-like stance
    tr, tw = 32.0, 22.0
    for wy in (-hd + 78.0, hd - 76.0):
        for sx in (-1, 1):
            tyre = S.cyl(0.0, 0.0, -tw / 2, tw / 2, tr, sides=14, b=4.5, seg=1)
            tyre.rot("Y", 90).move(sx * (hw - tw / 2), wy, tr)
            it.add("rubber", tyre)
            hub = S.cyl(0.0, 0.0, 0.0, 1.6, 15.0, sides=12, b=0.0)
            hub.rot("Y", 90 * sx).move(sx * (hw - 0.8), wy, tr)
            it.add("metal", hub)
    bw = hw - 10.0
    # lower body
    it.rbox("accent", -bw, bw, -hd + 6.0, hd - 6.0, BODY_Z0, BODY_Z1, r=22.0, seg=4)
    # bubbly cabin
    cab = S.rbox(-bw + 7.0, bw - 7.0, CAB_Y0, CAB_Y1, CAB_Z0, h, r=16.0, seg=4)
    cab.warp(warp).smooth_normals()
    it.add("accent", cab)
    # windows sit just proud of the cabin's flat panels and follow the warp
    wz0, wz1 = CAB_Z0 + 16.0, h - 17.0
    xs = bw - 7.0
    for sx in (-1, 1):
        for (y0, y1) in ((CAB_Y0 + 20.0, 58.0), (68.0, CAB_Y1 - 22.0)):
            g = S.slab(S.rrect(y1 - y0, wz1 - wz0, 7.0, seg=2, cu=(y0 + y1) / 2, cv=(wz0 + wz1) / 2), xs - 0.6, xs + 0.7, b=0.0, axis="X")
            if sx < 0:
                g.scl(-1.0, 1.0, 1.0)
            g.warp(warp)
            it.add("glass", g)
    ws = S.slab(S.rrect(2 * xs - 34.0, wz1 - wz0 + 2.0, 8.0, seg=2, cv=(wz0 + wz1) / 2 + 1.0), CAB_Y0 - 0.7, CAB_Y0 + 0.6, b=0.0, axis="Y")
    ws.warp(warp)
    it.add("glass", ws)
    rw = S.slab(S.rrect(2 * xs - 40.0, wz1 - wz0 - 4.0, 8.0, seg=2, cv=(wz0 + wz1) / 2 + 1.0), CAB_Y1 - 0.6, CAB_Y1 + 0.7, b=0.0, axis="Y")
    rw.warp(warp)
    it.add("glass", rw)
    # chrome bumpers
    for sy in (-1, 1):
        y0, y1 = sorted((sy * hd, sy * (hd - 13.0)))
        it.rbox("metal", -bw - 2.0, bw + 2.0, y0, y1, 24.0, 40.0, r=6.0)
    # big round headlights ("eyes"), grille smile, tail lights
    for sx in (-1, 1):
        g = S.cyl(0.0, 0.0, 0.0, 4.0, 11.0, sides=14, b=1.5, seg=1)
        g.rot("X", 90).move(sx * 46.0, -hd + 7.0, 60.0)
        it.add("glass", g)
        it.cbox("glass", sx * 58.0 - 9.0, sx * 58.0 + 9.0, hd - 7.5, hd - 4.5, 56.0, 68.0, r=2.0)
    it.cbox("rubber", -24.0, 24.0, -hd + 4.5, -hd + 8.0, 44.0, 52.0, r=3.0)
    # little side mirrors
    for sx in (-1, 1):
        it.cbox("accent", sx * (bw - 2.0) - 4.0 * (sx < 0) - 0.0, sx * (bw - 2.0) + 4.0 * (sx > 0), CAB_Y0 + 4.0, CAB_Y0 + 14.0, BODY_Z1 + 4.0, BODY_Z1 + 11.0, r=2.0)

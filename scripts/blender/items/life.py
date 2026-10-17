"""Lived-in details kit (public/models/life.glb): the small everyday and
festive things that make a designed home look lived in.

Builders receive a ``LifeItem`` (scripts/blender/build_life.py) and add
pieces with ``it.add(slot, geo, colour, part=None)`` in centimetres, Blender
axes (front = -Y, up = +Z). Colours are sRGB: a hex string, an (r, g, b)
tuple, a list (one per vertex) or ``fn(p, n)``. They are stored per vertex
because the kit has no textures. The item is fitted to its life.json box
afterwards, so the sizes here are design sizes close to the catalog ones.
"""

import math

from mathutils import Matrix, Vector

from dh import shapes as S

LIFE = {}


def life(*ids):
    def deco(fn):
        for i in ids:
            LIFE[i] = fn
        return fn

    return deco


# ---------------------------------------------------------------------------
# Colour helpers (sRGB 0..1 tuples)
# ---------------------------------------------------------------------------

def rgb(c):
    if isinstance(c, str):
        h = c.lstrip("#")
        return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(c)


def mix(a, b, t):
    a, b = rgb(a), rgb(b)
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def shade(c, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in rgb(c))


def grad(axis, v0, v1, c0, c1):
    """Colour ramp along a world axis between v0 and v1."""
    i = "xyz".index(axis)
    return lambda p, n: mix(c0, c1, (p[i] - v0) / (v1 - v0))


def by_up(top, side, thr=0.5):
    return lambda p, n: top if (n is not None and n.z > thr) else side


def paint(geo, fn):
    """Evaluate a colour function now, before the geo is moved."""
    return [rgb(fn(p, n)) for p, n in zip(geo.v, geo.n)]


class Group:
    """Pieces transformed together before they reach the item."""

    def __init__(self):
        self.parts = []

    def add(self, slot, geo, colour):
        self.parts.append((slot, geo, colour))
        return geo

    def rot(self, axis, deg, about=(0.0, 0.0, 0.0)):
        for _, g, _ in self.parts:
            g.rot(axis, deg, about)
        return self

    def move(self, x=0.0, y=0.0, z=0.0):
        for _, g, _ in self.parts:
            g.move(x, y, z)
        return self

    def scl(self, sx, sy=None, sz=None, about=(0.0, 0.0, 0.0)):
        for _, g, _ in self.parts:
            g.scl(sx, sy, sz, about)
        return self

    def emit(self, it, part=None):
        for slot, g, c in self.parts:
            it.add(slot, g, c, part)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def poly(pts):
    pts = [tuple(p) for p in pts]
    return lambda inset: pts


def fix_winding(g):
    """Turn each face to agree with its vertices' normals (custom shapes)."""
    out = []
    for face in g.f:
        fn = S.face_normal(g.v, face, weighted=True)
        ref = Vector((0.0, 0.0, 0.0))
        for i in face:
            if g.n[i] is not None:
                ref += g.n[i]
        out.append(tuple(reversed(face)) if ref.length > 1e-9 and fn.dot(ref) < 0 else face)
    g.f = out
    return g


def decal(pts, n):
    """A flat polygon facing ``n`` (labels, prints, pictures)."""
    g = S.Geo()
    ids = [g.add_v(p, n) for p in pts]
    g.add_f(tuple(ids))
    return fix_winding(g)


def quad_z(x0, x1, y0, y1, z):
    return decal([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], (0.0, 0.0, 1.0))


def quad_y(x0, x1, z0, z1, y, facing=-1.0):
    return decal([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], (0.0, facing, 0.0))


def quad_x(y0, y1, z0, z1, x, facing=1.0):
    return decal([(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)], (facing, 0.0, 0.0))


def poly_y(pts_xz, y, facing=-1.0):
    return decal([(x, y, z) for x, z in pts_xz], (0.0, facing, 0.0))


def ngon_z(cx, cy, r, n, z, phase=0.0, ry=None):
    ry = r if ry is None else ry
    return decal([(cx + r * math.cos(phase + 2 * math.pi * k / n), cy + ry * math.sin(phase + 2 * math.pi * k / n), z) for k in range(n)], (0.0, 0.0, 1.0))


def ngon_y(cx, cz, r, n, y, phase=0.0, rz=None, facing=-1.0):
    rz = r if rz is None else rz
    return decal([(cx + r * math.cos(phase + 2 * math.pi * k / n), y, cz + rz * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)], (0.0, facing, 0.0))


def band(pts, z0, z1):
    """Side walls only of an outline extruded z0..z1 (a sole's edge layer)."""
    g = S.Geo()
    n = len(pts)
    ctr = Vector((sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n, 0.0))
    lo, hi = [], []
    for x, y in pts:
        d = Vector((x, y, 0.0)) - ctr
        lo.append(g.add_v((x, y, z0), d))
        hi.append(g.add_v((x, y, z1), d))
    for i in range(n):
        j = (i + 1) % n
        g.add_f((lo[i], lo[j], hi[j], hi[i]))
    return fix_winding(g)


def torus_x(cx, cy, cz, R, r, seg=14, sides=4, phase=math.pi / 4):
    """Ring around the X axis (tyres, wheel rims)."""
    g = S.Geo()
    rings = []
    X = Vector((1.0, 0.0, 0.0))
    for i in range(seg):
        a = 2 * math.pi * i / seg
        radial = Vector((0.0, math.cos(a), math.sin(a)))
        c = Vector((cx, cy, cz)) + radial * R
        ring = []
        for k in range(sides):
            b = phase + 2 * math.pi * k / sides
            n = radial * math.cos(b) + X * math.sin(b)
            ring.append(g.add_v(c + n * r, n))
        rings.append(ring)
    for i in range(seg):
        i2 = (i + 1) % seg
        for k in range(sides):
            k2 = (k + 1) % sides
            g.add_f((rings[i][k], rings[i][k2], rings[i2][k2], rings[i2][k]))
    return fix_winding(g)


def torus_z(cx, cy, cz, R, r, seg=14, sides=3, phase=0.0, ry=None):
    """Horizontal ring (piping around a round cushion)."""
    ry = R if ry is None else ry
    g = S.Geo()
    rings = []
    Z = Vector((0.0, 0.0, 1.0))
    for i in range(seg):
        a = 2 * math.pi * i / seg
        radial = Vector((math.cos(a), math.sin(a), 0.0))
        c = Vector((cx + R * math.cos(a), cy + ry * math.sin(a), cz))
        ring = []
        for k in range(sides):
            b = phase + 2 * math.pi * k / sides
            n = radial * math.cos(b) + Z * math.sin(b)
            ring.append(g.add_v(c + n * r, n))
        rings.append(ring)
    for i in range(seg):
        i2 = (i + 1) % seg
        for k in range(sides):
            k2 = (k + 1) % sides
            g.add_f((rings[i][k], rings[i][k2], rings[i2][k2], rings[i2][k]))
    return fix_winding(g)


def loop_tube(pts, r, sides=3):
    """Closed loop of tube (piping) through ``pts``."""
    pts = [Vector(p) for p in pts]
    return S.tube(pts + [pts[0]], r, sides=sides, caps=False)


def sphere_wedge(c, r, a0, a1, cols=2, rings=6):
    """One gore of a beach ball (its own vertices, so it takes its own colour)."""
    c = Vector(c)
    g = S.Geo()
    grid = []
    for j in range(cols + 1):
        a = a0 + (a1 - a0) * j / cols
        col = []
        for k in range(1, rings):
            lat = -math.pi / 2 + math.pi * k / rings
            n = Vector((math.cos(lat) * math.cos(a), math.cos(lat) * math.sin(a), math.sin(lat)))
            col.append(g.add_v(c + n * r, n))
        grid.append(col)
    south = g.add_v(c + Vector((0.0, 0.0, -r)), (0.0, 0.0, -1.0))
    north = g.add_v(c + Vector((0.0, 0.0, r)), (0.0, 0.0, 1.0))
    for j in range(cols):
        for k in range(rings - 2):
            g.add_f((grid[j][k], grid[j + 1][k], grid[j + 1][k + 1], grid[j][k + 1]))
        g.add_f((south, grid[j + 1][0], grid[j][0]))
        g.add_f((north, grid[j][-1], grid[j + 1][-1]))
    return fix_winding(g)


HEART = [(0.13, 0.0), (0.0, 0.34), (0.40, 0.50), (1.0, 0.0), (0.40, -0.50), (0.0, -0.34)]
LANCE = [(0.0, 0.0), (0.28, 0.36), (0.68, 0.27), (1.0, 0.0), (0.68, -0.27), (0.28, -0.36)]


def leaf(base, tip, width, up=(0.0, 0.0, 1.0), shape=HEART, fold=0.12, droop=0.0, thick=0.16, centre=0.42, edge="#2f6e2a", mid="#86b24a"):
    """A closed two-sided leaf (12 tris for 6 outline points): top and
    bottom fans a hair apart so it reads with or without back-face culling.
    Edges are lifted a little (V fold) and the midrib is lighter."""
    base, tip = Vector(base), Vector(tip)
    ax = tip - base
    L = ax.length
    f = ax / L
    side = f.cross(Vector(up))
    if side.length < 1e-6:
        side = f.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    nrm = side.cross(f).normalized()

    def pos(u, v, lift):
        return base + f * (u * L) + side * (v * width) + nrm * (lift - droop * L * u * u)

    outline = [pos(u, v, fold * width * abs(v) * 2.0) for u, v in shape]
    c = pos(centre, 0.0, 0.0)
    g = S.Geo()
    cols = []
    for sgn in (1.0, -1.0):
        off = nrm * (thick * 0.5 * sgn)
        ids = [g.add_v(p + off, nrm * sgn) for p in outline]
        ct = g.add_v(c + off, nrm * sgn)
        cols += [rgb(edge)] * len(ids) + [rgb(mid)]
        for i in range(len(ids)):
            g.add_f((ct, ids[i], ids[(i + 1) % len(ids)]))
    fix_winding(g)
    g.smooth_normals()
    return g, cols


def wheel_x(cx, cy, cz, r, w, sides=8):
    g = S.cyl(0.0, 0.0, -w / 2, w / 2, r, sides=sides, b=0.0)
    g.rot("Y", 90.0)
    return g.move(cx, cy, cz)


def thin(a, b, r=0.5, sides=4, caps=False):
    return S.tube([a, b], r, sides=sides, caps=caps)


# ---------------------------------------------------------------------------
# Footwear: a foot-shaped outline (right foot, toe toward +Y)
# ---------------------------------------------------------------------------

FOOT = [(0.0, -0.5), (0.13, -0.47), (0.16, -0.3), (0.17, -0.08), (0.20, 0.14), (0.19, 0.34), (0.13, 0.46), (0.03, 0.5), (-0.09, 0.48), (-0.18, 0.24), (-0.14, -0.04), (-0.15, -0.3), (-0.12, -0.47)]
FOOT10 = [(0.0, -0.5), (0.13, -0.45), (0.16, -0.15), (0.20, 0.15), (0.16, 0.42), (0.04, 0.5), (-0.09, 0.47), (-0.18, 0.22), (-0.14, -0.12), (-0.12, -0.45)]


def foot(L, wk=1.0, n=13, left=False):
    src = FOOT if n == 13 else FOOT10
    pts = [(u * L * wk, v * L) for u, v in src]
    if left:
        pts = [(-x, y) for x, y in reversed(pts)]
    return pts


def _mirror(pts, left):
    s = -1.0 if left else 1.0
    return [(s * x, y, z) for x, y, z in pts]


def mens_sandal(left):
    """Dark leather sandal: thick sole, a broad instep strap, a toe strap and
    a back strap with a brass buckle."""
    G = Group()
    L, t = 27.0, 2.2
    leather = "#4b2c1b"
    G.add("life", S.slab(poly(foot(L, 1.0, 13, left)), 0.0, t, b=0.0, cap_bottom=False), by_up("#8a5634", "#2a1a11"))
    inst = _mirror([(-0.185 * L, 0.10 * L, t - 0.5), (-0.12 * L, 0.09 * L, t + 3.4), (0.07 * L, 0.08 * L, t + 3.6), (0.205 * L, 0.11 * L, t - 0.5)], left)
    G.add("life", S.tube(inst, 0.42, sides=4, caps=False, scale_v=3.6), leather)
    toe = _mirror([(-0.17 * L, 0.30 * L, t - 0.5), (-0.07 * L, 0.30 * L, t + 2.6), (0.09 * L, 0.31 * L, t + 2.4), (0.19 * L, 0.32 * L, t - 0.5)], left)
    G.add("life", S.tube(toe, 0.38, sides=4, caps=False, scale_v=2.4), leather)
    heel = _mirror([(-0.15 * L, -0.15 * L, t - 0.4), (-0.165 * L, -0.31 * L, t + 5.8), (-0.1 * L, -0.455 * L, t + 8.6), (0.0, -0.5 * L, t + 9.0), (0.11 * L, -0.455 * L, t + 8.6), (0.165 * L, -0.31 * L, t + 5.8), (0.15 * L, -0.15 * L, t - 0.4)], left)
    G.add("life", S.tube(heel, 1.05, sides=4, caps=False, scale_v=0.3), leather)
    bx = (0.172 * L) * (-1.0 if left else 1.0)
    G.add("life", S.box(bx - 0.4, bx + 0.4, -0.31 * L - 0.9, -0.31 * L + 0.9, t + 4.7, t + 6.4), "#c9a24a")
    return G


def chappal(left):
    """A woman's flat chappal: tan footbed, a broad maroon band with a gold
    bead and a little toe ring."""
    G = Group()
    L, t, wk = 24.0, 1.1, 0.9
    maroon = "#a3263f"
    G.add("life", S.slab(poly(foot(L, wk, 13, left)), 0.0, t, b=0.0, cap_bottom=False), by_up("#dcb27b", "#8a4a2c"))
    bandp = _mirror([(-0.168 * L, 0.17 * L, t - 0.4), (-0.1 * L, 0.165 * L, t + 2.4), (0.1 * L, 0.165 * L, t + 2.4), (0.183 * L, 0.18 * L, t - 0.4)], left)
    G.add("life", S.tube(bandp, 0.32, sides=4, caps=False, scale_v=7.5), maroon)
    ring = _mirror([(-0.04 * L, 0.26 * L, t + 1.9), (-0.05 * L, 0.36 * L, t + 1.2), (-0.055 * L, 0.43 * L, t + 0.5), (-0.055 * L, 0.45 * L, t - 0.3)], left)
    G.add("life", S.tube(ring, 0.3, sides=3, caps=False), maroon)
    G.add("life", S.sphere(0.0, 0.165 * L, t + 2.85, 0.75, sides=4, rings=2), "#e0b443")
    return G


def kid_shoe(left):
    """A child's red sneaker: white rubber sole, an upper lofted from the
    foot outline up to the ankle opening, white laces and a velcro strap."""
    G = Group()
    L = 17.0
    pts = foot(L, 1.08, 10, left)
    G.add("life", S.slab(poly(pts), 0.0, 1.5, b=0.0, cap_bottom=False), by_up("#f1eee7", "#e9e4da"))
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    secs = []
    for z, kx, ky, dy in ((1.4, 1.0, 1.0, 0.0), (5.4, 0.9, 0.84, -0.06 * L), (7.8, 0.62, 0.4, -0.24 * L)):
        secs.append([Vector((cx + (x - cx) * kx, cy + (y - cy) * ky + dy, z)) for x, y in pts])
    upper = S.loft(secs, cap_bottom=False, cap_top=True)
    G.add("life", upper, lambda p, n: "#33231f" if n.z > 0.995 else "#d23b34")
    s = -1.0 if left else 1.0
    for v, z in ((0.1, 5.9), (0.2, 4.9)):
        G.add("life", thin((s * -2.2, v * L, z), (s * 2.4, v * L, z), r=0.28, sides=3), "#f4f1ea")
    strap = [(s * -4.1, -0.04 * L, 4.4), (s * -1.6, -0.06 * L, 6.6), (s * 1.8, -0.06 * L, 6.6), (s * 4.2, -0.03 * L, 4.4)]
    G.add("life", S.tube(strap, 0.3, sides=3, caps=False, scale_v=4.0), "#f4f1ea")
    return G


@life("shoes")
def shoes(it):
    """Footwear kicked off by the door: a man's leather sandals, a woman's
    chappals and a child's red sneakers, loosely askew (no mat: the porch
    draws its own)."""
    for left, x, y, a in ((True, -28.5, 6.5, 9.0), (False, -15.0, 9.5, -5.0)):
        mens_sandal(left).rot("Z", a).move(x, y, 0.0).emit(it)
    for left, x, y, a in ((True, 14.5, 9.0, 14.0), (False, 27.5, 7.0, -7.0)):
        chappal(left).rot("Z", a).move(x, y, 0.0).emit(it)
    kid_shoe(True).rot("Z", 78.0).move(-8.0, -16.0, 0.0).emit(it)
    kid_shoe(False).rot("Z", 104.0).move(11.5, -17.0, 0.0).emit(it)


@life("slippers")
def slippers(it):
    """Rubber bathroom slippers: white foam sole on a blue layer, blue V strap."""
    blue = "#2d63b5"
    for left, x, y, a in ((True, -9.4, -1.2, 7.0), (False, 9.4, 1.2, -9.0)):
        G = Group()
        L = 25.5
        pts = foot(L, 0.95, 10, left)
        G.add("life", S.slab(poly(pts), 0.45, 1.65, b=0.0, cap_bottom=False), by_up("#f4f2ec", "#e8e5dd"))
        G.add("life", band(pts, 0.0, 0.5), blue)
        strap = _mirror([(-0.165 * L, 0.0, 1.2), (-0.125 * L, 0.12 * L, 3.75), (-0.075 * L, 0.26 * L, 3.0), (-0.04 * L, 0.335 * L, 1.75), (0.015 * L, 0.25 * L, 3.0), (0.11 * L, 0.11 * L, 3.75), (0.175 * L, 0.0, 1.2)], left)
        G.add("life", S.tube(strap, 0.62, sides=4, caps=False, scale_v=0.55), blue)
        G.rot("Z", a).move(x, y, 0.0).emit(it)


# ---------------------------------------------------------------------------
# Paper
# ---------------------------------------------------------------------------

@life("newspaper")
def newspaper(it):
    """A folded broadsheet: two sheets with a rounded fold, a red masthead,
    a headline, a photo and grey columns of text."""
    W, D = 36.0, 28.0
    paper, edge = "#efe9db", "#d6cebd"
    it.add("life", S.box(-W / 2, W / 2, -D / 2, D / 2, 0.0, 1.0), by_up(paper, edge))
    G = Group()
    G.add("life", S.box(-W / 2 + 0.2, W / 2 - 0.3, -D / 2 + 0.25, D / 2 - 0.2, 1.1, 2.1), by_up(paper, edge))
    z = 2.16
    G.add("life", quad_z(-16.6, 16.4, 9.4, 12.9, z), "#c8302f")
    G.add("life", quad_z(-15.2, 3.0, 10.4, 11.9, z + 0.03), "#f6f0e4")
    G.add("life", quad_z(-16.6, 9.5, 6.4, 8.3, z), "#3b3936")
    G.add("life", quad_z(-16.6, -4.4, -3.6, 5.2, z), grad("y", -3.6, 5.2, "#6e6a60", "#9fb0b8"))
    G.add("life", quad_z(-12.5, -8.0, -3.6, 1.6, z + 0.03), "#5a4a3e")
    grey = "#a7a298"
    for x0, x1, top, rows in ((-2.6, 6.6, 4.9, 7), (8.2, 16.4, 4.9, 7), (-16.6, -4.4, -5.0, 3)):
        for k in range(rows):
            y1 = top - k * 2.45
            G.add("life", quad_z(x0, x1 if k != rows - 1 else x0 + (x1 - x0) * 0.6, y1 - 1.25, y1, z), grey)
    G.rot("Y", -1.0, (-W / 2, 0.0, 1.1))
    G.rot("Z", 1.6)
    G.emit(it)
    it.add("life", S.tube([(-W / 2, -D / 2 + 0.3, 1.06), (-W / 2, D / 2 - 0.3, 1.06)], 1.06, sides=6), edge)


# ---------------------------------------------------------------------------
# Kitchen and table
# ---------------------------------------------------------------------------

def chai_glass(it, x, y, z, h=9.45):
    sides = 8
    glass, through, top = "#dde5e1", "#8a5530", "#b98250"
    it.add("life", S.lathe([(0.0, z), (2.3, z), (2.4, z + 0.9)], sides, smooth=False, cx=x, cy=y), "#c7d2cd")
    it.add("life", S.lathe([(2.4, z + 0.9), (2.75, z + h * 0.68)], sides, smooth=False, cx=x, cy=y), through)
    it.add("life", S.lathe([(2.75, z + h * 0.68), (3.05, z + h), (2.85, z + h), (2.7, z + h * 0.74)], sides, smooth=False, cx=x, cy=y), glass)
    it.add("life", S.lathe([(2.7, z + h * 0.74), (0.0, z + h * 0.74)], sides, smooth=False, cx=x, cy=y), top)


@life("chai")
def chai(it):
    """Two cutting-chai glasses and Parle-G style biscuits on a steel tray."""
    W, D = 30.0, 20.0
    secs = [
        S.ring_pts(S.rrect(W, D, 3.0, seg=2), 0.0),
        S.ring_pts(S.rrect(W, D, 3.0, seg=2), 1.55),
        S.ring_pts(S.rrect(W - 1.1, D - 1.1, 2.45, seg=2), 1.7),
        S.ring_pts(S.rrect(W - 1.6, D - 1.6, 2.2, seg=2), 0.55),
    ]
    it.add("steel", S.loft(secs, cap_bottom=False, cap_top=True), "#c9cdd1")
    chai_glass(it, -6.8, 2.2, 0.55)
    chai_glass(it, 4.6, -2.4, 0.55)
    for (x, y, z, a) in ((10.6, 4.6, 0.55, 18.0), (10.9, 4.2, 1.2, -9.0), (-11.2, -4.6, 0.55, 64.0)):
        g = S.box(-3.0, 3.0, -2.2, 2.2, 0.0, 0.62)
        g.rot("Z", a).move(x, y, z)
        it.add("life", g, by_up("#dca451", "#c58a3c"))


@life("pressure-cooker")
def pressure_cooker(it):
    """A classic aluminium cooker: soot at the base, the lid, long stacked
    black bakelite handles and the whistle weight on the vent."""
    cx = -6.4
    alu, soot, lid = "#c2c6c9", "#57524d", "#d3d6d9"
    prof = [(0.0, 0.0), (11.0, 0.0), (12.0, 2.2), (12.0, 18.6), (12.6, 19.6), (11.0, 21.4), (4.0, 22.6), (0.0, 22.8)]
    col = lambda p, n: mix(soot, alu, p.z / 3.2) if p.z < 19.0 else lid
    it.add("steel", S.lathe(prof, 14, sharp=(1, 3, 4), cx=cx), col)
    it.add("steel", S.cyl(cx, 0.0, 22.4, 24.6, 0.75, sides=6, b=0.0), "#b9bdc0")
    it.add("steel", S.cyl(cx - 5.4, 3.2, 21.6, 23.6, 1.05, sides=6, b=0.0), "#a9adb0")
    black = "#1f1d1c"
    it.add("life", S.lathe([(0.0, 24.2), (1.75, 24.2), (1.7, 26.8), (0.95, 27.4), (1.45, 28.5), (0.9, 29.7), (0.0, 30.0)], 8, sharp=(1,), cx=cx), black)
    it.add("life", S.cbox(cx + 13.4, 19.0, -1.55, 1.55, 15.3, 18.2, r=0.9), black)
    it.add("life", S.cbox(cx + 10.0, 19.0, -1.75, 1.75, 18.75, 21.3, r=1.0), black)
    it.add("steel", S.box(cx + 11.5, cx + 14.5, -1.9, 1.9, 15.0, 18.5), "#a9adb0")


@life("steel-set")
def steel_set(it):
    """Washed steel: a stack of thalis, a round dabba and three tumblers (two
    nested), the plates' rims catching the light."""
    tx, ty = -6.4, 0.6
    lower = [(0.0, 0.0), (9.0, 0.0), (13.3, 1.3), (13.7, 1.8), (13.0, 1.85), (0.0, 1.85)]
    it.add("steel", S.lathe(lower, 10, sharp=(1, 3), cx=tx, cy=ty), lambda p, n: "#dfe2e5" if p.z > 1.5 else "#bfc3c7")
    ux, uy = tx + 0.9, ty - 0.7
    top = [(0.0, 1.8), (9.0, 1.8), (13.4, 2.9), (13.9, 3.35), (13.1, 3.45), (9.6, 2.4), (0.0, 2.4)]

    def top_col(p, n):
        r = math.hypot(p.x - ux, p.y - uy)
        if r > 13.3:
            return "#e6e9eb"
        return "#aeb2b6" if (p.z > 2.3 and r < 10.0) else "#c9cdd1"

    it.add("steel", S.lathe(top, 12, sharp=(1, 3, 4), cx=ux, cy=uy), top_col)

    def tumbler(x, y, z, k=1.0):
        prof = [(0.0, z), (2.9 * k, z), (3.35 * k, z + 11.0 * k), (3.1 * k, z + 11.0 * k), (2.75 * k, z + 1.2 * k), (0.0, z + 1.2 * k)]
        it.add("steel", S.lathe(prof, 8, sharp=(1, 2, 3), cx=x, cy=y), lambda p, n: "#d8dbde" if p.z > z + 1.0 else "#b9bdc1")

    tumbler(16.2, 9.4, 0.0)
    tumbler(16.0, 1.8, 0.0)
    tumbler(16.0, 1.8, 4.95, k=0.955)
    it.add("steel", S.lathe([(0.0, 0.0), (5.4, 0.0), (5.6, 6.0), (5.95, 6.25), (5.5, 7.5), (0.0, 7.7)], 7, sharp=(1, 2, 3), cx=12.8, cy=-8.6), "#c5c9cd")


def _fruit(geo, fn):
    return geo, paint(geo, fn)


@life("fruit-bowl")
def fruit_bowl(it):
    """A brass bowl heaped with mangoes, an apple, grapes and a hand of
    bananas curving over the rim."""
    it.add("steel", S.lathe([(0.0, 0.0), (6.0, 0.0), (7.0, 1.3), (12.5, 4.6), (15.2, 8.6), (14.4, 9.1), (12.6, 7.2), (0.0, 5.2)], 12, sharp=(1, 2, 4, 5)), "#d6a94f")

    def mango(sx, sy, sz, rz, rx, at):
        g = S.sphere(0.0, 0.0, 0.0, 1.0, sides=6, rings=4)
        cols = paint(g, lambda p, n: mix(mix("#f2b233", "#e0702c", max(0.0, p.z) * 1.2), "#8fa83a", max(0.0, p.y - 0.55) * 2.6))
        g.scl(sx, sy, sz).rot("X", rx).rot("Z", rz).move(*at)
        it.add("life", g, cols)

    mango(4.6, 6.4, 4.2, 32.0, 8.0, (-4.8, 3.2, 8.4))
    mango(4.4, 6.2, 4.0, -48.0, -6.0, (4.6, 1.0, 8.2))
    ap = S.sphere(0.0, 0.0, 0.0, 3.6, sides=7, rings=4, rz=3.3)
    cols = paint(ap, lambda p, n: mix("#e9b44a", "#c62f2a", 0.55 + p.z / 5.0))
    ap.move(0.4, 7.6, 10.2)
    it.add("life", ap, cols)
    it.add("life", thin((0.4, 7.6, 13.2), (0.7, 7.4, 14.2), r=0.28, sides=3), "#5a4026")
    for (x, y, z) in ((-8.4, -5.6, 8.0), (-6.0, -7.6, 8.0), (-9.4, -8.6, 7.5), (-7.4, -6.8, 10.2), (-10.2, -6.2, 9.6)):
        it.add("life", S.sphere(x, y, z, 1.45, sides=5, rings=3), "#6a2c5e")
    crown = Vector((12.2, -2.0, 9.6))
    for path in (
        [(12.2, -2.0, 9.6), (7.2, -5.6, 11.8), (1.4, -7.8, 11.6), (-3.6, -8.6, 9.8)],
        [(12.4, -2.6, 9.3), (8.6, -8.4, 10.6), (3.4, -11.6, 9.6), (-1.2, -12.6, 8.2)],
        [(12.0, -1.4, 9.9), (6.6, -2.4, 12.6), (1.0, -3.6, 12.6), (-4.0, -4.4, 10.8)],
    ):
        path = [Vector(p) for p in path]
        g = S.tube(path, [0.85, 1.55, 1.45, 0.75], sides=5, caps=True)
        cols = []
        for i in range(len(path)):
            cols += [rgb("#9aa338") if i == 0 else rgb("#f2cf3c") if i < len(path) - 1 else rgb("#d9b738")] * 5
        cols += [rgb("#5b4325")] * 5 + [rgb("#3a2a1a")] * 5
        it.add("life", g, cols)
    it.add("life", S.cyl(crown.x + 0.6, crown.y, crown.z - 1.0, crown.z + 1.2, 1.0, sides=5, b=0.0), "#6b5a2e")


@life("school-bag")
def school_bag(it):
    """A kid's blue backpack: orange front pocket with a sun badge, navy
    straps and grab handle, a water bottle in the side pocket."""
    blue, navy, orange = "#2f6fb8", "#23385f", "#f08a2c"
    body = S.rbox(-15.0, 15.0, -6.0, 8.0, 0.0, 40.0, r=6.0, seg=1)

    def top_round(p):
        k = max(0.0, (p.z - 30.0) / 10.0)
        return (p.x * (1.0 - 0.22 * k * k), p.y, p.z)

    body.warp(top_round).smooth_normals()
    it.add("life", body, lambda p, n: mix(navy, blue, p.z / 4.0))
    it.add("life", S.cbox(-11.0, 11.0, -10.0, -5.4, 4.0, 22.0, r=2.0), orange)
    it.add("life", quad_y(-9.0, 9.0, 18.6, 19.3, -10.03), "#3a2a20")
    it.add("life", ngon_y(5.0, 11.5, 2.4, 8, -10.05), "#f7d33c")
    it.add("life", quad_y(-9.5, 9.5, 33.2, 33.8, -6.04), "#1d2b47")
    it.add("life", S.cbox(5.6, 7.0, -6.9, -5.9, 31.0, 33.6, r=0.3), "#f7d33c")
    it.add("life", S.tube([(-3.6, 1.0, 39.0), (-2.6, 1.0, 41.8), (2.6, 1.0, 41.8), (3.6, 1.0, 39.0)], 0.55, sides=4, caps=False), navy)
    for sx in (-1.0, 1.0):
        it.add("life", S.tube([(sx * 5.4, 8.0, 37.0), (sx * 7.0, 10.0, 28.0), (sx * 8.6, 10.0, 14.0), (sx * 11.0, 8.0, 4.0)], 2.4, sides=4, caps=False, scale_v=0.32), navy)
    it.add("life", S.cbox(13.6, 17.4, -3.8, 5.0, 2.5, 15.0, r=1.2), "#285f9e")
    it.add("life", S.cyl(16.4, 0.6, 5.0, 26.0, 3.0, sides=8, b=0.0), "#3fa34d")
    it.add("life", S.cyl(16.4, 0.6, 25.8, 28.6, 2.2, sides=8, b=0.0), "#f4f1ea")


@life("toys")
def toys(it):
    """A beach ball, a little auto-rickshaw and wooden blocks, scattered."""
    cols = ("#e2483a", "#f5c638", "#3a7bd5", "#f4f1ea", "#3fa34d", "#f08a2c")
    for k in range(6):
        it.add("life", sphere_wedge((-16.0, 10.5, 9.0), 9.0, 2 * math.pi * k / 6, 2 * math.pi * (k + 1) / 6), cols[k])
    G = Group()
    green, yellow, black = "#2f8a46", "#f2c230", "#262626"
    G.add("life", S.cbox(-4.6, 4.6, -3.0, 8.5, 2.0, 7.0, r=1.2), green)
    G.add("life", S.cbox(-2.8, 2.8, -8.8, -2.0, 2.0, 7.8, r=1.2), green)
    G.add("life", S.cbox(-4.9, 4.9, -6.2, 8.8, 7.4, 13.2, r=1.6), yellow)
    G.add("life", S.box(-5.0, 5.0, -6.3, 8.9, 6.7, 7.5), black)
    G.add("life", quad_y(-3.6, 3.6, 8.4, 12.2, -6.26), "#a9cfe0")
    for sx in (-1.0, 1.0):
        G.add("life", quad_x(-3.4, 5.6, 8.2, 12.0, sx * 4.95, facing=sx), "#3a3330")
    G.add("life", wheel_x(0.0, -6.6, 2.1, 2.1, 1.5), black)
    for sx in (-1.0, 1.0):
        G.add("life", wheel_x(sx * 4.3, 5.6, 2.1, 2.1, 1.5), black)
    G.add("life", S.sphere(0.0, -8.9, 5.6, 0.8, sides=4, rings=2), "#fff2c0")
    G.rot("Z", -28.0).move(15.0, -8.5, 0.0).emit(it)
    wood = "#d9b27c"
    for (x, y, z, a, c1, c2) in ((-7.0, -13.0, 0.0, 12.0, "#e2483a", "#3a7bd5"), (0.6, -16.6, 0.0, -20.0, "#3fa34d", "#f5c638"), (-6.2, -13.6, 5.0, 40.0, "#3a7bd5", "#e2483a"), (19.0, 13.0, 0.0, 30.0, "#f5c638", "#3fa34d"), (4.0, 6.0, 0.0, -8.0, "#e2483a", "#f5c638")):
        g = S.box(-2.5, 2.5, -2.5, 2.5, 0.0, 5.0)
        g.rot("Z", a).move(x, y, z)
        it.add("life", g, lambda p, n, c1=c1, c2=c2: c1 if n.z > 0.5 else (c2 if abs(n.y) > 0.7 else wood))


# ---------------------------------------------------------------------------
# Wall pieces (back face on +Y, bottom on z = 0)
# ---------------------------------------------------------------------------

@life("wall-clock")
def wall_clock(it):
    """A round wooden clock: brass bezel, white face, tick marks, 10:10."""
    cz = 17.0
    G = Group()
    G.add("life", S.lathe([(16.6, 0.0), (17.0, 1.2), (17.0, 4.2), (15.6, 5.0)], 16), "#7a4b2a")
    G.add("steel", S.lathe([(15.6, 5.0), (14.8, 3.6)], 16), "#d6a94f")
    G.add("life", S.lathe([(14.8, 3.6), (0.0, 3.6)], 16), "#f7f3ea")
    # lathe axis +Z -> -Y (front); back face at y = +2.5
    G.rot("X", 90.0).move(0.0, 2.5, cz)
    G.emit(it)
    yf = 2.5 - 3.6
    ink = "#2a2724"
    for k in range(12):
        a = math.pi / 2 - 2 * math.pi * k / 12
        big = k % 3 == 0
        r0, r1, hw = (11.4 if big else 12.3), 13.6, (0.55 if big else 0.32)
        ca, sa = math.cos(a), math.sin(a)
        pts = [(r0 * ca - hw * sa, r0 * sa + hw * ca), (r1 * ca - hw * sa, r1 * sa + hw * ca), (r1 * ca + hw * sa, r1 * sa - hw * ca), (r0 * ca + hw * sa, r0 * sa - hw * ca)]
        it.add("life", poly_y([(x, cz + z) for x, z in pts], yf - 0.08), ink)

    def hand(angle_deg, length, w0, w1, y, colour, tail=1.6):
        a = math.radians(90.0 - angle_deg)
        ca, sa = math.cos(a), math.sin(a)
        px, pz = -sa, ca
        pts = [(-tail * ca - w0 * px, -tail * sa - w0 * pz), (length * ca - w1 * px, length * sa - w1 * pz), (length * ca + w1 * px, length * sa + w1 * pz), (-tail * ca + w0 * px, -tail * sa + w0 * pz)]
        it.add("life", poly_y([(x, cz + z) for x, z in pts], y), colour)

    hand(305.0, 8.6, 0.75, 0.35, yf - 0.16, "#1f1d1b")
    hand(60.0, 12.4, 0.6, 0.25, yf - 0.24, "#1f1d1b")
    hand(160.0, 12.8, 0.18, 0.12, yf - 0.32, "#c8302f", tail=3.2)
    it.add("steel", ngon_y(0.0, cz, 0.9, 6, yf - 0.4), "#d6a94f")


def frame_picture(G, x0, x1, z0, z1, y, kind):
    """Picture decals on a frame front at plane y (front faces -Y)."""
    if kind == "wedding":
        G.add("life", quad_y(x0, x1, z0, z1, y), grad("z", z0, z1, "#8a4a2a", "#e3b98a"))
        cx = (x0 + x1) / 2
        w = (x1 - x0)
        for dx, body, head in ((-0.2, "#b8263a", "#3a261c"), (0.2, "#efe2c4", "#2a1d17")):
            bx = cx + dx * w
            G.add("life", poly_y([(bx - 0.17 * w, z0), (bx + 0.17 * w, z0), (bx + 0.1 * w, z0 + (z1 - z0) * 0.55), (bx - 0.1 * w, z0 + (z1 - z0) * 0.55)], y - 0.03), body)
            G.add("life", ngon_y(bx, z0 + (z1 - z0) * 0.68, 0.11 * w, 6, y - 0.03, rz=0.13 * w), head)
    elif kind == "outing":
        G.add("life", quad_y(x0, x1, z0, z1, y), grad("z", z0, z1, "#6f9a4a", "#9cc8e6"))
        G.add("life", poly_y([(x0, z0), (x1, z0), (x1, z0 + (z1 - z0) * 0.35), ((x0 + x1) / 2, z0 + (z1 - z0) * 0.5), (x0, z0 + (z1 - z0) * 0.3)], y - 0.03), "#4f7d3a")
        G.add("life", ngon_y(x0 + (x1 - x0) * 0.75, z0 + (z1 - z0) * 0.75, (z1 - z0) * 0.1, 6, y - 0.03), "#f6dc7a")
    elif kind == "baby":
        G.add("life", quad_y(x0, x1, z0, z1, y), grad("z", z0, z1, "#e8b7b9", "#f4dccf"))
        cx = (x0 + x1) / 2
        G.add("life", ngon_y(cx, z0 + (z1 - z0) * 0.5, (x1 - x0) * 0.28, 6, y - 0.03, rz=(z1 - z0) * 0.24), "#c98f6a")
    elif kind == "elder":
        G.add("life", quad_y(x0, x1, z0, z1, y), grad("z", z0, z1, "#8f7a5a", "#cdb791"))
        cx = (x0 + x1) / 2
        w = x1 - x0
        G.add("life", poly_y([(cx - 0.36 * w, z0), (cx + 0.36 * w, z0), (cx + 0.2 * w, z0 + (z1 - z0) * 0.42), (cx - 0.2 * w, z0 + (z1 - z0) * 0.42)], y - 0.03), "#efe8d8")
        G.add("life", ngon_y(cx, z0 + (z1 - z0) * 0.6, 0.15 * w, 6, y - 0.03, rz=0.14 * (z1 - z0)), "#7a5a42")
        G.add("life", poly_y([(cx - 0.15 * w, z0 + (z1 - z0) * 0.66), (cx + 0.15 * w, z0 + (z1 - z0) * 0.66), (cx + 0.11 * w, z0 + (z1 - z0) * 0.76), (cx - 0.11 * w, z0 + (z1 - z0) * 0.76)], y - 0.05), "#d9d4cc")
    elif kind == "deity":
        G.add("life", quad_y(x0, x1, z0, z1, y), grad("z", z0, z1, "#e06a2a", "#f6c04a"))
        cx = (x0 + x1) / 2
        G.add("life", ngon_y(cx, z0 + (z1 - z0) * 0.58, (x1 - x0) * 0.34, 8, y - 0.03), "#fbe7a0")
        G.add("life", poly_y([(cx - (x1 - x0) * 0.22, z0 + 1.0), (cx + (x1 - x0) * 0.22, z0 + 1.0), (cx, z0 + (z1 - z0) * 0.62)], y - 0.05), "#3a6fb0")
    elif kind == "kid":
        G.add("life", quad_y(x0, x1, z0, z1, y), grad("z", z0, z1, "#b9c3c9", "#e6ebee"))
        cx = (x0 + x1) / 2
        w = x1 - x0
        G.add("life", poly_y([(cx - 0.3 * w, z0), (cx + 0.3 * w, z0), (cx + 0.18 * w, z0 + (z1 - z0) * 0.45), (cx - 0.18 * w, z0 + (z1 - z0) * 0.45)], y - 0.03), "#f4f4f0")
        G.add("life", ngon_y(cx, z0 + (z1 - z0) * 0.62, 0.17 * w, 6, y - 0.03, rz=0.14 * (z1 - z0)), "#a8744f")


@life("photo-frames")
def photo_frames(it):
    """Three standing family photos on little easels, leaning back."""
    specs = (
        (-15.8, 0.9, 19.0, 26.6, "#5a3a22", "#f3efe6", "wedding", 9.0),
        (13.2, 0.8, 21.0, 15.5, "#c9a24a", "#f3efe6", "outing", -11.0),
        (-0.8, -2.2, 10.5, 13.5, "#f2eee6", None, "baby", 4.0),
    )
    for (x, y, w, h, rim, mat, kind, a) in specs:
        G = Group()
        G.add("life", S.cbox(-w / 2, w / 2, -0.9, 0.9, 0.0, h, r=0.5), rim)
        yf = -0.95
        b = 1.6 if w > 12 else 1.2
        if mat:
            G.add("life", quad_y(-w / 2 + b, w / 2 - b, b, h - b, yf), mat)
            b += 1.2 if w > 12 else 0.8
        frame_picture(G, -w / 2 + b, w / 2 - b, b, h - b, yf - 0.04, kind)
        lean = 13.0
        G.rot("X", -lean, (0.0, -0.9, 0.0))
        top = Vector((0.0, 0.9, h * 0.62))
        top.rotate(Matrix.Rotation(math.radians(-lean), 3, "X"))
        G.add("life", S.tube([(0.0, top.y, top.z), (0.0, top.y + h * 0.19, 0.3)], 0.9, sides=4, caps=True, scale_v=0.35), rim)
        G.rot("Z", a).move(x, y, 0.0).emit(it)


@life("wall-photos")
def wall_photos(it):
    """A cluster of hanging family photos; the elder's portrait wears a
    marigold garland."""
    yb, yf = 1.5, 0.1
    frames = (
        (-29.0, -4.0, 14.0, 54.0, "#4a2e1f", "#efe9dc", "elder"),
        (3.0, 27.0, 40.0, 60.0, "#2b2624", "#f3efe6", "wedding"),
        (5.0, 21.0, 0.0, 32.0, "#f2eee6", None, "kid"),
        (28.0, 44.0, 14.0, 38.0, "#6b4226", None, "outing"),
        (-44.0, -33.0, 24.0, 41.0, "#c9a24a", None, "deity"),
    )
    G = Group()
    for (x0, x1, z0, z1, rim, mat, kind) in frames:
        G.add("life", S.box(x0, x1, yf, yb, z0, z1), rim)
        b = 1.8
        if mat:
            G.add("life", quad_y(x0 + b, x1 - b, z0 + b, z1 - b, yf - 0.05), mat)
            b += 1.6
        frame_picture(G, x0 + b, x1 - b, z0 + b, z1 - b, yf - 0.09, kind)
    G.emit(it)
    # marigold garland draped from the elder's top corners in a U
    x0, x1, z1 = -29.0, -4.0, 54.0
    pts = []
    n = 13
    for k in range(n):
        t = k / (n - 1)
        x = x0 + 0.6 + (x1 - x0 - 1.2) * t
        z = z1 - 0.8 - 22.0 * math.sin(math.pi * t) ** 0.85
        pts.append(Vector((x, yf - 0.75, z)))
    radii = [0.9 if k % 2 == 0 else 0.62 for k in range(n)]
    g = S.tube(pts, radii, sides=4, caps=True)
    cols = []
    for k in range(n):
        cols += [rgb("#f08a1c" if (k // 2) % 2 == 0 else "#f7c234")] * 4
    cols += [rgb("#f08a1c")] * 8
    it.add("life", g, cols)


@life("calendar")
def calendar(it):
    """A wall calendar on a nail: sunrise picture above, the month grid below."""
    yb = 1.0
    it.add("life", S.box(-15.0, 15.0, 0.6, yb, 0.0, 40.0), "#f6f3ec")
    it.add("life", S.box(-15.3, 15.3, 0.2, yb, 38.6, 40.6), "#b52a2a")
    y = 0.54
    it.add("life", quad_y(-13.8, 13.8, 21.0, 37.6, y), grad("z", 21.0, 37.6, "#e8606a", "#f6b25a"))
    it.add("life", ngon_y(4.5, 28.5, 3.6, 6, y - 0.03), "#fde58a")
    it.add("life", poly_y([(-13.8, 21.0), (13.8, 21.0), (13.8, 25.5), (2.0, 29.0), (-13.8, 24.0)], y - 0.06), "#2f5e66")
    it.add("life", poly_y([(-8.0, 24.6), (-4.6, 24.6), (-6.3, 31.0)], y - 0.09), "#7a2f2a")
    it.add("life", quad_y(-13.8, 13.8, 17.4, 19.4, y), "#c8302f")
    grid = "#b9b3aa"
    for k in range(5):
        z = 3.0 + k * 3.3
        it.add("life", quad_y(-13.8, 13.8, z - 0.12, z + 0.12, y), grid)
    for k in range(6):
        x = -13.8 + (k + 1) * 27.6 / 7
        it.add("life", quad_y(x - 0.12, x + 0.12, 3.0, 16.2, y), grid)
    it.add("life", quad_y(-13.8 + 27.6 * 3 / 7 + 0.4, -13.8 + 27.6 * 4 / 7 - 0.4, 9.9, 12.9, y - 0.02), "#e8505b")
    for sx in (-1.0, 1.0):
        it.add("life", poly_y([(sx * 9.8, 40.5), (sx * 10.6, 40.5), (sx * 0.35, 44.2), (sx * -0.2, 44.2)], 0.5), "#6a5a4a")
    it.add("life", S.box(-0.55, 0.55, -1.0, yb, 43.9, 45.0), "#4a4a48")


# ---------------------------------------------------------------------------
# Plants and festive
# ---------------------------------------------------------------------------

@life("money-plant")
def money_plant(it):
    """Golden pothos in a terracotta pot: heart leaves climbing a coir stick
    and trailing over the rim."""
    rng = it.rng
    it.add("life", S.lathe([(0.0, 0.0), (7.6, 0.0), (9.4, 13.6), (10.5, 14.2), (10.5, 16.6), (9.6, 16.8), (9.2, 15.4)], 10, sharp=(1, 2, 4)),
           lambda p, n: mix("#94492b", "#bd6a40", p.z / 6.0) if p.z < 14.0 else "#c77448")
    it.add("life", S.lathe([(9.2, 15.4), (0.0, 15.6)], 10), "#46311f")
    sx, sy = 0.8, 0.8
    it.add("life", S.cyl(sx, sy, 13.0, 50.0, 1.4, sides=6, b=0.0), lambda p, n: mix("#6a4a2c", "#8a6640", p.z / 50.0))

    def green():
        return shade("#3c8a35", rng.uniform(0.82, 1.12)), mix("#a9c24a", "#e2d76a", rng.uniform(0.0, 0.55))

    def add_leaf(base, tip, w, up=(0.0, 0.0, 1.0), droop=0.1):
        e, m = green()
        g, c = leaf(base, tip, w, up=up, droop=droop, edge=e, mid=m)
        it.add("life", g, c)

    stem = "#5a8a32"
    spiral = []
    for k in range(11):
        a = 0.4 + k * 1.3
        spiral.append(Vector((sx + 1.9 * math.cos(a), sy + 1.9 * math.sin(a), 17.0 + k * 3.6)))
    it.add("life", S.tube(spiral, 0.38, sides=3, caps=False), stem)
    for k, p in enumerate(spiral[1:], 1):
        a = 0.4 + k * 1.3
        out = Vector((math.cos(a), math.sin(a), 0.0))
        L = 9.2 + rng.uniform(-0.6, 0.6) - max(0, k - 7) * 0.8
        add_leaf(p, p + out * (L * 0.92) + Vector((0.0, 0.0, L * (0.36 if k % 2 else 0.12))), L * 0.8, droop=0.12)
    top = spiral[-1]
    for a in (2.0, 4.6):
        add_leaf(top + Vector((0.0, 0.0, 0.4)), top + Vector((math.cos(a) * 3.4, math.sin(a) * 3.4, 7.0)), 5.4, droop=0.04)
    for a0 in (0.7, 2.27, 3.84, 5.41):
        a0 += rng.uniform(-0.2, 0.2)

        def at(r, z, da=0.0):
            return Vector((math.cos(a0 + da) * r, math.sin(a0 + da) * r, z))

        vine = [at(5.0, 15.8), at(10.6, 17.6, 0.05), at(12.6, 12.6, 0.12), at(13.4, 7.2, 0.2), at(14.0, 2.6, 0.3)]
        it.add("life", S.tube(vine, 0.34, sides=3, caps=False), stem)
        for j, p in enumerate(vine[2:], 2):
            out = Vector((math.cos(a0 + 0.1 * j), math.sin(a0 + 0.1 * j), 0.0))
            side = Vector((-out.y, out.x, 0.0)) * (1.0 if j % 2 else -1.0)
            L = 7.8 + rng.uniform(-0.5, 0.6)
            add_leaf(p, p + out * 2.4 + side * 2.6 + Vector((0.0, 0.0, -L * 0.8)), L * 0.76, up=out, droop=-0.08)
    for k in range(6):
        a = k * 1.05 + 0.3
        base = Vector((math.cos(a) * 3.6, math.sin(a) * 3.6, 15.8))
        out = Vector((math.cos(a), math.sin(a), 0.0))
        L = 8.6 + rng.uniform(-0.5, 0.5)
        add_leaf(base, base + out * (L * 0.96) + Vector((0.0, 0.0, L * 0.26)), L * 0.8, droop=0.18)


@life("urli")
def urli(it):
    """A wide brass urli of water with floating marigolds, a rose and petals."""
    rng = it.rng
    it.add("steel", S.lathe([(0.0, 0.0), (9.5, 0.0), (11.0, 1.8), (19.5, 5.8), (24.2, 11.0), (25.0, 13.2), (23.4, 13.6), (22.6, 11.6)], 16, sharp=(1, 2, 5, 6)), "#d1a245")
    it.add("life", S.lathe([(22.6, 11.6), (0.0, 11.6)], 16), lambda p, n: mix("#86a7b8", "#5f7f92", math.hypot(p.x, p.y) / 22.0))
    for (x, y, r, c) in ((-8.0, 6.0, 3.2, "#f08a1c"), (7.5, 9.0, 3.0, "#f7b733"), (10.0, -6.5, 3.3, "#f08a1c"), (-6.0, -9.5, 3.0, "#f7c234"), (-15.0, -2.0, 2.8, "#f08a1c"), (15.5, 2.0, 2.8, "#f7b733")):
        it.add("life", S.blob(x, y, 12.6, r, r, 1.9, subdiv=0, jitter=0.18, rng=rng, normals="smooth"), lambda p, n, c=c: mix(shade(c, 0.82), c, (p.z - 11.6) / 2.6))
    it.add("life", S.blob(0.0, 0.0, 13.2, 3.4, 3.4, 2.4, subdiv=0, jitter=0.15, rng=rng, normals="smooth"), "#b8203a")
    it.add("life", S.blob(0.0, 0.0, 15.0, 2.0, 2.0, 1.4, subdiv=0, jitter=0.1, rng=rng, normals="smooth"), "#d43a52")
    for k in range(10):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(6.0, 19.0)
        x, y = r * math.cos(a), r * math.sin(a)
        it.add("life", ngon_z(x, y, 1.2, 4, 11.66, phase=a, ry=0.7), "#d4364e" if k % 2 else "#f08a1c")
    for (x, y, a) in ((-2.5, 13.0, 0.3), (12.5, -12.0, 1.4)):
        it.add("life", ngon_z(x, y, 2.6, 6, 11.7, phase=a, ry=1.6), "#3f7d2c")


@life("toran")
def toran(it):
    """A door toran: a red cord strung with marigold balls, pointed mango
    leaves hanging in a row and marigold strands ending in tassels."""
    rng = it.rng
    zt = 37.0
    it.add("life", S.tube([(-60.0, 0.6, zt + 0.6), (60.0, 0.6, zt + 0.6)], 0.9, sides=4, caps=True), "#b8282c")
    xs = [-55.0 + k * 10.0 for k in range(12)]
    for k, x in enumerate(xs):
        c = "#f08a1c" if k % 2 == 0 else "#f7c234"
        it.add("life", S.blob(x, 0.0, zt, 3.0, 3.0, 2.9, subdiv=0, jitter=0.16, rng=rng, normals="smooth"), lambda p, n, c=c: mix(shade(c, 0.85), c, 0.5 + (p.z - zt) / 5.0))
    for k in range(12):
        x = -55.0 + 5.0 + k * 10.0 + rng.uniform(-0.8, 0.8)
        if x > 58.0:
            x = -59.0 + 1.0
        L = 14.0 + rng.uniform(-1.2, 1.2)
        base = Vector((x, -1.4, zt - 1.0))
        tip = base + Vector((rng.uniform(-1.6, 1.6), -0.8, -L))
        e = shade("#3f7d2c", rng.uniform(0.85, 1.1))
        g, c = leaf(base, tip, 4.6, up=(0.0, -1.0, 0.0), shape=LANCE, fold=0.1, droop=0.02, centre=0.45, edge=e, mid="#79a84c")
        it.add("life", g, c)
    for x, nb in ((-45.0, 3), (-25.0, 4), (0.0, 5), (25.0, 4), (45.0, 3)):
        zb = zt - 4.4 - (nb - 1) * 5.0
        it.add("life", thin((x, 0.0, zt - 2.0), (x, 0.0, zb - 2.0), r=0.22, sides=3), "#b8282c")
        for j in range(nb):
            c = "#f7c234" if j % 2 == 0 else "#f08a1c"
            it.add("life", S.blob(x, 0.0, zt - 4.6 - j * 5.0, 2.3, 2.3, 2.3, subdiv=0, jitter=0.16, rng=rng, normals="smooth"), c)
        tz = zt - 4.6 - (nb - 1) * 5.0 - 2.2
        it.add("life", S.lathe([(0.0, 0.0), (1.4, 7.0), (0.0, 7.4)], 5, cx=x, cy=0.0).move(0.0, 0.0, tz - 7.4), lambda p, n: mix("#b8202a", "#e0b443", (p.z - (tz - 7.4)) / 7.4 - 0.4))


@life("diwali-diya")
def diwali_diya(it):
    """A clay diya pinched into a spout, an oil-soaked wick and a separate
    flame (part ``flame``, pivot at the wick tip)."""
    clay, dark, lip, oil = "#a84e2b", "#74331b", "#c56b3e", "#d9a646"
    bowl = S.lathe([(0.0, 0.0), (2.2, 0.0), (3.7, 1.3), (4.3, 3.1), (3.75, 3.25), (0.0, 1.9)], 10, sharp=(1, 3))

    def pinch(p):
        c = max(0.0, math.cos(math.atan2(p.y, p.x)))
        k = 1.0 + 0.4 * c ** 6 * min(1.0, p.z / 2.6)
        lift = 0.9 * c ** 8 * min(1.0, p.z / 3.0)
        return (p.x * k, p.y * 0.93 * (1.0 - 0.18 * c ** 4), p.z + lift)

    def col(p, n):
        if p.z > 3.2 and math.hypot(p.x, p.y) < 4.2 * 1.45:
            return lip
        if math.hypot(p.x, p.y) < 0.5:
            return oil
        return mix(dark, clay, p.z / 1.4)

    cols = paint(bowl, col)
    bowl.warp(pinch).smooth_normals()
    it.add("life", bowl, cols)
    tip = Vector((5.55, 0.0, 4.3))
    it.add("life", S.tube([(1.8, 0.0, 2.1), (3.9, 0.0, 3.3), (tip.x, 0.0, tip.z)], [0.32, 0.3, 0.26], sides=3, caps=True), lambda p, n: "#3a2a20" if p.x > 5.2 else "#efe4cc")
    it.part("flame", tuple(tip))
    flame = S.lathe([(0.0, 0.0), (0.8, 0.7), (0.6, 2.1), (0.0, 3.7)], 6)
    flame.move(tip.x, tip.y, tip.z)
    it.add("flame", flame, lambda p, n: mix("#fff6d8", "#ffcf70", (p.z - tip.z) / 3.4), part="flame")


# ---------------------------------------------------------------------------
# Big things: bicycle, scooter, drying stand
# ---------------------------------------------------------------------------

@life("cycle")
def cycle(it):
    """A black roadster on its stand: double top tube, full mudguards, rear
    carrier, chain guard, chrome bars and rims, brown saddle, bell."""
    R, cz = 33.0, 33.0
    yf, yr = -52.0, 52.0
    black, chrome, tyre = "#1f1e1e", "#cfd2d4", "#2c2b2a"
    for y in (yf, yr):
        it.add("life", torus_x(0.0, y, cz, R - 1.7, 1.7, seg=14, sides=4), tyre)
        it.add("steel", torus_x(0.0, y, cz, R - 3.9, 0.8, seg=14, sides=3, phase=0.0), chrome)
        for k in range(6):
            a = 2 * math.pi * k / 6 + (0.25 if y > 0 else 0.0)
            it.add("steel", thin((0.0, y, cz), (0.0, y + (R - 4.3) * math.cos(a), cz + (R - 4.3) * math.sin(a)), r=0.2, sides=3), chrome)
        it.add("steel", wheel_x(0.0, y, cz, 2.2, 6.0, sides=6), chrome)
    BB = Vector((0.0, 12.0, 30.0))
    ST = Vector((0.0, 20.0, 80.0))
    HT0, HT1 = Vector((0.0, -36.5, 72.0)), Vector((0.0, -34.0, 85.0))
    tube = lambda a, b, r=1.4: it.add("life", S.tube([a, b], r, sides=4, caps=False), black)
    tube(ST, HT1 + Vector((0.0, 0.3, -1.6)))
    tube(ST + Vector((0.0, -0.6, -11.0)), HT0 + Vector((0.0, 0.2, 1.5)))
    tube(HT0, BB, 1.7)
    tube(BB, ST + Vector((0.0, 0.0, 4.0)), 1.5)
    for sx in (-1.0, 1.0):
        tube(BB + Vector((sx * 2.0, 0.0, 0.0)), Vector((sx * 3.6, yr, cz)), 1.0)
        tube(ST + Vector((sx * 1.5, 1.0, -2.0)), Vector((sx * 3.6, yr, cz)), 0.9)
        it.add("life", S.tube([HT0 + Vector((sx * 2.0, 0.0, 1.0)), Vector((sx * 3.8, yf + 6.0, cz + 12.0)), Vector((sx * 3.8, yf, cz))], 1.0, sides=4, caps=False), black)
    it.add("life", S.cyl(0.0, 0.0, 0.0, HT1.z - HT0.z + 2.0, 2.0, sides=6, b=0.0).rot("X", -11.0).move(HT0.x, HT0.y, HT0.z - 1.0), black)
    stem = Vector((0.0, -33.2, 95.0))
    tube(HT1, stem, 1.2)
    bar = [Vector((-23.0, -17.0, 96.0)), Vector((-16.5, -26.0, 97.5)), Vector((-5.6, -32.8, 96.4)), stem, Vector((5.6, -32.8, 96.4)), Vector((16.5, -26.0, 97.5)), Vector((23.0, -17.0, 96.0))]
    it.add("steel", S.tube(bar, 1.1, sides=4, caps=False), chrome)
    for sx in (-1.0, 1.0):
        it.add("life", S.tube([Vector((sx * 19.4, -21.6, 96.9)), Vector((sx * 23.6, -16.0, 95.9))], 1.55, sides=5, caps=True), "#3a2a1f")
    it.add("steel", S.sphere(-12.8, -28.4, 99.4, 1.9, sides=5, rings=3), chrome)
    post_top = ST + Vector((0.0, 1.6, 8.0))
    tube(ST, post_top, 1.1)
    sad = S.sphere(0.0, 0.0, 0.0, 1.0, sides=8, rings=4)

    def saddle_shape(p):
        k = 0.42 + 0.58 * max(0.0, min(1.0, (p.y + 1.0) / 2.0)) ** 0.7
        return (p.x * 8.5 * k, p.y * 13.0, p.z * 3.0 + 1.2 * max(0.0, -p.y))

    sad.warp(saddle_shape).smooth_normals()
    sad.move(post_top.x, post_top.y + 2.0, post_top.z + 3.2)
    it.add("life", sad, "#5a3a24")
    for sx in (-1.0, 1.0):
        it.add("steel", S.cyl(sx * 4.5, post_top.y + 8.0, post_top.z - 2.0, post_top.z + 1.6, 1.0, sides=4, b=0.0), chrome)
    # rear carrier
    it.add("life", S.box(-7.0, 7.0, 30.0, 80.0, 70.5, 71.6), black)
    for sx in (-1.0, 1.0):
        it.add("life", S.tube([Vector((sx * 6.5, 78.0, 70.6)), Vector((sx * 4.0, yr + 0.5, cz + 0.5))], 0.75, sides=4, caps=False), black)
        it.add("life", S.tube([Vector((sx * 6.5, 31.0, 70.6)), Vector((sx * 2.2, 25.0, 66.0))], 0.75, sides=4, caps=False), black)
    # mudguards
    for y, a0, a1 in ((yf, 20.0, 165.0), (yr, 20.0, 172.0)):
        pts = []
        for k in range(6):
            a = math.radians(a0 + (a1 - a0) * k / 5)
            pts.append(Vector((0.0, y - (R + 2.2) * math.cos(a), cz + (R + 2.2) * math.sin(a))))
        it.add("life", S.tube(pts, 0.35, sides=4, caps=False, scale_v=7.0), black)
    # chain guard, chainring, cranks, pedals
    cg = [(BB.y - 10.0, BB.z - 3.0), (yr - 4.0, cz - 4.0), (yr + 3.0, cz + 1.0), (yr - 4.0, cz + 5.0), (BB.y - 4.0, BB.z + 11.0), (BB.y - 12.0, BB.z + 5.0)]
    it.add("life", S.slab(poly(cg), 4.4, 5.2, b=0.0, axis="X"), black)
    it.add("life", decal([(5.25, BB.y + 2.0, BB.z + 5.4), (5.25, yr - 5.0, cz + 3.0), (5.25, yr - 5.0, cz + 2.4), (5.25, BB.y + 2.0, BB.z + 4.6)], (1.0, 0.0, 0.0)), "#d9a441")
    it.add("steel", wheel_x(3.4, BB.y, BB.z, 9.0, 0.6, sides=10), chrome)
    for sx, sgn in ((1.0, 1.0), (-1.0, -1.0)):
        c = Vector((sx * 6.0, BB.y + sgn * 7.0, BB.z - sgn * 9.0))
        it.add("life", S.tube([Vector((sx * 5.6, BB.y, BB.z)), c], 0.9, sides=4, caps=True), black)
        px = c.x + sx * 2.6
        it.add("life", S.box(px - 2.2, px + 2.2, c.y - 2.4, c.y + 2.4, c.z - 0.8, c.z + 0.8), "#2a2a2a")
    # rear stand
    for sx in (-1.0, 1.0):
        it.add("life", S.tube([Vector((sx * 4.2, yr, cz)), Vector((sx * 6.2, yr + 22.0, 0.8))], 0.7, sides=4, caps=False), black)
    it.add("life", S.tube([Vector((-6.2, yr + 22.0, 0.8)), Vector((6.2, yr + 22.0, 0.8))], 0.8, sides=4, caps=False), black)


@life("scooter")
def scooter(it):
    """A parked gearless scooter (no rider) on its side stand: curved front
    apron, floorboard, rounded rear body, seat, alloy wheels, mirrors."""
    paint_c, seat, grey, tyre, chrome = "#9b2d2a", "#232120", "#3a3a3a", "#262626", "#c9cccf"
    rf, rr = 24.0, 22.0
    yf, yr = -58.0, 50.0
    # wheels
    for y, r, seg in ((yf, rf, 14), (yr, rr, 12)):
        it.add("life", torus_x(0.0, y, r, r - 4.0, 4.0, seg=seg, sides=4), tyre)
        it.add("steel", wheel_x(0.0, y, r, r - 6.0, 6.0, sides=8), "#8f9396")
    # front apron, curved toward the front, leaning back
    ap = S.rbox(-20.0, 20.0, -46.0, -36.0, 26.0, 92.0, r=4.0, seg=1, div=(2, 1, 2))

    def apron_warp(p):
        u = p.x / 20.0
        t = (p.z - 26.0) / 66.0
        return (p.x * (1.0 - 0.38 * t), p.y - 5.0 * u * u + 14.0 * t, p.z)

    ap.warp(apron_warp).smooth_normals()
    it.add("life", ap, paint_c)
    it.add("life", S.cbox(-7.0, 7.0, -52.0, -40.0, 52.0, 88.0, r=3.0), paint_c)
    it.add("life", decal([(-4.6, -52.06, 60.0), (4.6, -52.06, 60.0), (4.6, -52.06, 63.0), (-4.6, -52.06, 63.0)], (0.0, -1.0, 0.0)), chrome)
    for sx in (-1.0, 1.0):
        it.add("life", decal([(sx * 5.0, -52.06, 80.0), (sx * 6.6, -52.06, 80.0), (sx * 6.6, -52.06, 84.0), (sx * 5.0, -52.06, 84.0)], (0.0, -1.0, 0.0)), "#f2a23a")
    # front mudguard and fork
    pts = [Vector((0.0, yf - (rf + 2.5) * math.cos(math.radians(a)), rf + (rf + 2.5) * math.sin(math.radians(a)))) for a in (25.0, 60.0, 95.0, 130.0, 160.0)]
    it.add("life", S.tube(pts, 1.0, sides=4, caps=False, scale_v=5.5), paint_c)
    for sx in (-1.0, 1.0):
        it.add("life", S.tube([Vector((sx * 5.2, -46.0, 56.0)), Vector((sx * 5.2, yf, rf))], 1.6, sides=4, caps=False), "#2a2a2a")
    # floorboard
    it.add("life", S.cbox(-17.0, 17.0, -38.0, 14.0, 22.0, 29.0, r=2.0), grey)
    # rear body with tail lamp, engine, seat, grab rail, number plate
    rb = S.rbox(-19.0, 19.0, 6.0, 92.0, 24.0, 68.0, r=12.0, seg=1, div=(1, 2, 1), puff=(2.4, 0.0, 0.0))

    def rear_warp(p):
        t = max(0.0, min(1.0, (p.y - 6.0) / 86.0))
        dz = (p.z - 24.0) / 44.0
        k = 1.0 - 0.32 * t * t - 0.08 * (1.0 - t) ** 3
        zb, zt = 24.0 + 11.0 * t, 68.0 - 4.0 * t * t
        z = zb + dz * (zt - zb)
        if p.y < 10.0:
            z -= 12.0 * dz
        return (p.x * k, p.y, z)

    rb.warp(rear_warp).smooth_normals()
    it.add("life", rb, paint_c)
    it.add("life", quad_y(-6.5, 6.5, 52.0, 57.0, 92.05, facing=1.0), "#c8302f")
    it.add("life", S.cbox(-17.0, -5.0, 24.0, 68.0, 12.0, 32.0, r=3.0), "#3d3d3f")
    it.add("steel", S.tube([Vector((10.0, 28.0, 17.0)), Vector((12.5, 74.0, 22.0))], 3.0, sides=5, caps=True), "#b9bcbf")
    st = S.rbox(-14.5, 14.5, 10.0, 78.0, 65.0, 75.5, r=4.5, seg=1, puff=(0.0, 0.0, 1.2))
    it.add("life", st, seat)
    it.add("life", S.tube([Vector((-12.0, 70.0, 67.0)), Vector((-11.0, 85.0, 68.5)), Vector((11.0, 85.0, 68.5)), Vector((12.0, 70.0, 67.0))], 1.1, sides=4, caps=False), "#2a2a2a")
    it.add("life", S.box(-9.0, 9.0, 89.0, 90.6, 40.0, 49.0), "#f4f1ea")
    it.add("life", quad_y(-7.2, 7.2, 43.0, 46.0, 90.65, facing=1.0), "#2a2a2a")
    # handlebar cover, headlamp, speedo, grips, mirrors
    it.add("life", S.cbox(-14.0, 14.0, -44.0, -26.0, 92.0, 101.0, r=3.0), paint_c)
    hl = S.cyl(0.0, 0.0, 0.0, 1.6, 6.0, sides=7, b=0.0).rot("X", 90.0).move(0.0, -44.0, 96.0)
    it.add("life", hl, "#f4ecd2")
    it.add("life", ngon_z(0.0, -33.0, 4.2, 8, 101.05, ry=2.8), "#20201f")
    for sx in (-1.0, 1.0):
        it.add("life", S.tube([Vector((sx * 13.5, -33.0, 97.0)), Vector((sx * 33.4, -31.0, 97.5))], 1.7, sides=4, caps=True), "#1d1d1d")
        it.add("steel", S.tube([Vector((sx * 11.0, -34.0, 100.5)), Vector((sx * 17.0, -36.0, 109.0))], 0.6, sides=4, caps=False), chrome)
        m = S.sphere(0.0, 0.0, 0.0, 1.0, sides=5, rings=3)
        m.scl(5.2, 1.4, 3.6).move(sx * 19.5, -36.5, 111.2)
        it.add("life", m, "#1d1d1d")
    # side stand (left)
    it.add("life", S.tube([Vector((-14.0, 2.0, 21.0)), Vector((-24.0, 10.0, 1.0))], 1.0, sides=4, caps=False), "#2a2a2a")
    it.add("life", S.box(-27.0, -21.0, 7.5, 12.5, 0.0, 1.4), "#2a2a2a")


def _shirt(x, z_top, w, h, colour, kurta=False):
    """Front-facing garment silhouette hanging from its shoulders (x, z_top)."""
    hw = w / 2
    sl = w * 0.38
    if kurta:
        pts = [(-hw * 0.95, z_top - h), (hw * 0.95, z_top - h), (hw * 0.8, z_top - h * 0.45), (hw * 0.78, z_top - h * 0.26), (hw + sl * 0.9, z_top - h * 0.36), (hw + sl, z_top - h * 0.24), (hw * 0.72, z_top), (0.2 * w, z_top + 0.2), (-0.2 * w, z_top + 0.2), (-hw * 0.72, z_top), (-hw - sl, z_top - h * 0.24), (-hw - sl * 0.9, z_top - h * 0.36), (-hw * 0.78, z_top - h * 0.26), (-hw * 0.8, z_top - h * 0.45)]
    else:
        pts = [(-hw * 0.9, z_top - h), (hw * 0.9, z_top - h), (hw * 0.86, z_top - h * 0.5), (hw * 0.84, z_top - h * 0.3), (hw + sl * 0.7, z_top - h * 0.5), (hw + sl, z_top - h * 0.42), (hw * 0.78, z_top), (0.16 * w, z_top + 0.3), (-0.16 * w, z_top + 0.3), (-hw * 0.78, z_top), (-hw - sl, z_top - h * 0.42), (-hw - sl * 0.7, z_top - h * 0.5), (-hw * 0.84, z_top - h * 0.3), (-hw * 0.86, z_top - h * 0.5)]
    return [(x + px, pz) for px, pz in pts]


@life("clothesline")
def clothesline(it):
    """A folding steel drying stand with the day's washing pegged on: a shirt,
    a kid's kurta, a striped towel and a dupatta draped long."""
    steel = "#c9ccd0"
    X = 74.0
    rods = [(-26.0, 99.0), (-20.0, 104.0), (-13.5, 109.0), (-6.5, 112.5), (0.0, 113.6), (6.5, 112.5), (13.5, 109.0), (20.0, 104.0), (26.0, 99.0)]
    for y, z in rods:
        it.add("steel", S.tube([(-X, y, z), (X, y, z)], 0.55, sides=4, caps=False), steel)
    for sx in (-1.0, 1.0):
        arc = [Vector((sx * X, y, z)) for y, z in rods]
        it.add("steel", S.tube(arc, 0.75, sides=4, caps=False), steel)
        for sy in (-1.0, 1.0):
            it.add("steel", S.tube([Vector((sx * (X - 2.0), sy * 2.0, 111.5)), Vector((sx * (X - 4.0), sy * 25.0, 1.0))], 0.8, sides=4, caps=False), steel)
            it.add("life", S.cbox(sx * (X - 4.0) - 1.4, sx * (X - 4.0) + 1.4, sy * 25.0 - 1.6, sy * 25.0 + 1.6, 0.0, 2.2, r=0.5), "#2a2a2a")
        it.add("steel", S.tube([Vector((sx * (X - 3.2), -14.5, 40.0)), Vector((sx * (X - 3.2), 14.5, 40.0))], 0.6, sides=4, caps=False), steel)
    it.add("steel", S.tube([Vector((-X + 3.2, 0.0, 40.0)), Vector((X - 3.2, 0.0, 40.0))], 0.6, sides=4, caps=False), steel)

    peg_cols = ("#e86a9a", "#4fb06a", "#f2c230", "#3a7bd5")
    pegs = [0]

    def peg(x, y, z):
        c = peg_cols[pegs[0] % len(peg_cols)]
        pegs[0] += 1
        it.add("life", S.box(x - 0.6, x + 0.6, y - 1.0, y + 1.0, z - 3.4, z + 1.0), c)

    # shirt hanging from the front wing rod by its shoulders
    y, z = rods[2]
    yy = y - 0.9
    it.add("life", S.slab(poly(_shirt(-40.0, z - 0.4, 36.0, 52.0, "#8fb3da")), yy - 0.6, yy, b=0.0, axis="Y"), "#8fb3da")
    it.add("life", quad_y(-41.0, -39.0, z - 50.0, z - 3.0, yy - 0.65), "#7a9ec8")
    it.add("life", poly_y([(-46.0, z + 0.2), (-40.0, z - 7.0), (-34.0, z + 0.2)], yy - 0.68), "#a9c6e6")
    peg(-53.0, yy - 0.6, z)
    peg(-27.0, yy - 0.6, z)
    # kid's kurta (yellow, maroon border) on the next rod in
    y, z = rods[3]
    yy = y - 0.9
    it.add("life", S.slab(poly(_shirt(-2.0, z - 0.4, 22.0, 44.0, "#f2c84b", kurta=True)), yy - 0.6, yy, b=0.0, axis="Y"), "#f2c84b")
    it.add("life", quad_y(-12.4, 8.4, z - 44.6, z - 41.5, yy - 0.65), "#8a2433")
    it.add("life", quad_y(-2.8, -1.2, z - 16.0, z - 1.0, yy - 0.65), "#8a2433")
    peg(-10.0, yy - 0.6, z)
    peg(6.0, yy - 0.6, z)
    # striped towel draped over a back-wing rod
    y, z = rods[6]
    tw0, tw1 = 49.0, 71.0
    sec = [(y - 1.4, z - 38.0), (y - 1.4, z + 0.2), (y - 0.7, z + 1.3), (y + 0.7, z + 1.3), (y + 1.4, z + 0.2), (y + 1.4, z - 30.0), (y + 0.8, z - 30.0), (y + 0.8, z), (y, z + 0.6), (y - 0.8, z), (y - 0.8, z - 38.0)]
    towel = S.slab(poly(sec), tw0, tw1, b=0.0, axis="X")
    it.add("life", towel, "#2a9d8f")
    for zs in (z - 33.0, z - 30.0):
        it.add("life", quad_y(tw0, tw1, zs - 1.2, zs, y - 1.45), "#f4f1ea")
    peg(tw0 + 4.0, y, z + 1.0)
    peg(tw1 - 4.0, y, z + 1.0)
    # long dupatta (magenta, gold border) over the top rod, hanging both sides
    y, z = rods[4]
    d0, d1 = 22.0, 45.0
    sec = [(y - 1.0, z - 72.0), (y - 1.0, z), (y - 0.5, z + 0.9), (y + 0.5, z + 0.9), (y + 1.0, z), (y + 1.0, z - 56.0), (y + 0.5, z - 56.0), (y + 0.5, z - 0.1), (y, z + 0.4), (y - 0.5, z - 0.1), (y - 0.5, z - 72.0)]
    it.add("life", S.slab(poly(sec), d0, d1, b=0.0, axis="X"), "#c2185b")
    it.add("life", quad_y(d0, d1, z - 71.8, z - 68.0, y - 1.05), "#e0b443")
    for xb in (d0 + 0.3, d1 - 2.8):
        it.add("life", quad_y(xb, xb + 2.5, z - 68.0, z - 2.0, y - 1.05), "#e0b443")


# ---------------------------------------------------------------------------
# Cat, cushions, bucket
# ---------------------------------------------------------------------------

@life("cat")
def cat(it):
    """A ginger-and-white cat asleep, curled into a soft dome: head resting
    on its paws at the front, tail wrapped round. The domed torso and the
    haunch are part ``body`` (it breathes); head, paws and tail stay still."""
    ginger, dark, white = "#de8d45", "#b4612b", "#f4eee4"
    bx, by, rx, ry, cz, rz = 1.5, 3.5, 22.5, 17.0, 7.6, 10.4
    torso = S.sphere(0.0, 0.0, 0.0, 1.0, sides=12, rings=7)

    def dome(p):
        z = cz + rz * p.z
        if z < 1.6:
            z = 1.6 * math.exp((z - 1.6) / 1.6) - 0.25
        return (p.x * rx, p.y * ry, max(0.0, z))

    def coat(p, n):
        if p.z < -0.55 and p.y < 0.2:
            return white
        # a darker saddle along the curled back, lighter toward the front
        back = max(0.0, math.sin(math.atan2(p.y, p.x)) + 0.4)
        return mix(ginger, dark, min(1.0, 0.75 * back * max(0.0, p.z + 0.2)))

    tcols = paint(torso, coat)
    torso.warp(dome).smooth_normals().move(bx, by, 0.0)
    it.part("body", (bx, by, 0.0))
    it.add("life", torso, tcols, part="body")
    hx, hy = bx + 14.0, by - 9.0
    haunch = S.blob(hx, hy, 6.6, 8.0, 7.4, 6.6, subdiv=1)
    haunch.warp(lambda p: (p.x, p.y, p.z if p.z > 0.0 else p.z * 0.12)).smooth_normals()
    it.add("life", haunch, lambda p, n: white if p.z < 1.4 else (dark if p.z > 9.5 else ginger), part="body")
    # head resting on the paws at the front-left, facing the tail
    hc = Vector((bx - 15.5, by - 13.0, 7.2))
    yaw, roll = -30.0, 12.0

    def pose(g):
        return g.rot("Z", yaw).rot("Y", roll).move(hc.x, hc.y, hc.z)

    head = S.blob(0.0, 0.0, 0.0, 6.6, 6.0, 5.4, subdiv=1)
    hcols = paint(head, lambda p, n: white if (p.y < -2.8 and p.z < 1.0) or p.z < -4.0 else (dark if p.z > 4.0 else ginger))
    it.add("life", pose(head), hcols)
    it.add("life", pose(S.blob(0.0, -4.9, -1.6, 3.0, 2.4, 2.1, subdiv=0)), white)
    it.add("life", pose(S.sphere(0.0, -7.1, -0.7, 0.6, sides=4, rings=2)), "#d98a8a")
    for sx in (-1.0, 1.0):
        ear = S.lathe([(0.0, 0.0), (2.4, 0.0), (0.0, 4.0)], 3, phase=0.5)
        ear.scl(1.0, 0.6, 1.0).rot("X", -18.0).rot("Y", sx * -22.0).move(sx * 3.5, 0.8, 3.5)
        it.add("life", pose(ear), dark)
        it.add("life", pose(thin((sx * 1.3, -5.55, 0.8), (sx * 3.3, -4.9, 1.3), r=0.24, sides=3)), "#3a2a20")
    for dx, dy in ((3.0, -5.6), (-1.0, -7.0)):
        paw = S.blob(0.0, 0.0, 0.0, 2.3, 3.6, 1.7, subdiv=0)
        it.add("life", paw.rot("Z", yaw).move(hc.x + dx, hc.y + dy, 1.75), white)
    # tail from under the haunch round the front, its white tip by the paws
    tail = [Vector((hx + 4.0, hy + 2.0, 3.6)), Vector((hx + 3.0, hy - 5.0, 2.6)), Vector((hx - 3.0, hy - 9.0, 2.4)),
            Vector((hx - 10.0, hy - 10.6, 2.4)), Vector((hx - 16.0, hy - 10.4, 2.5)), Vector((hc.x + 5.0, hc.y - 9.0, 2.7))]
    tp = S.catmull(tail, per_seg=2)
    m = len(tp)
    trad = [2.8 - 1.0 * (i / (m - 1)) for i in range(m)]
    for p, r in zip(tp, trad):
        p.z = max(p.z, r)
    tg = S.tube(tp, trad, sides=5, caps=True)
    cols = []
    for i in range(m):
        cols += [rgb(white if i >= m - 2 else (mix(ginger, dark, 0.8) if i % 2 else ginger))] * 5
    cols += [rgb(ginger)] * 5 + [rgb(white)] * 5
    it.add("life", tg, cols)


@life("floor-cushions")
def floor_cushions(it):
    """Floor gaddis in block-print colours: a square indigo one with mustard
    piping and prints, a round mustard one with maroon piping."""
    indigo, mustard, maroon, cream = "#2f3f73", "#d9a033", "#8a2433", "#f1e6cf"
    G = Group()
    h = 13.0
    G.add("life", S.rbox(-25.0, 25.0, -25.0, 25.0, 0.0, h, r=4.0, seg=1, div=(2, 2, 1), puff=(0.6, 0.6, 2.2)), indigo)
    e = 24.4
    c = 3.2
    pip = [(-e + c, -e), (e - c, -e), (e, -e + c), (e, e - c), (e - c, e), (-e + c, e), (-e, e - c), (-e, -e + c)]
    G.add("life", loop_tube([(x, y, h - 1.2) for x, y in pip], 0.6, sides=3), mustard)

    def puff_z(x, y):
        u, v = x / 25.0, y / 25.0
        return h + 2.2 * max(0.0, 1 - u * u) * max(0.0, 1 - v * v) + 0.25

    G.add("life", decal([(x, y, puff_z(x, y)) for x, y in ((0.0, -6.0), (6.0, 0.0), (0.0, 6.0), (-6.0, 0.0))], (0.0, 0.0, 1.0)), mustard)
    G.add("life", decal([(x, y, puff_z(x, y) + 0.05) for x, y in ((0.0, -2.6), (2.6, 0.0), (0.0, 2.6), (-2.6, 0.0))], (0.0, 0.0, 1.0)), maroon)
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            cx, cy = sx * 14.0, sy * 14.0
            G.add("life", decal([(x, y, puff_z(x, y)) for x, y in ((cx, cy - 2.4), (cx + 2.4, cy), (cx, cy + 2.4), (cx - 2.4, cy))], (0.0, 0.0, 1.0)), cream)
    G.rot("Z", 6.0).move(-28.5, -1.0, 0.0).emit(it)
    rx, ry = 32.0, 2.0
    it.add("life", S.lathe([(0.0, 0.0), (19.0, 0.0), (22.6, 2.6), (23.5, 8.0), (22.0, 14.0), (18.0, 17.0), (0.0, 18.0)], 12, cx=rx, cy=ry), mustard)
    it.add("life", torus_z(rx, ry, 15.3, 20.4, 0.6, seg=12, sides=3), maroon)
    it.add("life", ngon_z(rx, ry, 1.6, 6, 18.05), maroon)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.26
        x, y = rx + 10.0 * math.cos(a), ry + 10.0 * math.sin(a)
        it.add("life", decal([(x + 1.3 * math.cos(a), y + 1.3 * math.sin(a), 17.75), (x - 1.0 * math.sin(a), y + 1.0 * math.cos(a), 17.75), (x - 1.3 * math.cos(a), y - 1.3 * math.sin(a), 17.75), (x + 1.0 * math.sin(a), y - 1.0 * math.cos(a), 17.75)], (0.0, 0.0, 1.0)), maroon)


@life("bucket")
def bucket(it):
    """A maroon plastic bathroom bucket of water with its handle up and a
    turquoise mug hooked over the rim."""
    maroon, turq = "#9a2b3a", "#2aa3a3"
    it.add("life", S.lathe([(0.0, 0.0), (11.5, 0.0), (14.3, 27.0), (15.0, 28.3), (14.2, 28.8), (13.5, 22.0)], 12, sharp=(1, 3, 4)), lambda p, n: shade(maroon, 0.86) if p.z < 0.5 else maroon)
    it.add("life", S.lathe([(13.5, 22.0), (0.0, 22.0)], 12), "#8fb4c8")
    for sx in (-1.0, 1.0):
        it.add("life", S.box(sx * 15.6 - 1.1, sx * 15.6 + 1.1, -1.6, 1.6, 23.6, 26.8), shade(maroon, 0.9))
    hp = []
    for k in range(7):
        a = math.pi * k / 6
        hp.append(Vector((-15.4 * math.cos(a), 0.0, 25.2 + 10.6 * math.sin(a))))
    it.add("life", S.tube(hp, 0.65, sides=4, caps=False), shade(maroon, 0.82))
    G = Group()
    G.add("life", S.lathe([(0.0, 0.0), (4.6, 0.0), (5.2, 10.5), (4.8, 10.5), (4.4, 1.2), (0.0, 1.2)], 8, sharp=(1, 2, 3)), turq)
    G.add("life", S.tube([Vector((5.0, 0.0, 9.0)), Vector((8.2, 0.0, 8.6)), Vector((8.4, 0.0, 4.0)), Vector((4.8, 0.0, 3.0))], 0.75, sides=3, caps=True), turq)
    G.rot("Y", -24.0).rot("Z", -35.0).move(-6.8, -6.2, 20.0)
    G.emit(it)

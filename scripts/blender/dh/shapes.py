"""Parametric low-poly shape library for the Dream Home kit.

All builders work in CENTIMETRES in Blender axes (X right, +Y back/north,
-Y front, Z up). Every shape returns a ``Geo`` (plain vertex/face lists plus
optional per-vertex analytic normals). Analytic normals give perfectly flat
faces with smoothly rounded bevels at a fraction of the triangle cost of a
high-segment bevel; vertices without one fall back to sharp-from-angle (35°)
smoothing when the per-slot mesh is realised.
"""

import math

import bmesh
from mathutils import Matrix, Vector

EPS = 1e-9


def _unit(v):
    length = v.length
    if length < EPS:
        return Vector((0.0, 0.0, 1.0))
    return v / length


class Geo:
    """Minimal mesh container: vertices, faces, optional per-vertex normals."""

    __slots__ = ("v", "n", "f")

    def __init__(self):
        self.v = []
        self.n = []
        self.f = []

    # -- construction -------------------------------------------------------
    def add_v(self, p, n=None):
        self.v.append(Vector(p))
        self.n.append(None if n is None else _unit(Vector(n)))
        return len(self.v) - 1

    def add_f(self, idx):
        self.f.append(tuple(idx))

    def extend(self, other):
        off = len(self.v)
        self.v.extend(Vector(p) for p in other.v)
        self.n.extend(None if n is None else Vector(n) for n in other.n)
        self.f.extend(tuple(i + off for i in face) for face in other.f)
        return self

    def copy(self):
        g = Geo()
        g.extend(self)
        return g

    # -- transforms ---------------------------------------------------------
    def apply(self, m):
        m = Matrix(m)
        nm = m.to_3x3().inverted_safe().transposed()
        self.v = [m @ p for p in self.v]
        self.n = [None if n is None else _unit(nm @ n) for n in self.n]
        if m.to_3x3().determinant() < 0:
            self.f = [tuple(reversed(face)) for face in self.f]
        return self

    def move(self, x=0.0, y=0.0, z=0.0):
        d = Vector((x, y, z))
        self.v = [p + d for p in self.v]
        return self

    def rot(self, axis, deg, about=(0.0, 0.0, 0.0)):
        a = Vector(about)
        m = Matrix.Translation(a) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-a)
        return self.apply(m)

    def scl(self, sx, sy=None, sz=None, about=(0.0, 0.0, 0.0)):
        sy = sx if sy is None else sy
        sz = sx if sz is None else sz
        a = Vector(about)
        m = Matrix.Translation(a) @ Matrix.Diagonal((sx, sy, sz, 1.0)) @ Matrix.Translation(-a)
        return self.apply(m)

    def warp(self, fn):
        """fn(p) -> new position. Normals are dropped for re-smoothing."""
        self.v = [Vector(fn(p)) for p in self.v]
        return self

    def bend_z(self, radius, y_ref):
        """Bend around a vertical axis in front (-Y) of the plane y=y_ref so the
        X extremities curl toward the front (a chair back hugging the sitter)."""
        yc = y_ref - radius
        newv, newn = [], []
        for p, n in zip(self.v, self.n):
            rho = radius + (p.y - y_ref)
            th = p.x / radius
            c, s = math.cos(th), math.sin(th)
            newv.append(Vector((rho * s, yc + rho * c, p.z)))
            if n is None:
                newn.append(None)
            else:
                newn.append(_unit(Vector((n.x * c + n.y * s, -n.x * s + n.y * c, n.z))))
        self.v, self.n = newv, newn
        return self

    # -- normals --------------------------------------------------------------
    def clear_normals(self):
        self.n = [None] * len(self.v)
        return self

    def smooth_normals(self):
        """Area-weighted vertex normals over all faces (no sharp edges)."""
        acc = [Vector((0.0, 0.0, 0.0)) for _ in self.v]
        for face in self.f:
            fn = face_normal(self.v, face, weighted=True)
            for i in face:
                acc[i] += fn
        self.n = [_unit(a) if a.length > EPS else None for a in acc]
        return self

    def orient_convex(self, center=None):
        """Flip faces so they point away from ``center`` (convex shapes only)."""
        if center is None:
            center = sum(self.v, Vector()) / max(1, len(self.v))
        out = []
        for face in self.f:
            fn = face_normal(self.v, face)
            fc = sum((self.v[i] for i in face), Vector()) / len(face)
            out.append(tuple(reversed(face)) if fn.dot(fc - center) < 0 else face)
        self.f = out
        return self

    def flip(self):
        """Reverse winding and normals (inside-out surfaces such as basins)."""
        self.f = [tuple(reversed(face)) for face in self.f]
        self.n = [None if n is None else -n for n in self.n]
        return self

    def jitter(self, amount, rng, smooth=True):
        """Displace vertices along their normal by +-amount (welded verts move
        together because displacement is keyed by rounded position)."""
        cache = {}
        newv = []
        for p, n in zip(self.v, self.n):
            key = (round(p.x, 2), round(p.y, 2), round(p.z, 2))
            if key not in cache:
                cache[key] = rng.uniform(-amount, amount)
            nn = n if n is not None else Vector((0, 0, 0))
            newv.append(p + nn * cache[key])
        self.v = newv
        if smooth:
            self.smooth_normals()
        return self

    # -- queries ----------------------------------------------------------------
    def tris(self):
        return sum(len(face) - 2 for face in self.f)

    def bounds(self):
        xs = [p.x for p in self.v]
        ys = [p.y for p in self.v]
        zs = [p.z for p in self.v]
        return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

    def volume(self):
        vol = 0.0
        for face in self.f:
            a = self.v[face[0]]
            for k in range(1, len(face) - 1):
                vol += a.dot(self.v[face[k]].cross(self.v[face[k + 1]])) / 6.0
        return vol


def face_normal(verts, face, weighted=False):
    n = Vector((0.0, 0.0, 0.0))
    for k in range(len(face)):
        a = verts[face[k]]
        b = verts[face[(k + 1) % len(face)]]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n if weighted else _unit(n)


def merge(*geos):
    g = Geo()
    for x in geos:
        g.extend(x)
    return g


# ---------------------------------------------------------------------------
# Boxes
# ---------------------------------------------------------------------------

def _axis_coords(h, r, seg, div):
    e = max(h - r, 0.0)
    zone = []
    if r > 1e-6 and seg >= 4:
        zone = [r * math.tan(math.radians(22.5))]
    pts = [-h] + [-(e + t) for t in reversed(zone)]
    if e > 1e-4:
        pts += [-e + 2.0 * e * k / max(1, div) for k in range(max(1, div) + 1)]
    else:
        pts += [0.0]
    pts += [e + t for t in zone] + [h]
    out = []
    for p in pts:
        if not out or abs(p - out[-1]) > 1e-4:
            out.append(p)
    return out


def rbox(x0, x1, y0, y1, z0, z1, r=3.0, seg=2, div=(1, 1, 1), puff=(0.0, 0.0, 0.0), puff_bottom=False):
    """Rounded box. ``seg`` 2 or 4 bevel segments, analytic normals.

    ``puff`` (px, py, pz) bulges the faces outward like an upholstered cushion;
    puffed boxes get fully smooth normals instead of analytic ones.
    """
    c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2]
    r = max(0.05, min(r, 0.97 * min(h)))
    e = [max(hh - r, 0.0) for hh in h]
    coords = [_axis_coords(h[a], r, seg, div[a]) for a in range(3)]
    g = Geo()
    index = {}

    def vid(ijk):
        if ijk in index:
            return index[ijk]
        p = Vector((coords[0][ijk[0]], coords[1][ijk[1]], coords[2][ijk[2]]))
        cc = Vector((max(-e[0], min(e[0], p.x)), max(-e[1], min(e[1], p.y)), max(-e[2], min(e[2], p.z))))
        d = p - cc
        n = _unit(d)
        q = cc + n * r if r > 1e-6 else p
        index[ijk] = g.add_v(c + q, n)
        return index[ijk]

    for a in range(3):
        b, cax = (a + 1) % 3, (a + 2) % 3
        for side in (0, len(coords[a]) - 1):
            nb, nc = len(coords[b]), len(coords[cax])
            for i in range(nb - 1):
                for j in range(nc - 1):
                    quad = []
                    for (di, dj) in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        ijk = [0, 0, 0]
                        ijk[a] = side
                        ijk[b] = i + di
                        ijk[cax] = j + dj
                        quad.append(vid(tuple(ijk)))
                    g.add_f(quad)
    g.orient_convex(c)
    if any(abs(p) > 1e-6 for p in puff):
        hv = h
        newv = []
        for p, n in zip(g.v, g.n):
            lp = p - c
            u = [lp[k] / hv[k] if hv[k] > EPS else 0.0 for k in range(3)]
            disp = 0.0
            for a in range(3):
                if puff[a] == 0.0:
                    continue
                if a == 2 and not puff_bottom and n.z < 0:
                    continue
                o1, o2 = (a + 1) % 3, (a + 2) % 3
                bump = max(0.0, 1 - u[o1] ** 2) * max(0.0, 1 - u[o2] ** 2)
                disp += (n[a] ** 2) * puff[a] * bump
            newv.append(p + n * disp)
        g.v = newv
        g.smooth_normals()
    return g


def cbox(x0, x1, y0, y1, z0, z1, r=1.0):
    """Cheap chamfered box (44 tris) whose face-normal shading reads as rounded."""
    c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2]
    r = max(0.05, min(r, 0.9 * min(h)))
    e = [hh - r for hh in h]
    g = Geo()
    index = {}

    def vid(a, signs):
        key = (a,) + tuple(signs)
        if key not in index:
            p = Vector([signs[i] * (h[i] if i == a else e[i]) for i in range(3)])
            n = Vector([signs[i] if i == a else 0.0 for i in range(3)])
            index[key] = g.add_v(c + p, n)
        return index[key]

    for a in range(3):
        b, cc = (a + 1) % 3, (a + 2) % 3
        for s in (-1, 1):
            quad = []
            for sb, sc in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                sg = [0, 0, 0]
                sg[a], sg[b], sg[cc] = s, sb, sc
                quad.append(vid(a, sg))
            g.add_f(quad)
    for a in range(3):
        b = (a + 1) % 3
        cax = (a + 2) % 3
        for sa in (-1, 1):
            for sb in (-1, 1):
                ring = []
                for sc in (-1, 1):
                    sg = [0, 0, 0]
                    sg[a], sg[b], sg[cax] = sa, sb, sc
                    ring.append(sg)
                g.add_f([vid(a, ring[0]), vid(a, ring[1]), vid(b, ring[1]), vid(b, ring[0])])
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                sg = [sx, sy, sz]
                g.add_f([vid(0, sg), vid(1, sg), vid(2, sg)])
    g.orient_convex(c)
    return g


def box(x0, x1, y0, y1, z0, z1):
    """Sharp box (12 tris) with split face normals."""
    g = Geo()
    c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    lo, hi = (x0, y0, z0), (x1, y1, z1)
    for a in range(3):
        b, cc = (a + 1) % 3, (a + 2) % 3
        for s in (0, 1):
            quad = []
            for sb, sc in ((0, 0), (1, 0), (1, 1), (0, 1)):
                p = [0, 0, 0]
                p[a] = (lo, hi)[s][a]
                p[b] = (lo, hi)[sb][b]
                p[cc] = (lo, hi)[sc][cc]
                n = [0, 0, 0]
                n[a] = 1 if s else -1
                quad.append(g.add_v(p, n))
            g.add_f(quad)
    g.orient_convex(c)
    return g


# ---------------------------------------------------------------------------
# 2D outlines (functions of inset -> list of (u, v), counter-clockwise)
# ---------------------------------------------------------------------------

def rrect(w, h, r, seg=3, cu=0.0, cv=0.0, edge_div=(0, 0)):
    """Rounded rectangle centred at (cu, cv). ``edge_div`` adds points along
    the straight (horizontal, vertical) edges for bending."""

    def fn(inset):
        ww, hh = w / 2 - inset, h / 2 - inset
        rr = max(min(r - inset, ww * 0.999, hh * 0.999), 0.02)
        pts = []
        corners = ((ww - rr, -hh + rr, -90.0), (ww - rr, hh - rr, 0.0), (-ww + rr, hh - rr, 90.0), (-ww + rr, -hh + rr, 180.0))
        for ci, (ox, oy, a0) in enumerate(corners):
            for k in range(seg + 1):
                a = math.radians(a0 + 90.0 * k / seg)
                pts.append((cu + ox + rr * math.cos(a), cv + oy + rr * math.sin(a)))
            nd = edge_div[1] if ci in (0, 2) else edge_div[0]
            if nd:
                nx_ox, nx_oy, _ = corners[(ci + 1) % 4]
                a_end = math.radians(a0 + 90.0)
                p0 = (ox + rr * math.cos(a_end), oy + rr * math.sin(a_end))
                a_next = math.radians(corners[(ci + 1) % 4][2])
                p1 = (nx_ox + rr * math.cos(a_next), nx_oy + rr * math.sin(a_next))
                for k in range(1, nd + 1):
                    t = k / (nd + 1)
                    pts.append((cu + p0[0] + (p1[0] - p0[0]) * t, cv + p0[1] + (p1[1] - p0[1]) * t))
        return pts

    return fn


def circle(rad, n=16, cu=0.0, cv=0.0, phase=0.0):
    def fn(inset):
        rr = max(rad - inset, 0.02)
        return [(cu + rr * math.cos(phase + 2 * math.pi * k / n), cv + rr * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]

    return fn


def ellipse(ru, rv, n=16, cu=0.0, cv=0.0):
    def fn(inset):
        a, b = max(ru - inset, 0.02), max(rv - inset, 0.02)
        return [(cu + a * math.cos(2 * math.pi * k / n), cv + b * math.sin(2 * math.pi * k / n)) for k in range(n)]

    return fn


def arch(w, h, n_arc=8, rb=2.0, cu=0.0, v0=0.0):
    """Rectangle with a semicircular top; bottom corners rounded by ``rb``."""

    def fn(inset):
        ww = w / 2 - inset
        rbb = max(rb - inset, 0.02)
        top = v0 + h - inset
        cyc = top - ww
        bot = v0 + inset
        pts = []
        for k in range(3):
            a = math.radians(-90 + 45 * k)
            pts.append((cu + ww - rbb + rbb * math.cos(a), bot + rbb + rbb * math.sin(a)))
        for k in range(n_arc + 1):
            a = math.pi * k / n_arc
            pts.append((cu + ww * math.cos(a), cyc + ww * math.sin(a)))
        for k in range(3):
            a = math.radians(180 + 45 * k)
            pts.append((cu - ww + rbb + rbb * math.cos(a), bot + rbb + rbb * math.sin(a)))
        return pts

    return fn


def _outline_normals(pts):
    n = len(pts)
    out = []
    for i in range(n):
        a = Vector(pts[i - 1])
        b = Vector(pts[i])
        c = Vector(pts[(i + 1) % n])
        e1 = b - a
        e2 = c - b
        n1 = Vector((e1.y, -e1.x))
        n2 = Vector((e2.y, -e2.x))
        if n1.length > EPS:
            n1.normalize()
        if n2.length > EPS:
            n2.normalize()
        m = n1 + n2
        out.append(m.normalized() if m.length > EPS else n2)
    return out


_AXES = {
    # local (u, v, w) -> world; handedness preserving
    "Z": (lambda u, v, w: (u, v, w)),
    "Y": (lambda u, v, w: (u, -w, v)),
    "X": (lambda u, v, w: (w, u, v)),
}


def _ring_params(b, seg, w0, w1):
    if b > 1e-6:
        angles = [90.0 * k / seg for k in range(seg + 1)]
        rings = [(b * (1 - math.sin(math.radians(a))), w0 + b * (1 - math.cos(math.radians(a))), -math.cos(math.radians(a)), math.sin(math.radians(a))) for a in angles]
        rings += [(b * (1 - math.sin(math.radians(a))), w1 - b * (1 - math.cos(math.radians(a))), math.cos(math.radians(a)), math.sin(math.radians(a))) for a in reversed(angles)]
        return rings
    return [(0.0, w0, 0.0, 1.0), (0.0, w1, 0.0, 1.0)]


def slab(outline, w0, w1, b=1.0, seg=2, axis="Z", hole=None, hole_b=None, cap_bottom=True):
    """Extrude a 2D outline between depths w0..w1 along ``axis`` with a
    rounded edge of radius ``b`` (``seg`` segments). For axis 'Y' pass the
    world y-range (y0, y1). ``hole`` is an optional inner outline function
    (same point count) making a frame/ring; ``hole_b`` its own edge radius."""
    if axis == "Y":
        w0, w1 = -w1, -w0
    mp = _AXES[axis]
    half = (w1 - w0) / 2 * 0.98
    b = max(0.0, min(b, half))
    hb = b if hole_b is None else max(0.0, min(hole_b, half))
    g = Geo()

    def world(u, v, w):
        return Vector(mp(u, v, w))

    def make_rings(fn, sign, params):
        out = []
        for inset, w, nw, ns in params:
            pts = fn(sign * inset)
            nrm = _outline_normals(pts)
            ring = []
            for (u, v), m in zip(pts, nrm):
                nl = (sign * ns * m.x, sign * ns * m.y, nw)
                ring.append(g.add_v(world(u, v, w), mp(*nl)))
            out.append(ring)
        return out

    def cap_ring(fn, sign, inset, w, nw):
        pts = fn(sign * inset)
        return [g.add_v(world(u, v, w), mp(0.0, 0.0, nw)) for (u, v) in pts]

    outer = make_rings(outline, 1.0, _ring_params(b, seg, w0, w1))
    count = len(outer[0])
    for k in range(len(outer) - 1):
        r0, r1 = outer[k], outer[k + 1]
        for i in range(count):
            j = (i + 1) % count
            g.add_f((r0[i], r0[j], r1[j], r1[i]))
    if b > 1e-6:
        ob, ot = outer[0], outer[-1]
    else:
        ob, ot = cap_ring(outline, 1.0, 0.0, w0, -1.0), cap_ring(outline, 1.0, 0.0, w1, 1.0)
    if hole is None:
        if cap_bottom:
            g.add_f(tuple(reversed(ob)))
        g.add_f(tuple(ot))
        return g
    inner = make_rings(hole, -1.0, _ring_params(hb, seg, w0, w1))
    if len(inner[0]) != count:
        raise ValueError("hole outline must have the same point count as the outline")
    for k in range(len(inner) - 1):
        r0, r1 = inner[k], inner[k + 1]
        for i in range(count):
            j = (i + 1) % count
            g.add_f((r0[j], r0[i], r1[i], r1[j]))
    if hb > 1e-6:
        ib, it = inner[0], inner[-1]
    else:
        ib, it = cap_ring(hole, -1.0, 0.0, w0, -1.0), cap_ring(hole, -1.0, 0.0, w1, 1.0)
    for i in range(count):
        j = (i + 1) % count
        g.add_f((ot[i], ot[j], it[j], it[i]))
        g.add_f((ob[j], ob[i], ib[i], ib[j]))
    return g


def panel(outline, w, axis="Z", facing=1.0):
    """A single flat polygon (outline at inset 0) at depth ``w`` along
    ``axis`` facing +axis (facing=1) or -axis. For axis 'Y' pass the world y
    and facing=-1 for a front (-Y) facing panel."""
    mp = _AXES[axis]
    ww = -w if axis == "Y" else w
    nl = facing if axis != "Y" else -facing
    g = Geo()
    ids = [g.add_v(mp(u, v, ww), mp(0.0, 0.0, nl)) for (u, v) in outline(0.0)]
    g.add_f(tuple(ids) if nl > 0 else tuple(reversed(ids)))
    return g


def loft(sections, cap_bottom=True, cap_top=True, smooth=True):
    """Skin horizontal 3D sections (equal point counts, CCW seen from +Z,
    bottom -> top). Sides get smooth normals, caps flat ones."""
    g = Geo()
    rings = [[g.add_v(p) for p in sec] for sec in sections]
    n = len(sections[0])
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            g.add_f((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    if smooth:
        g.smooth_normals()
    if cap_bottom:
        ids = [g.add_v(p, (0, 0, -1)) for p in sections[0]]
        g.add_f(tuple(reversed(ids)))
    if cap_top:
        ids = [g.add_v(p, (0, 0, 1)) for p in sections[-1]]
        g.add_f(tuple(ids))
    return g


def ring_pts(fn, z, inset=0.0):
    """3D points of a 2D outline function at height z."""
    return [Vector((u, v, z)) for (u, v) in fn(inset)]


# ---------------------------------------------------------------------------
# Surfaces of revolution and sweeps
# ---------------------------------------------------------------------------

def lathe(profile, sides=12, sharp=(), cx=0.0, cy=0.0, phase=0.0, smooth=True, closed=False):
    """Revolve a (r, z) profile (bottom -> top, outward = +r) around Z.
    Points with r == 0 become poles. ``sharp`` lists profile indices whose
    normal is split (crisp crease). ``smooth=False`` leaves normals to the
    angle-based fallback."""
    if closed:
        # closed loop profile (a shell): repeat the first point at the end and
        # treat the seam as a sharp corner.
        profile = list(profile) + [profile[0]]
        sharp = tuple(sharp) + (0, len(profile) - 1)
    m = len(profile)
    P = [Vector((float(r), float(z))) for r, z in profile]
    seg_n = []
    for i in range(m - 1):
        t = P[i + 1] - P[i]
        nn = Vector((t.y, -t.x))
        seg_n.append(nn.normalized() if nn.length > EPS else Vector((1.0, 0.0)))
    g = Geo()
    angs = [phase + 2 * math.pi * k / sides for k in range(sides)]

    def ring(i, n2):
        r, z = P[i]
        if r < 1e-6:
            nn = (0.0, 0.0, n2.y if abs(n2.y) > EPS else 1.0)
            return [g.add_v((cx, cy, z), nn if smooth else None)]
        out = []
        for a in angs:
            ca, sa = math.cos(a), math.sin(a)
            nn = (n2.x * ca, n2.x * sa, n2.y) if smooth else None
            out.append(g.add_v((cx + r * ca, cy + r * sa, z), nn))
        return out

    # rings: for each point produce (before, after) ring ids
    before, after = [None] * m, [None] * m
    for i in range(m):
        if i == 0:
            after[i] = ring(i, seg_n[0])
        elif i == m - 1:
            before[i] = ring(i, seg_n[-1])
        elif i in sharp:
            before[i] = ring(i, seg_n[i - 1])
            after[i] = ring(i, seg_n[i])
        else:
            avg = seg_n[i - 1] + seg_n[i]
            rr = ring(i, avg.normalized() if avg.length > EPS else seg_n[i])
            before[i] = after[i] = rr
    for i in range(m - 1):
        A, B = after[i], before[i + 1]
        if len(A) == 1 and len(B) == 1:
            continue
        for k in range(sides):
            k2 = (k + 1) % sides
            if len(A) == 1:
                g.add_f((A[0], B[k2], B[k]))
            elif len(B) == 1:
                g.add_f((A[k], A[k2], B[0]))
            else:
                g.add_f((A[k], A[k2], B[k2], B[k]))
    return g


def cyl(cx, cy, z0, z1, r, sides=12, b=0.8, r1=None, seg=2):
    """Capped cylinder / truncated cone with rounded rims (radius b)."""
    rt = r if r1 is None else r1
    b = max(0.0, min(b, (z1 - z0) / 2 * 0.95, r * 0.9, rt * 0.9))
    prof = [(0.0, z0)]
    if b > 1e-6:
        for k in range(seg + 1):
            a = math.radians(-90 + 90 * k / seg)
            prof.append((r - b + b * math.cos(a), z0 + b + b * math.sin(a)))
        for k in range(seg + 1):
            a = math.radians(90 * k / seg)
            prof.append((rt - b + b * math.cos(a), z1 - b + b * math.sin(a)))
        prof.append((0.0, z1))
        sharp = (1, len(prof) - 2)
    else:
        prof += [(r, z0), (rt, z1), (0.0, z1)]
        sharp = (1, 2)
    return lathe(prof, sides, sharp=sharp, cx=cx, cy=cy)


def frames(path):
    """Parallel-transport frames (T, U, V) along a polyline."""
    P = [Vector(p) for p in path]
    n = len(P)
    T = []
    for i in range(n):
        if i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = _unit(P[i + 1] - P[i]) + _unit(P[i] - P[i - 1])
        T.append(_unit(t))
    ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    U = [_unit(ref - T[0] * ref.dot(T[0]))]
    for i in range(1, n):
        u = U[-1] - T[i] * U[-1].dot(T[i])
        U.append(_unit(u) if u.length > EPS else U[-1])
    V = [T[i].cross(U[i]) for i in range(n)]
    return P, T, U, V


def tube(path, radius, sides=8, caps=True, phase=0.0, scale_v=1.0):
    """Sweep a circle along ``path``; ``radius`` scalar or per-point list.
    ``scale_v`` squashes the section along V (elliptic tubes)."""
    P, T, U, V = frames(path)
    n = len(P)
    rads = radius if isinstance(radius, (list, tuple)) else [radius] * n
    g = Geo()
    rings = []
    for i in range(n):
        ring = []
        for k in range(sides):
            a = phase + 2 * math.pi * k / sides
            d = U[i] * math.cos(a) + V[i] * math.sin(a) * scale_v
            nn = U[i] * math.cos(a) + V[i] * (math.sin(a) / max(scale_v, 1e-3))
            ring.append(g.add_v(P[i] + d * rads[i], nn))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            g.add_f((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    if caps:
        for end, sgn in ((0, -1.0), (n - 1, 1.0)):
            ids = []
            for k in range(sides):
                a = phase + 2 * math.pi * k / sides
                d = U[end] * math.cos(a) + V[end] * math.sin(a) * scale_v
                ids.append(g.add_v(P[end] + d * rads[end], T[end] * sgn))
            g.add_f(tuple(ids) if sgn > 0 else tuple(reversed(ids)))
    return g


def catmull(points, per_seg=4):
    """Catmull-Rom resample through control points (inclusive ends)."""
    P = [Vector(p) for p in points]
    if len(P) < 3:
        return P
    out = []
    ext = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(per_seg):
            t = k / per_seg
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


# ---------------------------------------------------------------------------
# Organic
# ---------------------------------------------------------------------------

_ICO_CACHE = {}


def _ico(subdiv):
    if subdiv not in _ICO_CACHE:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv + 1, radius=1.0)
        verts = [v.co.copy() for v in bm.verts]
        faces = [tuple(v.index for v in f.verts) for f in bm.faces]
        bm.free()
        _ICO_CACHE[subdiv] = (verts, faces)
    return _ICO_CACHE[subdiv]


def blob(cx, cy, cz, rx, ry=None, rz=None, subdiv=2, jitter=0.0, rng=None, flat_bottom=None, normals="ellipsoid", squash_top=0.0):
    """Icosphere-based lump. ``normals``: 'ellipsoid' (soft, analytic),
    'smooth' (from faces, keeps jitter bumps) or None (angle-based facets)."""
    ry = rx if ry is None else ry
    rz = rx if rz is None else rz
    verts, faces = _ico(subdiv)
    g = Geo()
    for p in verts:
        k = 1.0
        if jitter and rng is not None:
            k += rng.uniform(-jitter, jitter)
        q = Vector((p.x * rx * k, p.y * ry * k, p.z * rz * k))
        if squash_top and p.z > 0:
            q.z *= 1.0 - squash_top * p.z
        if flat_bottom is not None and q.z < -flat_bottom:
            q.z = -flat_bottom + (q.z + flat_bottom) * 0.15
        n = Vector((p.x / rx, p.y / ry, p.z / rz)) if normals == "ellipsoid" else None
        g.add_v(q + Vector((cx, cy, cz)), n)
    for f in faces:
        g.add_f(f)
    g.orient_convex(Vector((cx, cy, cz)))
    if normals == "smooth":
        g.smooth_normals()
    return g


def sphere(cx, cy, cz, r, sides=10, rings=6, rz=None):
    rz = r if rz is None else rz
    prof = [(0.0, -rz)]
    for k in range(1, rings):
        a = -math.pi / 2 + math.pi * k / rings
        prof.append((r * math.cos(a), rz * math.sin(a)))
    prof.append((0.0, rz))
    g = lathe(prof, sides)
    if abs(rz - r) > 1e-6:
        # fix normals for spheroid
        for i, p in enumerate(g.v):
            g.n[i] = _unit(Vector((p.x / (r * r), p.y / (r * r), p.z / (rz * rz))))
    return g.move(cx, cy, cz)


def leaf_sheet(base, tip, width, droop=0.0, segs=4, up=(0, 0, 1), curl=0.0):
    """A tapered double-sided-friendly leaf blade from ``base`` to ``tip``
    (a thin closed sliver so it stays manifold)."""
    base, tip, up = Vector(base), Vector(tip), Vector(up)
    axis = tip - base
    length = axis.length
    fwd = _unit(axis)
    side = _unit(fwd.cross(up))
    nrm = side.cross(fwd)
    g = Geo()
    top, bot = [], []
    for k in range(segs + 1):
        t = k / segs
        wv = width * math.sin(math.pi * min(1.0, 0.15 + t * 0.85)) * (1 - 0.15 * t)
        c = base + fwd * (length * t) - nrm * (droop * t * t * length)
        lift = nrm * (curl * wv)
        top.append((c + side * wv + lift, c - side * wv + lift, c + nrm * 0.25))
    for k in range(segs + 1):
        l, r_, mid = top[k]
        top[k] = (g.add_v(l), g.add_v(r_), g.add_v(mid))
    for k in range(segs):
        a, b = top[k], top[k + 1]
        g.add_f((a[0], b[0], b[2], a[2]))
        g.add_f((a[2], b[2], b[1], a[1]))
    return g

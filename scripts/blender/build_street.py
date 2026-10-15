"""Dream Home street life kit (headless Blender) -> public/models/street.raw.glb

Low-poly toy actors for the animated street, each split into separately
named rigid parts so the web app can animate them procedurally (no skinning,
no baked animation):

  <actor>                root empty (actor origin on the ground, faces -Y)
  <actor>:<part>         one mesh per part; its origin is the joint pivot

Colours are per-vertex (COLOR_0 "Col", linear) on one shared material
"street". Sizes are centimetres while building, metres in the GLB.

Usage (repo root):
  Blender --factory-startup -b --python-exit-code 1 \
      --python scripts/blender/build_street.py -- [--out public/models]
"""

import argparse
import json
import math
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

from dh import catalog  # noqa: E402
from dh import scene as SC  # noqa: E402
from dh import shapes as S  # noqa: E402
from dh.materials import hex_to_linear  # noqa: E402

CM = 0.01
TRI_BUDGET = 9000


class Part:
    def __init__(self, name, pivot=(0.0, 0.0, 0.0)):
        self.name = name
        self.pivot = pivot
        self.geos = []

    def add(self, geo, color):
        self.geos.append((geo, color))
        return geo


class Actor:
    def __init__(self, name):
        self.name = name
        self.parts = []

    def part(self, name, pivot=(0.0, 0.0, 0.0)):
        p = Part(f"{self.name}:{name}", pivot)
        self.parts.append(p)
        return p


def rb(x0, x1, y0, y1, z0, z1, r=2.0):
    return S.rbox(x0, x1, y0, y1, z0, z1, r=r, seg=1)


def wheel_x(cx, cy, cz, r, w, sides=10):
    g = S.cyl(0.0, 0.0, -w / 2, w / 2, r, sides=sides, b=min(1.5, r * 0.2), seg=1)
    g.rot("Y", 90.0)
    return g.move(cx, cy, cz)


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------
SKIN = "#9b6a48"
HAIR = "#1f1a17"


def person(name, h, top, bottom, shoes, style):
    a = Actor(name)
    hip = h * 0.5
    sh = h * 0.81
    hx = h * 0.055
    sx = h * 0.12
    head_r = h * 0.066
    neck = sh + h * 0.02
    # Legs (pivot at the hip joint, swing about X).
    for side, nm in ((-1, "leg-l"), (1, "leg-r")):
        x = side * hx
        leg = a.part(nm, (x, 0.0, hip))
        lw = h * 0.034
        if style == "kid":
            leg.add(rb(x - lw - 1.0, x + lw + 1.0, -lw - 1.0, lw + 1.0, hip - h * 0.17, hip + 2.0, r=1.5), bottom)
            leg.add(S.cyl(x, 0.0, h * 0.06, hip - h * 0.16, lw * 0.85, sides=6, b=0.0), SKIN)
            leg.add(S.cyl(x, 0.0, h * 0.035, h * 0.1, lw * 0.95, sides=6, b=0.0), "#f2f0ea")
        else:
            leg.add(S.cyl(x, 0.0, h * 0.04, hip + 2.0, lw, sides=6, b=0.0, r1=lw * 1.15), bottom)
        leg.add(rb(x - lw, x + lw, -lw * 2.6, lw, 0.0, h * 0.045, r=1.2), shoes)
    # Arms (pivot at the shoulder).
    for side, nm in ((-1, "arm-l"), (1, "arm-r")):
        x = side * (sx + h * 0.012)
        arm = a.part(nm, (x, 0.0, sh - 2.0))
        aw = h * 0.026
        sleeve = top if style != "saree" else "#d9a441"
        sl_len = h * 0.14 if style != "saree" else h * 0.06
        arm.add(S.cyl(x, 0.0, sh - sl_len, sh, aw * 1.25, sides=6, b=0.0), sleeve)
        arm.add(S.cyl(x, 0.0, sh - h * 0.31, sh - sl_len + 1.0, aw, sides=6, b=0.0), SKIN)
        arm.add(S.blob(x, 0.0, sh - h * 0.33, aw * 1.2, aw * 1.2, aw * 1.4, subdiv=0), SKIN)
    # Body (torso, clothes, neck).
    body = a.part("body", (0.0, 0.0, hip))
    tw, td = sx * 0.95, h * 0.07
    if style == "saree":
        body.add(rb(-tw, tw, -td, td, hip, sh + 1.0, r=3.0), "#d9a441")
        skirt = S.lathe([(0.0, h * 0.02), (h * 0.13, h * 0.02), (h * 0.1, hip + 4.0), (tw * 0.95, hip + 8.0), (0.0, hip + 8.0)], 10, sharp=(1, 3))
        body.add(skirt, top)
        pallu = rb(-tw * 0.9, tw * 0.9, -td - 1.2, td + 1.2, hip + h * 0.04, sh - h * 0.03, r=2.0)
        pallu.rot("Y", -28.0, (0.0, 0.0, (hip + sh) / 2))
        body.add(pallu, top)
        body.add(rb(-tw * 0.95, -tw * 0.2, td - 1.0, td + 2.2, sh - h * 0.25, sh + 0.5, r=1.5), bottom)
    elif style == "kurta":
        kurta = S.lathe([(0.0, hip - h * 0.2), (tw * 1.15, hip - h * 0.2), (tw * 1.02, hip + 4.0), (tw, sh), (0.0, sh + 1.0)], 8, sharp=(1,))
        kurta.scl(1.0, 0.62, 1.0)
        body.add(kurta, top)
    else:  # kid: shirt + backpack
        body.add(rb(-tw, tw, -td, td, hip - 2.0, sh + 1.0, r=3.0), top)
        body.add(rb(-tw - 1.0, tw + 1.0, -td - 1.0, td + 1.0, hip - h * 0.05, hip + 3.0, r=2.0), bottom)
        body.add(rb(-tw * 0.85, tw * 0.85, td, td + h * 0.09, hip + h * 0.05, sh - 1.0, r=3.0), "#c8402f")
    body.add(S.cyl(0.0, 0.0, sh, neck + 2.0, h * 0.022, sides=6, b=0.0), SKIN)
    # Head (pivot at the neck).
    head = a.part("head", (0.0, 0.0, neck))
    cz = neck + head_r * 0.95
    head.add(S.sphere(0.0, 0.0, cz, head_r, sides=8, rings=5), SKIN)
    hair = S.sphere(0.0, head_r * 0.12, cz + head_r * 0.12, head_r * 1.06, sides=8, rings=5)
    hair.scl(1.0, 1.0, 0.92, (0.0, 0.0, cz))
    head.add(hair, HAIR)
    if style == "saree":
        head.add(S.sphere(0.0, head_r * 0.95, cz - head_r * 0.1, head_r * 0.45, sides=6, rings=4), HAIR)
        head.add(S.sphere(0.0, -head_r * 0.98, cz + head_r * 0.35, head_r * 0.12, sides=4, rings=2), "#c8302f")
    return a


# ---------------------------------------------------------------------------
# Animals
# ---------------------------------------------------------------------------
def dog():
    a = Actor("dog")
    tan, dark = "#c58a4e", "#5a3b24"
    z = 30.0
    body = a.part("body", (0.0, 0.0, z))
    body.add(S.tube([(0.0, -20.0, z + 2.0), (0.0, 0.0, z), (0.0, 18.0, z + 1.0)], [9.0, 8.0, 8.5], sides=7), tan)
    body.add(S.blob(0.0, -2.0, z - 5.0, 6.0, 14.0, 4.0, subdiv=0), "#e7c9a1")
    head = a.part("head", (0.0, -22.0, z + 6.0))
    head.add(S.blob(0.0, -28.0, z + 11.0, 7.0, 8.0, 7.0, subdiv=1), tan)
    head.add(rb(-3.5, 3.5, -40.0, -32.0, z + 6.0, z + 11.0, r=2.0), tan)
    head.add(S.sphere(0.0, -40.5, z + 9.5, 1.6, sides=4, rings=2), "#1c1714")
    for sx in (-1, 1):
        ear = S.lathe([(0.0, 0.0), (2.6, 0.0), (0.0, 7.0)], 4)
        ear.rot("Y", sx * 15.0).move(sx * 4.0, -26.0, z + 16.0)
        head.add(ear, dark)
    for nm, x, y in (("leg-fl", -4.5, -15.0), ("leg-fr", 4.5, -15.0), ("leg-bl", -4.5, 15.0), ("leg-br", 4.5, 15.0)):
        leg = a.part(nm, (x, y, z - 2.0))
        leg.add(S.cyl(x, y, 1.5, z - 1.0, 2.4, sides=5, b=0.0, r1=3.0), tan)
        leg.add(S.blob(x, y - 1.0, 1.5, 2.6, 3.2, 1.6, subdiv=0), "#e7c9a1")
    tail = a.part("tail", (0.0, 20.0, z + 3.0))
    tail.add(S.tube([(0.0, 20.0, z + 3.0), (0.0, 26.0, z + 10.0), (0.0, 24.0, z + 17.0), (0.0, 19.0, z + 19.0)], [2.2, 1.9, 1.6, 1.0], sides=4), tan)
    return a


def cow():
    a = Actor("cow")
    cream, grey, horn, hoof = "#eee6d8", "#cfc6b8", "#c9b48f", "#3a332d"
    z = 82.0
    body = a.part("body", (0.0, 0.0, z))
    body.add(S.blob(0.0, 0.0, z + 10.0, 27.0, 62.0, 30.0, subdiv=1), cream)
    body.add(S.blob(0.0, -40.0, z + 36.0, 15.0, 16.0, 14.0, subdiv=1), cream)  # hump
    body.add(S.blob(0.0, -56.0, z - 10.0, 9.0, 12.0, 22.0, subdiv=0), grey)  # dewlap
    body.add(S.tube([(0.0, 60.0, z + 24.0), (0.0, 66.0, z), (0.0, 64.0, z - 40.0)], [3.0, 2.2, 1.8], sides=4), cream)
    body.add(S.blob(0.0, 64.0, z - 44.0, 4.0, 4.0, 7.0, subdiv=0), "#4a4038")
    head = a.part("head", (0.0, -58.0, z + 22.0))
    hd = S.blob(0.0, -80.0, z + 22.0, 12.0, 22.0, 13.0, subdiv=1)
    hd.rot("X", -25.0, (0.0, -80.0, z + 22.0))
    head.add(hd, grey)
    head.add(rb(-9.0, 9.0, -101.0, -92.0, z + 2.0, z + 13.0, r=3.5), "#7d6f63")
    for sx in (-1, 1):
        head.add(S.tube([(sx * 6.0, -72.0, z + 32.0), (sx * 13.0, -70.0, z + 42.0), (sx * 12.0, -74.0, z + 52.0)], [3.2, 2.4, 1.0], sides=5), horn)
        ear = S.blob(sx * 15.0, -70.0, z + 26.0, 8.0, 3.0, 4.0, subdiv=0)
        head.add(ear, grey)
    for nm, x, y in (("leg-fl", -13.0, -38.0), ("leg-fr", 13.0, -38.0), ("leg-bl", -13.0, 42.0), ("leg-br", 13.0, 42.0)):
        leg = a.part(nm, (x, y, z - 5.0))
        leg.add(S.cyl(x, y, 6.0, z, 5.0, sides=6, b=0.0, r1=6.5), cream)
        leg.add(S.cyl(x, y, 0.0, 7.0, 4.6, sides=6, b=0.0), hoof)
    return a


def bird():
    a = Actor("bird")
    black, grey = "#2a2a2f", "#55555c"
    body = a.part("body", (0.0, 0.0, 0.0))
    body.add(S.blob(0.0, 0.0, 0.0, 4.0, 10.0, 4.0, subdiv=1), black)
    body.add(S.blob(0.0, -9.0, 2.5, 3.5, 3.5, 3.5, subdiv=0), grey)
    body.add(S.lathe([(0.0, 0.0), (1.2, 0.0), (0.0, 4.0)], 4).rot("X", 90.0).move(0.0, -12.0, 2.5), "#3a3324")
    tail = rb(-3.0, 3.0, 8.0, 15.0, -0.8, 0.8, r=0.5)
    body.add(tail, black)
    for sx, nm in ((-1, "wing-l"), (1, "wing-r")):
        w = a.part(nm, (sx * 3.0, -1.0, 1.0))
        g = S.Geo()
        tip = sx * 21.0
        pts = [(sx * 3.0, -5.0, 1.0), (tip, 1.0, 1.5), (tip * 0.8, 5.0, 1.0), (sx * 3.0, 4.0, 1.0)]
        top = [g.add_v((x, y, z + 0.6)) for (x, y, z) in pts]
        bot = [g.add_v((x, y, z - 0.6)) for (x, y, z) in pts]
        if sx > 0:
            g.add_f(tuple(top))
            g.add_f(tuple(reversed(bot)))
        else:
            g.add_f(tuple(reversed(top)))
            g.add_f(tuple(bot))
        for k in range(4):
            k2 = (k + 1) % 4
            f = (top[k], bot[k], bot[k2], top[k2]) if sx > 0 else (top[k], top[k2], bot[k2], bot[k])
            g.add_f(f)
        w.add(g, black)
    return a


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------
def scooter():
    a = Actor("scooter")
    paint, seat, chrome, tyre = "#2f6fa3", "#2a2624", "#c9c7c2", "#242424"
    r = 22.0
    body = a.part("body", (0.0, 0.0, r))
    body.add(rb(-14.0, 14.0, -20.0, 55.0, r - 4.0, r + 6.0, r=3.0), "#3a3a3a")  # floor deck
    body.add(rb(-17.0, 17.0, 18.0, 70.0, r + 4.0, r + 40.0, r=8.0), paint)  # rear body
    body.add(rb(-14.0, 14.0, 10.0, 60.0, r + 40.0, r + 48.0, r=4.0), seat)
    apron = rb(-16.0, 16.0, -48.0, -30.0, r - 2.0, r + 70.0, r=6.0)
    apron.rot("X", -12.0, (0.0, -40.0, r))
    body.add(apron, paint)
    body.add(S.tube([(0.0, -48.0, r + 10.0), (0.0, -58.0, r - 2.0)], 2.5, sides=5), chrome)
    body.add(rb(-6.0, 6.0, -62.0, -50.0, r + 12.0, r + 20.0, r=3.0), paint)  # front mudguard
    body.add(rb(-30.0, 30.0, -46.0, -40.0, r + 80.0, r + 84.0, r=1.5), chrome)  # handlebar
    body.add(rb(-9.0, 9.0, -52.0, -44.0, r + 76.0, r + 90.0, r=3.0), paint)
    body.add(S.sphere(0.0, -53.0, r + 84.0, 4.5, sides=6, rings=3), "#fff4d0")
    # Rider: shirt, trousers, helmet.
    shirt, pants = "#e9e2d0", "#3e4a5c"
    body.add(rb(-15.0, 15.0, 5.0, 30.0, r + 48.0, r + 110.0, r=6.0), shirt)
    body.add(rb(-15.0, 15.0, -22.0, 28.0, r + 44.0, r + 56.0, r=4.0), pants)
    for sx in (-1, 1):
        body.add(rb(sx * 15.0 - 5.0, sx * 15.0 + 5.0, -26.0, -16.0, r + 6.0, r + 54.0, r=3.0), pants)
        body.add(S.tube([(sx * 16.0, 15.0, r + 104.0), (sx * 22.0, -10.0, r + 92.0), (sx * 27.0, -40.0, r + 84.0)], 3.6, sides=5), shirt)
    body.add(S.cyl(0.0, 15.0, r + 108.0, r + 116.0, 5.0, sides=6, b=0.0), SKIN)
    body.add(S.sphere(0.0, 14.0, r + 126.0, 12.0, sides=8, rings=5), "#c8302f")
    body.add(rb(-8.0, 8.0, 0.0, 4.0, r + 118.0, r + 128.0, r=1.5), "#202020")
    for nm, y in (("wheel-f", -56.0), ("wheel-r", 42.0)):
        w = a.part(nm, (0.0, y, r))
        w.add(wheel_x(0.0, y, r, r, 9.0), tyre)
        w.add(wheel_x(0.0, y, r, r * 0.55, 10.0, sides=6), chrome)
    return a


def auto_rickshaw():
    a = Actor("auto")
    green, yellow, black, tyre, chrome = "#2f8a46", "#f2c230", "#2a2a2a", "#242424", "#c9c7c2"
    r = 20.0
    body = a.part("body", (0.0, 0.0, r))
    # Tub (green) and front cowl.
    body.add(rb(-62.0, 62.0, -20.0, 115.0, r - 2.0, r + 40.0, r=8.0), green)
    cowl = rb(-30.0, 30.0, -125.0, -20.0, r - 2.0, r + 36.0, r=10.0)
    body.add(cowl, green)
    body.add(rb(-26.0, 26.0, -130.0, -112.0, r + 30.0, r + 95.0, r=6.0), green)  # front shield
    body.add(rb(-24.0, 24.0, -131.0, -126.0, r + 60.0, r + 92.0, r=2.0), "#9ec5d2")  # windscreen
    # Canopy (yellow canvas hood with a black band) on slim posts.
    body.add(S.rbox(-64.0, 64.0, -104.0, 122.0, r + 116.0, r + 150.0, r=16.0, seg=2), yellow)
    body.add(rb(-66.0, 66.0, -106.0, 124.0, r + 110.0, r + 118.0, r=3.0), black)
    for (x, y) in ((-58.0, -100.0), (58.0, -100.0), (-58.0, 110.0), (58.0, 110.0)):
        body.add(S.cyl(x, y, r + 36.0, r + 114.0, 2.2, sides=5, b=0.0), black)
    body.add(rb(-58.0, 58.0, 70.0, 112.0, r + 38.0, r + 70.0, r=6.0), black)  # rear seat back
    body.add(rb(-56.0, 56.0, 40.0, 100.0, r + 36.0, r + 48.0, r=4.0), "#3b3330")  # seat
    # Driver.
    body.add(rb(-15.0, 15.0, -60.0, -36.0, r + 44.0, r + 100.0, r=6.0), "#c8b48c")
    body.add(S.sphere(0.0, -48.0, r + 112.0, 11.0, sides=8, rings=5), SKIN)
    body.add(S.sphere(0.0, -46.0, r + 117.0, 11.5, sides=8, rings=4).scl(1.0, 1.0, 0.6, (0.0, -46.0, r + 117.0)), HAIR)
    body.add(rb(-34.0, 34.0, -112.0, -104.0, r + 92.0, r + 96.0, r=1.5), chrome)
    body.add(S.sphere(0.0, -127.0, r + 26.0, 6.0, sides=6, rings=3), "#fff4d0")
    for nm, x, y in (("wheel-f", 0.0, -100.0), ("wheel-l", -58.0, 80.0), ("wheel-r", 58.0, 80.0)):
        w = a.part(nm, (x, y, r))
        w.add(wheel_x(x, y, r, r, 10.0), tyre)
        w.add(wheel_x(x, y, r, r * 0.5, 11.0, sides=6), chrome)
    return a


ACTORS = [
    lambda: person("person-kurta", 168.0, "#f3efe4", "#d8cfbd", "#5a3b26", "kurta"),
    lambda: person("person-saree", 156.0, "#c2185b", "#d9a441", "#7a3a24", "saree"),
    lambda: person("person-kid", 118.0, "#f4f4f0", "#2b3f6b", "#1d1d1d", "kid"),
    dog,
    cow,
    scooter,
    auto_rickshaw,
    bird,
]


def realize(actor, coll, mat):
    root = bpy.data.objects.new(actor.name, None)
    root.empty_display_size = 0.2
    coll.objects.link(root)
    tris = 0
    for p in actor.parts:
        g = S.Geo()
        colors = []
        for geo, hexc in p.geos:
            start = len(g.v)
            g.extend(geo)
            colors += [hex_to_linear(hexc)] * (len(g.v) - start)
        px, py, pz = p.pivot
        me = bpy.data.meshes.new(p.name)
        me.from_pydata([((v.x - px) * CM, (v.y - py) * CM, (v.z - pz) * CM) for v in g.v], [], [list(f) for f in g.f])
        me.update()
        me.shade_smooth()
        me.set_sharp_from_angle(angle=SC.SHARP_ANGLE)
        corner = [c.vector.copy() for c in me.corner_normals]
        custom = []
        for li, loop in enumerate(me.loops):
            n = g.n[loop.vertex_index]
            custom.append(tuple(n) if n is not None else tuple(corner[li]))
        me.normals_split_custom_set(custom)
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        for i, c in enumerate(colors):
            attr.data[i].color = (*c, 1.0)
        me.color_attributes.active_color = attr
        me.materials.append(mat)
        ob = bpy.data.objects.new(p.name, me)
        coll.objects.link(ob)
        ob.parent = root
        ob.location = (px * CM, py * CM, pz * CM)
        if ob.name != p.name:
            raise RuntimeError(f"name clash {p.name} -> {ob.name}")
        tris += sum(len(poly.vertices) - 2 for poly in me.polygons)
    return root, tris


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(catalog.ROOT, "public", "models"))
    args = ap.parse_args(argv)
    SC.reset()
    mat = bpy.data.materials.new("street")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    coll = SC.item_collection("STREET")
    report = {"actors": [], "errors": []}
    total = 0
    for make in ACTORS:
        actor = make()
        _, tris = realize(actor, coll, mat)
        total += tris
        report["actors"].append({"id": actor.name, "parts": [p.name for p in actor.parts], "tris": tris})
        print(f"[street] {actor.name:14s} {len(actor.parts)} parts {tris} tris")
    if total > TRI_BUDGET:
        report["errors"].append(f"{total} tris > budget {TRI_BUDGET}")
    bpy.context.view_layer.update()
    for ob in bpy.context.view_layer.objects:
        ob.select_set(ob.users_collection[0] == coll)
    path = os.path.join(args.out, "street.raw.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_vertex_color="NAME",
        export_vertex_color_name="Col",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False,
        export_attributes=False,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_morph=False,
        export_skins=False,
        export_draco_mesh_compression_enable=False,
        export_use_gltfpack=False,
    )
    report["tris"] = total
    report["bytes"] = os.path.getsize(path)
    with open(os.path.join(HERE, "street-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
        fh.write("\n")
    print(f"[street] exported {path} ({report['bytes']} bytes, {total} tris)")
    if report["errors"]:
        print("[street] FAILED:", report["errors"])
        sys.exit(1)


if __name__ == "__main__":
    main()

"""Scene setup and the Item builder that turns per-slot Geo into real meshes."""

import math
import random
import zlib
from collections import OrderedDict

import bpy
from mathutils import Vector

from . import shapes as S

SHARP_ANGLE = math.radians(35.0)
CM = 0.01


def reset():
    """Empty factory scene: no objects, a world, Cycles, metres."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for cam in list(bpy.data.cameras):
        bpy.data.cameras.remove(cam)
    for lt in list(bpy.data.lights):
        bpy.data.lights.remove(lt)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "CYCLES"
    scene.cycles.seed = 7
    scene.cycles.use_animated_seed = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    return scene


def item_collection(name, parent=None):
    coll = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(coll)
    return coll


def layer_collection(coll):
    def find(lc):
        if lc.collection == coll:
            return lc
        for ch in lc.children:
            r = find(ch)
            if r:
                return r
        return None

    return find(bpy.context.view_layer.layer_collection)


def set_excluded(coll, excluded):
    lc = layer_collection(coll)
    if lc is not None:
        lc.exclude = excluded


def ground_plane(size=40.0, z=-0.0005):
    me = bpy.data.meshes.new("dh_ground")
    h = size / 2
    me.from_pydata([(-h, -h, z), (h, -h, z), (h, h, z), (-h, h, z)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new("dh_ground", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


class Item:
    """Collects parts per material slot for one catalog model (in cm)."""

    def __init__(self, spec):
        self.spec = spec
        self.id = spec.id
        self.w, self.d, self.h = spec.w, spec.d, spec.h
        self.parts = OrderedDict()
        self.rng = random.Random(7 + zlib.crc32(spec.id.encode("utf-8")))
        self.fit_scale = (1.0, 1.0, 1.0)
        self.root = None
        self.objects = []

    # -- adding parts ---------------------------------------------------------
    def add(self, slot, geo):
        if slot not in self.spec.slots:
            raise ValueError(f"{self.id}: slot '{slot}' not declared in catalog slots {self.spec.slots}")
        self.parts.setdefault(slot, S.Geo()).extend(geo)
        return geo

    def rbox(self, slot, *a, **kw):
        return self.add(slot, S.rbox(*a, **kw))

    def cbox(self, slot, *a, **kw):
        return self.add(slot, S.cbox(*a, **kw))

    def box(self, slot, *a, **kw):
        return self.add(slot, S.box(*a, **kw))

    def cyl(self, slot, *a, **kw):
        return self.add(slot, S.cyl(*a, **kw))

    def lathe(self, slot, *a, **kw):
        return self.add(slot, S.lathe(*a, **kw))

    def tube(self, slot, *a, **kw):
        return self.add(slot, S.tube(*a, **kw))

    def slab(self, slot, *a, **kw):
        return self.add(slot, S.slab(*a, **kw))

    def blob(self, slot, *a, **kw):
        kw.setdefault("rng", self.rng)
        return self.add(slot, S.blob(*a, **kw))

    def sphere(self, slot, *a, **kw):
        return self.add(slot, S.sphere(*a, **kw))

    # -- queries ----------------------------------------------------------------
    def tris(self):
        return sum(g.tris() for g in self.parts.values())

    def bounds(self):
        b = None
        for g in self.parts.values():
            if not g.v:
                continue
            gb = g.bounds()
            b = gb if b is None else (min(b[0], gb[0]), max(b[1], gb[1]), min(b[2], gb[2]), max(b[3], gb[3]), min(b[4], gb[4]), max(b[5], gb[5]))
        return b

    # -- finishing ---------------------------------------------------------------
    def fit(self):
        """Snap the model exactly onto its catalog box: bbox centre on the
        origin in X/Y, bottom on Z=0, extents == size. Returns the per-axis
        scale used (should be ~1; reported so drift is visible)."""
        x0, x1, y0, y1, z0, z1 = self.bounds()
        sx = self.w / max(x1 - x0, 1e-6)
        sy = self.d / max(y1 - y0, 1e-6)
        sz = self.h / max(z1 - z0, 1e-6)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        for g in self.parts.values():
            g.move(-cx, -cy, -z0)
            g.scl(sx, sy, sz)
        self.fit_scale = (sx, sy, sz)
        return self.fit_scale

    def realize(self, materials, collection):
        """Create the Empty root + one mesh object per slot (metres)."""
        root = bpy.data.objects.new(self.id, None)
        root.empty_display_type = "PLAIN_AXES"
        root.empty_display_size = 0.2
        collection.objects.link(root)
        self.root = root
        if root.name != self.id:
            raise RuntimeError(f"name clash: wanted {self.id} got {root.name}")
        for slot, g in self.parts.items():
            if not g.f:
                continue
            name = f"{self.id}__{slot}"
            me = bpy.data.meshes.new(name)
            verts = [(p.x * CM, p.y * CM, p.z * CM) for p in g.v]
            me.from_pydata(verts, [], [list(f) for f in g.f])
            me.update()
            me.shade_smooth()
            me.set_sharp_from_angle(angle=SHARP_ANGLE)
            corner = [c.vector.copy() for c in me.corner_normals]
            custom = []
            for li, loop in enumerate(me.loops):
                n = g.n[loop.vertex_index]
                custom.append(tuple(n) if n is not None else tuple(corner[li]))
            me.normals_split_custom_set(custom)
            attr = me.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
            me.color_attributes.active_color = attr
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
            me.materials.append(materials[slot])
            ob = bpy.data.objects.new(name, me)
            collection.objects.link(ob)
            ob.parent = root
            if ob.name != name:
                raise RuntimeError(f"name clash: wanted {name} got {ob.name}")
            self.objects.append(ob)
        return root


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
            hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
    return lo, hi


def mesh_tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)

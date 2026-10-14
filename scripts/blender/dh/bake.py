"""Ambient occlusion baked into the per-corner ``AO`` colour attribute.

Primary path: Cycles AO bake to VERTEX_COLORS (ground plane at z=0 present
for floor items). Fallback: deterministic BVH hemisphere sampling. Values are
remapped to [AO_MIN, 1] so creases never go black.
"""

import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

AO_MIN = 0.55
BAKE_SAMPLES = 128


AO_LEVELS = 64


BURIED = 0.12


def _remap(objs):
    """Post-process raw AO (0..1) in place:

    1. Corners sharing a vertex AND a shading normal get the same value, so AO
       never splits a vertex the normals did not already split.
    2. Buried vertices (inside another part, raw AO ~0) are invisible but would
       smear dark blotches across the visible triangles around them; they are
       refilled from their visible neighbours.
    3. Remap to [AO_MIN, 1] and snap to AO_LEVELS steps (compresses better).
    """
    for ob in objs:
        me = ob.data
        attr = me.color_attributes["AO"]
        n = len(attr.data)
        buf = [0.0] * (n * 4)
        attr.data.foreach_get("color", buf)
        cn = me.corner_normals
        groups, keys = {}, []
        vsum = [0.0] * len(me.vertices)
        vcnt = [0] * len(me.vertices)
        for li, loop in enumerate(me.loops):
            v = cn[li].vector
            key = (loop.vertex_index, round(v.x, 2), round(v.y, 2), round(v.z, 2))
            keys.append(key)
            a = max(0.0, min(1.0, (buf[li * 4] + buf[li * 4 + 1] + buf[li * 4 + 2]) / 3.0))
            acc = groups.setdefault(key, [0.0, 0])
            acc[0] += a
            acc[1] += 1
            vsum[loop.vertex_index] += a
            vcnt[loop.vertex_index] += 1
        vval = [vsum[i] / vcnt[i] if vcnt[i] else 1.0 for i in range(len(vsum))]
        buried = [vval[i] < BURIED for i in range(len(vval))]
        if any(buried) and not all(buried):
            nbrs = [[] for _ in vval]
            for e in me.edges:
                a, b = e.vertices
                nbrs[a].append(b)
                nbrs[b].append(a)
            filled = [not b for b in buried]
            for _ in range(8):
                changed = False
                for i, bur in enumerate(buried):
                    if not bur or filled[i]:
                        continue
                    vals = [vval[j] for j in nbrs[i] if filled[j]]
                    if vals:
                        vval[i] = min(1.0, sum(vals) / len(vals) * 0.85)
                        filled[i] = True
                        changed = True
                if not changed:
                    break
        for li, key in enumerate(keys):
            vi = key[0]
            if buried[vi]:
                a = vval[vi]
            else:
                tot, cnt = groups[key]
                a = tot / cnt
            v = AO_MIN + (1.0 - AO_MIN) * a
            v = round(v * AO_LEVELS) / AO_LEVELS
            buf[li * 4] = buf[li * 4 + 1] = buf[li * 4 + 2] = min(1.0, v)
            buf[li * 4 + 3] = 1.0
        attr.data.foreach_set("color", buf)


def white(objs):
    for ob in objs:
        attr = ob.data.color_attributes["AO"]
        buf = [1.0] * (len(attr.data) * 4)
        attr.data.foreach_set("color", buf)


def ao_distance(spec):
    return max(0.25, min(1.4, 0.2 * max(spec.w, spec.d, spec.h) / 100.0))


def cycles_bake(objs, distance, ground, use_ground):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = BAKE_SAMPLES
    scene.cycles.seed = 7
    scene.world.light_settings.distance = distance
    ground.location.z = 0.0 if use_ground else -1000.0
    ground.hide_render = not use_ground
    bpy.context.view_layer.update()
    for ob in bpy.context.view_layer.objects:
        ob.select_set(False)
    for ob in objs:
        ob.select_set(True)
        cattr = ob.data.color_attributes
        cattr.active_color = cattr["AO"]
    bpy.context.view_layer.objects.active = objs[0]
    res = bpy.ops.object.bake(type="AO", target="VERTEX_COLORS", use_clear=True, margin=0)
    if "FINISHED" not in res:
        raise RuntimeError(f"bake returned {res}")
    _remap(objs)


def _hemisphere(n):
    """Deterministic cosine-weighted hemisphere directions (Hammersley)."""
    dirs = []
    for i in range(n):
        u = (i + 0.5) / n
        bits = i
        bits = ((bits << 16) | (bits >> 16)) & 0xFFFFFFFF
        bits = ((bits & 0x55555555) << 1) | ((bits & 0xAAAAAAAA) >> 1)
        bits = ((bits & 0x33333333) << 2) | ((bits & 0xCCCCCCCC) >> 2)
        bits = ((bits & 0x0F0F0F0F) << 4) | ((bits & 0xF0F0F0F0) >> 4)
        bits = ((bits & 0x00FF00FF) << 8) | ((bits & 0xFF00FF00) >> 8)
        v = bits / 4294967296.0
        r = math.sqrt(u)
        phi = 2 * math.pi * v
        dirs.append(Vector((r * math.cos(phi), r * math.sin(phi), math.sqrt(max(0.0, 1 - u)))))
    return dirs


def bvh_bake(objs, distance, use_ground, samples=48):
    verts, polys = [], []
    for ob in objs:
        mw = ob.matrix_world
        off = len(verts)
        verts.extend(mw @ v.co for v in ob.data.vertices)
        polys.extend([off + i for i in p.vertices] for p in ob.data.polygons)
    tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    dirs = _hemisphere(samples)
    for ob in objs:
        me = ob.data
        mw = ob.matrix_world
        nm = mw.to_3x3().inverted_safe().transposed()
        cn = me.corner_normals
        attr = me.color_attributes["AO"]
        cache = {}
        buf = [1.0] * (len(me.loops) * 4)
        for li, loop in enumerate(me.loops):
            n = (nm @ cn[li].vector).normalized()
            key = (loop.vertex_index, round(n.x, 3), round(n.y, 3), round(n.z, 3))
            if key not in cache:
                p = mw @ me.vertices[loop.vertex_index].co
                t = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
                u = n.cross(t).normalized()
                v = n.cross(u)
                o = p + n * 1e-3
                occ = 0
                for d in dirs:
                    wd = u * d.x + v * d.y + n * d.z
                    hit = tree.ray_cast(o, wd, distance)
                    if hit[0] is not None:
                        occ += 1
                    elif use_ground and wd.z < -1e-6 and o.z >= -1e-4:
                        if (o.z / -wd.z) < distance:
                            occ += 1
                cache[key] = 1.0 - occ / len(dirs)
            a = cache[key]
            buf[li * 4:li * 4 + 3] = (a, a, a)
        attr.data.foreach_set("color", buf)
    _remap(objs)


def bake_item(spec, objs, ground, enabled=True):
    """Returns the method used: 'cycles', 'bvh' or 'white'."""
    if not enabled:
        white(objs)
        return "white"
    dist = ao_distance(spec)
    try:
        cycles_bake(objs, dist, ground, spec.grounded)
        return "cycles"
    except Exception as exc:  # pragma: no cover - fallback path
        print(f"[bake] Cycles bake failed for {spec.id}: {exc}; using BVH fallback")
        bvh_bake(objs, dist, spec.grounded)
        return "bvh"

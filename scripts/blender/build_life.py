"""Dream Home lived-in details kit (headless Blender) -> public/models/life.raw.glb

Small everyday and festive objects (src/domain/catalog/life.json), modelled
in scripts/blender/items/life.py. Every model is fitted to its catalog box:
origin at the centre of the footprint on the floor (wall pieces: bottom at
z = 0, back face on +Y), front toward -Y. GLB layout:

  <id>                 root empty; children <id>__<slot> hold what stays still
  <id>:<part>          a moving piece at the scene root, node origin = pivot;
                       children <id>:<part>__<slot> are relative to the pivot

Slots are materials named life / steel / flame (white base, the surface
colour is per vertex in COLOR_0, linear, with a light baked occlusion).
Sizes are centimetres while building, metres in the GLB.

Usage (repo root):
  Blender --factory-startup -b --python-exit-code 1 \
      --python scripts/blender/build_life.py -- [--out public/models]
      [--only id,id] [--preview DIR] [--room]

--only builds a subset without exporting (for iteration). --preview renders
DIR/<id>.png and DIR/contact.png; --room also renders DIR/room.png and
DIR/porch.png with everything at true scale.
"""

import argparse
import json
import math
import os
import random
import sys
import time
import zlib
from collections import OrderedDict

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

from dh import catalog  # noqa: E402
from dh import scene as SC  # noqa: E402
from dh import shapes as S  # noqa: E402
from dh.bake import _hemisphere  # noqa: E402
from dh.export import read_glb_json  # noqa: E402
from dh.materials import hex_to_linear, srgb_to_linear  # noqa: E402
from items.life import LIFE, rgb  # noqa: E402

CM = 0.01
TOL_CM = 1.0
TRI_TOTAL = 12000
WALL = {"wall-clock", "wall-photos", "calendar", "toran"}
AO_MIN = 0.6
AO_RAYS = 32
LIFE_JSON = os.path.join(catalog.CATALOG_DIR, "life.json")
REPORT = os.path.join(HERE, "life-report.json")


class LifeItem:
    """Pieces per (part, slot) with per-vertex sRGB colours, in cm."""

    def __init__(self, spec):
        self.id = spec["id"]
        s = spec["size"]
        self.w, self.d, self.h = float(s["w"]), float(s["d"]), float(s["h"])
        self.slots = list(spec["slots"])
        self.tri_budget = int(spec["triBudget"])
        self.part_names = list(spec.get("parts", []))
        self.rng = random.Random(7 + zlib.crc32(self.id.encode("utf-8")))
        self.pieces = []
        self.pivots = OrderedDict()
        self.wall = self.id in WALL
        self.fit_scale = (1.0, 1.0, 1.0)
        self.design = (0.0, 0.0, 0.0)
        self.roots = []
        self.objects = []

    def part(self, name, pivot):
        if name not in self.part_names:
            raise ValueError(f"{self.id}: part '{name}' not declared in life.json {self.part_names}")
        self.pivots[name] = Vector(pivot)

    def add(self, slot, geo, colour, part=None):
        if slot not in self.slots:
            raise ValueError(f"{self.id}: slot '{slot}' not declared {self.slots}")
        if part is not None and part not in self.pivots:
            raise ValueError(f"{self.id}: part '{part}' has no pivot yet")
        n = len(geo.v)
        if isinstance(colour, list):
            if len(colour) != n:
                raise ValueError(f"{self.id}: {len(colour)} colours for {n} vertices")
            cols = [rgb(c) for c in colour]
        elif callable(colour):
            cols = [rgb(colour(p, nn)) for p, nn in zip(geo.v, geo.n)]
        else:
            c = rgb(colour)
            cols = [c] * n
        self.pieces.append([part, slot, geo, cols])
        return geo

    def bounds(self):
        b = None
        for g in (pc[2] for pc in self.pieces):
            if not g.v:
                continue
            gb = g.bounds()
            b = gb if b is None else (min(b[0], gb[0]), max(b[1], gb[1]), min(b[2], gb[2]), max(b[3], gb[3]), min(b[4], gb[4]), max(b[5], gb[5]))
        return b

    def fit(self):
        x0, x1, y0, y1, z0, z1 = self.bounds()
        self.design = (x1 - x0, y1 - y0, z1 - z0)
        sx, sy, sz = self.w / (x1 - x0), self.d / (y1 - y0), self.h / (z1 - z0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        for g in (pc[2] for pc in self.pieces):
            g.move(-cx, -cy, -z0)
            g.scl(sx, sy, sz)
        for k, v in self.pivots.items():
            self.pivots[k] = Vector(((v.x - cx) * sx, (v.y - cy) * sy, (v.z - z0) * sz))
        self.fit_scale = (sx, sy, sz)

    def tris(self):
        return sum(pc[2].tris() for pc in self.pieces)


# ---------------------------------------------------------------------------
# Baked occlusion (per vertex, multiplied into the colour)
# ---------------------------------------------------------------------------

def _vertex_normals(g):
    acc = [Vector((0.0, 0.0, 0.0)) for _ in g.v]
    for face in g.f:
        fn = S.face_normal(g.v, face, weighted=True)
        for i in face:
            acc[i] += fn
    out = []
    for i, n in enumerate(g.n):
        if n is not None:
            out.append(Vector(n))
        else:
            a = acc[i]
            out.append(a.normalized() if a.length > 1e-9 else Vector((0.0, 0.0, 1.0)))
    return out


def bake_ao(item):
    solid = [pc for pc in item.pieces if pc[1] != "flame"]
    verts, polys = [], []
    for g in (pc[2] for pc in solid):
        off = len(verts)
        verts.extend(Vector(p) for p in g.v)
        polys.extend([off + i for i in f] for f in g.f)
    if not polys:
        return
    tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    dirs = _hemisphere(AO_RAYS)
    dist = max(1.5, min(28.0, 0.22 * max(item.w, item.d, item.h)))
    wall_y = item.d / 2 if item.wall else None
    for pc in solid:
        g = pc[2]
        normals = _vertex_normals(g)
        ao = []
        for p, n in zip(g.v, normals):
            t = Vector((1.0, 0.0, 0.0)) if abs(n.x) < 0.9 else Vector((0.0, 1.0, 0.0))
            u = n.cross(t).normalized()
            v = n.cross(u)
            o = Vector(p) + n * 0.04
            occ = 0
            for d in dirs:
                wd = u * d.x + v * d.y + n * d.z
                if tree.ray_cast(o, wd, dist)[0] is not None:
                    occ += 1
                elif wall_y is None and wd.z < -1e-6 and o.z / -wd.z < dist:
                    occ += 1
                elif wall_y is not None and wd.y > 1e-6 and (wall_y - o.y) / wd.y < dist:
                    occ += 1
            ao.append(1.0 - occ / len(dirs))
        # buried vertices (inside another piece) borrow from visible neighbours
        buried = [a < 0.1 for a in ao]
        if any(buried) and not all(buried):
            nbrs = [[] for _ in g.v]
            for f in g.f:
                for k in range(len(f)):
                    a, b = f[k], f[(k + 1) % len(f)]
                    nbrs[a].append(b)
                    nbrs[b].append(a)
            ok = [not b for b in buried]
            for _ in range(6):
                for i, bur in enumerate(buried):
                    if bur and not ok[i]:
                        vals = [ao[j] for j in nbrs[i] if ok[j]]
                        if vals:
                            ao[i] = sum(vals) / len(vals) * 0.85
                            ok[i] = True
        pc.append([AO_MIN + (1.0 - AO_MIN) * a for a in ao])


# ---------------------------------------------------------------------------
# Blender objects
# ---------------------------------------------------------------------------

def make_materials(cfg):
    mats = {}
    for name, c in cfg.items():
        mat = bpy.data.materials.new(name)
        if mat.name != name:
            raise RuntimeError(f"material name clash {name} -> {mat.name}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
        base = hex_to_linear(c["color"]) if c.get("color") else (1.0, 1.0, 1.0)
        bsdf.inputs["Base Color"].default_value = (*base, 1.0)
        bsdf.inputs["Roughness"].default_value = float(c.get("roughness", 0.8))
        bsdf.inputs["Metallic"].default_value = float(c.get("metalness", 0.0))
        if c.get("emissive"):
            bsdf.inputs["Emission Color"].default_value = (*base, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.0
        mats[name] = mat
    return mats


def _mesh(name, g, cols, mat, offset):
    ox, oy, oz = offset
    me = bpy.data.meshes.new(name)
    me.from_pydata([((v.x - ox) * CM, (v.y - oy) * CM, (v.z - oz) * CM) for v in g.v], [], [list(f) for f in g.f])
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
    buf = []
    for c in cols:
        buf += [c[0], c[1], c[2], 1.0]
    attr.data.foreach_set("color", buf)
    me.color_attributes.active_color = attr
    me.materials.append(mat)
    return me


def realize(item, mats, coll):
    groups = OrderedDict()
    for pc in item.pieces:
        part, slot, g, cols = pc[0], pc[1], pc[2], pc[3]
        ao = pc[4] if len(pc) > 4 else [1.0] * len(g.v)
        key = (part, slot)
        if key not in groups:
            groups[key] = (S.Geo(), [])
        mg, mc = groups[key]
        mg.extend(g)
        mc += [tuple(srgb_to_linear(ch) * k for ch in c) for c, k in zip(cols, ao)]
    root = bpy.data.objects.new(item.id, None)
    root.empty_display_size = 0.2
    coll.objects.link(root)
    if root.name != item.id:
        raise RuntimeError(f"name clash {item.id} -> {root.name}")
    item.roots = [root]
    proots = {}
    for name, piv in item.pivots.items():
        pr = bpy.data.objects.new(f"{item.id}:{name}", None)
        pr.empty_display_size = 0.1
        coll.objects.link(pr)
        pr.location = (piv.x * CM, piv.y * CM, piv.z * CM)
        if pr.name != f"{item.id}:{name}":
            raise RuntimeError(f"name clash {item.id}:{name} -> {pr.name}")
        proots[name] = pr
        item.roots.append(pr)
    for (part, slot), (g, cols) in groups.items():
        if part is None:
            name, parent, off = f"{item.id}__{slot}", root, (0.0, 0.0, 0.0)
        else:
            piv = item.pivots[part]
            name, parent, off = f"{item.id}:{part}__{slot}", proots[part], (piv.x, piv.y, piv.z)
        me = _mesh(name, g, cols, mats[slot], off)
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        ob.parent = parent
        if ob.name != name:
            raise RuntimeError(f"name clash {name} -> {ob.name}")
        item.objects.append(ob)


def check(item):
    errors, warnings = [], []
    bpy.context.view_layer.update()
    lo, hi = SC.world_bounds(item.objects)
    w, d, h = (hi.x - lo.x) * 100, (hi.y - lo.y) * 100, (hi.z - lo.z) * 100
    for label, got, want in (("w", w, item.w), ("d", d, item.d), ("h", h, item.h)):
        if abs(got - want) > TOL_CM:
            errors.append(f"{label}={got:.2f}cm, catalog {want}cm")
    cx, cy, bottom = (hi.x + lo.x) * 50, (hi.y + lo.y) * 50, lo.z * 100
    if abs(cx) > TOL_CM or abs(cy) > TOL_CM or abs(bottom) > TOL_CM:
        errors.append(f"origin not at floor centre (cx={cx:.2f}, cy={cy:.2f}, bottom={bottom:.2f})")
    if item.wall and abs(hi.y * 100 - item.d / 2) > TOL_CM:
        errors.append(f"back face at y={hi.y * 100:.2f}, want {item.d / 2}")
    tris = sum(SC.mesh_tris(o) for o in item.objects)
    if tris > item.tri_budget:
        errors.append(f"tris {tris} > budget {item.tri_budget}")
    made = list(item.pivots.keys())
    if sorted(made) != sorted(item.part_names):
        errors.append(f"parts {made} != declared {item.part_names}")
    for o in item.objects:
        slot = o.name.rsplit("__", 1)[-1]
        if [m.name for m in o.data.materials] != [slot]:
            errors.append(f"{o.name} material != {slot}")
    sx, sy, sz = item.fit_scale
    if max(abs(sx - 1), abs(sy - 1), abs(sz - 1)) > 0.06:
        warnings.append(f"fit scale {sx:.3f},{sy:.3f},{sz:.3f}")
    return {"id": item.id, "kit": "life", "tris": tris, "triBudget": item.tri_budget,
            "bounds": {"w": round(w, 2), "d": round(d, 2), "h": round(h, 2)},
            "fitScale": [round(sx, 4), round(sy, 4), round(sz, 4)], "errors": errors, "warnings": warnings}


def export(path, items, coll):
    bpy.context.view_layer.update()
    for ob in bpy.context.view_layer.objects:
        ob.select_set(ob.users_collection[0] == coll)
    os.makedirs(os.path.dirname(path), exist_ok=True)
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
    gltf, size = read_glb_json(path)
    errors = []
    nodes = {n.get("name"): n for n in gltf.get("nodes", [])}
    scene_roots = {gltf["nodes"][i].get("name") for i in gltf["scenes"][gltf.get("scene", 0)]["nodes"]}
    for it in items:
        for r in it.roots:
            if r.name not in nodes:
                errors.append(f"GLB lost node {r.name}")
            elif r.name not in scene_roots:
                errors.append(f"GLB node {r.name} is not a scene root")
    for mesh in gltf.get("meshes", []):
        for p in mesh.get("primitives", []):
            attrs = set(p.get("attributes", {}).keys())
            if attrs != {"POSITION", "NORMAL", "COLOR_0"}:
                errors.append(f"mesh {mesh.get('name')} attributes {sorted(attrs)}")
    mats = [m.get("name") for m in gltf.get("materials", [])]
    if not set(mats) <= {"life", "steel", "flame"}:
        errors.append(f"unexpected materials {mats}")
    return size, errors


# ---------------------------------------------------------------------------
# Preview renders (contact sheet, rooms) - for eyeballing only
# ---------------------------------------------------------------------------

def preview_materials(mats):
    for name, mat in mats.items():
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
        col = nt.nodes.new("ShaderNodeVertexColor")
        col.layer_name = "Col"
        nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
        if name == "flame":
            nt.links.new(col.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = 6.0


def _flat_mat(name, hexc, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*hex_to_linear(hexc), 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def _plane(name, corners, mat, coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata(corners, [], [(0, 1, 2, 3)])
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def _render_setup(scene, res_x, res_y, samples):
    from dh import thumbs
    scene.render.engine = "CYCLES"
    device = "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            if thumbs._try(lambda: setattr(prefs, "compute_device_type", kind)):
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == kind]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type == kind
                    device = "GPU"
                    break
    except Exception as exc:
        print(f"[life] GPU setup failed ({exc})")
    scene.cycles.device = device
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"


def _place(item, loc, rz=0.0):
    rot = Matrix.Rotation(math.radians(rz), 3, "Z")
    L = Vector(loc) * CM
    item.roots[0].location = L
    item.roots[0].rotation_euler = (0.0, 0.0, math.radians(rz))
    for r, piv in zip(item.roots[1:], item.pivots.values()):
        r.location = L + rot @ (piv * CM)
        r.rotation_euler = (0.0, 0.0, math.radians(rz))


def _show(items, visible):
    for it in items:
        for ob in it.roots + it.objects:
            ob.hide_render = it.id not in visible


def preview(items, out_dir, mats, room=False):
    import numpy as np
    from dh import thumbs
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    preview_materials(mats)
    _render_setup(scene, 360, 360, 48)
    world = scene.world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.bl_idname == "ShaderNodeBackground")
    bg.inputs["Color"].default_value = (*hex_to_linear("#cfc6b8"), 1.0)
    bg.inputs["Strength"].default_value = 0.9
    pcoll = SC.item_collection("PREVIEW")
    floor_m = _flat_mat("pv_floor", "#e2d9ca")
    wall_m = _flat_mat("pv_wall", "#efe7da")
    floor = _plane("pv_floor", [(-9, -9, 0), (9, -9, 0), (9, 9, 0), (-9, 9, 0)], floor_m, pcoll)
    wall = _plane("pv_wall", [(-9, 0, 0), (9, 0, 0), (9, 0, 6), (-9, 0, 6)], wall_m, pcoll)
    ground = SC.ground_plane()
    ground.hide_render = True
    rig = thumbs.setup(scene, ground)
    scene.render.resolution_x = scene.render.resolution_y = 360
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.cycles.samples = 48
    paths = []
    for it in items:
        _show(items, {it.id})
        _place(it, (0.0, 0.0, 0.0))
        bpy.context.view_layer.update()
        lo, hi = SC.world_bounds(it.objects)
        size = hi - lo
        wall.hide_render = not it.wall
        wall.location = (0.0, hi.y + 0.0005, 0.0)
        flat = size.z < 0.2 * max(size.x, size.y)
        thumbs.frame(rig, lo, hi, 52.0 if flat else (14.0 if it.wall else 26.0))
        path = os.path.join(out_dir, f"{it.id}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
        print(f"[life] preview {it.id}")
    cols = 6
    rows = (len(paths) + cols - 1) // cols
    W = H = 360
    sheet = np.ones((rows * H, cols * W, 4), dtype=np.float32)
    for i, p in enumerate(paths):
        im = bpy.data.images.load(p)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(H, W, 4)
        r, c = divmod(i, cols)
        sheet[(rows - 1 - r) * H:(rows - r) * H, c * W:(c + 1) * W] = px
        bpy.data.images.remove(im)
    out = bpy.data.images.new("contact", cols * W, rows * H, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(out_dir, "contact.png")
    out.file_format = "PNG"
    out.save()
    print(f"[life] contact sheet {out.filepath_raw}")
    if room:
        render_rooms(items, out_dir, rig, floor, wall, pcoll)


def _box(name, x0, x1, y0, y1, z0, z1, mat, coll):
    g = S.box(x0 * CM, x1 * CM, y0 * CM, y1 * CM, z0 * CM, z1 * CM)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in g.v], [], [list(f) for f in g.f])
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def render_rooms(items, out_dir, rig, floor, wall, pcoll):
    scene = bpy.context.scene
    by = {it.id: it for it in items}
    floor.scale = (1.0, 1.0, 1.0)
    wall.hide_render = True
    floor.hide_render = True
    wood = _flat_mat("pv_wood", "#8a5a3a")
    white = _flat_mat("pv_white", "#f2ede4")
    tile = _flat_mat("pv_tile", "#d8cdbb")
    plaster = _flat_mat("pv_plaster", "#efe4d2")
    door = _flat_mat("pv_door", "#6b4428")
    extra = []
    sun = rig["sun"]
    sun.data.energy = 3.5
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.cycles.samples = 64
    cam = rig["cam"]
    cam.data.lens = 26.0
    cam.data.shift_x = cam.data.shift_y = 0.0

    def cam_at(loc, target):
        cam.location = Vector(loc) * CM
        d = (Vector(target) - Vector(loc)) * CM
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = d.to_track_quat("-Z", "Y")

    # living room: floor, back wall (y=300), left wall (x=-300), a low table, a counter
    extra.append(_plane("rm_floor", [(-3.2, -3, 0), (3.2, -3, 0), (3.2, 3.0, 0), (-3.2, 3.0, 0)], tile, pcoll))
    extra.append(_plane("rm_back", [(-3.2, 3.0, 0), (3.2, 3.0, 0), (3.2, 3.0, 3), (-3.2, 3.0, 3)], plaster, pcoll))
    extra.append(_plane("rm_left", [(-3.0, -3, 0), (-3.0, 3.0, 0), (-3.0, 3.0, 3), (-3.0, -3, 3)], plaster, pcoll))
    extra.append(_box("rm_table", -40, 80, 120, 180, 0, 42, wood, pcoll))
    extra.append(_box("rm_counter", -300, -240, 40, 260, 0, 90, white, pcoll))
    extra.append(_box("rm_shelf", 150, 250, 270, 300, 0, 85, wood, pcoll))
    room = {
        "wall-photos": ((-40.0, 300.0 - 1.5, 125.0), 0.0),
        "wall-clock": ((100.0, 300.0 - 2.5, 185.0), 0.0),
        "calendar": ((240.0, 300.0 - 1.0, 140.0), 0.0),
        "floor-cushions": ((-140.0, 230.0, 0.0), 0.0),
        "cat": ((-110.0, 150.0, 0.0), 20.0),
        "money-plant": ((-230.0, 278.0, 0.0), 0.0),
        "urli": ((-20.0, 40.0, 0.0), 0.0),
        "toys": ((100.0, 30.0, 0.0), -20.0),
        "school-bag": ((120.0, 285.0, 0.0), 0.0),
        "chai": ((0.0, 140.0, 42.0), 8.0),
        "newspaper": ((50.0, 160.0, 42.0), -15.0),
        "fruit-bowl": ((-25.0, 165.0, 42.0), 0.0),
        "photo-frames": ((200.0, 288.0, 85.0), 0.0),
        "pressure-cooker": ((-270.0, 90.0, 90.0), 90.0),
        "steel-set": ((-270.0, 180.0, 90.0), 90.0),
        "diwali-diya": ((-60.0, 135.0, 42.0), 0.0),
    }
    _show(items, set(room))
    for k, (loc, rz) in room.items():
        if k in by:
            _place(by[k], loc, rz)
    cam_at((260.0, -300.0, 175.0), (-40.0, 170.0, 60.0))
    scene.render.filepath = os.path.join(out_dir, "room.png")
    bpy.ops.render.render(write_still=True)
    print(f"[life] room render {scene.render.filepath}")
    # porch: door in the back wall with the toran, footwear, bike, scooter, washing
    for ob in extra[3:]:
        ob.hide_render = True
    extra.append(_box("pc_door", -170, -70, 299, 300.5, 0, 210, door, pcoll))
    porch = {
        "toran": ((-120.0, 300.0 - 3.0 - 1.6, 172.0), 0.0),
        "shoes": ((-120.0, 245.0, 0.0), 0.0),
        "slippers": ((-40.0, 255.0, 0.0), 10.0),
        "cycle": ((-245.0, 120.0, 0.0), 0.0),
        "scooter": ((10.0, 60.0, 0.0), -25.0),
        "clothesline": ((130.0, 200.0, 0.0), 0.0),
        "bucket": ((40.0, 260.0, 0.0), 0.0),
    }
    _show(items, set(porch))
    for k, (loc, rz) in porch.items():
        if k in by:
            _place(by[k], loc, rz)
    cam_at((230.0, -260.0, 170.0), (-90.0, 190.0, 40.0))
    scene.render.filepath = os.path.join(out_dir, "porch.png")
    bpy.ops.render.render(write_still=True)
    print(f"[life] porch render {scene.render.filepath}")


# ---------------------------------------------------------------------------

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="build_life.py")
    ap.add_argument("--out", default=os.path.join(catalog.ROOT, "public", "models"))
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", default="")
    ap.add_argument("--room", action="store_true")
    ap.add_argument("--no-ao", action="store_true")
    args = ap.parse_args(argv)
    t0 = time.time()
    SC.reset()
    with open(LIFE_JSON, "r", encoding="utf-8") as fh:
        cat = json.load(fh)
    mats = make_materials(cat["slots"])
    coll = SC.item_collection("LIFE")
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    report = {"items": [], "parts": [], "errors": []}
    items = []
    seen = set()
    for spec in cat["items"]:
        if only and spec["id"] not in only:
            continue
        it = LifeItem(spec)
        if it.id in seen:
            report["errors"].append(f"duplicate id {it.id}")
            continue
        seen.add(it.id)
        builder = LIFE.get(it.id)
        if builder is None:
            report["errors"].append(f"{it.id}: no builder in items/life.py")
            continue
        try:
            builder(it)
            it.fit()
            if not args.no_ao:
                bake_ao(it)
            realize(it, mats, coll)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            report["errors"].append(f"{it.id}: build failed: {exc}")
            continue
        entry = check(it)
        items.append(it)
        report["items"].append({k: entry[k] for k in ("id", "kit", "tris", "bounds")})
        for name, piv in it.pivots.items():
            report["parts"].append({"id": f"{it.id}:{name}", "parent": it.id, "pivot": [round(piv.x, 3), round(piv.y, 3), round(piv.z, 3)]})
        report["errors"] += [f"{it.id}: {e}" for e in entry["errors"]]
        dw, dd, dh = it.design
        print(f"[life] {'OK ' if not entry['errors'] else 'ERR'} {it.id:16s} tris {entry['tris']:4d}/{it.tri_budget:<4d} "
              f"design {dw:.1f}x{dd:.1f}x{dh:.1f} fit {entry['fitScale']} {'; '.join(entry['errors'] + entry['warnings'])}")
    total = sum(e["tris"] for e in report["items"])
    report["tris"] = total
    if total > TRI_TOTAL:
        report["errors"].append(f"{total} tris > kit budget {TRI_TOTAL}")
    if not only:
        missing = [s["id"] for s in cat["items"] if s["id"] not in seen]
        if missing:
            report["errors"].append(f"missing items {missing}")
        path = os.path.join(args.out, "life.raw.glb")
        size, errs = export(path, items, coll)
        report["bytes"] = size
        report["rawBytes"] = size
        report["errors"] += errs
        with open(REPORT, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
            fh.write("\n")
        print(f"[life] exported {path} ({size} bytes, {total} tris, {len(items)} items) in {time.time() - t0:.1f}s")
    else:
        print(f"[life] built {len(items)} items ({total} tris), not exported (--only)")
    if args.preview:
        preview(items, args.preview, mats, room=args.room)
    if report["errors"]:
        print("[life] FAILED:")
        for e in report["errors"]:
            print("   -", e)
        sys.exit(1)


if __name__ == "__main__":
    main()

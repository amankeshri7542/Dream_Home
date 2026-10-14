"""Cycles thumbnails: 320x320 transparent WebP, warm sun key + cool area
fill, warm grey world, shadow-catcher ground, 85 mm 3/4 front-right camera
auto-framed on the projected bounds."""

import math
import os

import bpy
from mathutils import Vector

from . import scene as SC
from .materials import hex_to_linear

RES = 320
SAMPLES = 48
LENS = 85.0
SENSOR = 36.0
AZIMUTH = 35.0
ELEVATION = 28.0
FLAT_ELEVATION = 50.0
FILL = 0.84


def _try(fn):
    try:
        fn()
        return True
    except Exception:
        return False


def setup(scene, ground):
    scene.render.engine = "CYCLES"
    device = "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            if _try(lambda: setattr(prefs, "compute_device_type", kind)):
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == kind]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type == kind
                    device = "GPU"
                    break
    except Exception as exc:
        print(f"[thumbs] GPU setup failed ({exc}); rendering on CPU")
    scene.cycles.device = device
    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.seed = 7
    scene.cycles.use_animated_seed = False
    scene.cycles.use_denoising = True
    _try(lambda: setattr(scene.cycles, "denoiser", "OPENIMAGEDENOISE"))
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    _try(lambda: setattr(scene.view_settings, "look", "None"))
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 82
    scene.render.use_file_extension = True

    world = scene.world
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBackground")
    bg.inputs["Color"].default_value = (*hex_to_linear("#b9b1a6"), 1.0)
    bg.inputs["Strength"].default_value = 0.85

    ground.location.z = -0.0005
    ground.hide_render = False
    ground.is_shadow_catcher = True

    cam_data = bpy.data.cameras.new("dh_cam")
    cam_data.lens = LENS
    cam_data.sensor_width = SENSOR
    cam_data.sensor_fit = "HORIZONTAL"
    cam_data.clip_start = 0.05
    cam_data.clip_end = 500.0
    cam = bpy.data.objects.new("dh_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    sun_data = bpy.data.lights.new("dh_sun", "SUN")
    sun_data.color = hex_to_linear("#FFE2C0")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(9.0)
    sun = bpy.data.objects.new("dh_sun", sun_data)
    scene.collection.objects.link(sun)
    to_sun = Vector((-0.55, -0.45, 0.85)).normalized()
    sun.rotation_mode = "QUATERNION"
    sun.rotation_quaternion = (-to_sun).to_track_quat("-Z", "Y")

    fill_data = bpy.data.lights.new("dh_fill", "AREA")
    fill_data.color = hex_to_linear("#BFD6FF")
    fill_data.shape = "SQUARE"
    fill = bpy.data.objects.new("dh_fill", fill_data)
    scene.collection.objects.link(fill)
    return {"cam": cam, "sun": sun, "fill": fill, "ground": ground}


def _corners(lo, hi):
    return [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]


def frame(rig, lo, hi, elevation):
    cam = rig["cam"]
    c = (lo + hi) / 2
    az, el = math.radians(AZIMUTH), math.radians(elevation)
    dvec = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    fwd = -dvec
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(fwd)
    pts = [(q - c) for q in _corners(lo, hi)]
    xs = [p.dot(right) for p in pts]
    ys = [p.dot(up) for p in pts]
    zs = [p.dot(dvec) for p in pts]
    t = (SENSOR / 2) / LENS

    def extents(D):
        us = [x / (D - z) for x, z in zip(xs, zs)]
        vs = [y / (D - z) for y, z in zip(ys, zs)]
        return min(us), max(us), min(vs), max(vs)

    radius = max((p.length for p in pts), default=1.0)
    lo_d, hi_d = radius * 1.05 + 0.05, radius * 200 + 10
    for _ in range(60):
        mid = (lo_d + hi_d) / 2
        u0, u1, v0, v1 = extents(mid)
        if max(u1 - u0, v1 - v0) / 2 > t * FILL:
            lo_d = mid
        else:
            hi_d = mid
    D = hi_d
    u0, u1, v0, v1 = extents(D)
    cam.location = c + dvec * D
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = fwd.to_track_quat("-Z", "Y")
    cam.data.shift_x = ((u0 + u1) / 2) / (2 * t)
    cam.data.shift_y = ((v0 + v1) / 2) / (2 * t)

    fill = rig["fill"]
    fdir = Vector((0.95, -0.25, 0.35)).normalized()
    fd = max(2.5, radius * 3.0)
    fill.location = c + fdir * fd
    fill.rotation_mode = "QUATERNION"
    fill.rotation_quaternion = (-fdir).to_track_quat("-Z", "Y")
    fill.data.size = max(1.5, radius * 1.5)
    fill.data.energy = math.pi * fd * fd * 1.1


def _copy_item(item, coll, dx):
    root = item.root.copy()
    coll.objects.link(root)
    root.location = (dx, 0.0, 0.0)
    objs = []
    for ob in item.objects:
        cp = ob.copy()
        coll.objects.link(cp)
        cp.parent = root
        cp.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        objs.append(cp)
    return [root] + objs


def render(job, items, item_colls, mats, rig, out_dir, procedural_builder=None):
    scene = bpy.context.scene
    for coll in item_colls.values():
        SC.set_excluded(coll, True)
    temp = SC.item_collection("dh_thumb_tmp")
    temp_objs = []
    proc_item = None
    try:
        if job.procedural:
            proc_item = procedural_builder(job, temp)
            meshes = proc_item["objects"]
            temp_objs += proc_item["all"]
        elif len(job.parts) == 1:
            SC.set_excluded(item_colls[job.parts[0]], False)
            meshes = items[job.parts[0]].objects
        else:
            widths = [items[p].spec.w / 100.0 for p in job.parts]
            total = sum(widths)
            x = -total / 2
            meshes = []
            for p, wd in zip(job.parts, widths):
                objs = _copy_item(items[p], temp, x + wd / 2)
                temp_objs += objs
                meshes += objs[1:]
                x += wd
        bpy.context.view_layer.update()
        lo, hi = SC.world_bounds(meshes)
        size = hi - lo
        flat = size.z < 0.12 * max(size.x, size.y)
        frame(rig, lo, hi, FLAT_ELEVATION if flat else ELEVATION)
        rig["ground"].hide_render = not job.grounded
        mats.preview_mode(job.tints, glass_alpha=job.glass_alpha)
        path = os.path.join(out_dir, f"{job.id}.webp")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        return path
    finally:
        for ob in temp_objs:
            bpy.data.objects.remove(ob, do_unlink=True)
        if proc_item:
            for me in proc_item.get("meshes", []):
                bpy.data.meshes.remove(me)
        bpy.data.collections.remove(temp)

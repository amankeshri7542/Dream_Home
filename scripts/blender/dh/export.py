"""glTF export of a kit + a structural check of the written GLB."""

import json
import os
import struct

import bpy

from . import scene as SC


def export_kit(path, items, collections):
    for coll in collections:
        SC.set_excluded(coll, False)
    bpy.context.view_layer.update()
    for ob in bpy.context.view_layer.objects:
        ob.select_set(False)
    for it in items:
        it.root.select_set(True)
        for ob in it.objects:
            ob.select_set(True)
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
        export_vertex_color_name="AO",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False,
        export_attributes=False,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_morph=False,
        export_skins=False,
        export_draco_mesh_compression_enable=False,
        export_use_gltfpack=False,
    )
    return check_glb(path, items)


def read_glb_json(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise RuntimeError("not a GLB")
    clen, ctype = struct.unpack_from("<I4s", data, 12)
    return json.loads(data[20:20 + clen].decode("utf-8")), len(data)


def check_glb(path, items):
    gltf, size = read_glb_json(path)
    errors = []
    names = {n.get("name"): n for n in gltf.get("nodes", [])}
    for it in items:
        if it.id not in names:
            errors.append(f"{path}: missing root node {it.id}")
    for ext in ("KHR_draco_mesh_compression",):
        if ext in gltf.get("extensionsUsed", []):
            errors.append(f"{path}: unexpected {ext}")
    for mesh in gltf.get("meshes", []):
        prims = mesh.get("primitives", [])
        if len(prims) != 1:
            errors.append(f"mesh {mesh.get('name')} has {len(prims)} primitives")
        for p in prims:
            attrs = set(p.get("attributes", {}).keys())
            if attrs != {"POSITION", "NORMAL", "COLOR_0"}:
                errors.append(f"mesh {mesh.get('name')} attributes {sorted(attrs)}")
    mats = [m.get("name") for m in gltf.get("materials", [])]
    if len(mats) != len(set(mats)):
        errors.append(f"duplicate materials {mats}")
    return {"bytes": size, "materials": mats, "nodes": len(gltf.get("nodes", [])), "errors": errors}

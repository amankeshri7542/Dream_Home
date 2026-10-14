"""One shared material per catalog slot (names == slot names).

Export mode: a plain Principled BSDF with constant factors so the glTF
exporter writes clean baseColorFactor / roughness / metalness / emissive.
Preview mode (thumbnails): base colour multiplied by the baked ``AO`` colour
attribute, tintable slots set to the item's default finish.
"""

import bpy

PREVIEW_GLOW_STRENGTH = 4.0


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


class Library:
    def __init__(self, slots, slot_defaults):
        self.cfg = slots
        self.mats = {}
        for name, cfg in slots.items():
            mat = bpy.data.materials.new(name)
            if mat.name != name:
                raise RuntimeError(f"material name clash {name} -> {mat.name}")
            if mat.node_tree is None:
                mat.use_nodes = True
            # Thin leaves need both faces; everything else is closed geometry.
            mat.use_backface_culling = name not in ("leaf",)
            if cfg.get("tint"):
                mat["tint"] = True
                mat["default"] = slot_defaults[name]
            self.mats[name] = mat
        self.export_mode()

    def __getitem__(self, slot):
        return self.mats[slot]

    def _bsdf(self, mat):
        nt = mat.node_tree
        for n in nt.nodes:
            if n.bl_idname == "ShaderNodeBsdfPrincipled":
                return n
        raise RuntimeError("no principled bsdf")

    def _clear_preview_nodes(self, mat):
        nt = mat.node_tree
        for n in list(nt.nodes):
            if n.name.startswith("dh_"):
                nt.nodes.remove(n)

    def export_mode(self):
        for name, mat in self.mats.items():
            cfg = self.cfg[name]
            self._clear_preview_nodes(mat)
            bsdf = self._bsdf(mat)
            col = (1.0, 1.0, 1.0) if cfg.get("tint") else hex_to_linear(cfg["color"])
            bsdf.inputs["Base Color"].default_value = (*col, 1.0)
            bsdf.inputs["Roughness"].default_value = float(cfg.get("roughness", 0.8))
            bsdf.inputs["Metallic"].default_value = float(cfg.get("metalness", 0.0))
            if cfg.get("emissive"):
                bsdf.inputs["Emission Color"].default_value = (*hex_to_linear(cfg["color"]), 1.0)
                bsdf.inputs["Emission Strength"].default_value = 1.0
            else:
                bsdf.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
                bsdf.inputs["Emission Strength"].default_value = 0.0
            bsdf.inputs["Alpha"].default_value = 1.0
            mat.diffuse_color = (*col, 1.0)

    def preview_mode(self, tints, glass_alpha=None):
        """tints: {slot: hex} for tintable slots."""
        for name, mat in self.mats.items():
            cfg = self.cfg[name]
            self._clear_preview_nodes(mat)
            bsdf = self._bsdf(mat)
            if cfg.get("tint"):
                col = hex_to_linear(tints.get(name, mat.get("default", "#ffffff")))
            else:
                col = hex_to_linear(cfg["color"])
            nt = mat.node_tree
            rgb = nt.nodes.new("ShaderNodeRGB")
            rgb.name = "dh_rgb"
            rgb.outputs[0].default_value = (*col, 1.0)
            ao = nt.nodes.new("ShaderNodeVertexColor")
            ao.name = "dh_ao"
            ao.layer_name = "AO"
            mix = nt.nodes.new("ShaderNodeMix")
            mix.name = "dh_mix"
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            a_in = next(s for s in mix.inputs if s.name == "A" and s.type == "RGBA")
            b_in = next(s for s in mix.inputs if s.name == "B" and s.type == "RGBA")
            out = next(s for s in mix.outputs if s.type == "RGBA")
            nt.links.new(rgb.outputs[0], a_in)
            nt.links.new(ao.outputs["Color"], b_in)
            nt.links.new(out, bsdf.inputs["Base Color"])
            if cfg.get("emissive"):
                bsdf.inputs["Emission Strength"].default_value = PREVIEW_GLOW_STRENGTH
            bsdf.inputs["Alpha"].default_value = glass_alpha if (name == "glass" and glass_alpha) else 1.0

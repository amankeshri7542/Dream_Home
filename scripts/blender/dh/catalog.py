"""Reads the shared catalog JSON (single source of truth) and derives the
list of models to build and thumbnails to render."""

import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(BLENDER_DIR, "..", ".."))
CATALOG_DIR = os.path.join(ROOT, "src", "domain", "catalog")

# Pleasant thumbnail colours for tintable slots on garden items (the web
# tints them per instance; these only affect the thumbnails).
LANDSCAPE_TINTS = {
    "tree-blossom": {"accent": "#f2b8c6"},
    "flowerbed": {"accent": "#f2b8c6"},
    "flowerbed-module": {"accent": "#f2b8c6"},
    "parasol": {"accent": "#c0714f"},
    "mailbox": {"accent": "#c0714f"},
    "parking": {"accent": "#cf9f45"},
    "car": {"accent": "#cf9f45"},
    "sun-lounger": {"fabric": "#ece6dc", "wood": "#c49a6c"},
    "bench": {"wood": "#c49a6c"},
    "fence-panel": {"wood": "#efe9df"},
    "gate": {"wood": "#efe9df"},
}


class Spec:
    """A buildable model (one root node in a kit GLB)."""

    def __init__(self, **kw):
        self.id = kw["id"]
        self.kit = kw["kit"]
        self.label = kw.get("label", self.id)
        self.w, self.d, self.h = kw["size"]
        self.slots = list(kw["slots"])
        self.tri_budget = int(kw["triBudget"])
        self.layer = kw.get("layer", "standard")
        self.mount_y = kw.get("mountY")
        self.tints = kw.get("tints", {})
        self.source = kw.get("source", self.id)

    @property
    def grounded(self):
        """Whether the model rests on the floor (AO ground / thumbnail shadow)."""
        return self.layer not in ("high", "ceiling") and self.id != "cloud"

    def to_json(self):
        return {"id": self.id, "kit": self.kit, "size": {"w": self.w, "d": self.d, "h": self.h}, "slots": self.slots, "triBudget": self.tri_budget}


class ThumbJob:
    """A thumbnail: either one model, a row of models (tile composites) or a
    thumbnail-only procedural stand-in."""

    def __init__(self, id, parts=None, procedural=None, tints=None, grounded=True, size=None):
        self.id = id
        # see-through glass only where the glass hides the item (thumbnail only)
        self.glass_alpha = 0.3 if id == "shower" else None
        self.parts = parts or []  # list of (model_id, x_offset_cm)
        self.procedural = procedural
        self.tints = tints or {}
        self.grounded = grounded
        self.size = size


def _load(name):
    with open(os.path.join(CATALOG_DIR, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def _size(item):
    s = item["size"]
    return (float(s["w"]), float(s["d"]), float(s["h"]))


def load():
    furn = _load("furniture.json")
    land = _load("landscape.json")
    slots = furn["slots"]
    finishes = furn["finishes"]

    # Default finish per tintable slot = most common defaultFinish among items
    # whose finishSlot is that slot (ties -> palette order).
    slot_defaults = {}
    for slot, cfg in slots.items():
        if not cfg.get("tint"):
            continue
        palette = finishes.get(slot, {})
        counts = Counter(it.get("defaultFinish") for it in furn["items"] if it.get("finishSlot") == slot and it.get("defaultFinish") in palette)
        order = list(palette.keys())
        best = sorted(counts.items(), key=lambda kv: (-kv[1], order.index(kv[0])))
        name = best[0][0] if best else order[0]
        slot_defaults[slot] = palette[name]

    def item_tints(item):
        out = {}
        for s in item.get("slots", []):
            if slots.get(s, {}).get("tint"):
                out[s] = slot_defaults[s]
        fs = item.get("finishSlot")
        df = item.get("defaultFinish")
        if fs and df and df in finishes.get(fs, {}):
            out[fs] = finishes[fs][df]
        return out

    specs = {}
    thumbs = []

    for it in furn["items"]:
        if "tile" in it:
            tile = it["tile"]
            if it["id"] == "kitchen-counter":
                seq = [tile["module"], tile["sink"], tile["module"], tile["end"]]
            else:
                n = max(1, round(it["size"]["w"] / tile["moduleWidth"]))
                seq = [tile["module"]] * n
            thumbs.append(ThumbJob(it["id"], parts=seq, tints=item_tints(it), grounded=True))
            continue
        spec = Spec(id=it["id"], kit="interior", label=it.get("label"), size=_size(it), slots=it["slots"], triBudget=it["triBudget"], layer=it.get("layer"), mountY=it.get("mountY"), tints=item_tints(it))
        specs[spec.id] = spec
        thumbs.append(ThumbJob(it["id"], parts=[spec.id], tints=spec.tints, grounded=spec.grounded))

    for it in land["items"]:
        tints = item_tints(it)
        tints.update(LANDSCAPE_TINTS.get(it["id"], {}))
        if it.get("procedural"):
            thumbs.append(ThumbJob(it["id"], procedural=it["id"], tints=tints, size=_size(it)))
            continue
        model = it["model"]
        if "tile" in it:
            mw = float(it["tile"]["moduleWidth"])
            w, d, h = _size(it)
            size = (mw, d, h)
            n = max(1, int(round(w / mw)))
            seq = [model] * n
        else:
            size = _size(it)
            seq = [model]
        if model not in specs:
            mt = dict(tints)
            mt.update(LANDSCAPE_TINTS.get(model, {}))
            specs[model] = Spec(id=model, kit="exterior", label=it.get("label"), size=size, slots=it["slots"], triBudget=it["triBudget"], layer="standard", tints=mt, source=it["id"])
        thumbs.append(ThumbJob(it["id"], parts=seq, tints=tints))

    for mod in land.get("modules", []):
        tints = {s: slot_defaults[s] for s in mod["slots"] if slots.get(s, {}).get("tint")}
        tints.update(LANDSCAPE_TINTS.get(mod["id"], {}))
        spec = Spec(id=mod["id"], kit="exterior", label=mod.get("label"), size=_size(mod), slots=mod["slots"], triBudget=mod["triBudget"], tints=tints)
        specs[spec.id] = spec
        thumbs.append(ThumbJob(mod["id"], parts=[spec.id], tints=tints, grounded=spec.grounded))

    return {"slots": slots, "finishes": finishes, "slot_defaults": slot_defaults, "specs": specs, "thumbs": thumbs}

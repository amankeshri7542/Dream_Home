"""Item builder registry. Each builder receives a ``dh.scene.Item`` and adds
parts per material slot in centimetres (Blender axes, front = -Y)."""

BUILDERS = {}
PROCEDURAL = {}


def builder(*ids):
    def deco(fn):
        for i in ids:
            BUILDERS[i] = fn
        return fn

    return deco


def procedural(*ids):
    def deco(fn):
        for i in ids:
            PROCEDURAL[i] = fn
        return fn

    return deco


from . import sleep, seating, tables, storage, kitchen, bath, decor, retail, trees, garden, vehicles  # noqa: E402,F401

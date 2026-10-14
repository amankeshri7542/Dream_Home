"""Per-item contract checks (bounds, budget, origin, naming, slots)."""

from . import scene as SC

TOL_CM = 1.0


def check_item(spec, item, bake_method):
    errors, warnings = [], []
    root = item.root
    objs = item.objects
    if root is None or root.name != spec.id:
        errors.append(f"root node must be named {spec.id}")
    lo, hi = SC.world_bounds(objs)
    w, d, h = (hi.x - lo.x) * 100, (hi.y - lo.y) * 100, (hi.z - lo.z) * 100
    cx, cy = (hi.x + lo.x) * 50, (hi.y + lo.y) * 50
    bottom = lo.z * 100
    for label, got, want in (("w", w, spec.w), ("d", d, spec.d), ("h", h, spec.h)):
        if abs(got - want) > TOL_CM:
            errors.append(f"{label}={got:.2f}cm, catalog {want}cm")
    if abs(cx) > TOL_CM or abs(cy) > TOL_CM or abs(bottom) > TOL_CM:
        errors.append(f"origin not at floor centre (cx={cx:.2f}, cy={cy:.2f}, bottom={bottom:.2f})")
    tris = sum(SC.mesh_tris(o) for o in objs)
    if tris > spec.tri_budget:
        errors.append(f"tris {tris} > budget {spec.tri_budget}")
    slots = []
    for o in objs:
        prefix = f"{spec.id}__"
        if not o.name.startswith(prefix):
            errors.append(f"mesh {o.name} not named {prefix}<slot>")
            continue
        slot = o.name[len(prefix):]
        slots.append(slot)
        if slot not in spec.slots:
            errors.append(f"slot {slot} not declared")
        mats = [m.name for m in o.data.materials]
        if mats != [slot]:
            errors.append(f"{o.name} materials {mats} != [{slot}]")
        if "AO" not in o.data.color_attributes:
            errors.append(f"{o.name} missing AO attribute")
        if o.parent != root:
            errors.append(f"{o.name} not parented to root")
    if len(set(slots)) != len(slots):
        errors.append("duplicate slot meshes")
    unused = [s for s in spec.slots if s not in slots]
    if unused:
        warnings.append(f"declared slots unused: {unused}")
    sx, sy, sz = item.fit_scale
    if max(abs(sx - 1), abs(sy - 1), abs(sz - 1)) > 0.06:
        warnings.append(f"fit scale drift {sx:.3f},{sy:.3f},{sz:.3f}")
    entry = {
        "id": spec.id,
        "kit": spec.kit,
        "tris": tris,
        "triBudget": spec.tri_budget,
        "bounds": {"w": round(w, 2), "d": round(d, 2), "h": round(h, 2)},
        "size": {"w": spec.w, "d": spec.d, "h": spec.h},
        "slots": slots,
        "fitScale": [round(sx, 4), round(sy, 4), round(sz, 4)],
        "ao": bake_method,
        "errors": errors,
        "warnings": warnings,
    }
    return entry

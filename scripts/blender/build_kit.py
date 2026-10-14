"""Dream Home 3D asset kit builder (headless Blender).

Usage (from the repo root):
  Blender --factory-startup -b --python-exit-code 1 \
      --python scripts/blender/build_kit.py -- --kit all --thumbs

Options after ``--``:
  --kit interior|exterior|all   which GLB(s) to build (default all)
  --only id,id                  restrict to these model / thumbnail ids
  --no-bake                     skip AO baking (white AO)
  --thumbs                      render public/thumbs/<id>.webp
  --out <dir>                   GLB output dir (default public/models)

Writes <out>/interior.raw.glb, <out>/exterior.raw.glb and
scripts/blender/report.json. Exits non-zero on any contract violation.
"""

import argparse
import json
import os
import random
import sys
import time
import traceback

sys.dont_write_bytecode = True  # keep scripts/blender free of __pycache__
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

from dh import bake, catalog, export, materials, thumbs, validate  # noqa: E402
from dh import scene as SC  # noqa: E402
import items  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="build_kit.py")
    ap.add_argument("--kit", choices=("interior", "exterior", "all"), default="all")
    ap.add_argument("--only", default="")
    ap.add_argument("--no-bake", action="store_true")
    ap.add_argument("--thumbs", action="store_true")
    ap.add_argument("--out", default=os.path.join(catalog.ROOT, "public", "models"))
    ap.add_argument("--thumbs-out", default=os.path.join(catalog.ROOT, "public", "thumbs"))
    ap.add_argument("--report", default=None, help="report path (default scripts/blender/report.json for full builds)")
    return ap.parse_args(argv)


def build_one(spec, mats, ground, kit_coll, do_bake):
    it = SC.Item(spec)
    builder = items.BUILDERS.get(spec.id)
    if builder is None:
        raise RuntimeError(f"no builder registered for {spec.id}")
    builder(it)
    it.fit()
    coll = SC.item_collection(f"item:{spec.id}", kit_coll)
    it.realize(mats, coll)
    bpy.context.view_layer.update()
    method = bake.bake_item(spec, it.objects, ground, enabled=do_bake)
    entry = validate.check_item(spec, it, method)
    SC.set_excluded(coll, True)
    return it, coll, entry


def procedural_builder_factory(mats, ground, do_bake):
    def build(job, temp_coll):
        spec = catalog.Spec(id=f"thumb-{job.id}", kit="thumb", size=job.size, slots=["stone", "water", "metal"], triBudget=10 ** 6)
        it = SC.Item(spec)
        items.PROCEDURAL[job.id](it)
        it.realize(mats, temp_coll)
        bpy.context.view_layer.update()
        bake.bake_item(spec, it.objects, ground, enabled=do_bake)
        ground.location.z = -0.0005
        ground.hide_render = False
        return {"objects": it.objects, "all": [it.root] + it.objects, "meshes": [o.data for o in it.objects]}

    return build


def main():
    args = parse_args()
    random.seed(7)
    t0 = time.time()
    scene = SC.reset()
    cat = catalog.load()
    mats = materials.Library(cat["slots"], cat["slot_defaults"])
    ground = SC.ground_plane()

    kits = ("interior", "exterior") if args.kit == "all" else (args.kit,)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    specs = [s for s in cat["specs"].values() if s.kit in kits]
    if only:
        # --only may name thumbnail ids too (e.g. kitchen-counter, parking)
        wanted = set(only)
        for job in cat["thumbs"]:
            if job.id in only:
                wanted.update(job.parts)
        specs = [s for s in specs if s.id in wanted]

    report = {"items": [], "kits": {}, "thumbs": [], "errors": []}
    built, colls = {}, {}
    kit_colls = {k: SC.item_collection(f"KIT_{k}") for k in kits}
    for spec in specs:
        try:
            it, coll, entry = build_one(spec, mats, ground, kit_colls[spec.kit], not args.no_bake)
        except Exception as exc:
            traceback.print_exc()
            report["errors"].append(f"{spec.id}: build failed: {exc}")
            continue
        built[spec.id] = it
        colls[spec.id] = coll
        report["items"].append(entry)
        status = "OK " if not entry["errors"] else "ERR"
        print(f"[kit] {status} {spec.id:22s} tris {entry['tris']:5d}/{spec.tri_budget:<5d} "
              f"bounds {entry['bounds']['w']:.1f}x{entry['bounds']['d']:.1f}x{entry['bounds']['h']:.1f} "
              f"fit {entry['fitScale']} ao={entry['ao']} {'; '.join(entry['errors'] + entry['warnings'])}")
        report["errors"] += [f"{spec.id}: {e}" for e in entry["errors"]]

    # Export (white tint slots, plain materials).
    mats.export_mode()
    for kit in kits:
        kit_items = [built[s.id] for s in specs if s.kit == kit and s.id in built]
        if not kit_items:
            continue
        path = os.path.join(args.out, f"{kit}.raw.glb")
        res = export.export_kit(path, kit_items, [colls[i.id] for i in kit_items])
        res["tris"] = sum(e["tris"] for e in report["items"] if e["kit"] == kit)
        res["items"] = [i.id for i in kit_items]
        report["kits"][kit] = res
        report["errors"] += res["errors"]
        print(f"[kit] exported {path} ({res['bytes']} bytes, {res['tris']} tris, {len(kit_items)} items)")
        for coll in [colls[i.id] for i in kit_items]:
            SC.set_excluded(coll, True)

    if args.thumbs:
        os.makedirs(args.thumbs_out, exist_ok=True)
        rig = thumbs.setup(scene, ground)
        proc = procedural_builder_factory(mats, ground, not args.no_bake)
        for job in cat["thumbs"]:
            if only and job.id not in only and not (set(job.parts) & only):
                continue
            if not job.procedural and any(p not in built for p in job.parts):
                continue
            if job.procedural and args.kit == "interior":
                continue
            try:
                ts = time.time()
                path = thumbs.render(job, built, colls, mats, rig, args.thumbs_out, proc)
                report["thumbs"].append(job.id)
                print(f"[thumb] {job.id} -> {os.path.relpath(path, catalog.ROOT)} ({time.time() - ts:.1f}s)")
            except Exception as exc:
                traceback.print_exc()
                report["errors"].append(f"thumb {job.id}: {exc}")
        mats.export_mode()

    seconds = round(time.time() - t0, 1)
    report["items"].sort(key=lambda e: (e["kit"], e["id"]))
    report_path = args.report or (None if only or args.kit != "all" else os.path.join(HERE, "report.json"))
    if report_path:
        with open(report_path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
            fh.write("\n")
    if report["errors"]:
        print("[kit] FAILED:")
        for e in report["errors"]:
            print("   -", e)
        sys.exit(1)
    print(f"[kit] done in {seconds}s: {len(report['items'])} models, {len(report['thumbs'])} thumbnails")


if __name__ == "__main__":
    main()

#!/usr/bin/env node
// Dream Home asset kit pipeline (no extra dependencies).
//
//   node scripts/assets/build.mjs                 # blender + pack
//   node scripts/assets/build.mjs --step blender  # Blender: raw GLBs, thumbnails, report
//   node scripts/assets/build.mjs --step pack     # gltfpack, budgets, manifest, cleanup
//
// Blender binary: $BLENDER_PATH or the default macOS install below.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_BLENDER = "/Volumes/T7-MacSSD/Applications /Blender.app/Contents/MacOS/Blender";
const BLENDER = process.env.BLENDER_PATH || DEFAULT_BLENDER;
const MODELS = join(ROOT, "public", "models");
const THUMBS = join(ROOT, "public", "thumbs");
const REPORT = join(ROOT, "scripts", "blender", "report.json");
const MANIFEST = join(ROOT, "src", "scene", "assets", "assetManifest.ts");
const KITS = ["interior", "exterior"];
const BUDGET_BYTES = { interior: 300_000, exterior: 150_000 };
// EXT_meshopt_compression (decodable by three r180's MeshoptDecoder), keep
// node names / materials / extras. -vpf keeps float positions so each mesh
// stays directly on its named `<id>__<slot>` node (no dequantisation nodes);
// normals and colours are still quantised (KHR_mesh_quantization).
const GLTFPACK_FLAGS = ["-cc", "-kn", "-km", "-ke", "-vpf"];

function fail(msg) {
  console.error(`\n[assets] FAILED: ${msg}`);
  process.exit(1);
}

function run(cmd, args, label) {
  console.log(`[assets] ${label}: ${[cmd, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (res.error) fail(`${label}: ${res.error.message}`);
  if (res.status !== 0) fail(`${label} exited with ${res.status}`);
}

function stepBlender() {
  if (!existsSync(BLENDER)) fail(`Blender not found at "${BLENDER}" (set BLENDER_PATH)`);
  run(
    BLENDER,
    ["--factory-startup", "-b", "--python-exit-code", "1", "--python", join("scripts", "blender", "build_kit.py"), "--", "--kit", "all", "--thumbs"],
    "blender",
  );
}

function gltfpackCommand() {
  if (process.platform === "win32") {
    return [process.execPath, [join(ROOT, "node_modules", "gltfpack", "cli.js")]];
  }
  return [join(ROOT, "node_modules", ".bin", "gltfpack"), []];
}

function readGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.toString("utf8", 0, 4) !== "glTF") fail(`${path} is not a GLB`);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + len));
}

function stepPack() {
  if (!existsSync(REPORT)) fail("scripts/blender/report.json missing - run `npm run assets:blender` first");
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  if (report.errors?.length) fail(`report.json lists errors:\n  ${report.errors.join("\n  ")}`);
  const [gltfpack, pre] = gltfpackCommand();
  const kits = {};
  for (const kit of KITS) {
    const raw = join(MODELS, `${kit}.raw.glb`);
    const out = join(MODELS, `${kit}.glb`);
    if (!existsSync(raw)) fail(`${relative(ROOT, raw)} missing - run \`npm run assets:blender\` first`);
    run(gltfpack, [...pre, "-i", raw, "-o", out, ...GLTFPACK_FLAGS], `gltfpack ${kit}`);
    if (!existsSync(out)) fail(`gltfpack did not write ${relative(ROOT, out)}`);
    const bytes = statSync(out).size;
    if (bytes > BUDGET_BYTES[kit]) fail(`${kit}.glb is ${bytes} bytes > budget ${BUDGET_BYTES[kit]} (reduce triangles)`);
    const gltf = readGlbJson(out);
    const used = gltf.extensionsUsed ?? [];
    if (!used.includes("EXT_meshopt_compression")) fail(`${kit}.glb lacks EXT_meshopt_compression`);
    for (const bad of ["KHR_meshopt_compression", "KHR_draco_mesh_compression"]) {
      if (used.includes(bad)) fail(`${kit}.glb uses ${bad}`);
    }
    const names = new Set((gltf.nodes ?? []).map((n) => n.name));
    const ids = report.items.filter((e) => e.kit === kit).map((e) => e.id);
    const missing = ids.filter((id) => !names.has(id));
    if (missing.length) fail(`${kit}.glb lost root nodes: ${missing.join(", ")}`);
    const hash = createHash("sha256").update(readFileSync(out)).digest("hex").slice(0, 10);
    const tris = report.items.filter((e) => e.kit === kit).reduce((s, e) => s + e.tris, 0);
    kits[kit] = { url: `/models/${kit}.glb?v=${hash}`, bytes, tris };
    console.log(`[assets] ${kit}.glb ${bytes} bytes (budget ${BUDGET_BYTES[kit]}), ${tris} tris, v=${hash}`);
  }
  writeManifest(kits, report);
  for (const kit of KITS) rmSync(join(MODELS, `${kit}.raw.glb`), { force: true });
  console.log(`[assets] wrote ${relative(ROOT, MANIFEST)}; removed raw GLBs`);
}

const q = (s) => JSON.stringify(s);
const num = (n) => String(Math.round(n * 10) / 10);

function writeManifest(kits, report) {
  const thumbs = existsSync(THUMBS)
    ? readdirSync(THUMBS)
        .filter((f) => f.endsWith(".webp"))
        .map((f) => f.slice(0, -5))
        .sort()
    : [];
  const items = [...report.items].sort((a, b) => a.id.localeCompare(b.id));
  const lines = [];
  lines.push("// GENERATED by scripts/assets/build.mjs - do not edit by hand.");
  lines.push("// Models: scripts/blender/build_kit.py (headless Blender) -> gltfpack " + GLTFPACK_FLAGS.join(" ") + ".");
  lines.push("// Rebuild with `npm run assets`. Sizes are centimetres; GLB nodes: <id> root,");
  lines.push("// child meshes <id>__<slot> (material name == slot, COLOR_0 = baked AO).");
  lines.push("");
  lines.push("export const ASSET_MANIFEST = {");
  for (const kit of KITS) {
    const k = kits[kit];
    lines.push(`  ${kit}: { url: ${q(k.url)}, bytes: ${k.bytes}, tris: ${k.tris} },`);
  }
  lines.push("} as const;");
  lines.push("");
  lines.push("export type AssetKit = keyof typeof ASSET_MANIFEST;");
  lines.push("");
  lines.push("export const ASSET_ITEMS: Record<string, { kit: AssetKit; tris: number; bounds: { w: number; d: number; h: number } }> = {");
  for (const e of items) {
    const b = e.bounds;
    lines.push(`  ${q(e.id)}: { kit: ${q(e.kit)}, tris: ${e.tris}, bounds: { w: ${num(b.w)}, d: ${num(b.d)}, h: ${num(b.h)} } },`);
  }
  lines.push("};");
  lines.push("");
  lines.push("export const THUMBS: Record<string, string> = {");
  for (const id of thumbs) lines.push(`  ${q(id)}: ${q(`/thumbs/${id}.webp`)},`);
  lines.push("};");
  lines.push("");
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, lines.join("\n"));
}

const argv = process.argv.slice(2);
const stepIdx = argv.indexOf("--step");
const step = stepIdx >= 0 ? argv[stepIdx + 1] : "all";
if (!["all", "blender", "pack"].includes(step)) fail(`unknown --step ${step}`);
const t0 = Date.now();
if (step === "all" || step === "blender") stepBlender();
if (step === "all" || step === "pack") stepPack();
console.log(`[assets] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

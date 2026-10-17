#!/usr/bin/env node
// Dream Home asset kit pipeline (no extra dependencies).
//
//   node scripts/assets/build.mjs                 # blender + pack
//   node scripts/assets/build.mjs --step blender  # Blender: raw GLBs, thumbnails, report
//   node scripts/assets/build.mjs --step pack     # gltfpack, budgets, manifest, cleanup
//   node scripts/assets/build.mjs --step street   # street life actors only (Blender + pack)
//   node scripts/assets/build.mjs --step life     # lived-in details only (Blender + pack)
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
const BUDGET_BYTES = { interior: 420_000, exterior: 150_000, street: 120_000, life: 160_000 };
const STREET_REPORT = join(ROOT, "scripts", "blender", "street-report.json");
const LIFE_REPORT = join(ROOT, "scripts", "blender", "life-report.json");
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

function stepStreetBlender() {
  if (!existsSync(BLENDER)) fail(`Blender not found at "${BLENDER}" (set BLENDER_PATH)`);
  run(
    BLENDER,
    ["--factory-startup", "-b", "--python-exit-code", "1", "--python", join("scripts", "blender", "build_street.py"), "--"],
    "blender street",
  );
}

function stepLifeBlender() {
  if (!existsSync(BLENDER)) fail(`Blender not found at "${BLENDER}" (set BLENDER_PATH)`);
  run(
    BLENDER,
    ["--factory-startup", "-b", "--python-exit-code", "1", "--python", join("scripts", "blender", "build_life.py"), "--"],
    "blender life",
  );
}

/** Lived-in details: one GLB of <id> roots plus <id>:<part> pivot nodes. */
function packLife() {
  const raw = join(MODELS, "life.raw.glb");
  const out = join(MODELS, "life.glb");
  if (!existsSync(raw)) fail(`${relative(ROOT, raw)} missing - run \`npm run assets -- --step life\``);
  if (!existsSync(LIFE_REPORT)) fail(`${relative(ROOT, LIFE_REPORT)} missing - run \`npm run assets -- --step life\``);
  const report = JSON.parse(readFileSync(LIFE_REPORT, "utf8"));
  if (report.errors?.length) fail(`life-report.json lists errors:\n  ${report.errors.join("\n  ")}`);
  const [gltfpack, pre] = gltfpackCommand();
  run(gltfpack, [...pre, "-i", raw, "-o", out, ...GLTFPACK_FLAGS], "gltfpack life");
  if (!existsSync(out)) fail(`gltfpack did not write ${relative(ROOT, out)}`);
  const bytes = statSync(out).size;
  if (bytes > BUDGET_BYTES.life) fail(`life.glb is ${bytes} bytes > budget ${BUDGET_BYTES.life} (reduce triangles)`);
  const gltf = readGlbJson(out);
  const used = gltf.extensionsUsed ?? [];
  if (!used.includes("EXT_meshopt_compression")) fail("life.glb lacks EXT_meshopt_compression");
  for (const bad of ["KHR_meshopt_compression", "KHR_draco_mesh_compression"]) {
    if (used.includes(bad)) fail(`life.glb uses ${bad}`);
  }
  const names = new Set((gltf.nodes ?? []).map((n) => n.name));
  const want = [...report.items.map((e) => e.id), ...(report.parts ?? []).map((p) => p.id)];
  const lost = want.filter((n) => !names.has(n));
  if (lost.length) fail(`life.glb lost nodes: ${lost.join(", ")}`);
  rmSync(raw, { force: true });
  report.bytes = bytes;
  writeFileSync(LIFE_REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log(`[assets] life.glb ${bytes} bytes (budget ${BUDGET_BYTES.life}), ${report.tris} tris, ${report.items.length} models`);
}

/** Life kit entry + items from the packed file on disk (null when absent). */
function lifeInfo() {
  const out = join(MODELS, "life.glb");
  if (!existsSync(out) || !existsSync(LIFE_REPORT)) return null;
  const report = JSON.parse(readFileSync(LIFE_REPORT, "utf8"));
  const hash = createHash("sha256").update(readFileSync(out)).digest("hex").slice(0, 10);
  return { kit: { url: `/models/life.glb?v=${hash}`, bytes: statSync(out).size, tris: report.tris }, items: report.items };
}

/** Street life actors: gltfpack keeps the named part nodes (pivots). */
function packStreet() {
  const raw = join(MODELS, "street.raw.glb");
  const out = join(MODELS, "street.glb");
  if (!existsSync(raw)) fail(`${relative(ROOT, raw)} missing - run \`npm run assets -- --step street\``);
  const [gltfpack, pre] = gltfpackCommand();
  run(gltfpack, [...pre, "-i", raw, "-o", out, ...GLTFPACK_FLAGS], "gltfpack street");
  const bytes = statSync(out).size;
  if (bytes > BUDGET_BYTES.street) fail(`street.glb is ${bytes} bytes > budget ${BUDGET_BYTES.street}`);
  const gltf = readGlbJson(out);
  const names = new Set((gltf.nodes ?? []).map((n) => n.name));
  const report = JSON.parse(readFileSync(STREET_REPORT, "utf8"));
  const lost = report.actors.flatMap((a) => [a.id, ...a.parts]).filter((n) => !names.has(n));
  if (lost.length) fail(`street.glb lost nodes: ${lost.join(", ")}`);
  rmSync(raw, { force: true });
  console.log(`[assets] street.glb ${bytes} bytes (budget ${BUDGET_BYTES.street}), ${report.tris} tris`);
}

/** Street kit entry from the packed file on disk (null when absent). */
function streetInfo() {
  const out = join(MODELS, "street.glb");
  if (!existsSync(out) || !existsSync(STREET_REPORT)) return null;
  const report = JSON.parse(readFileSync(STREET_REPORT, "utf8"));
  const hash = createHash("sha256").update(readFileSync(out)).digest("hex").slice(0, 10);
  return { url: `/models/street.glb?v=${hash}`, bytes: statSync(out).size, tris: report.tris };
}

/** Kit entries from the packed files on disk (for street-only rebuilds). */
function kitsFromDisk(report) {
  const kits = {};
  for (const kit of KITS) {
    const out = join(MODELS, `${kit}.glb`);
    if (!existsSync(out)) fail(`${relative(ROOT, out)} missing - run \`npm run assets\``);
    const hash = createHash("sha256").update(readFileSync(out)).digest("hex").slice(0, 10);
    const tris = report.items.filter((e) => e.kit === kit).reduce((s, e) => s + e.tris, 0);
    kits[kit] = { url: `/models/${kit}.glb?v=${hash}`, bytes: statSync(out).size, tris };
  }
  return kits;
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
  if (existsSync(join(MODELS, "street.raw.glb"))) packStreet();
  if (existsSync(join(MODELS, "life.raw.glb"))) packLife();
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
  const life = lifeInfo();
  const kitIds = new Set(report.items.map((e) => e.id));
  const clash = (life?.items ?? []).filter((e) => kitIds.has(e.id)).map((e) => e.id);
  if (clash.length) fail(`life ids collide with kit ids: ${clash.join(", ")}`);
  const items = [...report.items, ...(life?.items ?? [])].sort((a, b) => a.id.localeCompare(b.id));
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
  if (life) lines.push(`  life: { url: ${q(life.kit.url)}, bytes: ${life.kit.bytes}, tris: ${life.kit.tris} },`);
  lines.push("} as const;");
  lines.push("");
  lines.push("export type AssetKit = keyof typeof ASSET_MANIFEST;");
  const street = streetInfo();
  lines.push("");
  lines.push("/** Street life actors (scripts/blender/build_street.py), loaded lazily in Explore. */");
  lines.push(
    street
      ? `export const STREET_ASSET: { url: string; bytes: number; tris: number } | null = { url: ${q(street.url)}, bytes: ${street.bytes}, tris: ${street.tris} };`
      : "export const STREET_ASSET: { url: string; bytes: number; tris: number } | null = null;",
  );
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
if (!["all", "blender", "pack", "street", "life"].includes(step)) fail(`unknown --step ${step}`);
const t0 = Date.now();
if (step === "all" || step === "blender") stepBlender();
if (step === "all" || step === "blender" || step === "street") stepStreetBlender();
if (step === "all" || step === "blender" || step === "life") stepLifeBlender();
if (step === "all" || step === "pack") stepPack();
if (step === "street" || step === "life") {
  if (step === "street") packStreet();
  else packLife();
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  writeManifest(kitsFromDisk(report), report);
}
console.log(`[assets] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

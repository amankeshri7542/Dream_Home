// Writes /sw.js from src/pwa/sw.js with this build's file lists: the app shell
// to keep at install (the entry, the editor's first chunks, their styles, the
// Latin fonts, the manifest and an icon) and every other built file it knows,
// so the worker can drop files from older versions. Plain JS, like build-api.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function serviceWorker() {
  return {
    name: "dream-home-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const byName = new Map(files.map((f) => [f.fileName, f]));
      const shell = new Set();
      const visit = (name) => {
        const file = byName.get(name);
        if (!file || shell.has(name)) return;
        shell.add(name);
        if (file.type !== "chunk") return;
        file.imports.forEach(visit);
        file.viteMetadata?.importedCss.forEach((css) => shell.add(css));
      };
      if (!files.some((f) => f.type === "chunk" && f.name === "App")) throw new Error("service worker: the App chunk is missing");
      for (const f of files) if (f.type === "chunk" && (f.isEntry || f.name === "App")) visit(f.fileName);
      for (const f of files)
        if (f.type === "asset" && /^assets\/(figtree|fraunces)-latin(-ext)?-[a-z]+-normal-.+\.woff2$/.test(f.fileName)) shell.add(f.fileName);
      const precache = ["/", "/manifest.webmanifest", "/icons/icon-192.png", ...[...shell].sort().map((f) => `/${f}`)];
      const known = files
        .map((f) => `/${f.fileName}`)
        .filter((f) => f.startsWith("/assets/") && !precache.includes(f))
        .sort();
      const version = createHash("sha256").update(JSON.stringify([precache, known])).digest("hex").slice(0, 12);
      const source = readFileSync(new URL("../../src/pwa/sw.js", import.meta.url), "utf8")
        .replace('"__DH_VERSION__"', JSON.stringify(version))
        .replace("__DH_PRECACHE__", JSON.stringify(precache))
        .replace("__DH_KNOWN__", JSON.stringify(known));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

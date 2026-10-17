import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { SECURITY_HEADERS } from "./server/headers";
import { serviceWorker } from "./scripts/pwa/plugin.mjs";

// Node's request and response, typed loosely: the project doesn't ship Node typings.
type NodeRequest = AsyncIterable<Uint8Array> & {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
};
type NodeResponse = { statusCode: number; setHeader(key: string, value: string): void; end(body?: string): void };
type Middlewares = { use(path: string, fn: (req: NodeRequest, res: NodeResponse) => void): void };
type Route = (request: Request) => Promise<Response>;

/** Turns a Node request into a Web Request and the Web Response back. */
function serveApi(middlewares: Middlewares, load: () => Promise<Route>, log: (message: string) => void) {
  middlewares.use("/api", async (req, res) => {
    try {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === "string") headers.set(key, value);
      const method = req.method ?? "GET";
      const request = new Request(`http://${headers.get("host") ?? "localhost"}${req.originalUrl ?? req.url ?? "/api"}`, {
        method,
        headers,
        ...(method !== "GET" && method !== "HEAD" ? { body: new Blob(chunks as BlobPart[]) } : {}),
      });
      const response = await (await load())(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (error) {
      log(String(error));
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, reason: "busy", message: "The local API server failed." }));
    }
  });
}

/**
 * Serves /api/* locally from the same code Vercel runs: the server/*.ts
 * sources during `npm run dev` (reading ANTHROPIC_API_KEY etc. from .env.local),
 * and the built api/index.js bundle during `vite preview`.
 */
function localApi(): Plugin {
  return {
    name: "dream-home-local-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      serveApi(
        server.middlewares as unknown as Middlewares,
        async () => {
          const { route } = await server.ssrLoadModule("/server/router.ts");
          return (request) => route(request, env);
        },
        (m) => server.config.logger.error(m),
      );
    },
    configurePreviewServer(server) {
      serveApi(
        server.middlewares as unknown as Middlewares,
        async () => {
          const bundle = (await import(/* @vite-ignore */ new URL("./api/index.js", import.meta.url).href)) as {
            default: { fetch: Route };
          };
          return (request) => bundle.default.fetch(request);
        },
        (m) => server.config.logger.error(m),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi(), serviceWorker()],
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173,
    // node_modules is a symlink to node_modules.nosync (iCloud folder); Vite
    // ignores node_modules by name only, so stray file events in the real folder
    // would force full page reloads.
    watch: { ignored: ["**/node_modules.nosync/**"] },
  },
  // Scan only our own pages for dependencies. Vite skips folders named
  // node_modules, not node_modules.nosync, and a package's stray test pages
  // there broke the scan, so the dev server kept reloading to add dependencies.
  optimizeDeps: { entries: ["index.html", "scene-lab.html"] },
  // The production headers (CSP and friends), so the built app can be tested locally.
  preview: { port: 4173, headers: SECURITY_HEADERS },
});

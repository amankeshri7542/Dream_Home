import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serves the AI designer at /api/design during `npm run dev`, from the same
 * server/*.ts code Vercel runs. Reads ANTHROPIC_API_KEY from .env.local.
 */
function devApi(): Plugin {
  return {
    name: "dream-home-dev-api",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      server.middlewares.use("/api/design", async (incoming, res) => {
        // Node's request, typed loosely: the project doesn't ship Node typings.
        const req = incoming as unknown as AsyncIterable<Uint8Array> & {
          headers: Record<string, string | string[] | undefined>;
          method?: string;
          originalUrl?: string;
        };
        try {
          const chunks: Uint8Array[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers))
            if (typeof value === "string") headers.set(key, value);
          const request = new Request(`http://localhost${req.originalUrl ?? "/api/design"}`, {
            method: req.method,
            headers,
            ...(req.method === "POST" ? { body: new Blob(chunks as BlobPart[]) } : {}),
          });
          const { handleDesign } = await server.ssrLoadModule("/server/design.ts");
          const response: Response = await handleDesign(request, env);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(String(error));
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, reason: "busy", message: "The local AI server failed." }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  build: { chunkSizeWarningLimit: 1200 },
  server: { port: 5173 },
});

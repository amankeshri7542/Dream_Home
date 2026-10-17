// Vercel function entry, bundled to api/index.js by scripts/build-api.mjs.
// vercel.json rewrites every /api/* request here.
import type { Env } from "./http";
import { route } from "./router";

declare const process: { env: Env };

export default {
  fetch(request: Request) {
    return route(request, process.env);
  },
};

// Vercel function entry, bundled to api/design.js by scripts/build-api.mjs.
import { handleDesign, type Env } from "./design";

declare const process: { env: Env };

export default {
  fetch(request: Request) {
    return handleDesign(request, process.env);
  },
};

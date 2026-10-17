// Security checks against the production build (`vite preview` serves the
// same headers as vercel.json, plus the bundled api/index.js). Run with
// `npm run test:preview`; part of the gate.
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/preview",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:4173",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { channel: "chrome" },
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npx vite build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 180000,
  },
  reporter: "list",
});

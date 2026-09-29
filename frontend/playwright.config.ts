import { defineConfig } from "@playwright/test";

// E2E: requiere backend en :8000 y frontend en :3000 (docker compose up, o uvicorn + next start).
// Instalar navegador una vez: npx playwright install chromium
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  projects: [{ name: "desktop" }, { name: "movil", use: { viewport: { width: 375, height: 812 } } }],
});

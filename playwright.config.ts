import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL → run against a server you started yourself (no webServer). Otherwise Playwright builds and
// starts the app on E2E_PORT (default 3000) with DEMO_MODE=true (override with DEMO_MODE=false).
const port = Number(process.env.E2E_PORT ?? 3000);
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://localhost:${port}`;
// The API suite signs GitHub webhook payloads with this secret; the server must use the same one.
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "e2e-webhook-secret";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: external
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${port}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 240_000,
        env: { DEMO_MODE: process.env.DEMO_MODE ?? "true", GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET },
      },
  projects: [
    { name: "api", testMatch: /api\.spec\.ts$/ },
    { name: "desktop", testIgnore: /api\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: /api\.spec\.ts$/, use: { ...devices["Pixel 7"] } },
  ],
});

import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || "3001");
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ||
  `npm run dev -- --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // The Next.js dev server compiles routes on demand during E2E. Keep these
  // specs serial so route compilation and mocked API timing stay deterministic.
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      // Any non-empty value works; e2e mocks the maps.googleapis.com response.
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "test-key-for-playwright",
      // Use a separate build cache so the test-only NEXT_PUBLIC_* values
      // don't get baked into the .next dir that `npm run dev` reuses.
      NEXT_DIST_DIR: ".next-playwright",
      // Bypass Clerk auth in e2e: middleware no-ops, ClerkProvider is unmounted,
      // and layouts use a localStorage-backed useMe variant. The existing
      // mockSession() helper sets the access token under the same key.
      E2E_BYPASS_CLERK: process.env.E2E_BYPASS_CLERK || "1",
      NEXT_PUBLIC_E2E_BYPASS_CLERK: process.env.NEXT_PUBLIC_E2E_BYPASS_CLERK || "1",
    },
  },
});

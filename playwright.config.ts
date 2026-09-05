import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.YLP_TEST_API_PORT ?? 4000);
const webPort = Number(process.env.YLP_TEST_WEB_PORT ?? 4173);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webOrigin,
    locale: "ar-YE",
    timezoneId: "Asia/Aden",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `PORT=${apiPort} WEB_ORIGIN=${webOrigin} RATE_LIMIT_LIMIT=100000 npm run start -w @ylp/api`,
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `API_PROXY_TARGET=${apiOrigin} npm run preview -w @ylp/web -- --port ${webPort}`,
      url: `${webOrigin}/ar`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "tablet-1024",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: "mobile-390",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile-320",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 720 },
      },
    },
  ],
});

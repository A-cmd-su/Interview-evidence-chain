import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === "win32" &&
  existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
    ? "msedge"
    : undefined);
const mockPort = process.env.TEST_MOCK_PORT || "8799";
const webPort = process.env.TEST_WEB_PORT || "5199";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    ...(channel ? { channel } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--use-fake-device-for-media-stream"] },
  },
  webServer: [
    {
      command: "node tests/production-browser-server.mjs",
      url: "http://127.0.0.1:8809/api/ping",
      reuseExistingServer: false,
    },
    {
      command: "node tests/browser-server.mjs",
      url: `http://127.0.0.1:${mockPort}/api/health`,
      env: { TEST_MOCK_PORT: mockPort, TEST_WEB_PORT: webPort },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web",
      url: `http://127.0.0.1:${webPort}`,
      env: { API_PORT: mockPort, WEB_PORT: webPort },
      reuseExistingServer: false,
    },
  ],
});

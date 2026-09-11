import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === "win32" &&
  existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
    ? "msedge"
    : undefined);
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:5199",
    ...(channel ? { channel } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/browser-server.mjs",
      url: "http://127.0.0.1:8799/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5199",
      env: { API_PORT: "8799", WEB_PORT: "5199" },
      reuseExistingServer: false,
    },
  ],
});

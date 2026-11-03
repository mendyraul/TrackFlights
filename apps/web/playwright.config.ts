import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3109",
    locale: "en-US",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run start --workspace=apps/web -- --hostname 127.0.0.1 --port 3109",
    cwd: path.resolve(__dirname, "../.."),
    url: "http://127.0.0.1:3109/api/healthz/live",
    reuseExistingServer: false,
  },
});

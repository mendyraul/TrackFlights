import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:3109", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run start --workspace=apps/web -- --hostname 127.0.0.1 --port 3109",
    cwd: path.resolve(__dirname, "../.."),
    url: "http://127.0.0.1:3109/api/healthz/live",
    reuseExistingServer: false,
  },
});

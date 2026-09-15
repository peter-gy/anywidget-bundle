import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: "../../dist/e2e/results",
  reporter: [["list"], ["json", { outputFile: "../../dist/e2e/report.json" }]],
  use: { browserName: "chromium", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    {
      command: `${process.platform === "win32" ? "../../dist/e2e/venv/Scripts/python.exe" : "../../dist/e2e/venv/bin/python"} serve.py`,
      env: { BUNDLE_E2E_VITE: "http://127.0.0.1:27355" },
      url: "http://127.0.0.1:27354/lab",
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command: "node dev-server.mjs",
      url: "http://127.0.0.1:27355/@anywidget-bundle/entry",
      timeout: 30_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});

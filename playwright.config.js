"use strict";

var { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/harness",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }]
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: Object.assign({}, devices["Desktop Chrome"], { browserName: "chromium" })
    }
  ],
  webServer: {
    command: "node scripts/static-server.js --port 4173 --host 127.0.0.1",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});

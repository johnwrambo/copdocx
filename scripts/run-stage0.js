"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const tests = [
  "test-storage-keys.js",
  "test-store-save.js",
  "test-transfer.js",
  "test-media.js",
  "test-encounter-narrative-launcher.js",
  "test-integrity.js",
  "test-integrity-page.js",
  "test-safety-backup.js",
  "test-stage0-known-risks.js"
];

for (const test of tests) {
  const file = path.join(__dirname, test);
  process.stdout.write("\n[stage0] " + test + "\n");
  const result = spawnSync(process.execPath, [file], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8"
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    console.error("[stage0] could not start", test, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("[stage0] failed", test, "with exit code", result.status);
    process.exit(result.status || 1);
  }
}

console.log("\nSTAGE0_BASELINE_PASSED", tests.length + "/" + tests.length + " checks passed.");

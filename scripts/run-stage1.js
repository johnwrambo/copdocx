"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const gates = ["run-stage0.js", "test-stage1-data-contract.js"];

for (const gate of gates) {
  process.stdout.write("\n[stage1] " + gate + "\n");
  const result = spawnSync(process.execPath, [path.join(__dirname, gate)], {
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
    console.error("[stage1] could not start", gate, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("[stage1] failed", gate, "with exit code", result.status);
    process.exit(result.status || 1);
  }
}

console.log("\nSTAGE1_BASELINE_PASSED", gates.length + "/" + gates.length + " gates passed.");

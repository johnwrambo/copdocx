"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const gates = ["run-stage1.js", "test-model.js"].concat(
  fs
    .readdirSync(__dirname)
    .filter(name => /^test-stage2-.*\.js$/.test(name))
    .sort()
);

for (const gate of gates) {
  process.stdout.write("\n[stage2] " + gate + "\n");
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
    console.error("[stage2] could not start", gate, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("[stage2] failed", gate, "with exit code", result.status);
    process.exit(result.status || 1);
  }
}

console.log("\nSTAGE2_BASELINE_PASSED", gates.length + "/" + gates.length + " gates passed.");

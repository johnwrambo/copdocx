"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const gates = ["run-stage2.js", "test-narrative-build9.js"].concat(
  fs.readdirSync(__dirname).filter(name => /^test-stage3-.*\.js$/.test(name)).sort()
);
for (const gate of gates) {
  process.stdout.write("\n[stage3] " + gate + "\n");
  const result = spawnSync(process.execPath, [path.join(__dirname, gate)], {
    cwd: path.resolve(__dirname, ".."), encoding: "utf8"
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    console.error("[stage3] failed", gate, result.error || result.status);
    process.exit(result.status || 1);
  }
}
console.log("\nSTAGE3_BASELINE_PASSED", gates.length + "/" + gates.length + " gates passed.");

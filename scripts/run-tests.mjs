import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : ["."];
const testFiles = targets.flatMap((target) => expandTarget(target));

if (testFiles.length === 0) {
  console.error(`No test files found for: ${targets.join(", ")}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);

function expandTarget(target) {
  const stats = statSync(target);

  if (stats.isDirectory()) {
    return collectTests(target);
  }

  return [target];
}

function collectTests(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTests(fullPath));
      continue;
    }

    if (/\.(spec|test)\.ts$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

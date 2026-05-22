import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ignoredDirectories = new Set([
  "dist",
  "node_modules",
]);

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : ["."];
const testFiles = targets.flatMap((target) => expandTarget(target));
const perFileTimeoutMs = Number(process.env.TEST_FILE_TIMEOUT_MS ?? 60_000);

if (testFiles.length === 0) {
  console.error(`No test files found for: ${targets.join(", ")}`);
  process.exit(1);
}

for (const testFile of testFiles) {
  const command = resolveTestCommand([testFile], testFile.endsWith(".ts"));
  const status = await runCommand(command, testFile);

  if (status !== 0) {
    process.exit(status);
  }
}

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
      if (entry.startsWith(".") || ignoredDirectories.has(entry)) {
        continue;
      }

      files.push(...collectTests(fullPath));
      continue;
    }

    if (/\.(spec|test)\.ts$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function resolveTestCommand(testFiles, hasTypeScriptTests) {
  const runtime = findNodeRuntime(18);

  if (hasTypeScriptTests) {
    const tsxPackage = join(process.cwd(), "node_modules", "tsx");

    if (!existsSync(tsxPackage)) {
      console.error("Unable to find tsx at node_modules/tsx");
      process.exit(1);
    }

    return {
      runtime,
      args: [
        ...resolveTsxRuntimeArgs(runtime),
        "--test",
        ...testFiles,
      ],
    };
  }

  return {
    runtime,
    args: [
      "--test",
      ...testFiles,
    ],
  };
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const whereNode = spawnSync("where", ["node"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (whereNode.status === 0) {
    for (const line of whereNode.stdout.split(/\r?\n/)) {
      addCandidate(line.trim());
    }
  }

  for (const candidate of candidates) {
    const version = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
    });

    if (version.status !== 0) {
      continue;
    }

    const match = version.stdout.trim().match(/^v(\d+)\./);
    if (match && Number(match[1]) >= minMajor) {
      return candidate;
    }
  }

  console.error(`Unable to find a Node.js runtime >= ${minMajor}.`);
  process.exit(1);

  function addCandidate(candidate) {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }
}

function resolveTsxRuntimeArgs(runtime) {
  const version = spawnSync(runtime, ["--version"], {
    encoding: "utf8",
  });

  if (version.status !== 0) {
    return ["--loader", "tsx"];
  }

  const match = version.stdout.trim().match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return ["--loader", "tsx"];
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major > 18 || (major === 18 && minor >= 19)) {
    return ["--import", "tsx"];
  }

  return ["--loader", "tsx"];
}

function runCommand(command, testFile) {
  return new Promise((resolve) => {
    const child = spawn(command.runtime, command.args, {
      stdio: "inherit",
    });
    let settled = false;
    let killTimer;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      console.error(
        `Test file timed out after ${perFileTimeoutMs}ms: ${testFile} (pid ${child.pid})`,
      );
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 2_000);
    }, perFileTimeoutMs);

    child.on("close", (code, signal) => {
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      if (signal) {
        resolve(signal === "SIGTERM" || signal === "SIGKILL" ? 124 : 1);
        return;
      }

      resolve(code ?? 1);
    });

    child.on("error", () => {
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      resolve(1);
    });
  });
}

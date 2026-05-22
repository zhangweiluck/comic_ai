import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("test runner", () => {
  it("loads tsx with --import for modern Node runtimes", async () => {
    const runner = await readFile(
      new URL("../../../../../scripts/run-tests.mjs", import.meta.url),
      "utf8",
    );

    assert.match(runner, /"--import",\s*"tsx"/);
    assert.doesNotMatch(runner, /"--loader",\s*"tsx"/);
  });

  it("does not enable shell when locating the Node runtime", async () => {
    const runner = await readFile(
      new URL("../../../../../scripts/run-tests.mjs", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(runner, /shell:\s*process\.platform/);
    assert.doesNotMatch(runner, /shell:\s*true/);
    assert.match(runner, /process\.platform === "win32"\s*\?\s*"where\.exe"\s*:\s*"which"/);
  });
});

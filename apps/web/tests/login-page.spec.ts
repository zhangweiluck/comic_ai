import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("login page shell", () => {
  it("contains phone and code steps", async () => {
    const html = await readFile(new URL("../login.html", import.meta.url), "utf8");

    assert.match(html, /id="login-form"/);
    assert.match(html, /request-code-button/);
    assert.match(html, /verify-button/);
  });

  it("includes a creator workspace shell", async () => {
    const html = await readFile(new URL("../app.html", import.meta.url), "utf8");

    assert.match(html, /Comic AI Studio/);
    assert.match(html, /id="creator-app"/);
    assert.match(html, /production-workbench\.css/);
  });

  it("renders production workbench controls and Chinese copy", async () => {
    const js = await readFile(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /set-nav-tab/);
    assert.match(js, /home: "首页"/);
    assert.match(js, /script: "剧本"/);
    assert.match(js, /project: "项目"/);
  });
});

describe("login page client flow", () => {
  it("calls the auth endpoints and includes a development debug panel", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(js, /\/api\/auth\/code\/request/);
    assert.match(js, /\/api\/auth\/code\/verify/);
    assert.match(js, /\/api\/auth\/session/);
    assert.match(js, /\/api\/auth\/dev\/challenges\//);
    assert.match(js, /debug-panel/);
    assert.match(js, /\/app\.html/);
  });

  it("wires the creator workspace to the mock creator APIs", async () => {
    const js = await readFile(
      new URL("../src/shared/creator-api.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /\/api\/creator\/project\/create/);
    assert.match(js, /\/api\/creator\/parse/);
    assert.match(js, /\/api\/creator\/assets\/confirm-all/);
    assert.match(js, /\/api\/creator\/calibration\/run/);
    assert.match(js, /\/api\/creator\/images\/generate/);
    assert.match(js, /\/api\/creator\/videos\/generate/);
    assert.match(js, /\/api\/creator\/export\/preview/);
  });
});

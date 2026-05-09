import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("login page shell", () => {
  it("contains phone and code steps", async () => {
    const html = await readFile(new URL("../login.html", import.meta.url), "utf8");

    assert.match(html, /手机号登录/);
    assert.match(html, /验证码/);
    assert.match(html, /id="login-form"/);
  });

  it("includes an authenticated placeholder page", async () => {
    const html = await readFile(new URL("../app.html", import.meta.url), "utf8");

    assert.match(html, /已登录/);
    assert.match(html, /退出登录/);
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
});

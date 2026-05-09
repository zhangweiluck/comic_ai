import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";

import {
  createPhoneAuthDevServer,
  type PhoneAuthDevServer,
} from "../phone-auth-dev-server.ts";

let server: PhoneAuthDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("phone auth dev server", () => {
  it("serves the login page and static assets", async () => {
    server = createPhoneAuthDevServer();
    await server.listen(0);

    const response = await fetch(`${server.origin}/login.html`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /手机号登录/);
  });

  it("supports the full request -> debug -> verify -> session flow", async () => {
    server = createPhoneAuthDevServer();
    await server.listen(0);

    const requestResponse = await fetch(`${server.origin}/api/auth/code/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "13800138000" }),
    });
    const requested = await requestResponse.json();

    const debugResponse = await fetch(
      `${server.origin}/api/auth/dev/challenges/${requested.challengeId}`,
    );
    const debug = await debugResponse.json();

    const verifyResponse = await fetch(`${server.origin}/api/auth/code/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: requested.challengeId,
        phone: "13800138000",
        code: debug.code,
      }),
    });
    const verifyPayload = await verifyResponse.json();
    const cookie = verifyResponse.headers.get("set-cookie") ?? "";

    const sessionResponse = await fetch(`${server.origin}/api/auth/session`, {
      headers: {
        cookie,
      },
    });
    const sessionPayload = await sessionResponse.json();

    assert.equal(requestResponse.status, 200);
    assert.equal(debugResponse.status, 200);
    assert.equal(verifyResponse.status, 200);
    assert.equal(sessionResponse.status, 200);
    assert.equal(verifyPayload.user.phone, "+8613800138000");
    assert.equal(sessionPayload.authenticated, true);
  });

  it("exposes a package script for starting the dev server", async () => {
    const packageJson = await readFile(
      new URL("../../../../../package.json", import.meta.url),
      "utf8",
    );

    assert.match(packageJson, /"dev:phone-auth"/);
    assert.match(packageJson, /phone-auth-dev-server\.ts/);
  });
});

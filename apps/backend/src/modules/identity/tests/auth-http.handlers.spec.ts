import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAuthHandlers,
  createInMemoryAuthContext,
} from "../auth-http.handlers.ts";

describe("auth HTTP handlers", () => {
  it("returns challenge metadata for code request", async () => {
    const handlers = createAuthHandlers(createInMemoryAuthContext());
    const response = await handlers.requestCode({
      body: { phone: "13800138000" },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    assert.equal(response.status, 200);
    assert.equal(typeof response.body.challengeId, "string");
    assert.equal(response.body.maskedPhone, "138****8000");
  });

  it("verifies the code and sets a session cookie", async () => {
    const context = createInMemoryAuthContext();
    const handlers = createAuthHandlers(context);
    const requested = await handlers.requestCode({
      body: { phone: "13800138000" },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    const debug = await handlers.getDevChallenge({
      params: { challengeId: requested.body.challengeId },
    });

    const verified = await handlers.verifyCode({
      body: {
        challengeId: requested.body.challengeId,
        phone: "13800138000",
        code: debug.body.code,
      },
      now: new Date("2026-05-09T10:01:00.000Z"),
    });

    assert.equal(verified.status, 200);
    assert.equal(verified.body.user.phone, "+8613800138000");
    assert.equal(verified.cookies?.some((cookie) => cookie.includes("HttpOnly")), true);
  });

  it("returns the current session from a session token", async () => {
    const context = createInMemoryAuthContext();
    const handlers = createAuthHandlers(context);
    const requested = await handlers.requestCode({
      body: { phone: "13800138000" },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    const debug = await handlers.getDevChallenge({
      params: { challengeId: requested.body.challengeId },
    });
    const verified = await handlers.verifyCode({
      body: {
        challengeId: requested.body.challengeId,
        phone: "13800138000",
        code: debug.body.code,
      },
      now: new Date("2026-05-09T10:01:00.000Z"),
    });

    const token = verified.cookies?.[0]?.match(/^auth_session=([^;]+)/)?.[1] ?? "";
    const session = await handlers.getSession({
      cookies: { auth_session: token },
      now: new Date("2026-05-09T10:02:00.000Z"),
    });

    assert.equal(session.status, 200);
    assert.equal(session.body.authenticated, true);
  });

  it("hides the dev challenge endpoint when debug mode is disabled", async () => {
    const handlers = createAuthHandlers(
      createInMemoryAuthContext({ debugMode: false }),
    );

    const response = await handlers.getDevChallenge({
      params: { challengeId: "missing" },
    });

    assert.equal(response.status, 404);
  });
});

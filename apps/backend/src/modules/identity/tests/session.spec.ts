import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAuthSession,
  revokeAuthSession,
  verifySessionToken,
} from "../session.service.ts";

describe("auth sessions", () => {
  it("stores only a hash for the issued token", async () => {
    const created = await createAuthSession({
      userId: "user_1",
      now: new Date("2026-05-09T10:00:00.000Z"),
      token: "plain-token",
    });

    assert.notEqual(created.session.sessionTokenHash, "plain-token");
    assert.equal(verifySessionToken(created.session, "plain-token"), true);
  });

  it("rejects revoked sessions", async () => {
    const created = await createAuthSession({
      userId: "user_1",
      now: new Date("2026-05-09T10:00:00.000Z"),
      token: "plain-token",
    });

    const revoked = revokeAuthSession(
      created.session,
      new Date("2026-05-09T10:05:00.000Z"),
    );
    assert.equal(verifySessionToken(revoked, "plain-token"), false);
  });

  it("rejects expired sessions", async () => {
    const created = await createAuthSession({
      userId: "user_1",
      now: new Date("2026-05-09T10:00:00.000Z"),
      token: "plain-token",
      ttlMs: 60 * 1000,
    });

    assert.equal(
      verifySessionToken(
        created.session,
        "plain-token",
        new Date("2026-05-09T10:02:00.000Z"),
      ),
      false,
    );
  });
});

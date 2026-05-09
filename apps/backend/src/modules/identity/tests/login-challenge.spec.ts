import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createLoginChallenge,
  verifyLoginChallengeCode,
} from "../login-challenge.service.ts";

describe("login challenge schema assumptions", () => {
  it("adds phone auth tables and relaxed user email requirement to the foundation migration", async () => {
    const sql = await readFile(
      new URL(
        "../../../../../../packages/db/migrations/0001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE login_challenges \(/);
    assert.match(sql, /CREATE TABLE auth_sessions \(/);
    assert.match(sql, /phone_e164 text UNIQUE NULL/);
    assert.doesNotMatch(sql, /email text NOT NULL UNIQUE/);
  });
});

describe("login challenges", () => {
  it("normalizes mainland phones to +86", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    assert.equal(challenge.phoneE164, "+8613800138000");
    assert.equal(challenge.status, "issued");
  });

  it("stores only a hash and verifies a valid code", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
      code: "123456",
    });

    assert.notEqual(challenge.codeHash, "123456");
    assert.equal(
      verifyLoginChallengeCode({
        challenge,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      }).kind,
      "verified",
    );
  });

  it("locks the challenge after too many invalid attempts", async () => {
    const challenge = await createLoginChallenge({
      phone: "13800138000",
      now: new Date("2026-05-09T10:00:00.000Z"),
      code: "123456",
      maxAttempts: 2,
    });

    const firstFailure = verifyLoginChallengeCode({
      challenge,
      phone: "13800138000",
      code: "000000",
      now: new Date("2026-05-09T10:01:00.000Z"),
    });
    const secondFailure = verifyLoginChallengeCode({
      challenge: firstFailure.challenge,
      phone: "13800138000",
      code: "000000",
      now: new Date("2026-05-09T10:02:00.000Z"),
    });

    assert.equal(firstFailure.kind, "invalid_code");
    assert.equal(secondFailure.kind, "locked");
    assert.equal(secondFailure.challenge.status, "locked");
  });
});

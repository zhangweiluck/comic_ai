import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createPersistentLoginChallenge,
  findPersistentAuthSessionByToken,
  revokePersistentAuthSession,
  verifyPersistentLoginChallenge,
} from "../persistent-auth.service.ts";

describe("persistent phone auth", { concurrency: false }, () => {
  it("stores only challenge and session hashes while returning plaintext only to the caller", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const storedChallenge = await db.query<{
        code_hash: string;
        code_hash_version: number;
        phone_e164: string;
      }>(
        `
          SELECT code_hash, code_hash_version, phone_e164
          FROM login_challenges
          WHERE id = $1
        `,
        [challenge.challengeId],
      );

      assert.equal(challenge.plainCode, "123456");
      assert.equal(storedChallenge.rows[0]?.phone_e164, "+8613800138000");
      assert.equal(storedChallenge.rows[0]?.code_hash_version, 1);
      assert.notEqual(storedChallenge.rows[0]?.code_hash, "123456");

      const verified = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      assert.equal(verified.kind, "verified");
      assert.ok(verified.token);
      assert.ok(verified.session);

      const storedSession = await db.query<{
        session_token_hash: string;
        session_token_hash_version: number;
      }>(
        `
          SELECT session_token_hash, session_token_hash_version
          FROM auth_sessions
          WHERE id = $1
        `,
        [verified.session?.id],
      );

      assert.equal(storedSession.rows[0]?.session_token_hash_version, 1);
      assert.notEqual(storedSession.rows[0]?.session_token_hash, verified.token);
      assert.ok(
        await findPersistentAuthSessionByToken(db, {
          token: verified.token ?? "",
          now: new Date("2026-05-09T10:02:00.000Z"),
        }),
      );
    } finally {
      await db.close();
    }
  });

  it("consumes each challenge at most once", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const first = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });
      const second = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:02:00.000Z"),
      });

      assert.equal(first.kind, "verified");
      assert.equal(second.kind, "consumed");
    } finally {
      await db.close();
    }
  });

  it("creates only one session when the same challenge is verified concurrently", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const results = await Promise.all([
        verifyPersistentLoginChallenge(db, {
          challengeId: challenge.challengeId,
          phone: "13800138000",
          code: "123456",
          now: new Date("2026-05-09T10:01:00.000Z"),
        }),
        verifyPersistentLoginChallenge(db, {
          challengeId: challenge.challengeId,
          phone: "13800138000",
          code: "123456",
          now: new Date("2026-05-09T10:01:00.000Z"),
        }),
      ]);
      const sessions = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM auth_sessions",
      );

      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["consumed", "verified"],
      );
      assert.equal(sessions.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("rejects disabled users before creating a session", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'disabled')
        `,
      );
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });

      const result = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });
      const sessions = await db.query("SELECT id FROM auth_sessions");

      assert.equal(result.kind, "user_disabled");
      assert.equal(sessions.rows.length, 0);
    } finally {
      await db.close();
    }
  });

  it("revokes server-side sessions", async () => {
    const db = await createMigratedTestDb();
    try {
      const challenge = await createPersistentLoginChallenge(db, {
        phone: "13800138000",
        now: new Date("2026-05-09T10:00:00.000Z"),
        code: "123456",
      });
      const verified = await verifyPersistentLoginChallenge(db, {
        challengeId: challenge.challengeId,
        phone: "13800138000",
        code: "123456",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      await revokePersistentAuthSession(db, {
        token: verified.token ?? "",
        now: new Date("2026-05-09T10:02:00.000Z"),
      });

      assert.equal(
        await findPersistentAuthSessionByToken(db, {
          token: verified.token ?? "",
          now: new Date("2026-05-09T10:03:00.000Z"),
        }),
        undefined,
      );
    } finally {
      await db.close();
    }
  });
});

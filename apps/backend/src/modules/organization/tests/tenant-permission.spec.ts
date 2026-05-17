import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  assertCapability,
  AuthorizationError,
  resolveActorContext,
} from "../actor-context.service.ts";

describe("tenant permissions", { concurrency: false }, () => {
  it("rejects a viewer before write-capability commands run", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTwoOrganizations(db, "viewer");
      const session = await seedSession(db, "00000000-0000-4000-8000-000000000001");

      const actor = await resolveActorContext(db, {
        sessionToken: session.token,
        workspaceId: "20000000-0000-4000-8000-000000000001",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      assert.throws(
        () => assertCapability(actor, capabilities.projectEdit),
        errorWithCode("capability_missing"),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects cross-organization workspace access", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTwoOrganizations(db, "creator");
      const session = await seedSession(db, "00000000-0000-4000-8000-000000000001");

      await assert.rejects(
        resolveActorContext(db, {
          sessionToken: session.token,
          workspaceId: "20000000-0000-4000-8000-000000000002",
          capability: capabilities.projectCreate,
          now: new Date("2026-05-09T10:01:00.000Z"),
        }),
        errorWithCode("membership_missing"),
      );
    } finally {
      await db.close();
    }
  });
});

async function seedTwoOrganizations(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  role: "creator" | "viewer",
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES
        ('10000000-0000-4000-8000-000000000001', 'Org One', 'active'),
        ('10000000-0000-4000-8000-000000000002', 'Org Two', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES
        (
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'Workspace One',
          'active'
        ),
        (
          '20000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000002',
          'Workspace Two',
          'active'
        )
    `,
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        $1,
        'active'
      )
    `,
    [role],
  );
}

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  userId: string,
) {
  const session = await createAuthSession({
    userId,
    token: "session-token",
    now: new Date("2026-05-09T10:00:00.000Z"),
  });

  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-05-09T10:00:00.000Z"),
    ],
  );

  return session;
}

function errorWithCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof AuthorizationError);
    assert.equal(error.code, code);
    return true;
  };
}

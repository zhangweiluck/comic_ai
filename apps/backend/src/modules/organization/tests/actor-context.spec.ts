import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createAuthSession } from "../../identity/session.service.ts";
import {
  AuthorizationError,
  resolveActorContext,
} from "../actor-context.service.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("actor context", { concurrency: false }, () => {
  it("resolves capabilities from an active workspace membership", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTenant(db, { role: "creator" });
      const session = await seedSession(db, userId, "session-token");

      const actor = await resolveActorContext(db, {
        sessionToken: session.token,
        workspaceId,
        capability: capabilities.projectCreate,
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      assert.equal(actor.actorId, userId);
      assert.equal(actor.organizationId, organizationId);
      assert.equal(actor.workspaceId, workspaceId);
      assert.ok(actor.capabilities.includes(capabilities.projectCreate));
    } finally {
      await db.close();
    }
  });

  it("rejects disabled users before domain writes", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTenant(db, { userStatus: "disabled", role: "creator" });
      const session = await seedSession(db, userId, "session-token");

      await assert.rejects(
        resolveActorContext(db, {
          sessionToken: session.token,
          workspaceId,
          capability: capabilities.projectCreate,
          now: new Date("2026-05-09T10:01:00.000Z"),
        }),
        errorWithCode("user_disabled"),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects suspended organizations and missing memberships", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTenant(db, { organizationStatus: "suspended", role: "creator" });
      const session = await seedSession(db, userId, "session-token");

      await assert.rejects(
        resolveActorContext(db, {
          sessionToken: session.token,
          workspaceId,
          capability: capabilities.projectCreate,
          now: new Date("2026-05-09T10:01:00.000Z"),
        }),
        errorWithCode("organization_not_active"),
      );
      await db.query("UPDATE organizations SET status = 'active'");
      await db.query("DELETE FROM memberships");

      await assert.rejects(
        resolveActorContext(db, {
          sessionToken: session.token,
          workspaceId,
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

async function seedTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    userStatus?: "active" | "disabled";
    organizationStatus?: "active" | "suspended" | "archived";
    workspaceStatus?: "active" | "archived";
    role: "owner_admin" | "producer" | "creator" | "viewer";
  },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($2, '+8613800138000', $1)
    `,
    [input.userStatus ?? "active", userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($2, 'Org', $1)
    `,
    [input.organizationStatus ?? "active", organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        $2,
        $3,
        'Workspace',
        $1
      )
    `,
    [input.workspaceStatus ?? "active", workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        $2,
        $3,
        $4,
        $1,
        'active'
      )
    `,
    [input.role, organizationId, workspaceId, userId],
  );
}

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  userId: string,
  token: string,
) {
  const session = await createAuthSession({
    userId,
    token,
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createSqlParseScriptCommandHandler,
  createSqlProjectCommandHandler,
} from "../sql-project.command.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("SQL project commands", { concurrency: false }, () => {
  it("creates a project through actor-context, idempotency, and audit", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "sql-command-session");
      const handleCreateProject = createSqlProjectCommandHandler({ db });

      const response = await handleCreateProject({
        auth: { sessionToken: session.token },
        body: {
          workspaceId,
          name: "SQL-backed project",
          scriptInput: "Episode 1: the real command runtime is online.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "sql-project-create-1",
        now: new Date("2026-05-18T09:00:00.000Z"),
      });
      const counts = await db.query<{
        project_count: number;
        script_count: number;
        audit_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects) AS project_count,
            (SELECT count(*)::int FROM scripts) AS script_count,
            (SELECT count(*)::int FROM audit_events WHERE event_type = 'project.created') AS audit_count
        `,
      );

      assert.equal(response.status, 200);
      assert.equal("project" in response.body, true);
      if ("project" in response.body) {
        assert.equal(response.body.project.phase, "script_input");
        assert.equal(response.body.script.status, "ready");
      }
      assert.deepEqual(counts.rows[0], {
        project_count: 1,
        script_count: 1,
        audit_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("creates a parse workflow through workflow-task and records audit", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "sql-command-session");
      const handleCreateProject = createSqlProjectCommandHandler({ db });
      const createResponse = await handleCreateProject({
        auth: { sessionToken: session.token },
        body: {
          workspaceId,
          name: "SQL-backed parse",
          scriptInput: "Episode 2: parse the city into real workflow tasks.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "sql-project-create-2",
        now: new Date("2026-05-18T09:05:00.000Z"),
      });

      assert.equal(createResponse.status, 200);
      assert.equal("project" in createResponse.body, true);
      if (!("project" in createResponse.body)) {
        throw new Error("project_creation_failed");
      }

      const handleParseScript = createSqlParseScriptCommandHandler({ db });
      const parseResponse = await handleParseScript({
        auth: { sessionToken: session.token },
        body: {
          projectId: createResponse.body.project.id,
          scriptId: createResponse.body.script.id,
        },
        idempotencyKey: "sql-project-parse-1",
        now: new Date("2026-05-18T09:06:00.000Z"),
      });
      const counts = await db.query<{
        workflow_count: number;
        task_count: number;
        audit_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows WHERE workflow_type = 'script.parse') AS workflow_count,
            (SELECT count(*)::int FROM tasks WHERE task_type = 'parse_script') AS task_count,
            (SELECT count(*)::int FROM audit_events WHERE event_type = 'script.parse_requested') AS audit_count
        `,
      );

      assert.equal(parseResponse.status, 202);
      assert.equal(parseResponse.body.taskStatus, "queued");
      assert.deepEqual(counts.rows[0], {
        workflow_count: 1,
        task_count: 1,
        audit_count: 1,
      });
    } finally {
      await db.close();
    }
  });
});

async function seedTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138000', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        $1,
        $2,
        $3,
        'creator',
        'active'
      )
    `,
    [organizationId, workspaceId, userId],
  );
}

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  seededUserId: string,
  token: string,
) {
  const session = await createAuthSession({
    userId: seededUserId,
    token,
    now: new Date("2026-05-18T08:59:00.000Z"),
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-05-18T08:59:00.000Z"),
    ],
  );
  return session;
}

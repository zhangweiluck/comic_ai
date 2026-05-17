import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../../packages/contracts/domain/capabilities.ts";
import { operationNames } from "../../../../../../../packages/contracts/domain/operation-names.ts";
import { AuditValidationError } from "../../../audit/audit.service.ts";
import { createMigratedTestDb } from "../../db/test-db.ts";
import { runIdempotentCommand } from "../platform-command-runtime.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";

describe("platform command runtime", { concurrency: false }, () => {
  it("commits business write, idempotency response, and audit atomically", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      let executeCount = 0;

      const first = await runIdempotentCommand({
        db,
        operationName: operationNames.projectCreate,
        capability: capabilities.projectCreate,
        idempotencyKey: "runtime-create-project",
        requestHash: "request-hash-1",
        now: new Date("2026-05-17T10:00:00.000Z"),
        resolveActor: async () => actor(),
        replay: async ({ idempotencyRecord }) => ({
          projectId: idempotencyRecord.responseResourceId!,
        }),
        execute: async () => {
          executeCount += 1;
          await insertProject(db, projectId);

          return {
            result: { projectId },
            responseResourceType: "project",
            responseResourceId: projectId,
            responseSnapshot: { projectId },
            audit: {
              eventType: "project.created",
              targetType: "project",
              targetId: projectId,
              workspaceId,
            },
          };
        },
      });
      const replay = await runIdempotentCommand({
        db,
        operationName: operationNames.projectCreate,
        capability: capabilities.projectCreate,
        idempotencyKey: "runtime-create-project",
        requestHash: "request-hash-1",
        now: new Date("2026-05-17T10:00:01.000Z"),
        resolveActor: async () => actor(),
        replay: async ({ idempotencyRecord }) => ({
          projectId: idempotencyRecord.responseResourceId!,
        }),
        execute: async () => {
          throw new Error("execute_should_not_run_on_replay");
        },
      });
      const counts = await db.query<{
        project_count: number;
        idempotency_count: number;
        audit_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects) AS project_count,
            (SELECT count(*)::int FROM idempotency_records WHERE status = 'succeeded') AS idempotency_count,
            (SELECT count(*)::int FROM audit_events) AS audit_count
        `,
      );

      assert.equal(first.idempotencyResult, "created");
      assert.equal(replay.idempotencyResult, "replayed");
      assert.deepEqual(first.result, { projectId });
      assert.deepEqual(replay.result, { projectId });
      assert.equal(executeCount, 1);
      assert.deepEqual(counts.rows[0], {
        project_count: 1,
        idempotency_count: 1,
        audit_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("rolls back business and idempotency writes when audit append fails", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);

      await assert.rejects(
        runIdempotentCommand({
          db,
          operationName: operationNames.projectCreate,
          capability: capabilities.projectCreate,
          idempotencyKey: "runtime-audit-rollback",
          requestHash: "request-hash-2",
          now: new Date("2026-05-17T10:00:00.000Z"),
          resolveActor: async () => actor(),
          replay: async () => {
            throw new Error("replay_should_not_run");
          },
          execute: async () => {
            await insertProject(db, projectId);

            return {
              result: { projectId },
              responseResourceType: "project",
              responseResourceId: projectId,
              responseSnapshot: { projectId },
              audit: {
                eventType: "project.created",
                targetType: "project",
                targetId: projectId,
                workspaceId,
                sensitive: true,
              },
            };
          },
        }),
        AuditValidationError,
      );
      const counts = await db.query<{
        project_count: number;
        idempotency_count: number;
        audit_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM projects) AS project_count,
            (SELECT count(*)::int FROM idempotency_records) AS idempotency_count,
            (SELECT count(*)::int FROM audit_events) AS audit_count
        `,
      );

      assert.deepEqual(counts.rows[0], {
        project_count: 0,
        idempotency_count: 0,
        audit_count: 0,
      });
    } finally {
      await db.close();
    }
  });
});

function actor() {
  return {
    actorId: userId,
    organizationId,
    workspaceId,
    role: "creator" as const,
    capabilities: [capabilities.projectCreate],
  };
}

async function seedScope(
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
}

async function insertProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  id: string,
) {
  await db.query(
    `
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id
      )
      VALUES ($1, $2, $3, 'Runtime Project', '9:16', '1080p', 'script_input', $4)
    `,
    [id, organizationId, workspaceId, userId],
  );
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  claimQueuedTask,
  createWorkflowWithTasks,
  finalizeTaskAttempt,
} from "../workflow-task.service.ts";

describe("workflow task finalization", { concurrency: false }, () => {
  it("rolls back task and attempt state when local finalization fails", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTenant(db);
      const created = await createWorkflowWithTasks(db, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        workspaceId: "20000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "script_parse",
        inputSnapshot: {},
        tasks: [
          {
            taskType: "parse_script",
            queueName: "workflow-control",
            targetEntityType: "script",
            targetEntityId: "50000000-0000-4000-8000-000000000001",
            inputSnapshot: {},
          },
        ],
      });
      const claimed = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });

      await assert.rejects(
        finalizeTaskAttempt(db, {
          taskId: claimed!.task.id,
          attemptId: claimed!.attempt.id,
          status: "succeeded",
          now: new Date("2026-05-09T10:01:00.000Z"),
          finalize: async () => {
            throw new Error("business_finalization_failed");
          },
        }),
        /business_finalization_failed/,
      );

      const task = await db.query<{ status: string }>(
        "SELECT status FROM tasks WHERE id = $1",
        [claimed!.task.id],
      );
      const attempt = await db.query<{ status: string }>(
        "SELECT status FROM task_attempts WHERE id = $1",
        [claimed!.attempt.id],
      );

      assert.equal(task.rows[0]?.status, "running");
      assert.equal(attempt.rows[0]?.status, "running");
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
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Org', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Workspace',
        'active'
      )
    `,
  );
}

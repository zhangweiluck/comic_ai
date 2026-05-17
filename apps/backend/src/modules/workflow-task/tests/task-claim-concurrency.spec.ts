import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  claimQueuedTask,
  createWorkflowWithTasks,
} from "../workflow-task.service.ts";

describe("workflow task claiming", { concurrency: false }, () => {
  it("allows only one worker to claim a queued task", { timeout: 5000 }, async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTenant(db);
      const created = await createWorkflowWithTasks(db, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        workspaceId: "20000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "script_parse",
        inputSnapshot: { scriptId: "script_1" },
        tasks: [
          {
            taskType: "parse_script",
            queueName: "workflow-control",
            targetEntityType: "script",
            targetEntityId: "50000000-0000-4000-8000-000000000001",
            inputSnapshot: { scriptId: "script_1" },
          },
        ],
      });

      const first = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });
      const second = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-b",
        now: new Date("2026-05-09T10:00:01.000Z"),
        leaseMs: 60_000,
      });

      assert.equal(first?.task.status, "running");
      assert.equal(first?.attempt.attemptNumber, 1);
      assert.equal(second, undefined);
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

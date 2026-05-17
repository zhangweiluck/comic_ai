import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  createWorkflowWithTasks,
  finalizeTaskAttempt,
} from "../workflow-task.service.ts";

describe("workflow aggregation", { concurrency: false }, () => {
  it("keeps manual review and unknown results from aggregating to terminal success", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedTenant(db);
      const created = await createWorkflowWithTasks(db, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        workspaceId: "20000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "batch_image",
        inputSnapshot: {},
        tasks: [
          taskInput("50000000-0000-4000-8000-000000000001"),
          taskInput("50000000-0000-4000-8000-000000000002"),
        ],
      });
      const first = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });
      const second = await claimQueuedTask(db, {
        taskId: created.tasks[1]!.id,
        workerId: "worker-b",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });

      await finalizeTaskAttempt(db, {
        taskId: first!.task.id,
        attemptId: first!.attempt.id,
        status: "succeeded",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });
      await finalizeTaskAttempt(db, {
        taskId: second!.task.id,
        attemptId: second!.attempt.id,
        status: "manual_review_required",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      assert.equal(
        await aggregateWorkflowStatus(db, created.workflow.id),
        "manual_review_required",
      );

      await db.query(
        "UPDATE tasks SET status = 'result_unknown' WHERE id = $1",
        [second!.task.id],
      );
      assert.equal(
        await aggregateWorkflowStatus(db, created.workflow.id),
        "result_unknown",
      );
    } finally {
      await db.close();
    }
  });
});

function taskInput(targetEntityId: string) {
  return {
    taskType: "generate_image",
    queueName: "image-generation",
    targetEntityType: "shot",
    targetEntityId,
    inputSnapshot: {},
  };
}

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

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { repairQueuedTaskDispatch } from "../workflow-repair.service.ts";

describe("persistent queued task dispatch repair", () => {
  it("dispatches missing or stale queued tasks once in a small batch", async () => {
    const db = await createMigratedTestDb();
    const dispatched: string[] = [];

    try {
      await seedQueuedTasks(db);
      const first = await repairQueuedTaskDispatch(db, {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 2,
        dispatch: async (task) => {
          dispatched.push(task.id);
        },
      });
      const second = await repairQueuedTaskDispatch(db, {
        now: new Date("2026-05-09T10:00:30.000Z"),
        limit: 2,
        dispatch: async (task) => {
          dispatched.push(task.id);
        },
      });

      assert.deepEqual(
        first.dispatchedTaskIds,
        [
          "50000000-0000-4000-8000-000000000001",
          "50000000-0000-4000-8000-000000000002",
        ],
      );
      assert.deepEqual(second.dispatchedTaskIds, []);
      assert.deepEqual(dispatched, first.dispatchedTaskIds);
    } finally {
      await db.close();
    }
  });
});

async function seedQueuedTasks(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await seedTenantAndWorkflow(db);
  await db.query(
    `
      INSERT INTO tasks (
        id,
        organization_id,
        workspace_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        scheduled_at,
        last_dispatched_at,
        input_snapshot_json,
        target_entity_type,
        target_entity_id
      )
      VALUES
        (
          '50000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000001',
          'generate_image',
          'queued',
          'image-generation',
          '2026-05-09T09:59:00.000Z',
          NULL,
          '{}'::jsonb,
          'shot',
          '60000000-0000-4000-8000-000000000001'
        ),
        (
          '50000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000001',
          'generate_image',
          'queued',
          'image-generation',
          '2026-05-09T09:59:10.000Z',
          '2026-05-09T09:57:00.000Z',
          '{}'::jsonb,
          'shot',
          '60000000-0000-4000-8000-000000000002'
        ),
        (
          '50000000-0000-4000-8000-000000000003',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000001',
          'generate_image',
          'queued',
          'image-generation',
          '2026-05-09T09:59:20.000Z',
          '2026-05-09T09:59:30.000Z',
          '{}'::jsonb,
          'shot',
          '60000000-0000-4000-8000-000000000003'
        )
    `,
  );
}

async function seedTenantAndWorkflow(
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
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES (
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'image_generation',
        'queued',
        '{}'::jsonb
      )
    `,
  );
}

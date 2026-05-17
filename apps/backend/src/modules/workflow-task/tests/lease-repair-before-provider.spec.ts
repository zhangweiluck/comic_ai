import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { repairExpiredRunningTaskLeases } from "../workflow-repair.service.ts";
import { seedTenantWorkflowTaskAndAttempt } from "./workflow-repair-fixtures.ts";

describe("running task lease repair before provider submission", () => {
  it("requeues expired running tasks whose provider submission has not started", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedRunningTask(db);
      const repaired = await repairExpiredRunningTaskLeases(db, {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 10,
      });
      const task = await db.query<{
        status: string;
        locked_by: string | null;
        locked_until: Date | null;
        current_attempt_id: string | null;
      }>("SELECT status, locked_by, locked_until, current_attempt_id FROM tasks WHERE id = $1", [
        "50000000-0000-4000-8000-000000000001",
      ]);
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = $1",
        ["70000000-0000-4000-8000-000000000001"],
      );

      assert.deepEqual(repaired.requeuedTaskIds, [
        "50000000-0000-4000-8000-000000000001",
      ]);
      assert.deepEqual(repaired.resultUnknownTaskIds, []);
      assert.equal(task.rows[0]?.status, "queued");
      assert.equal(task.rows[0]?.locked_by, null);
      assert.equal(task.rows[0]?.locked_until, null);
      assert.equal(task.rows[0]?.current_attempt_id, null);
      assert.equal(attempt.rows[0]?.status, "failed");
      assert.equal(attempt.rows[0]?.failure_code, "lease_expired_before_external_start");
    } finally {
      await db.close();
    }
  });
});

async function seedRunningTask(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await seedTenantWorkflowTaskAndAttempt(db);
}

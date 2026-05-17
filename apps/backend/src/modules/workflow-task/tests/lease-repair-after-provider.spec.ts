import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { repairExpiredRunningTaskLeases } from "../workflow-repair.service.ts";
import { seedTenantWorkflowTaskAndAttempt } from "./workflow-repair-fixtures.ts";

describe("running task lease repair after provider submission", () => {
  it("marks expired running tasks as result_unknown when provider submission may have side effects", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenantWorkflowTaskAndAttempt(db);
      await seedExternallyStartedProviderRequest(db);

      const repaired = await repairExpiredRunningTaskLeases(db, {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 10,
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        ["50000000-0000-4000-8000-000000000001"],
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = $1",
        ["70000000-0000-4000-8000-000000000001"],
      );
      const provider = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE id = $1",
        ["80000000-0000-4000-8000-000000000001"],
      );

      assert.deepEqual(repaired.requeuedTaskIds, []);
      assert.deepEqual(repaired.resultUnknownTaskIds, [
        "50000000-0000-4000-8000-000000000001",
      ]);
      assert.equal(task.rows[0]?.status, "result_unknown");
      assert.equal(task.rows[0]?.failure_code, "lease_expired_after_external_start");
      assert.equal(attempt.rows[0]?.status, "result_unknown");
      assert.equal(attempt.rows[0]?.failure_code, "lease_expired_after_external_start");
      assert.equal(provider.rows[0]?.status, "result_unknown");
      assert.equal(provider.rows[0]?.failure_code, "lease_expired_after_external_start");
    } finally {
      await db.close();
    }
  });
});

async function seedExternallyStartedProviderRequest(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO provider_requests (
        id,
        organization_id,
        workspace_id,
        workflow_id,
        task_id,
        attempt_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        external_submission_started_at,
        external_request_id
      )
      VALUES (
        '80000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000001',
        'mock-image',
        'shot.image.generate',
        'task-1:attempt-1',
        'request-hash',
        'payloads/task-1.json',
        'payload-hash',
        '{}'::jsonb,
        'submitted',
        '2026-05-09T09:58:30.000Z',
        'external-1'
      )
    `,
  );
}

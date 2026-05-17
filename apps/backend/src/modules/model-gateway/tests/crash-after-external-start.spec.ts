import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createOrReuseProviderRequest,
  markExternalSubmissionStarted,
  markProviderRequestResultUnknown,
} from "../provider-request.service.ts";

describe("provider request crash after external start", () => {
  it("marks ambiguous externally-started requests as result_unknown for repair/manual review", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createOrReuseProviderRequest(db, providerInput());
      await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: null,
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      const unknown = await markProviderRequestResultUnknown(db, {
        providerRequestId: prepared.request.id,
        failureCode: "worker_crashed_after_external_start",
        now: new Date("2026-05-09T10:05:00.000Z"),
      });

      assert.equal(unknown.status, "result_unknown");
      assert.equal(unknown.failureCode, "worker_crashed_after_external_start");
      assert.equal(
        unknown.externalSubmissionStartedAt?.toISOString(),
        "2026-05-09T10:01:00.000Z",
      );
    } finally {
      await db.close();
    }
  });
});

function providerInput() {
  return {
    organizationId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    projectId: null,
    providerName: "mock-image",
    providerOperation: "shot.image.generate",
    requestKey: "task-3:attempt-1",
    requestHash: "hash-3",
    payloadRef: "payloads/task-3.json",
    payloadHash: "payload-hash-3",
    redactedPayload: { prompt: "[redacted]" },
    createdByUserId: null,
    now: new Date("2026-05-09T10:00:00.000Z"),
  };
}

async function seedScope(
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

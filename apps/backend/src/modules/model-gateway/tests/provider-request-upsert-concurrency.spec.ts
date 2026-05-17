import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  ProviderRequestConflictError,
  createOrReuseProviderRequest,
} from "../provider-request.service.ts";

describe("provider request deterministic upsert", { concurrency: false }, () => {
  it("reuses the same request key under concurrent duplicate callers", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);

      const results = await Promise.all([
        createOrReuseProviderRequest(db, providerInput()),
        createOrReuseProviderRequest(db, providerInput()),
      ]);
      const count = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM provider_requests",
      );

      assert.equal(results[0]?.request.id, results[1]?.request.id);
      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["created", "reused"],
      );
      assert.equal(count.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("returns a deterministic conflict for the same key with a different payload", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      await createOrReuseProviderRequest(db, providerInput());

      await assert.rejects(
        createOrReuseProviderRequest(db, {
          ...providerInput(),
          payloadHash: "payload-hash-2",
        }),
        ProviderRequestConflictError,
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
    requestKey: "task-1:attempt-1",
    requestHash: "hash-1",
    payloadRef: "payloads/task-1.json",
    payloadHash: "payload-hash-1",
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

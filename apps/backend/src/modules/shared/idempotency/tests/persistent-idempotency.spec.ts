import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { operationNames } from "../../../../../../../packages/contracts/domain/operation-names.ts";
import { createMigratedTestDb } from "../../db/test-db.ts";
import {
  beginOrReplayCommand,
  IdempotencyConflictError,
} from "../idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../persistent-idempotency.store.ts";

describe("persistent idempotency records", () => {
  it("persists processing records and replays the same operation key without side effects", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedOrganizations(db);
      const store = new SqlIdempotencyRecordStore(db);

      const first = await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        operationName: operationNames.scriptParse,
        idempotencyKey: "parse-once",
        requestHash: "request-hash-1",
      });
      const duplicate = await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        operationName: operationNames.scriptParse,
        idempotencyKey: "parse-once",
        requestHash: "request-hash-1",
      });
      const rows = await db.query(
        "SELECT id FROM idempotency_records WHERE organization_id = $1 AND operation_name = $2",
        ["10000000-0000-4000-8000-000000000001", operationNames.scriptParse],
      );

      assert.equal(first.kind, "created");
      assert.equal(duplicate.kind, "processing");
      assert.equal(duplicate.record.id, first.record.id);
      assert.equal(rows.rows.length, 1);
    } finally {
      await db.close();
    }
  });

  it("returns completed resource metadata on replay after the operation succeeds", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedOrganizations(db);
      const store = new SqlIdempotencyRecordStore(db);

      await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        operationName: operationNames.exportCreate,
        idempotencyKey: "export-once",
        requestHash: "request-hash-2",
      });
      const completed = await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        operationName: operationNames.exportCreate,
        idempotencyKey: "export-once",
        requestHash: "request-hash-2",
        responseResourceType: "workflow",
        responseResourceId: "50000000-0000-4000-8000-000000000001",
      });
      const replay = await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        operationName: operationNames.exportCreate,
        idempotencyKey: "export-once",
        requestHash: "request-hash-2",
      });

      assert.equal(completed.kind, "replayed");
      assert.equal(completed.record.status, "succeeded");
      assert.equal(replay.kind, "replayed");
      assert.equal(replay.record.responseResourceType, "workflow");
      assert.equal(replay.record.responseResourceId, "50000000-0000-4000-8000-000000000001");
    } finally {
      await db.close();
    }
  });

  it("rejects same organization operation keys with different request hashes", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedOrganizations(db);
      const store = new SqlIdempotencyRecordStore(db);

      await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        operationName: operationNames.projectCreate,
        idempotencyKey: "create-project-once",
        requestHash: "request-hash-3",
      });

      await assert.rejects(
        beginOrReplayCommand(store, {
          organizationId: "10000000-0000-4000-8000-000000000001",
          operationName: operationNames.projectCreate,
          idempotencyKey: "create-project-once",
          requestHash: "different-request-hash",
        }),
        (error: unknown) => {
          assert.ok(error instanceof IdempotencyConflictError);
          assert.equal(error.code, "idempotency_conflict");
          return true;
        },
      );
    } finally {
      await db.close();
    }
  });

  it("scopes the same operation key independently per organization", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedOrganizations(db);
      const store = new SqlIdempotencyRecordStore(db);

      const firstOrg = await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        operationName: operationNames.projectCreate,
        idempotencyKey: "client-key",
        requestHash: "org-one-hash",
      });
      const secondOrg = await beginOrReplayCommand(store, {
        organizationId: "10000000-0000-4000-8000-000000000002",
        operationName: operationNames.projectCreate,
        idempotencyKey: "client-key",
        requestHash: "org-two-hash",
      });

      assert.equal(firstOrg.kind, "created");
      assert.equal(secondOrg.kind, "created");
      assert.notEqual(firstOrg.record.id, secondOrg.record.id);
    } finally {
      await db.close();
    }
  });

  it("returns deterministic processing replay for concurrent same-key callers", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedOrganizations(db);
      const store = new SqlIdempotencyRecordStore(db);

      const results = await Promise.all([
        beginOrReplayCommand(store, {
          organizationId: "10000000-0000-4000-8000-000000000001",
          operationName: operationNames.projectCreate,
          idempotencyKey: "concurrent-create",
          requestHash: "request-hash-concurrent",
        }),
        beginOrReplayCommand(store, {
          organizationId: "10000000-0000-4000-8000-000000000001",
          operationName: operationNames.projectCreate,
          idempotencyKey: "concurrent-create",
          requestHash: "request-hash-concurrent",
        }),
      ]);
      const rows = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM idempotency_records WHERE idempotency_key = 'concurrent-create'",
      );

      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["created", "processing"],
      );
      assert.equal(results[0]?.record.id, results[1]?.record.id);
      assert.equal(rows.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });
});

async function seedOrganizations(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES
        ('10000000-0000-4000-8000-000000000001', 'Org One', 'active'),
        ('10000000-0000-4000-8000-000000000002', 'Org Two', 'active')
    `,
  );
}

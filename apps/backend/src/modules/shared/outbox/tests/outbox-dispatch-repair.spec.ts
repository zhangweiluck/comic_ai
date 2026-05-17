import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../db/test-db.ts";
import { claimOutboxEventsForDispatch } from "../outbox-dispatch-repair.service.ts";

describe("persistent outbox dispatch repair", () => {
  it("claims available pending, failed, and stale processing events in a bounded batch", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOutboxEvents(db);
      const first = await claimOutboxEventsForDispatch(db, {
        now: new Date("2026-05-09T10:00:00.000Z"),
        limit: 3,
      });
      const second = await claimOutboxEventsForDispatch(db, {
        now: new Date("2026-05-09T10:00:30.000Z"),
        limit: 3,
      });

      assert.deepEqual(
        first.map((event) => event.id),
        [
          "90000000-0000-4000-8000-000000000001",
          "90000000-0000-4000-8000-000000000002",
          "90000000-0000-4000-8000-000000000003",
        ],
      );
      assert.deepEqual(second, []);
      assert.deepEqual(
        first.map((event) => event.status),
        ["processing", "processing", "processing"],
      );
    } finally {
      await db.close();
    }
  });
});

async function seedOutboxEvents(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        event_type,
        payload_json,
        status,
        available_at,
        updated_at
      )
      VALUES
        (
          '90000000-0000-4000-8000-000000000001',
          'task.succeeded',
          '{}'::jsonb,
          'pending',
          '2026-05-09T09:59:00.000Z',
          '2026-05-09T09:59:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000002',
          'task.failed',
          '{}'::jsonb,
          'failed',
          '2026-05-09T09:59:10.000Z',
          '2026-05-09T09:59:10.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000003',
          'task.succeeded',
          '{}'::jsonb,
          'processing',
          '2026-05-09T09:59:20.000Z',
          '2026-05-09T09:55:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000004',
          'task.succeeded',
          '{}'::jsonb,
          'processing',
          '2026-05-09T09:59:30.000Z',
          '2026-05-09T09:59:45.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000005',
          'task.succeeded',
          '{}'::jsonb,
          'pending',
          '2026-05-09T10:05:00.000Z',
          '2026-05-09T09:59:00.000Z'
        ),
        (
          '90000000-0000-4000-8000-000000000006',
          'task.succeeded',
          '{}'::jsonb,
          'processed',
          '2026-05-09T09:59:00.000Z',
          '2026-05-09T09:59:00.000Z'
        )
    `,
  );
}

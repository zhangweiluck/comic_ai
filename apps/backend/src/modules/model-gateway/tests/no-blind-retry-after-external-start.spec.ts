import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  markExternalSubmissionStarted,
  createOrReuseProviderRequest,
  submitProviderRequest,
} from "../provider-request.service.ts";
import type { ProviderAdapter } from "../provider-adapter.contract.ts";

describe("provider request no blind retry after external start", () => {
  it("does not call the provider again once external submission has started", async () => {
    const db = await createMigratedTestDb();
    const adapter = new FailingIfCalledProviderAdapter();

    try {
      await seedScope(db);
      const prepared = await createOrReuseProviderRequest(db, providerInput());
      await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "external-started",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      const retry = await submitProviderRequest(db, {
        ...providerInput(),
        adapter,
        now: new Date("2026-05-09T10:02:00.000Z"),
      });

      assert.equal(retry.kind, "already_started");
      assert.equal(retry.request.id, prepared.request.id);
      assert.equal(retry.request.externalRequestId, "external-started");
      assert.equal(adapter.calls, 0);
    } finally {
      await db.close();
    }
  });

  it("makes the external submission transition one-way", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createOrReuseProviderRequest(db, {
        ...providerInput(),
        requestKey: "task-transition:attempt-1",
        requestHash: "hash-transition",
        payloadHash: "payload-hash-transition",
        payloadRef: "payloads/task-transition.json",
      });
      const first = await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "external-first",
        now: new Date("2026-05-09T10:03:00.000Z"),
      });
      const second = await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "external-second",
        now: new Date("2026-05-09T10:04:00.000Z"),
      });

      assert.equal(first.externalRequestId, "external-first");
      assert.equal(second.externalRequestId, "external-first");
      assert.equal(
        second.externalSubmissionStartedAt?.toISOString(),
        "2026-05-09T10:03:00.000Z",
      );
    } finally {
      await db.close();
    }
  });
});

class FailingIfCalledProviderAdapter implements ProviderAdapter {
  calls = 0;

  async submit(): Promise<never> {
    this.calls += 1;
    throw new Error("provider_should_not_be_called");
  }
}

function providerInput() {
  return {
    organizationId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    projectId: null,
    providerName: "mock-image",
    providerOperation: "shot.image.generate",
    requestKey: "task-2:attempt-1",
    requestHash: "hash-2",
    payloadRef: "payloads/task-2.json",
    payloadHash: "payload-hash-2",
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  appendAuditEvent,
  AuditValidationError,
} from "../audit.service.ts";

describe("audit events", () => {
  it("appends immutable actor, scope, target, reason, and redacted metadata", { timeout: 5000 }, async () => {
    const db = await createMigratedTestDb();
    try {
      await seedScope(db);
      const event = await appendAuditEvent(db, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        workspaceId: "20000000-0000-4000-8000-000000000001",
        projectId: "40000000-0000-4000-8000-000000000001",
        actorUserId: "00000000-0000-4000-8000-000000000001",
        eventType: "calibration.skipped",
        targetType: "calibration_session",
        targetId: "50000000-0000-4000-8000-000000000001",
        reason: "Creator approved style risk for test run",
        sensitive: true,
        metadata: {
          phone: "+8613800138000",
          sessionToken: "plain-token",
          safeCount: 3,
        },
        occurredAt: new Date("2026-05-09T10:00:00.000Z"),
      });

      const stored = await db.query<{
        event_type: string;
        reason: string;
        metadata_json: { phone: string; sessionToken: string; safeCount: number };
      }>("SELECT event_type, reason, metadata_json FROM audit_events WHERE id = $1", [
        event.id,
      ]);

      assert.equal(stored.rows[0]?.event_type, "calibration.skipped");
      assert.equal(stored.rows[0]?.reason, "Creator approved style risk for test run");
      assert.deepEqual(stored.rows[0]?.metadata_json, {
        phone: "[redacted]",
        sessionToken: "[redacted]",
        safeCount: 3,
      });
    } finally {
      await db.close();
    }
  });

  it("rejects sensitive operations without a reason", { timeout: 5000 }, async () => {
    const db = await createMigratedTestDb();
    try {
      await seedScope(db);
      await assert.rejects(
        appendAuditEvent(db, {
          organizationId: "10000000-0000-4000-8000-000000000001",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          eventType: "ops.manual_settle_task",
          targetType: "task",
          targetId: "50000000-0000-4000-8000-000000000001",
          reason: "",
          sensitive: true,
          metadata: {},
          occurredAt: new Date("2026-05-09T10:00:00.000Z"),
        }),
        (error: unknown) => {
          assert.ok(error instanceof AuditValidationError);
          assert.equal(error.code, "reason_required");
          return true;
        },
      );
    } finally {
      await db.close();
    }
  });
});

async function seedScope(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'active')
    `,
  );
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
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id
      )
      VALUES (
        '40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'Project',
        '9:16',
        '1080p',
        'script_input',
        '00000000-0000-4000-8000-000000000001'
      )
    `,
  );
}

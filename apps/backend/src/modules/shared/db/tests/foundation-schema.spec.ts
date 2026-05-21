import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMigratedTestDb,
  listColumnNames,
  listTableNames,
} from "../test-db.ts";

describe("foundation schema", () => {
  it("executes the foundation migration in the integration test database", async () => {
    const db = await createMigratedTestDb();
    try {
      const tables = await listTableNames(db);

      for (const table of [
        "users",
        "login_challenges",
        "auth_sessions",
        "memberships",
        "audit_events",
        "workflows",
        "tasks",
        "task_attempts",
        "provider_requests",
        "export_records",
        "credit_reservations",
        "credit_reservation_allocations",
        "credit_ledger_entries",
        "storage_objects",
      ]) {
        assert.ok(tables.includes(table), `expected ${table} table`);
      }
    } finally {
      await db.close();
    }
  });

  it("models auth secrets as hashes rather than plaintext tokens", async () => {
    const db = await createMigratedTestDb();
    try {
      assert.deepEqual(await listColumnNames(db, "login_challenges"), [
        "id",
        "phone_e164",
        "code_hash",
        "code_hash_version",
        "status",
        "attempt_count",
        "max_attempts",
        "expires_at",
        "last_sent_at",
        "consumed_at",
        "revoked_at",
        "created_ip_hash",
        "created_user_agent_hash",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "auth_sessions"), [
        "id",
        "user_id",
        "status",
        "session_token_hash",
        "session_token_hash_version",
        "expires_at",
        "last_seen_at",
        "revoked_at",
        "created_at",
      ]);
    } finally {
      await db.close();
    }
  });

  it("enforces key platform uniqueness constraints", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO users (id, phone_e164, status)
          VALUES
            ('00000000-0000-4000-8000-000000000001', '+8613800138000', 'active'),
            ('00000000-0000-4000-8000-000000000002', '+8613800138001', 'active')
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
          INSERT INTO memberships (
            id,
            organization_id,
            workspace_id,
            user_id,
            role,
            status
          )
          VALUES (
            '30000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001',
            'creator',
            'active'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO memberships (
              id,
              organization_id,
              workspace_id,
              user_id,
              role,
              status
            )
            VALUES (
              '30000000-0000-4000-8000-000000000002',
              '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001',
              '00000000-0000-4000-8000-000000000001',
              'producer',
              'active'
            )
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("rejects cross-organization workspace and project relationships", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(
        `
          INSERT INTO organizations (id, name, status)
          VALUES
            ('10000000-0000-4000-8000-000000000001', 'Org One', 'active'),
            ('10000000-0000-4000-8000-000000000002', 'Org Two', 'active')
        `,
      );
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Workspace One',
            'active'
          )
        `,
      );

      await assert.rejects(
        db.query(
          `
            INSERT INTO projects (
              id,
              organization_id,
              workspace_id,
              name,
              aspect_ratio,
              resolution,
              phase
            )
            VALUES (
              '40000000-0000-4000-8000-000000000001',
              '10000000-0000-4000-8000-000000000002',
              '20000000-0000-4000-8000-000000000001',
              'Cross Org Project',
              '9:16',
              '1080p',
              'script_input'
            )
          `,
        ),
      );
    } finally {
      await db.close();
    }
  });
});

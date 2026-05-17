import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { AuthorizationError } from "../../organization/actor-context.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createScopedStorageObject,
  createSignedReadUrl,
  StorageAccessError,
  type StorageAdapter,
} from "../storage.service.ts";

describe("signed storage URLs", { concurrency: false }, () => {
  it("creates server-scoped object keys and signs URLs for same-tenant actors", async () => {
    const db = await createMigratedTestDb();
    const adapter = new DeterministicStorageAdapter();

    try {
      await seedTenants(db);
      const object = await createScopedStorageObject(db, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        workspaceId: "20000000-0000-4000-8000-000000000001",
        projectId: "40000000-0000-4000-8000-000000000001",
        bucket: "creator-assets",
        objectName: "../shot-01.png",
        contentType: "image/png",
        sizeBytes: 1024,
        metadata: { kind: "shot_image" },
        createdByUserId: "00000000-0000-4000-8000-000000000001",
        now: new Date("2026-05-09T10:00:00.000Z"),
      });

      assert.match(
        object.objectKey,
        /^organizations\/10000000-0000-4000-8000-000000000001\/workspaces\/20000000-0000-4000-8000-000000000001\/projects\/40000000-0000-4000-8000-000000000001\/[0-9a-f-]+\/shot-01\.png$/,
      );

      const signed = await createSignedReadUrl(db, {
        sessionToken: "owner-token",
        storageObjectId: object.id,
        adapter,
        now: new Date("2026-05-09T10:01:00.000Z"),
        expiresInSeconds: 60,
      });

      assert.equal(
        signed.url,
        `signed://creator-assets/${object.objectKey}?expires=2026-05-09T10:02:00.000Z`,
      );
      assert.equal(adapter.calls.length, 1);
    } finally {
      await db.close();
    }
  });

  it("rejects other-org users before creating a signed URL", async () => {
    const db = await createMigratedTestDb();
    const adapter = new DeterministicStorageAdapter();

    try {
      await seedTenants(db);
      const object = await createScopedStorageObject(db, {
        organizationId: "10000000-0000-4000-8000-000000000001",
        workspaceId: "20000000-0000-4000-8000-000000000001",
        projectId: "40000000-0000-4000-8000-000000000001",
        bucket: "creator-assets",
        objectName: "shot-01.png",
        contentType: "image/png",
        now: new Date("2026-05-09T10:00:00.000Z"),
      });

      await assert.rejects(
        createSignedReadUrl(db, {
          sessionToken: "other-token",
          storageObjectId: object.id,
          adapter,
          now: new Date("2026-05-09T10:01:00.000Z"),
          expiresInSeconds: 60,
        }),
        (error: unknown) => {
          assert.ok(error instanceof AuthorizationError);
          assert.equal(error.code, "membership_missing");
          return true;
        },
      );
      assert.equal(adapter.calls.length, 0);
    } finally {
      await db.close();
    }
  });

  it("rejects public URLs as object names", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenants(db);
      await assert.rejects(
        createScopedStorageObject(db, {
          organizationId: "10000000-0000-4000-8000-000000000001",
          workspaceId: "20000000-0000-4000-8000-000000000001",
          projectId: "40000000-0000-4000-8000-000000000001",
          bucket: "creator-assets",
          objectName: "https://example.test/shot-01.png",
          contentType: "image/png",
          now: new Date("2026-05-09T10:00:00.000Z"),
        }),
        (error: unknown) => {
          assert.ok(error instanceof StorageAccessError);
          assert.equal(error.code, "invalid_object_name");
          return true;
        },
      );
    } finally {
      await db.close();
    }
  });
});

class DeterministicStorageAdapter implements StorageAdapter {
  readonly calls: Array<{
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }> = [];

  async createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }) {
    this.calls.push(input);
    return {
      url: `signed://${input.bucket}/${input.objectKey}?expires=${input.expiresAt.toISOString()}`,
      expiresAt: input.expiresAt,
    };
  }
}

async function seedTenants(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
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
      VALUES
        ('10000000-0000-4000-8000-000000000001', 'Org One', 'active'),
        ('10000000-0000-4000-8000-000000000002', 'Org Two', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES
        (
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'Workspace One',
          'active'
        ),
        (
          '20000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000002',
          'Workspace Two',
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
      VALUES
        (
          '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '20000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000001',
          'owner_admin',
          'active'
        ),
        (
          '30000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000002',
          '20000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000002',
          'owner_admin',
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
        'Project One',
        '9:16',
        '1080p',
        'script_input',
        '00000000-0000-4000-8000-000000000001'
      )
    `,
  );

  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000001",
    token: "owner-token",
  });
  await insertSession(db, {
    userId: "00000000-0000-4000-8000-000000000002",
    token: "other-token",
  });
}

async function insertSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: { userId: string; token: string },
) {
  const created = await createAuthSession({
    userId: input.userId,
    token: input.token,
    now: new Date("2026-05-09T09:00:00.000Z"),
  });

  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      created.session.id,
      created.session.userId,
      created.session.status,
      created.session.sessionTokenHash,
      created.session.expiresAt,
      created.session.lastSeenAt,
      created.session.revokedAt,
      new Date("2026-05-09T09:00:00.000Z"),
    ],
  );
}

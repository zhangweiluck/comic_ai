import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createAssetVersionSnapshot,
  upsertAssetVersionSnapshot,
} from "../asset-version-record.service.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";
const assetId = "50000000-0000-4000-8000-000000000001";
const versionId = "60000000-0000-4000-8000-000000000001";

describe("asset version records", { concurrency: false }, () => {
  it("rejects conflicting writes for an existing asset version number", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);

      await upsertAssetVersionSnapshot(db, {
        asset: {
          id: assetId,
          organizationId,
          projectId,
          assetType: "shot_image",
          assetKey: "shot-1",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
          updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        version: {
          id: versionId,
          organizationId,
          assetId,
          versionNumber: 1,
          storageObjectKey: "generated/shot-1-v1.png",
          metadata: {
            mimeType: "image/png",
            width: 720,
            height: 1280,
          },
          sourceTaskId: "70000000-0000-4000-8000-000000000001",
          sourceAttemptId: "80000000-0000-4000-8000-000000000001",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        now: new Date("2026-05-18T10:00:00.000Z"),
      });

      await upsertAssetVersionSnapshot(db, {
        asset: {
          id: assetId,
          organizationId,
          projectId,
          assetType: "shot_image",
          assetKey: "shot-1",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
          updatedAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        version: {
          id: versionId,
          organizationId,
          assetId,
          versionNumber: 1,
          storageObjectKey: "generated/shot-1-v1.png",
          metadata: {
            mimeType: "image/png",
            width: 720,
            height: 1280,
          },
          sourceTaskId: "70000000-0000-4000-8000-000000000001",
          sourceAttemptId: "80000000-0000-4000-8000-000000000001",
          createdByUserId: userId,
          createdAt: new Date("2026-05-18T10:00:00.000Z"),
        },
        now: new Date("2026-05-18T10:01:00.000Z"),
      });

      await assert.rejects(
        () =>
          upsertAssetVersionSnapshot(db, {
            asset: {
              id: assetId,
              organizationId,
              projectId,
              assetType: "shot_image",
              assetKey: "shot-1",
              createdByUserId: userId,
              createdAt: new Date("2026-05-18T10:00:00.000Z"),
              updatedAt: new Date("2026-05-18T10:00:00.000Z"),
            },
            version: {
              id: "60000000-0000-4000-8000-000000000002",
              organizationId,
              assetId,
              versionNumber: 1,
              storageObjectKey: "generated/shot-1-conflict.png",
              metadata: {
                mimeType: "image/png",
                width: 720,
                height: 1280,
              },
              sourceTaskId: "70000000-0000-4000-8000-000000000002",
              sourceAttemptId: "80000000-0000-4000-8000-000000000002",
              createdByUserId: userId,
              createdAt: new Date("2026-05-18T10:02:00.000Z"),
            },
            now: new Date("2026-05-18T10:02:00.000Z"),
          }),
        /asset_version_conflict/,
      );

      const versions = await db.query<{
        version_number: number;
        storage_object_key: string;
      }>(
        "SELECT version_number, storage_object_key FROM asset_versions WHERE asset_id = $1",
        [assetId],
      );

      assert.deepEqual(versions.rows, [
        {
          version_number: 1,
          storage_object_key: "generated/shot-1-v1.png",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("allocates monotonically increasing version numbers for an asset", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProject(db);

      const first = await createAssetVersionSnapshot(db, {
        organizationId,
        projectId,
        assetType: "shot_image",
        assetKey: "shot-2",
        createdByUserId: userId,
        storageObjectKey: "generated/shot-2-v1.png",
        metadata: {
          mimeType: "image/png",
          width: 720,
          height: 1280,
        },
        sourceTaskId: "70000000-0000-4000-8000-000000000003",
        sourceAttemptId: "80000000-0000-4000-8000-000000000003",
        now: new Date("2026-05-18T11:00:00.000Z"),
      });
      const second = await createAssetVersionSnapshot(db, {
        organizationId,
        projectId,
        assetType: "shot_image",
        assetKey: "shot-2",
        createdByUserId: userId,
        storageObjectKey: "generated/shot-2-v2.png",
        metadata: {
          mimeType: "image/png",
          width: 720,
          height: 1280,
        },
        sourceTaskId: "70000000-0000-4000-8000-000000000004",
        sourceAttemptId: "80000000-0000-4000-8000-000000000004",
        now: new Date("2026-05-18T11:01:00.000Z"),
      });

      assert.equal(first.asset.id, second.asset.id);
      assert.equal(first.version.versionNumber, 1);
      assert.equal(second.version.versionNumber, 2);
      assert.notEqual(first.version.id, second.version.id);
    } finally {
      await db.close();
    }
  });
});

async function seedProject(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138000', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Asset Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Asset Workspace', 'active')
    `,
    [workspaceId, organizationId],
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
      VALUES ($1, $2, $3, 'Asset Version Project', '9:16', '1080p', 'shot_generation', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
}

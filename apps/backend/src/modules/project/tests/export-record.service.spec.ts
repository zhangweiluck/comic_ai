import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createExportRecord,
  findLatestExportRecordForProject,
  listExportRecordsForProject,
} from "../export-record.service.ts";

describe("export record service", { concurrency: false }, () => {
  it("persists export records and returns the latest one for a project", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      await createExportRecord(db, {
        organizationId: organizationId,
        workspaceId,
        projectId,
        workflowId: workflowIdOne,
        storageObjectId: storageObjectIdOne,
        manifestStatus: "partial",
        allowPartialExport: true,
        itemCount: 2,
        missingAssetCount: 1,
        latestSignedUrlExpiresAt: new Date("2026-05-18T11:00:00.000Z"),
        createdByUserId: userId,
        now: new Date("2026-05-18T10:45:00.000Z"),
      });
      const created = await createExportRecord(db, {
        organizationId: organizationId,
        workspaceId,
        projectId,
        workflowId: workflowIdTwo,
        storageObjectId: storageObjectIdTwo,
        manifestStatus: "ready",
        allowPartialExport: false,
        itemCount: 3,
        missingAssetCount: 0,
        latestSignedUrlExpiresAt: new Date("2026-05-18T11:10:00.000Z"),
        createdByUserId: userId,
        now: new Date("2026-05-18T10:50:00.000Z"),
      });

      const latest = await findLatestExportRecordForProject(db, {
        organizationId,
        projectId,
      });
      const listed = await listExportRecordsForProject(db, {
        organizationId,
        projectId,
      });

      assert.equal(latest?.id, created.id);
      assert.equal(latest?.manifestStatus, "ready");
      assert.equal(latest?.itemCount, 3);
      assert.equal(listed.length, 2);
      assert.equal(listed[0]?.workflowId, workflowIdTwo);
      assert.equal(listed[1]?.workflowId, workflowIdOne);
    } finally {
      await db.close();
    }
  });
});

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";
const workflowIdOne = "50000000-0000-4000-8000-000000000001";
const workflowIdTwo = "50000000-0000-4000-8000-000000000002";
const storageObjectIdOne = "60000000-0000-4000-8000-000000000001";
const storageObjectIdTwo = "60000000-0000-4000-8000-000000000002";

async function seedScope(
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
      VALUES ($1, 'Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Workspace', 'active')
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
      VALUES ($1, $2, $3, 'Project', '9:16', '1080p', 'export', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id
      )
      VALUES
        ($1, $3, $4, $5, 'export.create', 'succeeded', '{}'::jsonb, $2),
        ($6, $3, $4, $5, 'export.create', 'succeeded', '{}'::jsonb, $2)
    `,
    [workflowIdOne, userId, organizationId, workspaceId, projectId, workflowIdTwo],
  );
  await db.query(
    `
      INSERT INTO storage_objects (
        id,
        organization_id,
        workspace_id,
        project_id,
        bucket,
        object_key,
        content_type,
        metadata_json,
        created_by_user_id
      )
      VALUES
        ($1, $3, $4, $5, 'creator-dev', 'exports/one.json', 'application/json', '{}'::jsonb, $2),
        ($6, $3, $4, $5, 'creator-dev', 'exports/two.json', 'application/json', '{}'::jsonb, $2)
    `,
    [storageObjectIdOne, userId, organizationId, workspaceId, projectId, storageObjectIdTwo],
  );
}

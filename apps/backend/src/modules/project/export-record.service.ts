import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface ExportRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  workflowId: string;
  storageObjectId: string;
  manifestStatus: "ready" | "partial";
  allowPartialExport: boolean;
  itemCount: number;
  missingAssetCount: number;
  latestSignedUrlExpiresAt: Date;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ExportRecordRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string;
  workflow_id: string;
  storage_object_id: string;
  manifest_status: "ready" | "partial";
  allow_partial_export: boolean;
  item_count: number | string;
  missing_asset_count: number | string;
  latest_signed_url_expires_at: Date;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createExportRecord(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    projectId: string;
    workflowId: string;
    storageObjectId: string;
    manifestStatus: "ready" | "partial";
    allowPartialExport: boolean;
    itemCount: number;
    missingAssetCount: number;
    latestSignedUrlExpiresAt: Date;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<ExportRecord> {
  const row = await queryOne<ExportRecordRow>(
    db,
    `
      INSERT INTO export_records (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        storage_object_id,
        manifest_status,
        allow_partial_export,
        item_count,
        missing_asset_count,
        latest_signed_url_expires_at,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
      RETURNING *
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      input.projectId,
      input.workflowId,
      input.storageObjectId,
      input.manifestStatus,
      input.allowPartialExport,
      input.itemCount,
      input.missingAssetCount,
      input.latestSignedUrlExpiresAt,
      input.createdByUserId ?? null,
      input.now,
    ],
  );

  return exportRecordFromRow(row!);
}

export async function findLatestExportRecordForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
  },
): Promise<ExportRecord | undefined> {
  const row = await queryOne<ExportRecordRow>(
    db,
    `
      SELECT *
      FROM export_records
      WHERE organization_id = $1
        AND project_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.organizationId, input.projectId],
  );

  return row ? exportRecordFromRow(row) : undefined;
}

export async function listExportRecordsForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    limit?: number;
  },
): Promise<ExportRecord[]> {
  const result = await db.query<ExportRecordRow>(
    `
      SELECT *
      FROM export_records
      WHERE organization_id = $1
        AND project_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3
    `,
    [input.organizationId, input.projectId, input.limit ?? 20],
  );

  return result.rows.map(exportRecordFromRow);
}

function exportRecordFromRow(row: ExportRecordRow): ExportRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    workflowId: row.workflow_id,
    storageObjectId: row.storage_object_id,
    manifestStatus: row.manifest_status,
    allowPartialExport: row.allow_partial_export,
    itemCount: Number(row.item_count),
    missingAssetCount: Number(row.missing_asset_count),
    latestSignedUrlExpiresAt: row.latest_signed_url_expires_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

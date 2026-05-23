import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { AssetRecord, AssetType, AssetVersionRecord } from "./asset.service.ts";

interface AssetRow {
  id: string;
  organization_id: string;
  project_id: string;
  asset_type: AssetType;
  asset_key: string;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AssetVersionRow {
  id: string;
  organization_id: string;
  asset_id: string;
  version_number: number;
  storage_object_key: string;
  metadata_json: Record<string, unknown> | string;
  source_task_id: string | null;
  source_attempt_id: string | null;
  created_by_user_id: string | null;
  created_at: Date | string;
}

export class AssetVersionConflictError extends Error {
  constructor() {
    super("asset_version_conflict");
  }
}

export async function createAssetVersionSnapshot(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    assetType: AssetType;
    assetKey: string;
    createdByUserId: string;
    storageObjectKey: string;
    metadata: AssetVersionRecord["metadata"];
    sourceTaskId: string;
    sourceAttemptId: string;
    now: Date;
  },
): Promise<{
  asset: AssetRecord;
  version: AssetVersionRecord;
  now: Date;
}> {
  await db.query("BEGIN");
  try {
    const asset = await upsertAssetRow(db, {
      id: randomUUID(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      assetType: input.assetType,
      assetKey: input.assetKey,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
      updatedAt: input.now,
    });
    const nextVersion = await queryOne<{ version_number: number }>(
      db,
      `
        SELECT COALESCE(MAX(version_number), 0)::int + 1 AS version_number
        FROM asset_versions
        WHERE asset_id = $1
      `,
      [asset.id],
    );
    const version: AssetVersionRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      assetId: asset.id,
      versionNumber: nextVersion?.version_number ?? 1,
      storageObjectKey: input.storageObjectKey,
      metadata: input.metadata,
      sourceTaskId: input.sourceTaskId,
      sourceAttemptId: input.sourceAttemptId,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
    };

    const inserted = await insertAssetVersionRow(db, { version });
    if (!inserted) {
      throw new AssetVersionConflictError();
    }
    await db.query("COMMIT");
    return { asset, version, now: input.now };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function upsertAssetVersionSnapshot(
  db: SqlDatabase,
  input: {
    asset: AssetRecord;
    version: AssetVersionRecord;
    now: Date;
  },
): Promise<void> {
  const asset = await upsertAssetRow(db, input.asset);
  const inserted = await insertAssetVersionRow(db, {
    version: {
      ...input.version,
      assetId: asset.id,
    },
  });

  if (inserted) {
    return;
  }

  const existing = await queryOne<AssetVersionRow>(
    db,
    `
      SELECT *
      FROM asset_versions
      WHERE asset_id = $1
        AND version_number = $2
      LIMIT 1
    `,
    [asset.id, input.version.versionNumber],
  );

  if (!existing || !versionFactsMatch(existing, input.version)) {
    throw new AssetVersionConflictError();
  }
}

async function upsertAssetRow(
  db: SqlDatabase,
  asset: AssetRecord,
): Promise<AssetRecord> {
  const row = await queryOne<AssetRow>(
    db,
    `
      INSERT INTO assets (
        id,
        organization_id,
        project_id,
        asset_type,
        asset_key,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (organization_id, project_id, asset_type, asset_key) DO UPDATE
      SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      asset.id,
      asset.organizationId,
      asset.projectId,
      asset.assetType,
      asset.assetKey,
      asset.createdByUserId,
      asset.createdAt,
      asset.updatedAt,
    ],
  );

  return assetFromRow(row!);
}

async function insertAssetVersionRow(
  db: SqlDatabase,
  input: { version: AssetVersionRecord },
): Promise<AssetVersionRecord | null> {
  const row = await queryOne<AssetVersionRow>(
    db,
    `
      INSERT INTO asset_versions (
        id,
        organization_id,
        asset_id,
        version_number,
        storage_object_key,
        metadata_json,
        source_task_id,
        source_attempt_id,
        created_by_user_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
      ON CONFLICT (asset_id, version_number) DO NOTHING
      RETURNING *
    `,
    [
      input.version.id,
      input.version.organizationId,
      input.version.assetId,
      input.version.versionNumber,
      input.version.storageObjectKey,
      JSON.stringify(input.version.metadata),
      input.version.sourceTaskId,
      input.version.sourceAttemptId,
      input.version.createdByUserId,
      input.version.createdAt,
    ],
  );

  return row ? versionFromRow(row) : null;
}

function versionFactsMatch(
  row: AssetVersionRow,
  version: AssetVersionRecord,
): boolean {
  const metadata =
    typeof row.metadata_json === "string"
      ? (JSON.parse(row.metadata_json) as AssetVersionRecord["metadata"])
      : (row.metadata_json as AssetVersionRecord["metadata"]);
  return (
    row.storage_object_key === version.storageObjectKey &&
    metadata.mimeType === version.metadata.mimeType &&
    metadata.width === version.metadata.width &&
    metadata.height === version.metadata.height &&
    row.source_task_id === version.sourceTaskId &&
    row.source_attempt_id === version.sourceAttemptId
  );
}

function assetFromRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    assetType: row.asset_type,
    assetKey: row.asset_key,
    createdByUserId: row.created_by_user_id ?? "",
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function versionFromRow(row: AssetVersionRow): AssetVersionRecord {
  const metadata = JSON.parse(normalizeJson(row.metadata_json)) as AssetVersionRecord["metadata"];
  return {
    id: row.id,
    organizationId: row.organization_id,
    assetId: row.asset_id,
    versionNumber: row.version_number,
    storageObjectKey: row.storage_object_key,
    metadata,
    sourceTaskId: row.source_task_id ?? "",
    sourceAttemptId: row.source_attempt_id ?? "",
    createdByUserId: row.created_by_user_id ?? "",
    createdAt: new Date(row.created_at),
  };
}

function normalizeJson(value: Record<string, unknown> | string): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

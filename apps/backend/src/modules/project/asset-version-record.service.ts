import type { SqlDatabase } from "../shared/db/sql.ts";
import type { AssetRecord, AssetVersionRecord } from "./asset.service.ts";

export async function upsertAssetVersionSnapshot(
  db: SqlDatabase,
  input: {
    asset: AssetRecord;
    version: AssetVersionRecord;
    now: Date;
  },
): Promise<void> {
  const assetResult = await db.query<{ id: string }>(
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
      RETURNING id
    `,
    [
      input.asset.id,
      input.asset.organizationId,
      input.asset.projectId,
      input.asset.assetType,
      input.asset.assetKey,
      input.asset.createdByUserId,
      input.asset.createdAt,
      input.now,
    ],
  );

  const assetId = assetResult.rows[0]?.id ?? input.asset.id;
  await db.query(
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
      ON CONFLICT (asset_id, version_number) DO UPDATE
      SET storage_object_key = EXCLUDED.storage_object_key,
          metadata_json = EXCLUDED.metadata_json,
          source_task_id = EXCLUDED.source_task_id,
          source_attempt_id = EXCLUDED.source_attempt_id
    `,
    [
      input.version.id,
      input.version.organizationId,
      assetId,
      input.version.versionNumber,
      input.version.storageObjectKey,
      JSON.stringify(input.version.metadata),
      input.version.sourceTaskId,
      input.version.sourceAttemptId,
      input.version.createdByUserId,
      input.version.createdAt,
    ],
  );
}

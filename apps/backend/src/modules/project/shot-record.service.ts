import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import type { ShotRecord } from "./shot.service.ts";

interface ShotRow {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  content_revision: number;
  content_status: ShotRecord["contentStatus"];
  image_status: ShotRecord["imageStatus"];
  video_status: ShotRecord["videoStatus"];
  current_image_asset_version_id: string | null;
  active_image_task_id: string | null;
  active_image_revision: number | null;
  current_video_asset_version_id: string | null;
  active_video_task_id: string | null;
  active_video_image_asset_version_id: string | null;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function replaceShotsForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    createdByUserId: string;
    shots: ShotRecord[];
    now: Date;
  },
): Promise<ShotRecord[]> {
  await db.query(
    `
      DELETE FROM shots
      WHERE organization_id = $1
        AND project_id = $2
    `,
    [input.organizationId, input.projectId],
  );

  for (const shot of input.shots) {
    await insertOrUpdateShot(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      shot,
      now: input.now,
    });
  }

  return listShotsForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
}

export async function upsertShotsForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    createdByUserId: string;
    shots: ShotRecord[];
    now: Date;
  },
): Promise<ShotRecord[]> {
  for (const shot of input.shots) {
    await insertOrUpdateShot(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      shot,
      now: input.now,
    });
  }

  return listShotsForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
}

export async function listShotsForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
  },
): Promise<ShotRecord[]> {
  const result = await db.query<ShotRow>(
    `
      SELECT *
      FROM shots
      WHERE organization_id = $1
        AND project_id = $2
      ORDER BY created_at, id
    `,
    [input.organizationId, input.projectId],
  );

  return result.rows.map(shotFromRow);
}

export async function claimShotImageRetryForTask(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId: string;
    taskId: string;
    now: Date;
  },
): Promise<ShotRecord | undefined> {
  const result = await db.query<ShotRow>(
    `
      UPDATE shots
      SET image_status = 'generating',
          active_image_task_id = $4,
          active_image_revision = content_revision,
          updated_at = $5
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
        AND image_status IN ('failed', 'stale')
      RETURNING *
    `,
    [
      input.organizationId,
      input.projectId,
      input.shotId,
      input.taskId,
      input.now,
    ],
  );

  return result.rows[0] ? shotFromRow(result.rows[0]) : undefined;
}

export async function claimShotVideoRetryForTask(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId: string;
    taskId: string;
    now: Date;
  },
): Promise<ShotRecord | undefined> {
  const result = await db.query<ShotRow>(
    `
      UPDATE shots
      SET video_status = 'generating',
          active_video_task_id = $4,
          active_video_image_asset_version_id = current_image_asset_version_id,
          updated_at = $5
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
        AND video_status IN ('failed', 'stale')
        AND current_image_asset_version_id IS NOT NULL
      RETURNING *
    `,
    [
      input.organizationId,
      input.projectId,
      input.shotId,
      input.taskId,
      input.now,
    ],
  );

  return result.rows[0] ? shotFromRow(result.rows[0]) : undefined;
}

export async function releaseShotImageRetryClaim(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId: string;
    taskId: string;
    previousStatus: Extract<ShotRecord["imageStatus"], "failed" | "stale">;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `
      UPDATE shots
      SET image_status = $5,
          active_image_task_id = NULL,
          active_image_revision = NULL,
          updated_at = $6
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
        AND active_image_task_id = $4
        AND image_status = 'generating'
    `,
    [
      input.organizationId,
      input.projectId,
      input.shotId,
      input.taskId,
      input.previousStatus,
      input.now,
    ],
  );
}

export async function releaseShotVideoRetryClaim(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId: string;
    taskId: string;
    previousStatus: Extract<ShotRecord["videoStatus"], "failed" | "stale">;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `
      UPDATE shots
      SET video_status = $5,
          active_video_task_id = NULL,
          active_video_image_asset_version_id = NULL,
          updated_at = $6
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
        AND active_video_task_id = $4
        AND video_status = 'generating'
    `,
    [
      input.organizationId,
      input.projectId,
      input.shotId,
      input.taskId,
      input.previousStatus,
      input.now,
    ],
  );
}

async function insertOrUpdateShot(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    createdByUserId: string;
    shot: ShotRecord;
    now: Date;
  },
) {
  await db.query(
    `
      INSERT INTO shots (
        id,
        organization_id,
        project_id,
        title,
        content_revision,
        content_status,
        image_status,
        video_status,
        current_image_asset_version_id,
        active_image_task_id,
        active_image_revision,
        current_video_asset_version_id,
        active_video_task_id,
        active_video_image_asset_version_id,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16, $16
      )
      ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          content_revision = EXCLUDED.content_revision,
          content_status = EXCLUDED.content_status,
          image_status = EXCLUDED.image_status,
          video_status = EXCLUDED.video_status,
          current_image_asset_version_id = EXCLUDED.current_image_asset_version_id,
          active_image_task_id = EXCLUDED.active_image_task_id,
          active_image_revision = EXCLUDED.active_image_revision,
          current_video_asset_version_id = EXCLUDED.current_video_asset_version_id,
          active_video_task_id = EXCLUDED.active_video_task_id,
          active_video_image_asset_version_id = EXCLUDED.active_video_image_asset_version_id,
          updated_at = EXCLUDED.updated_at
    `,
    [
      input.shot.id,
      input.organizationId,
      input.projectId,
      input.shot.title,
      input.shot.contentRevision,
      input.shot.contentStatus,
      input.shot.imageStatus,
      input.shot.videoStatus,
      input.shot.currentImageAssetVersionId,
      input.shot.activeImageTaskId,
      input.shot.activeImageRevision,
      input.shot.currentVideoAssetVersionId,
      input.shot.activeVideoTaskId,
      input.shot.activeVideoImageAssetVersionId,
      input.shot.createdByUserId ?? input.createdByUserId,
      input.now,
    ],
  );
}

function shotFromRow(row: ShotRow): ShotRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    title: row.title,
    contentRevision: row.content_revision,
    contentStatus: row.content_status,
    imageStatus: row.image_status,
    videoStatus: row.video_status,
    currentImageAssetVersionId: row.current_image_asset_version_id,
    currentVideoAssetVersionId: row.current_video_asset_version_id,
    activeImageTaskId: row.active_image_task_id,
    activeImageRevision: row.active_image_revision,
    activeVideoTaskId: row.active_video_task_id,
    activeVideoImageAssetVersionId: row.active_video_image_asset_version_id,
    completedImageAssetVersionIds: row.current_image_asset_version_id
      ? [row.current_image_asset_version_id]
      : [],
    completedVideoAssetVersionIds: row.current_video_asset_version_id
      ? [row.current_video_asset_version_id]
      : [],
    createdByUserId: row.created_by_user_id ?? randomUUID(),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

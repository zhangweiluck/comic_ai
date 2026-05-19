import type { SqlDatabase } from "../shared/db/sql.ts";
import type {
  CalibrationDecisionRecord,
  CalibrationItemRecord,
  CalibrationSessionRecord,
} from "./calibration.service.ts";

interface CalibrationSessionRow {
  id: string;
  organization_id: string;
  project_id: string;
  status: CalibrationSessionRecord["status"];
  decision_type: CalibrationDecisionRecord["decisionType"] | null;
  decision_reason: string | null;
  decided_by_user_id: string | null;
  decided_at: Date | string | null;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CalibrationItemRow {
  id: string;
  organization_id: string;
  calibration_session_id: string;
  shot_id: string;
  status: CalibrationItemRecord["status"];
  quality_review_result: CalibrationItemRecord["qualityReviewResult"];
  created_at: Date | string;
  updated_at: Date | string;
}

export async function replaceCalibrationSessionForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    session: CalibrationSessionRecord;
    now: Date;
  },
): Promise<CalibrationSessionRecord> {
  const existing = await db.query<{ id: string }>(
    `
      SELECT id
      FROM calibration_sessions
      WHERE organization_id = $1
        AND project_id = $2
    `,
    [input.organizationId, input.projectId],
  );

  if (existing.rows.length > 0) {
    await db.query(
      `
        DELETE FROM calibration_items
        WHERE organization_id = $1
          AND calibration_session_id = ANY($2::uuid[])
      `,
      [input.organizationId, existing.rows.map((row) => row.id)],
    );
    await db.query(
      `
        DELETE FROM calibration_sessions
        WHERE organization_id = $1
          AND project_id = $2
      `,
      [input.organizationId, input.projectId],
    );
  }

  await db.query(
    `
      INSERT INTO calibration_sessions (
        id,
        organization_id,
        project_id,
        status,
        decision_type,
        decision_reason,
        decided_by_user_id,
        decided_at,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      input.session.id,
      input.organizationId,
      input.projectId,
      input.session.status,
      input.session.decision?.decisionType ?? null,
      input.session.decision?.reason ?? null,
      input.session.decision?.decidedByUserId ?? null,
      input.session.decision?.decidedAt ?? null,
      input.session.createdByUserId,
      input.session.createdAt,
      input.now,
    ],
  );

  for (const item of input.session.items) {
    await db.query(
      `
        INSERT INTO calibration_items (
          id,
          organization_id,
          calibration_session_id,
          shot_id,
          status,
          quality_review_result,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        item.id,
        input.organizationId,
        input.session.id,
        item.shotId,
        item.status,
        item.qualityReviewResult,
        input.session.createdAt,
        input.now,
      ],
    );
  }

  return getLatestCalibrationSessionForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  }) as Promise<CalibrationSessionRecord>;
}

export async function getLatestCalibrationSessionForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
  },
): Promise<CalibrationSessionRecord | null> {
  const session = await db.query<CalibrationSessionRow>(
    `
      SELECT *
      FROM calibration_sessions
      WHERE organization_id = $1
        AND project_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.organizationId, input.projectId],
  );

  const row = session.rows[0];
  if (!row) {
    return null;
  }

  const items = await db.query<CalibrationItemRow>(
    `
      SELECT *
      FROM calibration_items
      WHERE organization_id = $1
        AND calibration_session_id = $2
      ORDER BY created_at, id
    `,
    [input.organizationId, row.id],
  );

  return calibrationSessionFromRows(row, items.rows);
}

function calibrationSessionFromRows(
  session: CalibrationSessionRow,
  items: CalibrationItemRow[],
): CalibrationSessionRecord {
  return {
    id: session.id,
    organizationId: session.organization_id,
    projectId: session.project_id,
    status: session.status,
    items: items.map((item) => ({
      id: item.id,
      shotId: item.shot_id,
      status: item.status,
      qualityReviewResult: item.quality_review_result,
    })),
    decision:
      session.decision_type && session.decided_by_user_id && session.decided_at
        ? {
            id: `${session.id}:decision`,
            decisionType: session.decision_type,
            decidedByUserId: session.decided_by_user_id,
            reason: session.decision_reason,
            decidedAt: new Date(session.decided_at),
          }
        : null,
    createdByUserId: session.created_by_user_id ?? "unknown-user",
    createdAt: new Date(session.created_at),
    updatedAt: new Date(session.updated_at),
  };
}

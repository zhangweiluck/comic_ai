import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import type { AssetReviewGroup, AssetReviewState } from "./asset-review.service.ts";

interface AssetReviewCandidateRow {
  id: string;
  organization_id: string;
  project_id: string;
  candidate_group: AssetReviewGroup;
  asset_key: string;
  label: string;
  required: boolean;
  confirmed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AssetReviewCandidateRecord {
  id: string;
  organizationId: string;
  projectId: string;
  group: AssetReviewGroup;
  assetKey: string;
  label: string;
  required: boolean;
  confirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function replaceAssetReviewCandidatesForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    now: Date;
    candidates: Array<{
      group: AssetReviewGroup;
      assetKey: string;
      label: string;
      required: boolean;
    }>;
  },
): Promise<AssetReviewCandidateRecord[]> {
  await db.query(
    `
      DELETE FROM asset_review_candidates
      WHERE organization_id = $1
        AND project_id = $2
    `,
    [input.organizationId, input.projectId],
  );

  for (const candidate of input.candidates) {
    await db.query(
      `
        INSERT INTO asset_review_candidates (
          id,
          organization_id,
          project_id,
          candidate_group,
          asset_key,
          label,
          required,
          confirmed,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $8)
      `,
      [
        randomUUID(),
        input.organizationId,
        input.projectId,
        candidate.group,
        candidate.assetKey,
        candidate.label.trim(),
        candidate.required,
        input.now,
      ],
    );
  }

  return listAssetReviewCandidatesForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
}

export async function listAssetReviewCandidatesForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
  },
): Promise<AssetReviewCandidateRecord[]> {
  const result = await db.query<AssetReviewCandidateRow>(
    `
      SELECT *
      FROM asset_review_candidates
      WHERE organization_id = $1
        AND project_id = $2
      ORDER BY
        CASE candidate_group
          WHEN 'character' THEN 1
          WHEN 'scene' THEN 2
          ELSE 3
        END,
        created_at,
        id
    `,
    [input.organizationId, input.projectId],
  );

  return result.rows.map(assetReviewCandidateFromRow);
}

export async function confirmAllAssetReviewCandidateRecords(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    now: Date;
  },
): Promise<AssetReviewCandidateRecord[]> {
  await db.query(
    `
      UPDATE asset_review_candidates
      SET confirmed = true,
          updated_at = $3
      WHERE organization_id = $1
        AND project_id = $2
    `,
    [input.organizationId, input.projectId, input.now],
  );

  return listAssetReviewCandidatesForProject(db, input);
}

export async function confirmAssetReviewCandidateRecord(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    group: AssetReviewGroup;
    assetKey: string;
    now: Date;
  },
): Promise<AssetReviewCandidateRecord[]> {
  await db.query(
    `
      UPDATE asset_review_candidates
      SET confirmed = true,
          updated_at = $5
      WHERE organization_id = $1
        AND project_id = $2
        AND candidate_group = $3
        AND asset_key = $4
    `,
    [input.organizationId, input.projectId, input.group, input.assetKey, input.now],
  );

  return listAssetReviewCandidatesForProject(db, input);
}

export async function updateAssetReviewCandidateRecordLabel(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    group: AssetReviewGroup;
    assetKey: string;
    label: string;
    now: Date;
  },
): Promise<AssetReviewCandidateRecord[]> {
  await db.query(
    `
      UPDATE asset_review_candidates
      SET label = $5,
          updated_at = $6
      WHERE organization_id = $1
        AND project_id = $2
        AND candidate_group = $3
        AND asset_key = $4
    `,
    [
      input.organizationId,
      input.projectId,
      input.group,
      input.assetKey,
      input.label.trim(),
      input.now,
    ],
  );

  return listAssetReviewCandidatesForProject(db, input);
}

export function assetReviewStateFromRecords(
  records: AssetReviewCandidateRecord[],
): AssetReviewState {
  return {
    characters: records
      .filter((record) => record.group === "character")
      .map(recordToCandidate),
    scenes: records.filter((record) => record.group === "scene").map(recordToCandidate),
    props: records.filter((record) => record.group === "prop").map(recordToCandidate),
  };
}

function recordToCandidate(record: AssetReviewCandidateRecord) {
  return {
    assetKey: record.assetKey,
    label: record.label,
    required: record.required,
    confirmed: record.confirmed,
  };
}

function assetReviewCandidateFromRow(
  row: AssetReviewCandidateRow,
): AssetReviewCandidateRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    group: row.candidate_group,
    assetKey: row.asset_key,
    label: row.label,
    required: row.required,
    confirmed: row.confirmed,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

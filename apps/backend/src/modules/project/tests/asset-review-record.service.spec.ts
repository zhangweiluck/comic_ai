import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  confirmAssetReviewCandidateRecord,
  listAssetReviewCandidatesForProject,
  replaceAssetReviewCandidatesForProject,
  updateAssetReviewCandidateRecordLabel,
} from "../asset-review-record.service.ts";

describe("asset review record service", { concurrency: false }, () => {
  it("persists project asset review candidates and supports confirm plus rename", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      await replaceAssetReviewCandidatesForProject(db, {
        organizationId,
        projectId,
        now: new Date("2026-05-18T13:00:00.000Z"),
        candidates: [
          {
            group: "character",
            assetKey: "hero-main",
            label: "Hero",
            required: true,
          },
          {
            group: "scene",
            assetKey: "forest-night",
            label: "Forest",
            required: true,
          },
          {
            group: "prop",
            assetKey: "lantern-01",
            label: "Lantern",
            required: false,
          },
        ],
      });

      await confirmAssetReviewCandidateRecord(db, {
        organizationId,
        projectId,
        group: "character",
        assetKey: "hero-main",
        now: new Date("2026-05-18T13:01:00.000Z"),
      });
      await updateAssetReviewCandidateRecordLabel(db, {
        organizationId,
        projectId,
        group: "character",
        assetKey: "hero-main",
        label: "Hero Prime",
        now: new Date("2026-05-18T13:02:00.000Z"),
      });

      const stored = await listAssetReviewCandidatesForProject(db, {
        organizationId,
        projectId,
      });

      assert.equal(stored.length, 3);
      assert.equal(
        stored.find((candidate) => candidate.assetKey === "hero-main")?.confirmed,
        true,
      );
      assert.equal(
        stored.find((candidate) => candidate.assetKey === "hero-main")?.label,
        "Hero Prime",
      );
      assert.equal(
        stored.find((candidate) => candidate.assetKey === "forest-night")?.confirmed,
        false,
      );
    } finally {
      await db.close();
    }
  });
});

const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";

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
      VALUES ($1, $2, $3, 'Project', '9:16', '1080p', 'asset_review', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );
}

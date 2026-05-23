import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("shot schema assumptions", () => {
  it("adds shots table with revision and current-pointer safety fields", async () => {
    const sql = await readFile(
      new URL(
        "../../../../../../packages/db/migrations/0001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE shots \(/);
    assert.match(sql, /episode_id uuid NULL/);
    assert.match(sql, /content_revision integer NOT NULL DEFAULT 1 CHECK \(content_revision >= 1\)/);
    assert.match(sql, /content_status text NOT NULL CHECK \(content_status IN \('draft', 'ready', 'stale'\)\)/);
    assert.match(sql, /image_status text NOT NULL CHECK \(image_status IN \('draft', 'ready', 'generating', 'completed', 'failed', 'stale'\)\)/);
    assert.match(sql, /current_image_asset_version_id uuid NULL/);
    assert.match(sql, /active_image_task_id uuid NULL/);
    assert.match(sql, /active_image_revision integer NULL CHECK \(active_image_revision >= 1\)/);
    assert.match(sql, /current_video_asset_version_id uuid NULL/);
    assert.match(sql, /active_video_task_id uuid NULL/);
    assert.match(sql, /active_video_image_asset_version_id uuid NULL/);
    assert.match(sql, /FOREIGN KEY \(organization_id, episode_id\)\s+REFERENCES episodes \(organization_id, id\)/);
  });

  it("adds persistent episodes for project detail tabs", async () => {
    const sql = await readFile(
      new URL(
        "../../../../../../packages/db/migrations/0001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE episodes \(/);
    assert.match(sql, /project_id uuid NOT NULL REFERENCES projects\(id\)/);
    assert.match(sql, /sequence integer NOT NULL CHECK \(sequence >= 1\)/);
    assert.match(sql, /status text NOT NULL CHECK \(status IN \('draft', 'ready', 'archived'\)\)/);
    assert.match(sql, /UNIQUE \(organization_id, project_id, sequence\)/);
    assert.match(sql, /CREATE INDEX episodes_project_idx/);
  });
});

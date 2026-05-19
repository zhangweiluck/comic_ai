import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("asset schema assumptions", () => {
  it("adds assets and asset_versions tables to the foundation migration", async () => {
    const sql = await readFile(
      new URL(
        "../../../../../../packages/db/migrations/0001_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(sql, /CREATE TABLE assets \(/);
    assert.match(sql, /CREATE TABLE asset_review_candidates \(/);
    assert.match(sql, /candidate_group text NOT NULL CHECK \(candidate_group IN \('character', 'scene', 'prop'\)\)/);
    assert.match(sql, /asset_type text NOT NULL CHECK \(asset_type IN \('character_sheet', 'scene_reference', 'prop_reference', 'shot_image', 'shot_video'\)\)/);
    assert.match(sql, /CREATE TABLE asset_versions \(/);
    assert.match(sql, /version_number integer NOT NULL CHECK \(version_number >= 1\)/);
    assert.match(sql, /UNIQUE \(asset_id, version_number\)/);
  });
});

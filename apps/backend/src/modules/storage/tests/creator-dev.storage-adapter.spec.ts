import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreatorDevStorageAdapter } from "../creator-dev.storage-adapter.ts";

describe("creator dev storage adapter", () => {
  it("creates deterministic signed read urls for stored objects", async () => {
    const adapter = new CreatorDevStorageAdapter();
    const expiresAt = new Date("2026-05-18T12:00:00.000Z");

    const result = await adapter.createSignedReadUrl({
      bucket: "creator-dev",
      objectKey: "organizations/org-1/workspaces/ws-1/projects/project-1/object/file.png",
      expiresAt,
    });

    assert.equal(result.expiresAt.toISOString(), expiresAt.toISOString());
    assert.match(
      result.url,
      /^https:\/\/dev-storage\.local\/creator-dev\/organizations%2Forg-1%2Fworkspaces%2Fws-1%2Fprojects%2Fproject-1%2Fobject%2Ffile\.png\?expiresAt=/,
    );
  });
});

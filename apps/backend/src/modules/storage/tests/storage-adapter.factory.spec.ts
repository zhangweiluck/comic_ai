import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createStorageAdapterFromEnv } from "../storage-adapter.factory.ts";

describe("storage adapter factory", () => {
  it("builds a public-base-url adapter from env when configured", async () => {
    const adapter = createStorageAdapterFromEnv({
      STORAGE_ADAPTER_MODE: "public_base_url",
      STORAGE_PUBLIC_BASE_URL: "https://storage.example.com/root",
    });

    const result = await adapter.createSignedReadUrl({
      bucket: "bucket-1",
      objectKey: "objects/file.png",
      expiresAt: new Date("2026-05-18T13:00:00.000Z"),
    });

    assert.match(
      result.url,
      /^https:\/\/storage\.example\.com\/root\/bucket-1\/objects%2Ffile\.png\?expiresAt=/,
    );
  });
});

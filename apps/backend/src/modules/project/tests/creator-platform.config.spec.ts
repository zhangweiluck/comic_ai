import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCreatorPlatformRuntime } from "../creator-platform.config.ts";

describe("creator platform runtime config", () => {
  it("uses stable defaults for the local dev runtime", () => {
    const runtime = createCreatorPlatformRuntime(
      {
        MODEL_PROVIDER_MODE: "dev",
        STORAGE_ADAPTER_MODE: "dev",
      },
      {
        fetchImpl: fetch,
      },
    );

    assert.equal(runtime.providerName, "creator-dev");
    assert.equal(runtime.storageBucket, "creator-dev");
    assert.equal(runtime.payloadRefScheme, "creator");
    assert.equal(runtime.imageWorkerId, "creator-image-worker");
    assert.equal(runtime.videoWorkerId, "creator-video-worker");
    assert.equal(runtime.exportWorkerId, "creator-export-worker");
    assert.equal(runtime.signedUrlExpiresInSeconds, 900);
  });

  it("accepts explicit runtime overrides for provider and storage metadata", () => {
    const runtime = createCreatorPlatformRuntime(
      {
        MODEL_PROVIDER_MODE: "openai_images",
        OPENAI_API_KEY: "openai-key",
        MODEL_PROVIDER_NAME: "openai-images",
        STORAGE_ADAPTER_MODE: "public_base_url",
        STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test/assets",
        STORAGE_BUCKET: "creator-prod",
        CREATOR_PAYLOAD_SCHEME: "vendor",
        CREATOR_IMAGE_WORKER_ID: "image-http-worker",
        CREATOR_VIDEO_WORKER_ID: "video-http-worker",
        CREATOR_EXPORT_WORKER_ID: "export-http-worker",
        CREATOR_SIGNED_URL_EXPIRES_SECONDS: "1200",
      },
      {
        fetchImpl: fetch,
      },
    );

    assert.equal(runtime.providerName, "openai-images");
    assert.equal(runtime.storageBucket, "creator-prod");
    assert.equal(runtime.payloadRefScheme, "vendor");
    assert.equal(runtime.imageWorkerId, "image-http-worker");
    assert.equal(runtime.videoWorkerId, "video-http-worker");
    assert.equal(runtime.exportWorkerId, "export-http-worker");
    assert.equal(runtime.signedUrlExpiresInSeconds, 1200);
  });

  it("falls back to safe defaults when override values are blank or invalid", () => {
    const runtime = createCreatorPlatformRuntime(
      {
        MODEL_PROVIDER_MODE: "openai_images",
        OPENAI_API_KEY: "openai-key",
        STORAGE_ADAPTER_MODE: "public_base_url",
        STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test/assets",
        MODEL_PROVIDER_NAME: "   ",
        STORAGE_BUCKET: "",
        CREATOR_PAYLOAD_SCHEME: "   ",
        CREATOR_IMAGE_WORKER_ID: "",
        CREATOR_VIDEO_WORKER_ID: "   ",
        CREATOR_EXPORT_WORKER_ID: "",
        CREATOR_SIGNED_URL_EXPIRES_SECONDS: "0",
      },
      {
        fetchImpl: fetch,
      },
    );

    assert.equal(runtime.providerName, "openai-images");
    assert.equal(runtime.storageBucket, "creator-public_base_url");
    assert.equal(runtime.payloadRefScheme, "creator");
    assert.equal(runtime.imageWorkerId, "creator-image-worker");
    assert.equal(runtime.videoWorkerId, "creator-video-worker");
    assert.equal(runtime.exportWorkerId, "creator-export-worker");
    assert.equal(runtime.signedUrlExpiresInSeconds, 900);
  });

  it("keeps video generation on the dev provider when image mode is OpenAI-only", () => {
    const runtime = createCreatorPlatformRuntime(
      {
        MODEL_PROVIDER_MODE: "openai_images",
        OPENAI_API_KEY: "openai-key",
      },
      {
        fetchImpl: fetch,
        generationKind: "video",
      },
    );

    assert.equal(runtime.providerName, "creator-dev");
  });
});

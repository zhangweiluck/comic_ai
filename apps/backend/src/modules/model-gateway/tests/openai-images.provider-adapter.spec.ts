import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OpenAIImagesProviderAdapter } from "../openai-images.provider-adapter.ts";
import { createProviderAdapterFromEnv } from "../provider-adapter.factory.ts";

describe("openai images provider adapter", () => {
  it("submits image generation requests to the OpenAI images endpoint", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = new OpenAIImagesProviderAdapter({
      apiKey: "openai-key",
      model: "gpt-image-2",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            created: 1716026400,
            data: [{ b64_json: "ZmFrZQ==", revised_prompt: "revised prompt" }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_openai_123",
            },
          },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-1",
      providerName: "openai-images",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-1:task-1",
      payloadRef: "creator://payload",
      payloadHash: "hash-1",
      redactedPayload: {
        shotId: "shot-1",
        title: "Mechanical city sunrise",
        contentRevision: 3,
      },
    });

    assert.equal(capturedUrl, "https://api.openai.com/v1/images/generations");
    assert.deepEqual(capturedHeaders, {
      authorization: "Bearer openai-key",
      "content-type": "application/json",
    });
    assert.match(capturedBody, /"model":"gpt-image-2"/);
    assert.match(capturedBody, /Mechanical city sunrise/);
    assert.equal(result.externalRequestId, "req_openai_123");
    assert.equal(result.status, "succeeded");
  });

  it("builds the OpenAI images adapter from env", async () => {
    let called = false;

    const adapter = createProviderAdapterFromEnv(
      {
        MODEL_PROVIDER_MODE: "openai_images",
        OPENAI_API_KEY: "openai-key-2",
        OPENAI_IMAGE_MODEL: "gpt-image-2",
      },
      (async () => {
        called = true;
        return new Response(
          JSON.stringify({
            data: [{ b64_json: "ZmFrZQ==" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    );

    const result = await adapter.submit({
      providerRequestId: "provider-request-2",
      providerName: "openai-images",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-2:task-2",
      payloadRef: "creator://payload-2",
      payloadHash: "hash-2",
      redactedPayload: {
        prompt: "Vertical comic frame of a neon alley.",
      },
    });

    assert.equal(called, true);
    assert.equal(result.status, "succeeded");
  });
});

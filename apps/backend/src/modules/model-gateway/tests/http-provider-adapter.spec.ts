import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HttpProviderAdapter } from "../http-provider-adapter.ts";
import { createProviderAdapterFromEnv } from "../provider-adapter.factory.ts";

describe("http provider adapter", () => {
  it("posts provider submissions to the configured external endpoint", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    const adapter = new HttpProviderAdapter({
      endpoint: "https://provider.example.com/api",
      apiKey: "secret-key",
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            externalRequestId: "external-123",
            status: "accepted",
            redactedResponse: { accepted: true },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    const result = await adapter.submit({
      providerRequestId: "provider-request-1",
      providerName: "http-provider",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-1:task-1",
      payloadRef: "dev://payload",
      payloadHash: "hash-1",
      redactedPayload: { shotId: "shot-1" },
    });

    assert.equal(capturedUrl, "https://provider.example.com/api/submit");
    assert.deepEqual(capturedHeaders, {
      "content-type": "application/json",
      authorization: "Bearer secret-key",
    });
    assert.match(capturedBody, /"providerRequestId":"provider-request-1"/);
    assert.equal(result.externalRequestId, "external-123");
    assert.equal(result.status, "accepted");
  });

  it("builds an http adapter from env when external provider mode is enabled", async () => {
    let called = false;
    const adapter = createProviderAdapterFromEnv(
      {
        MODEL_PROVIDER_MODE: "http",
        MODEL_PROVIDER_ENDPOINT: "https://provider.example.com/root",
        MODEL_PROVIDER_API_KEY: "key-1",
      },
      (async () => {
        called = true;
        return new Response(
          JSON.stringify({
            externalRequestId: "external-456",
            status: "running",
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
      providerName: "http-provider",
      providerOperation: "shot.video.generate",
      requestKey: "workflow-2:task-2",
      payloadRef: "dev://payload-2",
      payloadHash: "hash-2",
      redactedPayload: { shotId: "shot-2" },
    });

    assert.equal(called, true);
    assert.equal(result.status, "running");
  });
});

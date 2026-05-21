import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreatorDevProviderAdapter } from "../creator-dev.provider-adapter.ts";

describe("creator dev provider adapter", () => {
  it("returns normalized accepted submissions for generation operations", async () => {
    const adapter = new CreatorDevProviderAdapter();

    const result = await adapter.submit({
      providerRequestId: "provider-request-1",
      providerName: "creator-dev",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-1:task-1",
      payloadRef: "dev://payload",
      payloadHash: "hash-1",
      redactedPayload: {
        shotId: "shot-1",
      },
    });

    assert.equal(result.status, "accepted");
    assert.equal(result.externalRequestId, "external-provider-request-1");
    assert.deepEqual(result.redactedResponse, {
      accepted: true,
      providerName: "creator-dev",
      providerOperation: "shot.image.generate",
      requestKey: "workflow-1:task-1",
    });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InMemoryInbox,
  consumeOutboxEventOnce,
} from "../outbox-repair.contract.ts";

describe("outbox inbox dedup", () => {
  it("does not run the consumer side effect twice for the same event", async () => {
    const inbox = new InMemoryInbox();
    let sideEffectCount = 0;

    const first = await consumeOutboxEventOnce(inbox, {
      consumerName: "credit-billing",
      outboxEventId: "event_1",
      effect: async () => {
        sideEffectCount += 1;
        return "applied";
      },
    });
    const replay = await consumeOutboxEventOnce(inbox, {
      consumerName: "credit-billing",
      outboxEventId: "event_1",
      effect: async () => {
        sideEffectCount += 1;
        return "applied-again";
      },
    });

    assert.equal(first.kind, "applied");
    assert.equal(replay.kind, "duplicate");
    assert.equal(sideEffectCount, 1);
  });
});

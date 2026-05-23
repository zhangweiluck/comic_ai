import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InMemoryInbox,
  consumeOutboxEventWithIdempotentEffect,
} from "../outbox-repair.contract.ts";

describe("outbox inbox dedup", () => {
  it("does not run the consumer side effect twice for the same event", async () => {
    const inbox = new InMemoryInbox();
    let sideEffectCount = 0;

    const first = await consumeOutboxEventWithIdempotentEffect(inbox, {
      consumerName: "credit-billing",
      outboxEventId: "event_1",
      effect: async () => {
        sideEffectCount += 1;
        return "applied";
      },
    });
    const replay = await consumeOutboxEventWithIdempotentEffect(inbox, {
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

  it("does not serialize concurrent effects before the inbox mark is written", async () => {
    const inbox = new InMemoryInbox();
    let entered = 0;

    const consume = () =>
      consumeOutboxEventWithIdempotentEffect(inbox, {
        consumerName: "credit-billing",
        outboxEventId: "event_2",
        effect: async () => {
          entered += 1;
          await new Promise((resolve) => setTimeout(resolve, 0));
          return "applied";
        },
      });

    const results = await Promise.all([consume(), consume()]);

    assert.equal(entered, 2);
    assert.deepEqual(
      results.map((result) => result.kind),
      ["applied", "applied"],
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findCreditBalanceDrift,
  recomputeCreditBalance,
} from "../credit-balance-reconciliation.contract.ts";

describe("credit balance reconciliation", () => {
  it("recomputes balances from append-only ledger entries", () => {
    const balance = recomputeCreditBalance([
      { organizationId: "org_1", availableDelta: 100, reservedDelta: 0, consumedDelta: 0 },
      { organizationId: "org_1", availableDelta: -30, reservedDelta: 30, consumedDelta: 0 },
      { organizationId: "org_1", availableDelta: 0, reservedDelta: -30, consumedDelta: 30 },
    ]);

    assert.deepEqual(balance.get("org_1"), {
      organizationId: "org_1",
      available: 70,
      reserved: 0,
      consumed: 30,
    });
  });

  it("detects cached read model drift", () => {
    const drift = findCreditBalanceDrift(
      [
        { organizationId: "org_1", availableDelta: 10, reservedDelta: 0, consumedDelta: 0 },
      ],
      [{ organizationId: "org_1", creditBalanceCached: 9, creditReservedCached: 0 }],
    );

    assert.deepEqual(drift.map((item) => item.organizationId), ["org_1"]);
  });
});

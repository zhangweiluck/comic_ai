import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("P0 ops readiness documents", () => {
  it("keeps the creator ops runbook actionable for C9", async () => {
    const runbook = await readFile(
      new URL("../../../../../docs/ops/p0-creator-ops-runbook.md", import.meta.url),
      "utf8",
    );

    assert.match(runbook, /Signals/);
    assert.match(runbook, /Query Entrypoints/);
    assert.match(runbook, /Repair Commands/);
    assert.match(runbook, /Manual Intervention/);
    assert.match(runbook, /Rollback Conditions/);
    assert.match(runbook, /result_unknown/);
    assert.match(runbook, /manual_review_required/);
    assert.match(runbook, /payment_risk_events/);
    assert.match(runbook, /paid-without-credit/);
    assert.match(runbook, /traceId/);
  });

  it("keeps release and rollback checks tied to executable commands", async () => {
    const checklist = await readFile(
      new URL("../../../../../docs/ops/p0-release-rollback-checklist.md", import.meta.url),
      "utf8",
    );

    assert.match(checklist, /Pre-release/);
    assert.match(checklist, /Smoke Test/);
    assert.match(checklist, /Rollback/);
    assert.match(checklist, /npm test -- apps packages/);
    assert.match(checklist, /npm test -- apps\/web\/e2e\/p0/);
    assert.match(checklist, /npm run dev:phone-auth/);
  });
});

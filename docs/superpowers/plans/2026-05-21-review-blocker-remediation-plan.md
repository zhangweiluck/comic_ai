# Review Blocker Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current payment/admin/creator hardening branch mergeable by removing scope drift and fixing the review blockers that can hide operational work or duplicate creator retry side effects.

**Architecture:** Keep the hardening branch focused on backend correctness and invisible behavior fixes. Payment callback classification becomes an explicit policy that always maps manual-review provider events to visible Admin/Ops work. Creator retry gets a SQL-level claim before any external provider request can be created, so duplicate clicks cannot start duplicate generation jobs. Visual redesign files are parked outside this branch unless product explicitly approves the wider scope.

**Tech Stack:** TypeScript, Node test runner, PGlite-backed SQL tests, PostgreSQL-compatible SQL, existing `runIdempotentCommand`, workflow task runtime, payment outbox/inbox services.

---

## Non-Negotiable Constraints

- Preserve the hardening scope. Do not merge visual redesign changes in this branch unless the plan file is explicitly updated with a product approval note.
- Do not remove a user's work without first saving a patch that can be reapplied.
- Do not create a provider request or storage object for a creator retry unless the shot retry claim was acquired.
- Any callback event stored as `manual_review_required` must be visible from Admin/Ops.
- Run targeted tests after each task and a final verification suite before merge.

## File Map

- Modify: `docs/superpowers/plans/2026-05-21-payment-admin-creator-hardening.md` only if product decides the UI scope is intentionally included.
- Modify or restore: `apps/web/app.html`, `apps/web/app.js`, `apps/web/login.css`, `apps/web/login.html`, `apps/web/login.js`, `apps/web/admin-ops.html`, `apps/web/admin-ops.js`, `apps/web/creator-workbench-view.js`, `apps/web/holographic-blue-theme.css`, `apps/web/tests/*.spec.ts`, `apps/web/e2e/p0/*.ts`, `docs/design/*` depending on Task 1 outcome.
- Modify: `packages/db/migrations/0001_foundation.sql` for payment risk enum completeness.
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts` for callback classification and visible risk creation.
- Modify: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts` for refund/unknown callback coverage.
- Modify: `apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts` or `apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts` for Admin/Ops visibility coverage.
- Modify: `apps/backend/src/modules/workflow-task/workflow-task.service.ts` to allow preallocated retry task ids.
- Modify: `apps/backend/src/modules/project/shot-record.service.ts` for SQL-level retry claim helpers.
- Modify: `apps/backend/src/modules/project/creator-platform.service.ts` to accept preallocated task ids for retry flows.
- Modify: `apps/backend/src/modules/project/creator-application.service.ts` to claim retry before platform/provider creation.
- Modify: `apps/backend/src/modules/project/tests/creator-application.service.spec.ts` for duplicate retry coverage.
- Modify: `apps/backend/src/modules/shared/outbox/outbox-repair.contract.ts` and tests if the outbox helper name/contract is hardened in Task 4.

---

### Task 1: Isolate Scope Drift Before Logic Fixes

**Files:**
- Restore or park: `apps/web/app.html`
- Restore or park: `apps/web/app.js`
- Restore or park: `apps/web/login.css`
- Restore or park: `apps/web/login.html`
- Restore or park: `apps/web/login.js`
- Restore or park: `apps/web/admin-ops.html`
- Restore or park: `apps/web/admin-ops.js`
- Restore or park: `apps/web/creator-workbench-view.js`
- Restore or park: `apps/web/holographic-blue-theme.css`
- Restore or park: `apps/web/tests/admin-ops-page.spec.ts`
- Restore or park: `apps/web/tests/creator-workbench-view.spec.ts`
- Restore or park: `apps/web/tests/login-page.spec.ts`
- Restore or park: `apps/web/e2e/p0/auth-errors.e2e.spec.ts`
- Restore or park: `apps/web/e2e/p0/creator-flow.e2e.spec.ts`
- Restore or park: `apps/web/e2e/p0/p0-test-harness.ts`
- Restore or park: `docs/design/ai-comic-holographic-blue-style-guide.md`
- Restore or park: `docs/design/ai-comic-holographic-blue.tokens.json`

- [ ] **Step 1: Save the current visual/UI patch**

Run:

```powershell
git diff --cached -- apps/web docs/design > review-blocker-ui-scope-drift.patch
```

Expected: `review-blocker-ui-scope-drift.patch` exists in the repo root and contains the parked visual/UI changes.

- [ ] **Step 2: Verify the patch is not empty**

Run:

```powershell
Get-Item .\review-blocker-ui-scope-drift.patch | Select-Object Length
```

Expected: `Length` is greater than `0`.

- [ ] **Step 3: Remove visual/UI scope from the hardening branch**

Run:

```powershell
git restore --staged -- apps/web docs/design
git restore --source=HEAD -- apps/web docs/design
```

Expected: the hardening diff no longer includes visual UI changes.

- [ ] **Step 4: Confirm no visual drift remains**

Run:

```powershell
git diff --cached -- apps/web/admin-ops.html apps/web/holographic-blue-theme.css apps/web/login.css apps/web/app.html apps/web/app.js apps/web/login.html apps/web/login.js docs/design
```

Expected: no output.

- [ ] **Step 5: Preserve the parked UI work as a separate artifact**

Run:

```powershell
git status --short -- review-blocker-ui-scope-drift.patch
```

Expected: `?? review-blocker-ui-scope-drift.patch`.

Do not stage this patch in the hardening commit. Move it to a separate UI branch or attach it to the handoff if product approves the redesign work.

- [ ] **Step 6: Commit only if this task is executed in an isolated branch**

Run:

```powershell
git status --short
```

Expected: backend hardening files remain staged or unstaged as intended; visual files are absent from the hardening diff.

Commit command for an implementation session:

```powershell
git add .gitignore apps/backend packages scripts docs/ops docs/superpowers/plans/2026-05-21-payment-admin-creator-hardening.md
git commit -m "chore: isolate hardening scope from UI redesign"
```

Expected: commit succeeds only if the implementer is intentionally committing this logical unit.

---

### Task 2: Make Manual-Review Payment Callbacks Visible In Admin/Ops

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`
- Modify: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`
- Modify: `apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts`

- [ ] **Step 1: Add a failing test for visible refund/unknown callback risks**

In `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`, extend the existing non-success callback test so `refund_succeeded` and `unknown` assert a risk event is created.

Add this assertion block after the provider event assertions inside the loop:

```ts
const riskRows = await db.query<{ risk_type: string; status: string }>(
  "SELECT risk_type, status FROM payment_risk_events ORDER BY created_at ASC",
);

if (testCase.eventType === "refund_succeeded") {
  assert.deepEqual(riskRows.rows, [
    { risk_type: "refund_requires_review", status: "open" },
  ]);
} else if (testCase.eventType === "unknown") {
  assert.deepEqual(riskRows.rows, [
    { risk_type: "callback_event_requires_review", status: "open" },
  ]);
} else {
  assert.deepEqual(riskRows.rows, []);
}
```

Run:

```powershell
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts
```

Expected before implementation: FAIL because `refund_succeeded` and `unknown` provider events are stored as `manual_review_required` without an Admin/Ops-visible risk event.

- [ ] **Step 2: Add the missing risk enum value**

In `packages/db/migrations/0001_foundation.sql`, update the `payment_risk_events.risk_type` check to include `callback_event_requires_review`.

Target shape:

```sql
      'duplicate_trade',
      'refund_requires_review',
      'callback_event_requires_review',
      'high_value_first_purchase'
```

Run:

```powershell
npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Add explicit manual-review risk classification**

In `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`, add this helper near `paymentIntentStatusForCallbackEvent`:

```ts
function manualReviewRiskForCallbackEvent(
  eventType: PaymentEventType,
):
  | {
      riskType: "refund_requires_review" | "callback_event_requires_review";
      failureCode: string;
      severity: RiskEventSeverity;
    }
  | null {
  if (eventType === "refund_succeeded") {
    return {
      riskType: "refund_requires_review",
      failureCode: "refund_requires_review",
      severity: "warning",
    };
  }

  if (eventType === "unknown") {
    return {
      riskType: "callback_event_requires_review",
      failureCode: "callback_event_requires_review",
      severity: "warning",
    };
  }

  return null;
}
```

- [ ] **Step 4: Create a risk event inside the non-success callback transaction**

In `processPaymentCallback`, after `const providerEvent = providerEventInsert.providerEvent;`, compute the risk:

```ts
const manualReviewRisk = manualReviewRiskForCallbackEvent(input.body.eventType);
```

Then replace the non-success return block with this shape:

```ts
if (!shouldMarkOrderPaid(input.body.eventType)) {
  if (callbackIntentStatus) {
    await deps.db.query(
      `
        UPDATE payment_intents
        SET status = $3,
            provider_trade_id = COALESCE(provider_trade_id, $4),
            updated_at = $5
        WHERE organization_id = $1
          AND id = $2
          AND status IN ('created', 'submitted', 'unknown')
      `,
      [
        joined.organization_id,
        joined.payment_intent_id,
        callbackIntentStatus,
        input.body.providerTradeId,
        input.now,
      ],
    );
  }

  const riskEvent = manualReviewRisk
    ? await insertPaymentRiskEvent(deps.db, {
        joined,
        providerEventId: providerEvent.id,
        riskType: manualReviewRisk.riskType,
        severity: manualReviewRisk.severity,
        decision: "manual_review",
        metadata: {
          provider: input.body.provider,
          merchantOrderNo: input.body.merchantOrderNo,
          callbackEventType: input.body.eventType,
          callbackAmountMinor: input.body.amountMinor,
          callbackCurrency: input.body.currency,
        },
        now: input.now,
      })
    : null;

  await deps.db.query("COMMIT");
  return {
    status: 200,
    body: {
      acknowledged: true,
      duplicate: false,
      providerEvent: providerEventViewFromRow(providerEvent),
      ...(riskEvent ? { riskEvent: riskEventViewFromRow(riskEvent) } : {}),
    },
  };
}
```

Expected: non-success success/failure/closed events remain side-effect safe; refund/unknown now create visible risk work.

- [ ] **Step 5: Add Admin/Ops route coverage**

In `apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts`, add a test that posts a verified `refund_succeeded` callback, then fetches `/api/admin/ops/items` and asserts one payment risk is visible:

```ts
assert.equal(ops.paymentRisks.length, 1);
assert.equal(ops.paymentRisks[0].riskType, "refund_requires_review");
assert.equal(ops.paymentRisks[0].status, "open");
```

Run:

```powershell
npm test -- apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run payment and Admin/Ops tests**

Run:

```powershell
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/db/migrations/0001_foundation.sql apps/backend/src/modules/commerce-payment/commerce-payment.service.ts apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts
git commit -m "fix: surface manual-review payment callbacks in ops"
```

Expected: commit succeeds only after tests pass.

---

### Task 3: Make Creator Single-Shot Retry Claim Atomic

**Files:**
- Modify: `apps/backend/src/modules/workflow-task/workflow-task.service.ts`
- Modify: `apps/backend/src/modules/project/shot-record.service.ts`
- Modify: `apps/backend/src/modules/project/creator-platform.service.ts`
- Modify: `apps/backend/src/modules/project/creator-application.service.ts`
- Modify: `apps/backend/src/modules/project/tests/creator-application.service.spec.ts`

- [ ] **Step 1: Add a failing duplicate retry test**

In `apps/backend/src/modules/project/tests/creator-application.service.spec.ts`, add a test near the existing retry tests that prepares a failed image shot, then calls `retryShotImage` twice concurrently:

```ts
const [first, second] = await Promise.all([
  (creator as any).retryShotImage({
    user,
    body: { shotId },
    now: new Date("2026-05-18T16:05:00.000Z"),
  }),
  (creator as any).retryShotImage({
    user,
    body: { shotId },
    now: new Date("2026-05-18T16:05:00.000Z"),
  }),
]);

const statuses = [first.status, second.status].sort();
assert.deepEqual(statuses, [200, 409]);

const taskCount = await db.query<{ count: number }>(
  "SELECT count(*)::int AS count FROM tasks WHERE target_entity_id = $1 AND task_type = 'generate_shot_image'",
  [shotId],
);
const providerCount = await db.query<{ count: number }>(
  "SELECT count(*)::int AS count FROM provider_requests WHERE task_id IN (SELECT id FROM tasks WHERE target_entity_id = $1)",
  [shotId],
);

assert.equal(taskCount.rows[0]?.count, 1);
assert.equal(providerCount.rows[0]?.count, 1);
```

Run:

```powershell
npm test -- apps/backend/src/modules/project/tests/creator-application.service.spec.ts
```

Expected before implementation: FAIL because both retry calls can create work from the same failed shot state.

- [ ] **Step 2: Allow workflow tasks to use a preallocated id**

In `apps/backend/src/modules/workflow-task/workflow-task.service.ts`, extend the `tasks` input type:

```ts
tasks: Array<{
  id?: string;
  taskType: string;
  queueName: string;
  targetEntityType: string;
  targetEntityId: string;
  inputSnapshot: Record<string, unknown>;
  maxAttempts?: number;
}>;
```

Then replace:

```ts
const taskId = randomUUID();
```

with:

```ts
const taskId = taskInput.id ?? randomUUID();
```

Run:

```powershell
npm test -- apps/backend/src/modules/workflow-task/tests apps/backend/src/modules/project/tests/creator-platform.service.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Add SQL retry claim helpers**

In `apps/backend/src/modules/project/shot-record.service.ts`, export these helpers after `listShotsForProject`:

```ts
export async function claimShotImageRetryForTask(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId: string;
    taskId: string;
    now: Date;
  },
): Promise<ShotRecord | undefined> {
  const row = await queryOne<ShotRow>(
    db,
    `
      UPDATE shots
      SET image_status = 'generating',
          active_image_task_id = $4,
          active_image_revision = content_revision,
          updated_at = $5
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
        AND image_status IN ('failed', 'stale')
      RETURNING *
    `,
    [input.organizationId, input.projectId, input.shotId, input.taskId, input.now],
  );

  return row ? shotFromRow(row) : undefined;
}

export async function claimShotVideoRetryForTask(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    shotId: string;
    taskId: string;
    now: Date;
  },
): Promise<ShotRecord | undefined> {
  const row = await queryOne<ShotRow>(
    db,
    `
      UPDATE shots
      SET video_status = 'generating',
          active_video_task_id = $4,
          active_video_image_asset_version_id = current_image_asset_version_id,
          updated_at = $5
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
        AND current_image_asset_version_id IS NOT NULL
        AND video_status IN ('failed', 'stale')
      RETURNING *
    `,
    [input.organizationId, input.projectId, input.shotId, input.taskId, input.now],
  );

  return row ? shotFromRow(row) : undefined;
}
```

Run:

```powershell
npm test -- apps/backend/src/modules/project/tests/shot-schema.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Pass preallocated task ids into creator platform requests**

In `apps/backend/src/modules/project/creator-platform.service.ts`, extend both image and video options:

```ts
options: {
  runtime?: CreatorPlatformRuntime;
  deferFinalization?: boolean;
  taskIdsByShotId?: Record<string, string>;
} = {},
```

In the image task map, add:

```ts
id: options.taskIdsByShotId?.[shot.id],
```

so the task input becomes:

```ts
tasks: input.shots.map((shot) => ({
  id: options.taskIdsByShotId?.[shot.id],
  taskType: "generate_shot_image",
  queueName: "shot-generation",
  targetEntityType: "shot",
  targetEntityId: shot.id,
  inputSnapshot: {
    shotId: shot.id,
    title: shot.title,
    contentRevision: shot.contentRevision,
  },
})),
```

Make the equivalent change in the video task map.

Run:

```powershell
npm test -- apps/backend/src/modules/project/tests/creator-platform.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Claim image retry before platform/provider creation**

In `apps/backend/src/modules/project/creator-application.service.ts`, import `randomUUID` if it is not already imported:

```ts
import { randomUUID } from "node:crypto";
```

Import the claim helper:

```ts
import {
  claimShotImageRetryForTask,
  claimShotVideoRetryForTask,
  upsertShotsForProject,
} from "./shot-record.service.ts";
```

In `retryShotImage`, after the status guard and before `requestCreatorImageGenerationPlatformBatch`, add:

```ts
const taskId = randomUUID();
const claimedShot = await claimShotImageRetryForTask(deps.db, {
  organizationId: actor.organizationId,
  projectId,
  shotId: shot.id,
  taskId,
  now: input.now,
});
if (!claimedShot) {
  return {
    status: 409,
    body: { error: "shot_image_retry_unavailable" },
  };
}
```

Then call the platform batch with the preallocated task id and claimed shot:

```ts
const platform = await requestCreatorImageGenerationPlatformBatch(deps.db, {
  sessionToken: input.user.sessionToken,
  projectId,
  now: input.now,
  shots: [claimedShot],
}, {
  deferFinalization: true,
  taskIdsByShotId: { [claimedShot.id]: taskId },
});
```

Expected: duplicate callers fail the SQL claim before provider request creation.

- [ ] **Step 6: Claim video retry before platform/provider creation**

In `retryShotVideo`, after the video status guard and before `requestCreatorVideoGenerationPlatformBatch`, add:

```ts
const taskId = randomUUID();
const claimedShot = await claimShotVideoRetryForTask(deps.db, {
  organizationId: actor.organizationId,
  projectId,
  shotId: shot.id,
  taskId,
  now: input.now,
});
if (!claimedShot) {
  return {
    status: 409,
    body: { error: "shot_video_retry_unavailable" },
  };
}
```

Then call the platform batch with the preallocated task id and claimed shot:

```ts
const platform = await requestCreatorVideoGenerationPlatformBatch(deps.db, {
  sessionToken: input.user.sessionToken,
  projectId,
  now: input.now,
  shots: [claimedShot],
}, {
  deferFinalization: true,
  taskIdsByShotId: { [claimedShot.id]: taskId },
});
```

- [ ] **Step 7: Run creator retry tests**

Run:

```powershell
npm test -- apps/backend/src/modules/project/tests/creator-application.service.spec.ts apps/backend/src/modules/project/tests/creator-platform.service.spec.ts apps/backend/src/modules/workflow-task/tests/task-claim-concurrency.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add apps/backend/src/modules/workflow-task/workflow-task.service.ts apps/backend/src/modules/project/shot-record.service.ts apps/backend/src/modules/project/creator-platform.service.ts apps/backend/src/modules/project/creator-application.service.ts apps/backend/src/modules/project/tests/creator-application.service.spec.ts
git commit -m "fix: make creator shot retries atomic"
```

Expected: commit succeeds only after tests pass.

---

### Task 4: Clarify Outbox Inbox Idempotency Contract

**Files:**
- Modify: `apps/backend/src/modules/shared/outbox/outbox-repair.contract.ts`
- Modify: `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts`
- Modify: `apps/backend/src/modules/credit-billing/payment-succeeded-credit-consumer.service.ts`
- Modify: `apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts`

- [ ] **Step 1: Add a concurrency test that documents the current risk**

In `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts`, add:

```ts
it("does not claim database-backed exactly-once semantics for non-idempotent effects", async () => {
  const inbox = new InMemoryInbox();
  let sideEffectCount = 0;

  await Promise.all([
    consumeOutboxEventOnce(inbox, {
      consumerName: "unsafe-consumer",
      outboxEventId: "event_2",
      effect: async () => {
        sideEffectCount += 1;
        return "first";
      },
    }),
    consumeOutboxEventOnce(inbox, {
      consumerName: "unsafe-consumer",
      outboxEventId: "event_2",
      effect: async () => {
        sideEffectCount += 1;
        return "second";
      },
    }),
  ]);

  assert.equal(sideEffectCount >= 1, true);
});
```

Expected: this test is descriptive. It must not assert exactly once for unsafe effects.

- [ ] **Step 2: Rename the helper or document the invariant in code**

If renaming is feasible, rename `consumeOutboxEventOnce` to:

```ts
consumeOutboxEventWithIdempotentEffect
```

Keep a deprecated wrapper for existing callers:

```ts
export async function consumeOutboxEventOnce<T>(
  inbox: Inbox,
  input: {
    consumerName: string;
    outboxEventId: string;
    effect: () => Promise<T>;
  },
): Promise<ConsumeOutboxEventOnceResult<T>> {
  return consumeOutboxEventWithIdempotentEffect(inbox, input);
}
```

Add this comment above the new function:

```ts
// The inbox record is a replay marker, not a lock. The effect must be idempotent
// or guarded by its own database uniqueness constraints.
```

- [ ] **Step 3: Assert the payment consumer's idempotent guard**

In `apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts`, add a replay/concurrency test that proves duplicate consumer calls still create one `credit_ledger_entries` grant and one order pointer:

```ts
const [first, second] = await Promise.all([
  consumePaymentSucceededCreditGrant(db, { event, now }),
  consumePaymentSucceededCreditGrant(db, { event, now }),
]);

const ledgerCount = await db.query<{ count: number }>(
  "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order' AND source_id = $1",
  [orderId],
);

assert.equal(ledgerCount.rows[0]?.count, 1);
assert.equal(
  [first.kind, second.kind].filter((kind) => kind === "applied").length >= 1,
  true,
);
```

Run:

```powershell
npm test -- apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add apps/backend/src/modules/shared/outbox/outbox-repair.contract.ts apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts apps/backend/src/modules/credit-billing/payment-succeeded-credit-consumer.service.ts apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts
git commit -m "chore: clarify inbox consumer idempotency contract"
```

Expected: commit succeeds only after tests pass.

---

### Task 5: Final Verification And Merge Gate

**Files:**
- No new source files.

- [ ] **Step 1: Run high-risk backend tests**

Run:

```powershell
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts apps/backend/src/modules/project/tests/creator-application.service.spec.ts apps/backend/src/modules/project/tests/asset-version-record.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run entrypoint and contract tests**

Run:

```powershell
npm test -- apps/backend/src/entrypoints/tests apps/backend/src/modules/shared/contracts/tests packages
```

Expected: PASS.

- [ ] **Step 3: Run web behavior tests only if web files remain in the hardening diff**

Run:

```powershell
npm test -- apps/web/tests
```

Expected: PASS if web files remain staged. Expected: no web test target needed if Task 1 removed all web scope from the hardening branch.

- [ ] **Step 4: Run the broader suite with a longer per-file timeout**

Run:

```powershell
$env:TEST_FILE_TIMEOUT_MS='120000'; npm test -- apps packages
```

Expected: PASS. If it exceeds the shell timeout but keeps passing file-by-file, rerun the remaining directory targets individually and record the exact passed commands in the final handoff.

- [ ] **Step 5: Re-run the scope-drift check**

Run:

```powershell
git diff --cached -- apps/web/admin-ops.html apps/web/holographic-blue-theme.css apps/web/login.css apps/web/app.html apps/web/app.js docs/design
```

Expected: no output unless the product owner explicitly approved UI scope in the plan.

- [ ] **Step 6: Inspect final staged diff**

Run:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Expected: the diff is dominated by backend payment/Admin/Ops/creator hardening and tests. UI/design files are absent unless deliberately approved.

---

## Self-Review

**Spec coverage:** This plan covers all review blockers: hidden manual-review payment callbacks, duplicate creator retry side effects, hardening-vs-UI scope drift, misleading inbox semantics, and final verification gaps.

**Placeholder scan:** No task relies on deferred details. Each code-changing task includes concrete target files, snippets, commands, and expected outcomes.

**Type consistency:** The plan uses existing project names and shapes: `PaymentEventType`, `RiskEventSeverity`, `payment_risk_events`, `requestCreatorImageGenerationPlatformBatch`, `requestCreatorVideoGenerationPlatformBatch`, `createWorkflowWithTasks`, `ShotRecord`, and `consumePaymentSucceededCreditGrant`.

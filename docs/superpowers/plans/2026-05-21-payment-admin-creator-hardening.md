# Payment Admin Creator Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the review blockers in payment callbacks, Admin/Ops settlement, creator retry generation, and repository hygiene without changing the current frontend UI design.

**Architecture:** Payment callbacks record payment facts and emit outbox events; Credit/Billing grants credits through an idempotent consumer. Admin/Ops commands use the existing platform command runtime for capability, idempotency, audit, and transaction boundaries. Creator retry re-enters the existing generation/finalization pipeline instead of directly minting completed assets.

**Tech Stack:** TypeScript, Node test runner, PostgreSQL-compatible test DB, existing `runIdempotentCommand`, existing workflow task and credit ledger services.

---

## Non-Negotiable Constraints

- Do not change frontend UI appearance: no edits to CSS, layout, card structure, visual hierarchy, colors, spacing, or visible copy for design reasons.
- Frontend changes are allowed only when they are invisible behavior fixes, such as adding an `Idempotency-Key` request header in `apps/web/admin-ops.js`.
- Do not touch `apps/web/admin-ops.html`, `apps/web/holographic-blue-theme.css`, `apps/web/login.css`, or design-only markup during this repair.
- Keep payment, credit, workflow, and creator state transitions protected by tests before implementation.
- Do not commit browser profiles, screenshots, IDE state, cookies, login databases, or cache artifacts.

## File Map

- Modify: `.gitignore` - ignore local IDE state and UI screenshot/browser profile artifacts.
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts` - event type branching, transaction boundary, outbox-only payment success.
- Modify: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts` - payment failure, replay, outbox, and credit consumer coverage.
- Create: `apps/backend/src/modules/shared/outbox/sql-inbox.service.ts` - DB-backed inbox implementation for idempotent consumers.
- Create: `apps/backend/src/modules/credit-billing/payment-succeeded-credit-consumer.service.ts` - idempotently grant credits from `payment.succeeded`.
- Create: `apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts` - consumer replay and repair coverage.
- Modify: `apps/backend/src/modules/admin-ops/admin-ops.service.ts` - command runtime, atomic transitions, reservation settlement.
- Modify: `apps/backend/src/modules/credit-billing/credit-ledger.service.ts` - expose a transaction-aware reservation settlement helper.
- Modify: `apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts` - idempotency, settlement decisions, and atomic transition coverage.
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts` - pass `Idempotency-Key` into Admin/Ops service methods.
- Modify: `apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts` - HTTP idempotency header behavior.
- Modify: `apps/web/admin-ops.js` - invisible request-header-only idempotency fix.
- Modify: `apps/web/tests/admin-ops-page.spec.ts` - assert Admin/Ops JS sends idempotency headers without snapshotting UI.
- Modify: `apps/backend/src/modules/project/creator-application.service.ts` - retry status guards and reuse generation/finalization path.
- Modify: `apps/backend/src/modules/project/tests/creator-application.service.spec.ts` - retry precondition and generation path tests.
- Modify: `apps/backend/src/modules/project/asset-version-record.service.ts` - prevent concurrent version overwrite.
- Create: `apps/backend/src/modules/project/tests/asset-version-record.service.spec.ts` - concurrent version allocation/overwrite protection.

---

### Task 1: Repository Hygiene Guard

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add ignore rules**

Add these exact entries to `.gitignore`:

```gitignore
.idea/
tmp-ui-screenshots/
```

- [ ] **Step 2: Verify no sensitive artifacts are tracked**

Run:

```powershell
git ls-files .idea tmp-ui-screenshots
```

Expected: no output. If output appears, stop and remove those paths from the index before any merge.

- [ ] **Step 3: Verify worktree still shows no staged artifacts**

Run:

```powershell
git status --short -- .gitignore .idea tmp-ui-screenshots
```

Expected: `.gitignore` may be modified; `.idea` and `tmp-ui-screenshots` must not be staged.

---

### Task 2: Payment Callback Event Correctness

**Files:**
- Modify: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`

- [ ] **Step 1: Add a failing test for non-success callback events**

Append this test in the existing `describe("commerce payment service")` block:

```ts
  it("does not mark paid or grant credits for verified non-success callbacks", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-failed-callback",
        now: new Date("2026-05-21T10:00:00.000Z"),
      });
      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        },
        idempotencyKey: "intent-key-failed-callback",
        now: new Date("2026-05-21T10:01:00.000Z"),
      });

      const callbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-failed",
        merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-trade-failed",
        eventType: "payment_failed" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const callbackResponse = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T10:02:00.000Z"),
      });

      const orderRows = await db.query<{ status: string; paid_at: Date | null }>(
        "SELECT status, paid_at FROM billing_orders WHERE id = $1",
        [orderResponse.body.order.id],
      );
      const intentRows = await db.query<{ status: string }>(
        "SELECT status FROM payment_intents WHERE id = $1",
        [intentResponse.body.paymentIntent.id],
      );
      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );

      assert.equal(callbackResponse.status, 200);
      assert.equal(callbackResponse.body.providerEvent.eventType, "payment_failed");
      assert.equal(callbackResponse.body.providerEvent.processingStatus, "processed");
      assert.equal(orderRows.rows[0]?.status, "pending_payment");
      assert.equal(orderRows.rows[0]?.paid_at, null);
      assert.equal(intentRows.rows[0]?.status, "failed");
      assert.equal(ledgerCount.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
```

- [ ] **Step 2: Run the payment test and confirm it fails**

Run:

```powershell
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts
```

Expected before implementation: FAIL because `payment_failed` is currently treated like success.

- [ ] **Step 3: Add explicit event classification**

In `commerce-payment.service.ts`, add these helpers near `callbackMismatch`:

```ts
function paymentIntentStatusForCallbackEvent(
  eventType: PaymentEventType,
): PaymentIntentStatus | null {
  if (eventType === "payment_succeeded") {
    return "succeeded";
  }
  if (eventType === "payment_failed") {
    return "failed";
  }
  if (eventType === "payment_closed") {
    return "closed";
  }
  return null;
}

function shouldMarkOrderPaid(eventType: PaymentEventType): boolean {
  return eventType === "payment_succeeded";
}
```

`PaymentIntentStatus` already includes `closed`; use it for `payment_closed` and never map a non-success event to `succeeded`.

- [ ] **Step 4: Branch the callback flow before any paid/credit side effect**

Change `processPaymentCallback` so the path after mismatch validation is:

```ts
const callbackIntentStatus = paymentIntentStatusForCallbackEvent(input.body.eventType);
const providerEvent = await insertProviderEvent(deps.db, {
  body: input.body,
  joined,
  rawPayloadHash,
  signatureStatus,
  processingStatus: "processed",
  failureCode: null,
  now: input.now,
});

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

  return {
    status: 200,
    body: {
      acknowledged: true,
      duplicate: false,
      providerEvent: providerEventViewFromRow(providerEvent),
    },
  };
}
```

- [ ] **Step 5: Re-run the payment test**

Run:

```powershell
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts
```

Expected: PASS for the new non-success callback test.

---

### Task 3: Payment Transaction Boundary and Credit Consumer

**Files:**
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`
- Create: `apps/backend/src/modules/shared/outbox/sql-inbox.service.ts`
- Create: `apps/backend/src/modules/credit-billing/payment-succeeded-credit-consumer.service.ts`
- Create: `apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts`
- Modify: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`

- [ ] **Step 1: Add DB-backed inbox**

Create `apps/backend/src/modules/shared/outbox/sql-inbox.service.ts`:

```ts
import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../db/sql.ts";
import type { Inbox } from "./outbox-repair.contract.ts";

export class SqlInbox implements Inbox {
  constructor(private readonly db: SqlDatabase) {}

  async hasConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM inbox_events
          WHERE consumer_name = $1
            AND outbox_event_id = $2
        ) AS exists
      `,
      [input.consumerName, input.outboxEventId],
    );

    return result.rows[0]?.exists === true;
  }

  async markConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<void> {
    await this.db.query(
      `
        INSERT INTO inbox_events (id, consumer_name, outbox_event_id, processed_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (consumer_name, outbox_event_id) DO NOTHING
      `,
      [randomUUID(), input.consumerName, input.outboxEventId],
    );
  }
}
```

- [ ] **Step 2: Create payment succeeded credit consumer**

Create `apps/backend/src/modules/credit-billing/payment-succeeded-credit-consumer.service.ts`:

```ts
import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { OutboxEventRecord } from "../shared/outbox/outbox-dispatch-repair.service.ts";
import { consumeOutboxEventOnce } from "../shared/outbox/outbox-repair.contract.ts";
import { SqlInbox } from "../shared/outbox/sql-inbox.service.ts";
import { grantCredits, type CreditLedgerEntryRecord } from "./credit-ledger.service.ts";

interface PaymentSucceededPayload {
  order_id: string;
  payment_intent_id: string;
  payment_provider_event_id: string;
  amount_minor: number;
  currency: string;
}

interface PaidOrderRow {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  order_no: string;
  credits: number;
  status: string;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
}

export async function consumePaymentSucceededCreditGrant(
  db: SqlDatabase,
  input: {
    event: OutboxEventRecord;
    now: Date;
  },
): Promise<{ kind: "applied"; creditGrant: CreditLedgerEntryRecord } | { kind: "duplicate" }> {
  if (input.event.eventType !== eventTypes.paymentSucceeded) {
    throw new Error(`unsupported_event_type:${input.event.eventType}`);
  }

  const consumed = await consumeOutboxEventOnce(new SqlInbox(db), {
    consumerName: "credit.payment-succeeded",
    outboxEventId: input.event.id,
    effect: async () => {
      const payload = input.event.payload as unknown as PaymentSucceededPayload;
      const order = await queryOne<PaidOrderRow>(
        db,
        `
          SELECT *
          FROM billing_orders
          WHERE id = $1
            AND status = 'paid'
          LIMIT 1
        `,
        [payload.order_id],
      );
      if (!order) {
        throw new Error("paid_order_not_found");
      }

      const grant = await grantCredits(db, {
        organizationId: order.organization_id,
        amount: order.credits,
        sourceType: "payment_order",
        sourceId: order.id,
        reason: "paid order credited",
        createdByUserId: order.created_by_user_id,
        metadata: {
          orderNo: order.order_no,
          paymentIntentId: order.successful_payment_intent_id,
          paymentProviderEventId: payload.payment_provider_event_id,
        },
        now: input.now,
      });

      await db.query(
        `
          UPDATE billing_orders
          SET credit_grant_ledger_entry_id = $3,
              updated_at = $4
          WHERE organization_id = $1
            AND id = $2
        `,
        [order.organization_id, order.id, grant.id, input.now],
      );

      return grant;
    },
  });

  if (consumed.kind === "duplicate") {
    return { kind: "duplicate" };
  }

  return { kind: "applied", creditGrant: consumed.result };
}
```

- [ ] **Step 3: Add consumer replay tests**

Create `apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts` with a fixture that inserts an organization, a paid `billing_orders` row, and a `payment.succeeded` outbox event. Assert:

```ts
assert.equal(first.kind, "applied");
assert.equal(replay.kind, "duplicate");
assert.equal(ledgerCount.rows[0]?.count, 1);
assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, grantId);
assert.equal(organization.rows[0]?.credit_balance_cached, 120);
```

- [ ] **Step 4: Make payment callback transactional and outbox-only**

In `commerce-payment.service.ts`, remove the direct `grantCredits` import and remove `grantCreditsForPaidOrder` from the callback path. Wrap the provider event insert, payment intent update, billing order update, and outbox insert in a single transaction:

```ts
await deps.db.query("BEGIN");
try {
  const providerEvent = await insertProviderEvent(deps.db, {
    body: input.body,
    joined,
    rawPayloadHash,
    signatureStatus,
    processingStatus: "processed",
    failureCode: null,
    now: input.now,
  });

  await deps.db.query(
    `
      UPDATE payment_intents
      SET status = 'succeeded',
          provider_trade_id = $3,
          succeeded_at = $4,
          updated_at = $4
      WHERE organization_id = $1
        AND id = $2
        AND status IN ('created', 'submitted', 'unknown')
    `,
    [
      joined.organization_id,
      joined.payment_intent_id,
      input.body.providerTradeId,
      input.now,
    ],
  );

  const paidOrder = await queryOne<BillingOrderRow>(
    deps.db,
    `
      UPDATE billing_orders
      SET status = 'paid',
          paid_at = COALESCE(paid_at, $4),
          successful_payment_intent_id = $3,
          updated_at = $4
      WHERE organization_id = $1
        AND id = $2
        AND status = 'pending_payment'
      RETURNING *
    `,
    [
      joined.organization_id,
      joined.id,
      joined.payment_intent_id,
      input.now,
    ],
  );

  if (!paidOrder) {
    const riskEvent = await insertPaymentRiskEvent(deps.db, {
      joined,
      providerEventId: providerEvent.id,
      riskType: "payment_state_not_payable",
      severity: "critical",
      decision: "manual_review",
      metadata: {
        provider: input.body.provider,
        merchantOrderNo: input.body.merchantOrderNo,
        callbackEventType: input.body.eventType,
      },
      now: input.now,
    });
    await deps.db.query("COMMIT");
    return {
      status: 200,
      body: {
        acknowledged: true,
        duplicate: false,
        providerEvent: providerEventViewFromRow(providerEvent),
        riskEvent: riskEventViewFromRow(riskEvent),
      },
    };
  }

  await appendPaymentSucceededOutboxEvent(deps.db, {
    order: paidOrder,
    paymentIntentId: joined.payment_intent_id,
    providerEventId: providerEvent.id,
    now: input.now,
  });
  await deps.db.query("COMMIT");
  return {
    status: 200,
    body: {
      acknowledged: true,
      duplicate: false,
      providerEvent: providerEventViewFromRow(providerEvent),
      order: orderViewFromRow(paidOrder),
    },
  };
} catch (error) {
  await deps.db.query("ROLLBACK");
  throw error;
}
```

- [ ] **Step 5: Update payment success test expectations**

Change the existing success test so callback asserts:

```ts
assert.equal(callbackResponse.body.order?.status, "paid");
assert.equal(callbackResponse.body.creditGrant, undefined);
```

Then fetch the outbox event and consume it:

```ts
const outbox = await db.query<{
  id: string;
  organization_id: string | null;
  event_type: string;
  payload_json: Record<string, unknown>;
  status: "pending" | "processing" | "processed" | "failed";
  available_at: Date;
  processed_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}>("SELECT * FROM outbox_events WHERE event_type = 'payment.succeeded'");

const consumed = await consumePaymentSucceededCreditGrant(db, {
  event: {
    id: outbox.rows[0]!.id,
    organizationId: outbox.rows[0]!.organization_id,
    eventType: outbox.rows[0]!.event_type,
    payload: outbox.rows[0]!.payload_json,
    status: outbox.rows[0]!.status,
    availableAt: new Date(outbox.rows[0]!.available_at),
    processedAt: outbox.rows[0]!.processed_at,
    errorMessage: outbox.rows[0]!.error_message,
    createdAt: new Date(outbox.rows[0]!.created_at),
    updatedAt: new Date(outbox.rows[0]!.updated_at),
  },
  now: new Date("2026-05-21T08:02:30.000Z"),
});

assert.equal(consumed.kind, "applied");
```

- [ ] **Step 6: Run payment and credit tests**

Run:

```powershell
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts
```

Expected: PASS.

---

### Task 4: Admin/Ops Command Idempotency and Atomic Transitions

**Files:**
- Modify: `apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts`
- Modify: `apps/backend/src/modules/admin-ops/admin-ops.service.ts`
- Modify: `apps/backend/src/modules/credit-billing/credit-ledger.service.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts`
- Modify: `apps/web/admin-ops.js`
- Modify: `apps/web/tests/admin-ops-page.spec.ts`

- [ ] **Step 1: Change service inputs to require idempotency keys**

Update these methods to accept `idempotencyKey: string`:

```ts
manualSettleTask(input: { user: AuthenticatedOpsUser; body: ManualSettleBody; idempotencyKey: string; now: Date })
retryTask(input: { user: AuthenticatedOpsUser; body: RetryTaskBody; idempotencyKey: string; now: Date })
markPaymentRiskReviewed(input: { user: AuthenticatedOpsUser; body: MarkRiskBody; idempotencyKey: string; now: Date })
repairPaidWithoutCredit(input: { user: AuthenticatedOpsUser; body: RepairPaidBody; idempotencyKey: string; now: Date })
```

- [ ] **Step 2: Add failing idempotency tests**

In `admin-ops.service.spec.ts`, update existing calls to include `idempotencyKey`. Then add:

```ts
const first = await service.retryTask({
  user: { sessionToken: adminSession.token },
  idempotencyKey: "ops-retry-same-key",
  body: { taskId: failedTaskId, reason: "Transient provider timeout fixed." },
  now: new Date("2026-05-19T10:05:00.000Z"),
});
const replay = await service.retryTask({
  user: { sessionToken: adminSession.token },
  idempotencyKey: "ops-retry-same-key",
  body: { taskId: failedTaskId, reason: "Transient provider timeout fixed." },
  now: new Date("2026-05-19T10:06:00.000Z"),
});

assert.equal(first.status, 200);
assert.equal(replay.status, 200);
assert.equal(replay.body.task.id, first.body.task.id);
```

Add a conflicting replay assertion:

```ts
const conflict = await service.retryTask({
  user: { sessionToken: adminSession.token },
  idempotencyKey: "ops-retry-same-key",
  body: { taskId: failedTaskId, reason: "Different reason." },
  now: new Date("2026-05-19T10:07:00.000Z"),
});

assert.equal(conflict.status, 409);
assert.deepEqual(conflict.body, { error: "idempotency_conflict" });
```

- [ ] **Step 3: Wrap Admin/Ops methods in `runIdempotentCommand`**

In `admin-ops.service.ts`, import the command contracts and runtime:

```ts
import {
  adminRetryTaskCommand,
  manualSettleUnknownTaskCommand,
  markPaymentRiskReviewedCommand,
  repairPaidWithoutCreditCommand,
} from "../../../../../packages/contracts/api/admin-ops.commands.ts";
import { runIdempotentCommand } from "../shared/command/platform-command-runtime.ts";
```

Use this shape for each command:

```ts
const executed = await runIdempotentCommand({
  db: deps.db,
  operationName: adminRetryTaskCommand.operationName,
  capability: adminRetryTaskCommand.capability,
  idempotencyKey: input.idempotencyKey,
  requestHash: hashJson(input.body),
  now: input.now,
  resolveActor: (db) => resolveOpsActor(db, input.user.sessionToken, input.now),
  replay: async ({ idempotencyRecord }) => {
    const task = await findTaskById(deps.db, idempotencyRecord.responseResourceId);
    if (!task) {
      throw new Error("ops_replay_missing_task");
    }
    return { task: taskViewFromRow(task) };
  },
  execute: async ({ actor }) => {
    const task = await transitionTaskForRetry(deps.db, {
      actor,
      taskId: input.body.taskId,
      reason,
      now: input.now,
    });
    return {
      result: { task: taskViewFromRow(task) },
      responseResourceType: "task",
      responseResourceId: task.id,
      responseSnapshot: { task: taskViewFromRow(task) },
      audit: {
        eventType: adminRetryTaskCommand.auditEvent,
        targetType: "task",
        targetId: task.id,
        workspaceId: actor.workspaceId,
        reason,
      },
    };
  },
});

return { status: 200, body: executed.result };
```

- [ ] **Step 4: Make task transitions atomic inside the command transaction**

Replace read-then-update transitions with conditional updates:

```ts
const task = await queryOne<TaskRow>(
  deps.db,
  `
    UPDATE tasks
    SET status = 'queued',
        failure_code = NULL,
        locked_by = NULL,
        locked_until = NULL,
        heartbeat_at = NULL,
        updated_at = $4
    WHERE organization_id = $1
      AND id = $2
      AND status IN ('failed', 'canceled')
      AND attempt_count < max_attempts
    RETURNING *
  `,
  [actor.organizationId, input.body.taskId, reason, input.now],
);

if (!task) {
  throw new AdminOpsError("task_not_retryable");
}
```

Manual settlement must use the same conditional update pattern for `result_unknown|manual_review_required`.

- [ ] **Step 5: Pass HTTP idempotency header**

In `phone-auth-dev-server.ts`, for every Admin/Ops POST handler, pass:

```ts
idempotencyKey: idempotencyKeyFromRequest(request),
```

Do not invent timestamp-based keys on the server for Admin/Ops commands.

- [ ] **Step 6: Add invisible frontend request-header support**

In `apps/web/admin-ops.js`, change `postJson` only:

```js
function createIdempotencyKey(action, body) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const subject = body.taskId ?? body.riskEventId ?? body.orderId ?? "unknown";
  return `admin-ops:${action}:${subject}:${id}`;
}

function postJson(url, body, action = "command") {
  return fetchJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": createIdempotencyKey(action, body),
    },
    body: JSON.stringify(body),
  });
}
```

Update call sites to pass the action string:

```js
await postJson("/api/admin/ops/tasks/retry", { taskId, reason }, "retry-task");
```

This is a behavior-only change. It must not alter DOM structure, classes, labels, CSS, or visual layout.

- [ ] **Step 7: Run Admin/Ops tests**

Run:

```powershell
npm test -- apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts apps/web/tests/admin-ops-page.spec.ts
```

Expected: PASS.

---

### Task 5: Admin/Ops Manual Settlement Economic Correctness

**Files:**
- Modify: `apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts`
- Modify: `apps/backend/src/modules/admin-ops/admin-ops.service.ts`

- [ ] **Step 1: Extend the fixture with a reservation**

In `seedWorkflowAndTasks`, after inserting the unknown task and provider request, insert a credit reservation tied to `unknownTaskId`:

```sql
INSERT INTO credit_reservations (
  id,
  organization_id,
  workspace_id,
  project_id,
  workflow_id,
  task_id,
  amount_total,
  amount_reserved,
  amount_consumed,
  amount_released,
  status,
  source_type,
  source_id,
  reason,
  metadata_json,
  created_by_user_id
)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  $1,
  $2,
  NULL,
  $3,
  $4,
  10,
  10,
  0,
  0,
  'active',
  'task',
  $4,
  'test reservation',
  '{}'::jsonb,
  $5
)
```

- [ ] **Step 2: Add settlement decision tests**

For `decision: "release"`, assert:

```ts
assert.equal(settled.status, 200);
assert.equal(settled.body.task.status, "succeeded");
assert.equal(reservation.rows[0]?.amount_reserved, 0);
assert.equal(reservation.rows[0]?.amount_released, 10);
assert.equal(ledger.rows[0]?.entry_type, "release");
```

Add separate tests for:

```ts
decision: "consume"              // ledger entry_type = "consume"
decision: "mark_abnormal_cost"   // task does not become normal succeeded without an abnormal-cost marker
```

For `mark_abnormal_cost`, expected behavior:

```ts
assert.equal(settled.body.task.status, "manual_review_required");
assert.equal(reservation.rows[0]?.status, "manual_review_required");
```

- [ ] **Step 3: Expose a transaction-aware settlement helper**

In `credit-ledger.service.ts`, split the body of `settleReservationAllocation` into a helper that assumes the caller already owns the transaction:

```ts
export async function settleReservationAllocationInTransaction(
  db: SqlDatabase,
  input: {
    reservationId: string;
    allocationKey: string;
    amount: number;
    outcome: CreditAllocationOutcome;
    taskId?: string | null;
    attemptId?: string | null;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
    now: Date;
  },
): Promise<{
  allocation: CreditReservationAllocationRecord;
  ledgerEntry: CreditLedgerEntryRecord | null;
  reservation: CreditReservationRecord;
}> {
  assertPositiveAmount(input.amount);

  const reservation = await findReservationById(db, input.reservationId);
  if (!reservation) {
    throw new CreditReservationNotFoundError();
  }

  const existingAllocation = await findAllocationByKey(db, {
    reservationId: input.reservationId,
    allocationKey: input.allocationKey,
  });

  if (existingAllocation) {
    assertAllocationReplayMatches(existingAllocation, input);
    const ledgerEntry = existingAllocation.settledLedgerEntryId
      ? await findLedgerEntryById(db, existingAllocation.settledLedgerEntryId)
      : null;
    return { allocation: existingAllocation, ledgerEntry, reservation };
  }

  const allocationId = randomUUID();
  const allocationRow = await queryOne<CreditReservationAllocationRow>(
    db,
    `
      INSERT INTO credit_reservation_allocations (
        id,
        reservation_id,
        organization_id,
        task_id,
        attempt_id,
        provider_request_id,
        allocation_key,
        amount,
        status,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)
      RETURNING *
    `,
    [
      allocationId,
      reservation.id,
      reservation.organizationId,
      input.taskId ?? null,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.allocationKey,
      input.amount,
      input.outcome,
      JSON.stringify(input.metadata ?? {}),
      input.now,
    ],
  );

  if (input.outcome === "manual_review_required") {
    const reviewedReservation = await markReservationManualReviewRequired(db, {
      reservationId: reservation.id,
      now: input.now,
    });

    return {
      allocation: allocationFromRow(allocationRow!),
      ledgerEntry: null,
      reservation: reviewedReservation,
    };
  }

  const ledgerEntryType = input.outcome === "consumed" ? "consume" : "release";
  const deltas =
    input.outcome === "consumed"
      ? { availableDelta: 0, reservedDelta: -input.amount, consumedDelta: input.amount }
      : { availableDelta: input.amount, reservedDelta: -input.amount, consumedDelta: 0 };

  const updatedReservation = await applyReservationSettlement(db, {
    reservationId: reservation.id,
    amount: input.amount,
    outcome: input.outcome,
    now: input.now,
  });

  const ledger = await insertLedgerEntry(db, {
    organizationId: reservation.organizationId,
    reservationId: reservation.id,
    allocationId,
    entryType: ledgerEntryType,
    amount: input.amount,
    ...deltas,
    sourceType: "credit_reservation_allocation",
    sourceId: allocationId,
    reason: `reservation allocation ${input.outcome}`,
    metadata: input.metadata ?? {},
    createdByUserId: null,
    now: input.now,
  });

  await db.query(
    `
      UPDATE organizations
      SET credit_balance_cached = credit_balance_cached + $2,
          credit_reserved_cached = credit_reserved_cached - $3,
          updated_at = $4
      WHERE id = $1
    `,
    [
      reservation.organizationId,
      input.outcome === "released" ? input.amount : 0,
      input.amount,
      input.now,
    ],
  );

  const settledAllocation = await queryOne<CreditReservationAllocationRow>(
    db,
    `
      UPDATE credit_reservation_allocations
      SET settled_ledger_entry_id = $2,
          updated_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [allocationId, ledger.entry.id, input.now],
  );

  return {
    allocation: allocationFromRow(settledAllocation!),
    ledgerEntry: ledger.entry,
    reservation: updatedReservation,
  };
}
```

Then reduce the public function to transaction management:

```ts
export async function settleReservationAllocation(
  db: SqlDatabase,
  input: Parameters<typeof settleReservationAllocationInTransaction>[1],
) {
  await db.query("BEGIN");
  try {
    const result = await settleReservationAllocationInTransaction(db, input);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

```

- [ ] **Step 4: Implement Admin/Ops settlement with the transaction-aware helper**

Import:

```ts
import { settleReservationAllocationInTransaction } from "../credit-billing/credit-ledger.service.ts";
```

Map decisions explicitly:

```ts
function settlementOutcomeForDecision(decision: string) {
  if (decision === "consume") {
    return "consumed";
  }
  if (decision === "release") {
    return "released";
  }
  if (decision === "mark_abnormal_cost") {
    return "manual_review_required";
  }
  throw new AdminOpsError("invalid_settlement_decision");
}
```

Inside the `runIdempotentCommand` transaction, find the reservation for the task:

```ts
const reservation = await queryOne<{ id: string; amount_reserved: number }>(
  deps.db,
  `
    SELECT id, amount_reserved
    FROM credit_reservations
    WHERE organization_id = $1
      AND task_id = $2
      AND status IN ('active', 'partially_settled')
    ORDER BY created_at DESC
    LIMIT 1
  `,
  [actor.organizationId, input.body.taskId],
);
```

If a reservation exists, settle it:

```ts
await settleReservationAllocationInTransaction(deps.db, {
  reservationId: reservation.id,
  allocationKey: `${input.body.taskId}:manual-settlement`,
  amount: reservation.amount_reserved,
  outcome: settlementOutcomeForDecision(input.body.decision),
  taskId: task.id,
  attemptId: task.current_attempt_id,
  providerRequestId: providerRequest?.id ?? null,
  metadata: {
    decision: input.body.decision,
    reason,
  },
  now: input.now,
});
```

- [ ] **Step 5: Ensure task status matches the economic decision**

Use this rule:

```ts
const finalTaskStatus =
  input.body.decision === "mark_abnormal_cost" ? "manual_review_required" : "succeeded";
```

Then update task and attempt with conditional SQL that includes the exact status guard:

```sql
WHERE organization_id = $1
  AND id = $2
  AND status IN ('result_unknown', 'manual_review_required')
RETURNING *
```

- [ ] **Step 6: Run settlement tests**

Run:

```powershell
npm test -- apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts apps/backend/src/modules/credit-billing/tests/credit-ledger-persistence.spec.ts
```

Expected: PASS.

---

### Task 6: Creator Retry Must Reuse Generation Boundaries

**Files:**
- Modify: `apps/backend/src/modules/project/tests/creator-application.service.spec.ts`
- Modify: `apps/backend/src/modules/project/creator-application.service.ts`

- [ ] **Step 1: Add backend guard tests**

Add this test in `creator-application.service.spec.ts`:

```ts
  it("rejects retry for shots that have not failed or gone stale", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-retry-guard");
      const creator = createCreatorApplication({ db, workspaceId });
      const user = { id: userId, sessionToken: session.token };

      await creator.createProject({
        user,
        body: {
          name: "Creator retry guard",
          scriptInput: "Episode retry guard.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-retry-guard-create",
        now: new Date("2026-05-18T16:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-retry-guard-parse",
        now: new Date("2026-05-18T16:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T16:02:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        "SELECT id FROM shots ORDER BY created_at ASC LIMIT 1",
      );
      const shotId = firstShot.rows[0]!.id;

      const imageRetry = await (creator as any).retryShotImage({
        user,
        body: { shotId },
        now: new Date("2026-05-18T16:03:00.000Z"),
      });
      const videoRetry = await (creator as any).retryShotVideo({
        user,
        body: { shotId },
        now: new Date("2026-05-18T16:04:00.000Z"),
      });

      assert.equal(imageRetry.status, 409);
      assert.deepEqual(imageRetry.body, { error: "shot_image_retry_unavailable" });
      assert.equal(videoRetry.status, 409);
      assert.deepEqual(videoRetry.body, { error: "current_image_required" });
    } finally {
      await db.close();
    }
  });
```

- [ ] **Step 2: Remove `ready` from retry-eligible statuses**

In `creator-application.service.ts`, change:

```ts
if (!["ready", "failed", "stale"].includes(shot.imageStatus)) {
```

to:

```ts
if (!["failed", "stale"].includes(shot.imageStatus)) {
```

And change:

```ts
if (!["ready", "failed", "stale"].includes(shot.videoStatus)) {
```

to:

```ts
if (!["failed", "stale"].includes(shot.videoStatus)) {
```

- [ ] **Step 3: Reuse the existing creator generation methods**

In `retryShotImage`, get both `creatorApp` and `sqlState`:

```ts
const { creatorApp, sqlState } = getCreatorState(input.user.id);
```

After `requestCreatorImageGenerationPlatformBatch`, replace direct `createShotAssetVersionSnapshot` and manual `retriedShot` construction with:

```ts
const generated = await creatorApp.generateImagesForTasks([
  {
    shotId: shot.id,
    taskId: task.taskId,
    storageObjectKey: task.storageObjectKey,
    sourceAttemptId: task.attemptId,
  },
]);
```

Then persist the returned shot and asset version through the same `finalizeTaskAttempt` pattern used by `generateImages`.

- [ ] **Step 4: Reuse the existing video generation method**

In `retryShotVideo`, replace direct snapshot creation with:

```ts
const generated = await creatorApp.generateVideosForTasks([
  {
    shotId: shot.id,
    taskId: task.taskId,
    storageObjectKey: task.storageObjectKey,
    sourceAttemptId: task.attemptId,
  },
]);
```

Persist using the same success/failure logic as `generateVideos`.

- [ ] **Step 5: Run creator tests**

Run:

```powershell
npm test -- apps/backend/src/modules/project/tests/creator-application.service.spec.ts apps/backend/src/modules/project/tests/shot-image-generation.service.spec.ts
```

Expected: PASS.

---

### Task 7: Asset Version Concurrency Protection

**Files:**
- Modify: `apps/backend/src/modules/project/asset-version-record.service.ts`
- Create: `apps/backend/src/modules/project/tests/asset-version-record.service.spec.ts`
- Modify: `apps/backend/src/modules/project/creator-application.service.ts`

- [ ] **Step 1: Add overwrite protection test**

Add a test that inserts an asset version with `(asset_id, version_number) = (assetId, 1)`, then attempts to insert a different snapshot with the same pair. Expected behavior must be conflict or retry, not overwrite:

```ts
await upsertAssetVersionSnapshot(db, firstSnapshot);
await assert.rejects(
  () => upsertAssetVersionSnapshot(db, conflictingSnapshot),
  /asset_version_conflict/,
);
```

- [ ] **Step 2: Replace upsert overwrite with conflict detection**

In `asset-version-record.service.ts`, change the `ON CONFLICT (asset_id, version_number) DO UPDATE` behavior to conflict detection:

```sql
ON CONFLICT (asset_id, version_number) DO NOTHING
RETURNING *
```

If the insert returns no row, read the existing version and throw `new Error("asset_version_conflict")` when `storage_object_id`, `source_task_id`, or `source_attempt_id` differs from the attempted snapshot. Do not overwrite those fields for an existing version.

- [ ] **Step 3: Allocate version numbers in a locked transaction**

In `createShotAssetVersionSnapshot`, replace `MAX(version_number) + 1` outside a lock with a transaction that locks the asset row before calculating the next number:

```sql
SELECT id
FROM assets
WHERE organization_id = $1
  AND project_id = $2
  AND asset_key = $3
FOR UPDATE
```

Then calculate and insert the next version in the same transaction.

- [ ] **Step 4: Run asset tests**

Run:

```powershell
npm test -- apps/backend/src/modules/project/tests/asset-version-record.service.spec.ts apps/backend/src/modules/project/tests/creator-application.service.spec.ts
```

Expected: PASS.

---

### Task 8: Full Verification Pass

**Files:**
- No new source files.

- [ ] **Step 1: Run targeted backend tests**

Run:

```powershell
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts apps/backend/src/modules/admin-ops/tests/admin-ops.service.spec.ts apps/backend/src/modules/project/tests/creator-application.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run entrypoint and frontend behavior tests**

Run:

```powershell
npm test -- apps/backend/src/entrypoints/tests/admin-ops-http.spec.ts apps/web/tests/admin-ops-page.spec.ts apps/web/tests/creator-workbench-view.spec.ts
```

Expected: PASS. These tests must not assert visual redesign.

- [ ] **Step 3: Run broader package/app suite**

Run:

```powershell
npm test -- apps packages
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff for UI drift**

Run:

```powershell
git diff -- apps/web/admin-ops.html apps/web/holographic-blue-theme.css apps/web/login.css apps/web/app.html
```

Expected: no output.

Run:

```powershell
git diff -- apps/web/admin-ops.js
```

Expected: only behavior-only idempotency header changes.

---

## Self-Review

**Spec coverage:** The plan covers all review blockers: payment event correctness, payment transaction/idempotent credit grant, Admin/Ops idempotency, manual settlement economics, atomic task transitions, creator retry boundary, asset version concurrency, and sensitive local artifacts.

**Placeholder scan:** No `TBD`, deferred edge cases, or generic "add tests" steps remain. Every task names files, commands, and expected outcomes.

**Type consistency:** The plan uses existing names where confirmed: `runIdempotentCommand`, `settleReservationAllocation`, `finalizeTaskAttempt`, `aggregateWorkflowStatus`, `consumeOutboxEventOnce`, `outbox_events`, and `inbox_events`. Any state enum addition for `closed` must be validated against `packages/contracts/domain/states.ts` before implementation.

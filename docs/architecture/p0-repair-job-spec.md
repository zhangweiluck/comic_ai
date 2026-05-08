# P0 Repair Job Spec

> Status: M0.1 implementation contract
> Date: 2026-05-08
> Owner: Reliability owner + owning domain modules
> Purpose: define scan conditions, idempotent actions, and tests for known eventual-consistency gaps.

## 1. Rule

Repair jobs do not invent alternate business paths. They re-enter the same domain transition functions used by normal commands, callbacks, workers, or event consumers.

Every repair job must have:

- owning module
- scan condition
- row-locking strategy
- idempotent action
- retry/backoff behavior
- audit/risk/reconciliation output where relevant
- verification test

## 2. Repair Job Inventory

| Job | Owner | Stage | Cadence | Primary Risk |
| --- | --- | --- | --- | --- |
| `outbox_dispatch_repair` | Shared infrastructure/domain owner | M4 | every 30s-1m | Event stuck before dispatch. |
| `queued_task_dispatch_repair` | Workflow/Task | M4 | every 1m | Redis job lost while PostgreSQL task is queued. |
| `stale_running_task_repair` | Workflow/Task | M4 | every 1m | Worker died mid-task. |
| `provider_result_reconciliation` | ModelGateway + Workflow/Task | M3/M4 | provider-specific | Provider accepted work but local result is unknown. |
| `credit_balance_reconciliation` | Credit/Billing | M4 | every 5m + daily | Read model drift from ledger. |
| `paid_without_credit_repair` | Commerce/Payment + Credit/Billing | M5 | every 5m | Paid order did not grant credits. |
| `payment_intent_expiry_reconciliation` | Commerce/Payment | M5 | every 10m | Expired local payment may have late provider success. |
| `payment_provider_event_reprocess` | Commerce/Payment | M5 | every 5m | Durable valid callback was not fully applied. |
| `refund_unknown_reconciliation` | Commerce/Payment | M5 | every 10m/hourly | Refund provider result unknown. |
| `invoice_refund_manual_review` | Commerce/Payment + Admin/Ops | M5 | daily + on demand | Refund conflicts with issued invoice. |

## 3. Common Locking Pattern

Repair jobs should process small batches.

```sql
SELECT id
FROM <table>
WHERE <scan condition>
ORDER BY created_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Rules:

- Never full-table lock high-volume tables.
- Never bypass tenant scope in mutation.
- Use stable IDs and domain commands after selecting candidates.
- Re-running the same job must no-op or produce the same business outcome.

## 4. Job Specs

### 4.1 `outbox_dispatch_repair`

Owner: Shared infrastructure with event producer ownership.

Scan:

```sql
SELECT id
FROM outbox_events
WHERE status IN ('pending', 'failed')
  AND available_at <= now()
ORDER BY available_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Mark event `processing`.
2. Publish same `event_id` and payload to the target transport.
3. Mark `processed` only after transport acknowledges.
4. On transient failure, mark `failed`, increment retry metadata, and set next `available_at`.

Idempotency:

- Event ID is stable.
- Consumers use `inbox_events(consumer_name, outbox_event_id)`.

Test:

- `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts`

### 4.2 `queued_task_dispatch_repair`

Owner: Workflow/Task.

Scan:

```sql
SELECT id
FROM tasks
WHERE status = 'queued'
  AND scheduled_at <= now()
  AND (
    last_dispatched_at IS NULL
    OR last_dispatched_at < now() - interval '2 minutes'
  )
ORDER BY scheduled_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Confirm task is still `queued`.
2. Publish BullMQ job using `task_id` as deduplication key where possible.
3. Update `last_dispatched_at`.

Idempotency:

- Worker claim protocol is the real duplicate guard.
- Duplicate BullMQ jobs exit if the task was already claimed.

Schema note:

Add `last_dispatched_at timestamptz NULL` to `tasks` during migration planning if the repair query uses it.

Test:

- `apps/backend/src/modules/workflow-task/tests/redis-loss-repair.spec.ts`

### 4.3 `stale_running_task_repair`

Owner: Workflow/Task.

Scan:

```sql
SELECT id
FROM tasks
WHERE status = 'running'
  AND locked_until < now()
ORDER BY locked_until ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Decision table:

| Provider Request State | External Started? | Action | Credit Action |
| --- | --- | --- | --- |
| none | n/a | mark attempt failed retryable; requeue if attempts remain | none |
| `submitted` | false/null | mark attempt failed retryable; requeue if attempts remain | none |
| `submitted`/`accepted`/`running` | true | move task/attempt to `result_unknown` | keep allocation reserved |
| `succeeded` | true | run finalization transaction | consume allocation if output accepted |
| `failed` retryable | true/false | fail attempt; requeue/fallback if safe | release old allocation if no billable output |
| `failed` non-retryable | true/false | fail task | release unless policy says provider cost is billable |
| `result_unknown` | true | enqueue/provider reconciliation | keep reserved |
| `manual_review_required` | true | no-op except alert/Admin visibility | keep reserved |

Idempotency:

- Finalization locks task/attempt/target rows.
- Allocation settlement is single-outcome.

Tests:

- `apps/backend/src/modules/workflow-task/tests/lease-repair-before-provider.spec.ts`
- `apps/backend/src/modules/model-gateway/tests/accepted-crash-result-unknown.spec.ts`
- `apps/backend/src/modules/workflow-task/tests/finalization-rollback.spec.ts`

### 4.4 `provider_result_reconciliation`

Owner: ModelGateway + Workflow/Task.

Scan:

```sql
SELECT id
FROM provider_requests
WHERE status IN ('accepted', 'running', 'result_unknown')
  AND external_submission_started_at IS NOT NULL
  AND submitted_at < now() - (output_lookup_ttl_seconds || ' seconds')::interval
ORDER BY submitted_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Use the provider policy snapshot on `provider_requests`.
2. If lookup is supported, query by `client_request_id` or provider ID.
3. Normalize result.
4. Re-enter finalization or failure transition.
5. If lookup TTL is exhausted or lookup unsupported, move to `manual_review_required`.

Idempotency:

- Same provider result applied through same finalization command.
- ProviderRequest terminal status is not rewritten except safe metadata enrichment.

Tests:

- `apps/backend/src/modules/model-gateway/tests/lookup-ttl-manual-review.spec.ts`
- `apps/backend/src/modules/model-gateway/tests/crash-after-external-start.spec.ts`

### 4.5 `credit_balance_reconciliation`

Owner: Credit/Billing.

Scan:

```sql
WITH recomputed AS (
  SELECT
    organization_id,
    COALESCE(sum(available_delta), 0) AS available,
    COALESCE(sum(reserved_delta), 0) AS reserved,
    COALESCE(sum(consumed_delta), 0) AS consumed
  FROM credit_ledger_entries
  GROUP BY organization_id
)
SELECT o.id, r.available, r.reserved
FROM organizations o
JOIN recomputed r ON r.organization_id = o.id
WHERE o.credit_balance_cached IS DISTINCT FROM r.available
   OR o.credit_reserved_cached IS DISTINCT FROM r.reserved;
```

Action:

1. Lock the organization row.
2. Recompute ledger totals.
3. Update read-model cache fields only.
4. Emit metric and optional reconciliation audit event.

Idempotency:

- Ledger is never edited.
- Repeating recomputation produces same cache values.

Test:

- `apps/backend/src/modules/credit-billing/tests/balance-drift-repair.spec.ts`

### 4.6 `paid_without_credit_repair`

Owner: Commerce/Payment + Credit/Billing.

Scan:

```sql
SELECT o.id
FROM orders o
WHERE o.status = 'paid'
  AND NOT EXISTS (
    SELECT 1
    FROM credit_ledger_entries cle
    WHERE cle.organization_id = o.organization_id
      AND cle.entry_type = 'grant'
      AND cle.source_type = 'payment_order'
      AND cle.source_id = o.id
  )
ORDER BY o.paid_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Re-emit or reconsume `payment.succeeded` through the same event consumer.
2. Credit/Billing inserts grant ledger row with source uniqueness.

Idempotency:

- Inbox unique `(consumer_name, outbox_event_id)`.
- Ledger unique payment grant per source.

Test:

- `apps/backend/src/modules/credit-billing/tests/paid-without-credit-repair.spec.ts`

### 4.7 `payment_intent_expiry_reconciliation`

Owner: Commerce/Payment.

Scan:

```sql
SELECT id
FROM payment_intents
WHERE status IN ('submitted', 'unknown')
  AND expires_at < now()
ORDER BY expires_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Query provider before local expiry/closure.
2. If provider succeeded, apply the same verified payment-success transition.
3. If provider unpaid/closed, expire/close locally.
4. If provider result uncertain, keep or move to `unknown`/manual review according to provider policy.

Idempotency:

- Provider trade/order uniqueness prevents duplicate paid transition.
- Credit grant still only occurs through `payment.succeeded`.

Test:

- `apps/backend/src/modules/commerce-payment/tests/payment-intent-expiry-reconciliation.spec.ts`

### 4.8 `payment_provider_event_reprocess`

Owner: Commerce/Payment.

Scan:

```sql
SELECT id
FROM payment_provider_events
WHERE status IN ('received')
  AND created_at < now() - interval '1 minute'
ORDER BY created_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Re-run signature and payload verification if raw/verifiable material is retained.
2. Normalize the event.
3. Apply the same callback transition.
4. Mark `processed`, `rejected`, `duplicate`, `unmatched`, or `manual_review_required`.

Idempotency:

- Provider event unique key and provider trade/order unique constraints prevent duplicate effects.

Test:

- `apps/backend/src/modules/commerce-payment/tests/provider-event-reprocess.spec.ts`

### 4.9 `refund_unknown_reconciliation`

Owner: Commerce/Payment.

Scan:

```sql
SELECT id
FROM payment_refunds
WHERE status IN ('submitted', 'unknown')
  AND updated_at < now() - interval '10 minutes'
ORDER BY updated_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Query provider refund status.
2. Apply same refund transition.
3. On success, publish `payment.refund.succeeded`.
4. On conflict/uncertainty, move to `manual_review_required`.

Idempotency:

- Refund provider transaction/source unique.
- Credit reversal uses ledger source uniqueness and Admin/Ops policy.

Test:

- `apps/backend/src/modules/commerce-payment/tests/refund-unknown-reconciliation.spec.ts`

### 4.10 `invoice_refund_manual_review`

Owner: Commerce/Payment + Admin/Ops.

Scan:

```sql
SELECT r.id
FROM payment_refunds r
JOIN invoice_records ir
  ON ir.organization_id = r.organization_id
 AND ir.order_id = r.order_id
WHERE r.status = 'pending'
  AND ir.status = 'issued'
  AND NOT EXISTS (
    SELECT 1
    FROM invoice_records red
    WHERE red.organization_id = ir.organization_id
      AND red.red_letter_of_invoice_id = ir.id
      AND red.status = 'red_letter_issued'
  )
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Action:

1. Mark refund `manual_review_required`.
2. Create Admin/Ops review item.
3. Do not submit provider refund automatically.

Idempotency:

- Existing manual review item no-ops.
- No provider side effect occurs before finance-approved state.

Test:

- `apps/backend/src/modules/commerce-payment/tests/invoice-refund-gate.spec.ts`

## 5. M0.1 Exit Criteria

- [x] Each repair job has a scan condition.
- [x] Each repair job re-enters a domain command/transition.
- [x] Each repair job has at least one test in `p0-verification-plan.md`.
- [x] Scheduler cadence is defined per job.
- [x] Any job that can affect money, credits, provider cost, or manual settlement emits audit/risk/reconciliation visibility.

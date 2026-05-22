# P0 Creator Ops Runbook

This runbook supports Developer C task C9: the creator loop must be diagnosable, recoverable, and safe for manual intervention.

## Signals

- Creator API failures: HTTP 401/403/409/500 from `/api/auth/*`, `/api/creator/*`, and `/api/admin/ops/*`.
- Workflow stalls: `workflows.status` or `tasks.status` remains `running` beyond the lease window.
- Ambiguous provider outcomes: `provider_requests.status = result_unknown`.
- Manual intervention required: `tasks.status = manual_review_required` or `credit_reservations.status = manual_review_required`.
- Payment risk: open `payment_risk_events` rows require review before any manual allow/ignore decision.
- Paid without credit: paid `billing_orders` with no `credit_grant_ledger_entry_id` and no `payment_order` credit ledger grant require repair.
- Export delivery risk: `export_records.missing_asset_count > 0` or missing signed URL refresh path.
- User-facing trace: preserve `traceId` or task/provider ids in every escalation note.

## Query Entrypoints

Use these SQL entrypoints when the Admin/Ops Lite UI is unavailable:

```sql
SELECT id, workflow_type, status, project_id, failure_code, updated_at
FROM workflows
WHERE status IN ('running', 'result_unknown', 'manual_review_required', 'failed')
ORDER BY updated_at DESC
LIMIT 50;
```

```sql
SELECT id, workflow_id, task_type, status, current_attempt_id, failure_code, updated_at
FROM tasks
WHERE status IN ('running', 'result_unknown', 'manual_review_required', 'failed', 'canceled')
ORDER BY updated_at DESC
LIMIT 50;
```

```sql
SELECT id, task_id, provider_name, provider_operation, status, external_request_id, failure_code, updated_at
FROM provider_requests
WHERE status IN ('result_unknown', 'manual_review_required', 'failed')
ORDER BY updated_at DESC
LIMIT 50;
```

```sql
SELECT id, order_id, payment_intent_id, risk_type, severity, decision, status, created_at
FROM payment_risk_events
WHERE status = 'open'
ORDER BY created_at DESC
LIMIT 50;
```

```sql
SELECT bo.id, bo.order_no, bo.credits, bo.amount_minor, bo.currency, bo.paid_at
FROM billing_orders bo
LEFT JOIN credit_ledger_entries cle
  ON cle.organization_id = bo.organization_id
 AND cle.source_type = 'payment_order'
 AND cle.source_id = bo.id
 AND cle.entry_type = 'grant'
WHERE bo.status = 'paid'
  AND bo.credit_grant_ledger_entry_id IS NULL
  AND cle.id IS NULL
ORDER BY bo.paid_at DESC
LIMIT 50;
```

## Repair Commands

- Run the testable regression gate before release:

```bash
npm test -- apps packages
```

- Run the creator E2E gate when validating a user-facing creator incident:

```bash
npm test -- apps/web/e2e/p0
```

- Start the local creator server for manual diagnosis:

```bash
npm run dev:phone-auth
```

## Manual Intervention

- For `result_unknown`, verify provider state by `provider_requests.external_request_id` before marking a task settled.
- For `manual_review_required`, require a human reason before any retry, settle, credit release, or abnormal-cost mark.
- For payment risk, review the provider event, order snapshot, amount, currency, and merchant identity before marking the risk reviewed.
- For paid-without-credit, use the Admin/Ops repair action so the system grants through the idempotent `payment_order` credit ledger source.
- For export failures, inspect the latest `export_records` row and compare `missing_asset_count` with the current shot image/video pointers.
- For auth failures, use only masked phone numbers in notes. Never paste challenge code, session token, or raw phone into logs.
- Every manual action must write an `audit_events` row with `event_type`, `target_type`, `target_id`, `reason`, and non-sensitive metadata.

## Rollback Conditions

- More than one creator E2E failure in the same release candidate.
- Any successful UI path that leaves `tasks.status = running` after user-visible completion.
- Any admin action that succeeds without an audit event.
- Any API response that exposes raw phone, auth code, session token, provider secret, or credential-like metadata.
- Any deployment where Admin/Ops cannot identify `result_unknown` or `manual_review_required` records within five minutes.

# P0 Idempotency Contract

> Status: M0.1 implementation contract
> Date: 2026-05-08
> Owner: Reliability owner + contract owner
> Applies to: expensive commands, external side effects, payment callbacks, repair jobs, and Admin/Ops actions.

## 1. Purpose

Idempotency is the system's duplicate-side-effect guard. It answers one question:

```text
If the caller retries, refreshes, double-clicks, times out, or the worker/message is delivered twice,
will we create the same business fact once, or accidentally create a second expensive/payment effect?
```

This contract turns the architecture-level rule into a database and command-helper contract.

## 2. Canonical Scope

The canonical uniqueness scope is:

```sql
(organization_id, operation_name, idempotency_key)
```

Never use `(organization_id, idempotency_key)` alone for user/API commands. A client UUID can be reused by mistake across different operations. The operation name is part of the safety boundary.

## 3. Required Table

Physical migrations should create this table before P0-A expensive command implementation.

```sql
CREATE TYPE idempotency_record_status AS ENUM (
  'processing',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'expired'
);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  operation_name text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  resource_scope_type text NULL,
  resource_scope_id uuid NULL,
  response_resource_type text NULL,
  response_resource_id uuid NULL,
  status idempotency_record_status NOT NULL DEFAULT 'processing',
  response_snapshot_json jsonb NULL,
  failure_code text NULL,
  expires_at timestamptz NOT NULL,
  locked_until timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT idempotency_records_key_unique
    UNIQUE (organization_id, operation_name, idempotency_key),

  CONSTRAINT idempotency_records_resource_scope_pair
    CHECK (
      (resource_scope_type IS NULL AND resource_scope_id IS NULL)
      OR
      (resource_scope_type IS NOT NULL AND resource_scope_id IS NOT NULL)
    ),

  CONSTRAINT idempotency_records_response_pair
    CHECK (
      (response_resource_type IS NULL AND response_resource_id IS NULL)
      OR
      (response_resource_type IS NOT NULL AND response_resource_id IS NOT NULL)
    )
);

CREATE INDEX idempotency_records_expiry_idx
  ON idempotency_records (expires_at)
  WHERE status IN ('succeeded', 'failed_terminal', 'expired');

CREATE INDEX idempotency_records_processing_idx
  ON idempotency_records (organization_id, operation_name, status, locked_until);
```

Implementation may use text check constraints instead of PostgreSQL enums if the migration strategy favors easier state extension. The values must still come from the shared contract constants.

## 4. Relationship to Workflow and Task Tables

`workflows` and `tasks` may keep `idempotency_key` as a denormalized debug column, but replay semantics must be anchored by `idempotency_records`.

Required additions:

```sql
ALTER TABLE workflows
  ADD COLUMN idempotency_record_id uuid NULL REFERENCES idempotency_records(id);

ALTER TABLE tasks
  ADD COLUMN idempotency_record_id uuid NULL REFERENCES idempotency_records(id);

CREATE INDEX workflows_idempotency_record_idx
  ON workflows (organization_id, idempotency_record_id)
  WHERE idempotency_record_id IS NOT NULL;

CREATE INDEX tasks_idempotency_record_idx
  ON tasks (organization_id, idempotency_record_id)
  WHERE idempotency_record_id IS NOT NULL;
```

Recommended constraint change:

```text
Do not rely on an operationless workflow/task idempotency key for command replay.
Use operation-scoped idempotency_records as the primary duplicate guard.
```

If workflows/tasks retain uniqueness, it must include `operation_name` or `workflow_type/task_type` and remain compatible with the central idempotency record.

## 5. Request Hashing

The request hash is computed from a canonicalized command payload:

```text
hash_input =
  operation_name
  + canonical_json(command_body_without_transient_ui_fields)
  + resource_scope_type/resource_scope_id
  + actor organization/workspace scope
```

Rules:

- Sort object keys before hashing.
- Omit transient UI fields such as local loading IDs.
- Include all fields that change the business effect.
- Include target scope such as `project_id`, `shot_id`, `order_id`, or `workflow_id`.
- Use SHA-256 or stronger.
- Store only the hash, not raw sensitive prompts or uploaded content.

## 6. Command Helper Protocol

Every idempotent command follows this protocol.

```text
begin transaction
  insert idempotency_records(...)
    status = processing
    expires_at = now + operation ttl
  on conflict (org, operation, key):
    lock existing row for update
    compare request_hash
      if different -> 409 idempotency_conflict
    if succeeded -> return stored response/resource
    if processing and lock active -> return existing resource/status when known, else 202 processing
    if failed_retryable -> allow retry through same record after lock expiry
    if failed_terminal -> return stable failure response
    if expired -> create a new record only if expiry policy allows a new key generation path
  create or load business resource
  set response_resource_type/id when known
commit
```

For long-running workflow commands, `processing` does not mean the command is still in the HTTP request. It means the business operation is not terminal yet. The response should return the durable workflow/task ID.

## 7. Expiry Policy

Default TTLs:

| Operation Class | TTL | Reason |
| --- | --- | --- |
| Project/script/generation/export commands | 24 hours | Covers browser refresh/retry and ordinary long tasks. |
| Payment order creation | 24 hours or order expiry, whichever is later | Avoids duplicate purchase intent. |
| Payment callback/provider event dedup | Provider retention window or at least 30 days | Payment callbacks can replay late. |
| Admin/Ops actions | 7 days | Manual operations need longer audit-safe replay windows. |
| Repair jobs | No TTL for source fact, job execution key can rotate per scan window | The source fact is the real dedup key. |

Expired records should not be physically deleted until after an audit-friendly retention window. Mark them `expired`, then archive/delete later if policy allows.

## 8. Operation Names

Operation names are stable contracts. Changing one is a breaking contract change unless old names are supported through migration.

| Command | Operation Name | Resource Scope | Response Resource |
| --- | --- | --- | --- |
| `CreateProject` | `project.create` | `workspace:{workspace_id}` | `project:{project_id}` |
| `ParseScript` | `script.parse` | `project:{project_id}` | `workflow:{workflow_id}` |
| `SplitShots` | `shots.split` | `project:{project_id}` | `workflow:{workflow_id}` |
| `GenerateShotImage` | `shot.image.generate` | `shot:{shot_id}` | `task:{task_id}` |
| `GenerateShotVideo` | `shot.video.generate` | `shot:{shot_id}` | `task:{task_id}` |
| `GenerateCalibration` | `calibration.generate` | `project:{project_id}` | `workflow:{workflow_id}` |
| `PassCalibration` | `calibration.pass` | `calibration_session:{calibration_session_id}` | `calibration_session:{calibration_session_id}` |
| `SkipCalibration` | `calibration.skip` | `calibration_session:{calibration_session_id}` | `calibration_session:{calibration_session_id}` |
| `CreateExport` | `export.create` | `project:{project_id}` | `export:{export_id}` |
| `CreateBillingOrder` | `billing.create_order` | `organization:{organization_id}` | `order:{order_id}` |
| `CreatePaymentIntent` | `billing.create_payment_intent` | `order:{order_id}` | `payment_intent:{payment_intent_id}` |
| `RequestRefund` | `billing.request_refund` | `order:{order_id}` | `refund:{refund_id}` |
| `ManualSettleUnknownTask` | `ops.manual_settle_task` | `task:{task_id}` | `task:{task_id}` |
| `AdminRetryTask` | `ops.retry_task` | `task:{task_id}` | `task:{new_task_id}` or `attempt:{attempt_id}` |

Worker-side dedup uses task/attempt/provider request facts in addition to command idempotency. Payment callbacks use provider event dedup plus payment source uniqueness; they do not require a user-supplied header.

## 9. HTTP Contract

For user/API commands:

```http
Idempotency-Key: <client-generated-uuid-or-ulid>
```

Response semantics:

| Scenario | HTTP | Error Code / Body |
| --- | --- | --- |
| First accepted command | `202` for long-running, `201/200` for immediate | Return durable resource ID. |
| Same key + same hash | `200` or `202` | Return same durable resource/status. |
| Same key + different hash | `409` | `idempotency_conflict`. |
| Existing command still running | `202` | Return existing workflow/task status. |
| Existing terminal failure | Original status class | Return stable failure code and repair guidance. |

The frontend may disable buttons, but server idempotency is the real guarantee.

## 10. Required Tests

| Test ID | Test File | Must Prove |
| --- | --- | --- |
| IDEMP-001 | `apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts` | Same `(org, operation, key, hash)` returns existing record. |
| IDEMP-002 | `apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts` | Same `(org, operation, key)` with different hash returns `409 idempotency_conflict`. |
| IDEMP-003 | `apps/backend/src/modules/project/tests/parse-script.idempotency.spec.ts` | Refresh/retry of script parse returns existing workflow. |
| IDEMP-004 | `apps/backend/src/modules/shot/tests/generate-shot-image.idempotency.spec.ts` | Running shot generation cannot create a duplicate task. |
| IDEMP-005 | `apps/backend/src/modules/commerce-payment/tests/create-order.idempotency.spec.ts` | Replayed order creation returns the same order snapshot. |
| IDEMP-006 | `apps/backend/src/modules/workflow-task/tests/worker-duplicate-delivery.spec.ts` | BullMQ duplicate delivery cannot create a second attempt for an already claimed task. |
| IDEMP-007 | `apps/backend/src/modules/credit-billing/tests/allocation-settlement-idempotency.spec.ts` | Duplicate settlement cannot both consume and release the same allocation. |

## 11. M0.1 Exit Criteria

- [x] `idempotency_records` DDL exists in `packages/db/migrations/0001_foundation.sql`.
- [x] Operation names above are exported from `packages/contracts/domain/operation-names.ts`.
- [x] All expensive API command contracts require idempotency; production command handlers must call the helper when implemented.
- [x] Workflows/tasks link to `idempotency_record_id` in the foundation SQL and keep `idempotency_key` as debug/reference data only.
- [x] IDEMP-001 through IDEMP-007 are mapped into the verification plan.
- [x] Any change to an operation name requires a contract-change record through `docs/architecture/p0-collaboration-contract.md`.

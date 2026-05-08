# P0 Verification Plan

> Status: M0.1 implementation contract
> Date: 2026-05-08
> Owner: QA/reliability owner + module owners
> Purpose: map PRD and architecture claims to executable test files and CI gates.

## 1. Rule

No milestone exits on prose acceptance. Every milestone exit condition must map to one of:

- unit test
- domain/state-machine test
- API integration test
- database transaction/concurrency test
- worker failure test
- provider adapter contract test
- E2E user-flow test
- observability drill/runbook check

## 2. CI Gates

| Gate | Runs | Required Before |
| --- | --- | --- |
| `contracts` | state dictionary consistency, API schema compile, event schema compile | M0.1 exit |
| `unit` | pure domain logic and transition tests | Every PR |
| `integration` | API + DB + worker with test PostgreSQL/Redis/MinIO | M1/M2 exit |
| `concurrency` | row locks, idempotency, allocation settlement, worker claim | M2/M4 exit |
| `provider-contract` | fake provider result matrix and payment provider payload mapping | M3/M5 exit |
| `e2e-p0-a` | creator loop browser/API journey with mock provider | M2 exit |
| `ops-drill` | repair jobs, Redis loss, unknown settlement, triage dashboard | M4/M6 exit |

## 2.1 M0.1 Implemented Foundation Contract Tests

These tests are now executable repository artifacts. They are contract-level tests, not full production module implementations.

| Test File | Gate | Proves |
| --- | --- | --- |
| `apps/backend/src/modules/shared/contracts/tests/state-dictionary-consistency.spec.ts` | `contracts` | ProviderRequest uses `result_unknown` and does not drift into payment-style `unknown`. |
| `apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts` | `contracts` | Same operation-scoped idempotency key/hash replays; same key with different hash conflicts. |
| `packages/contracts/api/contracts.spec.ts` | `contracts` | Every API command contract has operation, capability, idempotency, preconditions, errors, audit, and verification IDs. |
| `packages/contracts/events/contracts.spec.ts` | `contracts` | Every event contract has replay-safe envelope fields, source IDs, schema version, and producer. |
| `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts` | `contracts` | Replayed outbox events do not duplicate consumer effects. |
| `apps/backend/src/modules/workflow-task/tests/redis-loss-repair.spec.ts` | `contracts` | Redis-loss repair selects queued tasks with missing/stale dispatch facts. |
| `apps/backend/src/modules/credit-billing/tests/balance-drift-repair.spec.ts` | `contracts` | Credit balance read-model drift is detected from append-only ledger facts. |

## 2.2 Idempotency Verification Mapping

| Test ID | Stage | Proposed / Implemented Test File | Status | Must Prove |
| --- | --- | --- | --- | --- |
| IDEMP-001 | M0.1 | `apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts` | Implemented | Same `(org, operation, key, hash)` returns existing record. |
| IDEMP-002 | M0.1 | `apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts` | Implemented | Same `(org, operation, key)` with different hash returns `idempotency_conflict`. |
| IDEMP-003 | M2 | `apps/backend/src/modules/project/tests/parse-script.idempotency.spec.ts` | Proposed | Refresh/retry of script parse returns existing workflow. |
| IDEMP-004 | M2 | `apps/backend/src/modules/shot/tests/generate-shot-image.idempotency.spec.ts` | Proposed | Running shot generation cannot create a duplicate task. |
| IDEMP-005 | M5 | `apps/backend/src/modules/commerce-payment/tests/create-order.idempotency.spec.ts` | Proposed | Replayed order creation returns the same order snapshot. |
| IDEMP-006 | M4 | `apps/backend/src/modules/workflow-task/tests/worker-duplicate-delivery.spec.ts` | Proposed | BullMQ duplicate delivery cannot create a second attempt for an already claimed task. |
| IDEMP-007 | M4 | `apps/backend/src/modules/credit-billing/tests/allocation-settlement-idempotency.spec.ts` | Proposed | Duplicate settlement cannot both consume and release the same allocation. |

## 3. PRD Acceptance Tests

| PRD ID | Stage | Test Type | Proposed Test File | Owning Modules | Must Prove |
| --- | --- | --- | --- | --- | --- |
| TC-P0-001 | M2 | API + E2E | `apps/web/e2e/p0/create-project-parse.spec.ts` | Project, Workflow/Task | Create project, enter parsing within 1s, parse success or retryable failure. |
| TC-P0-002 | M2 | API + UI integration | `apps/web/e2e/p0/confirm-assets.spec.ts` | Project, Asset | Key roles/scenes block progress until confirmed. |
| TC-P0-003 | M2 | E2E | `apps/web/e2e/p0/split-shots-calibration.spec.ts` | Shot, Quality/Review, Workflow/Task | Split shots, enforce 3 calibration slots, pass unlocks batch generation. |
| TC-P0-004 | M2 | Worker integration | `apps/backend/src/modules/shot/tests/batch-image-partial-success.spec.ts` | Shot, Workflow/Task, Asset | Partial failure does not block successful shot outputs. |
| TC-P0-005 | M2 | Domain + worker integration | `apps/backend/src/modules/shot/tests/shot-regeneration-versioning.spec.ts` | Shot, Asset | Regeneration creates new version and preserves old version on failure. |
| TC-P0-006 | M2 | E2E + provider stub | `apps/web/e2e/p0/shot-video-retry.spec.ts` | Shot, ModelGateway | Video failure shows repair guidance and can retry within 3 steps. |
| TC-P0-007 | M2 | API integration | `apps/backend/src/modules/export/tests/export-package.spec.ts` | Export, Asset | Export creates manifest/download link when assets are present. |
| TC-P0-008 | M2/P0-A, M4/P0-B | API + DB concurrency | `apps/backend/src/modules/credit-billing/tests/insufficient-credits.spec.ts` | Credit/Billing, Workflow/Task | Insufficient credits blocks task creation; P0-B adds no-oversell concurrency. |
| TC-P0-009 | M2 | API integration | `apps/backend/src/modules/calibration/tests/calibration-gate.spec.ts` | Quality/Review, Shot | Batch generation is rejected until pass/skip/override is durable. |
| TC-P0-010 | M2 | API integration | `apps/backend/src/modules/project/tests/script-parse-retry.spec.ts` | Project, Workflow/Task | Parse failure leaves repairable project state and retry does not duplicate project. |
| TC-P0-011 | M2 | E2E + API | `apps/web/e2e/p0/refresh-running-generation.spec.ts` | Web, Workflow/Task, Shot | Refresh restores durable running/completed/failed state and creates no duplicate task. |
| TC-P0-012 | M2 | API integration | `apps/backend/src/modules/shot/tests/no-duplicate-running-generation.spec.ts` | Shot, Workflow/Task | Duplicate running generation returns existing task/workflow. |
| TC-P0-013 | M1/M2 | API integration | `apps/backend/src/modules/organization/tests/tenant-permission.spec.ts` | Organization, Project, Export | Read-only user cannot edit/generate/export and cannot see sensitive config. |
| TC-P0-014 | M2 | API + E2E | `apps/web/e2e/p0/export-missing-assets.spec.ts` | Export, Shot, Asset | Missing assets are listed; no export starts until user confirms incomplete package. |

## 4. P0-A Architecture Tests

These are the non-negotiable P0-A gates from the system architecture.

| ID | Stage | Test Type | Proposed Test File | Must Prove |
| --- | --- | --- | --- | --- |
| R-002 | M2 | API idempotency | `apps/backend/src/modules/shot/tests/batch-generate-idempotency.spec.ts` | Double-click returns same workflow and creates no duplicate task. |
| R-011 | M2 | Domain/worker | `apps/backend/src/modules/shot/tests/stale-task-completion.spec.ts` | Old generation result becomes historical version, not current pointer. |
| R-012 | M2 | Domain/worker | `apps/backend/src/modules/shot/tests/out-of-order-regeneration.spec.ts` | Only active task/revision updates current pointer. |
| R-013 | M1 | Tenant security | `apps/backend/src/modules/storage/tests/signed-url-tenant-auth.spec.ts` | Other-org viewer cannot receive signed URL. |
| R-016 | M2 | API guard | `apps/backend/src/modules/calibration/tests/calibration-gate.spec.ts` | Backend rejects batch generation before calibration pass/skip/override. |
| R-017 | M2 | Export integration | `apps/backend/src/modules/export/tests/export-integrity.spec.ts` | Missing assets are explicit and cannot silently fail export. |
| A-001 | M3 | Provider failure | `apps/backend/src/modules/model-gateway/tests/no-blind-retry-after-external-start.spec.ts` | After `external_submission_started_at`, crash/timeout cannot create a second external request. |

## 5. P0-B Reliability Tests

| ID | Stage | Test Type | Proposed Test File | Must Prove |
| --- | --- | --- | --- | --- |
| R-001 | M4 | Failure drill | `apps/backend/src/modules/workflow-task/tests/redis-loss-repair.spec.ts` | Queued tasks can be rebuilt from PostgreSQL after Redis job loss. |
| R-003 | M4 | DB concurrency | `apps/backend/src/modules/workflow-task/tests/task-claim-concurrency.spec.ts` | Two workers cannot claim the same task. |
| R-004 | M4 | Lease repair | `apps/backend/src/modules/workflow-task/tests/lease-repair-before-provider.spec.ts` | Crash before provider call requeues safely with no provider cost. |
| R-005 | M4 | Lease repair | `apps/backend/src/modules/model-gateway/tests/accepted-crash-result-unknown.spec.ts` | Crash after provider accept enters `result_unknown`. |
| R-006 | M4 | Provider contract | `apps/backend/src/modules/model-gateway/tests/timeout-after-accept.spec.ts` | Accept-timeout is never ordinary `failed` and never blind retried. |
| R-007 | M4 | Provider contract | `apps/backend/src/modules/model-gateway/tests/content-safety-no-fallback.spec.ts` | Content safety rejection does not silently fail over. |
| R-008 | M4 | DB concurrency | `apps/backend/src/modules/credit-billing/tests/reservation-no-oversell.spec.ts` | Concurrent reservations cannot oversell. |
| R-009 | M4 | DB concurrency | `apps/backend/src/modules/credit-billing/tests/allocation-single-settlement.spec.ts` | Allocation cannot both consume and release. |
| R-010 | M4 | Transaction rollback | `apps/backend/src/modules/workflow-task/tests/finalization-rollback.spec.ts` | Any finalization step failure rolls back local facts. |
| R-014 | M4 | Event replay | `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts` | Replayed outbox event cannot duplicate consumer side effect. |
| R-015 | M4 | Reconciliation | `apps/backend/src/modules/credit-billing/tests/balance-drift-repair.spec.ts` | Ledger recomputation detects and repairs read-model drift. |
| R-018 | M4 | Aggregation | `apps/backend/src/modules/workflow-task/tests/manual-review-blocks-terminal.spec.ts` | Parent workflow cannot terminally aggregate while child is manual review. |
| R-019 | M4 | Lease repair | `apps/backend/src/modules/model-gateway/tests/provider-row-before-external-start.spec.ts` | Provider request committed but not externally started can be safely requeued. |

## 6. Extended Recovery Tests

The execution spec defines R-020 through R-029. These are required for M4/M6 hardening even where the system architecture's shorter matrix stops at R-019.

| ID | Stage | Test Type | Proposed Test File | Must Prove |
| --- | --- | --- | --- | --- |
| R-020 | M4 | Admin integration | `apps/backend/src/modules/admin-ops/tests/retry-failed-task.spec.ts` | Retry creates new attempt/task and preserves old attempt. |
| R-021 | M4 | Event replay | `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts` | Duplicate dispatch is consumer-safe. |
| R-022 | M4 | Reconciliation | `apps/backend/src/modules/credit-billing/tests/balance-drift-repair.spec.ts` | Balance cache drift is detected from ledger. |
| R-023 | M4 | Provider recovery | `apps/backend/src/modules/model-gateway/tests/lookup-ttl-manual-review.spec.ts` | Lookup TTL moves unknown to manual review and keeps reservation held. |
| R-024 | M2/M4 | Quality gate | `apps/backend/src/modules/quality-review/tests/calibration-quality-failure.spec.ts` | Failed calibration quality blocks pass until fixed/override. |
| R-025 | M6 | Retention | `apps/backend/src/modules/project/tests/project-soft-delete-retention.spec.ts` | P0 archives/soft-deletes project content while retaining audit/financial records. |
| R-026 | M3/M4 | Provider recovery | `apps/backend/src/modules/model-gateway/tests/crash-before-external-start.spec.ts` | Provider row committed but external start not set can retry safely. |
| R-027 | M3/M4 | Provider recovery | `apps/backend/src/modules/model-gateway/tests/crash-after-external-start.spec.ts` | External start set means recovery uses lookup/manual review, no duplicate request. |
| R-028 | M4 | DB concurrency | `apps/backend/src/modules/credit-billing/tests/allocation-race.spec.ts` | Concurrent consume/release has one winning settlement. |
| R-029 | M4 | Aggregation | `apps/backend/src/modules/workflow-task/tests/manual-review-aggregation.spec.ts` | Child manual review blocks terminal workflow aggregation. |

## 7. Payment and Commerce Verification

These are M5 gates and cannot be marked done until official provider mappings are verified.

| Scenario | Test Type | Proposed Test File | Must Prove |
| --- | --- | --- | --- |
| Duplicate valid callback | Webhook integration | `apps/backend/src/modules/commerce-payment/tests/callback-dedup.spec.ts` | One paid transition and one credit grant. |
| Invalid signature | Webhook integration | `apps/backend/src/modules/commerce-payment/tests/callback-signature.spec.ts` | No payment/credit mutation; risk event recorded. |
| Amount/currency/merchant mismatch | Webhook integration | `apps/backend/src/modules/commerce-payment/tests/callback-mismatch.spec.ts` | No paid transition; manual review/risk item. |
| Frontend return without callback | API integration | `apps/backend/src/modules/commerce-payment/tests/frontend-return-no-grant.spec.ts` | Frontend success never grants credits. |
| Paid without credit grant | Repair job | `apps/backend/src/modules/credit-billing/tests/paid-without-credit-repair.spec.ts` | Repair grants credits exactly once. |
| Issued invoice then refund | Domain/Admin | `apps/backend/src/modules/commerce-payment/tests/invoice-refund-gate.spec.ts` | Refund is blocked/flagged until reversal/red-letter state. |
| Daily settlement mismatch | Reconciliation | `apps/backend/src/modules/commerce-payment/tests/daily-settlement-reconciliation.spec.ts` | Mismatch creates reconciliation item, not silent correction. |

## 8. Traceability Rule

Every implementation PR must reference at least one verification ID from this document when it touches P0 core modules.

Allowed PR labels:

- `verifies:TC-P0-###`
- `verifies:R-###`
- `verifies:A-001`
- `verifies:IDEMP-###`
- `verifies:PAY-###`

## 9. M0.1 Exit Criteria

- [x] Every PRD TC-P0 test has a proposed test file and owning modules.
- [x] Every P0-A architecture gate has a proposed test file.
- [x] Every P0-B reliability gate has a proposed test file.
- [x] CI gate names are defined.
- [x] Test IDs are required in P0 PR descriptions.
- [x] Payment tests remain gated until official provider/finance verification is complete.

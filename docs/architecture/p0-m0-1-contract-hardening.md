# P0 M0.1 Contract Hardening

> Status: Implementation-readiness gate
> Date: 2026-05-08
> Owner: architecture owner + contract owner + reliability owner
> Purpose: convert the M0 document-level blueprint into buildable, verifiable, collaborative implementation contracts.

## 1. Verdict

M0 is the coordination baseline.

M0.1 is the implementation-readiness gate.

```text
M0 answers:    what is the architecture and who owns each fact?
M0.1 answers:  what exactly will engineers generate, code, test, and review?
```

No broad P0-A/P0-B module implementation should start until M0.1 exit criteria are met.

## 2. M0.1 Artifact Register

| Artifact | Source | Implementation Output | Gate |
| --- | --- | --- | --- |
| Domain/state constants | `p0-state-dictionary.md` | `packages/contracts/domain/states.ts` or equivalent | State string check passes. |
| API command schemas | Blueprint §6.1 + PRD | `packages/contracts/api/*.ts` | Schemas compile; each command has permission + idempotency. |
| Event schemas | Blueprint §6.2 + architecture §7.5 | `packages/contracts/events/*.ts` | Events include `event_id`, `event_type`, `schema_version`, source IDs. |
| Idempotency contract | `p0-idempotency-contract.md` | `idempotency_records` migration + helper | IDEMP tests mapped. |
| Migration-ready schema | `p0-data-schema-draft.md` | migration files or migration-ready DDL appendix | Tenant, FK, unique, and ledger constraints reviewed. |
| Repair job specs | `p0-repair-job-spec.md` | scheduler job implementations later | Scan condition + idempotent action for each gap. |
| Verification plan | `p0-verification-plan.md` | CI test ownership | PRD and architecture gates map to files. |
| Collaboration contract | `p0-collaboration-contract.md` | CODEOWNERS/PR template/contract-change records | Parallel work rules explicit. |

## 3. Contract Package Shape

Recommended contract package:

```text
packages/contracts/
  domain/
    states.ts
    capabilities.ts
    operation-names.ts
    event-types.ts
  api/
    project.commands.ts
    asset.commands.ts
    shot.commands.ts
    calibration.commands.ts
    export.commands.ts
    billing.commands.ts
    admin-ops.commands.ts
  events/
    workflow.events.ts
    task.events.ts
    asset.events.ts
    calibration.events.ts
    payment.events.ts
    credit.events.ts
    invoice.events.ts
    export.events.ts
  testing/
    fixtures.ts
    contract-assertions.ts
```

Rules:

- Provider-specific payloads do not leak into API/event contracts.
- Event payloads include source IDs required for replay and dedup.
- Operation names come from `p0-idempotency-contract.md`.
- Capability names are shared by API guards and command handlers.

## 4. Required Command Schema Fields

Every command schema must declare:

```text
operation_name
capability
idempotency_required
request_schema
response_schema
resource_scope
state_preconditions
business_errors
audit_event
verification_ids
```

Example:

```text
GenerateShotImage
  operation_name: shot.image.generate
  capability: generation:start
  resource_scope: shot:{shot_id}
  idempotency_required: true
  state_preconditions:
    - shot.content_status = ready
    - shot.image_status in ready|failed|stale
    - calibration gate passed/skipped/overridden
    - credit check passes
  response:
    - workflow_id
    - task_id
    - current task status
  verification_ids:
    - TC-P0-004
    - TC-P0-012
    - R-002
    - R-016
```

## 5. Required Event Schema Fields

Every cross-module event must include:

```text
event_id
event_type
schema_version
producer
occurred_at
organization_id
workspace_id?
project_id?
source aggregate IDs
idempotency/dedup source
payload
```

Critical event minimums:

| Event | Required Source IDs |
| --- | --- |
| `workflow.completed` | `workflow_id`, final `workflow_status`, child task summary. |
| `task.succeeded` | `workflow_id`, `task_id`, `attempt_id`, target entity, provider request if any. |
| `asset.version.created` | `asset_id`, `asset_version_id`, source task/attempt. |
| `calibration.passed` | `calibration_session_id`, decision ID, actor/system decision source. |
| `payment.succeeded` | `order_id`, `payment_intent_id`, provider event ID, amount/currency snapshot. |
| `credit.grant.created` | `ledger_entry_id`, source type/id, amount. |
| `payment.refund.succeeded` | `refund_id`, order/payment source IDs, amount/currency. |
| `invoice.issued` | `invoice_record_id`, order ID, invoice request ID. |

## 6. Migration-Ready Schema Gate

Before M0.1 exit, schema planning must decide:

- UUID vs ULID.
- PostgreSQL enum vs text check constraints.
- Composite tenant FK strategy.
- RLS now vs later.
- `idempotency_records` relationship to workflows/tasks.
- Outbox/inbox exact statuses.
- Provider request payload privacy storage strategy.
- Balance read-model reconciliation query.
- Migration owner labels/comments.

Open choices may remain only if they are explicitly assigned to a later milestone and do not block P0-A coding.

### 6.1 M0.1 Recorded Decisions

| Choice | M0.1 Decision | Later Gate |
| --- | --- | --- |
| UUID vs ULID | Use `uuid` in the first migration-ready SQL. A sortable UUID/ULID can be introduced only through a contract-change record. | None for P0-A. |
| PostgreSQL enum vs text check constraints | Use text check constraints for M0.1 foundation SQL to keep state extension/migration cheaper while shared constants remain authoritative. | Revisit before production hardening if enum generation is preferred. |
| Composite tenant FK strategy | Foundation SQL uses tenant columns and tenant indexes; full composite FK ergonomics remain a query-builder/migration spike before broad table expansion. | Before M1/M2 table build-out. |
| RLS now vs later | M0.1 does not enable RLS. P0-A requires tenant-scoped query helpers and tenant leak tests; RLS decision remains a hardening choice. | Before commercial beta. |
| `idempotency_records` relationship | User/API command replay anchors on `idempotency_records`; workflows/tasks/orders reference `idempotency_record_id` and keep `idempotency_key` only as denormalized debug/reference data. | None for P0-A. |
| Outbox/inbox statuses | Foundation SQL uses `pending`, `processing`, `processed`, `failed`; inbox dedup is unique `(consumer_name, outbox_event_id)`. | None for M0.1. |
| Provider request payload privacy | Not implemented in foundation SQL. Provider request payloads must be redacted, hashed, or restricted-object-stored when ModelGateway tables are added. | Before M3 real provider safety. |
| Balance read-model reconciliation | M0.1 adds an executable contract test for recomputing cached balances from append-only ledger deltas. | Before M4 credit reliability implementation. |
| Migration owner labels/comments | `.github/CODEOWNERS` assigns `/packages/db/migrations/` to data and reliability owners; individual table owner comments remain part of migration expansion. | Before broad module migrations. |

## 7. M0.1 Work Sequence

```text
1. State consistency pass
2. Idempotency DDL/helper contract
3. API command schema inventory
4. Event schema inventory
5. Migration-ready schema pass
6. Repair job scan/action specs
7. Verification plan to test files
8. Collaboration contract and PR template
9. M0.1 exit review
```

## 8. M0.1 Exit Checklist

- [x] No state value in architecture docs conflicts with `p0-state-dictionary.md`; an executable guard now prevents ProviderRequest `result_unknown` drift into payment-style `unknown`.
- [x] `idempotency_records` DDL and helper semantics are accepted in `packages/db/migrations/0001_foundation.sql` and `apps/backend/src/modules/shared/idempotency/idempotency.service.ts`.
- [x] Workflows/tasks no longer rely on operationless idempotency uniqueness in the foundation SQL.
- [x] API command schemas have operation names, capabilities, idempotency, state preconditions, errors, audit events, and verification IDs.
- [x] Event schemas have versioning, producer, source IDs, and replay/dedup semantics.
- [x] Migration-ready schema gate decisions are recorded in §6.1.
- [x] Repair jobs have scan conditions and idempotent actions in `p0-repair-job-spec.md`, with executable foundation contract tests for outbox, queued task dispatch, and balance drift.
- [x] Verification plan maps PRD and architecture scenarios to test files and now records implemented M0.1 foundation contract tests.
- [x] Collaboration contract defines PR template, module labels, contract-change records, and parallel lanes; `.github` scaffolding exists.
- [x] Decision log records M0.1 as the gate before broad module coding and now records the M0.1 exit review.

## 9. Allowed Work Before M0.1 Exit

Allowed:

- documentation hardening
- contract schema drafting
- migration planning
- test planning
- local proof-of-concept spikes that do not become production module code

Not allowed:

- broad P0-A/P0-B feature implementation
- real paid provider integration
- payment adapter implementation
- cross-module writes without frozen command/event contracts

## 10. Definition of Done

M0.1 is done when a new engineer or agent can pick up a module and answer without inventing:

```text
Which facts do I own?
Which tables may I write?
Which command starts my flow?
Which schema do I implement?
Which event do I publish or consume?
Which idempotency key do I use?
Which tests prove this works?
Which repair job handles failure?
Who must review my PR?
```

# P0 Architecture Blueprint Review

> Date: 2026-05-08
> Status: DONE_WITH_M0_1_PACKAGE
> Scope: Review whether the current PRD and architecture documents have converged into a buildable, verifiable, collaborative module implementation blueprint.

## Executive Verdict

The architecture has converged into an M0 module coordination blueprint plus an M0.1 implementation-readiness package.

It is strong enough to start M0.1 contract implementation and foundation planning. It is not yet strong enough to start broad parallel P0-A/P0-B business-module coding as if all contracts were already executable code.

The distinction matters:

```text
Current state:
  architecture direction        yes
  domain language               yes
  module ownership              yes
  data ownership                yes
  failure philosophy            yes
  verification scenarios        yes
  contract fields/schemas       specified for M0.1
  physical DDL intent           specified for M0.1
  test file ownership           mapped for M0.1
  generated contract code       not yet
  migration files               not yet
  executable tests              not yet
  provider/account verification not yet
```

Decision for implementation:

```text
Do not start wide feature coding yet.
Start M0.1 Contract Hardening first, then M1 tenant/auth foundation, then P0-A creator loop.
```

I am 100% confident in this gating conclusion based on the documents reviewed. I am not 100% confident in implementation correctness, because the repository has no code, migrations, generated schemas, provider sandbox proof, or executable recovery tests yet.

## Sources Reviewed

Primary product source:

- `docs/product/reelmate-core-replication-prd.md`

Architecture sources:

- `docs/architecture/system-architecture-design.md`
- `docs/architecture/p0-system-architecture.md`
- `docs/architecture/p0-module-implementation-blueprint.md`
- `docs/architecture/p0-m0-contract-freeze.md`
- `docs/architecture/p0-implementation-baseline.md`
- `docs/architecture/p0-data-schema-draft.md`
- `docs/architecture/p0-state-dictionary.md`
- `docs/architecture/p0-execution-and-recovery-spec.md`
- `docs/architecture/p0-commerce-payment-design.md`
- `docs/architecture/architecture-consistency-checklist.md`
- `docs/architecture/decision-log.md`
- `docs/architecture/p0-m0-1-contract-hardening.md`
- `docs/architecture/p0-idempotency-contract.md`
- `docs/architecture/p0-verification-plan.md`
- `docs/architecture/p0-repair-job-spec.md`
- `docs/architecture/p0-collaboration-contract.md`

## Product Context

The PRD target is a desktop web creator workflow that replicates the core ReelMate / 万兴剧厂 experience at the capability level, not pixel-level UI.

P0 is the minimum loop:

```text
create project
  -> script input / parse
  -> extract and confirm public assets
  -> split storyboard shots
  -> style calibration
  -> generate shot images
  -> edit/regenerate individual shots
  -> image-to-video for individual shots
  -> export asset package
```

The important product constraints are already test-shaped:

- Script parse starts feedback within 1 second.
- Long tasks show progress or stage state after 5 seconds.
- User can recover from a single task failure within 3 steps.
- Batch shot image generation supports partial success.
- Calibration gates batch generation.
- Export checks missing assets before packaging.
- Refreshing during generation restores durable state and does not create duplicate work.

## First-Principles Assessment

The essential complexity is not the UI. It is expensive, long-running, partially successful, provider-dependent creative work under tenant, credit, asset-version, and operational recovery constraints.

The architecture correctly treats these as first-class facts:

- PostgreSQL is durable truth.
- BullMQ is dispatch, not truth.
- Workflow, Task, and Attempt are separate concepts.
- ProviderRequest exists before ambiguous external side effects.
- AssetVersion is immutable.
- Current asset pointers are protected by active generation intent.
- Credits are an append-only ledger, not a mutable counter.
- Commerce/Payment owns cash facts; Credit/Billing owns credit facts.
- Admin/Ops writes only through domain commands.

This is the right long-term shape for the product.

## Readiness Scorecard

| Dimension | Verdict | Why |
| --- | --- | --- |
| Domain language | Pass | The blueprint defines users, orgs, projects, shots, workflows, provider requests, payments, credits, exports, audit, outbox, and inbox. |
| Module boundaries | Pass | Modules are business-capability modules with explicit non-responsibilities. |
| Data ownership | Pass | Durable facts have named writing owners. |
| Core flows | Pass with follow-up | Normal and failure paths exist for creator loop, credit reservation, payment grant, refund, reconciliation, and Admin/Ops recovery. |
| Interface contracts | M0.1 specified | Command/event inventories now have required schema fields and output locations; generated contract code is still pending. |
| State model | Pass with guard | Canonical dictionary exists and ProviderRequest drift has been repaired; state consistency check remains an M0.1 guard. |
| Idempotency | M0.1 specified | `idempotency_records` DDL, helper semantics, operation names, and tests are specified; migration/helper implementation is still pending. |
| Data schema | M0.1 specified | Schema draft includes cross-cutting idempotency and known ownership rules; migration files are still pending. |
| Verification | M0.1 specified | PRD and architecture scenarios are mapped to concrete proposed test files and CI gates; executable tests are still pending. |
| Collaboration | M0.1 specified | Roles, labels, PR template, CODEOWNERS suggestion, and contract-change protocol exist; repo artifacts still need implementation. |
| Commercial payment | Not ready for implementation | Official WeChat/Alipay mapping and finance/tax policy are explicit blockers. |
| 100% implementation confidence | Not yet | The docs themselves correctly say code, migrations, schemas, provider calls, and tests are still missing. |

## High-Priority Findings

### P0-1. Idempotency contract was semantically frozen; M0.1 schema package is now defined

Original evidence:

- `system-architecture-design.md` defines the precise uniqueness scope as `(organization_id, operation_name, idempotency_key)`.
- Before M0.1, `p0-m0-contract-freeze.md` said the idempotency protocol was frozen but the implementation output was still `idempotency_records` DDL/helper later.
- Before M0.1, some schema sections still used operationless replay-guard language.

Risk:

If the same client-generated UUID is reused by different commands, the schema-level constraint can conflict across operations. If each table handles idempotency separately, replay behavior, request hash checks, expiry, and response reuse can drift by module.

Repair applied:

- `p0-idempotency-contract.md` defines the explicit `idempotency_records` schema, request hashing, conflict semantics, expiry policy, helper protocol, operation names, and acceptance tests.
- `p0-data-schema-draft.md` now anchors workflow/task/order API replay semantics on `idempotency_records` or `idempotency_record_id`.
- No remaining schema constraint should use `(organization_id, idempotency_key)` as an API replay guard. Ledger and reservation duplicate guards use `dedup_key`.

```text
idempotency_records
  organization_id
  operation_name
  idempotency_key
  request_hash
  resource_scope_type
  resource_scope_id
  response_resource_type
  response_resource_id
  status
  expires_at
  created_at
  updated_at

unique:
  (organization_id, operation_name, idempotency_key)
```

M0.1 decision: `workflows`, `tasks`, and API-created commerce orders use `idempotency_record_id` as the command replay anchor; any retained `idempotency_key` column is denormalized debug/reference data.

Gate:

No P0-A expensive command implementation until this is resolved and covered by tests:

- same key + same hash returns existing result
- same key + different hash returns `409 idempotency_conflict`
- expired key behavior is deterministic
- duplicate running command returns durable workflow/task state

### P0-2. ProviderRequest state naming had a cross-document drift

Evidence:

- `p0-state-dictionary.md` defines provider request uncertainty as `result_unknown`.
- `p0-execution-and-recovery-spec.md` also says unknown provider results are represented as `result_unknown`.
- Before this review, `p0-module-implementation-blueprint.md` listed a non-canonical ProviderRequest ambiguity state.

Risk:

`unknown` is legitimate for payment intent status, but ProviderRequest uses `result_unknown`. Mixing both in code creates exactly the kind of state drift the state dictionary is meant to prevent.

Repair applied:

The ProviderRequest row in `p0-module-implementation-blueprint.md` now uses `result_unknown` and `manual_review_required`.

Gate:

Before generating DB/API/frontend enums, run a state-string consistency check across all architecture docs so this does not regress.

### P0-3. The blueprint is coordination-ready; M0.1 defines the machine-executable bridge

Evidence:

- `p0-module-implementation-blueprint.md` says the blueprint is the M0 coordination baseline, not implementation complete.
- `p0-m0-contract-freeze.md` now marks command inventory, event inventory, repair job inventory, and verification matrix as `M0.1 specified`.
- `architecture-consistency-checklist.md` still requires state dictionary finalization, idempotency DDL, API command idempotency semantics, executable P0-A tests, and recovery specs before implementation stages.

Risk:

If teams treat the current docs as code-ready contracts, modules can still diverge on payload shape, event schemas, command names, table constraints, and test expectations.

Repair applied:

The M0.1 Contract Hardening milestone now exists as `p0-m0-1-contract-hardening.md`:

```text
M0.1 outputs:
  packages/contracts/api
  packages/contracts/events
  packages/contracts/domain
  migration-ready DDL draft
  idempotency_records DDL/helper contract
  state consistency check
  PRD + architecture test matrix mapped to test files
  repair job specs with scan SQL and idempotent action
```

Gate:

Parallel module work starts only after M0.1 contracts compile or pass schema validation.

### P1-1. Verification is mapped, but not yet executable

Evidence:

- PRD has TC-P0-001 through TC-P0-014.
- Architecture has R-001 through R-019 and execution spec extends to R-029.
- Blueprint has an executable verification matrix.
- `p0-verification-plan.md` maps PRD, architecture, reliability, recovery, commerce, and ops scenarios to proposed test files and CI gates.
- The execution spec says confidence cannot be 100% until migrations, worker prototype, provider stub, credit concurrency test, and tenant/signed URL tests exist.

Remaining risk:

The matrix can still become prose-only acceptance if the proposed files and CI gates are not created during M0.1/M1/M2.

Repair applied:

`docs/architecture/p0-verification-plan.md` now tracks:

```text
Scenario ID
Stage
Test type
Owning module
Proposed test file
Required fixtures
Failure injected
Expected assertion
CI gate
```

Gate:

M2 cannot exit unless P0-A PRD tests and P0-A architecture tests are implemented in CI.

### P1-2. Data schema is design-grade, not migration-grade

Evidence:

- Schema draft states it is not a migration file.
- Remaining risks include RLS choice, balance cache reconciliation query, provider payload privacy, composite FK ergonomics, and asset version lifecycle.

Risk:

If implementation starts directly from prose tables, each module may encode constraints differently.

Recommendation:

Before module coding:

- produce migration files or a migration-ready DDL appendix
- label table owners in migrations
- decide enum vs check constraints
- prototype composite FK support with the chosen query builder
- decide whether RLS is enabled now or deliberately deferred with tests proving scoped queries

### P1-3. P0-B commercial payment is intentionally not implementation-ready

Evidence:

- Commerce/payment design lists official WeChat Pay, Alipay, finance/tax, credit package scope, customer-facing history, and settlement-report import/export as open items.
- Decision log repeats these as open questions.

Risk:

Payment, refund, invoice, and reconciliation bugs create direct financial and compliance exposure.

Recommendation:

Do not start provider adapter implementation until:

- official WeChat Pay `native_qr` mapping is verified
- official Alipay `pc_page` / optional `qr_code` mapping is verified
- merchant account capabilities are confirmed
- finance/tax signs off invoice category, tax rate, red-letter workflow, retention
- provider report import/export path is chosen for daily settlement

P0-A should use mock/stub or no-real-cost providers unless the minimum ProviderRequest side-effect protection test passes.

### P1-4. Collaboration rules exist, but implementation ownership artifacts are missing

Evidence:

- The blueprint defines domain owner, contract owner, data owner, reliability owner, and security/Ops reviewer roles.
- It also defines a cross-module PR protocol.

Risk:

Without concrete ownership artifacts, review discipline relies on memory.

Recommendation:

Add implementation-facing collaboration files when code begins:

- `CODEOWNERS` or equivalent review ownership
- PR template with the blueprint boundary checklist
- module labels matching the blueprint modules
- contract-change record template for post-M0 state/owner/command/event changes

## Not In Scope

This review does not:

- verify official WeChat Pay or Alipay documentation
- approve commercial beta launch
- choose the deployment target, object storage provider, or email delivery provider
- review implementation code, because none exists in this repository yet
- decide final finance/tax policy

## What Already Exists

Useful existing artifacts:

- PRD test cases already express user-visible acceptance.
- Architecture already separates P0-A, P0-B, and P0-C.
- State dictionary is already the canonical state source.
- Schema draft already names table ownership and critical constraints.
- Execution/recovery spec already handles provider ambiguity, leases, finalization, reservations, and repair.
- Commerce/payment design already separates cash facts from credit facts.
- M0 freeze record already prevents casual post-M0 contract drift.
- Module blueprint already contains the collaboration model and PR checklist.

These should be reused as sources, not rewritten.

## Recommended Implementation Order

### M0.1 Contract Hardening

1. Add a state-string consistency check that keeps ProviderRequest on its canonical uncertainty state.
2. Add `idempotency_records` DDL/helper contract and align workflow/task references.
3. Generate or manually validate state constants, DB constraints, API schemas, frontend types, worker transition fixtures.
4. Produce API command schemas and event schemas with `schema_version`.
5. Convert verification matrices into test-file ownership.
6. Convert repair job inventory into scan conditions, transaction pseudocode, and test cases.

### M1 Platform Foundation

1. Email-code auth provider, TTL, resend, verify, and abuse limits.
2. Organization/workspace/membership/capability resolver.
3. Tenant-scoped repository/query helpers.
4. Audit append helper.
5. Tenant leak and signed URL authorization tests.

### M2 P0-A Creator Loop

1. Project/script/episode.
2. Workflow/task/attempt skeleton.
3. Asset/version.
4. Shot status and pointer safety.
5. Mock/stub ModelGateway.
6. Export workflow.
7. PRD TC-P0-001 through TC-P0-014 in CI.

### M3 Real Provider Safety

1. ProviderRequest pre-call persistence.
2. `external_submission_started_at` boundary.
3. Provider stub failure matrix.
4. A-001 no blind duplicate external submission.

### M4-M6 P0-B Reliability and Commercial Gate

Proceed only after M2/M3 acceptance. Build leases, Redis repair, credit reservations, Admin/Ops, commerce/payment, reconciliation, dashboards, and runbooks.

## Parallelization Strategy

Before M0.1 completes, keep work mostly sequential because contracts are still the shared dependency.

After M0.1:

| Lane | Workstream | Depends On | Notes |
| --- | --- | --- | --- |
| A | Identity/Auth + Organization + Audit | M0.1 contracts | Can run ahead of creator loop. |
| B | Workflow/Task skeleton + Outbox/Inbox | M0.1 contracts | Shared dependency for creator loop and reliability. |
| C | Project/Asset/Shot creator modules | A + B | Can split after command/event schemas are fixed. |
| D | ModelGateway provider stub | B | Independent from UI, but must share task/attempt contracts. |
| E | Export | A + B + Asset | Smaller lane after asset contracts settle. |
| F | Commerce/Payment | D1 credit baseline + official provider/finance gates | Do not parallelize early with P0-A unless team capacity is large and gates are owned. |

Recommended execution:

```text
M0.1 sequential
  -> launch A + B in parallel
  -> launch C + D + E after A/B interfaces stabilize
  -> launch credit reliability
  -> launch commerce/payment only after provider and finance gates close
```

## Confidence Loop

### Loop 1: PRD to architecture

Question:

Does the architecture reflect the PRD's real core loop?

Result:

Yes. The architecture maps the PRD from project/script/assets/shots/calibration/generation/export into project, asset, shot, workflow/task, model gateway, credit, export, and audit modules.

Remaining issue:

PRD uses a user-facing single project status list, while architecture uses `project_phase` plus readiness flags. This is acceptable because the state dictionary explicitly maps PRD labels to canonical representation.

### Loop 2: architecture to schema

Question:

Do architectural invariants have schema anchors?

Result:

Mostly. Tenant scope, tasks, attempts, provider requests, asset versions, ledgers, outbox, inbox, audit, calibration, and payment tables exist as schema draft.

Remaining issues:

- `idempotency_records` is now defined at document-contract level; migration files and helper code are still missing.
- workflow/task/order API replay semantics now anchor on `idempotency_record_id`; implementation must still enforce this with tests.
- schema is not migration-ready.

### Loop 3: blueprint to development

Question:

Can a team split work safely from the current blueprint?

Result:

Conditionally, and more strongly after M0.1. Module boundaries, tracks A-F, contract-hardening artifacts, verification ownership, and collaboration protocol are clear enough for planning and M0.1 implementation.

Remaining issues:

- API/event schemas are not generated.
- test matrices are assigned to proposed files and gates, but those files do not exist yet.
- collaboration rules are documented, but `.github/CODEOWNERS`, PR template, and labels are not created yet.

### Loop 4: failure and recovery

Question:

Are expensive/external side effects safe by design?

Result:

The design is strong: provider pre-call persistence, `external_submission_started_at`, `result_unknown`, lease repair, finalization transaction, ledger settlement, and Admin/Ops recovery are all present.

Remaining issue:

The spec itself correctly says confidence cannot be 100% until the worker prototype, provider stub, concurrency tests, and tenant/signed URL tests pass.

## Final Decision Record

### REVIEW-D-001: Treat current architecture as M0 coordination baseline

The current architecture is accepted as the module implementation blueprint baseline. It is not accepted as implementation-complete.

### REVIEW-D-002: Add M0.1 Contract Hardening before broad module coding

M0.1 now defines the contract-hardening package. Generated contracts, idempotency migration/helper, state consistency validation, migration files, and executable tests are still required before broad P0-A/P0-B parallel implementation.

### REVIEW-D-003: Keep P0-A real-provider usage gated

P0-A may use mock/stub providers freely. Any real paid provider usage requires ProviderRequest pre-call persistence, `external_submission_started_at`, minimum `result_unknown`, and A-001-style no-blind-retry verification.

### REVIEW-D-004: Keep P0-B payment implementation gated

P0-B commerce/payment implementation cannot start until official provider mappings, merchant capabilities, settlement report mechanism, and finance/tax policy are verified.

## Bottom Line

The architecture has crossed the line from "architecture view" into "engineering landing view." It now answers who owns what, who writes what, who calls whom, what fails, how it is repaired, how it is verified, and how the team coordinates.

The next correct move is not broad feature coding. It is implementing the M0.1 Contract Hardening package so the blueprint becomes executable rather than merely readable.

## Re-Review Addendum: 2026-05-08

This pass re-read the PRD and the architecture package from the perspective of an implementation owner, not an architecture author.

Verdict: the system architecture is converged as a document-level M0 coordination baseline and an M0.1 implementation-readiness gate. It is not yet converged as executable implementation artifacts.

Confidence:

- 100% confident in the gating decision: broad P0-A/P0-B feature coding should not start before M0.1 exit.
- Not 100% confident in implementation correctness yet, because contracts, migrations, generated schema/constants, provider stubs, CI tests, CODEOWNERS/PR templates, and provider/finance/deployment approvals do not exist as running artifacts.

No new architecture-direction blocker was found in this review. The remaining risk is execution drift: teams could read the blueprint correctly but still implement divergent contracts unless M0.1 is completed first.

Current implementation blockers remain:

1. Generate or hand-author shared contract artifacts for domain states, operation names, command schemas, event schemas, and capabilities.
2. Produce migration-ready DDL from `p0-data-schema-draft.md`, including owner labels, tenant constraints, idempotency records, ledger constraints, outbox/inbox tables, and provider request side-effect fields.
3. Implement the idempotency helper and tests from `p0-idempotency-contract.md`.
4. Convert `p0-verification-plan.md` into actual test files and CI gates.
5. Convert `p0-collaboration-contract.md` into repository-facing ownership artifacts before parallel module work.
6. Keep P0-A real provider usage gated by ProviderRequest pre-call persistence and no-blind-retry verification.
7. Keep P0-B payment implementation gated by official provider field verification, merchant capability checks, settlement/report process, and finance/tax approval.

Decision: keep `REVIEW-D-001` through `REVIEW-D-004` unchanged. The next work item is still M0.1 Contract Hardening, not broad feature development.

## M0.1 Execution Addendum: 2026-05-08

M0.1 Contract Hardening has now been executed as a repository artifact pass.

Created implementation-readiness artifacts:

1. Shared domain constants under `packages/contracts/domain`.
2. API command contract metadata under `packages/contracts/api`.
3. Event contract metadata under `packages/contracts/events`.
4. Foundation SQL under `packages/db/migrations/0001_foundation.sql`.
5. Idempotency helper contract under `apps/backend/src/modules/shared/idempotency`.
6. Foundation repair contract tests for outbox dedup, queued task redis-loss selection, and credit balance drift.
7. `.github/CODEOWNERS` and `.github/pull_request_template.md`.

Verified gates:

```text
pnpm test packages/contracts
pnpm test apps/backend/src/modules/shared
git diff --check
```

Exit decision:

- M0.1 exits as an implementation-readiness gate.
- M0.1 does not mean production implementation is complete.
- M1/M2 planning can now proceed against shared contracts.

Remaining gates before broader claims:

- M1 must implement auth, organization, tenant-safe query helpers, and audit with tenant/security tests.
- M2 must implement the P0-A creator loop and PRD acceptance tests.
- M3 must implement ProviderRequest pre-call persistence and no-blind-retry provider stub tests before real provider dogfood.
- M4/M5/M6 still own reliability, commerce/payment, ops, observability, and commercial readiness.

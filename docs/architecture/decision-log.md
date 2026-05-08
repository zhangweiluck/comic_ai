# AI Comic Platform Architecture Decision Log

> This file records confirmed architecture decisions for the AI comic drama creation platform and its internal video model gateway.
> It is a living decision log, not the final architecture specification.

## Context

The product has two related business directions:

1. AI comic drama creation platform.
2. Video model gateway / relay layer.

For P0, the creation platform is the primary product. The model gateway is an internal capability foundation that supports generation, routing, cost tracking, and future externalization.

Primary PRD: `docs/product/reelmate-core-replication-prd.md`

## Confirmed Decisions

### D-001: Product Priority

**Decision:** AI comic drama creation platform first; video model gateway as internal capability for P0.

**Rationale:**

- The PRD focuses on the end-to-end creator workflow from script to storyboard images, storyboard videos, and exportable assets.
- The gateway should be architected as a separable capability, but not exposed as an external developer product in P0.
- This prevents premature platform complexity while avoiding hard coupling between creation workflows and model vendors.

**Implications:**

- No external API key management, public model marketplace, or developer dashboard in P0.
- Internal gateway interfaces must still be clean enough to become external APIs later.

### D-002: P0 Scale Target

**Decision:** Design for commercial beta scale.

**Target:**

- Dozens of customer teams.
- Thousands to low tens of thousands of generation tasks per day.

**Rationale:**

- This avoids overbuilding for imaginary massive scale.
- It still requires serious handling of long-running tasks, tenant isolation, cost control, retries, observability, and failure recovery.

### D-003: Application Architecture

**Decision:** Use a frontend and backend split, with the backend as a modular monolith.

**Preferred backend shape:**

- NestJS or Fastify-style API service.
- Modules separated by business domain.
- One deployable backend application at P0, with hard internal boundaries.

**Rationale:**

- A modular monolith preserves development speed and transactional consistency.
- Clear module boundaries allow future extraction only when operational pressure proves it is necessary.

### D-004: Infrastructure Posture

**Decision:** Docker-based local and deployable runtime is acceptable, but architecture must prepare for scale.

**Rationale:**

- Docker makes development and deployment reproducible.
- The architecture must still support horizontal workers, queue-based load smoothing, provider circuit breaking, and data-layer evolution.

### D-005: Model Provider Strategy

**Decision:** P0 supports at least two model providers.

**Rationale:**

- The platform must avoid hard dependency on a single video or image model vendor.
- At least one primary and one backup provider are required for routing, failover, cost comparison, and provider-health learning.

**Implications:**

- Creation modules must not call model providers directly.
- All model calls go through an internal model gateway abstraction.

### D-006: Tenant Model

**Decision:** Use standard multi-tenancy from P0.

**Canonical hierarchy:**

```text
Organization
  -> Workspace
    -> Project
      -> Episode
      -> Script
      -> Character / Scene / Prop assets
      -> Shot
      -> Generation task
      -> Export
```

**Rationale:**

- The PRD already requires organization-level quota, workspace project creation permissions, project-level inherited permissions, and role-based access.
- Retrofitting tenancy later would be expensive and dangerous.

**Implications:**

- Core tables must include `organization_id`.
- Most business tables should also include `workspace_id` and/or `project_id` where applicable.
- API authorization must enforce tenant and role checks server-side, not only in the UI.

### D-007: Quota and Cost Model

**Decision:** Use a mixed model.

**User-facing model:**

- Credits / quota.

**Internal admin / operations model:**

- Estimated credit cost.
- Actual credit consumption.
- Provider request cost.
- Gross margin.
- Abnormal cost events.

**Rationale:**

- Creators need a simple quota experience.
- The business needs a real cost ledger from day one to support model routing, margin analysis, provider comparison, and future gateway monetization.

### D-008: Task Truth Source

**Decision:** PostgreSQL is the source of truth; Redis/BullMQ is the scheduling executor.

**Rule:**

```text
PostgreSQL owns truth.
Redis/BullMQ owns dispatch.
```

**PostgreSQL stores:**

- Task state.
- Business ownership.
- Tenant IDs.
- Permission context.
- Input snapshots.
- Output assets.
- Provider request records.
- Cost and credit events.
- Failure reasons.
- Audit events.

**Redis/BullMQ handles:**

- Queueing.
- Delayed execution.
- Worker dispatch.
- Concurrency control.
- Priority.
- Retry scheduling.

**Rationale:**

- Redis can be lost, rebuilt, or duplicate-deliver jobs.
- Business truth, billing, and audit history must be durable and recoverable.

**Implications:**

- Workers must be idempotent.
- State transitions must be persisted in PostgreSQL.
- The system must be able to rebuild queued work from PostgreSQL after Redis failure.
- Duplicate execution must not duplicate billing or overwrite asset versions.

### D-009: Asset Storage

**Decision:** Use a storage adapter. Local development can use MinIO; production uses object storage.

**Rationale:**

- Scripts, source files, reference images, generated images, videos, and export packages should not depend on local filesystem persistence.
- Object storage enables CDN, lifecycle policies, future archival, and multi-region evolution.

**Implications:**

- Database stores metadata and object keys, not large binary objects.
- Application code depends on a storage interface rather than provider-specific SDK calls.

### D-010: Frontend Product Surfaces

**Decision:** P0 has two surfaces.

1. Creator workspace.
2. Operations/admin console.

**Creator workspace includes:**

- Project list.
- Script input and parsing.
- Public assets.
- Storyboard shots.
- Style calibration.
- Image and video generation.
- Export.

**Operations/admin console includes:**

- Organization quota.
- Task queue visibility.
- Failed task review and retry.
- Provider status.
- Provider cost and margin.
- Abnormal event audit.

**Rationale:**

- The creator workflow alone is not enough for a two-provider, cost-sensitive, long-task product.
- Operations tooling is required to keep the beta reliable.

### D-011: Identity and Auth Direction

**Decision:** Prefer self-owned core identity and organization membership, with pluggable auth providers.

**P0 direction:**

- Users, organizations, memberships, roles, and project permissions live in the platform database.
- P0 primary login is email-code, as frozen by D-046.
- Password, OAuth, and SSO can be added later through adapters.

**Rationale:**

- Tenant, quota, permissions, and audit are core business data.
- These should not be locked into a third-party auth provider's data model.

### D-012: Model Gateway Boundary

**Decision:** Build the model gateway inside the P0 modular monolith, but design it as a future extractable service.

**Boundary:**

- Creation modules call the model gateway module, never provider SDKs directly.
- The gateway owns provider adapters, provider request records, routing decisions, retry/fallback semantics, provider error normalization, and raw provider cost capture.
- The gateway does not own creator-facing workflow state, project state, shot state, asset version state, or credit consumption policy.

**Rationale:**

- P0 needs development speed and transactional visibility.
- Long term, the video model gateway may become its own commercial product or service.
- Keeping this boundary clean avoids rewriting creator workflows when the gateway is externalized.

**Implications:**

- Provider-specific request/response formats must be normalized before crossing back into creation modules.
- Gateway outputs should reference durable asset/object metadata rather than returning only raw URLs.
- Provider request IDs must link to task IDs and cost records for audit and reconciliation.

### D-013: Workflow, Task, and Attempt Model

**Decision:** Model long-running work with three layers: `workflow`, `task`, and `attempt`.

**Definitions:**

- `Workflow`: A business-level process, such as script parsing, storyboard batch image generation, calibration generation, or export packaging.
- `Task`: A logical unit of work inside a workflow, such as generating one shot image or one video clip.
- `Attempt`: A concrete execution try for a task, including retry attempts and provider fallback attempts.

**Rationale:**

- A task describes what the platform intends to accomplish.
- An attempt describes what actually happened during one execution.
- Separating them is required for reliable retries, provider failover, cost reconciliation, failure analysis, and idempotency.

**Implications:**

- Credit and provider cost records should link to immutable workflow/task/attempt identifiers.
- Provider request records should normally link to attempts, not only tasks.
- Retrying a task creates a new attempt rather than mutating historical execution facts.
- A task can succeed after one or more failed attempts.
- Workflow status is derived from child task states, with explicit stored snapshots for fast querying.

### D-014: Execution State and Business State Ownership

**Decision:** The Workflow/Task module owns execution state. Business modules own domain state.

**Boundary:**

- Workflow/Task owns `queued`, `running`, `succeeded`, `failed`, `cancel_requested`, and attempt-level execution facts.
- Project, Asset, Shot, Export, and Credit modules own their own business states and derived read models.
- Business state changes happen through explicit domain events or transactional callbacks after task state changes.

**Example:**

When a shot image generation task succeeds:

1. The task attempt is marked `succeeded`.
2. The Asset module creates a new immutable asset version.
3. The Shot module updates the shot image status to `image_completed`.
4. The Credit module records the credit consumption event.
5. The Audit module records the important user-visible state transition.

**Rationale:**

- Execution state and business state change for different reasons.
- Mixing them would make recovery, retries, and debugging unreliable.

### D-015: Transactional Outbox for Queue Dispatch and Cross-Module Events

**Decision:** Use a transactional outbox pattern for queue dispatch and important cross-module events.

**Rationale:**

- PostgreSQL is the source of truth, but BullMQ is outside the database transaction.
- Creating a task in PostgreSQL and enqueueing it in Redis must not create split-brain behavior.

**Implications:**

- Commands write domain records and outbox events in the same PostgreSQL transaction.
- A dispatcher publishes outbox events to BullMQ or internal handlers.
- Published events are marked processed only after successful dispatch.
- A repair job can republish unprocessed or stale outbox events.
- Workers must tolerate duplicate deliveries.
- Worker finalization uses one PostgreSQL transaction for local facts: attempt state, task state, asset version creation, current pointer updates, credit ledger entries, audit events, and follow-up outbox events.
- Cross-module consumers use an inbox or processed-event table keyed by event ID to make replay safe.

### D-016: Idempotency at Command and Worker Boundaries

**Decision:** Every expensive or state-changing command must have an idempotency strategy.

**Required boundaries:**

- API commands that create workflows or tasks.
- Worker handlers that execute tasks.
- Provider calls that may be retried or fallback.
- Credit consumption events.
- Asset version creation.
- Export package creation.

**Rationale:**

- Users refresh pages.
- BullMQ can retry.
- Redis can duplicate-deliver.
- Providers can timeout after accepting work.
- Workers can crash after a provider succeeds but before local state is updated.

**Implications:**

- Use stable idempotency keys for user commands and generated task commands.
- Enforce unique constraints where duplicate side effects would be harmful.
- Treat provider request records as immutable execution facts.
- Never use "button disabled" as the only duplicate-submit protection.

### D-017: Immutable Asset Versions

**Decision:** Generated and uploaded assets are immutable versions; regeneration creates a new version and moves the current pointer.

**Rationale:**

- The PRD requires regeneration not to overwrite old results.
- Images, videos, references, scripts, and exports need auditability and rollback potential.
- Asset mutation would break reproducibility of tasks and exports.

**Implications:**

- Store asset metadata separately from asset versions.
- Store object storage keys on versions.
- Business entities such as shots point to the current selected version.
- Old versions can be hidden from P0 UI, but must not be deleted by default.

### D-018: Ledger-Based Credit and Cost Accounting

**Decision:** Use append-only ledger records for credit reservations, consumption, provider costs, and abnormal adjustments.

**Rationale:**

- Balance fields are useful read models, but they are not an audit trail.
- Provider costs, internal credits, and user-visible quota can diverge unless each economic event is recorded.
- Generation tasks can oversell quota if P0 only checks balance before task creation without reserving credits.

**Implications:**

- Creating a generation workflow reserves estimated credits in the same PostgreSQL transaction.
- Successful tasks convert reserved credits into consumption.
- Failed or canceled queued tasks release reserved credits.
- Credit consumption should reference workflow/task/attempt IDs.
- Provider cost records should reference provider request and attempt IDs.
- Balance summaries can be cached or materialized, but ledger rows are the truth.
- P0 can use estimated cost as actual cost when provider cost is unavailable, but must mark that cost source explicitly.

### D-019: Server-Side Authorization Policy

**Decision:** Authorization is enforced at command/query boundaries on the backend.

**Rationale:**

- PRD requires no-permission operations to be hidden or disabled in UI and rejected by API.
- Multi-tenant data leakage is a catastrophic class of bug.

**Implications:**

- Every request resolves `actor`, `organization`, `workspace`, and role context.
- Every command checks tenant scope and capability.
- List queries must include tenant filters by construction.
- Operations/admin permissions are separate from creator workspace permissions.
- Audit events should include actor and tenant context for sensitive operations.

### D-020: Provider Routing and Fallback Policy

**Decision:** P0-B uses health-aware primary/backup routing, not a public model marketplace. P0-A only validates the ProviderAdapter boundary with one provider or mock/stub implementation.

**Rationale:**

- The commercial beta needs at least two providers for resilience.
- All P0 stages should avoid exposing provider complexity to creators.

**Policy:**

- Each model capability has a primary provider and backup provider.
- Routing considers provider health, configured capability, rate limits, and recent failure rate.
- Fallback creates a new attempt and provider request record.
- Automatic fallback is allowed only for failures that are safe to retry without duplicate billing or duplicate outputs.
- Operations/admin can disable a provider or force a provider for diagnosis.

**Provider adapter contract:**

- Adapters declare whether they support client request IDs, status lookup, cancellation, and safe retry.
- Adapters declare billing trigger semantics: accept, success, output, or unknown.
- Unknown provider results move attempts to `result_unknown` and are reconciled by worker or operations flow before unsafe retry.

### D-021: Content Safety Boundary

**Decision:** P0 includes a minimal moderation boundary before provider submission and after provider output metadata ingestion.

**Rationale:**

- Image and video generation can trigger provider policy failures and business risk.
- The PRD lists content safety interception as a generation failure type.

**Implications:**

- Store moderation status and reason on tasks or attempts when relevant.
- Normalize provider safety failures into platform error codes.
- Do not silently retry content safety failures with another provider.
- P0 can start with provider-side safety plus basic platform policy checks, but must keep an explicit moderation interface.

### D-022: Observability as P0 Infrastructure

**Decision:** Observability is part of P0, not a later enhancement.

**Minimum scope:**

- Structured logs with request ID, organization ID, project ID, workflow ID, task ID, attempt ID, and provider request ID where applicable.
- Metrics for task throughput, queue latency, task duration, provider latency, provider failure rate, cost, and credit consumption.
- Error tracking for API and worker failures.
- Operations/admin views for failed workflows, stuck tasks, provider health, and abnormal costs.

**Rationale:**

- Commercial beta reliability depends on fast diagnosis.
- Long-running AI tasks fail in ways that users cannot debug from the UI alone.

### D-023: Deployment Topology

**Decision:** P0 deploys as a containerized modular monolith plus horizontally scalable workers.

**Topology:**

- Web frontend.
- Backend API.
- Worker process group.
- Outbox dispatcher / scheduler process.
- PostgreSQL.
- Redis.
- Object storage.

**Rationale:**

- Keeps the application understandable while allowing worker scaling separately from API traffic.
- Allows Docker Compose for local development and managed services in production.

**Scale path:**

- Scale workers by queue and provider capability.
- Split heavy workers by task type when needed.
- Extract ModelGateway only after internal module boundaries prove stable.

### D-024: Data Retention and Deletion Posture

**Decision:** P0 defaults to retention over deletion for economic records, while user content needs explicit archive/delete boundaries.

**Rationale:**

- Debugging, audit, cost reconciliation, and user trust depend on historical records.
- Deleting provider and credit records would break financial integrity.
- Scripts, prompts, images, and videos are user content and may be subject to privacy, contract, or content-safety deletion requirements.

**Implications:**

- Projects can be archived before hard deletion exists.
- Asset versions are retained by default.
- Economic ledgers and provider request records are never physically deleted in normal product flows.
- User content supports archive and soft delete in P0.
- Logs should store hashes, summaries, or redacted snippets by default rather than raw sensitive prompts.
- Future hard-delete/privacy flows must distinguish user content from financial/audit records.

### D-025: Quality and Review Facts

**Decision:** P0 adds a lightweight Quality/Review boundary for generated output usability.

**Rationale:**

- The PRD requires generated images and videos to be usable, not only technically completed.
- Calibration, batch release, retry guidance, and operations diagnosis need durable quality facts.

**Implications:**

- Store validation result, review requirement, validation source, and failure reason for calibration images, shot images, and shot videos.
- Quality checks can start simple: automated metadata checks, model-assisted review, or human review.
- Calibration pass and batch release should depend on recorded validation/review facts where applicable.

### D-026: Current Asset Pointer Safety

**Decision:** Current asset pointers are guarded by generation intent or `content_revision`.

**Rationale:**

- Concurrent regeneration can otherwise let stale attempts overwrite newer current results.

**Implications:**

- A shot tracks active generation task ID and `content_revision`.
- A completed attempt updates `current_asset_version_id` only if it matches the active generation intent.
- Late stale outputs are retained as historical asset versions but do not become current.

### D-027: Database-Level Tenant Safety

**Decision:** Tenant isolation must be reinforced below application service code.

**Rationale:**

- Relying only on developers to remember tenant filters is too fragile for a multi-tenant product.

**Implications:**

- Tenant fields are non-null on tenant-owned tables.
- High-risk foreign keys and unique constraints include tenant context where practical.
- Repository/query helpers require tenant scope.
- PostgreSQL RLS is evaluated before production.
- Signed object storage URLs are issued only after backend tenant authorization.

### D-028: P0 Implementation Baseline

**Decision:** Use a TypeScript monorepo with Next.js frontend and NestJS backend using the Fastify adapter.

**Backend baseline:**

- One backend codebase with API, worker, and dispatcher entrypoints.
- PostgreSQL with SQL migrations and a typed query builder rather than hiding critical constraints behind a high-level ORM.
- Redis/BullMQ for dispatch.
- MinIO in development and object storage in production through a storage adapter.

**Rationale:**

- The product needs strong module boundaries, guards, dependency injection, worker reuse, and explicit SQL control.
- The schema requires row locks, composite tenant constraints, reconciliation queries, and future RLS compatibility.

**Implications:**

- Implementation plans should follow `docs/architecture/p0-implementation-baseline.md`.
- Any framework change must prove it still supports the task, tenant, and ledger invariants.

### D-029: Unknown Provider Result Settlement

**Decision:** `result_unknown` never becomes ordinary `failed` only because lookup TTL expired.

**Rationale:**

- The provider may already have accepted work, produced output, or charged cost.
- Treating unknown as ordinary failure would release user credits and hide abnormal provider cost.

**Implications:**

- Lookup TTL expiry moves task/attempt/provider request to `manual_review_required`.
- Reservation allocations linked to unknown attempts remain held until settlement.
- Manual or reconciliation flow decides consume, release, retry, or abnormal internal cost.

### D-030: Task Lease and Stale Running Recovery

**Decision:** Claiming a task creates an attempt and lease in the same PostgreSQL transaction.

**Rationale:**

- A worker can crash after claim and before provider call.
- Without `locked_by`, `locked_until`, heartbeat, and `current_attempt_id`, `running` tasks can get stuck with no recovery signal.

**Implications:**

- Tasks and attempts include lease fields.
- Workers heartbeat while running.
- Repair logic uses lease expiry plus provider request state to requeue, reconcile, finalize, or fail safely.

### D-031: Per-Task Credit Reservation Allocation

**Decision:** Batch workflow credit reservations are allocated per billable task.

**Rationale:**

- Batch workflows can partially succeed.
- Workflow-level reservation alone is not enough to prove which child task consumed or released credits.

**Implications:**

- `credit_reservations` is the workflow-level envelope.
- `credit_reservation_allocations` is the task-level settlement unit.
- Consume/release ledger entries reference the same allocation and are uniqueness constrained.

### D-032: Calibration as First-Class Business Entity

**Decision:** Style calibration is represented by durable session, item, and decision records.

**Rationale:**

- PRD makes calibration pass/skip a hard gate before batch generation.
- Quality review rows alone do not explain which three shots were selected or who approved/overrode the gate.

**Implications:**

- Use `calibration_sessions`, `calibration_items`, and `calibration_decisions`.
- Batch generation guard checks durable calibration facts, not UI-only state.

### D-033: Canonical State Dictionary

**Decision:** Use `docs/architecture/p0-state-dictionary.md` as the canonical source for status values.

**Rationale:**

- PRD, DB, API, worker, UI, and tests can drift if each layer names states independently.

**Implications:**

- Implementation should generate or validate DB enums/check constraints, API schemas, frontend types, and test fixtures from the dictionary.
- PRD/UI labels can differ from DB/API values only through explicit mappings in the dictionary.

### D-034: Workflow Settlement Aggregation

**Decision:** Workflow aggregation must expose unresolved provider settlement.

**Rationale:**

- Batch workflows can contain child tasks with unknown provider output or cost.
- Marking the parent workflow as `partial_succeeded`, `failed`, or `succeeded` while any child task is unresolved hides operational and accounting risk.

**Implications:**

- `result_unknown` and `manual_review_required` are valid workflow statuses.
- These statuses take precedence over terminal aggregation.
- A workflow can only enter terminal status after all child tasks and reservation allocations are settled.

### D-035: Provider Request Pre-Call Persistence

**Decision:** A provider request row is created before any external provider submission.

**Rationale:**

- Provider calls are expensive external side effects.
- If a worker calls a provider before persisting request intent, a crash after provider acceptance can leave the platform without a stable request ID for lookup, reconciliation, or cost accounting.

**Implications:**

- Workers generate a stable local `client_request_id`.
- `provider_requests(status = submitted)` is committed before the external call.
- Provider request rows snapshot retry, lookup, cancel, and billing policy used for that request.
- Recovery uses persisted provider request facts before deciding retry, fallback, manual review, or settlement.

### D-036: Single Settlement per Credit Allocation

**Decision:** A task-level credit reservation allocation can be settled exactly once.

**Rationale:**

- Separate uniqueness for `consume` and `release` still allows both rows to exist for one allocation.
- Double settlement corrupts user-facing quota and internal cost reconciliation.

**Implications:**

- Ledger has a partial unique settlement index on `(organization_id, reservation_allocation_id)` for `entry_type in ('consume', 'release')`.
- Settlement transactions lock the allocation row and transition it from unsettled to consumed or released.
- Allocation and ledger settlement state must be updated in the same PostgreSQL transaction.

### D-037: P0-B Minimal Self-Service Recharge

**Decision:** P0-B includes minimal self-service recharge through one-time credit packages, using both WeChat Pay and Alipay.

**Scope:**

- P0-A may use manual/internal credit grants.
- P0-B supports one-time credit package purchase.
- P0-B does not include subscription, auto-renewal, complex plan entitlement, or postpaid billing.

**Rationale:**

- Commercial beta needs a real payment path if users can buy credits.
- One-time credit packages validate willingness to pay while avoiding the long-term complexity of subscription lifecycle, plan downgrade, renewal failure, entitlement migration, and postpaid receivables.

**Implications:**

- P0-B must include order creation, payment intent creation, WeChat Pay and Alipay provider adapters, server-side callbacks, callback idempotency, payment-to-credit grant flow, and operations visibility.
- Subscription and complex plan entitlement remain explicit future work.

### D-038: Separate Commerce/Payment from Credit/Billing

**Decision:** Payment cash facts are owned by a separate `Commerce/Payment` module. User-facing credit balance remains owned by `Credit/Billing`.

**Rationale:**

- Money, credits, and provider cost are different facts with different lifecycles.
- Combining payment provider callbacks, orders, credit grants, generation reservations, and provider cost entries in one module would make refunds, reconciliation, audit, and future subscription support fragile.

**Implications:**

- `Commerce/Payment` owns credit packages, orders, payment intents, provider callback events, payment reconciliation, and refund facts.
- `Credit/Billing` owns credit grants, reservations, allocations, consumption, releases, adjustments, and balance read models.
- Payment success emits a durable event; the credit module consumes it idempotently and writes a `grant` ledger entry.
- Frontend payment success or redirect state never grants credits.

### D-039: Payment Callback and Credit Grant Idempotency

**Decision:** A paid order grants credits only after a verified provider callback or provider reconciliation creates a durable `payment.succeeded` event. The `Credit/Billing` module consumes that event idempotently and writes an append-only `grant` ledger entry.

**Rationale:**

- WeChat Pay and Alipay callbacks can be retried, duplicated, delayed, or arrive after frontend redirects fail.
- Frontend payment success pages are not trustworthy cash facts.
- A synchronous "mark paid and update balance" flow is too fragile for callback retries, process crashes, and paid-without-credit repair.

**Implications:**

- Provider callbacks are accepted only through public webhook endpoints verified by provider signature.
- Callback processing persists `payment_provider_events` before applying business transitions.
- Payment adapters normalize provider payloads into a stable internal callback shape.
- `payment.succeeded` is the only P0-B critical event that causes payment-origin credit grants.
- `credit_ledger_entries` must enforce a unique payment grant per `(organization_id, source_type, source_id, entry_type)`.
- Paid-without-credit repair uses the same idempotent Credit module path instead of manually mutating balances.

### D-040: P0-B Desktop Web Payment Product Modes

**Decision:** P0-B desktop Web recharge uses WeChat Pay `native_qr` and Alipay `pc_page` as the primary product modes. Alipay `qr_code` remains an allowed fallback if account capability, conversion, or implementation constraints make QR pre-create better for the first commercial beta.

**Rationale:**

- The product is desktop Web first.
- WeChat users commonly complete desktop Web payments by scanning a QR code with the WeChat client.
- Alipay desktop checkout can be handled by a provider-hosted PC payment page, while QR pre-create is a reasonable fallback for QR-centered checkout.
- This avoids adding JSAPI, H5, app pay, mini program pay, or mobile-specific modes into P0-B.

**Implications:**

- P0-B payment intent API supports `provider_mode`, but the enabled modes are restricted by configuration.
- WeChat Pay modes enabled for P0-B: `native_qr`.
- Alipay modes enabled for P0-B: `pc_page`, optionally `qr_code`.
- Implementation must verify official provider API names, request fields, signature verification, callback fields, query APIs, and acknowledgement formats before coding adapters.
- Mobile/H5/JS bridge payment modes are future work unless the frontend surface changes.

### D-041: P0-B Refunds Are Admin-Controlled and Ledger-Safe

**Decision:** P0-B refunds are Admin/Ops controlled. Self-service automated refunds are not part of P0-B. Refunds for already consumed credits require manual review or partial refund up to recoverable unused credits.

**Rationale:**

- Credits are a pooled user-facing balance; blindly refunding a purchase after credits have been consumed can create negative balances or untracked receivables.
- Provider refund, credit reversal, invoice reversal, and audit are separate facts.
- A conservative refund workflow protects financial integrity during commercial beta.

**Implications:**

- Refund commands require Admin/Ops permission, reason, and audit.
- Total refunded amount cannot exceed paid amount.
- Total reversed credits cannot exceed granted credits.
- Refunds that would make available credits negative enter `manual_review_required`.
- Provider refund callbacks that do not match a known platform refund request enter manual review.

### D-042: Invoice/Fapiao Is a Separate Compliance Workflow

**Decision:** P0-B records invoice/fapiao requests and issuance metadata but does not require full automated tax platform integration. Issued invoices must be linked to orders and considered during refund handling.

**Rationale:**

- Invoice documents are compliance facts, not payment or credit facts.
- Chinese electronic invoice and red-letter invoice rules require preserving enough linkage for correction/reversal workflows.
- Full automation can be added later once finance confirms invoice type, tax rate, red-letter process, and vendor/platform choice.

**Implications:**

- P0-B stores `invoice_requests` and `invoice_records`.
- Invoice state can block or flag refund automation.
- Refunds for issued invoices require finance-approved reversal/red-letter handling.
- Invoice data retention and access control must be treated as compliance-sensitive.

### D-043: P0-B Payment Risk Controls Are Defensive Gates

**Decision:** P0-B includes basic payment risk controls at order creation, payment intent creation, provider callback processing, and refund execution.

**Rationale:**

- The beta does not need a full fraud platform, but it must prevent obvious abuse, duplicate side effects, callback tampering, and high-risk operational blind spots.

**Implications:**

- Package price and credits are always snapshotted server-side.
- Order and payment intent creation are rate limited by user, organization, and IP.
- Enabled provider modes are server-configured.
- Callback signature, merchant identity, order number, amount, currency, and trade status are verified before payment state changes.
- Suspicious mismatches create `payment_risk_events` and Admin/Ops visibility.

### D-044: Payment Reconciliation Is P0-B Reliability Infrastructure

**Decision:** P0-B includes scheduled reconciliation for recent submitted/unknown payments, expired order closure, paid-without-credit repair, provider event retry, and daily settlement checks.

**Rationale:**

- Payment provider callbacks are at-least-once external signals and may be delayed, duplicated, lost, or conflict with provider query results.
- Commercial beta cannot rely on webhook delivery alone.
- Paid-without-credit is a customer trust failure and must be automatically detectable and repairable.

**Implications:**

- Recent payment reconciliation runs every 5 minutes.
- Expired order closure runs every 10 minutes and queries provider before closing.
- Paid-without-credit repair runs every 5 minutes and reuses the idempotent Credit grant path.
- Daily settlement checks create reconciliation items for drift instead of silently correcting financial facts.
- Reconciliation uses the same domain transition functions as callbacks.

### D-045: Payment Provider Adapters Normalize Provider Details

**Decision:** WeChat Pay and Alipay integration details are isolated behind `PaymentProviderAdapter` implementations. Application services use normalized create-payment, callback, query, close, refund, and bill-download contracts.

**Rationale:**

- WeChat Pay and Alipay differ in amount representation, callback acknowledgement, signature rules, query status values, and checkout payload shape.
- Letting controllers or application services inspect provider-specific payloads would make payment correctness hard to test and future provider changes risky.
- The platform must preserve a stable business contract even if provider SDKs or product modes change.

**Implications:**

- Provider-specific request/response fields are mapped inside adapters.
- WeChat amount remains integer cents; Alipay decimal amount strings are converted using strict decimal parsing, never floating point.
- Provider callbacks normalize into a common `NormalizedPaymentCallback`.
- Adapter tests must cover duplicate callbacks, invalid signatures, amount/currency mismatches, merchant mismatches, unknown provider results, and query reconciliation.
- Implementation must verify exact provider API fields against official docs before coding each adapter.

### D-046: P0 Authentication Method

**Decision:** P0 uses email-code login as the primary authentication method. Password credentials remain a future credential adapter and may be added without changing the user, organization, membership, or permission model.

**Rationale:**

- P0 needs to minimize authentication surface area while validating the creator and payment workflow.
- Email-code login avoids password reset, password rotation, and password breach handling complexity in the first implementation slice.
- The user table keeps `password_hash` nullable so password auth can be introduced later without changing tenant, quota, permissions, or audit ownership.

**Implications:**

- P0 implementation must include login-code issuance, verification, expiry, rate limiting, and audit/security events.
- Sessions remain server-controlled and revocable.
- Password login, OAuth, and SSO are post-P0 adapters unless explicitly pulled forward.
- The previous P0 login-method open question is closed by this decision.

### D-047: M0 Contract Freeze Baseline

**Decision:** `docs/architecture/p0-m0-contract-freeze.md` is the M0 document-level contract freeze baseline for module implementation planning.

**Rationale:**

- The architecture has moved from high-level system design into engineering coordination.
- Teams need a single frozen source for domain language, module ownership, state names, commands, events, idempotency, repair jobs, and acceptance expectations before parallel implementation starts.
- Freezing the document-level contracts now prevents hidden divergence while still keeping implementation-specific schema/code generation work explicit.

**Implications:**

- Post-M0 changes to state names, data ownership, cross-module commands, or cross-module events require a contract-change record.
- M0 freeze does not mean provider adapters, migrations, generated schemas, CI tests, or finance/tax approvals are complete.
- The remaining uncertainty is tracked as milestone gates instead of open architecture ambiguity.

### D-048: M0.1 Contract Hardening Before Broad Module Coding

**Decision:** The current architecture is accepted as the M0 coordination baseline, but broad P0-A/P0-B module implementation must wait for an M0.1 contract-hardening pass.

**Rationale:**

- The blueprint is buildable as a coordination plan, but command/event schemas, idempotency DDL, migration-ready constraints, and executable test mappings are not yet machine-readable.
- Starting broad feature coding before these artifacts exist would move ambiguity from documents into code, where it becomes more expensive to correct.
- The review record in `docs/architecture/p0-architecture-blueprint-review.md` identifies the remaining gaps as implementation gates, not architecture-direction blockers.

**Implications:**

- M0.1 must produce or validate shared domain/state constants, API schemas, event schemas, `idempotency_records` DDL/helper semantics, migration-ready schema constraints, repair job specs, and test-file ownership for PRD/architecture acceptance scenarios.
- P0-A real paid-provider usage remains gated by ProviderRequest pre-call persistence, `external_submission_started_at`, minimum `result_unknown`, and no-blind-retry verification.
- P0-B commerce/payment implementation remains gated by official WeChat Pay/Alipay field verification, merchant capability checks, settlement report mechanism, and finance/tax approval.

### D-049: M0.1 Contract Package Contents

**Decision:** M0.1 is defined by five implementation-readiness documents: `p0-m0-1-contract-hardening.md`, `p0-idempotency-contract.md`, `p0-verification-plan.md`, `p0-repair-job-spec.md`, and `p0-collaboration-contract.md`.

**Rationale:**

- A single blueprint is useful for orientation, but implementation needs separate contracts for duplicate-side-effect safety, test ownership, recovery jobs, and cross-module collaboration.
- Keeping these contracts as first-class documents makes future drift reviewable and keeps module plans small enough to execute.
- The new package closes the prior document-level gaps around operation-scoped idempotency, test-file mapping, repair job scan conditions, and PR/contract-change protocol.

**Implications:**

- P0 implementation plans must cite the relevant M0.1 contract document for every command, event, repair job, and acceptance test they touch.
- `p0-data-schema-draft.md` now includes `idempotency_records`, and workflow/task replay semantics must be anchored by that table or an explicitly equivalent operation-scoped constraint.
- M0.1 still does not mean implementation is complete; it means the module implementation blueprint is actionable enough to generate contracts, migrations, tests, and module plans.

### D-050: M0.1 Contract Hardening Exit

**Decision:** M0.1 exits as an implementation-readiness gate. The repository now contains executable foundation contract artifacts for states, operation names, capabilities, API command metadata, event metadata, operation-scoped idempotency, selected repair contracts, verification mapping, and collaboration scaffolding.

**Evidence:**

- `packages/contracts/domain/*` contains shared state, capability, operation-name, and event-type constants.
- `packages/contracts/api/*` contains command metadata with operation names, capabilities, idempotency requirements, state preconditions, errors, audit events, and verification IDs.
- `packages/contracts/events/*` contains event metadata with schema version, producer, source IDs, and replay/dedup keys.
- `packages/db/migrations/0001_foundation.sql` contains the M0.1 foundation SQL for identity/org, idempotency, workflow/task, and outbox/inbox.
- Executable contract tests pass for `packages/contracts` and `apps/backend/src/modules/shared`.
- `.github/CODEOWNERS` and `.github/pull_request_template.md` now implement the collaboration contract shape.

**Implications:**

- Broad module implementation can proceed to M1/M2 planning against these contracts, but production feature code must still add real module handlers, migrations, integration tests, worker tests, tenant tests, and provider stubs.
- P0-A real provider usage is still gated by ProviderRequest pre-call persistence, `external_submission_started_at`, and no-blind-retry verification.
- P0-B commerce/payment remains gated by official provider mapping, merchant capabilities, settlement/reporting process, and finance/tax approval.

### D-051: Delivery Execution System Before M1/M2 Coding

**Decision:** The team will manage P0 delivery through a capability-first execution system, not a module/file task list.

**Rationale:**

- The next project risk is no longer architecture ambiguity; it is execution drift, hidden dependencies, and tasks marked done without verifiable capability delivery.
- P0-A must prove a real minimum runnable loop before broad product surface work.
- Non-functional work such as tenant safety, idempotency, logs, repair jobs, tests, CI gates, release, rollback, and runbooks must be represented as first-class tasks.

**Implications:**

- `docs/architecture/p0-delivery-execution-system.md` is the baseline for minimum runnable loop, capability breakdown, dependency graph, development batches, task cards, DoD, risk front-loading, and delivery cadence.
- M1 begins with Identity/Auth, Organization, tenant-safe queries, and Audit before Project/Script/Shot work.
- The first implementation plan after M0.1 is `docs/superpowers/plans/2026-05-08-m1-platform-foundation.md`.
- A task may not move to Done unless its acceptance criteria, tests, and observability requirements are verified.

### D-052: Three-Person Delivery Split

**Decision:** P0 delivery is split across three role-based lanes: Platform/Reliability Owner, Creator Domain Owner, and Experience/QA/Ops Owner.

**Rationale:**

- Three developers should not work as three isolated feature factories. They should share one minimum runnable loop and own different failure modes.
- Platform/reliability work must precede tenant-owned creator features.
- Creator domain work must go through Workflow/Task, idempotency, and immutable asset/version contracts.
- Frontend/QA/Ops work must verify the real loop and cannot use fake state to claim progress.

**Implications:**

- `docs/architecture/p0-three-person-delivery-plan.md` is the execution split for daily board work.
- Developer A owns platform foundation, reliability, idempotency, Workflow/Task safety, credit reliability, and payment gates.
- Developer B owns Project/Script/Asset/Shot/Calibration/Export and the creator-loop backend.
- Developer C owns Web integration, E2E acceptance, release/observability/runbooks, and demo readiness.
- Every task must explicitly answer capability delivered, dependencies, verification, failure handling, and main-loop contribution before it can move to Done.

## Open Questions

These are not yet decided:

- Official WeChat Pay adapter field mapping for `native_qr`.
- Official Alipay adapter field mapping for `pc_page` and optional `qr_code`.
- Finance/tax confirmation of invoice type, tax rate, red-letter process, and data retention.
- Whether P0-B needs customer-facing full order history and credit ledger pages.
- Deployment target.
- Backup and disaster recovery objectives.
- Whether P0 needs a lightweight customer-facing quota ledger page.
- Exact object storage provider for production.
- Exact queue names, priorities, and worker concurrency limits.
- Exact provider list and model capability matrix.

## Confidence Review

Current confidence is not 100%.

Known risk areas:

1. Task idempotency and recovery can easily be under-designed.
2. Cost accounting can drift if provider requests, credit events, and task state are not linked by immutable IDs.
3. Multi-tenant authorization can leak data if tenant filters are applied inconsistently.
4. Model gateway abstraction can become too thin if it only wraps HTTP calls instead of normalizing capability, cost, failure, and output metadata.
5. Asset versioning can be corrupted if regeneration overwrites current assets instead of creating immutable versions.
6. Operations tooling can be postponed too far, making beta failures hard to diagnose.

Required mitigation direction:

- Define module boundaries and database ownership before implementation.
- Use immutable task, provider request, asset version, and credit event records.
- Make worker execution idempotent by design.
- Add server-side permission checks at every command boundary.
- Treat operations visibility as part of P0, not a later nice-to-have.
- Use transactional outbox so PostgreSQL and Redis do not diverge.
- Separate workflow, task, and attempt records before implementing provider fallback.
- Use append-only ledgers for credits and costs.

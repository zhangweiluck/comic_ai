# P0 M0 Contract Freeze

> Status: Document-level frozen baseline
> Date: 2026-05-08
> Scope: freezes the contracts needed for module implementation planning. This does not mean code, migrations, provider adapters, or commercial launch gates are complete.
> Decision log: D-047

M0 exists to stop architectural drift before parallel implementation begins.

The freeze answers:

- What language do teams share?
- Which module owns each fact?
- Which state names can appear in DB/API/UI?
- Which commands and events cross module boundaries?
- Which idempotency and repair rules are mandatory?
- Which uncertainties are still allowed after M0, and which are blockers?

## 1. Freeze Principles

1. One business fact has exactly one writing owner.
2. Cross-module mutation happens through domain commands or durable events.
3. PostgreSQL is the durable source of truth; Redis/BullMQ are dispatch mechanisms.
4. External side effects must be represented before or at the durable boundary.
5. Duplicate requests, callbacks, messages, and repair jobs must be safe.
6. UI success states are never payment, credit, or execution truth.
7. Any post-M0 change to a frozen contract requires an explicit contract-change record.

## 2. Frozen Artifact Register

| Artifact | Frozen Source | Status | Frozen Meaning | Implementation Output |
| --- | --- | --- | --- | --- |
| Domain dictionary | `p0-module-implementation-blueprint.md` §1 | Frozen | Core terms and relationships are the team language. | Shared TypeScript/domain constants later. |
| Module boundaries | `p0-module-implementation-blueprint.md` §2-3 | Frozen | Business modules and non-responsibilities are the ownership baseline. | Module packages/folders and PR ownership labels later. |
| Data ownership | `p0-module-implementation-blueprint.md` §5 + `p0-data-schema-draft.md` | Frozen | Each durable fact has one writing module. | Migration ownership comments and repository boundaries later. |
| Canonical states | `p0-state-dictionary.md` | Frozen | DB/API/UI/worker states use these names unless contract version changes. | Enum/check-constraint generation or validation later. |
| Command inventory | `p0-module-implementation-blueprint.md` §6.1 + `p0-m0-1-contract-hardening.md` | M0.1 specified | P0 command set, permissions, idempotency expectations, outputs, and schema fields are known. | API/command schemas under `packages/contracts/api` later. |
| Event inventory | `p0-module-implementation-blueprint.md` §6.2 + `system-architecture-design.md` §7.5 + `p0-m0-1-contract-hardening.md` | M0.1 specified | Critical async boundaries, consumers, source IDs, replay fields, and schema versioning are known. | Event schemas under `packages/contracts/events` later. |
| Idempotency protocol | `system-architecture-design.md` §7.1.3 + `p0-idempotency-contract.md` | M0.1 specified | Key/hash/conflict/replay semantics and `idempotency_records` DDL are mandatory for expensive or external commands. | Migration + idempotency helper later. |
| Outbox/inbox contract | `system-architecture-design.md` §7.5 + blueprint §7 | Frozen | Events are at-least-once; consumers must deduplicate. | Outbox/inbox tables and dispatcher later. |
| Repair job inventory | Blueprint §7 + `p0-commerce-payment-design.md` §13/§18 + `p0-repair-job-spec.md` | M0.1 specified | Known eventual-consistency gaps have scan conditions, locking strategy, idempotent actions, and tests. | Scheduler job implementations later. |
| Verification matrix | Blueprint §16 + `p0-verification-plan.md` | M0.1 specified | Architecture and PRD claims map to test files and CI gates. | Test files and CI gates later. |
| Payment design | `p0-commerce-payment-design.md` | Frozen for P0-B design | One-time credit package purchase, WeChat Pay + Alipay, callbacks, refunds, invoices, risk, reconciliation. | Provider adapter/contracts after official field verification. |

`M0.1 specified` means the document-level implementation contract is explicit enough for implementation planning, but code, migrations, generated schemas, and tests still need to be created and run.

## 3. Frozen Decisions

| Decision | Frozen Outcome | Source |
| --- | --- | --- |
| P0 auth method | Primary login is email-code. Password, OAuth, and SSO are future adapters unless explicitly pulled forward. Sessions are server-controlled and revocable. | D-046, schema draft, state dictionary |
| Commercial model | P0-B supports one-time credit package purchase, not subscription, auto-renewal, postpaid, or coupon/marketing pricing. | D-037 |
| Payment providers | P0-B integrates WeChat Pay and Alipay behind a normalized provider adapter. | D-040, D-045 |
| Payment-to-credit boundary | Commerce/Payment owns payment truth; Credit/Billing owns credit ledger. Credits are granted only by consuming `payment.succeeded`. | D-038, D-039 |
| Refund policy | Refund is Admin/Ops controlled in P0-B; consumed-credit refunds require manual/partial handling and cannot create automatic negative balance. | D-041 |
| Invoice/fapiao workflow | Invoice metadata is separate from payment and credit truth; issued invoices block or flag refund until finance-approved reversal/red-letter handling. | D-042 |
| Payment risk | Callback signature, amount, currency, merchant, duplicate trade, high-value first purchase, and refund review gates are mandatory. | D-043 |
| Reconciliation | Payment reconciliation is P0-B reliability infrastructure, not a post-launch nice-to-have. | D-044 |
| Provider adapter | WeChat/Alipay details are normalized before entering payment domain transitions. | D-045 |

## 4. Frozen Domain Owners

| Fact | Writing Owner | Allowed Mutation Boundary |
| --- | --- | --- |
| User/session/login code | Identity/Auth | Auth commands only. |
| Organization/workspace/membership/capability | Organization | Organization domain commands only. |
| Project/script/episode | Project | Project commands/workflow finalization through Project boundary. |
| Asset/current version | Asset | Asset commands/worker finalization through Asset boundary. |
| Shot/current output pointer | Shot | Shot commands/worker finalization through Shot boundary. |
| Workflow/task/attempt | Workflow/Task | Workflow commands, workers, repair jobs. |
| Provider request/result | ModelGateway | Provider adapter and reconciliation commands. |
| Order/payment intent/provider event/refund/invoice/payment risk/reconciliation | Commerce/Payment | Commerce/Payment commands, callbacks, reconciliation. |
| Credit ledger/reservation/provider cost | Credit/Billing | Credit commands and event consumers only. |
| Export manifest/package | Export | Export commands/workers. |
| Audit event | Audit | Append-only audit boundary. |

Rule: a module may query another module through approved query/read-model contracts, but it cannot write another module's authoritative table.

## 5. Frozen Command Classes

The exact HTTP routes can evolve during implementation, but these command classes are frozen:

| Command Class | Provider Module | Idempotency Required | Capability Required | Notes |
| --- | --- | --- | --- | --- |
| Issue/verify login code | Identity/Auth | Yes for issue throttle; verify consumes code once. | Public + abuse controls. | Code and session tokens are stored hashed only. |
| Create project/script parse workflow | Project + Workflow/Task | Yes | Project create/edit capability. | Refresh/retry cannot create duplicate expensive work. |
| Generate/regenerate asset or shot | Shot/Asset + Workflow/Task | Yes | Generation capability. | Creates new versions; does not overwrite immutable outputs. |
| Reserve/consume/release credits | Credit/Billing | Yes | Internal domain boundary. | Ledger is append-only; duplicate settlement no-ops or conflicts safely. |
| Submit provider request | ModelGateway | Yes | Internal worker boundary. | ProviderRequest must exist before ambiguous external side effects. |
| Create order/payment intent | Commerce/Payment | Yes | `billing:purchase`. | Provider amount/currency must match order snapshot. |
| Process payment callback | Commerce/Payment | Yes through provider event dedup. | Provider signature verification. | Frontend redirect never grants credits. |
| Grant credits from payment | Credit/Billing | Yes through event inbox + ledger source uniqueness. | Internal event consumer. | At most one grant per paid order/source event. |
| Request/refund order | Commerce/Payment + Credit/Billing | Yes | Admin/Ops refund capability. | Consumed credits and invoices can force manual review. |
| Run repair/reconciliation job | Owning domain module | Yes | Scheduler/Admin/Ops. | Uses same domain transition functions as normal paths. |

## 6. Frozen Event Classes

| Event Class | Publisher | Required Consumers | Idempotency Boundary |
| --- | --- | --- | --- |
| Workflow/task lifecycle events | Workflow/Task | Project, Shot, Asset, Credit, Admin/Ops as applicable | Consumer inbox keyed by event id. |
| Provider request result events | ModelGateway | Workflow/Task, Credit/Ops as applicable | Provider request id + inbox. |
| `payment.succeeded` | Commerce/Payment | Credit/Billing, Audit/Admin read models | Payment intent/order source uniqueness + inbox. |
| `payment.refund.succeeded` | Commerce/Payment | Credit/Billing, Audit/Admin read models | Refund id + inbox. |
| `credit.grant.created` | Credit/Billing | Commerce/Admin/UI read models | Ledger entry id + inbox. |
| `invoice.issued` | Commerce/Payment | Admin/Ops/read models | Invoice record id + inbox. |
| Audit events | Domain modules | Audit storage | Append-only audit id. |

All cross-module events must include `event_id`, `event_type`, `schema_version`, `occurred_at`, `producer`, and enough source identifiers to deduplicate and replay.

## 7. Frozen Repair Jobs

| Gap | Owning Module | Scan Condition | Idempotent Action |
| --- | --- | --- | --- |
| Outbox pending/failed events | Infrastructure/domain owner | `outbox_events.status in ('pending','failed')` and due | Republish same event id. |
| Inbox consumer crash after effect | Consumer module | Event delivered again | Unique inbox/effect constraints return no-op/same result. |
| Worker lease expired | Workflow/Task | Running task attempt past lease TTL | Reclaim if no external ambiguity; otherwise mark `result_unknown`. |
| Provider result unknown | ModelGateway/Workflow | ProviderRequest submitted/accepted but no terminal result | Query provider; transition through same finalization command. |
| Paid order without credit grant | Commerce/Payment + Credit/Billing | Order paid, no matching credit ledger source | Re-emit/reconsume `payment.succeeded`; grant once. |
| Payment callback missing/late | Commerce/Payment | Pending intent older than threshold | Query provider; normalize result; apply same callback transition. |
| Payment amount/currency/provider mismatch | Commerce/Payment | Provider event differs from order/payment snapshot | Create risk/reconciliation item; block paid transition. |
| Refund unknown | Commerce/Payment | Refund submitted but no terminal provider result | Query provider; update refund through refund transition. |
| Invoice/refund mismatch | Commerce/Payment + Admin/Ops | Refund requested for issued invoice without reversal state | Create manual review item; block automatic refund. |
| Credit read model drift | Credit/Billing | Cached balance differs from ledger recomputation | Recompute read model from ledger; never edit ledger history. |

## 8. M0 Change Control

After this freeze:

1. Changing a frozen state value requires migration mapping and API/frontend compatibility notes.
2. Changing a data owner requires updating the blueprint, schema draft, and decision log.
3. Adding a cross-module event requires publisher, consumer, payload, schema version, replay behavior, and consumer idempotency.
4. Adding a command requires capability, idempotency, state preconditions, timeout/retry semantics, and audit requirement.
5. Payment provider adapter code cannot begin until official WeChat Pay and Alipay field mappings are verified against the selected product modes.

## 9. Explicit Non-Frozen Gates

These items are not blockers for document-level M0, but they are blockers before the named milestone.

| Gate | Why Not Frozen in M0 | Must Close Before |
| --- | --- | --- |
| Exact WeChat Pay/Alipay production account capabilities and field mapping | Requires merchant account/config verification and official API checks. | Payment adapter implementation / M5 |
| Finance/tax invoice category, tax rate, red-letter operating process, retention | Requires finance/tax review. Architecture has the control points, not final policy. | Commercial payment launch |
| Concrete API and event JSON schemas | M0 freezes inventory and semantics; codegen/schema package is implementation work. | M2 parallel module work |
| Physical DB migrations and indexes | Schema draft freezes ownership/constraints; migrations require implementation stack conventions. | Module implementation of each table |
| Customer-facing order history and credit ledger pages | Product scope can choose Admin/Ops-only first or user-visible pages. | M5 product acceptance |
| Provider delivery choices for email code | Auth method is frozen, but email/SMS provider and rate-limit thresholds are implementation config. | M1 auth implementation |

## 10. M0 Exit Checklist

- [x] Core domain language has one canonical source.
- [x] Business modules and non-responsibilities are explicit.
- [x] Each durable business fact has one writing owner.
- [x] Canonical state values exist for identity, tenant, workflow, task, provider, credit, commerce, refund, invoice, risk, and reconciliation.
- [x] P0 auth method is frozen as email-code login.
- [x] Commerce/Payment and Credit/Billing are separated by event and ledger contracts.
- [x] Idempotency protocol is mandatory for expensive/external commands.
- [x] Outbox/inbox and repair jobs are mandatory for eventual-consistency gaps.
- [x] M0 remaining gates are explicit and assigned to later milestones.
- [x] Verification scenarios exist for duplicate requests, provider ambiguity, payment callback replay, refund constraints, and tenant isolation.

## 10.1 M0.1 Exit Checklist

- [x] `docs/architecture/p0-m0-1-contract-hardening.md` exit checklist is satisfied.
- [x] `docs/architecture/p0-idempotency-contract.md` is reflected in migration planning.
- [x] `docs/architecture/p0-verification-plan.md` is reflected in implementation plans and executable foundation contract tests.
- [x] `docs/architecture/p0-repair-job-spec.md` is reflected in scheduler/worker implementation plans and foundation repair contract tests.
- [x] `docs/architecture/p0-collaboration-contract.md` is reflected in PR templates, labels, or implementation handoff.
- [x] Any post-M0 contract change has a contract-change record requirement.

## 11. Confidence Review

I am not claiming 100% implementation confidence, because no code, migrations, generated schemas, provider sandbox calls, security tests, or finance/tax approvals have been executed yet.

I am confident that M0 is now complete as a document-level contract freeze: the remaining uncertainty is no longer architectural ambiguity. It is implementation verification, provider/account verification, or business-policy approval with explicit gates.

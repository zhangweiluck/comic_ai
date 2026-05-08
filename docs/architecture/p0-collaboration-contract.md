# P0 Collaboration Contract

> Status: M0.1 implementation contract
> Date: 2026-05-08
> Owner: architecture owner + module owners
> Purpose: make module implementation safe for multiple engineers or agents working in parallel.

## 1. Rule

Teams can work independently only when owned facts, contracts, and review gates are explicit.

This document turns the module blueprint's collaboration model into repository-facing rules.

## 2. Module Ownership Labels

Every P0 PR must include at least one module label.

| Label | Module |
| --- | --- |
| `module:identity-auth` | Identity/Auth |
| `module:organization` | Organization |
| `module:project` | Project |
| `module:asset` | Asset |
| `module:shot` | Shot |
| `module:workflow-task` | Workflow/Task |
| `module:model-gateway` | ModelGateway |
| `module:commerce-payment` | Commerce/Payment |
| `module:credit-billing` | Credit/Billing |
| `module:quality-review` | Quality/Review |
| `module:export` | Export |
| `module:admin-ops` | Admin/Ops |
| `module:audit` | Audit |
| `module:storage` | Storage |
| `module:contracts` | API/event/domain contracts |
| `module:infra` | DB, queues, dispatcher, deployment |

## 3. Review Roles

| Role | Required For |
| --- | --- |
| Domain owner | Business rules, state transitions, command behavior. |
| Contract owner | API schema, event schema, operation names, payload compatibility. |
| Data owner | Tables, migrations, indexes, constraints, data retention. |
| Reliability owner | Idempotency, retries, repair jobs, concurrency tests. |
| Security/Ops reviewer | Tenant scope, capabilities, audit, Admin/Ops actions. |

Small teams may assign multiple roles to one person, but the PR must still name which role reviewed the change.

## 4. Suggested CODEOWNERS Shape

When code exists, create or adapt `.github/CODEOWNERS`:

```text
/packages/contracts/                         @contract-owner
/packages/db/migrations/                     @data-owner @reliability-owner
/apps/backend/src/modules/identity/          @identity-owner @security-owner
/apps/backend/src/modules/organization/      @organization-owner @security-owner
/apps/backend/src/modules/project/           @project-owner
/apps/backend/src/modules/asset/             @asset-owner
/apps/backend/src/modules/shot/              @shot-owner
/apps/backend/src/modules/workflow-task/     @workflow-owner @reliability-owner
/apps/backend/src/modules/model-gateway/     @model-gateway-owner @reliability-owner
/apps/backend/src/modules/commerce-payment/  @payment-owner @security-owner
/apps/backend/src/modules/credit-billing/    @credit-owner @reliability-owner
/apps/backend/src/modules/admin-ops/         @ops-owner @security-owner
/apps/backend/src/modules/storage/           @storage-owner @security-owner
```

Replace placeholders with real users or teams during repo setup.

## 5. PR Template

Every P0 PR touching core modules should answer:

```markdown
## Module Boundary

- Module labels:
- Owned facts changed:
- Other modules read:
- Other modules written through command/event only:

## Contract Changes

- API schemas changed:
- Event schemas changed:
- Operation names changed:
- State values changed:
- Contract-change record required? yes/no

## Idempotency and Failure

- Idempotency key / dedup boundary:
- What happens if caller times out after success?
- What happens if event/job/callback is delivered twice?
- Repair job affected:

## Security and Tenant Scope

- Capability required:
- Tenant scope enforcement:
- Signed URL or secret exposure:
- Audit event:

## Verification

- Verification IDs: TC-P0-___ / R-___ / A-001 / IDEMP-___ / PAY-___
- Test files added or updated:
- Manual/ops drill needed:
```

PRs that directly write another module's authoritative table should be rejected unless the change is a migration approved by the data owner.

## 6. Contract Change Record

Post-M0 changes to state names, data owners, command classes, event classes, operation names, or critical payload fields require a record under:

```text
docs/architecture/contract-changes/YYYY-MM-DD-<slug>.md
```

Template:

```markdown
# Contract Change: <Title>

> Date:
> Status: proposed | accepted | rejected | superseded
> Owner:
> Affected modules:

## Change

What frozen contract changes?

## Reason

Why is the old contract insufficient?

## Compatibility

- Backward compatible? yes/no
- Migration required? yes/no
- API/event version impact:
- Data migration impact:

## Verification

- Tests to add/update:
- Rollback plan:

## Decision

Accepted/rejected by:
```

## 7. Parallel Work Rules

Before M0.1 exit:

```text
Only contract hardening, schema planning, and verification planning should proceed.
Avoid broad module implementation because shared contracts can still move.
```

After M0.1 exit:

```text
Lane A: Identity/Auth + Organization + Audit
Lane B: Workflow/Task + Outbox/Inbox
Lane C: Project + Asset + Shot creator loop
Lane D: ModelGateway stub/provider safety
Lane E: Export
Lane F: Credit reliability then Commerce/Payment after provider/finance gates
```

Conflict rules:

- Lanes that touch `packages/contracts` coordinate through contract owner.
- Lanes that touch migrations coordinate through data owner.
- Lanes that touch Workflow/Task finalization coordinate with Reliability owner.
- Commerce/Payment cannot bypass Credit/Billing for grants.
- Admin/Ops cannot bypass domain commands for writes.

## 8. M0.1 Exit Criteria

- [x] Module labels exist or are documented.
- [x] CODEOWNERS shape is ready for real owners in `.github/CODEOWNERS`.
- [x] PR template exists in `.github/pull_request_template.md`.
- [x] Contract-change template exists.
- [x] Parallel lanes and conflict rules are documented.
- [ ] Every implementation plan names module owner, contract owner, data owner, reliability owner, and security/Ops reviewer where applicable.

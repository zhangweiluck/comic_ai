# Dev A Platform Reliability Architecture Review

> Date: 2026-05-17
> Scope:
> - Overall P0 architecture task breakdown
> - Developer A platform/reliability plan
> - Current Developer A related code in `apps/backend/src/modules`
>
> Review posture: first-principles, long-term maintainability, correctness before throughput.

## 1. Overall Judgment

### Architecture plan

**Decision: Conditional pass.**

The architecture direction is mostly right. It puts authentication, tenant isolation, audit, idempotency, durable workflow state, storage scoping, Provider side-effect protection, repair, credit, and payment gates before the creator workflow scales. That is the correct ordering for a system where the main risks are data leakage, duplicated expensive side effects, unrepairable long tasks, and financial inconsistency.

The condition is important: the plan must stop using "100% confidence" as a statement of implementation readiness. Confidence must come from executable gates: migrations, transaction tests, concurrency tests, E2E tests, repair drills, observability checks, and rollback drills.

### Developer A current code

**Decision: Not production-ready.**

The current code is a useful skeleton and proves some important intent, but it does not yet implement the hard boundaries that the plan requires. The most serious gaps are transactionality, locking, tenant data integrity constraints, real SQL-backed command paths, secret hashing strength, test process stability, and observability.

## 2. Core Conclusion

The plan correctly identifies the platform reliability primitives, but the current implementation still treats several of them as helper functions rather than enforced system invariants.

If this continues, B and C will build on a platform that looks safe in tests but can still be bypassed or broken under concurrency, retries, crashes, and cross-tenant edge cases.

## 3. Evidence Reviewed

Primary plan documents:

- `docs/superpowers/plans/2026-05-09-p0-three-developer-task-breakdown.md`
- `docs/superpowers/plans/2026-05-09-developer-a-platform-reliability-tasks.md`

Key code areas:

- `packages/db/migrations/0001_foundation.sql`
- `apps/backend/src/modules/identity`
- `apps/backend/src/modules/organization`
- `apps/backend/src/modules/audit`
- `apps/backend/src/modules/shared/db`
- `apps/backend/src/modules/shared/idempotency`
- `apps/backend/src/modules/workflow-task`
- `apps/backend/src/modules/storage`
- `apps/backend/src/modules/model-gateway`
- `apps/backend/src/modules/project`

Test evidence:

- Audit, auth, persistent auth, and early Provider tests started passing.
- The full Dev A related test command hung around `apps/backend/src/modules/model-gateway/tests/no-blind-retry-after-external-start.spec.ts`.
- Residual node test processes had to be killed.

This means current tests are not yet reliable enough to be used as a platform gate.

## 4. Key Strengths

### 4.1 Problem ordering is correct

The plan correctly avoids starting with UI or creator-domain happy paths. It identifies platform truth first:

- Real phone auth
- Server-side session
- ActorContext
- Tenant-safe access
- Audit
- Idempotency
- Durable workflow/task/attempt
- Provider side-effect protection
- Repair and Ops visibility

This is the right long-term ordering.

### 4.2 Redis/BullMQ is treated as dispatch, not truth

The plan explicitly states that Redis/BullMQ is not the source of truth for long-running work. This is a strong architectural decision. Workflow/task/attempt must live in durable storage, while queues remain disposable delivery mechanisms.

### 4.3 Provider side effects are modeled early

The plan correctly treats real Provider calls as potentially billable and irreversible. Persisting a ProviderRequest before external submission is the correct direction.

### 4.4 Manual review and result unknown are first-class states

The state vocabulary includes `manual_review_required` and `result_unknown`. This is necessary for real systems where worker crashes, provider ambiguity, payment callbacks, and reconciliation errors cannot always be resolved automatically.

### 4.5 The task split prevents obvious responsibility leakage

Developer A owns platform reliability. Developer B owns creator domain. Developer C owns experience, QA, and Ops. This split is sound as a starting point.

## 5. Critical Risks

### P0-1. Auth challenge verification is not atomic

Current behavior:

- Load challenge by id.
- Verify in memory.
- Save updated challenge.
- Find or create user.
- Create session.

Risk:

Two concurrent verification requests can both read an `issued` challenge and both create sessions before either update is visible.

Long-term cost:

Auth becomes impossible to reason about under retry, mobile double-submit, flaky network, and malicious replay. This undermines every downstream permission guarantee.

Required fix:

- Wrap challenge verification, user upsert, and session creation in one transaction.
- Consume the challenge using a conditional update:

```sql
UPDATE login_challenges
SET status = 'consumed',
    consumed_at = $now,
    updated_at = $now
WHERE id = $challenge_id
  AND phone_e164 = $phone_e164
  AND status = 'issued'
  AND expires_at > $now
RETURNING *
```

- If no row returns, classify the failure by reading the current challenge state.
- Add a concurrency test proving only one session can be created for one challenge.

### P0-2. Verification code hashing is too weak

Current behavior:

- `hashSecret()` uses plain SHA-256.
- Verification code is six digits.

Risk:

A leaked database can be brute-forced offline in milliseconds. Six-digit code space is only 1,000,000 values.

Required fix:

- Replace bare SHA-256 for codes with server-secret HMAC:

```text
HMAC-SHA256(server_pepper, challenge_id + ":" + code)
```

- Store `hash_version`.
- Support pepper rotation.
- Continue never storing plaintext code.

For session tokens:

- Generate tokens using `randomBytes(32)` or stronger.
- Hash with HMAC or SHA-256 over high-entropy token material.
- Add token hash versioning if practical.

### P0-3. Idempotency is not a hard transactional boundary

Current behavior:

- `findForUpdate()` does not use `FOR UPDATE`.
- Idempotency begin and complete are separate helper calls.
- Business writes can happen between them without a shared transaction.

Risk:

The system can create duplicate projects, workflows, ProviderRequests, exports, or charges under concurrency and crash timing.

Required fix:

Introduce a command runtime:

```ts
runIdempotentCommand({
  db,
  actor,
  operationName,
  idempotencyKey,
  requestHash,
  now,
  handler,
})
```

The runtime must:

- Open a transaction.
- Insert or lock the idempotency record.
- Reject same key with different hash.
- Replay completed responses.
- Run the business handler in the same transaction.
- Persist response resource atomically.
- Commit once.

The store API should not expose `findForUpdate` unless it actually runs inside a transaction and uses row-level locking.

### P0-4. Tenant isolation is helper-based, not structurally enforced

Current behavior:

- There is an `assertTenantScope()` helper.
- ActorContext resolves workspace/organization membership.
- SQL schema has many single-column FKs and nullable scope fields.

Risk:

Future code can accidentally query by `project_id` without `organization_id`, or link a workspace/project/task to the wrong organization. Helper-based isolation relies on developer memory.

Required fix:

Strengthen the schema:

- Keep `UNIQUE (organization_id, id)` on tenant-owned entities.
- Add composite foreign keys:
  - `(organization_id, workspace_id)` -> `workspaces(organization_id, id)`
  - `(organization_id, project_id)` -> `projects(organization_id, id)`
  - `(organization_id, workflow_id)` -> `workflows(organization_id, id)`
  - `(organization_id, task_id)` -> `tasks(organization_id, id)`
- Add repository APIs that require tenant scope as part of the method signature.
- Consider Postgres RLS once the application-level boundary stabilizes.

### P0-5. Project/Parse command path still uses in-memory persistence

Current behavior:

- `createProjectCommandHandler` depends on `InMemoryProjectStore`.
- `parse-script` workflow request is also store-driven rather than SQL-backed.

Risk:

B can accidentally build against an in-memory contract and believe the platform path is real. This violates the plan's own rule that M1 must not exit on pure-function or fake-state tests.

Required fix:

- Create SQL repositories for Project and Script.
- Keep in-memory stores only for unit tests.
- Integration tests for command handlers must use migrated PGlite.
- CreateProject must atomically write:
  - idempotency record
  - project
  - script
  - audit event

### P0-6. ProviderRequest is close in concept but incomplete in concurrency behavior

Current behavior:

- `createOrReuseProviderRequest()` checks existing request before insert.
- DB uniqueness exists, but conflict handling is not normalized.
- `submitProviderRequest()` marks external submission started before adapter call.

Good:

- The design prevents blind retry after `external_submission_started_at`.

Risk:

Concurrent callers with the same request key can race between select and insert. One gets a raw DB unique violation instead of deterministic reuse/conflict behavior.

Required fix:

- Use `INSERT ... ON CONFLICT`.
- On conflict, fetch the existing row and compare hashes.
- Treat same hash as reuse.
- Treat different hash/payload ref as deterministic conflict.
- Add a concurrency test.

### P0-7. Tests are not yet reliable gates

Current behavior:

- Some tests pass.
- The full platform test command hung and left node test processes alive.

Risk:

A reliability platform cannot depend on unreliable tests. Flaky or hanging tests create false confidence and slow future delivery.

Required fix:

- Add per-file test timeout in `scripts/run-tests.mjs` or `scripts/run-tests.sh`.
- Investigate the hanging model-gateway test.
- Ensure every test file exits cleanly.
- Add CI-friendly failure output for hanging test file name and process id.

## 6. Structural Problems

### 6.1 Boundary problems

The desired boundary is:

```text
HTTP/API
  -> Command Runtime
      -> ActorContext
      -> Capability
      -> Tenant Scope
      -> Idempotency
      -> Transaction
      -> Domain Service
      -> Repository
      -> Audit / Outbox
```

The current shape is closer to:

```text
Command handler
  -> manually resolves actor
  -> manually checks capability
  -> calls service/helper
  -> service/helper may use in-memory store or SQL
```

That is not strong enough. The platform rules are still conventions.

### 6.2 Dependency direction problems

The stable business/platform core should not depend on:

- test-only in-memory stores
- HTTP handler shapes
- specific queue implementation
- Provider SDK
- UI assumptions

The desired dependency direction:

```text
Domain model / platform contracts
  <- Application command runtime
      <- SQL repositories
      <- HTTP adapters
      <- Worker adapters
      <- Provider adapters
      <- Storage adapters
```

Current code mixes application services, stores, and platform helpers in ways that are acceptable for exploration but not for a long-lived platform foundation.

### 6.3 Data model problems

The schema has a good starting vocabulary, but it lacks enough consistency constraints.

Important missing or weak constraints:

- Composite tenant FKs
- Strong idempotency response snapshot/replay fields
- ProviderRequest conflict handling around hash/payload
- Audit immutability policy
- Session token hash uniqueness
- Challenge verification atomicity
- Operation-specific uniqueness for workflow/task creation

### 6.4 Failure boundary problems

Several failure cases are recognized in the plan but not fully executable:

- worker crash after domain write before task finalization
- audit write failure after business write
- idempotency record created but response resource missing
- Provider external submission accepted but local update fails
- storage object registry written but object upload fails
- signed URL created for object with stale or missing tenant scope

These need explicit transaction, outbox, or repair semantics.

### 6.5 Observability problems

The plan says trace/log ID, but current implementation does not yet make traceability structural.

Needed:

- `traceId` generated at request/worker entry.
- `traceId` attached to structured logs.
- `traceId` or correlation id stored on workflow/task/provider/audit/outbox where useful.
- Metrics for:
  - auth challenge issued/verified/failed/locked
  - idempotency replay/conflict/processing timeout
  - workflow queued/running/stuck/result_unknown
  - provider submitted/accepted/ambiguous/manual_review
  - signed URL denied/created
  - repair job scanned/repaired/failed

## 7. Must-Fix Items Before Claiming M1/M2 Platform Completion

### M1 gate: Auth, tenant, audit

Must complete:

1. Atomic phone challenge verification.
2. HMAC/pepper-based code hash.
3. Strong random session token generation.
4. Persistent session lookup and revocation through SQL-backed handlers, not only in-memory handlers.
5. Composite tenant constraints for memberships/workspaces.
6. ActorContext integration tests with persisted sessions and memberships.
7. Audit append tests with SQL persistence and sensitive metadata redaction.
8. Stable error mapping for 401/403/auth failure cases.
9. No plaintext phone/code/token in logs or persisted fields.
10. Test runner cannot hang.

### M2 gate: Workflow/task/idempotency/storage

Must complete:

1. SQL-backed idempotent command runtime.
2. SQL-backed CreateProject and ParseScript command paths.
3. Workflow/task creation in durable storage.
4. Task claim with row-level concurrency protection.
5. Task finalization with rollback proof.
6. Workflow aggregation that does not collapse `manual_review_required` or `result_unknown` into success.
7. Storage object registry with composite tenant constraints.
8. Signed URL access checks through ActorContext and tenant scope.
9. E2E: login -> create project -> parse workflow -> refresh status from durable storage.

### M3 gate: Provider safety

Must complete:

1. ProviderRequest upsert with deterministic conflict behavior.
2. One-way external submission started transition.
3. No blind retry after external start.
4. Ambiguous submission becomes `result_unknown`.
5. Repair lookup or manual review path is visible to Ops.
6. Provider payload must be stored as ref/hash/redacted metadata only.

## 8. Recommended Target Architecture

### 8.1 Platform command runtime

Introduce a shared runtime responsible for invariants that every write command must obey:

```ts
interface PlatformCommandInput<TRequest, TResult> {
  sessionToken: string;
  tenantScope: {
    organizationId?: string;
    workspaceId?: string;
    projectId?: string;
  };
  capability: Capability;
  operationName: OperationName;
  idempotencyKey: string;
  request: TRequest;
  requestHash: string;
  now: Date;
  execute(ctx: PlatformCommandContext): Promise<TResult>;
}

interface PlatformCommandContext {
  db: Transaction;
  actor: ActorContext;
  traceId: string;
  audit: AuditWriter;
  outbox: OutboxWriter;
}
```

Responsibilities:

- authenticate session
- resolve actor
- check capability
- enforce tenant scope
- lock/create idempotency record
- open transaction
- run command
- append audit/outbox
- persist replay snapshot
- commit or rollback

This prevents each command from reimplementing platform rules differently.

### 8.2 Tenant-owned repositories

Do not expose repositories that accept only `id`.

Prefer:

```ts
findProjectByTenant(input: {
  organizationId: string;
  projectId: string;
})
```

Avoid:

```ts
findProject(projectId: string)
```

The method signature should make unsafe access awkward.

### 8.3 Workflow runtime

Separate durable state from queue dispatch:

```text
Command creates workflow/task in SQL
  -> outbox event says task should be dispatched
      -> queue adapter publishes
          -> worker claims task from SQL
              -> worker performs work
                  -> finalization transaction updates domain + task
```

Queue loss is repaired by scanning SQL, not by trusting Redis/BullMQ as truth.

### 8.4 Provider gateway

Provider calls must go through a gateway:

```text
Domain task
  -> ProviderRequest create/upsert
  -> mark external_submission_started_at
  -> adapter.submit()
  -> record external id / accepted status
  -> worker polls or finalizes
  -> ambiguous states go to repair/manual review
```

No domain module should call a real Provider SDK directly.

### 8.5 Ops-visible reliability queue

`manual_review_required` and `result_unknown` must create an Ops-visible item:

- subject type: workflow/task/provider/payment/credit/export
- severity
- reason code
- traceId
- actor/system initiator
- suggested action
- current blocking state
- audit trail

Without this, these states are just database tombstones.

## 9. Prioritized Optimization Plan

### Phase 0: Stop false confidence

Goal: make the gate honest.

Tasks:

1. Rename confidence language in plan docs:
   - From: "100% confidence"
   - To: "architecture direction accepted; readiness depends on executable gates"
2. Fix hanging tests.
3. Add per-file timeout to the test runner.
4. Add a platform gate command:

```bash
npm test -- apps/backend/src/modules/shared/db apps/backend/src/modules/identity apps/backend/src/modules/organization apps/backend/src/modules/audit
```

Exit criteria:

- Gate always exits.
- Failures identify the exact test file.
- No leftover test process.

### Phase 1: Auth hardening

Goal: make login/session truly reliable.

Tasks:

1. Replace bare code hash with HMAC/pepper.
2. Add `hash_version` to auth hash fields if needed.
3. Replace UUID session token with high-entropy random token.
4. Implement transactional `verifyPhoneCodeAndCreateSession`.
5. Add challenge conditional consume.
6. Add resend and verify rate limits.
7. Persist session revocation and expiration behavior.
8. Move HTTP handlers to SQL-backed services or clearly mark in-memory handlers as dev-only.

Tests:

- valid verify creates one session
- double verify creates one session
- concurrent verify creates one session
- expired challenge cannot be consumed
- locked challenge cannot be consumed
- disabled user creates no session
- revoked session is rejected
- dev challenge endpoint unavailable outside debug/dev mode

### Phase 2: Tenant and permission hardening

Goal: make cross-tenant leakage structurally hard.

Tasks:

1. Add composite tenant FKs.
2. Add repository methods requiring organization/project scope.
3. Remove or quarantine unsafe `findById(id)` access.
4. Define organization-level vs workspace-level membership semantics.
5. Add structured authorization logs with traceId.
6. Add stable error mapping for authz failures.

Tests:

- user in org A cannot access workspace in org B
- organization-level membership behavior is explicit
- workspace archived denies write
- suspended organization denies all domain commands
- project id from another org is rejected even if guessed

### Phase 3: Idempotent command runtime

Goal: make duplicate submissions safe by construction.

Tasks:

1. Implement `runIdempotentCommand`.
2. Move idempotency begin/complete into one transaction.
3. Store response resource and replay snapshot atomically.
4. Add processing timeout and recovery semantics.
5. Integrate CreateProject and ParseScript.

Tests:

- same key and same hash replays
- same key and different hash returns 409
- concurrent same key creates exactly one resource
- command error rolls back both business write and idempotency completion
- processing timeout can be repaired or retried according to policy

### Phase 4: SQL-backed creator command integration

Goal: prevent B from building on fake platform state.

Tasks:

1. Create SQL ProjectRepository.
2. Create SQL ScriptRepository.
3. Wire CreateProject through command runtime.
4. Wire ParseScript request through workflow runtime.
5. Keep in-memory stores only for unit tests.

Tests:

- create project persists project and script
- replay returns same project
- invalid input writes nothing
- audit failure blocks high-risk command if required
- parse request creates workflow/task durable records

### Phase 5: Workflow/task runtime

Goal: make long-running work recoverable.

Tasks:

1. Enforce task claim with row locking.
2. Enforce max attempts.
3. Add lease expiry repair.
4. Add queue dispatch repair.
5. Add outbox repair contract implementation.
6. Add finalization transaction for domain writes.

Tests:

- double claim gives one winner
- stale lease can be reclaimed
- finalization failure rolls back task and domain changes
- result_unknown/manual_review_required aggregate correctly
- Redis/queue loss repair re-dispatches queued SQL tasks

### Phase 6: Provider safety

Goal: prevent duplicate provider charges or outputs.

Tasks:

1. Implement ProviderRequest upsert.
2. Make external submission started one-way.
3. Record external id when known.
4. Add ambiguous submission repair.
5. Add manual review queue item for unresolved ambiguity.

Tests:

- crash before external start can retry safely
- crash after external start does not resubmit
- concurrent same request submits once
- same key different payload conflicts
- adapter timeout after start becomes result_unknown

### Phase 7: Storage and asset boundary

Goal: make assets and exports tenant-safe.

Tasks:

1. Add composite FKs for storage objects.
2. Validate metadata requirements per asset/export type.
3. Use server-only storage adapter.
4. Generate short-lived signed URLs only after ActorContext authorization.
5. Audit or log denied cross-tenant URL attempts.

Tests:

- cross-tenant signed URL is 403
- object key cannot be user-controlled URL/path
- missing metadata prevents AssetVersion creation
- stale/deleted storage object cannot be signed

### Phase 8: Observability and Ops

Goal: make the system operable.

Tasks:

1. Define traceId propagation.
2. Add structured logging for auth/authz/idempotency/workflow/provider/storage.
3. Add metrics.
4. Add alert thresholds.
5. Add Ops queue for manual review/result unknown.
6. Add runbooks for repair jobs.

Required dashboards:

- Auth challenge failure/lockout rate
- Idempotency conflict/replay/processing age
- Workflow queue age and stuck running tasks
- Provider ambiguity and manual review backlog
- Signed URL deny rate
- Repair job success/failure counts

## 10. Suggested Work Breakdown

### Developer A immediate next tasks

1. Fix test runner hang and add timeouts.
2. Harden phone auth transaction and hashing.
3. Replace idempotency helper with transactional command runtime.
4. Add composite tenant constraints.
5. Make ProviderRequest upsert deterministic.

### Developer B blocking contract updates

1. Do not integrate against `InMemoryProjectStore` as production path.
2. Wait for SQL-backed CreateProject/ParseScript command runtime before claiming durable backend closure.
3. Use only workflow/task APIs for long tasks.
4. Never call Provider adapter directly.

### Developer C blocking contract updates

1. E2E must use real auth/session, not fake local session.
2. UI must surface `manual_review_required` and `result_unknown`.
3. Ops Lite must be able to see stuck/ambiguous workflow/provider states.
4. Release gate must include repair drill evidence.

## 11. Non-Goals For The Next Fix Pass

Do not spend the next pass on:

- Real payment integration
- Full credit ledger UI
- Real Provider SDK breadth
- UI polish
- Large refactors unrelated to platform invariants
- Premature abstraction beyond the command runtime/repository boundaries

The next pass should make the core platform facts hard to fake.

## 12. Acceptance Checklist

The work can be considered structurally acceptable only when all of the following are true:

- Auth challenge consume is atomic under concurrency.
- No plaintext code/token is persisted.
- Verification code hashing is not offline-bruteforce trivial.
- Session token is high entropy and revocable server-side.
- Tenant-owned tables have composite scope constraints.
- Main write commands go through ActorContext, capability, tenant scope, idempotency, transaction, and audit.
- CreateProject and ParseScript have SQL-backed integration tests.
- Idempotency has concurrent duplicate request tests.
- Workflow/task claim and finalization have concurrency/rollback tests.
- ProviderRequest same-key concurrency is deterministic.
- `result_unknown` and `manual_review_required` are Ops-visible.
- Platform test gate exits cleanly every time.

## 13. Final Recommendation

Continue with the architecture direction, but do not treat the current Developer A implementation as a completed platform foundation.

The right next move is not to add more feature surface. The right next move is to turn the platform rules from conventions into enforced invariants:

- transaction boundaries
- tenant constraints
- command runtime
- SQL-backed repositories
- concurrency tests
- repair/Ops visibility
- observability

If these are fixed now, the system becomes easier to extend. If they are deferred, every future feature will either duplicate platform logic or bypass it, and the codebase will accumulate reliability debt exactly where it is most expensive to repay.

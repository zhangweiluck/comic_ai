# M1 Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real platform foundation batch: email-code auth, sessions, actor context, capability checks, tenant-safe query helpers, and audit append support.

**Architecture:** M1 sits between M0.1 contracts and M2 creator-loop implementation. It must prove real authentication, tenant scope, and server-side authorization before any project/script/asset/shot command can safely be implemented.

**Tech Stack:** TypeScript, Node test runner, PostgreSQL migration/repository layer, shared contracts from `packages/contracts`, structured logging, TDD.

---

## File Structure

- Modify: `packages/db/migrations/0001_foundation.sql`
- Create: `apps/backend/src/modules/identity/login-code.service.ts`
- Create: `apps/backend/src/modules/identity/session.service.ts`
- Create: `apps/backend/src/modules/identity/tests/login-code.spec.ts`
- Create: `apps/backend/src/modules/identity/tests/session.spec.ts`
- Create: `apps/backend/src/modules/organization/actor-context.service.ts`
- Create: `apps/backend/src/modules/organization/capability.service.ts`
- Create: `apps/backend/src/modules/organization/tests/actor-context.spec.ts`
- Create: `apps/backend/src/modules/organization/tests/tenant-permission.spec.ts`
- Create: `apps/backend/src/modules/shared/db/tenant-scope.ts`
- Create: `apps/backend/src/modules/shared/db/tests/tenant-scope.spec.ts`
- Create: `apps/backend/src/modules/audit/audit.service.ts`
- Create: `apps/backend/src/modules/audit/tests/audit.spec.ts`
- Modify: `docs/architecture/p0-verification-plan.md`

## Task 1: Email-Code Login Credentials

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Create: `apps/backend/src/modules/identity/login-code.service.ts`
- Test: `apps/backend/src/modules/identity/tests/login-code.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consumeLoginCode,
  issueLoginCode,
  verifyLoginCode,
} from "../login-code.service.ts";

describe("login codes", () => {
  it("stores only a hash and verifies the plaintext code", async () => {
    const issued = await issueLoginCode({ email: "creator@example.com", code: "123456" });
    assert.notEqual(issued.codeHash, "123456");
    assert.equal(await verifyLoginCode(issued, "123456"), true);
  });

  it("consumes an issued code once", async () => {
    const issued = await issueLoginCode({ email: "creator@example.com", code: "123456" });
    const consumed = consumeLoginCode(issued);
    assert.equal(consumed.status, "consumed");
    assert.throws(() => consumeLoginCode(consumed), /not issued/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/backend/src/modules/identity/tests/login-code.spec.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Add minimal implementation**

Implement hash/verify/consume functions. Keep provider delivery out of scope; this task defines credential semantics only.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/backend/src/modules/identity/tests/login-code.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0001_foundation.sql apps/backend/src/modules/identity
git commit -m "feat: add email-code credential semantics"
```

## Task 2: Server-Controlled Sessions

**Files:**
- Create: `apps/backend/src/modules/identity/session.service.ts`
- Test: `apps/backend/src/modules/identity/tests/session.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSession, revokeSession, verifySessionToken } from "../session.service.ts";

describe("sessions", () => {
  it("verifies active session tokens without storing plaintext", async () => {
    const session = await createSession({ userId: "user_1", token: "secret" });
    assert.notEqual(session.sessionTokenHash, "secret");
    assert.equal(await verifySessionToken(session, "secret"), true);
  });

  it("rejects revoked sessions", async () => {
    const session = await createSession({ userId: "user_1", token: "secret" });
    const revoked = revokeSession(session);
    assert.equal(await verifySessionToken(revoked, "secret"), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/backend/src/modules/identity/tests/session.spec.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement minimal session semantics**

Create/revoke/verify active sessions. Persisted repository/API handlers come later in the same module.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/backend/src/modules/identity/tests/session.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/identity/session.service.ts apps/backend/src/modules/identity/tests/session.spec.ts
git commit -m "feat: add server-controlled session semantics"
```

## Task 3: Actor Context and Capability Checks

**Files:**
- Create: `apps/backend/src/modules/organization/actor-context.service.ts`
- Create: `apps/backend/src/modules/organization/capability.service.ts`
- Test: `apps/backend/src/modules/organization/tests/actor-context.spec.ts`
- Test: `apps/backend/src/modules/organization/tests/tenant-permission.spec.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- active user + active membership resolves actor context
- missing membership throws `forbidden`
- disabled user throws `forbidden`
- user without `project:create` cannot pass `assertCapability`

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test apps/backend/src/modules/organization/tests`

Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement minimal actor context and capability helpers**

Use capability names from `packages/contracts/domain/capabilities.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test apps/backend/src/modules/organization/tests`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organization
git commit -m "feat: add actor context and capability checks"
```

## Task 4: Tenant-Safe Query Helper

**Files:**
- Create: `apps/backend/src/modules/shared/db/tenant-scope.ts`
- Test: `apps/backend/src/modules/shared/db/tests/tenant-scope.spec.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- tenant-owned query builders require `organizationId`
- project-owned query builders require `organizationId` and `projectId`
- missing tenant scope throws before query execution

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/backend/src/modules/shared/db/tests/tenant-scope.spec.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement minimal helper**

Keep this as a pure query-scope guard first; do not introduce a full ORM abstraction.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/backend/src/modules/shared/db/tests/tenant-scope.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/shared/db
git commit -m "feat: add tenant-safe query scope helper"
```

## Task 5: Audit Append Helper

**Files:**
- Create: `apps/backend/src/modules/audit/audit.service.ts`
- Test: `apps/backend/src/modules/audit/tests/audit.spec.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- audit events include actor, organization, target, event type, and redacted metadata
- audit append does not mutate previous event facts
- missing actor/reason for sensitive admin operation is rejected

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test apps/backend/src/modules/audit/tests/audit.spec.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement minimal audit event builder**

Create append-only event semantics. Database repository can be added when backend persistence is wired.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test apps/backend/src/modules/audit/tests/audit.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/audit
git commit -m "feat: add audit append helper"
```

## Task 6: M1 Exit Review

**Files:**
- Modify: `docs/architecture/p0-verification-plan.md`
- Modify: `docs/architecture/p0-delivery-execution-system.md`
- Modify: `docs/architecture/decision-log.md`

- [ ] **Step 1: Run available M1 gates**

Run:

```bash
pnpm test apps/backend/src/modules/identity
pnpm test apps/backend/src/modules/organization
pnpm test apps/backend/src/modules/shared/db
pnpm test apps/backend/src/modules/audit
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Update verification plan**

Mark only implemented M1 foundation tests as executable artifacts.

- [ ] **Step 3: Record M1 exit decision**

If M1 exits, record that M2 project/script/workflow work may start. If not, list remaining blockers.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/p0-verification-plan.md docs/architecture/p0-delivery-execution-system.md docs/architecture/decision-log.md
git commit -m "docs: record M1 foundation exit review"
```

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createAdminOpsService } from "../admin-ops.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const adminUserId = "30000000-0000-4000-8000-000000000001";
const creatorUserId = "30000000-0000-4000-8000-000000000002";
const workflowId = "40000000-0000-4000-8000-000000000001";
const unknownTaskId = "50000000-0000-4000-8000-000000000001";
const failedTaskId = "50000000-0000-4000-8000-000000000002";
const attemptId = "60000000-0000-4000-8000-000000000001";
const providerRequestId = "70000000-0000-4000-8000-000000000001";
const reservationId = "a0000000-0000-4000-8000-000000000001";
const creditPackageId = "90000000-0000-4000-8000-000000000001";
const paidOrderId = "91000000-0000-4000-8000-000000000001";
const paymentIntentId = "92000000-0000-4000-8000-000000000001";
const paymentRiskEventId = "93000000-0000-4000-8000-000000000001";

describe("admin ops service", { concurrency: false }, () => {
  it("lists stuck tasks for ops users and rejects ordinary creators", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession, creatorSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db, workspaceId });

      const forbidden = await service.listItems({
        user: { sessionToken: creatorSession.token },
        now: new Date("2026-05-19T10:00:00.000Z"),
      });
      const listed = await service.listItems({
        user: { sessionToken: adminSession.token },
        now: new Date("2026-05-19T10:00:00.000Z"),
      });

      assert.equal(forbidden.status, 403);
      assert.deepEqual(forbidden.body, { error: "ops_forbidden" });
      assert.equal(listed.status, 200);
      assert.deepEqual(
        listed.body.tasks.map((task) => ({
          id: task.id,
          status: task.status,
          providerStatus: task.providerStatus,
        })),
        [
          {
            id: unknownTaskId,
            status: "result_unknown",
            providerStatus: "result_unknown",
          },
          {
            id: failedTaskId,
            status: "failed",
            providerStatus: null,
          },
        ],
      );
    } finally {
      await db.close();
    }
  });

  it("requires a reason and writes audit when manually settling unknown tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db, workspaceId });

      const missingReason = await service.manualSettleTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-manual-settle-missing-reason",
        body: {
          taskId: unknownTaskId,
          decision: "release",
          reason: " ",
        },
        now: new Date("2026-05-19T10:01:00.000Z"),
      });
      const settled = await service.manualSettleTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-manual-settle-release",
        body: {
          taskId: unknownTaskId,
          decision: "release",
          reason: "Provider confirmed no billable result.",
        },
        now: new Date("2026-05-19T10:02:00.000Z"),
      });
      const duplicate = await service.manualSettleTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-manual-settle-release",
        body: {
          taskId: unknownTaskId,
          decision: "release",
          reason: "Provider confirmed no billable result.",
        },
        now: new Date("2026-05-19T10:03:00.000Z"),
      });
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events ORDER BY created_at ASC",
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = $1",
        [attemptId],
      );
      const provider = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE id = $1",
        [providerRequestId],
      );
      const reservation = await db.query<{
        amount_reserved: number;
        amount_released: number;
        status: string;
      }>(
        "SELECT amount_reserved, amount_released, status FROM credit_reservations WHERE id = $1",
        [reservationId],
      );
      const ledger = await db.query<{ entry_type: string; amount: number }>(
        "SELECT entry_type, amount FROM credit_ledger_entries WHERE reservation_id = $1 AND entry_type = 'release'",
        [reservationId],
      );

      assert.equal(missingReason.status, 400);
      assert.deepEqual(missingReason.body, { error: "reason_required" });
      assert.equal(settled.status, 200);
      assert.equal(settled.body.task.status, "succeeded");
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.task.status, "succeeded");
      assert.deepEqual(attempt.rows[0], { status: "succeeded", failure_code: null });
      assert.deepEqual(provider.rows[0], { status: "succeeded", failure_code: null });
      assert.deepEqual(reservation.rows[0], {
        amount_reserved: 0,
        amount_released: 10,
        status: "released",
      });
      assert.deepEqual(ledger.rows, [{ entry_type: "release", amount: 10 }]);
      assert.deepEqual(audit.rows, [
        {
          event_type: "ops.task_manually_settled",
          reason: "Provider confirmed no billable result.",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("can manually settle an unknown task by consuming reserved credits", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db, workspaceId });

      const settled = await service.manualSettleTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-manual-settle-consume",
        body: {
          taskId: unknownTaskId,
          decision: "consume",
          reason: "Provider confirmed a billable result.",
        },
        now: new Date("2026-05-19T10:02:00.000Z"),
      });

      const reservation = await db.query<{
        amount_reserved: number;
        amount_consumed: number;
        status: string;
      }>(
        "SELECT amount_reserved, amount_consumed, status FROM credit_reservations WHERE id = $1",
        [reservationId],
      );
      const ledger = await db.query<{ entry_type: string; amount: number }>(
        "SELECT entry_type, amount FROM credit_ledger_entries WHERE reservation_id = $1 AND entry_type = 'consume'",
        [reservationId],
      );

      assert.equal(settled.status, 200);
      assert.equal(settled.body.task.status, "succeeded");
      assert.deepEqual(reservation.rows[0], {
        amount_reserved: 0,
        amount_consumed: 10,
        status: "settled",
      });
      assert.deepEqual(ledger.rows, [{ entry_type: "consume", amount: 10 }]);
    } finally {
      await db.close();
    }
  });

  it("keeps abnormal-cost settlements in manual review and marks the reservation", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db, workspaceId });

      const settled = await service.manualSettleTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-manual-settle-abnormal",
        body: {
          taskId: unknownTaskId,
          decision: "mark_abnormal_cost",
          reason: "Provider cost needs finance review.",
        },
        now: new Date("2026-05-19T10:02:00.000Z"),
      });

      const reservation = await db.query<{
        amount_reserved: number;
        status: string;
      }>(
        "SELECT amount_reserved, status FROM credit_reservations WHERE id = $1",
        [reservationId],
      );

      assert.equal(settled.status, 200);
      assert.equal(settled.body.task.status, "manual_review_required");
      assert.deepEqual(reservation.rows[0], {
        amount_reserved: 10,
        status: "manual_review_required",
      });
    } finally {
      await db.close();
    }
  });

  it("requires a reason and requeues retryable failed tasks", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      const service = createAdminOpsService({ db, workspaceId });

      const missingReason = await service.retryTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-retry-missing-reason",
        body: {
          taskId: failedTaskId,
          reason: "",
        },
        now: new Date("2026-05-19T10:04:00.000Z"),
      });
      const retried = await service.retryTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-retry-task",
        body: {
          taskId: failedTaskId,
          reason: "Transient provider timeout fixed.",
        },
        now: new Date("2026-05-19T10:05:00.000Z"),
      });
      const replay = await service.retryTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-retry-task",
        body: {
          taskId: failedTaskId,
          reason: "Transient provider timeout fixed.",
        },
        now: new Date("2026-05-19T10:06:00.000Z"),
      });
      const conflict = await service.retryTask({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-retry-task",
        body: {
          taskId: failedTaskId,
          reason: "Different reason.",
        },
        now: new Date("2026-05-19T10:07:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [failedTaskId],
      );
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events ORDER BY created_at ASC",
      );

      assert.equal(missingReason.status, 400);
      assert.deepEqual(missingReason.body, { error: "reason_required" });
      assert.equal(retried.status, 200);
      assert.equal(retried.body.task.status, "queued");
      assert.equal(replay.status, 200);
      assert.equal(replay.body.task.id, retried.body.task.id);
      assert.equal(conflict.status, 409);
      assert.deepEqual(conflict.body, { error: "idempotency_conflict" });
      assert.deepEqual(task.rows[0], { status: "queued", failure_code: null });
      assert.deepEqual(audit.rows, [
        {
          event_type: "ops.task_retry_requested",
          reason: "Transient provider timeout fixed.",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("lists payment risks and repairs paid orders that have not granted credits", async () => {
    const db = await createMigratedTestDb();

    try {
      const { adminSession } = await seedOpsFixture(db);
      await seedPaymentOpsFixture(db);
      const service = createAdminOpsService({ db, workspaceId });

      const listed = await service.listItems({
        user: { sessionToken: adminSession.token },
        now: new Date("2026-05-19T11:00:00.000Z"),
      });
      const missingRiskReason = await service.markPaymentRiskReviewed({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-risk-missing-reason",
        body: {
          riskEventId: paymentRiskEventId,
          reason: " ",
        },
        now: new Date("2026-05-19T11:01:00.000Z"),
      });
      const reviewedRisk = await service.markPaymentRiskReviewed({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-risk-reviewed",
        body: {
          riskEventId: paymentRiskEventId,
          reason: "Provider notification was manually matched to finance report.",
        },
        now: new Date("2026-05-19T11:02:00.000Z"),
      });
      const missingRepairReason = await service.repairPaidWithoutCredit({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-repair-missing-reason",
        body: {
          orderId: paidOrderId,
          reason: "",
        },
        now: new Date("2026-05-19T11:03:00.000Z"),
      });
      const repaired = await service.repairPaidWithoutCredit({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-repair-paid-without-credit",
        body: {
          orderId: paidOrderId,
          reason: "Order paid but credit grant consumer had not run.",
        },
        now: new Date("2026-05-19T11:04:00.000Z"),
      });
      const replay = await service.repairPaidWithoutCredit({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-repair-paid-without-credit",
        body: {
          orderId: paidOrderId,
          reason: "Order paid but credit grant consumer had not run.",
        },
        now: new Date("2026-05-19T11:05:00.000Z"),
      });
      const conflict = await service.repairPaidWithoutCredit({
        user: { sessionToken: adminSession.token },
        idempotencyKey: "ops-repair-paid-without-credit",
        body: {
          orderId: paidOrderId,
          reason: "Different repair reason.",
        },
        now: new Date("2026-05-19T11:06:00.000Z"),
      });

      const organization = await db.query<{
        credit_balance_cached: number;
      }>("SELECT credit_balance_cached FROM organizations WHERE id = $1", [
        organizationId,
      ]);
      const order = await db.query<{
        credit_grant_ledger_entry_id: string | null;
      }>("SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1", [
        paidOrderId,
      ]);
      const audit = await db.query<{ event_type: string; reason: string | null }>(
        "SELECT event_type, reason FROM audit_events ORDER BY created_at ASC",
      );

      assert.equal(listed.status, 200);
      assert.deepEqual(
        listed.body.paymentRisks.map((risk) => ({
          id: risk.id,
          riskType: risk.riskType,
          status: risk.status,
        })),
        [
          {
            id: paymentRiskEventId,
            riskType: "amount_mismatch",
            status: "open",
          },
        ],
      );
      assert.deepEqual(
        listed.body.paymentIssues.map((issue) => ({
          orderId: issue.orderId,
          issueType: issue.issueType,
        })),
        [
          {
            orderId: paidOrderId,
            issueType: "paid_without_credit",
          },
        ],
      );
      assert.equal(missingRiskReason.status, 400);
      assert.deepEqual(missingRiskReason.body, { error: "reason_required" });
      assert.equal(reviewedRisk.status, 200);
      assert.equal(reviewedRisk.body.risk.status, "reviewed");
      assert.equal(missingRepairReason.status, 400);
      assert.deepEqual(missingRepairReason.body, { error: "reason_required" });
      assert.equal(repaired.status, 200);
      assert.equal(repaired.body.issue.status, "resolved");
      assert.equal(repaired.body.creditGrant.amount, 120);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.creditGrant.id, repaired.body.creditGrant.id);
      assert.equal(conflict.status, 409);
      assert.deepEqual(conflict.body, { error: "idempotency_conflict" });
      assert.equal(organization.rows[0]?.credit_balance_cached, 120);
      assert.ok(order.rows[0]?.credit_grant_ledger_entry_id);
      assert.deepEqual(audit.rows, [
        {
          event_type: "ops.payment_risk_reviewed",
          reason: "Provider notification was manually matched to finance report.",
        },
        {
          event_type: "ops.payment_paid_without_credit_repaired",
          reason: "Order paid but credit grant consumer had not run.",
        },
      ]);
    } finally {
      await db.close();
    }
  });
});

async function seedOpsFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES
        ($1, '+8613800138001', 'active'),
        ($2, '+8613800138000', 'active')
    `,
    [adminUserId, creatorUserId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Ops Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      UPDATE organizations
      SET credit_reserved_cached = 10
      WHERE id = $1
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Ops Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES
        ('80000000-0000-4000-8000-000000000001', $1, $2, $3, 'owner_admin', 'active'),
        ('80000000-0000-4000-8000-000000000002', $1, $2, $4, 'creator', 'active')
    `,
    [organizationId, workspaceId, adminUserId, creatorUserId],
  );

  const adminSession = await seedSession(db, adminUserId, "admin-ops-session");
  const creatorSession = await seedSession(db, creatorUserId, "creator-ops-session");
  await seedWorkflowAndTasks(db);

  return { adminSession, creatorSession };
}

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  userId: string,
  token: string,
) {
  const session = await createAuthSession({
    userId,
    token,
    now: new Date("2026-05-19T09:00:00.000Z"),
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-05-19T09:00:00.000Z"),
    ],
  );
  return session;
}

async function seedWorkflowAndTasks(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id
      )
      VALUES ($1, $2, $3, NULL, 'shot.image.generate', 'result_unknown', '{}'::jsonb, $4)
    `,
    [workflowId, organizationId, workspaceId, creatorUserId],
  );
  await db.query(
    `
      INSERT INTO tasks (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_type,
        status,
        queue_name,
        input_snapshot_json,
        target_entity_type,
        target_entity_id,
        max_attempts,
        attempt_count,
        current_attempt_id,
        failure_code
      )
      VALUES
        ($1, $3, $4, NULL, $5, 'generate_shot_image', 'result_unknown', 'creator', '{}'::jsonb, 'shot', $1, 1, 1, $6, 'lease_expired_after_external_start'),
        ($2, $3, $4, NULL, $5, 'generate_shot_video', 'failed', 'creator', '{}'::jsonb, 'shot', $2, 2, 1, NULL, 'provider_timeout')
    `,
    [unknownTaskId, failedTaskId, organizationId, workspaceId, workflowId, attemptId],
  );
  await db.query(
    `
      INSERT INTO task_attempts (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_id,
        attempt_number,
        status,
        failure_code
      )
      VALUES ($1, $2, $3, NULL, $4, $5, 1, 'result_unknown', 'lease_expired_after_external_start')
    `,
    [attemptId, organizationId, workspaceId, workflowId, unknownTaskId],
  );
  await db.query(
    `
      INSERT INTO provider_requests (
        id,
        organization_id,
        workspace_id,
        workflow_id,
        task_id,
        attempt_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        external_submission_started_at,
        external_request_id,
        failure_code
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'mock-image',
        'shot.image.generate',
        'unknown-task',
        'request-hash',
        'payloads/unknown-task.json',
        'payload-hash',
        '{}'::jsonb,
        'result_unknown',
        '2026-05-19T09:30:00.000Z',
        'external-unknown',
        'lease_expired_after_external_start'
      )
    `,
    [providerRequestId, organizationId, workspaceId, workflowId, unknownTaskId, attemptId],
  );
  await db.query(
    `
      INSERT INTO credit_reservations (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_id,
        amount_total,
        amount_reserved,
        amount_consumed,
        amount_released,
        status,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id
      )
      VALUES (
        $1,
        $2,
        $3,
        NULL,
        $4,
        $5,
        10,
        10,
        0,
        0,
        'active',
        'task',
        $5,
        'test reservation',
        '{}'::jsonb,
        $6
      )
    `,
    [reservationId, organizationId, workspaceId, workflowId, unknownTaskId, creatorUserId],
  );
}

async function seedPaymentOpsFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO credit_packages (
        id,
        code,
        display_name,
        credits,
        amount_minor,
        currency,
        status
      )
      VALUES ($1, 'ops_120', 'Ops 120', 120, 9900, 'CNY', 'active')
    `,
    [creditPackageId],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        organization_id,
        created_by_user_id,
        order_no,
        credit_package_id,
        package_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES (
        $1,
        $2,
        $3,
        'ORD-OPS-PAID-1',
        $4,
        '{"code":"ops_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb,
        120,
        9900,
        'CNY',
        'paid',
        '2026-05-20T00:00:00.000Z',
        '2026-05-19T10:50:00.000Z',
        $5
      )
    `,
    [paidOrderId, organizationId, adminUserId, creditPackageId, paymentIntentId],
  );
  await db.query(
    `
      INSERT INTO payment_intents (
        id,
        organization_id,
        order_id,
        provider,
        product_mode,
        status,
        amount_minor,
        currency,
        merchant_order_no,
        provider_trade_id,
        provider_payload_hash,
        provider_safe_metadata_json,
        submitted_at,
        succeeded_at,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'wechat_pay',
        'native_qr',
        'succeeded',
        9900,
        'CNY',
        'ORD-OPS-PAID-1',
        'wx-ops-paid-1',
        'payload-hash',
        '{}'::jsonb,
        '2026-05-19T10:49:00.000Z',
        '2026-05-19T10:50:00.000Z',
        '2026-05-20T00:00:00.000Z'
      )
    `,
    [paymentIntentId, organizationId, paidOrderId],
  );
  await db.query(
    `
      INSERT INTO payment_risk_events (
        id,
        organization_id,
        user_id,
        order_id,
        payment_intent_id,
        provider_event_id,
        risk_type,
        severity,
        decision,
        status,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        NULL,
        'amount_mismatch',
        'critical',
        'manual_review',
        'open',
        '{}'::jsonb,
        '2026-05-19T10:55:00.000Z',
        '2026-05-19T10:55:00.000Z'
      )
    `,
    [paymentRiskEventId, organizationId, adminUserId, paidOrderId, paymentIntentId],
  );
}

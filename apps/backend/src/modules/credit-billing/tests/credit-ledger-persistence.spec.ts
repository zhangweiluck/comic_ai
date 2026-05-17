import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { queryOne } from "../../shared/db/sql.ts";
import {
  CreditLedgerConflictError,
  CreditReasonRequiredError,
  InsufficientCreditsError,
  grantCredits,
  repairCreditBalanceCache,
  reserveCredits,
  settleReservationAllocation,
} from "../credit-ledger.service.ts";

describe("persistent credit ledger and reservation", () => {
  it("grants credits through an append-only idempotent ledger entry", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db);

      const first = await grantCredits(db, {
        organizationId: ids.organization,
        amount: 100,
        sourceType: "payment_order",
        sourceId: ids.paymentOrder,
        reason: "paid order credited",
        now: now(),
      });
      const replay = await grantCredits(db, {
        organizationId: ids.organization,
        amount: 100,
        sourceType: "payment_order",
        sourceId: ids.paymentOrder,
        reason: "paid order credited",
        now: now(),
      });

      assert.equal(replay.id, first.id);

      const ledgerCount = await queryOne<{ count: number }>(
        db,
        "SELECT count(*)::int AS count FROM credit_ledger_entries",
      );
      const outboxEvents = await db.query<{
        event_type: string;
        payload_json: {
          ledger_entry_id: string;
          source_type: string;
          source_id: string;
          amount: number;
        };
      }>(
        `
          SELECT event_type, payload_json
          FROM outbox_events
          ORDER BY created_at
        `,
      );
      const organization = await readOrganizationCredits(db);

      assert.equal(ledgerCount?.count, 1);
      assert.equal(outboxEvents.rows.length, 1);
      assert.equal(outboxEvents.rows[0]?.event_type, "credit.grant.created");
      assert.deepEqual(outboxEvents.rows[0]?.payload_json, {
        ledger_entry_id: first.id,
        source_type: "payment_order",
        source_id: ids.paymentOrder,
        amount: 100,
      });
      assert.equal(organization?.credit_balance_cached, 100);
      assert.equal(organization?.credit_reserved_cached, 0);

      await assert.rejects(
        grantCredits(db, {
          organizationId: ids.organization,
          amount: 200,
          sourceType: "payment_order",
          sourceId: ids.paymentOrder,
          reason: "conflicting replay",
          now: now(),
        }),
        CreditLedgerConflictError,
      );
    } finally {
      await db.close();
    }
  });

  it("reserves credits without overselling available balance", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db);
      await grantCredits(db, {
        organizationId: ids.organization,
        amount: 100,
        sourceType: "payment_order",
        sourceId: ids.paymentOrder,
        reason: "paid order credited",
        now: now(),
      });

      const reserved = await reserveCredits(db, {
        organizationId: ids.organization,
        amount: 30,
        sourceType: "workflow_task",
        sourceId: ids.task,
        reason: "shot generation reservation",
        now: now(),
      });

      const organization = await readOrganizationCredits(db);

      assert.equal(reserved.reservation.amountTotal, 30);
      assert.equal(reserved.reservation.amountReserved, 30);
      assert.equal(reserved.reservation.status, "active");
      assert.equal(reserved.ledgerEntry.availableDelta, -30);
      assert.equal(reserved.ledgerEntry.reservedDelta, 30);
      assert.equal(organization?.credit_balance_cached, 70);
      assert.equal(organization?.credit_reserved_cached, 30);

      await assert.rejects(
        reserveCredits(db, {
          organizationId: ids.organization,
          amount: 80,
          sourceType: "workflow_task",
          sourceId: ids.otherTask,
          reason: "would oversell balance",
          now: now(),
        }),
        InsufficientCreditsError,
      );
    } finally {
      await db.close();
    }
  });

  it("requires an explicit reason for high-risk credit facts", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db);

      await assert.rejects(
        grantCredits(db, {
          organizationId: ids.organization,
          amount: 100,
          sourceType: "payment_order",
          sourceId: ids.paymentOrder,
          reason: " ",
          now: now(),
        }),
        CreditReasonRequiredError,
      );
    } finally {
      await db.close();
    }
  });

  it("settles a reservation allocation at most once", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db);
      await grantCredits(db, {
        organizationId: ids.organization,
        amount: 100,
        sourceType: "payment_order",
        sourceId: ids.paymentOrder,
        reason: "paid order credited",
        now: now(),
      });
      const reserved = await reserveCredits(db, {
        organizationId: ids.organization,
        amount: 50,
        sourceType: "workflow_task",
        sourceId: ids.task,
        reason: "shot generation reservation",
        now: now(),
      });

      const first = await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        allocationKey: "task-1:attempt-1",
        amount: 30,
        outcome: "consumed",
        taskId: ids.task,
        attemptId: ids.attempt,
        now: now(),
      });
      const replay = await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        allocationKey: "task-1:attempt-1",
        amount: 30,
        outcome: "consumed",
        taskId: ids.task,
        attemptId: ids.attempt,
        now: now(),
      });

      const organization = await readOrganizationCredits(db);
      const reservation = await readReservation(db, reserved.reservation.id);
      const settleLedgerCount = await queryOne<{ count: number }>(
        db,
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE entry_type = 'consume'",
      );

      assert.equal(replay.allocation.id, first.allocation.id);
      assert.equal(settleLedgerCount?.count, 1);
      assert.equal(organization?.credit_balance_cached, 50);
      assert.equal(organization?.credit_reserved_cached, 20);
      assert.equal(reservation?.amount_consumed, 30);
      assert.equal(reservation?.amount_reserved, 20);
      assert.equal(reservation?.status, "partially_settled");
    } finally {
      await db.close();
    }
  });

  it("keeps ambiguous provider cost reserved for manual review instead of auto-consuming", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db);
      await grantCredits(db, {
        organizationId: ids.organization,
        amount: 100,
        sourceType: "payment_order",
        sourceId: ids.paymentOrder,
        reason: "paid order credited",
        now: now(),
      });
      const reserved = await reserveCredits(db, {
        organizationId: ids.organization,
        amount: 40,
        sourceType: "workflow_task",
        sourceId: ids.task,
        reason: "shot generation reservation",
        now: now(),
      });

      await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        allocationKey: "task-1:attempt-unknown",
        amount: 40,
        outcome: "manual_review_required",
        taskId: ids.task,
        attemptId: ids.attempt,
        now: now(),
      });

      const organization = await readOrganizationCredits(db);
      const reservation = await readReservation(db, reserved.reservation.id);
      const settlementLedgerCount = await queryOne<{ count: number }>(
        db,
        `
          SELECT count(*)::int AS count
          FROM credit_ledger_entries
          WHERE entry_type IN ('consume', 'release')
        `,
      );

      assert.equal(settlementLedgerCount?.count, 0);
      assert.equal(organization?.credit_balance_cached, 60);
      assert.equal(organization?.credit_reserved_cached, 40);
      assert.equal(reservation?.status, "manual_review_required");
      assert.equal(reservation?.amount_reserved, 40);
      assert.equal(reservation?.amount_consumed, 0);
    } finally {
      await db.close();
    }
  });

  it("repairs cached organization balances from the ledger fact source", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db);
      await grantCredits(db, {
        organizationId: ids.organization,
        amount: 100,
        sourceType: "payment_order",
        sourceId: ids.paymentOrder,
        reason: "paid order credited",
        now: now(),
      });
      const reserved = await reserveCredits(db, {
        organizationId: ids.organization,
        amount: 30,
        sourceType: "workflow_task",
        sourceId: ids.task,
        reason: "shot generation reservation",
        now: now(),
      });
      await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        allocationKey: "task-1:attempt-1",
        amount: 10,
        outcome: "consumed",
        taskId: ids.task,
        attemptId: ids.attempt,
        now: now(),
      });
      await db.query(
        `
          UPDATE organizations
          SET credit_balance_cached = 999,
              credit_reserved_cached = 999
          WHERE id = $1
        `,
        [ids.organization],
      );

      const repaired = await repairCreditBalanceCache(db, {
        organizationId: ids.organization,
      });
      const organization = await readOrganizationCredits(db);

      assert.deepEqual(repaired, {
        organizationId: ids.organization,
        available: 70,
        reserved: 20,
        consumed: 10,
      });
      assert.equal(organization?.credit_balance_cached, 70);
      assert.equal(organization?.credit_reserved_cached, 20);
    } finally {
      await db.close();
    }
  });

  it("can release the unconsumed remainder without leaving a stale reservation", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db);
      await grantCredits(db, {
        organizationId: ids.organization,
        amount: 100,
        sourceType: "payment_order",
        sourceId: ids.paymentOrder,
        reason: "paid order credited",
        now: now(),
      });
      const reserved = await reserveCredits(db, {
        organizationId: ids.organization,
        amount: 50,
        sourceType: "workflow_task",
        sourceId: ids.task,
        reason: "shot generation reservation",
        now: now(),
      });

      await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        allocationKey: "task-1:attempt-1",
        amount: 30,
        outcome: "consumed",
        taskId: ids.task,
        attemptId: ids.attempt,
        now: now(),
      });
      await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        allocationKey: "task-1:attempt-2",
        amount: 20,
        outcome: "released",
        taskId: ids.task,
        attemptId: ids.secondAttempt,
        now: now(),
      });

      const organization = await readOrganizationCredits(db);
      const reservation = await readReservation(db, reserved.reservation.id);
      const ledgerTypes = await db.query<{ entry_type: string }>(
        `
          SELECT entry_type
          FROM credit_ledger_entries
          ORDER BY created_at, entry_type
        `,
      );

      assert.equal(organization?.credit_balance_cached, 70);
      assert.equal(organization?.credit_reserved_cached, 0);
      assert.equal(reservation?.amount_consumed, 30);
      assert.equal(reservation?.amount_reserved, 0);
      assert.equal(reservation?.status, "settled");
      assert.deepEqual(
        ledgerTypes.rows.map((row) => row.entry_type).sort(),
        ["consume", "grant", "release", "reservation"],
      );
    } finally {
      await db.close();
    }
  });
});

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  workspace: "20000000-0000-4000-8000-000000000001",
  workflow: "30000000-0000-4000-8000-000000000001",
  paymentOrder: "71000000-0000-4000-8000-000000000001",
  task: "40000000-0000-4000-8000-000000000001",
  otherTask: "40000000-0000-4000-8000-000000000002",
  attempt: "50000000-0000-4000-8000-000000000001",
  secondAttempt: "50000000-0000-4000-8000-000000000002",
};

function now() {
  return new Date("2026-05-09T10:00:00.000Z");
}

async function seedOrganization(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Org', 'active')
    `,
    [ids.organization],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Workspace', 'active')
    `,
    [ids.workspace, ids.organization],
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json
      )
      VALUES ($1, $2, $3, NULL, 'shot_generation', 'running', '{}'::jsonb)
    `,
    [ids.workflow, ids.organization, ids.workspace],
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
        target_entity_id
      )
      VALUES (
        $1,
        $2,
        $3,
        NULL,
        $4,
        'shot_image',
        'running',
        'generation',
        '{}'::jsonb,
        'shot',
        $1
      )
    `,
    [ids.task, ids.organization, ids.workspace, ids.workflow],
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
        status
      )
      VALUES ($1, $2, $3, NULL, $4, $5, 1, 'running')
    `,
    [ids.attempt, ids.organization, ids.workspace, ids.workflow, ids.task],
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
        status
      )
      VALUES ($1, $2, $3, NULL, $4, $5, 2, 'running')
    `,
    [ids.secondAttempt, ids.organization, ids.workspace, ids.workflow, ids.task],
  );
}

async function readOrganizationCredits(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
) {
  return queryOne<{
    credit_balance_cached: number;
    credit_reserved_cached: number;
  }>(
    db,
    `
      SELECT credit_balance_cached, credit_reserved_cached
      FROM organizations
      WHERE id = $1
    `,
    [ids.organization],
  );
}

async function readReservation(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  reservationId: string,
) {
  return queryOne<{
    amount_reserved: number;
    amount_consumed: number;
    status: string;
  }>(
    db,
    `
      SELECT amount_reserved, amount_consumed, status
      FROM credit_reservations
      WHERE id = $1
    `,
    [reservationId],
  );
}

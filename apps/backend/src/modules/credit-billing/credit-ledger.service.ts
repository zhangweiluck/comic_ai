import { randomUUID } from "node:crypto";

import type {
  CreditReservationAllocationStatus,
  CreditReservationStatus,
} from "../../../../../packages/contracts/domain/states.ts";
import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import type { RecomputedCreditBalance } from "./credit-balance-reconciliation.contract.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

type CreditLedgerEntryType = "grant" | "reservation" | "consume" | "release";
type CreditAllocationOutcome = Extract<
  CreditReservationAllocationStatus,
  "consumed" | "released" | "manual_review_required"
>;

export interface CreditLedgerEntryRecord {
  id: string;
  organizationId: string;
  reservationId: string | null;
  allocationId: string | null;
  entryType: CreditLedgerEntryType;
  amount: number;
  availableDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  sourceType: string;
  sourceId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface CreditReservationRecord {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  workflowId: string | null;
  taskId: string | null;
  amountTotal: number;
  amountReserved: number;
  amountConsumed: number;
  amountReleased: number;
  status: CreditReservationStatus;
  sourceType: string;
  sourceId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditReservationAllocationRecord {
  id: string;
  reservationId: string;
  organizationId: string;
  taskId: string | null;
  attemptId: string | null;
  providerRequestId: string | null;
  allocationKey: string;
  amount: number;
  status: CreditReservationAllocationStatus;
  settledLedgerEntryId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface CreditLedgerEntryRow {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  allocation_id: string | null;
  entry_type: CreditLedgerEntryType;
  amount: number;
  available_delta: number;
  reserved_delta: number;
  consumed_delta: number;
  source_type: string;
  source_id: string;
  reason: string | null;
  metadata_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date | string;
}

interface CreditReservationRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  project_id: string | null;
  workflow_id: string | null;
  task_id: string | null;
  amount_total: number;
  amount_reserved: number;
  amount_consumed: number;
  amount_released: number;
  status: CreditReservationStatus;
  source_type: string;
  source_id: string;
  reason: string | null;
  metadata_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CreditReservationAllocationRow {
  id: string;
  reservation_id: string;
  organization_id: string;
  task_id: string | null;
  attempt_id: string | null;
  provider_request_id: string | null;
  allocation_key: string;
  amount: number;
  status: CreditReservationAllocationStatus;
  settled_ledger_entry_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

export class InvalidCreditAmountError extends Error {
  readonly code = "invalid_credit_amount";

  constructor() {
    super("Credit amount must be a positive integer.");
  }
}

export class CreditLedgerConflictError extends Error {
  readonly code = "credit_ledger_conflict";

  constructor() {
    super("Credit ledger source was replayed with conflicting facts.");
  }
}

export class CreditReasonRequiredError extends Error {
  readonly code = "credit_reason_required";

  constructor() {
    super("Credit ledger facts require a non-empty reason.");
  }
}

export class InsufficientCreditsError extends Error {
  readonly code = "insufficient_credits";

  constructor() {
    super("Organization does not have enough available credits to reserve.");
  }
}

export class CreditReservationNotFoundError extends Error {
  readonly code = "credit_reservation_not_found";

  constructor() {
    super("Credit reservation was not found.");
  }
}

export class CreditReservationAllocationConflictError extends Error {
  readonly code = "credit_reservation_allocation_conflict";

  constructor() {
    super("Credit reservation allocation key was replayed with conflicting facts.");
  }
}

export class CreditReservationBalanceError extends Error {
  readonly code = "credit_reservation_balance_error";

  constructor() {
    super("Credit reservation does not have enough reserved credits to settle.");
  }
}

export async function grantCredits(
  db: SqlDatabase,
  input: {
    organizationId: string;
    amount: number;
    sourceType: string;
    sourceId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<CreditLedgerEntryRecord> {
  assertPositiveAmount(input.amount);
  const reason = requireCreditReason(input.reason);

  await db.query("BEGIN");
  try {
    const inserted = await insertLedgerEntry(db, {
      organizationId: input.organizationId,
      reservationId: null,
      allocationId: null,
      entryType: "grant",
      amount: input.amount,
      availableDelta: input.amount,
      reservedDelta: 0,
      consumedDelta: 0,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reason,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId ?? null,
      now: input.now,
    });

    if (inserted.kind === "inserted") {
      await db.query(
        `
          UPDATE organizations
          SET credit_balance_cached = credit_balance_cached + $2,
              updated_at = $3
          WHERE id = $1
        `,
        [input.organizationId, input.amount, input.now],
      );
      await appendCreditGrantCreatedOutboxEvent(db, {
        organizationId: input.organizationId,
        ledgerEntry: inserted.entry,
        now: input.now,
      });
    }

    await db.query("COMMIT");
    return inserted.entry;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function reserveCredits(
  db: SqlDatabase,
  input: {
    organizationId: string;
    amount: number;
    sourceType: string;
    sourceId: string;
    reason?: string | null;
    workspaceId?: string | null;
    projectId?: string | null;
    workflowId?: string | null;
    taskId?: string | null;
    metadata?: Record<string, unknown>;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<{
  reservation: CreditReservationRecord;
  ledgerEntry: CreditLedgerEntryRecord;
}> {
  assertPositiveAmount(input.amount);
  const reason = requireCreditReason(input.reason);

  await db.query("BEGIN");
  try {
    const existing = await findReservationBySource(db, {
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });

    if (existing) {
      if (existing.amountTotal !== input.amount) {
        throw new CreditLedgerConflictError();
      }

      const existingLedger = await findLedgerEntryBySource(db, {
        organizationId: input.organizationId,
        entryType: "reservation",
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });

      if (!existingLedger) {
        throw new CreditLedgerConflictError();
      }

      await db.query("COMMIT");
      return {
        reservation: existing,
        ledgerEntry: existingLedger,
      };
    }

    const reservationId = randomUUID();
    const reservationRow = await queryOne<CreditReservationRow>(
      db,
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
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $7, 0, 0, 'active',
          $8, $9, $10, $11::jsonb, $12, $13, $13
        )
        RETURNING *
      `,
      [
        reservationId,
        input.organizationId,
        input.workspaceId ?? null,
        input.projectId ?? null,
        input.workflowId ?? null,
        input.taskId ?? null,
        input.amount,
        input.sourceType,
        input.sourceId,
        reason,
        JSON.stringify(input.metadata ?? {}),
        input.createdByUserId ?? null,
        input.now,
      ],
    );

    const updatedOrganization = await queryOne<{ id: string }>(
      db,
      `
        UPDATE organizations
        SET credit_balance_cached = credit_balance_cached - $2,
            credit_reserved_cached = credit_reserved_cached + $2,
            updated_at = $3
        WHERE id = $1
          AND credit_balance_cached >= $2
        RETURNING id
      `,
      [input.organizationId, input.amount, input.now],
    );

    if (!updatedOrganization) {
      throw new InsufficientCreditsError();
    }

    const ledger = await insertLedgerEntry(db, {
      organizationId: input.organizationId,
      reservationId,
      allocationId: null,
      entryType: "reservation",
      amount: input.amount,
      availableDelta: -input.amount,
      reservedDelta: input.amount,
      consumedDelta: 0,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reason,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId ?? null,
      now: input.now,
    });

    await db.query("COMMIT");
    return {
      reservation: reservationFromRow(reservationRow!),
      ledgerEntry: ledger.entry,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function settleReservationAllocation(
  db: SqlDatabase,
  input: {
    reservationId: string;
    allocationKey: string;
    amount: number;
    outcome: CreditAllocationOutcome;
    taskId?: string | null;
    attemptId?: string | null;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
    now: Date;
  },
): Promise<{
  allocation: CreditReservationAllocationRecord;
  ledgerEntry: CreditLedgerEntryRecord | null;
  reservation: CreditReservationRecord;
}> {
  assertPositiveAmount(input.amount);

  await db.query("BEGIN");
  try {
    const reservation = await findReservationById(db, input.reservationId);
    if (!reservation) {
      throw new CreditReservationNotFoundError();
    }

    const existingAllocation = await findAllocationByKey(db, {
      reservationId: input.reservationId,
      allocationKey: input.allocationKey,
    });

    if (existingAllocation) {
      assertAllocationReplayMatches(existingAllocation, input);

      const ledgerEntry = existingAllocation.settledLedgerEntryId
        ? await findLedgerEntryById(db, existingAllocation.settledLedgerEntryId)
        : null;

      await db.query("COMMIT");
      return {
        allocation: existingAllocation,
        ledgerEntry,
        reservation,
      };
    }

    const allocationId = randomUUID();
    const allocationRow = await queryOne<CreditReservationAllocationRow>(
      db,
      `
        INSERT INTO credit_reservation_allocations (
          id,
          reservation_id,
          organization_id,
          task_id,
          attempt_id,
          provider_request_id,
          allocation_key,
          amount,
          status,
          metadata_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)
        RETURNING *
      `,
      [
        allocationId,
        reservation.id,
        reservation.organizationId,
        input.taskId ?? null,
        input.attemptId ?? null,
        input.providerRequestId ?? null,
        input.allocationKey,
        input.amount,
        input.outcome,
        JSON.stringify(input.metadata ?? {}),
        input.now,
      ],
    );

    if (input.outcome === "manual_review_required") {
      const reviewedReservation = await markReservationManualReviewRequired(db, {
        reservationId: reservation.id,
        now: input.now,
      });

      await db.query("COMMIT");
      return {
        allocation: allocationFromRow(allocationRow!),
        ledgerEntry: null,
        reservation: reviewedReservation,
      };
    }

    const ledgerEntryType = input.outcome === "consumed" ? "consume" : "release";
    const deltas =
      input.outcome === "consumed"
        ? {
            availableDelta: 0,
            reservedDelta: -input.amount,
            consumedDelta: input.amount,
          }
        : {
            availableDelta: input.amount,
            reservedDelta: -input.amount,
            consumedDelta: 0,
          };

    const updatedReservation = await applyReservationSettlement(db, {
      reservationId: reservation.id,
      amount: input.amount,
      outcome: input.outcome,
      now: input.now,
    });

    const ledger = await insertLedgerEntry(db, {
      organizationId: reservation.organizationId,
      reservationId: reservation.id,
      allocationId,
      entryType: ledgerEntryType,
      amount: input.amount,
      ...deltas,
      sourceType: "credit_reservation_allocation",
      sourceId: allocationId,
      reason: `reservation allocation ${input.outcome}`,
      metadata: input.metadata ?? {},
      createdByUserId: null,
      now: input.now,
    });

    await db.query(
      `
        UPDATE organizations
        SET credit_balance_cached = credit_balance_cached + $2,
            credit_reserved_cached = credit_reserved_cached - $3,
            updated_at = $4
        WHERE id = $1
      `,
      [
        reservation.organizationId,
        input.outcome === "released" ? input.amount : 0,
        input.amount,
        input.now,
      ],
    );

    const settledAllocation = await queryOne<CreditReservationAllocationRow>(
      db,
      `
        UPDATE credit_reservation_allocations
        SET settled_ledger_entry_id = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [allocationId, ledger.entry.id, input.now],
    );

    await db.query("COMMIT");
    return {
      allocation: allocationFromRow(settledAllocation!),
      ledgerEntry: ledger.entry,
      reservation: updatedReservation,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function repairCreditBalanceCache(
  db: SqlDatabase,
  input: { organizationId: string },
): Promise<RecomputedCreditBalance> {
  const balance = await queryOne<{
    available: number;
    reserved: number;
    consumed: number;
  }>(
    db,
    `
      SELECT
        COALESCE(sum(available_delta), 0)::int AS available,
        COALESCE(sum(reserved_delta), 0)::int AS reserved,
        COALESCE(sum(consumed_delta), 0)::int AS consumed
      FROM credit_ledger_entries
      WHERE organization_id = $1
    `,
    [input.organizationId],
  );

  const recomputed = {
    organizationId: input.organizationId,
    available: balance?.available ?? 0,
    reserved: balance?.reserved ?? 0,
    consumed: balance?.consumed ?? 0,
  };

  await db.query(
    `
      UPDATE organizations
      SET credit_balance_cached = $2,
          credit_reserved_cached = $3,
          updated_at = now()
      WHERE id = $1
    `,
    [input.organizationId, recomputed.available, recomputed.reserved],
  );

  return recomputed;
}

async function insertLedgerEntry(
  db: SqlDatabase,
  input: {
    organizationId: string;
    reservationId: string | null;
    allocationId: string | null;
    entryType: CreditLedgerEntryType;
    amount: number;
    availableDelta: number;
    reservedDelta: number;
    consumedDelta: number;
    sourceType: string;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdByUserId: string | null;
    now: Date;
  },
): Promise<{ kind: "inserted" | "reused"; entry: CreditLedgerEntryRecord }> {
  const row = await queryOne<CreditLedgerEntryRow>(
    db,
    `
      INSERT INTO credit_ledger_entries (
        id,
        organization_id,
        reservation_id,
        allocation_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13::jsonb, $14, $15
      )
      ON CONFLICT (organization_id, source_type, source_id, entry_type)
      DO NOTHING
      RETURNING *
    `,
    [
      randomUUID(),
      input.organizationId,
      input.reservationId,
      input.allocationId,
      input.entryType,
      input.amount,
      input.availableDelta,
      input.reservedDelta,
      input.consumedDelta,
      input.sourceType,
      input.sourceId,
      input.reason,
      JSON.stringify(input.metadata),
      input.createdByUserId,
      input.now,
    ],
  );

  if (row) {
    return {
      kind: "inserted",
      entry: ledgerEntryFromRow(row),
    };
  }

  const existing = await findLedgerEntryBySource(db, {
    organizationId: input.organizationId,
    entryType: input.entryType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  if (
    !existing ||
    existing.amount !== input.amount ||
    existing.availableDelta !== input.availableDelta ||
    existing.reservedDelta !== input.reservedDelta ||
    existing.consumedDelta !== input.consumedDelta ||
    existing.reservationId !== input.reservationId ||
    existing.allocationId !== input.allocationId
  ) {
    throw new CreditLedgerConflictError();
  }

  return {
    kind: "reused",
    entry: existing,
  };
}

async function appendCreditGrantCreatedOutboxEvent(
  db: SqlDatabase,
  input: {
    organizationId: string;
    ledgerEntry: CreditLedgerEntryRecord;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $5, $5)
    `,
    [
      randomUUID(),
      input.organizationId,
      eventTypes.creditGrantCreated,
      JSON.stringify({
        ledger_entry_id: input.ledgerEntry.id,
        source_type: input.ledgerEntry.sourceType,
        source_id: input.ledgerEntry.sourceId,
        amount: input.ledgerEntry.amount,
      }),
      input.now,
    ],
  );
}

async function applyReservationSettlement(
  db: SqlDatabase,
  input: {
    reservationId: string;
    amount: number;
    outcome: Exclude<CreditAllocationOutcome, "manual_review_required">;
    now: Date;
  },
): Promise<CreditReservationRecord> {
  const consumedDelta = input.outcome === "consumed" ? input.amount : 0;
  const releasedDelta = input.outcome === "released" ? input.amount : 0;
  const row = await queryOne<CreditReservationRow>(
    db,
    `
      UPDATE credit_reservations
      SET amount_reserved = amount_reserved - $2,
          amount_consumed = amount_consumed + $3,
          amount_released = amount_released + $4,
          status = CASE
            WHEN amount_reserved - $2 = 0
              AND amount_consumed + $3 = 0
              AND amount_released + $4 = amount_total THEN 'released'
            WHEN amount_reserved - $2 = 0
              AND amount_consumed + $3 + amount_released + $4 = amount_total THEN 'settled'
            WHEN amount_reserved - $2 = 0 AND amount_consumed + $3 = 0 THEN 'released'
            ELSE 'partially_settled'
          END,
          updated_at = $5
      WHERE id = $1
        AND amount_reserved >= $2
        AND status IN ('active', 'partially_settled')
      RETURNING *
    `,
    [
      input.reservationId,
      input.amount,
      consumedDelta,
      releasedDelta,
      input.now,
    ],
  );

  if (!row) {
    throw new CreditReservationBalanceError();
  }

  return reservationFromRow(row);
}

async function markReservationManualReviewRequired(
  db: SqlDatabase,
  input: { reservationId: string; now: Date },
): Promise<CreditReservationRecord> {
  const row = await queryOne<CreditReservationRow>(
    db,
    `
      UPDATE credit_reservations
      SET status = 'manual_review_required',
          updated_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [input.reservationId, input.now],
  );

  return reservationFromRow(row!);
}

async function findLedgerEntryBySource(
  db: SqlDatabase,
  input: {
    organizationId: string;
    entryType: CreditLedgerEntryType;
    sourceType: string;
    sourceId: string;
  },
): Promise<CreditLedgerEntryRecord | undefined> {
  const row = await queryOne<CreditLedgerEntryRow>(
    db,
    `
      SELECT *
      FROM credit_ledger_entries
      WHERE organization_id = $1
        AND entry_type = $2
        AND source_type = $3
        AND source_id = $4
      LIMIT 1
    `,
    [
      input.organizationId,
      input.entryType,
      input.sourceType,
      input.sourceId,
    ],
  );

  return row ? ledgerEntryFromRow(row) : undefined;
}

async function findLedgerEntryById(
  db: SqlDatabase,
  ledgerEntryId: string,
): Promise<CreditLedgerEntryRecord | null> {
  const row = await queryOne<CreditLedgerEntryRow>(
    db,
    "SELECT * FROM credit_ledger_entries WHERE id = $1",
    [ledgerEntryId],
  );

  return row ? ledgerEntryFromRow(row) : null;
}

async function findReservationBySource(
  db: SqlDatabase,
  input: { organizationId: string; sourceType: string; sourceId: string },
): Promise<CreditReservationRecord | undefined> {
  const row = await queryOne<CreditReservationRow>(
    db,
    `
      SELECT *
      FROM credit_reservations
      WHERE organization_id = $1
        AND source_type = $2
        AND source_id = $3
      LIMIT 1
    `,
    [input.organizationId, input.sourceType, input.sourceId],
  );

  return row ? reservationFromRow(row) : undefined;
}

async function findReservationById(
  db: SqlDatabase,
  reservationId: string,
): Promise<CreditReservationRecord | undefined> {
  const row = await queryOne<CreditReservationRow>(
    db,
    "SELECT * FROM credit_reservations WHERE id = $1",
    [reservationId],
  );

  return row ? reservationFromRow(row) : undefined;
}

async function findAllocationByKey(
  db: SqlDatabase,
  input: { reservationId: string; allocationKey: string },
): Promise<CreditReservationAllocationRecord | undefined> {
  const row = await queryOne<CreditReservationAllocationRow>(
    db,
    `
      SELECT *
      FROM credit_reservation_allocations
      WHERE reservation_id = $1
        AND allocation_key = $2
      LIMIT 1
    `,
    [input.reservationId, input.allocationKey],
  );

  return row ? allocationFromRow(row) : undefined;
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidCreditAmountError();
  }
}

function requireCreditReason(reason: string | null | undefined): string {
  const normalized = reason?.trim();
  if (!normalized) {
    throw new CreditReasonRequiredError();
  }
  return normalized;
}

function assertAllocationReplayMatches(
  existing: CreditReservationAllocationRecord,
  input: {
    allocationKey: string;
    amount: number;
    outcome: CreditAllocationOutcome;
    taskId?: string | null;
    attemptId?: string | null;
    providerRequestId?: string | null;
  },
): void {
  if (
    existing.amount !== input.amount ||
    existing.status !== input.outcome ||
    existing.taskId !== (input.taskId ?? null) ||
    existing.attemptId !== (input.attemptId ?? null) ||
    existing.providerRequestId !== (input.providerRequestId ?? null)
  ) {
    throw new CreditReservationAllocationConflictError();
  }
}

function ledgerEntryFromRow(row: CreditLedgerEntryRow): CreditLedgerEntryRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: row.entry_type,
    amount: row.amount,
    availableDelta: row.available_delta,
    reservedDelta: row.reserved_delta,
    consumedDelta: row.consumed_delta,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: row.metadata_json,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
  };
}

function reservationFromRow(row: CreditReservationRow): CreditReservationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    amountTotal: row.amount_total,
    amountReserved: row.amount_reserved,
    amountConsumed: row.amount_consumed,
    amountReleased: row.amount_released,
    status: row.status,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: row.metadata_json,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function allocationFromRow(
  row: CreditReservationAllocationRow,
): CreditReservationAllocationRecord {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    organizationId: row.organization_id,
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    allocationKey: row.allocation_key,
    amount: row.amount,
    status: row.status,
    settledLedgerEntryId: row.settled_ledger_entry_id,
    metadata: row.metadata_json,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

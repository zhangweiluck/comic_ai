import type { SqlDatabase } from "../db/sql.ts";
import { queryOne } from "../db/sql.ts";

export interface OutboxEventRecord {
  id: string;
  organizationId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "processed" | "failed";
  availableAt: Date;
  processedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OutboxEventRow {
  id: string;
  organization_id: string | null;
  event_type: string;
  payload_json: Record<string, unknown>;
  status: OutboxEventRecord["status"];
  available_at: Date | string;
  processed_at: Date | string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const defaultStaleProcessingMs = 2 * 60 * 1000;

export async function claimOutboxEventsForDispatch(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    staleProcessingMs?: number;
  },
): Promise<OutboxEventRecord[]> {
  const staleCutoff = new Date(
    input.now.getTime() - (input.staleProcessingMs ?? defaultStaleProcessingMs),
  );
  const candidates = await db.query<OutboxEventRow>(
    `
      SELECT *
      FROM outbox_events
      WHERE (
          status IN ('pending', 'failed')
          AND available_at <= $1
        )
        OR (
          status = 'processing'
          AND updated_at < $2
        )
      ORDER BY available_at ASC, created_at ASC
      LIMIT $3
    `,
    [input.now, staleCutoff, input.limit],
  );

  const claimed: OutboxEventRecord[] = [];
  for (const candidate of candidates.rows) {
    const row = await queryOne<OutboxEventRow>(
      db,
      `
        UPDATE outbox_events
        SET status = 'processing',
            error_message = NULL,
            updated_at = $2
        WHERE id = $1
          AND (
            (
              status IN ('pending', 'failed')
              AND available_at <= $2
            )
            OR (
              status = 'processing'
              AND updated_at < $3
            )
          )
        RETURNING *
      `,
      [candidate.id, input.now, staleCutoff],
    );

    if (row) {
      claimed.push(outboxEventFromRow(row));
    }
  }

  return claimed;
}

export async function markOutboxEventProcessed(
  db: SqlDatabase,
  input: {
    outboxEventId: string;
    now: Date;
  },
): Promise<OutboxEventRecord> {
  const row = await queryOne<OutboxEventRow>(
    db,
    `
      UPDATE outbox_events
      SET status = 'processed',
          processed_at = $2,
          updated_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [input.outboxEventId, input.now],
  );

  return outboxEventFromRow(row!);
}

export async function markOutboxEventFailed(
  db: SqlDatabase,
  input: {
    outboxEventId: string;
    errorMessage: string;
    retryAt: Date;
    now: Date;
  },
): Promise<OutboxEventRecord> {
  const row = await queryOne<OutboxEventRow>(
    db,
    `
      UPDATE outbox_events
      SET status = 'failed',
          error_message = $2,
          available_at = $3,
          updated_at = $4
      WHERE id = $1
      RETURNING *
    `,
    [input.outboxEventId, input.errorMessage, input.retryAt, input.now],
  );

  return outboxEventFromRow(row!);
}

function outboxEventFromRow(row: OutboxEventRow): OutboxEventRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventType: row.event_type,
    payload: row.payload_json,
    status: row.status,
    availableAt: new Date(row.available_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : null,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

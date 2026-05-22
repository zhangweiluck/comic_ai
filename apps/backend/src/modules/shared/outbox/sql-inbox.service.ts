import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../db/sql.ts";
import type { Inbox } from "./outbox-repair.contract.ts";

export class SqlInbox implements Inbox {
  constructor(private readonly db: SqlDatabase) {}

  async hasConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM inbox_events
          WHERE consumer_name = $1
            AND outbox_event_id = $2
        ) AS exists
      `,
      [input.consumerName, input.outboxEventId],
    );

    return result.rows[0]?.exists === true;
  }

  async markConsumed(input: {
    consumerName: string;
    outboxEventId: string;
  }): Promise<void> {
    await this.db.query(
      `
        INSERT INTO inbox_events (id, consumer_name, outbox_event_id, processed_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (consumer_name, outbox_event_id) DO NOTHING
      `,
      [randomUUID(), input.consumerName, input.outboxEventId],
    );
  }
}

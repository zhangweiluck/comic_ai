import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { OutboxEventRecord } from "../shared/outbox/outbox-dispatch-repair.service.ts";
import { consumeOutboxEventWithIdempotentEffect } from "../shared/outbox/outbox-repair.contract.ts";
import { SqlInbox } from "../shared/outbox/sql-inbox.service.ts";
import {
  grantCreditsInTransaction,
  type CreditLedgerEntryRecord,
} from "./credit-ledger.service.ts";

interface PaymentSucceededPayload {
  order_id: string;
  payment_intent_id: string;
  payment_provider_event_id: string;
  amount_minor: number;
  currency: string;
}

interface PaidOrderRow {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  order_no: string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: string;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
  intent_amount_minor: number | null;
  intent_currency: string | null;
  provider_event_id: string | null;
  provider_event_order_id: string | null;
  provider_event_payment_intent_id: string | null;
  provider_event_type: string | null;
  provider_event_processing_status: string | null;
}

export async function consumePaymentSucceededCreditGrant(
  db: SqlDatabase,
  input: {
    event: OutboxEventRecord;
    now: Date;
  },
): Promise<
  | { kind: "applied"; creditGrant: CreditLedgerEntryRecord }
  | { kind: "duplicate" }
> {
  if (input.event.eventType !== eventTypes.paymentSucceeded) {
    throw new Error(`unsupported_event_type:${input.event.eventType}`);
  }

  const consumed = await consumeOutboxEventWithIdempotentEffect(new SqlInbox(db), {
    consumerName: "credit.payment-succeeded",
    outboxEventId: input.event.id,
    effect: async () => {
      await db.query("BEGIN");
      try {
        const payload = assertPaymentSucceededPayload(input.event.payload);
        if (!input.event.organizationId) {
          throw new Error("payment_succeeded_payload_mismatch");
        }

        const order = await queryOne<PaidOrderRow>(
          db,
          `
            SELECT
              bo.*,
              pi.amount_minor AS intent_amount_minor,
              pi.currency AS intent_currency,
              ppe.id AS provider_event_id,
              ppe.order_id AS provider_event_order_id,
              ppe.payment_intent_id AS provider_event_payment_intent_id,
              ppe.event_type AS provider_event_type,
              ppe.processing_status AS provider_event_processing_status
            FROM billing_orders bo
            LEFT JOIN payment_intents pi
              ON pi.organization_id = bo.organization_id
             AND pi.id = bo.successful_payment_intent_id
            LEFT JOIN payment_provider_events ppe
              ON ppe.organization_id = bo.organization_id
             AND ppe.id = $3
            WHERE bo.organization_id = $2
              AND bo.id = $1
              AND bo.status = 'paid'
            LIMIT 1
            FOR UPDATE OF bo
          `,
          [payload.order_id, input.event.organizationId, payload.payment_provider_event_id],
        );
        if (!order) {
          throw new Error("paid_order_not_found");
        }
        assertPaymentSucceededPayloadMatchesOrder(payload, order);

        const grant = await grantCreditsInTransaction(db, {
          organizationId: order.organization_id,
          amount: order.credits,
          sourceType: "payment_order",
          sourceId: order.id,
          reason: "paid order credited",
          createdByUserId: order.created_by_user_id,
          metadata: {
            orderNo: order.order_no,
            paymentIntentId: order.successful_payment_intent_id,
            paymentProviderEventId: payload.payment_provider_event_id,
          },
          now: input.now,
        });

        await db.query(
          `
            UPDATE billing_orders
            SET credit_grant_ledger_entry_id = $3,
                updated_at = $4
            WHERE organization_id = $1
              AND id = $2
          `,
          [order.organization_id, order.id, grant.id, input.now],
        );

        await db.query("COMMIT");
        return grant;
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    },
  });

  if (consumed.kind === "duplicate") {
    return { kind: "duplicate" };
  }

  return { kind: "applied", creditGrant: consumed.result };
}

function assertPaymentSucceededPayload(
  payload: Record<string, unknown>,
): PaymentSucceededPayload {
  if (
    typeof payload.order_id !== "string" ||
    typeof payload.payment_intent_id !== "string" ||
    typeof payload.payment_provider_event_id !== "string" ||
    typeof payload.amount_minor !== "number" ||
    typeof payload.currency !== "string"
  ) {
    throw new Error("invalid_payment_succeeded_payload");
  }

  return {
    order_id: payload.order_id,
    payment_intent_id: payload.payment_intent_id,
    payment_provider_event_id: payload.payment_provider_event_id,
    amount_minor: payload.amount_minor,
    currency: payload.currency,
  };
}

function assertPaymentSucceededPayloadMatchesOrder(
  payload: PaymentSucceededPayload,
  order: PaidOrderRow,
): void {
  if (
    order.successful_payment_intent_id !== payload.payment_intent_id ||
    order.amount_minor !== payload.amount_minor ||
    order.currency !== payload.currency ||
    order.intent_amount_minor !== payload.amount_minor ||
    order.intent_currency !== payload.currency ||
    order.provider_event_id !== payload.payment_provider_event_id ||
    order.provider_event_order_id !== payload.order_id ||
    order.provider_event_payment_intent_id !== payload.payment_intent_id ||
    order.provider_event_type !== "payment_succeeded" ||
    order.provider_event_processing_status !== "processed"
  ) {
    throw new Error("payment_succeeded_payload_mismatch");
  }
}

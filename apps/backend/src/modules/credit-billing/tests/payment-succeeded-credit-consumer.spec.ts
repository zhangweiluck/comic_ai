import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { consumePaymentSucceededCreditGrant } from "../payment-succeeded-credit-consumer.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const packageId = "90000000-0000-4000-8000-000000000001";
const orderId = "91000000-0000-4000-8000-000000000001";
const paymentIntentId = "92000000-0000-4000-8000-000000000001";
const providerEventId = "93000000-0000-4000-8000-000000000001";
const outboxEventId = "94000000-0000-4000-8000-000000000001";

describe("payment succeeded credit consumer", { concurrency: false }, () => {
  it("grants credits once and marks the paid order on replay", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedPaidOrderWithOutbox(db);

      const event = {
        id: outboxEventId,
        organizationId,
        eventType: "payment.succeeded",
        payload: {
          order_id: orderId,
          payment_intent_id: paymentIntentId,
          payment_provider_event_id: providerEventId,
          amount_minor: 9900,
          currency: "CNY",
        },
        status: "pending" as const,
        availableAt: new Date("2026-05-21T08:01:00.000Z"),
        processedAt: null,
        errorMessage: null,
        createdAt: new Date("2026-05-21T08:01:00.000Z"),
        updatedAt: new Date("2026-05-21T08:01:00.000Z"),
      };

      const first = await consumePaymentSucceededCreditGrant(db, {
        event,
        now: new Date("2026-05-21T08:02:00.000Z"),
      });
      const replay = await consumePaymentSucceededCreditGrant(db, {
        event,
        now: new Date("2026-05-21T08:03:00.000Z"),
      });

      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [orderId],
      );
      const organization = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM organizations WHERE id = $1",
        [organizationId],
      );
      const inbox = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM inbox_events WHERE consumer_name = 'credit.payment-succeeded'",
      );

      assert.equal(first.kind, "applied");
      assert.equal(replay.kind, "duplicate");
      assert.equal(ledgerCount.rows[0]?.count, 1);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, first.creditGrant.id);
      assert.equal(organization.rows[0]?.credit_balance_cached, 120);
      assert.equal(inbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("keeps the credit grant idempotent when duplicate events race before inbox mark", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedPaidOrderWithOutbox(db);

      const event = {
        id: outboxEventId,
        organizationId,
        eventType: "payment.succeeded",
        payload: {
          order_id: orderId,
          payment_intent_id: paymentIntentId,
          payment_provider_event_id: providerEventId,
          amount_minor: 9900,
          currency: "CNY",
        },
        status: "pending" as const,
        availableAt: new Date("2026-05-21T08:01:00.000Z"),
        processedAt: null,
        errorMessage: null,
        createdAt: new Date("2026-05-21T08:01:00.000Z"),
        updatedAt: new Date("2026-05-21T08:01:00.000Z"),
      };

      const results = await Promise.all([
        consumePaymentSucceededCreditGrant(db, {
          event,
          now: new Date("2026-05-21T08:02:00.000Z"),
        }),
        consumePaymentSucceededCreditGrant(db, {
          event,
          now: new Date("2026-05-21T08:02:00.000Z"),
        }),
      ]);

      const ledger = await db.query<{ id: string }>(
        "SELECT id FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [orderId],
      );
      const organization = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM organizations WHERE id = $1",
        [organizationId],
      );
      const inbox = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM inbox_events WHERE consumer_name = 'credit.payment-succeeded'",
      );
      const appliedGrantIds = results.flatMap((result) =>
        result.kind === "applied" ? [result.creditGrant.id] : [],
      );

      assert.equal(appliedGrantIds.length >= 1, true);
      assert.equal(ledger.rows.length, 1);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, ledger.rows[0]?.id);
      assert.equal(organization.rows[0]?.credit_balance_cached, 120);
      assert.equal(inbox.rows[0]?.count, 1);
      assert.equal(
        appliedGrantIds.every((id) => id === ledger.rows[0]?.id),
        true,
      );
    } finally {
      await db.close();
    }
  });

  it("rejects payment success payloads that do not match the paid order facts", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedPaidOrderWithOutbox(db);

      await assert.rejects(
        () =>
          consumePaymentSucceededCreditGrant(db, {
            event: {
              id: outboxEventId,
              organizationId,
              eventType: "payment.succeeded",
              payload: {
                order_id: orderId,
                payment_intent_id: paymentIntentId,
                payment_provider_event_id: providerEventId,
                amount_minor: 1,
                currency: "CNY",
              },
              status: "pending",
              availableAt: new Date("2026-05-21T08:01:00.000Z"),
              processedAt: null,
              errorMessage: null,
              createdAt: new Date("2026-05-21T08:01:00.000Z"),
              updatedAt: new Date("2026-05-21T08:01:00.000Z"),
            },
            now: new Date("2026-05-21T08:04:00.000Z"),
          }),
        /payment_succeeded_payload_mismatch/,
      );

      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [orderId],
      );
      const inbox = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM inbox_events WHERE consumer_name = 'credit.payment-succeeded'",
      );

      assert.equal(ledgerCount.rows[0]?.count, 0);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, null);
      assert.equal(inbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

async function seedPaidOrderWithOutbox(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138001', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Payment Consumer Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Payment Consumer Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
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
      VALUES ($1, 'consumer_120', 'Consumer 120', 120, 9900, 'CNY', 'active')
    `,
    [packageId],
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
        'ORD-CONSUMER-PAID-1',
        $4,
        '{"code":"consumer_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb,
        120,
        9900,
        'CNY',
        'paid',
        '2026-05-22T00:00:00.000Z',
        '2026-05-21T08:00:00.000Z',
        $5
      )
    `,
    [orderId, organizationId, userId, packageId, paymentIntentId],
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
        'ORD-CONSUMER-PAID-1',
        'wx-consumer-paid-1',
        'payload-hash',
        '{}'::jsonb,
        '2026-05-21T07:59:00.000Z',
        '2026-05-21T08:00:00.000Z',
        '2026-05-22T00:00:00.000Z'
      )
    `,
    [paymentIntentId, organizationId, orderId],
  );
  await db.query(
    `
      INSERT INTO payment_provider_events (
        id,
        organization_id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'wechat_pay',
        'wechat-consumer-event-1',
        'ORD-CONSUMER-PAID-1',
        'wx-consumer-paid-1',
        'payment_succeeded',
        'verified',
        'processed',
        'payload-hash',
        '{}'::jsonb,
        'sent_success',
        NULL,
        '2026-05-21T08:00:00.000Z',
        '2026-05-21T08:00:00.000Z',
        '2026-05-21T08:00:00.000Z',
        '2026-05-21T08:00:00.000Z'
      )
    `,
    [providerEventId, organizationId, orderId, paymentIntentId],
  );
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
      VALUES ($1, $2, 'payment.succeeded', $3::jsonb, 'pending', $4, $4, $4)
    `,
    [
      outboxEventId,
      organizationId,
      JSON.stringify({
        order_id: orderId,
        payment_intent_id: paymentIntentId,
        payment_provider_event_id: providerEventId,
        amount_minor: 9900,
        currency: "CNY",
      }),
      new Date("2026-05-21T08:01:00.000Z"),
    ],
  );
}

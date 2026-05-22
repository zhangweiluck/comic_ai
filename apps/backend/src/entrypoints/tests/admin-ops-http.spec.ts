import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signPaymentCallback } from "../../modules/commerce-payment/commerce-payment.service.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("admin ops HTTP routes", { concurrency: false }, () => {
  it("requires idempotency keys for billing write routes", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const adminCookie = await login(server.origin, "13800138001");

      const packagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie: adminCookie },
      });
      const packages = await packagesResponse.json();
      const packageId = packages.packages[0].id;

      const orderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const order = await orderResponse.json();

      const seededOrderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-order-for-missing-intent-key",
          cookie: adminCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const seededOrder = await seededOrderResponse.json();
      const intentResponse = await fetch(`${server.origin}/api/billing/payment-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          orderId: seededOrder.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const intent = await intentResponse.json();

      assert.equal(packagesResponse.status, 200);
      assert.equal(orderResponse.status, 400);
      assert.deepEqual(order, { error: "idempotency_key_required" });
      assert.equal(seededOrderResponse.status, 200);
      assert.equal(intentResponse.status, 400);
      assert.deepEqual(intent, { error: "idempotency_key_required" });
    } finally {
      await server.close();
    }
  });

  it("rejects ordinary creators and allows the dev owner admin to inspect ops items", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const creatorCookie = await login(server.origin, "13800138000");
      const adminCookie = await login(server.origin, "13800138001");

      const forbidden = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: creatorCookie },
      });
      const forbiddenPayload = await forbidden.json();
      const allowed = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: adminCookie },
      });
      const allowedPayload = await allowed.json();

      assert.equal(forbidden.status, 403);
      assert.deepEqual(forbiddenPayload, { error: "ops_forbidden" });
      assert.equal(allowed.status, 200);
      assert.deepEqual(allowedPayload, {
        tasks: [],
        paymentRisks: [],
        paymentIssues: [],
      });
    } finally {
      await server.close();
    }
  });

  it("exposes billing payment risk routes for C10 admin ops review", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const adminCookie = await login(server.origin, "13800138001");

      const packagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie: adminCookie },
      });
      const packages = await packagesResponse.json();
      const packageId = packages.packages[0].id;

      const orderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-order-risk",
          cookie: adminCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const order = await orderResponse.json();

      const intentResponse = await fetch(`${server.origin}/api/billing/payment-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-intent-risk",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          orderId: order.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const intent = await intentResponse.json();

      const callbackFacts = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "http-risk-callback",
        merchantOrderNo: intent.paymentIntent.merchantOrderNo,
        providerTradeId: "http-risk-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: 1,
        currency: "CNY",
        merchantId: "comic-ai-dev-merchant",
      };
      const callbackResponse = await fetch(
        `${server.origin}/api/billing/payment-callback/mock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...callbackFacts,
            signature: signPaymentCallback(callbackFacts, "dev-payment-secret"),
          }),
        },
      );
      const callback = await callbackResponse.json();

      const opsResponse = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: adminCookie },
      });
      const ops = await opsResponse.json();
      const riskEventId = ops.paymentRisks[0].id;

      const missingIdempotencyResponse = await fetch(
        `${server.origin}/api/admin/ops/payment-risks/mark-reviewed`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            riskEventId,
            reason: "Missing idempotency key should be rejected.",
          }),
        },
      );
      const missingIdempotency = await missingIdempotencyResponse.json();
      const reviewedResponse = await fetch(
        `${server.origin}/api/admin/ops/payment-risks/mark-reviewed`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-risk-reviewed",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            riskEventId,
            reason: "Verified mismatch during callback route test.",
          }),
        },
      );
      const reviewed = await reviewedResponse.json();
      const missingRepairResponse = await fetch(
        `${server.origin}/api/admin/ops/payments/repair-paid-without-credit`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-repair-missing",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            orderId: "91000000-0000-4000-8000-000000000099",
            reason: "Verify route exists for C10.",
          }),
        },
      );
      const missingRepair = await missingRepairResponse.json();

      assert.equal(packagesResponse.status, 200);
      assert.equal(orderResponse.status, 200);
      assert.equal(intentResponse.status, 200);
      assert.equal(callbackResponse.status, 200);
      assert.equal(callback.riskEvent.riskType, "amount_mismatch");
      assert.equal(opsResponse.status, 200);
      assert.equal(ops.paymentRisks.length, 1);
      assert.equal(missingIdempotencyResponse.status, 400);
      assert.deepEqual(missingIdempotency, { error: "idempotency_key_required" });
      assert.equal(reviewedResponse.status, 200);
      assert.equal(reviewed.risk.status, "reviewed");
      assert.equal(missingRepairResponse.status, 404);
      assert.deepEqual(missingRepair, { error: "payment_issue_not_found" });
    } finally {
      await server.close();
    }
  });

  it("exposes refund callbacks that require manual payment review", async () => {
    const server = createPhoneAuthDevServer();

    try {
      await server.listen(0);
      const adminCookie = await login(server.origin, "13800138001");

      const packagesResponse = await fetch(`${server.origin}/api/billing/packages`, {
        headers: { cookie: adminCookie },
      });
      const packages = await packagesResponse.json();
      const packageId = packages.packages[0].id;

      const orderResponse = await fetch(`${server.origin}/api/billing/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-order-refund-review",
          cookie: adminCookie,
        },
        body: JSON.stringify({ creditPackageId: packageId }),
      });
      const order = await orderResponse.json();

      const intentResponse = await fetch(`${server.origin}/api/billing/payment-intents`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-intent-refund-review",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          orderId: order.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        }),
      });
      const intent = await intentResponse.json();

      const callbackFacts = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "http-refund-review-callback",
        merchantOrderNo: intent.paymentIntent.merchantOrderNo,
        providerTradeId: "http-refund-review-trade",
        eventType: "refund_succeeded" as const,
        amountMinor: intent.paymentIntent.amountMinor,
        currency: "CNY",
        merchantId: "comic-ai-dev-merchant",
      };
      const callbackResponse = await fetch(
        `${server.origin}/api/billing/payment-callback/mock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...callbackFacts,
            signature: signPaymentCallback(callbackFacts, "dev-payment-secret"),
          }),
        },
      );
      const callback = await callbackResponse.json();

      const opsResponse = await fetch(`${server.origin}/api/admin/ops/items`, {
        headers: { cookie: adminCookie },
      });
      const ops = await opsResponse.json();

      assert.equal(packagesResponse.status, 200);
      assert.equal(orderResponse.status, 200);
      assert.equal(intentResponse.status, 200);
      assert.equal(callbackResponse.status, 200);
      assert.equal(callback.riskEvent.riskType, "refund_requires_review");
      assert.equal(opsResponse.status, 200);
      assert.equal(ops.paymentRisks.length, 1);
      assert.equal(ops.paymentRisks[0].riskType, "refund_requires_review");
      assert.equal(
        ops.paymentRisks[0].providerEventId,
        callback.riskEvent.providerEventId,
      );
    } finally {
      await server.close();
    }
  });
});

async function login(origin: string, phone: string) {
  const requestResponse = await fetch(`${origin}/api/auth/code/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const requested = await requestResponse.json();
  const debugResponse = await fetch(
    `${origin}/api/auth/dev/challenges/${requested.challengeId}`,
  );
  const debug = await debugResponse.json();
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: requested.challengeId,
      phone,
      code: debug.code,
    }),
  });

  assert.equal(verifyResponse.status, 200);
  return verifyResponse.headers.get("set-cookie") ?? "";
}

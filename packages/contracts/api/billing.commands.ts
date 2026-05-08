import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const createBillingOrderCommand: ApiCommandContract = {
  name: "CreateBillingOrder",
  operationName: operationNames.billingCreateOrder,
  capability: capabilities.billingPurchase,
  idempotencyRequired: true,
  requestSchema: { creditPackageId: "uuid" },
  responseSchema: { orderId: "uuid", orderStatus: "pending_payment" },
  resourceScope: "organization:{organization_id}",
  statePreconditions: ["organization.status = active", "credit_package.status = active"],
  businessErrors: ["credit_package_not_found", "organization_suspended"],
  auditEvent: "billing.order_created",
  verificationIds: ["IDEMP-005", "PAY-create-order"],
};

export const createPaymentIntentCommand: ApiCommandContract = {
  name: "CreatePaymentIntent",
  operationName: operationNames.billingCreatePaymentIntent,
  capability: capabilities.billingPurchase,
  idempotencyRequired: true,
  requestSchema: { orderId: "uuid", provider: "wechat_pay|alipay", productMode: "string" },
  responseSchema: { paymentIntentId: "uuid", payAction: "provider-normalized action" },
  resourceScope: "order:{order_id}",
  statePreconditions: ["order.status = pending_payment", "order not expired"],
  businessErrors: ["order_not_payable", "provider_not_enabled"],
  auditEvent: "billing.payment_intent_created",
  verificationIds: ["PAY-create-intent"],
};

export const requestRefundCommand: ApiCommandContract = {
  name: "RequestRefund",
  operationName: operationNames.billingRequestRefund,
  capability: capabilities.billingRefund,
  idempotencyRequired: true,
  requestSchema: { orderId: "uuid", amountMinor: "integer", reason: "required text" },
  responseSchema: { refundId: "uuid", status: "pending|manual_review_required" },
  resourceScope: "order:{order_id}",
  statePreconditions: ["order.status in paid|partially_refunded", "admin refund capability"],
  businessErrors: ["refund_not_allowed", "invoice_reversal_required"],
  auditEvent: "billing.refund_requested",
  verificationIds: ["PAY-refund", "PAY-invoice-refund-gate"],
};

export const billingCommandContracts = [
  createBillingOrderCommand,
  createPaymentIntentCommand,
  requestRefundCommand,
];

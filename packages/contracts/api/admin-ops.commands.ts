import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const manualSettleUnknownTaskCommand: ApiCommandContract = {
  name: "ManualSettleUnknownTask",
  operationName: operationNames.opsManualSettleTask,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: {
    taskId: "uuid",
    decision: "consume|release|mark_abnormal_cost",
    reason: "required text",
  },
  responseSchema: { taskId: "uuid", taskStatus: "task status" },
  resourceScope: "task:{task_id}",
  statePreconditions: [
    "task.status in result_unknown|manual_review_required",
    "actor has ops settlement capability",
  ],
  businessErrors: ["task_not_settleable", "reason_required", "ops_forbidden"],
  auditEvent: "ops.task_manually_settled",
  verificationIds: ["R-018", "R-023"],
};

export const adminRetryTaskCommand: ApiCommandContract = {
  name: "AdminRetryTask",
  operationName: operationNames.opsRetryTask,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: { taskId: "uuid", reason: "required text" },
  responseSchema: { taskId: "uuid", taskStatus: "queued|running" },
  resourceScope: "task:{task_id}",
  statePreconditions: [
    "task.status in failed|canceled",
    "retry policy permits another attempt",
  ],
  businessErrors: ["task_not_retryable", "reason_required", "ops_forbidden"],
  auditEvent: "ops.task_retry_requested",
  verificationIds: ["R-020"],
};

export const markPaymentRiskReviewedCommand: ApiCommandContract = {
  name: "MarkPaymentRiskReviewed",
  operationName: operationNames.opsMarkPaymentRiskReviewed,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: {
    riskEventId: "uuid",
    reason: "required text",
  },
  responseSchema: { riskEventId: "uuid", status: "reviewed" },
  resourceScope: "payment_risk_event:{risk_event_id}",
  statePreconditions: [
    "payment_risk_event.status = open",
    "actor has ops settlement capability",
  ],
  businessErrors: [
    "payment_risk_not_found",
    "payment_risk_not_reviewable",
    "reason_required",
    "ops_forbidden",
  ],
  auditEvent: "ops.payment_risk_reviewed",
  verificationIds: ["PAY-risk-review", "C10-payment-risk-ops"],
};

export const repairPaidWithoutCreditCommand: ApiCommandContract = {
  name: "RepairPaidWithoutCredit",
  operationName: operationNames.opsRepairPaidWithoutCredit,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: {
    orderId: "uuid",
    reason: "required text",
  },
  responseSchema: {
    orderId: "uuid",
    issueStatus: "resolved",
    creditGrantLedgerEntryId: "uuid",
  },
  resourceScope: "order:{order_id}",
  statePreconditions: [
    "order.status = paid",
    "order.credit_grant_ledger_entry_id is null",
    "actor has ops settlement capability",
  ],
  businessErrors: [
    "payment_issue_not_found",
    "payment_issue_not_repairable",
    "reason_required",
    "ops_forbidden",
  ],
  auditEvent: "ops.payment_paid_without_credit_repaired",
  verificationIds: ["PAY-paid-without-credit-repair", "C10-payment-ops"],
};

export const adminOpsCommandContracts = [
  manualSettleUnknownTaskCommand,
  adminRetryTaskCommand,
  markPaymentRiskReviewedCommand,
  repairPaidWithoutCreditCommand,
];

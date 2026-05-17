export const userStatuses = ["active", "disabled"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const loginCodeStatuses = [
  "issued",
  "consumed",
  "expired",
  "revoked",
  "locked",
] as const;
export type LoginCodeStatus = (typeof loginCodeStatuses)[number];

export const authSessionStatuses = ["active", "revoked", "expired"] as const;
export type AuthSessionStatus = (typeof authSessionStatuses)[number];

export const organizationStatuses = ["active", "suspended", "archived"] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];

export const workspaceStatuses = ["active", "archived"] as const;
export type WorkspaceStatus = (typeof workspaceStatuses)[number];

export const membershipStatuses = ["active", "invited", "disabled"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export const workflowStatuses = [
  "queued",
  "running",
  "partial_succeeded",
  "succeeded",
  "failed",
  "cancel_requested",
  "canceled",
  "result_unknown",
  "manual_review_required",
] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export const taskStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancel_requested",
  "canceled",
  "result_unknown",
  "manual_review_required",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const attemptStatuses = [
  "created",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "result_unknown",
  "manual_review_required",
] as const;
export type AttemptStatus = (typeof attemptStatuses)[number];

export const providerRequestStatuses = [
  "created",
  "submitted",
  "accepted",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "result_unknown",
  "manual_review_required",
] as const;
export type ProviderRequestStatus = (typeof providerRequestStatuses)[number];

export const projectPhases = [
  "script_input",
  "asset_review",
  "shot_generation",
  "export",
] as const;
export type ProjectPhase = (typeof projectPhases)[number];

export const shotContentStatuses = ["draft", "ready", "stale"] as const;
export type ShotContentStatus = (typeof shotContentStatuses)[number];

export const shotImageStatuses = [
  "draft",
  "ready",
  "generating",
  "completed",
  "failed",
  "stale",
] as const;
export type ShotImageStatus = (typeof shotImageStatuses)[number];

export const shotVideoStatuses = [
  "not_ready",
  "ready",
  "generating",
  "completed",
  "failed",
  "stale",
] as const;
export type ShotVideoStatus = (typeof shotVideoStatuses)[number];

export const calibrationSessionStatuses = [
  "draft",
  "generating",
  "ready_for_review",
  "passed",
  "failed",
  "skipped",
  "archived",
] as const;
export type CalibrationSessionStatus =
  (typeof calibrationSessionStatuses)[number];

export const calibrationItemStatuses = [
  "pending",
  "generating",
  "succeeded",
  "failed",
  "review_required",
] as const;
export type CalibrationItemStatus = (typeof calibrationItemStatuses)[number];

export const qualityReviewResults = [
  "not_checked",
  "passed",
  "failed",
  "review_required",
] as const;
export type QualityReviewResult = (typeof qualityReviewResults)[number];

export const creditReservationStatuses = [
  "active",
  "partially_settled",
  "settled",
  "released",
  "manual_review_required",
] as const;
export type CreditReservationStatus =
  (typeof creditReservationStatuses)[number];

export const creditReservationAllocationStatuses = [
  "reserved",
  "consumed",
  "released",
  "manual_review_required",
] as const;
export type CreditReservationAllocationStatus =
  (typeof creditReservationAllocationStatuses)[number];

export const exportStatuses = ["preparing", "ready", "failed", "expired"] as const;
export type ExportStatus = (typeof exportStatuses)[number];

export const creditPackageStatuses = ["active", "inactive", "archived"] as const;
export type CreditPackageStatus = (typeof creditPackageStatuses)[number];

export const orderStatuses = [
  "pending_payment",
  "paid",
  "closed",
  "expired",
  "refund_pending",
  "partially_refunded",
  "refunded",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const paymentIntentStatuses = [
  "created",
  "submitted",
  "succeeded",
  "failed",
  "closed",
  "expired",
  "unknown",
] as const;
export type PaymentIntentStatus = (typeof paymentIntentStatuses)[number];

export const paymentProviderEventStatuses = [
  "received",
  "processed",
  "duplicate",
  "rejected",
  "unmatched",
  "manual_review_required",
] as const;
export type PaymentProviderEventStatus =
  (typeof paymentProviderEventStatuses)[number];

export const paymentEventTypes = [
  "payment_succeeded",
  "payment_failed",
  "payment_closed",
  "refund_succeeded",
  "unknown",
] as const;
export type PaymentEventType = (typeof paymentEventTypes)[number];

export const refundStatuses = [
  "pending",
  "submitted",
  "succeeded",
  "failed",
  "unknown",
  "manual_review_required",
] as const;
export type RefundStatus = (typeof refundStatuses)[number];

export const invoiceRequestStatuses = [
  "requested",
  "issued",
  "rejected",
  "red_letter_required",
  "red_letter_issued",
] as const;
export type InvoiceRequestStatus = (typeof invoiceRequestStatuses)[number];

export const invoiceRecordStatuses = [
  "issued",
  "red_letter_issued",
  "voided",
  "manual_review_required",
] as const;
export type InvoiceRecordStatus = (typeof invoiceRecordStatuses)[number];

export const riskEventSeverities = ["info", "warning", "critical"] as const;
export type RiskEventSeverity = (typeof riskEventSeverities)[number];

export const riskEventDecisions = ["allow", "block", "manual_review"] as const;
export type RiskEventDecision = (typeof riskEventDecisions)[number];

export const reconciliationRunStatuses = [
  "running",
  "succeeded",
  "failed",
  "partial_failed",
] as const;
export type ReconciliationRunStatus =
  (typeof reconciliationRunStatuses)[number];

export const reconciliationItemStatuses = [
  "open",
  "resolved",
  "manual_review_required",
  "ignored_with_reason",
] as const;
export type ReconciliationItemStatus =
  (typeof reconciliationItemStatuses)[number];

import { randomUUID } from "node:crypto";

import type {
  CalibrationItemStatus,
  CalibrationSessionStatus,
  QualityReviewResult,
} from "../../../../../packages/contracts/domain/states.ts";

export type CalibrationDecisionType = "passed" | "skipped" | "override";

export interface CalibrationItemRecord {
  id: string;
  shotId: string;
  status: CalibrationItemStatus;
  qualityReviewResult: QualityReviewResult;
}

export interface CalibrationDecisionRecord {
  id: string;
  decisionType: CalibrationDecisionType;
  decidedByUserId: string;
  reason: string | null;
  decidedAt: Date;
}

export interface CalibrationSessionRecord {
  id: string;
  organizationId: string;
  projectId: string;
  status: CalibrationSessionStatus;
  items: CalibrationItemRecord[];
  decision: CalibrationDecisionRecord | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CalibrationRuleError extends Error {
  constructor(
    readonly code:
      | "invalid_calibration_selection"
      | "calibration_not_ready"
      | "quality_review_failed"
      | "reason_required"
      | "calibration_item_not_found",
  ) {
    super(code);
  }
}

export function createCalibrationSession(input: {
  organizationId: string;
  projectId: string;
  shotIds: string[];
  createdByUserId: string;
}): CalibrationSessionRecord {
  assertThreeUniqueShots(input.shotIds);
  const now = new Date();

  return {
    id: randomUUID(),
    organizationId: input.organizationId,
    projectId: input.projectId,
    status: "generating",
    items: input.shotIds.map((shotId) => ({
      id: randomUUID(),
      shotId,
      status: "generating",
      qualityReviewResult: "not_checked",
    })),
    decision: null,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  };
}

export function markCalibrationItemReviewed(
  session: CalibrationSessionRecord,
  input: {
    shotId: string;
    qualityReviewResult: Exclude<QualityReviewResult, "not_checked">;
  },
): CalibrationSessionRecord {
  let found = false;
  const items = session.items.map((item) => {
    if (item.shotId !== input.shotId) {
      return item;
    }

    found = true;
    return {
      ...item,
      status: statusFromQualityReview(input.qualityReviewResult),
      qualityReviewResult: input.qualityReviewResult,
    };
  });

  if (!found) {
    throw new CalibrationRuleError("calibration_item_not_found");
  }

  return {
    ...session,
    items,
    status: statusFromItems(items),
    updatedAt: new Date(),
  };
}

export function passCalibrationSession(
  session: CalibrationSessionRecord,
  input: {
    decidedByUserId: string;
  },
): CalibrationSessionRecord {
  if (session.status !== "ready_for_review") {
    if (session.items.some((item) => item.qualityReviewResult === "failed")) {
      throw new CalibrationRuleError("quality_review_failed");
    }

    throw new CalibrationRuleError("calibration_not_ready");
  }

  return applyCalibrationDecision(session, {
    decisionType: "passed",
    decidedByUserId: input.decidedByUserId,
    reason: null,
  });
}

export function skipCalibrationSession(
  session: CalibrationSessionRecord,
  input: {
    decidedByUserId: string;
    reason: string;
  },
): CalibrationSessionRecord {
  const reason = input.reason.trim();
  if (reason.length < 1) {
    throw new CalibrationRuleError("reason_required");
  }

  return applyCalibrationDecision(session, {
    decisionType: "skipped",
    decidedByUserId: input.decidedByUserId,
    reason,
  });
}

export function overrideCalibrationSession(
  session: CalibrationSessionRecord,
  input: {
    decidedByUserId: string;
    reason?: string | null;
  },
): CalibrationSessionRecord {
  if (session.status === "generating") {
    throw new CalibrationRuleError("calibration_not_ready");
  }

  const reason = input.reason?.trim();
  return applyCalibrationDecision(session, {
    decisionType: "override",
    decidedByUserId: input.decidedByUserId,
    reason: reason && reason.length > 0 ? reason : null,
  });
}

function assertThreeUniqueShots(shotIds: string[]) {
  if (shotIds.length !== 3 || new Set(shotIds).size !== 3) {
    throw new CalibrationRuleError("invalid_calibration_selection");
  }
}

function statusFromQualityReview(
  qualityReviewResult: Exclude<QualityReviewResult, "not_checked">,
): CalibrationItemStatus {
  if (qualityReviewResult === "passed") {
    return "succeeded";
  }

  if (qualityReviewResult === "failed") {
    return "failed";
  }

  return "review_required";
}

function statusFromItems(items: CalibrationItemRecord[]): CalibrationSessionStatus {
  if (items.some((item) => item.status === "failed")) {
    return "failed";
  }

  if (items.some((item) => item.status === "review_required")) {
    return "ready_for_review";
  }

  if (items.every((item) => item.status === "succeeded")) {
    return "ready_for_review";
  }

  return "generating";
}

function applyCalibrationDecision(
  session: CalibrationSessionRecord,
  input: {
    decisionType: CalibrationDecisionType;
    decidedByUserId: string;
    reason: string | null;
  },
): CalibrationSessionRecord {
  return {
    ...session,
    status: input.decisionType === "passed" ? "passed" : "skipped",
    decision: {
      id: randomUUID(),
      decisionType: input.decisionType,
      decidedByUserId: input.decidedByUserId,
      reason: input.reason,
      decidedAt: new Date(),
    },
    updatedAt: new Date(),
  };
}

import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const generateCalibrationCommand: ApiCommandContract = {
  name: "GenerateCalibration",
  operationName: operationNames.calibrationGenerate,
  capability: capabilities.generationStart,
  idempotencyRequired: true,
  requestSchema: { projectId: "uuid", shotIds: "three uuid values" },
  responseSchema: { workflowId: "uuid", calibrationSessionId: "uuid" },
  resourceScope: "project:{project_id}",
  statePreconditions: ["three representative shots selected", "shots are ready"],
  businessErrors: ["invalid_calibration_selection", "shot_not_ready"],
  auditEvent: "calibration.generate_requested",
  verificationIds: ["TC-P0-003", "TC-P0-009", "R-016"],
};

export const passCalibrationCommand: ApiCommandContract = {
  name: "PassCalibration",
  operationName: operationNames.calibrationPass,
  capability: capabilities.projectEdit,
  idempotencyRequired: true,
  requestSchema: { calibrationSessionId: "uuid" },
  responseSchema: { calibrationSessionId: "uuid", status: "passed" },
  resourceScope: "calibration_session:{calibration_session_id}",
  statePreconditions: ["calibration_session.status = ready_for_review"],
  businessErrors: ["calibration_not_ready", "quality_review_failed"],
  auditEvent: "calibration.passed",
  verificationIds: ["TC-P0-003", "TC-P0-009", "R-024"],
};

export const skipCalibrationCommand: ApiCommandContract = {
  name: "SkipCalibration",
  operationName: operationNames.calibrationSkip,
  capability: capabilities.projectEdit,
  idempotencyRequired: true,
  requestSchema: { calibrationSessionId: "uuid", reason: "required text" },
  responseSchema: { calibrationSessionId: "uuid", status: "skipped" },
  resourceScope: "calibration_session:{calibration_session_id}",
  statePreconditions: ["actor is authorized to skip calibration"],
  businessErrors: ["calibration_skip_not_allowed", "reason_required"],
  auditEvent: "calibration.skipped",
  verificationIds: ["TC-P0-009"],
};

export const calibrationCommandContracts = [
  generateCalibrationCommand,
  passCalibrationCommand,
  skipCalibrationCommand,
];

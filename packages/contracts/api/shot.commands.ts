import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const generateShotImageCommand: ApiCommandContract = {
  name: "GenerateShotImage",
  operationName: operationNames.shotImageGenerate,
  capability: capabilities.generationStart,
  idempotencyRequired: true,
  requestSchema: { shotId: "uuid", promptOverride: "optional text" },
  responseSchema: { workflowId: "uuid", taskId: "uuid", taskStatus: "task status" },
  resourceScope: "shot:{shot_id}",
  statePreconditions: [
    "shot.content_status = ready",
    "shot.image_status in ready|failed|stale",
    "calibration gate passed/skipped/overridden",
    "credit check passes",
  ],
  businessErrors: [
    "shot_not_ready",
    "calibration_required",
    "insufficient_credits",
  ],
  auditEvent: "shot.image_generation_requested",
  verificationIds: ["TC-P0-004", "TC-P0-012", "R-002", "R-016"],
};

export const generateShotVideoCommand: ApiCommandContract = {
  name: "GenerateShotVideo",
  operationName: operationNames.shotVideoGenerate,
  capability: capabilities.generationStart,
  idempotencyRequired: true,
  requestSchema: { shotId: "uuid", motionPrompt: "optional text" },
  responseSchema: { workflowId: "uuid", taskId: "uuid", taskStatus: "task status" },
  resourceScope: "shot:{shot_id}",
  statePreconditions: [
    "shot.video_status in ready|failed|stale",
    "current image asset exists",
    "credit check passes",
  ],
  businessErrors: ["shot_video_not_ready", "insufficient_credits"],
  auditEvent: "shot.video_generation_requested",
  verificationIds: ["TC-P0-006"],
};

export const shotCommandContracts = [
  generateShotImageCommand,
  generateShotVideoCommand,
];

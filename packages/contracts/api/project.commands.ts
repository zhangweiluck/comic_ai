import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const createProjectCommand: ApiCommandContract = {
  name: "CreateProject",
  operationName: operationNames.projectCreate,
  capability: capabilities.projectCreate,
  idempotencyRequired: true,
  requestSchema: {
    workspaceId: "uuid",
    name: "1-60 chars",
    scriptInput: "text or uploaded asset",
    aspectRatio: ["9:16", "16:9"],
    resolution: ["720p", "1080p"],
  },
  responseSchema: { projectId: "uuid" },
  resourceScope: "workspace:{workspace_id}",
  statePreconditions: ["workspace.status = active"],
  businessErrors: ["workspace_not_found", "invalid_project_input"],
  auditEvent: "project.created",
  verificationIds: ["TC-P0-001"],
};

export const parseScriptCommand: ApiCommandContract = {
  name: "ParseScript",
  operationName: operationNames.scriptParse,
  capability: capabilities.projectEdit,
  idempotencyRequired: true,
  requestSchema: { projectId: "uuid", scriptId: "uuid" },
  responseSchema: { workflowId: "uuid" },
  resourceScope: "project:{project_id}",
  statePreconditions: [
    "project.project_phase = script_input",
    "script.status in ready|failed",
  ],
  businessErrors: ["project_not_found", "script_not_ready"],
  auditEvent: "script.parse_requested",
  verificationIds: ["TC-P0-001", "TC-P0-010", "IDEMP-003"],
};

export const splitShotsCommand: ApiCommandContract = {
  name: "SplitShots",
  operationName: operationNames.shotsSplit,
  capability: capabilities.projectEdit,
  idempotencyRequired: true,
  requestSchema: { projectId: "uuid", scriptId: "uuid" },
  responseSchema: { workflowId: "uuid" },
  resourceScope: "project:{project_id}",
  statePreconditions: ["script.status = parsed", "key assets reviewed or reviewing"],
  businessErrors: ["script_not_parsed", "project_not_editable"],
  auditEvent: "shots.split_requested",
  verificationIds: ["TC-P0-003"],
};

export const projectCommandContracts = [
  createProjectCommand,
  parseScriptCommand,
  splitShotsCommand,
];

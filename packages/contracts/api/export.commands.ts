import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const createExportCommand: ApiCommandContract = {
  name: "CreateExport",
  operationName: operationNames.exportCreate,
  capability: capabilities.exportCreate,
  idempotencyRequired: true,
  requestSchema: {
    projectId: "uuid",
    includeIncompleteAssets: "boolean",
  },
  responseSchema: { exportId: "uuid", workflowId: "uuid" },
  resourceScope: "project:{project_id}",
  statePreconditions: ["project has exportable assets or explicit incomplete export confirmation"],
  businessErrors: ["missing_assets", "project_not_exportable"],
  auditEvent: "export.created",
  verificationIds: ["TC-P0-007", "TC-P0-014", "R-017"],
};

export const exportCommandContracts = [createExportCommand];

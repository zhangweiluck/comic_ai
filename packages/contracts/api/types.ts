import type { Capability } from "../domain/capabilities.ts";
import type { OperationName } from "../domain/operation-names.ts";

export interface ApiCommandContract {
  name: string;
  operationName: OperationName;
  capability: Capability;
  idempotencyRequired: boolean;
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  resourceScope: string;
  statePreconditions: string[];
  businessErrors: string[];
  auditEvent: string;
  verificationIds: string[];
}

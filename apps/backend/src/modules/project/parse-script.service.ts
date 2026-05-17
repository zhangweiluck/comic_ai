import { randomUUID } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import {
  beginOrReplayCommand,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";
import { createDeterministicParseScriptMockOutput, type ParseScriptMockOutput } from "./project-readiness.ts";
import { type ProjectStore } from "./project.service.ts";

export class ParseScriptStateError extends Error {
  constructor(readonly code: "project_not_found" | "script_not_ready" | "script_project_mismatch") {
    super(code);
  }
}

export interface WorkflowRequestResult {
  workflowId: string;
  taskId: string;
  taskStatus: "queued" | "running";
}

export async function createParseScriptWorkflowRequest(
  store: ProjectStore,
  input: {
    organizationId: string;
    projectId: string;
    scriptId: string;
    createdByUserId: string;
    idempotencyKey: string;
    requestWorkflow: (input: {
      projectId: string;
      scriptId: string;
      operationName: string;
      createdByUserId: string;
    }) => Promise<WorkflowRequestResult>;
  },
) {
  const project = await store.findProjectByTenant({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!project) {
    throw new ParseScriptStateError("project_not_found");
  }

  const script = await store.findScriptByTenant({
    organizationId: input.organizationId,
    scriptId: input.scriptId,
  });
  if (!script || script.projectId !== input.projectId) {
    throw new ParseScriptStateError("script_project_mismatch");
  }

  if (project.phase !== "script_input" || !["ready", "failed"].includes(script.status)) {
    throw new ParseScriptStateError("script_not_ready");
  }

  const requestHash = JSON.stringify({
    projectId: input.projectId,
    scriptId: input.scriptId,
  });

  const started = await beginOrReplayCommand(store.idempotency, {
    organizationId: input.organizationId,
    operationName: operationNames.scriptParse,
    idempotencyKey: input.idempotencyKey,
    requestHash,
  });

  if (started.kind === "replayed" && started.record.responseResourceId) {
    const workflow = await store.findWorkflowRequest(started.record.responseResourceId);
    if (!workflow) {
      throw new Error("parse_script_replay_missing_workflow");
    }

    return {
      workflow,
      idempotencyRecord: started.record,
      idempotencyResult: "replayed" as const,
    };
  }

  if (started.kind === "processing") {
    throw new IdempotencyProcessingError(started.record);
  }

  const workflow = await input.requestWorkflow({
    projectId: input.projectId,
    scriptId: input.scriptId,
    operationName: operationNames.scriptParse,
    createdByUserId: input.createdByUserId,
  });

  await store.saveWorkflowRequest({
    ...workflow,
    projectId: input.projectId,
    scriptId: input.scriptId,
    operationName: operationNames.scriptParse,
    createdAt: new Date(),
  });

  const completed = await beginOrReplayCommand(store.idempotency, {
    organizationId: input.organizationId,
    operationName: operationNames.scriptParse,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseResourceType: "workflow",
    responseResourceId: workflow.workflowId,
  });

  return {
    workflow,
    idempotencyRecord: completed.record,
    idempotencyResult: "created" as const,
  };
}

export function createDeterministicMockParseResult(scriptInput: string): ParseScriptMockOutput {
  const base = createDeterministicParseScriptMockOutput();
  const titleSeed = scriptInput.split(":").at(0)?.trim();

  return {
    ...base,
    episodes: base.episodes.map((episode) => ({
      ...episode,
      title: titleSeed && titleSeed.length > 0 ? titleSeed : episode.title,
    })),
    shots: base.shots.map((shot, index) => ({
      ...shot,
      id: `shot-${String(index + 1).padStart(3, "0")}`,
    })),
  };
}

export function createWorkflowPortStub(): WorkflowRequestResult {
  return {
    workflowId: randomUUID(),
    taskId: randomUUID(),
    taskStatus: "queued",
  };
}

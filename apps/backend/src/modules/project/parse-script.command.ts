import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  createParseScriptWorkflowRequest,
  ParseScriptStateError,
  type WorkflowRequestResult,
} from "./parse-script.service.ts";
import { type ActorContext } from "./create-project.command.ts";
import { type InMemoryProjectStore } from "./project.service.ts";
import {
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";

export function createParseScriptCommandHandler(deps: {
  store: InMemoryProjectStore;
  resolveActorContext: (input: {
    sessionToken: string;
    projectId: string;
    capability: string;
  }) => Promise<ActorContext>;
  requestWorkflow: (input: {
    projectId: string;
    scriptId: string;
    operationName: string;
    createdByUserId: string;
  }) => Promise<WorkflowRequestResult>;
}) {
  return async function handleParseScript(request: {
    auth: { sessionToken: string };
    body: { projectId: string; scriptId: string };
    idempotencyKey: string;
    now: Date;
  }) {
    const actor = await deps.resolveActorContext({
      sessionToken: request.auth.sessionToken,
      projectId: request.body.projectId,
      capability: capabilities.projectEdit,
    });

    if (!actor.capabilities.includes(capabilities.projectEdit)) {
      return {
        status: 403,
        body: { error: "forbidden" },
      };
    }

    try {
      const created = await createParseScriptWorkflowRequest(deps.store, {
        organizationId: actor.organizationId,
        projectId: request.body.projectId,
        scriptId: request.body.scriptId,
        createdByUserId: actor.actorId,
        idempotencyKey: request.idempotencyKey,
        requestWorkflow: deps.requestWorkflow,
      });

      return {
        status: 202,
        body: {
          workflowId: created.workflow.workflowId,
          taskId: created.workflow.taskId,
          taskStatus: created.workflow.taskStatus,
        },
      };
    } catch (error) {
      if (error instanceof ParseScriptStateError) {
        return {
          status: 409,
          body: { error: error.code },
        };
      }

      if (error instanceof IdempotencyConflictError) {
        return {
          status: 409,
          body: { error: error.code },
        };
      }

      if (error instanceof IdempotencyProcessingError) {
        return {
          status: 202,
          body: { error: error.code },
        };
      }

      throw error;
    }
  };
}

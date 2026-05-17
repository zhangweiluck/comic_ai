import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import { createProjectCommand } from "../../../../../packages/contracts/api/project.commands.ts";

import {
  createProjectDraft,
  CreateProjectValidationError,
  type ProjectStore,
} from "./project.service.ts";
import {
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";

export interface ActorContext {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  capabilities: string[];
}

export interface CreateProjectAuditEvent {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  targetId: string;
  eventType: string;
  occurredAt: Date;
}

export interface CreateProjectCommandRequest {
  auth: { sessionToken: string };
  body: {
    workspaceId: string;
    name: string;
    scriptInput: string;
    aspectRatio: string;
    resolution: string;
  };
  idempotencyKey: string;
  now: Date;
}

export interface CreateProjectCommandResponse {
  status: number;
  body:
    | {
        project: {
          id: string;
          phase: string;
          name: string;
        };
        script: {
          id: string;
          status: string;
        };
      }
    | {
        error: string;
        fieldErrors?: Record<string, string>;
      };
}

export function createProjectCommandHandler(deps: {
  store: ProjectStore;
  resolveActorContext: (input: {
    sessionToken: string;
    workspaceId: string;
    capability: string;
  }) => Promise<ActorContext>;
  appendAuditEvent: (event: CreateProjectAuditEvent) => Promise<void>;
}) {
  return async function handleCreateProject(
    request: CreateProjectCommandRequest,
  ): Promise<CreateProjectCommandResponse> {
    const actor = await deps.resolveActorContext({
      sessionToken: request.auth.sessionToken,
      workspaceId: request.body.workspaceId,
      capability: capabilities.projectCreate,
    });

    if (!actor.capabilities.includes(capabilities.projectCreate)) {
      return {
        status: 403,
        body: { error: "forbidden" },
      };
    }

    try {
      const created = await createProjectDraft(deps.store, {
        organizationId: actor.organizationId,
        workspaceId: request.body.workspaceId,
        createdByUserId: actor.actorId,
        name: request.body.name,
        scriptInput: request.body.scriptInput,
        aspectRatio: request.body.aspectRatio,
        resolution: request.body.resolution,
        idempotencyKey: request.idempotencyKey,
      });

      if (created.idempotencyResult === "created") {
        await deps.appendAuditEvent({
          actorId: actor.actorId,
          organizationId: actor.organizationId,
          workspaceId: actor.workspaceId,
          targetId: created.project.id,
          eventType: createProjectCommand.auditEvent,
          occurredAt: request.now,
        });
      }

      return {
        status: 200,
        body: {
          project: {
            id: created.project.id,
            phase: created.project.phase,
            name: created.project.name,
          },
          script: {
            id: created.script.id,
            status: created.script.status,
          },
        },
      };
    } catch (error) {
      if (error instanceof CreateProjectValidationError) {
        return {
          status: 400,
          body: {
            error: "invalid_project_input",
            fieldErrors: error.fieldErrors,
          },
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

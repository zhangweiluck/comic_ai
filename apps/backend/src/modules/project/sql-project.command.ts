import { createHash } from "node:crypto";

import {
  createProjectCommand,
  parseScriptCommand,
} from "../../../../../packages/contracts/api/project.commands.ts";
import {
  CreateProjectValidationError,
  hashCreateProjectInput,
  type ProjectAspectRatio,
  type ProjectResolution,
  validateCreateProjectInput,
} from "./project.service.ts";
import { SqlProjectStore } from "./sql-project.store.ts";
import type {
  CreateProjectCommandRequest,
  CreateProjectCommandResponse,
} from "./create-project.command.ts";
import {
  ParseScriptStateError,
  type WorkflowRequestResult,
} from "./parse-script.service.ts";
import { resolveActorContext } from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";
import { runIdempotentCommand } from "../shared/command/platform-command-runtime.ts";
import { createWorkflowWithTasks } from "../workflow-task/workflow-task.service.ts";

interface ParseScriptCommandRequest {
  auth: { sessionToken: string };
  body: { projectId: string; scriptId: string };
  idempotencyKey: string;
  now: Date;
}

type ParseScriptCommandResponse =
  | {
      status: 202;
      body: WorkflowRequestResult;
    }
  | {
      status: 403 | 409;
      body: { error: string };
    };

export function createSqlProjectCommandHandler(deps: { db: SqlDatabase }) {
  return async function handleCreateProject(
    request: CreateProjectCommandRequest,
  ): Promise<CreateProjectCommandResponse> {
    const fieldErrors = validateCreateProjectInput({
      organizationId: "",
      workspaceId: request.body.workspaceId,
      createdByUserId: "",
      name: request.body.name,
      scriptInput: request.body.scriptInput,
      aspectRatio: request.body.aspectRatio,
      resolution: request.body.resolution,
      idempotencyKey: request.idempotencyKey,
    });

    if (Object.keys(fieldErrors).length > 0) {
      return {
        status: 400,
        body: {
          error: "invalid_project_input",
          fieldErrors,
        },
      };
    }

    const store = new SqlProjectStore(deps.db);

    try {
      const executed = await runIdempotentCommand({
        db: deps.db,
        operationName: createProjectCommand.operationName,
        capability: createProjectCommand.capability,
        idempotencyKey: request.idempotencyKey,
        requestHash: hashCreateProjectInput({
          organizationId: "",
          workspaceId: request.body.workspaceId,
          createdByUserId: "",
          name: request.body.name,
          scriptInput: request.body.scriptInput,
          aspectRatio: request.body.aspectRatio,
          resolution: request.body.resolution,
          idempotencyKey: request.idempotencyKey,
        }),
        now: request.now,
        resolveActor: (db) =>
          resolveActorContext(db, {
            sessionToken: request.auth.sessionToken,
            workspaceId: request.body.workspaceId,
            capability: createProjectCommand.capability,
            now: request.now,
          }),
        replay: async ({ idempotencyRecord }) => {
          const projectId = idempotencyRecord.responseResourceId;
          if (!projectId) {
            throw new Error("project_replay_missing_resource");
          }

          const bundle = await store.findProjectBundle(projectId);
          if (!bundle) {
            throw new Error("project_replay_missing_bundle");
          }

          return createProjectResponseBody(bundle);
        },
        execute: async ({ actor }) => {
          if (!actor.workspaceId) {
            throw new Error("workspace_scope_required");
          }

          const bundle = await store.createProjectWithScript({
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId,
            createdByUserId: actor.actorId,
            name: request.body.name.trim(),
            scriptInput: request.body.scriptInput.trim(),
            aspectRatio: request.body.aspectRatio as ProjectAspectRatio,
            resolution: request.body.resolution as ProjectResolution,
          });
          const result = createProjectResponseBody(bundle);

          return {
            result,
            responseResourceType: "project",
            responseResourceId: bundle.project.id,
            responseSnapshot: result,
            audit: {
              eventType: createProjectCommand.auditEvent,
              targetType: "project",
              targetId: bundle.project.id,
              workspaceId: actor.workspaceId,
              metadata: {
                scriptId: bundle.script.id,
              },
            },
          };
        },
      });

      return {
        status: 200,
        body: executed.result,
      };
    } catch (error) {
      return mapProjectCommandError(error);
    }
  };
}

export function createSqlParseScriptCommandHandler(deps: { db: SqlDatabase }) {
  return async function handleParseScript(
    request: ParseScriptCommandRequest,
  ): Promise<ParseScriptCommandResponse> {
    const store = new SqlProjectStore(deps.db);

    try {
      const executed = await runIdempotentCommand({
        db: deps.db,
        operationName: parseScriptCommand.operationName,
        capability: parseScriptCommand.capability,
        idempotencyKey: request.idempotencyKey,
        requestHash: hashParseScriptRequest(request.body),
        now: request.now,
        resolveActor: (db) =>
          resolveActorContext(db, {
            sessionToken: request.auth.sessionToken,
            projectId: request.body.projectId,
            capability: parseScriptCommand.capability,
            now: request.now,
          }),
        replay: async ({ idempotencyRecord }) => {
          const workflowId = idempotencyRecord.responseResourceId;
          if (!workflowId) {
            throw new Error("parse_script_replay_missing_resource");
          }

          const workflow = await store.findWorkflowRequest(workflowId);
          if (!workflow) {
            throw new Error("parse_script_replay_missing_workflow");
          }

          return {
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            taskStatus: workflow.taskStatus,
          };
        },
        execute: async ({ actor }) => {
          const project = await store.findProjectByTenant({
            organizationId: actor.organizationId,
            projectId: request.body.projectId,
          });
          if (!project) {
            throw new ParseScriptStateError("project_not_found");
          }

          const script = await store.findScriptByTenant({
            organizationId: actor.organizationId,
            scriptId: request.body.scriptId,
          });
          if (!script || script.projectId !== project.id) {
            throw new ParseScriptStateError("script_project_mismatch");
          }

          if (
            project.phase !== "script_input" ||
            !["ready", "failed"].includes(script.status)
          ) {
            throw new ParseScriptStateError("script_not_ready");
          }

          const workflow = await createWorkflowWithTasks(deps.db, {
            organizationId: actor.organizationId,
            workspaceId: project.workspaceId,
            projectId: project.id,
            workflowType: parseScriptCommand.operationName,
            inputSnapshot: {
              projectId: project.id,
              scriptId: script.id,
            },
            createdByUserId: actor.actorId,
            tasks: [
              {
                taskType: "parse_script",
                queueName: "workflow-control",
                targetEntityType: "script",
                targetEntityId: script.id,
                inputSnapshot: {
                  scriptId: script.id,
                },
              },
            ],
          });
          const result = {
            workflowId: workflow.workflow.id,
            taskId: workflow.tasks[0]!.id,
            taskStatus: workflow.tasks[0]!.status as "queued" | "running",
          };

          return {
            result,
            responseResourceType: "workflow",
            responseResourceId: workflow.workflow.id,
            responseSnapshot: result,
            audit: {
              eventType: parseScriptCommand.auditEvent,
              targetType: "workflow",
              targetId: workflow.workflow.id,
              workspaceId: project.workspaceId,
              projectId: project.id,
              metadata: {
                scriptId: script.id,
                taskId: workflow.tasks[0]!.id,
              },
            },
          };
        },
      });

      return {
        status: 202,
        body: executed.result,
      };
    } catch (error) {
      return mapParseCommandError(error);
    }
  };
}

function createProjectResponseBody(bundle: {
  project: { id: string; phase: string; name: string };
  script: { id: string; status: string };
}) {
  return {
    project: {
      id: bundle.project.id,
      phase: bundle.project.phase,
      name: bundle.project.name,
    },
    script: {
      id: bundle.script.id,
      status: bundle.script.status,
    },
  };
}

function hashParseScriptRequest(input: { projectId: string; scriptId: string }) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        projectId: input.projectId,
        scriptId: input.scriptId,
      }),
    )
    .digest("hex");
}

function mapProjectCommandError(error: unknown): CreateProjectCommandResponse {
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

  if (isAuthorizationError(error)) {
    return {
      status: 403,
      body: { error: error.code },
    };
  }

  throw error;
}

function mapParseCommandError(error: unknown): ParseScriptCommandResponse {
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

  if (isAuthorizationError(error)) {
    return {
      status: 403,
      body: { error: error.code },
    };
  }

  throw error;
}

function isAuthorizationError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

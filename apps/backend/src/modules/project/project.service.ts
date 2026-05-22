import { createHash, randomUUID } from "node:crypto";

import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import {
  beginOrReplayCommand,
  type IdempotencyRecordStore,
  IdempotencyProcessingError,
  InMemoryIdempotencyRecordStore,
} from "../shared/idempotency/idempotency.service.ts";

export type ScriptStatus = "draft" | "ready" | "parsed" | "failed";
export type ProjectAspectRatio = "9:16" | "16:9";
export type ProjectResolution = "720p" | "1080p";

export interface ProjectRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  coverImageUrl?: string | null;
  aspectRatio: ProjectAspectRatio;
  resolution: ProjectResolution;
  phase: "script_input" | "asset_review" | "shot_generation" | "export";
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptRecord {
  id: string;
  organizationId: string;
  projectId: string;
  status: ScriptStatus;
  inputText: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectBundle {
  project: ProjectRecord;
  script: ScriptRecord;
}

export interface WorkflowRequestRecord {
  workflowId: string;
  taskId: string;
  taskStatus: "queued" | "running";
  projectId: string;
  scriptId: string;
  operationName: string;
  createdAt: Date;
}

export interface CreateProjectDraftInput {
  organizationId: string;
  workspaceId: string;
  createdByUserId: string;
  name: string;
  scriptInput: string;
  aspectRatio: string;
  resolution: string;
  idempotencyKey: string;
}

export class CreateProjectValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("create_project_validation_failed");
  }
}

export interface ProjectStore {
  readonly idempotency: IdempotencyRecordStore;
  createProjectWithScript(input: {
    organizationId: string;
    workspaceId: string;
    createdByUserId: string;
    name: string;
    scriptInput: string;
    aspectRatio: ProjectAspectRatio;
    resolution: ProjectResolution;
  }): Promise<ProjectBundle>;
  findProjectBundle(projectId: string): Promise<ProjectBundle | undefined>;
  findProject(projectId: string): Promise<ProjectRecord | undefined>;
  findProjectByTenant(input: {
    organizationId: string;
    projectId: string;
  }): Promise<ProjectRecord | undefined>;
  findScript(scriptId: string): Promise<ScriptRecord | undefined>;
  findScriptByTenant(input: {
    organizationId: string;
    scriptId: string;
  }): Promise<ScriptRecord | undefined>;
  updateScript(script: ScriptRecord): Promise<ScriptRecord>;
  saveWorkflowRequest(record: WorkflowRequestRecord): Promise<WorkflowRequestRecord>;
  findWorkflowRequest(workflowId: string): Promise<WorkflowRequestRecord | undefined>;
}

export class InMemoryProjectStore implements ProjectStore {
  readonly idempotency: IdempotencyRecordStore = new InMemoryIdempotencyRecordStore();
  private readonly bundlesByProjectId = new Map<string, ProjectBundle>();
  private readonly projectsById = new Map<string, ProjectRecord>();
  private readonly scriptsById = new Map<string, ScriptRecord>();
  private readonly workflowRequestsById = new Map<string, WorkflowRequestRecord>();

  async createProjectWithScript(input: {
    organizationId: string;
    workspaceId: string;
    createdByUserId: string;
    name: string;
    scriptInput: string;
    aspectRatio: ProjectAspectRatio;
    resolution: ProjectResolution;
  }): Promise<ProjectBundle> {
    const now = new Date();
    const projectId = randomUUID();
    const scriptId = randomUUID();

    const project: ProjectRecord = {
      id: projectId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      name: input.name,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      phase: "script_input",
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };

    const script: ScriptRecord = {
      id: scriptId,
      organizationId: input.organizationId,
      projectId,
      status: "ready",
      inputText: input.scriptInput,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };

    const bundle = { project, script };
    this.bundlesByProjectId.set(project.id, bundle);
    this.projectsById.set(project.id, project);
    this.scriptsById.set(script.id, script);
    return bundle;
  }

  async findProjectBundle(projectId: string): Promise<ProjectBundle | undefined> {
    return this.bundlesByProjectId.get(projectId);
  }

  async findProject(projectId: string): Promise<ProjectRecord | undefined> {
    return this.projectsById.get(projectId);
  }

  async findProjectByTenant(input: {
    organizationId: string;
    projectId: string;
  }): Promise<ProjectRecord | undefined> {
    const project = this.projectsById.get(input.projectId);
    return project?.organizationId === input.organizationId ? project : undefined;
  }

  async findScript(scriptId: string): Promise<ScriptRecord | undefined> {
    return this.scriptsById.get(scriptId);
  }

  async findScriptByTenant(input: {
    organizationId: string;
    scriptId: string;
  }): Promise<ScriptRecord | undefined> {
    const script = this.scriptsById.get(input.scriptId);
    return script?.organizationId === input.organizationId ? script : undefined;
  }

  async updateScript(script: ScriptRecord): Promise<ScriptRecord> {
    this.scriptsById.set(script.id, script);
    const bundle = this.bundlesByProjectId.get(script.projectId);
    if (bundle) {
      this.bundlesByProjectId.set(script.projectId, {
        project: bundle.project,
        script,
      });
    }
    return script;
  }

  async saveWorkflowRequest(record: WorkflowRequestRecord): Promise<WorkflowRequestRecord> {
    this.workflowRequestsById.set(record.workflowId, record);
    return record;
  }

  async findWorkflowRequest(workflowId: string): Promise<WorkflowRequestRecord | undefined> {
    return this.workflowRequestsById.get(workflowId);
  }
}

export async function createProjectDraft(
  store: ProjectStore,
  input: CreateProjectDraftInput,
) {
  const fieldErrors = validateCreateProjectInput(input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new CreateProjectValidationError(fieldErrors);
  }

  const requestHash = hashCreateProjectInput(input);
  const started = await beginOrReplayCommand(store.idempotency, {
    organizationId: input.organizationId,
    operationName: operationNames.projectCreate,
    idempotencyKey: input.idempotencyKey,
    requestHash,
  });

  if (started.kind === "replayed" && started.record.responseResourceId) {
    const bundle = await store.findProjectBundle(started.record.responseResourceId);
    if (!bundle) {
      throw new Error("project_replay_missing_bundle");
    }

    return {
      ...bundle,
      idempotencyRecord: started.record,
      idempotencyResult: "replayed" as const,
    };
  }

  if (started.kind === "processing") {
    throw new IdempotencyProcessingError(started.record);
  }

  const bundle = await store.createProjectWithScript({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    createdByUserId: input.createdByUserId,
    name: input.name.trim(),
    scriptInput: input.scriptInput.trim(),
    aspectRatio: input.aspectRatio as ProjectAspectRatio,
    resolution: input.resolution as ProjectResolution,
  });

  const completed = await beginOrReplayCommand(store.idempotency, {
    organizationId: input.organizationId,
    operationName: operationNames.projectCreate,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    responseResourceType: "project",
    responseResourceId: bundle.project.id,
  });

  return {
    ...bundle,
    idempotencyRecord: completed.record,
    idempotencyResult: started.kind === "created" ? ("created" as const) : ("replayed" as const),
  };
}

export function validateCreateProjectInput(input: CreateProjectDraftInput) {
  const fieldErrors: Record<string, string> = {};

  if (input.name.trim().length < 1 || input.name.trim().length > 60) {
    fieldErrors.name = "name_length";
  }

  if (input.scriptInput.trim().length < 1) {
    fieldErrors.scriptInput = "script_required";
  }

  if (!["9:16", "16:9"].includes(input.aspectRatio)) {
    fieldErrors.aspectRatio = "aspect_ratio_unsupported";
  }

  if (!["720p", "1080p"].includes(input.resolution)) {
    fieldErrors.resolution = "resolution_unsupported";
  }

  return fieldErrors;
}

export function hashCreateProjectInput(input: CreateProjectDraftInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        scriptInput: input.scriptInput.trim(),
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
      }),
    )
    .digest("hex");
}

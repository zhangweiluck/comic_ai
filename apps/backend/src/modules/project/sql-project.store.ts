import { randomUUID } from "node:crypto";

import { SqlIdempotencyRecordStore } from "../shared/idempotency/persistent-idempotency.store.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type {
  ProjectAspectRatio,
  ProjectBundle,
  ProjectRecord,
  ProjectResolution,
  ProjectStore,
  ScriptRecord,
  ScriptStatus,
  WorkflowRequestRecord,
} from "./project.service.ts";

interface ProjectRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  aspect_ratio: ProjectAspectRatio;
  resolution: ProjectResolution;
  phase: ProjectRecord["phase"];
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ScriptRow {
  id: string;
  organization_id: string;
  project_id: string;
  status: ScriptStatus;
  input_text: string;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface WorkflowRequestRow {
  workflow_id: string;
  task_id: string;
  task_status: WorkflowRequestRecord["taskStatus"];
  project_id: string;
  script_id: string;
  operation_name: string;
  created_at: Date | string;
}

export class SqlProjectStore implements ProjectStore {
  readonly idempotency: SqlIdempotencyRecordStore;

  constructor(private readonly db: SqlDatabase) {
    this.idempotency = new SqlIdempotencyRecordStore(db);
  }

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

    const project = await queryOne<ProjectRow>(
      this.db,
      `
        INSERT INTO projects (
          id,
          organization_id,
          workspace_id,
          name,
          aspect_ratio,
          resolution,
          phase,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'script_input', $7, $8, $8)
        RETURNING *
      `,
      [
        projectId,
        input.organizationId,
        input.workspaceId,
        input.name,
        input.aspectRatio,
        input.resolution,
        input.createdByUserId,
        now,
      ],
    );
    const script = await queryOne<ScriptRow>(
      this.db,
      `
        INSERT INTO scripts (
          id,
          organization_id,
          project_id,
          status,
          input_text,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'ready', $4, $5, $6, $6)
        RETURNING *
      `,
      [
        scriptId,
        input.organizationId,
        projectId,
        input.scriptInput,
        input.createdByUserId,
        now,
      ],
    );

    return {
      project: projectFromRow(project!),
      script: scriptFromRow(script!),
    };
  }

  async findProjectBundle(projectId: string): Promise<ProjectBundle | undefined> {
    const project = await this.findProject(projectId);
    if (!project) {
      return undefined;
    }

    const script = await queryOne<ScriptRow>(
      this.db,
      `
        SELECT *
        FROM scripts
        WHERE organization_id = $1
          AND project_id = $2
        ORDER BY created_at
        LIMIT 1
      `,
      [project.organizationId, project.id],
    );

    return script
      ? {
          project,
          script: scriptFromRow(script),
        }
      : undefined;
  }

  async findProject(projectId: string): Promise<ProjectRecord | undefined> {
    const row = await queryOne<ProjectRow>(
      this.db,
      "SELECT * FROM projects WHERE id = $1",
      [projectId],
    );

    return row ? projectFromRow(row) : undefined;
  }

  async findProjectByTenant(input: {
    organizationId: string;
    projectId: string;
  }): Promise<ProjectRecord | undefined> {
    const row = await queryOne<ProjectRow>(
      this.db,
      `
        SELECT *
        FROM projects
        WHERE organization_id = $1
          AND id = $2
      `,
      [input.organizationId, input.projectId],
    );

    return row ? projectFromRow(row) : undefined;
  }

  async findScript(scriptId: string): Promise<ScriptRecord | undefined> {
    const row = await queryOne<ScriptRow>(
      this.db,
      "SELECT * FROM scripts WHERE id = $1",
      [scriptId],
    );

    return row ? scriptFromRow(row) : undefined;
  }

  async findScriptByTenant(input: {
    organizationId: string;
    scriptId: string;
  }): Promise<ScriptRecord | undefined> {
    const row = await queryOne<ScriptRow>(
      this.db,
      `
        SELECT *
        FROM scripts
        WHERE organization_id = $1
          AND id = $2
      `,
      [input.organizationId, input.scriptId],
    );

    return row ? scriptFromRow(row) : undefined;
  }

  async updateScript(script: ScriptRecord): Promise<ScriptRecord> {
    const row = await queryOne<ScriptRow>(
      this.db,
      `
        UPDATE scripts
        SET status = $2,
            input_text = $3,
            updated_at = $4
        WHERE id = $1
        RETURNING *
      `,
      [script.id, script.status, script.inputText, script.updatedAt],
    );

    return scriptFromRow(row!);
  }

  async saveWorkflowRequest(
    record: WorkflowRequestRecord,
  ): Promise<WorkflowRequestRecord> {
    const row = await queryOne<WorkflowRequestRow>(
      this.db,
      `
        SELECT
          w.id AS workflow_id,
          t.id AS task_id,
          t.status AS task_status,
          w.project_id,
          t.target_entity_id AS script_id,
          w.workflow_type AS operation_name,
          w.created_at
        FROM workflows w
        JOIN tasks t ON t.workflow_id = w.id
        WHERE w.id = $1 AND t.id = $2
        LIMIT 1
      `,
      [record.workflowId, record.taskId],
    );

    return row ? workflowRequestFromRow(row) : record;
  }

  async findWorkflowRequest(
    workflowId: string,
  ): Promise<WorkflowRequestRecord | undefined> {
    const row = await queryOne<WorkflowRequestRow>(
      this.db,
      `
        SELECT
          w.id AS workflow_id,
          t.id AS task_id,
          t.status AS task_status,
          w.project_id,
          t.target_entity_id AS script_id,
          w.workflow_type AS operation_name,
          w.created_at
        FROM workflows w
        JOIN tasks t ON t.workflow_id = w.id
        WHERE w.id = $1
        ORDER BY t.created_at
        LIMIT 1
      `,
      [workflowId],
    );

    return row ? workflowRequestFromRow(row) : undefined;
  }
}

function projectFromRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    name: row.name,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    phase: row.phase,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function scriptFromRow(row: ScriptRow): ScriptRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    status: row.status,
    inputText: row.input_text,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function workflowRequestFromRow(row: WorkflowRequestRow): WorkflowRequestRecord {
  return {
    workflowId: row.workflow_id,
    taskId: row.task_id,
    taskStatus: row.task_status,
    projectId: row.project_id,
    scriptId: row.script_id,
    operationName: row.operation_name,
    createdAt: new Date(row.created_at),
  };
}

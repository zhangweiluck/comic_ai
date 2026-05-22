import { randomUUID } from "node:crypto";

import type {
  AttemptStatus,
  TaskStatus,
  WorkflowStatus,
} from "../../../../../packages/contracts/domain/states.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

interface WorkflowRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  workflow_type: string;
  status: WorkflowStatus;
}

interface TaskRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  workflow_id: string;
  task_type: string;
  status: TaskStatus;
  queue_name: string;
  attempt_count: number;
}

interface AttemptRow {
  id: string;
  task_id: string;
  attempt_number: number;
  status: AttemptStatus;
}

export interface WorkflowRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  workflowType: string;
  status: WorkflowStatus;
}

export interface TaskRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  workflowId: string;
  taskType: string;
  status: TaskStatus;
  queueName: string;
  attemptCount: number;
}

export interface AttemptRecord {
  id: string;
  taskId: string;
  attemptNumber: number;
  status: AttemptStatus;
}

export async function createWorkflowWithTasks(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    projectId: string | null;
    workflowType: string;
    inputSnapshot: Record<string, unknown>;
    createdByUserId?: string | null;
    tasks: Array<{
      id?: string;
      taskType: string;
      queueName: string;
      targetEntityType: string;
      targetEntityId: string;
      inputSnapshot: Record<string, unknown>;
      maxAttempts?: number;
    }>;
  },
): Promise<{ workflow: WorkflowRecord; tasks: TaskRecord[] }> {
  const workflowId = randomUUID();
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb, $7)
    `,
    [
      workflowId,
      input.organizationId,
      input.workspaceId,
      input.projectId,
      input.workflowType,
      JSON.stringify(input.inputSnapshot),
      input.createdByUserId ?? null,
    ],
  );

  const tasks: TaskRecord[] = [];
  for (const taskInput of input.tasks) {
    const taskId = taskInput.id ?? randomUUID();
    const row = await queryOne<TaskRow>(
      db,
      `
        INSERT INTO tasks (
          id,
          organization_id,
          workspace_id,
          project_id,
          workflow_id,
          task_type,
          status,
          queue_name,
          input_snapshot_json,
          target_entity_type,
          target_entity_id,
          max_attempts
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, $8::jsonb, $9, $10, $11)
        RETURNING *
      `,
      [
        taskId,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        workflowId,
        taskInput.taskType,
        taskInput.queueName,
        JSON.stringify(taskInput.inputSnapshot),
        taskInput.targetEntityType,
        taskInput.targetEntityId,
        taskInput.maxAttempts ?? 1,
      ],
    );

    tasks.push(taskFromRow(row!));
  }

  const workflow = await queryOne<WorkflowRow>(
    db,
    "SELECT * FROM workflows WHERE id = $1",
    [workflowId],
  );

  return {
    workflow: workflowFromRow(workflow!),
    tasks,
  };
}

export async function claimQueuedTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    workerId: string;
    now: Date;
    leaseMs: number;
  },
): Promise<{ task: TaskRecord; attempt: AttemptRecord } | undefined> {
  await db.query("BEGIN");
  try {
    const task = await queryOne<TaskRow>(
      db,
      `
        UPDATE tasks
        SET status = 'running',
            locked_by = $2,
            locked_until = $3,
            heartbeat_at = $4,
            attempt_count = attempt_count + 1,
            updated_at = $4
        WHERE id = $1 AND status = 'queued'
        RETURNING *
      `,
      [
        input.taskId,
        input.workerId,
        new Date(input.now.getTime() + input.leaseMs),
        input.now,
      ],
    );

    if (!task) {
      await db.query("ROLLBACK");
      return undefined;
    }

    const attemptId = randomUUID();
    const attempt = await queryOne<AttemptRow>(
      db,
      `
        INSERT INTO task_attempts (
          id,
          organization_id,
          workspace_id,
          project_id,
          workflow_id,
          task_id,
          attempt_number,
          status,
          locked_by,
          locked_until,
          heartbeat_at,
          started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', $8, $9, $10, $10)
        RETURNING id, task_id, attempt_number, status
      `,
      [
        attemptId,
        task.organization_id,
        task.workspace_id,
        task.project_id,
        task.workflow_id,
        task.id,
        task.attempt_count,
        input.workerId,
        new Date(input.now.getTime() + input.leaseMs),
        input.now,
      ],
    );

    await db.query(
      `
        UPDATE tasks
        SET current_attempt_id = $2
        WHERE id = $1
      `,
      [task.id, attemptId],
    );
    await db.query(
      `
        UPDATE workflows
        SET status = 'running',
            started_at = COALESCE(started_at, $2),
            updated_at = $2
        WHERE id = $1 AND status = 'queued'
      `,
      [task.workflow_id, input.now],
    );
    await db.query("COMMIT");

    return {
      task: taskFromRow(task),
      attempt: attemptFromRow(attempt!),
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function finalizeTaskAttempt(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId: string;
    status: Extract<
      TaskStatus,
      "succeeded" | "failed" | "result_unknown" | "manual_review_required"
    >;
    failureCode?: string | null;
    now: Date;
    finalize?: () => Promise<void>;
  },
): Promise<void> {
  await db.query("BEGIN");
  try {
    await input.finalize?.();

    await db.query(
      `
        UPDATE task_attempts
        SET status = $3,
            failure_code = $4,
            finished_at = $5,
            updated_at = $5
        WHERE id = $1 AND task_id = $2
      `,
      [
        input.attemptId,
        input.taskId,
        input.status,
        input.failureCode ?? null,
        input.now,
      ],
    );
    await db.query(
      `
        UPDATE tasks
        SET status = $2,
            failure_code = $3,
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            updated_at = $4
        WHERE id = $1
      `,
      [input.taskId, input.status, input.failureCode ?? null, input.now],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function aggregateWorkflowStatus(
  db: SqlDatabase,
  workflowId: string,
): Promise<WorkflowStatus> {
  const result = await db.query<{ status: TaskStatus }>(
    "SELECT status FROM tasks WHERE workflow_id = $1 ORDER BY id",
    [workflowId],
  );
  const statuses = result.rows.map((row) => row.status);
  const status = aggregateTaskStatuses(statuses);

  await db.query(
    `
      UPDATE workflows
      SET status = $2,
          finished_at = CASE
            WHEN $2 IN ('succeeded', 'partial_succeeded', 'failed', 'canceled')
            THEN COALESCE(finished_at, now())
            ELSE finished_at
          END,
          updated_at = now()
      WHERE id = $1
    `,
    [workflowId, status],
  );

  return status;
}

function aggregateTaskStatuses(statuses: TaskStatus[]): WorkflowStatus {
  if (statuses.includes("manual_review_required")) {
    return "manual_review_required";
  }

  if (statuses.includes("result_unknown")) {
    return "result_unknown";
  }

  if (statuses.some((status) => ["running", "cancel_requested"].includes(status))) {
    return "running";
  }

  if (statuses.every((status) => status === "queued")) {
    return "queued";
  }

  if (statuses.every((status) => status === "succeeded")) {
    return "succeeded";
  }

  if (statuses.every((status) => status === "failed")) {
    return "failed";
  }

  if (statuses.every((status) => status === "canceled")) {
    return "canceled";
  }

  return "partial_succeeded";
}

function workflowFromRow(row: WorkflowRow): WorkflowRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    workflowType: row.workflow_type,
    status: row.status,
  };
}

function taskFromRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    workflowId: row.workflow_id,
    taskType: row.task_type,
    status: row.status,
    queueName: row.queue_name,
    attemptCount: row.attempt_count,
  };
}

function attemptFromRow(row: AttemptRow): AttemptRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    attemptNumber: row.attempt_number,
    status: row.status,
  };
}

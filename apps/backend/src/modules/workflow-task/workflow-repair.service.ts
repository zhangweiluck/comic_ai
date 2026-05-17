import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface DispatchRepairTask {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  workflowId: string;
  taskType: string;
  queueName: string;
  scheduledAt: Date;
}

interface QueuedTaskRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  workflow_id: string;
  task_type: string;
  queue_name: string;
  scheduled_at: Date | string;
}

interface RunningTaskRow {
  id: string;
  workflow_id: string;
  current_attempt_id: string | null;
  locked_until: Date | string | null;
}

interface ProviderStartedRow {
  id: string;
}

const defaultStaleDispatchMs = 2 * 60 * 1000;
const beforeExternalFailureCode = "lease_expired_before_external_start";
const afterExternalFailureCode = "lease_expired_after_external_start";

export async function repairQueuedTaskDispatch(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    staleDispatchMs?: number;
    dispatch: (task: DispatchRepairTask) => Promise<void>;
  },
): Promise<{ dispatchedTaskIds: string[] }> {
  const staleCutoff = new Date(
    input.now.getTime() - (input.staleDispatchMs ?? defaultStaleDispatchMs),
  );
  const candidates = await db.query<QueuedTaskRow>(
    `
      SELECT
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_type,
        queue_name,
        scheduled_at
      FROM tasks
      WHERE status = 'queued'
        AND scheduled_at <= $1
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $2
        )
      ORDER BY scheduled_at ASC, id ASC
      LIMIT $3
    `,
    [input.now, staleCutoff, input.limit],
  );

  const dispatchedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    const claimed = await markTaskDispatched(db, {
      taskId: candidate.id,
      now: input.now,
      staleCutoff,
    });

    if (!claimed) {
      continue;
    }

    await input.dispatch(dispatchRepairTaskFromRow(candidate));
    dispatchedTaskIds.push(candidate.id);
  }

  return { dispatchedTaskIds };
}

export async function repairExpiredRunningTaskLeases(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
  },
): Promise<{
  requeuedTaskIds: string[];
  resultUnknownTaskIds: string[];
}> {
  const expired = await db.query<RunningTaskRow>(
    `
      SELECT id, workflow_id, current_attempt_id, locked_until
      FROM tasks
      WHERE status = 'running'
        AND locked_until IS NOT NULL
        AND locked_until < $1
      ORDER BY locked_until ASC, id ASC
      LIMIT $2
    `,
    [input.now, input.limit],
  );

  const requeuedTaskIds: string[] = [];
  const resultUnknownTaskIds: string[] = [];

  for (const task of expired.rows) {
    const externallyStarted = await hasExternallyStartedProviderRequest(db, task);

    if (externallyStarted) {
      await markTaskResultUnknown(db, {
        task,
        now: input.now,
      });
      resultUnknownTaskIds.push(task.id);
      continue;
    }

    await requeueTaskForRetry(db, {
      task,
      now: input.now,
    });
    requeuedTaskIds.push(task.id);
  }

  return {
    requeuedTaskIds,
    resultUnknownTaskIds,
  };
}

async function markTaskDispatched(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
    staleCutoff: Date;
  },
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET last_dispatched_at = $2,
          updated_at = $2
      WHERE id = $1
        AND status = 'queued'
        AND scheduled_at <= $2
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff],
  );

  return Boolean(row);
}

async function hasExternallyStartedProviderRequest(
  db: SqlDatabase,
  task: RunningTaskRow,
): Promise<boolean> {
  const provider = await queryOne<ProviderStartedRow>(
    db,
    `
      SELECT id
      FROM provider_requests
      WHERE task_id = $1
        AND ($2::uuid IS NULL OR attempt_id = $2)
        AND external_submission_started_at IS NOT NULL
        AND status NOT IN ('succeeded', 'failed', 'canceled')
      LIMIT 1
    `,
    [task.id, task.current_attempt_id],
  );

  return Boolean(provider);
}

async function markTaskResultUnknown(
  db: SqlDatabase,
  input: {
    task: RunningTaskRow;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE provider_requests
      SET status = 'result_unknown',
          failure_code = $3,
          updated_at = $4
      WHERE task_id = $1
        AND ($2::uuid IS NULL OR attempt_id = $2)
        AND external_submission_started_at IS NOT NULL
        AND status NOT IN ('succeeded', 'failed', 'canceled')
    `,
    [
      input.task.id,
      input.task.current_attempt_id,
      afterExternalFailureCode,
      input.now,
    ],
  );
  await db.query(
    `
      UPDATE task_attempts
      SET status = 'result_unknown',
          failure_code = $3,
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          finished_at = $4,
          updated_at = $4
      WHERE task_id = $1
        AND ($2::uuid IS NULL OR id = $2)
        AND status = 'running'
    `,
    [
      input.task.id,
      input.task.current_attempt_id,
      afterExternalFailureCode,
      input.now,
    ],
  );
  await db.query(
    `
      UPDATE tasks
      SET status = 'result_unknown',
          failure_code = $2,
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          updated_at = $3
      WHERE id = $1
        AND status = 'running'
    `,
    [input.task.id, afterExternalFailureCode, input.now],
  );
  await db.query(
    `
      UPDATE workflows
      SET status = 'result_unknown',
          failure_code = $2,
          updated_at = $3
      WHERE id = $1
        AND status IN ('queued', 'running')
    `,
    [input.task.workflow_id, afterExternalFailureCode, input.now],
  );
}

async function requeueTaskForRetry(
  db: SqlDatabase,
  input: {
    task: RunningTaskRow;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE task_attempts
      SET status = 'failed',
          failure_code = $3,
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          finished_at = $4,
          updated_at = $4
      WHERE task_id = $1
        AND ($2::uuid IS NULL OR id = $2)
        AND status = 'running'
    `,
    [
      input.task.id,
      input.task.current_attempt_id,
      beforeExternalFailureCode,
      input.now,
    ],
  );
  await db.query(
    `
      UPDATE tasks
      SET status = 'queued',
          failure_code = NULL,
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          current_attempt_id = NULL,
          updated_at = $2
      WHERE id = $1
        AND status = 'running'
    `,
    [input.task.id, input.now],
  );
}

function dispatchRepairTaskFromRow(row: QueuedTaskRow): DispatchRepairTask {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    workflowId: row.workflow_id,
    taskType: row.task_type,
    queueName: row.queue_name,
    scheduledAt: new Date(row.scheduled_at),
  };
}

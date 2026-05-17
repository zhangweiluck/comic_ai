import { randomUUID } from "node:crypto";

import type { ProviderRequestStatus } from "../../../../../packages/contracts/domain/states.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { ProviderAdapter } from "./provider-adapter.contract.ts";

export interface ProviderRequestRecord {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  workflowId: string | null;
  taskId: string | null;
  attemptId: string | null;
  providerName: string;
  providerOperation: string;
  requestKey: string;
  requestHash: string;
  payloadRef: string;
  payloadHash: string;
  redactedPayload: Record<string, unknown>;
  status: ProviderRequestStatus;
  externalSubmissionStartedAt: Date | null;
  externalRequestId: string | null;
  redactedResponse: Record<string, unknown> | null;
  failureCode: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderRequestInput {
  organizationId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  providerName: string;
  providerOperation: string;
  requestKey: string;
  requestHash: string;
  payloadRef: string;
  payloadHash: string;
  redactedPayload: Record<string, unknown>;
  createdByUserId?: string | null;
  now: Date;
}

interface ProviderRequestRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  project_id: string | null;
  workflow_id: string | null;
  task_id: string | null;
  attempt_id: string | null;
  provider_name: string;
  provider_operation: string;
  request_key: string;
  request_hash: string;
  payload_ref: string;
  payload_hash: string;
  payload_redacted_json: Record<string, unknown>;
  status: ProviderRequestStatus;
  external_submission_started_at: Date | string | null;
  external_request_id: string | null;
  response_redacted_json: Record<string, unknown> | null;
  failure_code: string | null;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class ProviderRequestConflictError extends Error {
  readonly code = "provider_request_conflict";

  constructor() {
    super("Provider request key was reused with a different request or payload hash.");
  }
}

export async function createOrReuseProviderRequest(
  db: SqlDatabase,
  input: ProviderRequestInput,
): Promise<{ kind: "created" | "reused"; request: ProviderRequestRecord }> {
  const requestId = randomUUID();
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      INSERT INTO provider_requests (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_id,
        task_id,
        attempt_id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14::jsonb, 'created', $15, $16, $16
      )
      ON CONFLICT (organization_id, provider_name, provider_operation, request_key)
      DO NOTHING
      RETURNING *
    `,
    [
      requestId,
      input.organizationId,
      input.workspaceId ?? null,
      input.projectId ?? null,
      input.workflowId ?? null,
      input.taskId ?? null,
      input.attemptId ?? null,
      input.providerName,
      input.providerOperation,
      input.requestKey,
      input.requestHash,
      input.payloadRef,
      input.payloadHash,
      JSON.stringify(input.redactedPayload),
      input.createdByUserId ?? null,
      input.now,
    ],
  );

  if (!row) {
    const existing = await findProviderRequestByKey(db, input);

    if (
      !existing ||
      existing.requestHash !== input.requestHash ||
      existing.payloadHash !== input.payloadHash ||
      existing.payloadRef !== input.payloadRef
    ) {
      throw new ProviderRequestConflictError();
    }

    return { kind: "reused", request: existing };
  }

  return {
    kind: "created",
    request: providerRequestFromRow(row),
  };
}

export async function submitProviderRequest(
  db: SqlDatabase,
  input: ProviderRequestInput & {
    adapter: ProviderAdapter;
  },
): Promise<
  | { kind: "submitted"; request: ProviderRequestRecord }
  | { kind: "already_started"; request: ProviderRequestRecord }
> {
  const prepared = await createOrReuseProviderRequest(db, input);

  if (prepared.request.externalSubmissionStartedAt) {
    return {
      kind: "already_started",
      request: prepared.request,
    };
  }

  const started = await tryMarkExternalSubmissionStarted(db, {
    providerRequestId: prepared.request.id,
    externalRequestId: null,
    now: input.now,
  });

  if (!started) {
    return {
      kind: "already_started",
      request: (await findProviderRequestById(db, prepared.request.id))!,
    };
  }

  try {
    const submitted = await input.adapter.submit({
      providerRequestId: started.id,
      providerName: started.providerName,
      providerOperation: started.providerOperation,
      requestKey: started.requestKey,
      payloadRef: started.payloadRef,
      payloadHash: started.payloadHash,
      redactedPayload: started.redactedPayload,
    });

    const accepted = await recordProviderSubmissionAccepted(db, {
      providerRequestId: started.id,
      externalRequestId: submitted.externalRequestId,
      status: submitted.status,
      redactedResponse: submitted.redactedResponse ?? {},
      now: input.now,
    });

    return {
      kind: "submitted",
      request: accepted,
    };
  } catch (error) {
    await markProviderRequestResultUnknown(db, {
      providerRequestId: started.id,
      failureCode: "provider_submission_ambiguous",
      now: input.now,
    });
    throw error;
  }
}

export async function markExternalSubmissionStarted(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const started = await tryMarkExternalSubmissionStarted(db, input);
  if (started) {
    return started;
  }

  return (await findProviderRequestById(db, input.providerRequestId))!;
}

async function tryMarkExternalSubmissionStarted(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string | null;
    now: Date;
  },
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = 'submitted',
          external_submission_started_at = $2,
          external_request_id = $3,
          updated_at = $2
      WHERE id = $1
        AND external_submission_started_at IS NULL
      RETURNING *
    `,
    [input.providerRequestId, input.now, input.externalRequestId],
  );

  return row ? providerRequestFromRow(row) : undefined;
}

export async function markProviderRequestResultUnknown(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    failureCode: string;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = 'result_unknown',
          failure_code = $2,
          updated_at = $3
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
      RETURNING *
    `,
    [input.providerRequestId, input.failureCode, input.now],
  );

  return providerRequestFromRow(row!);
}

async function recordProviderSubmissionAccepted(
  db: SqlDatabase,
  input: {
    providerRequestId: string;
    externalRequestId: string;
    status: Extract<ProviderRequestStatus, "accepted" | "running" | "succeeded">;
    redactedResponse: Record<string, unknown>;
    now: Date;
  },
): Promise<ProviderRequestRecord> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      UPDATE provider_requests
      SET status = $2,
          external_request_id = $3,
          response_redacted_json = $4::jsonb,
          updated_at = $5
      WHERE id = $1
        AND external_submission_started_at IS NOT NULL
      RETURNING *
    `,
    [
      input.providerRequestId,
      input.status,
      input.externalRequestId,
      JSON.stringify(input.redactedResponse),
      input.now,
    ],
  );

  return providerRequestFromRow(row!);
}

async function findProviderRequestByKey(
  db: SqlDatabase,
  input: Pick<
    ProviderRequestInput,
    "organizationId" | "providerName" | "providerOperation" | "requestKey"
  >,
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    `
      SELECT *
      FROM provider_requests
      WHERE organization_id = $1
        AND provider_name = $2
        AND provider_operation = $3
        AND request_key = $4
      LIMIT 1
    `,
    [
      input.organizationId,
      input.providerName,
      input.providerOperation,
      input.requestKey,
    ],
  );

  return row ? providerRequestFromRow(row) : undefined;
}

async function findProviderRequestById(
  db: SqlDatabase,
  providerRequestId: string,
): Promise<ProviderRequestRecord | undefined> {
  const row = await queryOne<ProviderRequestRow>(
    db,
    "SELECT * FROM provider_requests WHERE id = $1",
    [providerRequestId],
  );

  return row ? providerRequestFromRow(row) : undefined;
}

function providerRequestFromRow(row: ProviderRequestRow): ProviderRequestRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    requestKey: row.request_key,
    requestHash: row.request_hash,
    payloadRef: row.payload_ref,
    payloadHash: row.payload_hash,
    redactedPayload: row.payload_redacted_json,
    status: row.status,
    externalSubmissionStartedAt: row.external_submission_started_at
      ? new Date(row.external_submission_started_at)
      : null,
    externalRequestId: row.external_request_id,
    redactedResponse: row.response_redacted_json,
    failureCode: row.failure_code,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

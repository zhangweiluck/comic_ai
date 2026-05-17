import type {
  Capability,
} from "../../../../../../packages/contracts/domain/capabilities.ts";
import type {
  OperationName,
} from "../../../../../../packages/contracts/domain/operation-names.ts";
import {
  appendAuditEvent,
  type AuditEventRecord,
} from "../../audit/audit.service.ts";
import {
  assertCapability,
  type ActorContext,
} from "../../organization/actor-context.service.ts";
import type { SqlDatabase } from "../db/sql.ts";
import type { IdempotencyRecord } from "../idempotency/idempotency.service.ts";
import {
  beginOrReplayCommand,
  IdempotencyProcessingError,
} from "../idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../idempotency/persistent-idempotency.store.ts";

export interface PlatformCommandContext {
  db: SqlDatabase;
  actor: ActorContext;
  idempotencyRecord: IdempotencyRecord;
  now: Date;
}

export interface PlatformCommandAuditInput {
  eventType: string;
  targetType: string;
  targetId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  reason?: string | null;
  sensitive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlatformCommandExecutionResult<TResult> {
  result: TResult;
  responseResourceType: string;
  responseResourceId: string;
  responseSnapshot?: Record<string, unknown>;
  audit?: PlatformCommandAuditInput;
}

export interface RunIdempotentCommandInput<TResult> {
  db: SqlDatabase;
  operationName: OperationName;
  capability: Capability;
  idempotencyKey: string;
  requestHash: string;
  now: Date;
  resolveActor: (db: SqlDatabase) => Promise<ActorContext>;
  replay: (ctx: PlatformCommandContext) => Promise<TResult>;
  execute: (
    ctx: PlatformCommandContext,
  ) => Promise<PlatformCommandExecutionResult<TResult>>;
}

export interface RunIdempotentCommandResult<TResult> {
  result: TResult;
  actor: ActorContext;
  idempotencyRecord: IdempotencyRecord;
  idempotencyResult: "created" | "replayed";
  auditEvent?: AuditEventRecord;
}

export async function runIdempotentCommand<TResult>(
  input: RunIdempotentCommandInput<TResult>,
): Promise<RunIdempotentCommandResult<TResult>> {
  await input.db.query("BEGIN");

  try {
    const actor = await input.resolveActor(input.db);
    assertCapability(actor, input.capability);

    const store = new SqlIdempotencyRecordStore(input.db);
    const started = await beginOrReplayCommand(store, {
      organizationId: actor.organizationId,
      operationName: input.operationName,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });
    const ctx: PlatformCommandContext = {
      db: input.db,
      actor,
      idempotencyRecord: started.record,
      now: input.now,
    };

    if (started.kind === "replayed") {
      const result = await input.replay(ctx);
      await input.db.query("COMMIT");
      return {
        result,
        actor,
        idempotencyRecord: started.record,
        idempotencyResult: "replayed",
      };
    }

    if (started.kind === "processing") {
      throw new IdempotencyProcessingError(started.record);
    }

    const executed = await input.execute(ctx);
    const completed = await store.update({
      ...started.record,
      responseResourceType: executed.responseResourceType,
      responseResourceId: executed.responseResourceId,
      responseSnapshot: executed.responseSnapshot,
      status: "succeeded",
      updatedAt: input.now,
    });
    const auditEvent = executed.audit
      ? await appendAuditEvent(input.db, {
          organizationId: actor.organizationId,
          workspaceId: executed.audit.workspaceId ?? actor.workspaceId,
          projectId: executed.audit.projectId ?? null,
          actorUserId: actor.actorId,
          eventType: executed.audit.eventType,
          targetType: executed.audit.targetType,
          targetId: executed.audit.targetId,
          reason: executed.audit.reason,
          sensitive: executed.audit.sensitive,
          metadata: executed.audit.metadata,
          occurredAt: input.now,
        })
      : undefined;

    await input.db.query("COMMIT");
    return {
      result: executed.result,
      actor,
      idempotencyRecord: completed,
      idempotencyResult: "created",
      auditEvent,
    };
  } catch (error) {
    await input.db.query("ROLLBACK");
    throw error;
  }
}

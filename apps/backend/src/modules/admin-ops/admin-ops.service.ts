import { createHash } from "node:crypto";

import {
  adminRetryTaskCommand,
  manualSettleUnknownTaskCommand,
  markPaymentRiskReviewedCommand,
  repairPaidWithoutCreditCommand,
} from "../../../../../packages/contracts/api/admin-ops.commands.ts";
import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  AuthorizationError,
  resolveActorContext,
} from "../organization/actor-context.service.ts";
import {
  grantCreditsInTransaction,
  settleReservationAllocationInTransaction,
  type CreditAllocationOutcome,
} from "../credit-billing/credit-ledger.service.ts";
import { runIdempotentCommand } from "../shared/command/platform-command-runtime.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";
import { aggregateWorkflowStatus } from "../workflow-task/workflow-task.service.ts";

type AdminOpsResponse<T> = {
  status: number;
  body: T;
};

type AdminOpsError =
  | "ops_forbidden"
  | "reason_required"
  | "task_not_found"
  | "task_not_settleable"
  | "task_not_retryable"
  | "payment_risk_not_found"
  | "payment_risk_not_reviewable"
  | "payment_issue_not_found"
  | "payment_issue_not_repairable"
  | "idempotency_conflict"
  | "idempotency_processing";

interface AuthenticatedAdminOpsUser {
  sessionToken: string;
}

interface AdminTaskRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  workflow_id: string;
  task_type: string;
  status: string;
  queue_name: string;
  attempt_count: number;
  max_attempts: number;
  failure_code: string | null;
  updated_at: Date | string;
  provider_status: string | null;
  provider_name: string | null;
  provider_operation: string | null;
  external_request_id: string | null;
}

interface AdminTaskView {
  id: string;
  workflowId: string;
  projectId: string | null;
  taskType: string;
  status: string;
  queueName: string;
  attemptCount: number;
  maxAttempts: number;
  failureCode: string | null;
  updatedAt: string;
  providerStatus: string | null;
  providerName: string | null;
  providerOperation: string | null;
  externalRequestId: string | null;
}

interface AdminPaymentRiskRow {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  order_id: string | null;
  payment_intent_id: string | null;
  provider_event_id: string | null;
  risk_type: string;
  severity: string;
  decision: string;
  status: string;
  metadata_json: Record<string, unknown> | string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AdminPaymentRiskView {
  id: string;
  orderId: string | null;
  paymentIntentId: string | null;
  providerEventId: string | null;
  riskType: string;
  severity: string;
  decision: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AdminPaymentIssueRow {
  order_id: string;
  order_no: string;
  status: string;
  credits: number;
  amount_minor: number;
  currency: string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
}

interface AdminPaymentIssueView {
  issueType: "paid_without_credit";
  orderId: string;
  orderNo: string;
  status: "open" | "resolved";
  credits: number;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
  successfulPaymentIntentId: string | null;
}

interface AdminBillingOrderRow {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  order_no: string;
  credit_package_id: string;
  package_snapshot_json: Record<string, unknown> | string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: string;
  idempotency_record_id: string | null;
  idempotency_key: string | null;
  expires_at: Date | string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AdminOpsServiceDeps {
  db: SqlDatabase;
  workspaceId: string;
}

class AdminOpsBusinessError extends Error {
  constructor(readonly code: Exclude<AdminOpsError, "ops_forbidden">) {
    super(code);
  }
}

export function createAdminOpsService(deps: AdminOpsServiceDeps) {
  async function resolveOpsActor(input: {
    user: AuthenticatedAdminOpsUser;
    now: Date;
  }) {
    return resolveActorContext(deps.db, {
      sessionToken: input.user.sessionToken,
      workspaceId: deps.workspaceId,
      capability: capabilities.opsSettle,
      now: input.now,
    });
  }

  return {
    async listItems(input: {
      user: AuthenticatedAdminOpsUser;
      now: Date;
    }): Promise<
      AdminOpsResponse<
        | {
            tasks: AdminTaskView[];
            paymentRisks: AdminPaymentRiskView[];
            paymentIssues: AdminPaymentIssueView[];
          }
        | { error: AdminOpsError }
      >
    > {
      try {
        const actor = await resolveOpsActor(input);
        const result = await deps.db.query<AdminTaskRow>(
          `
            SELECT
              t.id,
              t.organization_id,
              t.workspace_id,
              t.project_id,
              t.workflow_id,
              t.task_type,
              t.status,
              t.queue_name,
              t.attempt_count,
              t.max_attempts,
              t.failure_code,
              t.updated_at,
              pr.status AS provider_status,
              pr.provider_name,
              pr.provider_operation,
              pr.external_request_id
            FROM tasks t
            LEFT JOIN LATERAL (
              SELECT *
              FROM provider_requests pr
              WHERE pr.organization_id = t.organization_id
                AND pr.task_id = t.id
              ORDER BY pr.updated_at DESC, pr.id DESC
              LIMIT 1
            ) pr ON true
            WHERE t.organization_id = $1
              AND t.workspace_id = $2
              AND t.status IN (
                'result_unknown',
                'manual_review_required',
                'failed',
                'canceled'
              )
            ORDER BY t.updated_at DESC, t.id ASC
            LIMIT 50
          `,
          [actor.organizationId, deps.workspaceId],
        );
        const paymentRisks = await listPaymentRisksForOps(deps.db, {
          organizationId: actor.organizationId,
        });
        const paymentIssues = await listPaymentIssuesForOps(deps.db, {
          organizationId: actor.organizationId,
        });

        return {
          status: 200,
          body: {
            tasks: result.rows.map(taskViewFromRow),
            paymentRisks,
            paymentIssues,
          },
        };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async manualSettleTask(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        decision: "consume" | "release" | "mark_abnormal_cost";
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: manualSettleUnknownTaskCommand.operationName,
          capability: manualSettleUnknownTaskCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveActorContext(db, {
              sessionToken: input.user.sessionToken,
              workspaceId: deps.workspaceId,
              capability: manualSettleUnknownTaskCommand.capability,
              now: input.now,
            }),
          replay: async ({ actor, idempotencyRecord }) => {
            const task = await getTaskForOps(deps.db, {
              organizationId: actor.organizationId,
              workspaceId: deps.workspaceId,
              taskId: idempotencyRecord.responseResourceId,
            });
            if (!task) {
              throw new Error("ops_manual_settle_replay_missing_task");
            }
            return { task };
          },
          execute: async ({ actor }) => {
            const task = await getTaskForOps(deps.db, {
              organizationId: actor.organizationId,
              workspaceId: deps.workspaceId,
              taskId: input.body.taskId,
            });
            if (!task) {
              throw new AdminOpsBusinessError("task_not_found");
            }

            const providerRequest = await getLatestProviderRequestForTask(deps.db, {
              organizationId: actor.organizationId,
              workspaceId: deps.workspaceId,
              taskId: task.id,
            });
            const reservation = await getActiveReservationForTask(deps.db, {
              organizationId: actor.organizationId,
              taskId: task.id,
            });
            const finalStatus =
              input.body.decision === "mark_abnormal_cost"
                ? "manual_review_required"
                : "succeeded";
            const updatedTask = await queryOne<{ id: string }>(
              deps.db,
              `
                UPDATE tasks
                SET status = $4,
                    failure_code = NULL,
                    locked_by = NULL,
                    locked_until = NULL,
                    heartbeat_at = NULL,
                    updated_at = $5
                WHERE organization_id = $1
                  AND workspace_id = $2
                  AND id = $3
                  AND status IN ('result_unknown', 'manual_review_required')
                RETURNING id
              `,
              [
                actor.organizationId,
                deps.workspaceId,
                task.id,
                finalStatus,
                input.now,
              ],
            );
            if (!updatedTask) {
              throw new AdminOpsBusinessError("task_not_settleable");
            }

            if (reservation && reservation.amount_reserved > 0) {
              await settleReservationAllocationInTransaction(deps.db, {
                reservationId: reservation.id,
                allocationKey: `${task.id}:manual-settlement`,
                amount: reservation.amount_reserved,
                outcome: settlementOutcomeForDecision(input.body.decision),
                taskId: task.id,
                attemptId: providerRequest?.attempt_id ?? null,
                providerRequestId: providerRequest?.id ?? null,
                metadata: {
                  decision: input.body.decision,
                  reason,
                },
                now: input.now,
              });
            }

            await deps.db.query(
              `
                UPDATE task_attempts
                SET status = $4,
                    failure_code = NULL,
                    finished_at = COALESCE(finished_at, $5),
                    updated_at = $5
                WHERE organization_id = $1
                  AND workspace_id = $2
                  AND task_id = $3
                  AND status IN ('result_unknown', 'manual_review_required')
              `,
              [
                actor.organizationId,
                deps.workspaceId,
                task.id,
                finalStatus,
                input.now,
              ],
            );
            await deps.db.query(
              `
                UPDATE provider_requests
                SET status = $4,
                    failure_code = NULL,
                    updated_at = $5
                WHERE organization_id = $1
                  AND workspace_id = $2
                  AND task_id = $3
                  AND status IN ('result_unknown', 'manual_review_required')
              `,
              [
                actor.organizationId,
                deps.workspaceId,
                task.id,
                finalStatus,
                input.now,
              ],
            );
            if (task.workflowId) {
              await aggregateWorkflowStatus(deps.db, task.workflowId);
            }

            const updated = await getTaskForOps(deps.db, {
              organizationId: actor.organizationId,
              workspaceId: deps.workspaceId,
              taskId: input.body.taskId,
            });
            if (!updated) {
              throw new Error("ops_manual_settle_missing_updated_task");
            }

            return {
              result: { task: updated },
              responseResourceType: "task",
              responseResourceId: updated.id,
              responseSnapshot: { task: updated },
              audit: {
                eventType: manualSettleUnknownTaskCommand.auditEvent,
                targetType: "task",
                targetId: updated.id,
                workspaceId: deps.workspaceId,
                projectId: updated.projectId,
                reason,
                sensitive: true,
                metadata: {
                  decision: input.body.decision,
                  previousStatus: task.status,
                  taskType: task.taskType,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async retryTask(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: adminRetryTaskCommand.operationName,
          capability: adminRetryTaskCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveActorContext(db, {
              sessionToken: input.user.sessionToken,
              workspaceId: deps.workspaceId,
              capability: adminRetryTaskCommand.capability,
              now: input.now,
            }),
          replay: async ({ actor, idempotencyRecord }) => {
            const task = await getTaskForOps(deps.db, {
              organizationId: actor.organizationId,
              workspaceId: deps.workspaceId,
              taskId: idempotencyRecord.responseResourceId,
            });
            if (!task) {
              throw new Error("ops_retry_replay_missing_task");
            }
            return { task };
          },
          execute: async ({ actor }) => {
            const task = await getTaskForOps(deps.db, {
              organizationId: actor.organizationId,
              workspaceId: deps.workspaceId,
              taskId: input.body.taskId,
            });
            if (!task) {
              throw new AdminOpsBusinessError("task_not_found");
            }

            const updatedTask = await queryOne<{ id: string }>(
              deps.db,
              `
                UPDATE tasks
                SET status = 'queued',
                    failure_code = NULL,
                    locked_by = NULL,
                    locked_until = NULL,
                    heartbeat_at = NULL,
                    scheduled_at = $4,
                    updated_at = $4
                WHERE organization_id = $1
                  AND workspace_id = $2
                  AND id = $3
                  AND status IN ('failed', 'canceled')
                  AND attempt_count < max_attempts
                RETURNING id
              `,
              [actor.organizationId, deps.workspaceId, task.id, input.now],
            );
            if (!updatedTask) {
              throw new AdminOpsBusinessError("task_not_retryable");
            }

            await deps.db.query(
              `
                UPDATE workflows
                SET status = 'queued',
                    failure_code = NULL,
                    finished_at = NULL,
                    updated_at = $3
                WHERE organization_id = $1
                  AND id = $2
              `,
              [actor.organizationId, task.workflowId, input.now],
            );

            const updated = await getTaskForOps(deps.db, {
              organizationId: actor.organizationId,
              workspaceId: deps.workspaceId,
              taskId: input.body.taskId,
            });
            if (!updated) {
              throw new Error("ops_retry_missing_updated_task");
            }

            return {
              result: { task: updated },
              responseResourceType: "task",
              responseResourceId: updated.id,
              responseSnapshot: { task: updated },
              audit: {
                eventType: adminRetryTaskCommand.auditEvent,
                targetType: "task",
                targetId: updated.id,
                workspaceId: deps.workspaceId,
                projectId: updated.projectId,
                reason,
                sensitive: true,
                metadata: {
                  previousStatus: task.status,
                  taskType: task.taskType,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async markPaymentRiskReviewed(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        riskEventId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ risk: AdminPaymentRiskView } | { error: AdminOpsError }>
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: markPaymentRiskReviewedCommand.operationName,
          capability: markPaymentRiskReviewedCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveActorContext(db, {
              sessionToken: input.user.sessionToken,
              workspaceId: deps.workspaceId,
              capability: markPaymentRiskReviewedCommand.capability,
              now: input.now,
            }),
          replay: async ({ actor, idempotencyRecord }) => {
            const risk = await getPaymentRiskForOps(deps.db, {
              organizationId: actor.organizationId,
              riskEventId: idempotencyRecord.responseResourceId,
            });
            if (!risk) {
              throw new Error("ops_payment_risk_replay_missing_risk");
            }
            return { risk };
          },
          execute: async ({ actor }) => {
            const risk = await getPaymentRiskForOps(deps.db, {
              organizationId: actor.organizationId,
              riskEventId: input.body.riskEventId,
            });
            if (!risk) {
              throw new AdminOpsBusinessError("payment_risk_not_found");
            }

            const reviewed = await queryOne<AdminPaymentRiskRow>(
              deps.db,
              `
                UPDATE payment_risk_events
                SET status = 'reviewed',
                    reviewed_by_user_id = $3,
                    reviewed_at = $4,
                    review_reason = $5,
                    updated_at = $4
                WHERE organization_id = $1
                  AND id = $2
                  AND status = 'open'
                RETURNING *
              `,
              [
                actor.organizationId,
                input.body.riskEventId,
                actor.actorId,
                input.now,
                reason,
              ],
            );
            if (!reviewed) {
              throw new AdminOpsBusinessError("payment_risk_not_reviewable");
            }

            const riskView = paymentRiskViewFromRow(reviewed);
            return {
              result: { risk: riskView },
              responseResourceType: "payment_risk_event",
              responseResourceId: reviewed.id,
              responseSnapshot: { risk: riskView },
              audit: {
                eventType: markPaymentRiskReviewedCommand.auditEvent,
                targetType: "payment_risk_event",
                targetId: reviewed.id,
                workspaceId: deps.workspaceId,
                reason,
                sensitive: true,
                metadata: {
                  riskType: reviewed.risk_type,
                  previousStatus: risk.status,
                  orderId: reviewed.order_id,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async repairPaidWithoutCredit(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        orderId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<
        | {
            issue: AdminPaymentIssueView;
            creditGrant: { id: string; amount: number };
          }
        | { error: AdminOpsError }
      >
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: repairPaidWithoutCreditCommand.operationName,
          capability: repairPaidWithoutCreditCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveActorContext(db, {
              sessionToken: input.user.sessionToken,
              workspaceId: deps.workspaceId,
              capability: repairPaidWithoutCreditCommand.capability,
              now: input.now,
            }),
          replay: async ({ idempotencyRecord }) => {
            if (!idempotencyRecord.responseSnapshot) {
              throw new Error("ops_repair_replay_missing_snapshot");
            }
            return idempotencyRecord.responseSnapshot as {
              issue: AdminPaymentIssueView;
              creditGrant: { id: string; amount: number };
            };
          },
          execute: async ({ actor }) => {
            const order = await getBillingOrderForOps(deps.db, {
              organizationId: actor.organizationId,
              orderId: input.body.orderId,
            });
            if (!order) {
              throw new AdminOpsBusinessError("payment_issue_not_found");
            }
            if (order.status !== "paid" || order.credit_grant_ledger_entry_id) {
              throw new AdminOpsBusinessError("payment_issue_not_repairable");
            }

            const creditGrant = await grantCreditsInTransaction(deps.db, {
              organizationId: order.organization_id,
              amount: order.credits,
              sourceType: "payment_order",
              sourceId: order.id,
              reason,
              createdByUserId: actor.actorId,
              metadata: {
                orderNo: order.order_no,
                paymentIntentId: order.successful_payment_intent_id,
              },
              now: input.now,
            });

            const updatedOrder = await queryOne<AdminBillingOrderRow>(
              deps.db,
              `
                UPDATE billing_orders
                SET credit_grant_ledger_entry_id = $3,
                    updated_at = $4
                WHERE organization_id = $1
                  AND id = $2
                  AND status = 'paid'
                  AND credit_grant_ledger_entry_id IS NULL
                RETURNING *
              `,
              [actor.organizationId, order.id, creditGrant.id, input.now],
            );
            if (!updatedOrder) {
              throw new AdminOpsBusinessError("payment_issue_not_repairable");
            }

            const result = {
              issue: paymentIssueViewFromOrder(
                updatedOrder,
                "resolved",
              ),
              creditGrant: {
                id: creditGrant.id,
                amount: creditGrant.amount,
              },
            };

            return {
              result,
              responseResourceType: "credit_ledger_entry",
              responseResourceId: creditGrant.id,
              responseSnapshot: result,
              audit: {
                eventType: repairPaidWithoutCreditCommand.auditEvent,
                targetType: "billing_order",
                targetId: order.id,
                workspaceId: deps.workspaceId,
                reason,
                sensitive: true,
                metadata: {
                  orderNo: order.order_no,
                  creditGrantLedgerEntryId: creditGrant.id,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },
  };
}

async function getTaskForOps(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    taskId: string;
  },
): Promise<AdminTaskView | undefined> {
  const row = await queryOne<AdminTaskRow>(
    db,
    `
      SELECT
        t.id,
        t.organization_id,
        t.workspace_id,
        t.project_id,
        t.workflow_id,
        t.task_type,
        t.status,
        t.queue_name,
        t.attempt_count,
        t.max_attempts,
        t.failure_code,
        t.updated_at,
        pr.status AS provider_status,
        pr.provider_name,
        pr.provider_operation,
        pr.external_request_id
      FROM tasks t
      LEFT JOIN LATERAL (
        SELECT *
        FROM provider_requests pr
        WHERE pr.organization_id = t.organization_id
          AND pr.task_id = t.id
        ORDER BY pr.updated_at DESC, pr.id DESC
        LIMIT 1
      ) pr ON true
      WHERE t.organization_id = $1
        AND t.workspace_id = $2
        AND t.id = $3
      LIMIT 1
    `,
    [input.organizationId, input.workspaceId, input.taskId],
  );

  return row ? taskViewFromRow(row) : undefined;
}

async function getLatestProviderRequestForTask(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string;
    taskId: string;
  },
) {
  return queryOne<{ id: string; attempt_id: string | null }>(
    db,
    `
      SELECT id, attempt_id
      FROM provider_requests
      WHERE organization_id = $1
        AND workspace_id = $2
        AND task_id = $3
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [input.organizationId, input.workspaceId, input.taskId],
  );
}

async function getActiveReservationForTask(
  db: SqlDatabase,
  input: {
    organizationId: string;
    taskId: string;
  },
) {
  return queryOne<{ id: string; amount_reserved: number }>(
    db,
    `
      SELECT id, amount_reserved
      FROM credit_reservations
      WHERE organization_id = $1
        AND task_id = $2
        AND status IN ('active', 'partially_settled')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.organizationId, input.taskId],
  );
}

function settlementOutcomeForDecision(
  decision: "consume" | "release" | "mark_abnormal_cost",
): CreditAllocationOutcome {
  if (decision === "consume") {
    return "consumed";
  }
  if (decision === "release") {
    return "released";
  }
  return "manual_review_required";
}

function taskViewFromRow(row: AdminTaskRow): AdminTaskView {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    projectId: row.project_id,
    taskType: row.task_type,
    status: row.status,
    queueName: row.queue_name,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    failureCode: row.failure_code,
    updatedAt: new Date(row.updated_at).toISOString(),
    providerStatus: row.provider_status,
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    externalRequestId: row.external_request_id,
  };
}

async function listPaymentRisksForOps(
  db: SqlDatabase,
  input: { organizationId: string },
): Promise<AdminPaymentRiskView[]> {
  const result = await db.query<AdminPaymentRiskRow>(
    `
      SELECT *
      FROM payment_risk_events
      WHERE organization_id = $1
        AND status = 'open'
      ORDER BY created_at DESC, id ASC
      LIMIT 50
    `,
    [input.organizationId],
  );

  return result.rows.map(paymentRiskViewFromRow);
}

async function listPaymentIssuesForOps(
  db: SqlDatabase,
  input: { organizationId: string },
): Promise<AdminPaymentIssueView[]> {
  const result = await db.query<AdminPaymentIssueRow>(
    `
      SELECT
        bo.id AS order_id,
        bo.order_no,
        bo.status,
        bo.credits,
        bo.amount_minor,
        bo.currency,
        bo.paid_at,
        bo.successful_payment_intent_id,
        bo.credit_grant_ledger_entry_id
      FROM billing_orders bo
      LEFT JOIN credit_ledger_entries cle
        ON cle.organization_id = bo.organization_id
       AND cle.source_type = 'payment_order'
       AND cle.source_id = bo.id
       AND cle.entry_type = 'grant'
      WHERE bo.organization_id = $1
        AND bo.status = 'paid'
        AND bo.credit_grant_ledger_entry_id IS NULL
        AND cle.id IS NULL
      ORDER BY bo.paid_at DESC NULLS LAST, bo.updated_at DESC
      LIMIT 50
    `,
    [input.organizationId],
  );

  return result.rows.map(paymentIssueViewFromRow);
}

async function getPaymentRiskForOps(
  db: SqlDatabase,
  input: { organizationId: string; riskEventId: string },
) {
  const row = await queryOne<AdminPaymentRiskRow>(
    db,
    `
      SELECT *
      FROM payment_risk_events
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
    `,
    [input.organizationId, input.riskEventId],
  );

  return row ? paymentRiskViewFromRow(row) : undefined;
}

async function getBillingOrderForOps(
  db: SqlDatabase,
  input: { organizationId: string; orderId: string },
) {
  return queryOne<AdminBillingOrderRow>(
    db,
    `
      SELECT *
      FROM billing_orders
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
    `,
    [input.organizationId, input.orderId],
  );
}

async function getPaymentIssueForOps(
  db: SqlDatabase,
  input: { organizationId: string; orderId: string },
) {
  const row = await queryOne<AdminPaymentIssueRow>(
    db,
    `
      SELECT
        bo.id AS order_id,
        bo.order_no,
        bo.status,
        bo.credits,
        bo.amount_minor,
        bo.currency,
        bo.paid_at,
        bo.successful_payment_intent_id,
        bo.credit_grant_ledger_entry_id
      FROM billing_orders bo
      WHERE bo.organization_id = $1
        AND bo.id = $2
      LIMIT 1
    `,
    [input.organizationId, input.orderId],
  );

  if (!row) {
    return undefined;
  }

  return paymentIssueViewFromRow({
    ...row,
    status: row.credit_grant_ledger_entry_id ? "resolved" : row.status,
  });
}

function paymentRiskViewFromRow(row: AdminPaymentRiskRow): AdminPaymentRiskView {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentIntentId: row.payment_intent_id,
    providerEventId: row.provider_event_id,
    riskType: row.risk_type,
    severity: row.severity,
    decision: row.decision,
    status: row.status,
    metadata: normalizeJson(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function paymentIssueViewFromRow(row: AdminPaymentIssueRow): AdminPaymentIssueView {
  return {
    issueType: "paid_without_credit",
    orderId: row.order_id,
    orderNo: row.order_no,
    status: row.credit_grant_ledger_entry_id ? "resolved" : "open",
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    successfulPaymentIntentId: row.successful_payment_intent_id,
  };
}

function paymentIssueViewFromOrder(
  row: AdminBillingOrderRow,
  status: "open" | "resolved",
): AdminPaymentIssueView {
  return {
    issueType: "paid_without_credit",
    orderId: row.id,
    orderNo: row.order_no,
    status,
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    successfulPaymentIntentId: row.successful_payment_intent_id,
  };
}

function normalizeJson(value: Record<string, unknown> | string | null) {
  if (!value) {
    return {};
  }
  return typeof value === "string" ? JSON.parse(value) : value;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function authErrorResponse(error: unknown): AdminOpsResponse<{ error: AdminOpsError }> {
  if (error instanceof AuthorizationError) {
    return {
      status: error.code === "unauthenticated" ? 401 : 403,
      body: { error: "ops_forbidden" },
    };
  }

  if (error instanceof AdminOpsBusinessError) {
    return {
      status: adminOpsBusinessErrorStatus(error.code),
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

function adminOpsBusinessErrorStatus(error: Exclude<AdminOpsError, "ops_forbidden">) {
  if (
    error === "task_not_found" ||
    error === "payment_risk_not_found" ||
    error === "payment_issue_not_found"
  ) {
    return 404;
  }
  if (error === "reason_required") {
    return 400;
  }
  if (error === "idempotency_processing") {
    return 202;
  }
  return 409;
}

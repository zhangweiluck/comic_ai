import { appendAuditEvent, type AuditEventRecord } from "../audit/audit.service.ts";
import { resolveActorContext } from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import { upsertAssetVersionSnapshot } from "./asset-version-record.service.ts";
import { computeAssetReviewSummary } from "./asset-review.service.ts";
import {
  assetReviewStateFromRecords,
  listAssetReviewCandidatesForProject,
  confirmAllAssetReviewCandidateRecords,
  confirmAssetReviewCandidateRecord,
  listAssetReviewCandidatesForProject,
  replaceAssetReviewCandidatesForProject,
  updateAssetReviewCandidateRecordLabel,
} from "./asset-review-record.service.ts";
import { replaceCalibrationSessionForProject, getLatestCalibrationSessionForProject } from "./calibration-record.service.ts";
import { CreatorDevApp, type CreatorDevStateSnapshot } from "./creator-dev-app.ts";
import { CalibrationRuleError } from "./calibration.service.ts";
import {
  createCreatorExportArtifact,
  requestCreatorImageGenerationPlatformBatch,
  requestCreatorVideoGenerationPlatformBatch,
} from "./creator-platform.service.ts";
import {
  createExportRecord,
  listExportRecordsForProject,
} from "./export-record.service.ts";
import { listShotsForProject, replaceShotsForProject, upsertShotsForProject } from "./shot-record.service.ts";
import {
  createSqlParseScriptCommandHandler,
  createSqlProjectCommandHandler,
} from "./sql-project.command.ts";
import type { ShotRecord } from "./shot.service.ts";

interface AuthenticatedCreatorUser {
  id: string;
  sessionToken: string;
}

interface CreatorSqlState {
  projectId: string | null;
  scriptId: string | null;
}

export interface CreatorHttpResponse<T> {
  status: number;
  body: T;
}

interface CreatorApplicationDeps {
  db: SqlDatabase;
  workspaceId: string;
  creatorApps?: Map<string, CreatorDevApp>;
  creatorSqlStates?: Map<string, CreatorSqlState>;
}

export function createCreatorApplication(deps: CreatorApplicationDeps) {
  const creatorApps = deps.creatorApps ?? new Map<string, CreatorDevApp>();
  const creatorSqlStates = deps.creatorSqlStates ?? new Map<string, CreatorSqlState>();

  function getCreatorState(userId: string) {
    const creatorApp = creatorApps.get(userId) ?? new CreatorDevApp();
    creatorApps.set(userId, creatorApp);

    const sqlState = creatorSqlStates.get(userId) ?? {
      projectId: null,
      scriptId: null,
    };
    creatorSqlStates.set(userId, sqlState);

    return {
      creatorApp,
      sqlState,
    };
  }

  async function ensureSqlState(userId: string, sqlState: CreatorSqlState) {
    if (sqlState.projectId && sqlState.scriptId) {
      return sqlState;
    }

    const project = await deps.db.query<{
      project_id: string;
      script_id: string | null;
    }>(
      `
        SELECT
          p.id AS project_id,
          (
            SELECT s.id
            FROM scripts s
            WHERE s.project_id = p.id
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT 1
          ) AS script_id
        FROM projects p
        WHERE p.workspace_id = $1
          AND p.created_by_user_id = $2
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 1
      `,
      [deps.workspaceId, userId],
    );
    const row = project.rows[0];
    if (row) {
      sqlState.projectId = row.project_id;
      sqlState.scriptId = row.script_id;
    }

    return sqlState;
  }

  return {
    async getState(input: {
      user: AuthenticatedCreatorUser;
    }): Promise<CreatorHttpResponse<CreatorDevStateSnapshot>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const hydrated = sqlState.projectId
        ? await hydrateStateFromSql(deps.db, state, {
            projectId: sqlState.projectId,
            scriptId: sqlState.scriptId,
            sessionToken: input.user.sessionToken,
            now: new Date(),
          })
        : state;
      return {
        status: 200,
        body: hydrated,
      };
    },

    async createProject(input: {
      user: AuthenticatedCreatorUser;
      body: {
        name: string;
        scriptInput: string;
        aspectRatio: string;
        resolution: string;
      };
      now: Date;
      idempotencyKey: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const handleCreateProject = createSqlProjectCommandHandler({ db: deps.db });
      const result = await handleCreateProject({
        auth: { sessionToken: input.user.sessionToken },
        body: {
          workspaceId: deps.workspaceId,
          name: input.body.name,
          scriptInput: input.body.scriptInput,
          aspectRatio: input.body.aspectRatio,
          resolution: input.body.resolution,
        },
        idempotencyKey: input.idempotencyKey,
        now: input.now,
      });

      if (result.status !== 200 || !("project" in result.body)) {
        return result as CreatorHttpResponse<Record<string, unknown>>;
      }

      sqlState.projectId = result.body.project.id;
      sqlState.scriptId = result.body.script.id;
      await creatorApp.createProject(input.body);

      return {
        status: result.status,
        body: {
          ...result.body,
          state: await creatorApp.getState(),
        },
      };
    },

    async parseScript(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
      idempotencyKey: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (!sqlState.projectId || !sqlState.scriptId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const handleParseScript = createSqlParseScriptCommandHandler({ db: deps.db });
      const result = await handleParseScript({
        auth: { sessionToken: input.user.sessionToken },
        body: {
          projectId: sqlState.projectId,
          scriptId: sqlState.scriptId,
        },
        idempotencyKey: input.idempotencyKey,
        now: input.now,
      });

      if (result.status !== 202) {
        return result as CreatorHttpResponse<Record<string, unknown>>;
      }

      const parsed = await creatorApp.parseScript();
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: sqlState.projectId,
        now: input.now,
      });
      const claim = await claimQueuedTask(deps.db, {
        taskId: result.body.taskId,
        workerId: "creator-parse-finalizer",
        now: input.now,
        leaseMs: 60_000,
      });
      if (!claim) {
        throw new Error(`parse_task_claim_failed:${result.body.taskId}`);
      }
      await finalizeTaskAttempt(deps.db, {
        taskId: result.body.taskId,
        attemptId: claim.attempt.id,
        status: "succeeded",
        now: input.now,
        finalize: async () => {
          await replaceAssetReviewCandidatesForProject(deps.db, {
            organizationId: actor.organizationId,
            projectId: sqlState.projectId!,
            now: input.now,
            candidates: parsed.parse.candidateAssets.map((candidate) => ({
              group: candidate.kind,
              assetKey: candidate.id,
              label: candidate.name,
              required: candidate.kind !== "prop",
            })),
          });
          await replaceShotsForProject(deps.db, {
            organizationId: actor.organizationId,
            projectId: sqlState.projectId!,
            createdByUserId: actor.actorId,
            shots: parsed.shots as ShotRecord[],
            now: input.now,
          });
          await deps.db.query(
            `
              UPDATE projects
              SET phase = 'asset_review',
                  updated_at = $2
              WHERE id = $1
            `,
            [sqlState.projectId, input.now],
          );
          await deps.db.query(
            `
              UPDATE scripts
              SET status = 'parsed',
                  updated_at = $2
              WHERE id = $1
            `,
            [sqlState.scriptId, input.now],
          );
        },
      });
      await aggregateWorkflowStatus(deps.db, result.body.workflowId);
      const records = await listAssetReviewCandidatesForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId: sqlState.projectId,
      });
      const assetCandidates = assetReviewStateFromRecords(records);
      return {
        status: result.status,
        body: {
          workflow: result.body,
          ...parsed,
          assetReview: computeAssetReviewSummary(assetCandidates),
          assetCandidates,
        },
      };
    },

    async confirmAllAssets(input: {
      user: AuthenticatedCreatorUser;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (sqlState.projectId) {
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await confirmAllAssetReviewCandidateRecords(deps.db, {
          organizationId: actor.organizationId,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        const assetReview = computeAssetReviewSummary(assetCandidates);
        if (assetReview.readyForGeneration) {
          await updateProjectPhase(deps.db, sqlState.projectId, "shot_generation");
        }
        return {
          status: 200,
          body: {
            assetReview,
            assetCandidates,
          },
        };
      }

      return {
        status: 200,
        body: creatorApp.confirmAllAssets(),
      };
    },

    async confirmAsset(input: {
      user: AuthenticatedCreatorUser;
      body: {
        group: "character" | "scene" | "prop";
        assetKey: string;
      };
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (sqlState.projectId) {
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await confirmAssetReviewCandidateRecord(deps.db, {
          organizationId: actor.organizationId,
          projectId: sqlState.projectId,
          group: input.body.group,
          assetKey: input.body.assetKey,
          now: new Date(),
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        const assetReview = computeAssetReviewSummary(assetCandidates);
        if (assetReview.readyForGeneration) {
          await updateProjectPhase(deps.db, sqlState.projectId, "shot_generation");
        }
        return {
          status: 200,
          body: {
            assetReview,
            assetCandidates,
          },
        };
      }

      return {
        status: 200,
        body: creatorApp.confirmAsset(input.body),
      };
    },

    async updateAssetLabel(input: {
      user: AuthenticatedCreatorUser;
      body: {
        group: "character" | "scene" | "prop";
        assetKey: string;
        label: string;
      };
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (sqlState.projectId) {
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await updateAssetReviewCandidateRecordLabel(deps.db, {
          organizationId: actor.organizationId,
          projectId: sqlState.projectId,
          group: input.body.group,
          assetKey: input.body.assetKey,
          label: input.body.label,
          now: new Date(),
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        return {
          status: 200,
          body: {
            assetReview: computeAssetReviewSummary(assetCandidates),
            assetCandidates,
          },
        };
      }

      return {
        status: 200,
        body: creatorApp.updateAssetLabel(input.body),
      };
    },

    async runCalibration(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const result = await creatorApp.runCalibration();
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const auditEvent = await appendCalibrationAuditEvent(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        calibrationId: result.calibration.id,
        decisionType: result.calibration.decision?.decisionType ?? "passed",
        reason: result.calibration.decision?.reason ?? null,
        shotIds: result.calibration.items.map((item) => item.shotId),
        now: input.now,
      });
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      await replaceCalibrationSessionForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        session: result.calibration,
        now: input.now,
      });

      return {
        status: 200,
        body: {
          ...result,
          auditEvent,
        },
      };
    },

    async skipCalibration(input: {
      user: AuthenticatedCreatorUser;
      body: {
        reason: string;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      try {
        const result = await creatorApp.skipCalibration({
          reason: input.body.reason,
        });
        const state = await creatorApp.getState();
        const projectId = sqlState.projectId ?? state.project?.id ?? null;
        if (!projectId) {
          return {
            status: 409,
            body: { error: "creator_project_missing" },
          };
        }

        const auditEvent = await appendCalibrationAuditEvent(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          calibrationId: result.calibration.id,
          decisionType: "skipped",
          reason: result.calibration.decision?.reason ?? null,
          shotIds: result.calibration.items.map((item) => item.shotId),
          now: input.now,
        });
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
        });
        await replaceCalibrationSessionForProject(deps.db, {
          organizationId: actor.organizationId,
          projectId,
          session: result.calibration,
          now: input.now,
        });

        return {
          status: 200,
          body: {
            ...result,
            auditEvent,
          },
        };
      } catch (error) {
        return calibrationErrorResponse(error);
      }
    },

    async overrideCalibration(input: {
      user: AuthenticatedCreatorUser;
      body: {
        reason?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      try {
        const result = await creatorApp.overrideCalibration({
          reason: input.body.reason ?? null,
        });
        const state = await creatorApp.getState();
        const projectId = sqlState.projectId ?? state.project?.id ?? null;
        if (!projectId) {
          return {
            status: 409,
            body: { error: "creator_project_missing" },
          };
        }

        const auditEvent = await appendCalibrationAuditEvent(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          calibrationId: result.calibration.id,
          decisionType: "override",
          reason: result.calibration.decision?.reason ?? null,
          shotIds: result.calibration.items.map((item) => item.shotId),
          now: input.now,
        });
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
        });
        await replaceCalibrationSessionForProject(deps.db, {
          organizationId: actor.organizationId,
          projectId,
          session: result.calibration,
          now: input.now,
        });

        return {
          status: 200,
          body: {
            ...result,
            auditEvent,
          },
        };
      } catch (error) {
        return calibrationErrorResponse(error);
      }
    },

    async generateImages(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const before = await creatorApp.getState();
      const projectId = sqlState.projectId ?? before.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const platform = await requestCreatorImageGenerationPlatformBatch(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
        shots: before.shots.map((shot) => ({
          id: shot.id,
          title: shot.title,
          contentRevision: shot.contentRevision,
          currentImageAssetVersionId: shot.currentImageAssetVersionId,
        })),
      }, {
        deferFinalization: true,
      });
      const generated = await creatorApp.generateImagesForTasks(
        platform.tasks.map((task) => ({
          shotId: task.shotId,
          taskId: task.taskId,
          storageObjectKey: task.storageObjectKey,
          sourceAttemptId: task.attemptId,
        })),
      );
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const successByTaskId = new Map(
        (generated.successes as Array<{
          shot: ShotRecord;
          asset: Parameters<typeof upsertAssetVersionSnapshot>[1]["asset"];
          version: Parameters<typeof upsertAssetVersionSnapshot>[1]["version"];
        }>).map((success) => [success.version.sourceTaskId, success] as const),
      );
      const shotById = new Map(
        (generated.shots as ShotRecord[]).map((shot) => [shot.id, shot] as const),
      );

      for (const task of platform.tasks) {
        const success = successByTaskId.get(task.taskId);
        const shot = shotById.get(task.shotId);
        if (!shot) {
          throw new Error(`creator_image_shot_missing:${task.shotId}`);
        }

        await finalizeTaskAttempt(deps.db, {
          taskId: task.taskId,
          attemptId: task.attemptId,
          status: success ? "succeeded" : "failed",
          failureCode: success ? null : "generation_failed",
          now: input.now,
          finalize: async () => {
            if (success) {
              await upsertAssetVersionSnapshot(deps.db, {
                asset: success.asset,
                version: success.version,
                now: input.now,
              });
            }
            await upsertShotsForProject(deps.db, {
              organizationId: actor.organizationId,
              projectId,
              createdByUserId: actor.actorId,
              shots: [shot],
              now: input.now,
            });
            await updateProjectPhase(deps.db, projectId, "shot_generation");
          },
        });
      }
      await aggregateWorkflowStatus(deps.db, platform.workflowId);

      return {
        status: 200,
        body: {
          ...generated,
          platform,
        },
      };
    },

    async generateVideos(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const before = await creatorApp.getState();
      const projectId = sqlState.projectId ?? before.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const platform = await requestCreatorVideoGenerationPlatformBatch(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
        shots: before.shots.map((shot) => ({
          id: shot.id,
          title: shot.title,
          contentRevision: shot.contentRevision,
          currentImageAssetVersionId: shot.currentImageAssetVersionId,
        })),
      }, {
        deferFinalization: true,
      });
      const generated = await creatorApp.generateVideosForTasks(
        platform.tasks.map((task) => ({
          shotId: task.shotId,
          taskId: task.taskId,
          storageObjectKey: task.storageObjectKey,
          sourceAttemptId: task.attemptId,
        })),
      );
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const resultByTaskId = new Map(
        (generated.results as Array<{
          shot: ShotRecord;
          asset?: Parameters<typeof upsertAssetVersionSnapshot>[1]["asset"];
          version?: Parameters<typeof upsertAssetVersionSnapshot>[1]["version"];
        }>).map((result) => [result.version?.sourceTaskId ?? `failed:${result.shot.activeVideoTaskId}`, result] as const),
      );
      const shotById = new Map(
        (generated.shots as ShotRecord[]).map((shot) => [shot.id, shot] as const),
      );

      for (const task of platform.tasks) {
        const result =
          resultByTaskId.get(task.taskId) ??
          resultByTaskId.get(`failed:${task.taskId}`);
        const shot = shotById.get(task.shotId);
        if (!result || !shot) {
          throw new Error(`creator_video_result_missing:${task.taskId}`);
        }

        await finalizeTaskAttempt(deps.db, {
          taskId: task.taskId,
          attemptId: task.attemptId,
          status: result.asset && result.version ? "succeeded" : "failed",
          failureCode: result.asset && result.version ? null : "generation_failed",
          now: input.now,
          finalize: async () => {
            if (result.asset && result.version) {
              await upsertAssetVersionSnapshot(deps.db, {
                asset: result.asset,
                version: result.version,
                now: input.now,
              });
            }
            await upsertShotsForProject(deps.db, {
              organizationId: actor.organizationId,
              projectId,
              createdByUserId: actor.actorId,
              shots: [shot],
              now: input.now,
            });
            await updateProjectPhase(deps.db, projectId, "shot_generation");
          },
        });
      }
      await aggregateWorkflowStatus(deps.db, platform.workflowId);

      return {
        status: 200,
        body: {
          ...generated,
          platform,
        },
      };
    },

    async previewExport(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const exportPreview = await creatorApp.previewExport();
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const platform = await createCreatorExportArtifact(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
        manifest: exportPreview.export,
      }, {
        deferFinalization: true,
      });
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      await finalizeTaskAttempt(deps.db, {
        taskId: platform.taskId,
        attemptId: platform.attemptId,
        status: "succeeded",
        now: input.now,
        finalize: async () => {
          await createExportRecord(deps.db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId!,
            projectId,
            workflowId: platform.workflowId,
            storageObjectId: platform.storageObjectId,
            manifestStatus: exportPreview.export.status,
            allowPartialExport: exportPreview.export.allowPartialExport,
            itemCount: exportPreview.export.items.length,
            missingAssetCount: exportPreview.export.missingAssets.length,
            latestSignedUrlExpiresAt: platform.expiresAt,
            createdByUserId: actor.actorId,
            now: input.now,
          });
          await updateProjectPhase(deps.db, projectId, "export");
        },
      });
      await aggregateWorkflowStatus(deps.db, platform.workflowId);
      const exportRecord = (
        await listExportRecordsForProject(deps.db, {
          organizationId: actor.organizationId,
          projectId,
          limit: 1,
        })
      )[0];

      return {
        status: 200,
        body: {
          ...exportPreview,
          exportRecord,
          platform,
        },
      };
    },

    async listExportHistory(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const records = await listExportRecordsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
      });

      return {
        status: 200,
        body: {
          records,
        },
      };
    },
  };
}

async function appendCalibrationAuditEvent(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId: string;
    calibrationId: string;
    decisionType: "passed" | "skipped" | "override";
    reason: string | null;
    shotIds: string[];
    now: Date;
  },
): Promise<AuditEventRecord> {
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    now: input.now,
  });

  return appendAuditEvent(db, {
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    projectId: input.projectId,
    actorUserId: actor.actorId,
    eventType: calibrationDecisionEventType(input.decisionType),
    targetType: "calibration_session",
    targetId: input.calibrationId,
    reason: input.reason,
    sensitive: input.decisionType === "skipped",
    metadata: {
      calibrationSessionId: input.calibrationId,
      decisionType: input.decisionType,
      shotIds: input.shotIds,
    },
    occurredAt: input.now,
  });
}

async function updateProjectPhase(
  db: SqlDatabase,
  projectId: string,
  phase: "shot_generation" | "export",
) {
  await db.query(
    `
      UPDATE projects
      SET phase = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [projectId, phase],
  );
}

function calibrationDecisionEventType(decisionType: string): string {
  if (decisionType === "skipped") {
    return "calibration.skipped";
  }

  if (decisionType === "override") {
    return "calibration.override";
  }

  return "calibration.passed";
}

function calibrationErrorResponse(
  error: unknown,
): CreatorHttpResponse<Record<string, unknown>> {
  if (error instanceof CalibrationRuleError) {
    return {
      status: error.code === "reason_required" ? 400 : 409,
      body: { error: error.code },
    };
  }

  throw error;
}

async function hydrateStateFromSql(
  db: SqlDatabase,
  state: CreatorDevStateSnapshot,
  input: {
    projectId: string;
    scriptId: string | null;
    sessionToken: string;
    now: Date;
  },
): Promise<CreatorDevStateSnapshot> {
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    now: input.now,
  });
  const records = await listAssetReviewCandidatesForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });
  const projectBundle = await loadProjectBundleFromSql(db, {
    projectId: input.projectId,
    scriptId: input.scriptId,
  });
  const shots = await listShotsForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });
  const calibration = await getLatestCalibrationSessionForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });
  const assetCandidates = records.length > 0 ? assetReviewStateFromRecords(records) : state.assetCandidates;
  return {
    ...state,
    project: projectBundle?.project ?? state.project,
    script: projectBundle?.script ?? state.script,
    shots: shots.length > 0
      ? shots.map((shot) => ({
          id: shot.id,
          title: shot.title,
          contentRevision: shot.contentRevision,
          imageStatus: shot.imageStatus,
          videoStatus: shot.videoStatus,
          currentImageAssetVersionId: shot.currentImageAssetVersionId,
          currentVideoAssetVersionId: shot.currentVideoAssetVersionId,
        }))
      : state.shots,
    calibration: calibration ?? state.calibration,
    assetCandidates,
    assetReview: assetCandidates ? computeAssetReviewSummary(assetCandidates) : state.assetReview,
  };
}

async function loadProjectBundleFromSql(
  db: SqlDatabase,
  input: {
    projectId: string;
    scriptId: string | null;
  },
): Promise<{
  project: CreatorDevStateSnapshot["project"];
  script: CreatorDevStateSnapshot["script"];
} | null> {
  const projectResult = await db.query<{
    id: string;
    organization_id: string;
    workspace_id: string;
    name: string;
    aspect_ratio: string;
    resolution: string;
    phase: "script_input" | "asset_review" | "shot_generation" | "export";
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT *
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [input.projectId],
  );
  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }

  const scriptResult = await db.query<{
    id: string;
    organization_id: string;
    project_id: string;
    status: "draft" | "ready" | "parsed" | "failed";
    input_text: string;
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT *
      FROM scripts
      WHERE project_id = $1
        AND ($2::uuid IS NULL OR id = $2::uuid)
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.projectId, input.scriptId],
  );
  const script = scriptResult.rows[0];

  return {
    project: {
      id: project.id,
      organizationId: project.organization_id,
      workspaceId: project.workspace_id,
      name: project.name,
      aspectRatio: project.aspect_ratio,
      resolution: project.resolution,
      phase: project.phase,
      createdByUserId: project.created_by_user_id,
      createdAt: new Date(project.created_at),
      updatedAt: new Date(project.updated_at),
    },
    script: script
      ? {
          id: script.id,
          organizationId: script.organization_id,
          projectId: script.project_id,
          status: script.status,
          inputText: script.input_text,
          createdByUserId: script.created_by_user_id,
          createdAt: new Date(script.created_at),
          updatedAt: new Date(script.updated_at),
        }
      : null,
  };
}

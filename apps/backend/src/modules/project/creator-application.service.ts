import { randomUUID } from "node:crypto";

import { appendAuditEvent, type AuditEventRecord } from "../audit/audit.service.ts";
import { resolveActorContext } from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import { upsertAssetVersionSnapshot } from "./asset-version-record.service.ts";
import type { AssetType } from "./asset.service.ts";
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

  async function writeLibraryAsset(input: {
    user: AuthenticatedCreatorUser;
    body: {
      kind: "character" | "scene" | "prop" | "image" | "video";
      name?: string | null;
      storageObjectKey?: string | null;
      mimeType?: string | null;
      width?: number | null;
      height?: number | null;
      prompt?: string | null;
      model?: string | null;
    };
    now: Date;
    source: "import" | "generated";
  }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
    const { creatorApp, sqlState } = getCreatorState(input.user.id);
    await ensureSqlState(input.user.id, sqlState);
    const state = await creatorApp.getState();
    const projectId = sqlState.projectId ?? state.project?.id ?? null;
    if (!projectId) {
      return { status: 409, body: { error: "creator_project_missing" } };
    }
    const name = input.body.name?.trim();
    if (!name) {
      return {
        status: 400,
        body: { error: "invalid_asset_input", fieldErrors: { name: "name_required" } },
      };
    }
    const actor = await resolveActorContext(deps.db, {
      sessionToken: input.user.sessionToken,
      projectId,
      now: input.now,
    });
    const assetType = assetTypeForKind(input.body.kind);
    const assetKey = `${input.body.kind}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")}-${randomUUID().slice(0, 8)}`;
    const asset = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      projectId,
      assetType,
      assetKey,
      createdByUserId: actor.actorId,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const version = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      assetId: asset.id,
      versionNumber: 1,
      storageObjectKey:
        input.body.storageObjectKey?.trim() ||
        `library/${projectId}/${assetType}/${assetKey}`,
      metadata: {
        mimeType: input.body.mimeType?.trim() || (input.body.kind === "video" ? "video/mp4" : "image/png"),
        width: input.body.width ?? 1024,
        height: input.body.height ?? 1024,
        source: input.source,
        prompt: input.body.prompt ?? null,
        model: input.body.model ?? null,
        label: name,
      },
      sourceTaskId: randomUUID(),
      sourceAttemptId: randomUUID(),
      createdByUserId: actor.actorId,
      createdAt: input.now,
    };
    await upsertAssetVersionSnapshot(deps.db, {
      asset,
      version,
      now: input.now,
    });

    return {
      status: 200,
      body: {
        asset,
        version,
      },
    };
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
      const bundle = await loadProjectBundleFromSql(deps.db, {
        projectId: result.body.project.id,
        scriptId: result.body.script.id,
      });
      await creatorApp.createProject({
        ...input.body,
        seedBundle: bundle ?? undefined,
      });

      return {
        status: result.status,
        body: {
          ...result.body,
          state: await creatorApp.getState(),
        },
      };
    },

    async listProjects(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        workspaceId: deps.workspaceId,
        now: input.now,
      });
      const projects = await listProjectsForWorkspace(deps.db, {
        organizationId: actor.organizationId,
        workspaceId: deps.workspaceId,
      });
      return {
        status: 200,
        body: { projects },
      };
    },

    async updateProject(input: {
      user: AuthenticatedCreatorUser;
      body: {
        projectId?: string | null;
        name?: string | null;
        phase?: "script_input" | "asset_review" | "shot_generation" | "export" | null;
        coverImageUrl?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = input.body.projectId ?? sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const updated = await updateProjectRecord(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        name: input.body.name,
        phase: input.body.phase,
        coverImageUrl: input.body.coverImageUrl,
        now: input.now,
      });
      if (!updated) {
        return { status: 404, body: { error: "project_not_found" } };
      }
      return {
        status: 200,
        body: { project: updated },
      };
    },

    async deleteProject(input: {
      user: AuthenticatedCreatorUser;
      body: { projectId?: string | null };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = input.body.projectId ?? sqlState.projectId;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      await deleteProjectRecord(deps.db, {
        organizationId: actor.organizationId,
        projectId,
      });
      if (sqlState.projectId === projectId) {
        sqlState.projectId = null;
        sqlState.scriptId = null;
      }
      return { status: 200, body: { deleted: true, projectId } };
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

    async listAssetLibrary(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      return {
        status: 200,
        body: {
          assets: await listAssetsForProject(deps.db, {
            organizationId: actor.organizationId,
            projectId,
          }),
        },
      };
    },

    async importAsset(input: {
      user: AuthenticatedCreatorUser;
      body: {
        kind: "character" | "scene" | "prop" | "image" | "video";
        name?: string | null;
        storageObjectKey?: string | null;
        mimeType?: string | null;
        width?: number | null;
        height?: number | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      return writeLibraryAsset({
        user: input.user,
        body: input.body,
        now: input.now,
        source: "import",
      });
    },

    async generateAsset(input: {
      user: AuthenticatedCreatorUser;
      body: {
        kind: "character" | "scene" | "prop" | "image" | "video";
        name?: string | null;
        prompt?: string | null;
        model?: string | null;
        width?: number | null;
        height?: number | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      return writeLibraryAsset({
        user: input.user,
        body: {
          ...input.body,
          storageObjectKey: `library/${input.body.kind}/${randomUUID()}`,
          mimeType: input.body.kind === "video" ? "video/mp4" : "image/png",
        },
        now: input.now,
        source: "generated",
      });
    },

    async listAssetVersions(input: {
      user: AuthenticatedCreatorUser;
      assetId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        workspaceId: deps.workspaceId,
        now: input.now,
      });
      const versions = await listAssetVersions(deps.db, {
        organizationId: actor.organizationId,
        assetId: input.assetId,
      });
      return { status: 200, body: { versions } };
    },

    async createShot(input: {
      user: AuthenticatedCreatorUser;
      body: { title?: string | null };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.createShot(input.body);
      await upsertShotsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        createdByUserId: actor.actorId,
        shots: [result.shot as ShotRecord],
        now: input.now,
      });
      return { status: 200, body: result };
    },

    async updateShot(input: {
      user: AuthenticatedCreatorUser;
      body: { shotId: string; title?: string | null };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.updateShot(input.body);
      await upsertShotsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        createdByUserId: actor.actorId,
        shots: [result.shot as ShotRecord],
        now: input.now,
      });
      return { status: 200, body: result };
    },

    async deleteShot(input: {
      user: AuthenticatedCreatorUser;
      body: { shotId: string };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.deleteShot(input.body);
      await deps.db.query(
        `
          DELETE FROM shots
          WHERE organization_id = $1
            AND project_id = $2
            AND id = $3
        `,
        [actor.organizationId, projectId, input.body.shotId],
      );
      return { status: 200, body: result };
    },

    async reorderShots(input: {
      user: AuthenticatedCreatorUser;
      body: { shotIds: string[] };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.reorderShots(input.body);
      await upsertShotsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        createdByUserId: actor.actorId,
        shots: result.shots as ShotRecord[],
        now: input.now,
      });
      return { status: 200, body: result };
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
      body?: {
        shotId?: string | null;
        promptOverride?: string | null;
        model?: string | null;
        parameters?: Record<string, unknown> | null;
      };
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

      const requestedShots = filterRequestedShots(before.shots, input.body?.shotId);
      const platform = await requestCreatorImageGenerationPlatformBatch(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
        options: {
          shotId: input.body?.shotId ?? null,
          promptOverride: input.body?.promptOverride ?? null,
          model: input.body?.model ?? null,
          parameters: input.body?.parameters ?? null,
        },
        shots: requestedShots.map((shot) => ({
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
          request: input.body ?? {},
        },
      };
    },

    async generateVideos(input: {
      user: AuthenticatedCreatorUser;
      body?: {
        shotId?: string | null;
        motionPrompt?: string | null;
        model?: string | null;
        parameters?: Record<string, unknown> | null;
        audioEnabled?: boolean | null;
        musicEnabled?: boolean | null;
        lipSyncEnabled?: boolean | null;
      };
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

      const requestedShots = filterRequestedShots(before.shots, input.body?.shotId);
      const platform = await requestCreatorVideoGenerationPlatformBatch(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
        options: {
          shotId: input.body?.shotId ?? null,
          motionPrompt: input.body?.motionPrompt ?? null,
          model: input.body?.model ?? null,
          parameters: input.body?.parameters ?? null,
          audioEnabled: input.body?.audioEnabled ?? null,
          musicEnabled: input.body?.musicEnabled ?? null,
          lipSyncEnabled: input.body?.lipSyncEnabled ?? null,
        },
        shots: requestedShots.map((shot) => ({
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
          request: input.body ?? {},
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

async function listProjectsForWorkspace(
  db: SqlDatabase,
  input: { organizationId: string; workspaceId: string },
) {
  const result = await db.query<{
    id: string;
    name: string;
    cover_image_url: string | null;
    aspect_ratio: string;
    resolution: string;
    phase: string;
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT
        id,
        name,
        cover_image_url,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id,
        created_at,
        updated_at
      FROM projects
      WHERE organization_id = $1
        AND workspace_id = $2
      ORDER BY created_at DESC, id DESC
    `,
    [input.organizationId, input.workspaceId],
  );

  return result.rows.map((project) => ({
    id: project.id,
    name: project.name,
    coverImageUrl: project.cover_image_url,
    aspectRatio: project.aspect_ratio,
    resolution: project.resolution,
    phase: project.phase,
    createdByUserId: project.created_by_user_id,
    createdAt: new Date(project.created_at),
    updatedAt: new Date(project.updated_at),
  }));
}

async function updateProjectRecord(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    name?: string | null;
    phase?: "script_input" | "asset_review" | "shot_generation" | "export" | null;
    coverImageUrl?: string | null;
    now: Date;
  },
) {
  const current = (
    await db.query<{
      id: string;
      name: string;
      cover_image_url: string | null;
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
        WHERE organization_id = $1
          AND id = $2
      `,
      [input.organizationId, input.projectId],
    )
  ).rows[0];
  if (!current) {
    return null;
  }

  const name = input.name === undefined ? current.name : input.name?.trim();
  if (!name) {
    throw new Error("project_name_required");
  }
  const row = (
    await db.query<typeof current>(
      `
        UPDATE projects
        SET name = $3,
            phase = $4,
            cover_image_url = $5,
            updated_at = $6
        WHERE organization_id = $1
          AND id = $2
        RETURNING *
      `,
      [
        input.organizationId,
        input.projectId,
        name,
        input.phase ?? current.phase,
        input.coverImageUrl === undefined ? current.cover_image_url : input.coverImageUrl,
        input.now,
      ],
    )
  ).rows[0]!;

  return {
    id: row.id,
    name: row.name,
    coverImageUrl: row.cover_image_url,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    phase: row.phase,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

async function deleteProjectRecord(
  db: SqlDatabase,
  input: { organizationId: string; projectId: string },
) {
  await db.query("DELETE FROM provider_requests WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query(
    `
      DELETE FROM task_attempts
      WHERE task_id IN (
        SELECT id FROM tasks WHERE organization_id = $1 AND project_id = $2
      )
    `,
    [input.organizationId, input.projectId],
  );
  await db.query("DELETE FROM tasks WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM workflows WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM export_records WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM storage_objects WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query(
    `
      DELETE FROM asset_versions
      WHERE organization_id = $1
        AND asset_id IN (
          SELECT id FROM assets WHERE organization_id = $1 AND project_id = $2
        )
    `,
    [input.organizationId, input.projectId],
  );
  await db.query("DELETE FROM assets WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query(
    `
      DELETE FROM calibration_items
      WHERE organization_id = $1
        AND calibration_session_id IN (
          SELECT id FROM calibration_sessions WHERE organization_id = $1 AND project_id = $2
        )
    `,
    [input.organizationId, input.projectId],
  );
  await db.query("DELETE FROM calibration_sessions WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM asset_review_candidates WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM shots WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM scripts WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM audit_events WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM projects WHERE organization_id = $1 AND id = $2", [
    input.organizationId,
    input.projectId,
  ]);
}

async function listAssetsForProject(
  db: SqlDatabase,
  input: { organizationId: string; projectId: string },
) {
  const result = await db.query<{
    id: string;
    asset_type: string;
    asset_key: string;
    created_at: Date | string;
    updated_at: Date | string;
    version_id: string | null;
    version_number: number | string | null;
    storage_object_key: string | null;
    metadata_json: Record<string, unknown> | null;
    version_created_at: Date | string | null;
  }>(
    `
      SELECT
        a.id,
        a.asset_type,
        a.asset_key,
        a.created_at,
        a.updated_at,
        v.id AS version_id,
        v.version_number,
        v.storage_object_key,
        v.metadata_json,
        v.created_at AS version_created_at
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT *
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.organization_id = $1
        AND a.project_id = $2
      ORDER BY a.updated_at DESC, a.id DESC
    `,
    [input.organizationId, input.projectId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    assetType: row.asset_type,
    assetKey: row.asset_key,
    label: row.metadata_json?.label ?? row.asset_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    latestVersion: row.version_id
      ? {
          id: row.version_id,
          versionNumber: Number(row.version_number),
          storageObjectKey: row.storage_object_key,
          metadata: row.metadata_json,
          createdAt: row.version_created_at ? new Date(row.version_created_at) : null,
        }
      : null,
  }));
}

async function listAssetVersions(
  db: SqlDatabase,
  input: { organizationId: string; assetId: string },
) {
  const result = await db.query<{
    id: string;
    version_number: number | string;
    storage_object_key: string;
    metadata_json: Record<string, unknown>;
    source_task_id: string | null;
    source_attempt_id: string | null;
    created_at: Date | string;
  }>(
    `
      SELECT
        id,
        version_number,
        storage_object_key,
        metadata_json,
        source_task_id,
        source_attempt_id,
        created_at
      FROM asset_versions
      WHERE organization_id = $1
        AND asset_id = $2
      ORDER BY version_number DESC
    `,
    [input.organizationId, input.assetId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    versionNumber: Number(row.version_number),
    storageObjectKey: row.storage_object_key,
    metadata: row.metadata_json,
    sourceTaskId: row.source_task_id,
    sourceAttemptId: row.source_attempt_id,
    createdAt: new Date(row.created_at),
  }));
}

function assetTypeForKind(kind: "character" | "scene" | "prop" | "image" | "video"): AssetType {
  if (kind === "character") {
    return "character_sheet";
  }
  if (kind === "scene") {
    return "scene_reference";
  }
  if (kind === "prop") {
    return "prop_reference";
  }
  return kind === "video" ? "shot_video" : "shot_image";
}

function filterRequestedShots(
  shots: CreatorDevStateSnapshot["shots"],
  shotId?: string | null,
) {
  if (!shotId) {
    return shots;
  }
  return shots.filter((shot) => shot.id === shotId);
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

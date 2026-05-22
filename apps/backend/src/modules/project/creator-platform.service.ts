import { createHash } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import { operationNames } from "../../../../../packages/contracts/domain/operation-names.ts";
import { submitProviderRequest } from "../model-gateway/provider-request.service.ts";
import { resolveActorContext } from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  createScopedStorageObject,
  createSignedReadUrl,
} from "../storage/storage.service.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  createWorkflowWithTasks,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import {
  createCreatorPlatformRuntime,
  type CreatorPlatformRuntime,
} from "./creator-platform.config.ts";
import { createExportRecord, type ExportRecord } from "./export-record.service.ts";

interface CreatorShotPlatformInput {
  id: string;
  title: string;
  contentRevision: number;
  currentImageAssetVersionId: string | null;
}

interface CreatorTaskPlatformRecord {
  shotId: string;
  taskId: string;
  attemptId: string;
  providerRequestId: string;
  storageObjectId: string;
  storageObjectKey: string;
}

interface ExportPlatformRecord {
  workflowId: string;
  taskId: string;
  attemptId: string;
  storageObjectId: string;
  storageObjectKey: string;
  signedUrl: string;
  expiresAt: Date;
  workflowStatus: string;
  exportRecord?: ExportRecord;
}

export async function requestCreatorImageGenerationPlatformBatch(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId: string;
    shots: CreatorShotPlatformInput[];
    now: Date;
    options?: Record<string, unknown>;
  },
  options: {
    runtime?: CreatorPlatformRuntime;
    deferFinalization?: boolean;
  } = {},
): Promise<{
  workflowId: string;
  workflowStatus: string;
  tasks: CreatorTaskPlatformRecord[];
}> {
  const runtime =
    options.runtime ?? createCreatorPlatformRuntime(process.env, { generationKind: "image" });
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    capability: capabilities.generationStart,
    now: input.now,
  });

  if (!actor.workspaceId) {
    throw new Error("workspace_scope_required");
  }

  const workflow = await createWorkflowWithTasks(db, {
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    projectId: input.projectId,
    workflowType: operationNames.shotImageGenerate,
    inputSnapshot: {
      shotIds: input.shots.map((shot) => shot.id),
      requestedAt: input.now.toISOString(),
      options: input.options ?? {},
    },
    createdByUserId: actor.actorId,
    tasks: input.shots.map((shot) => ({
      taskType: "generate_shot_image",
      queueName: "shot-generation",
      targetEntityType: "shot",
      targetEntityId: shot.id,
      inputSnapshot: {
        shotId: shot.id,
        title: shot.title,
        contentRevision: shot.contentRevision,
      },
    })),
  });

  const tasks: CreatorTaskPlatformRecord[] = [];
  for (let index = 0; index < workflow.tasks.length; index += 1) {
    const task = workflow.tasks[index]!;
    const shot = input.shots[index]!;
    const claim = await claimQueuedTask(db, {
      taskId: task.id,
      workerId: runtime.imageWorkerId,
      now: input.now,
      leaseMs: 60_000,
    });

    if (!claim) {
      throw new Error("task_claim_failed");
    }

    const payloadRef = `${runtime.payloadRefScheme}://projects/${input.projectId}/shots/${shot.id}/image`;
    const payloadHash = sha256(`${payloadRef}:${shot.contentRevision}`);
    const providerRequest = await submitProviderRequest(db, {
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      projectId: input.projectId,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      attemptId: claim.attempt.id,
      providerName: runtime.providerName,
      providerOperation: operationNames.shotImageGenerate,
      requestKey: `${workflow.workflow.id}:${task.id}`,
      requestHash: sha256(`${shot.id}:${shot.contentRevision}`),
      payloadRef,
      payloadHash,
      redactedPayload: {
        shotId: shot.id,
        title: shot.title,
        contentRevision: shot.contentRevision,
        options: input.options ?? {},
      },
      createdByUserId: actor.actorId,
      now: input.now,
      adapter: runtime.providerAdapter,
    });

    const storageObject = await createScopedStorageObject(db, {
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      projectId: input.projectId,
      bucket: runtime.storageBucket,
      objectName: `shots/${shot.id}/image-${task.id}.png`,
      contentType: "image/png",
      metadata: {
        shotId: shot.id,
        taskId: task.id,
        workflowId: workflow.workflow.id,
      },
      createdByUserId: actor.actorId,
      now: input.now,
    });

    if (!options.deferFinalization) {
      await finalizeTaskAttempt(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        status: "succeeded",
        now: input.now,
      });
    }

    tasks.push({
      shotId: shot.id,
      taskId: task.id,
      attemptId: claim.attempt.id,
      providerRequestId: providerRequest.request.id,
      storageObjectId: storageObject.id,
      storageObjectKey: storageObject.objectKey,
    });
  }

  const workflowStatus = await aggregateWorkflowStatus(db, workflow.workflow.id);
  return {
    workflowId: workflow.workflow.id,
    workflowStatus,
    tasks,
  };
}

export async function requestCreatorVideoGenerationPlatformBatch(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId: string;
    shots: CreatorShotPlatformInput[];
    now: Date;
    options?: Record<string, unknown>;
  },
  options: {
    runtime?: CreatorPlatformRuntime;
    deferFinalization?: boolean;
  } = {},
): Promise<{
  workflowId: string;
  workflowStatus: string;
  tasks: CreatorTaskPlatformRecord[];
}> {
  const runtime =
    options.runtime ?? createCreatorPlatformRuntime(process.env, { generationKind: "video" });
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    capability: capabilities.generationStart,
    now: input.now,
  });

  if (!actor.workspaceId) {
    throw new Error("workspace_scope_required");
  }

  const readyShots = input.shots.filter((shot) => shot.currentImageAssetVersionId);
  const workflow = await createWorkflowWithTasks(db, {
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    projectId: input.projectId,
    workflowType: operationNames.shotVideoGenerate,
    inputSnapshot: {
      shotIds: readyShots.map((shot) => shot.id),
      requestedAt: input.now.toISOString(),
      options: input.options ?? {},
    },
    createdByUserId: actor.actorId,
    tasks: readyShots.map((shot) => ({
      taskType: "generate_shot_video",
      queueName: "shot-generation",
      targetEntityType: "shot",
      targetEntityId: shot.id,
      inputSnapshot: {
        shotId: shot.id,
        imageAssetVersionId: shot.currentImageAssetVersionId,
      },
    })),
  });

  const tasks: CreatorTaskPlatformRecord[] = [];
  for (let index = 0; index < workflow.tasks.length; index += 1) {
    const task = workflow.tasks[index]!;
    const shot = readyShots[index]!;
    const claim = await claimQueuedTask(db, {
      taskId: task.id,
      workerId: runtime.videoWorkerId,
      now: input.now,
      leaseMs: 60_000,
    });

    if (!claim) {
      throw new Error("task_claim_failed");
    }

    const payloadRef = `${runtime.payloadRefScheme}://projects/${input.projectId}/shots/${shot.id}/video`;
    const payloadHash = sha256(`${payloadRef}:${shot.currentImageAssetVersionId}`);
    const providerRequest = await submitProviderRequest(db, {
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      projectId: input.projectId,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      attemptId: claim.attempt.id,
      providerName: runtime.providerName,
      providerOperation: operationNames.shotVideoGenerate,
      requestKey: `${workflow.workflow.id}:${task.id}`,
      requestHash: sha256(`${shot.id}:${shot.currentImageAssetVersionId}`),
      payloadRef,
      payloadHash,
      redactedPayload: {
        shotId: shot.id,
        imageAssetVersionId: shot.currentImageAssetVersionId,
        options: input.options ?? {},
      },
      createdByUserId: actor.actorId,
      now: input.now,
      adapter: runtime.providerAdapter,
    });

    const storageObject = await createScopedStorageObject(db, {
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      projectId: input.projectId,
      bucket: runtime.storageBucket,
      objectName: `shots/${shot.id}/video-${task.id}.mp4`,
      contentType: "video/mp4",
      metadata: {
        shotId: shot.id,
        taskId: task.id,
        workflowId: workflow.workflow.id,
      },
      createdByUserId: actor.actorId,
      now: input.now,
    });

    if (!options.deferFinalization) {
      await finalizeTaskAttempt(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        status: "succeeded",
        now: input.now,
      });
    }

    tasks.push({
      shotId: shot.id,
      taskId: task.id,
      attemptId: claim.attempt.id,
      providerRequestId: providerRequest.request.id,
      storageObjectId: storageObject.id,
      storageObjectKey: storageObject.objectKey,
    });
  }

  const workflowStatus = await aggregateWorkflowStatus(db, workflow.workflow.id);
  return {
    workflowId: workflow.workflow.id,
    workflowStatus,
    tasks,
  };
}

export async function createCreatorExportArtifact(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId: string;
    manifest: {
      status: string;
      allowPartialExport: boolean;
      items: Array<{ shotId: string; title: string; imageAssetVersionId: string }>;
      missingAssets: Array<{ shotId: string; title: string; missing: string }>;
    };
    now: Date;
  },
  options: {
    runtime?: CreatorPlatformRuntime;
    deferFinalization?: boolean;
  } = {},
): Promise<ExportPlatformRecord> {
  const runtime =
    options.runtime ?? createCreatorPlatformRuntime(process.env, { generationKind: "export" });
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    capability: capabilities.exportCreate,
    now: input.now,
  });

  if (!actor.workspaceId) {
    throw new Error("workspace_scope_required");
  }

  const workflow = await createWorkflowWithTasks(db, {
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    projectId: input.projectId,
    workflowType: operationNames.exportCreate,
    inputSnapshot: {
      itemCount: input.manifest.items.length,
      missingAssetCount: input.manifest.missingAssets.length,
      allowPartialExport: input.manifest.allowPartialExport,
    },
    createdByUserId: actor.actorId,
    tasks: [
      {
        taskType: "create_export",
        queueName: "export-generation",
        targetEntityType: "project",
        targetEntityId: input.projectId,
        inputSnapshot: {
          projectId: input.projectId,
          manifestStatus: input.manifest.status,
        },
      },
    ],
  });

  const task = workflow.tasks[0]!;
  const claim = await claimQueuedTask(db, {
    taskId: task.id,
    workerId: runtime.exportWorkerId,
    now: input.now,
    leaseMs: 60_000,
  });

  if (!claim) {
    throw new Error("task_claim_failed");
  }

  const storageObject = await createScopedStorageObject(db, {
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    projectId: input.projectId,
    bucket: runtime.storageBucket,
    objectName: `exports/${input.projectId}/manifest-${task.id}.json`,
    contentType: "application/json",
    metadata: {
      workflowId: workflow.workflow.id,
      taskId: task.id,
      itemCount: input.manifest.items.length,
      missingAssetCount: input.manifest.missingAssets.length,
    },
    createdByUserId: actor.actorId,
    now: input.now,
  });

  if (!options.deferFinalization) {
    await finalizeTaskAttempt(db, {
      taskId: task.id,
      attemptId: claim.attempt.id,
      status: "succeeded",
      now: input.now,
    });
  }

  const workflowStatus = await aggregateWorkflowStatus(db, workflow.workflow.id);
  const signed = await createSignedReadUrl(db, {
    sessionToken: input.sessionToken,
    storageObjectId: storageObject.id,
    adapter: runtime.storageAdapter,
    now: input.now,
    expiresInSeconds: runtime.signedUrlExpiresInSeconds,
  });
  const exportRecord = options.deferFinalization
    ? undefined
    : await createExportRecord(db, {
        organizationId: actor.organizationId,
        workspaceId: actor.workspaceId,
        projectId: input.projectId,
        workflowId: workflow.workflow.id,
        storageObjectId: storageObject.id,
        manifestStatus: input.manifest.status,
        allowPartialExport: input.manifest.allowPartialExport,
        itemCount: input.manifest.items.length,
        missingAssetCount: input.manifest.missingAssets.length,
        latestSignedUrlExpiresAt: signed.expiresAt,
        createdByUserId: actor.actorId,
        now: input.now,
      });

  return {
    workflowId: workflow.workflow.id,
    taskId: task.id,
    attemptId: claim.attempt.id,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.objectKey,
    signedUrl: signed.url,
    expiresAt: signed.expiresAt,
    workflowStatus,
    exportRecord,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

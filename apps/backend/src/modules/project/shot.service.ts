import { randomUUID } from "node:crypto";

export interface ShotRecord {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  sortOrder: number;
  contentRevision: number;
  contentStatus: "draft" | "ready" | "stale";
  imageStatus: "draft" | "ready" | "generating" | "completed" | "failed" | "stale";
  videoStatus: "not_ready" | "ready" | "generating" | "completed" | "failed" | "stale";
  currentImageAssetVersionId: string | null;
  currentVideoAssetVersionId: string | null;
  activeImageTaskId: string | null;
  activeImageRevision: number | null;
  activeVideoTaskId: string | null;
  activeVideoImageAssetVersionId: string | null;
  completedImageAssetVersionIds: string[];
  completedVideoAssetVersionIds: string[];
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class InMemoryShotStore {
  private readonly shotsById = new Map<string, ShotRecord>();

  async createShot(input: {
    organizationId: string;
    projectId: string;
    title: string;
    createdByUserId: string;
  }): Promise<ShotRecord> {
    const now = new Date();
    const shot: ShotRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      title: input.title,
      sortOrder: 0,
      contentRevision: 1,
      contentStatus: "ready",
      imageStatus: "ready",
      videoStatus: "not_ready",
      currentImageAssetVersionId: null,
      currentVideoAssetVersionId: null,
      activeImageTaskId: null,
      activeImageRevision: null,
      activeVideoTaskId: null,
      activeVideoImageAssetVersionId: null,
      completedImageAssetVersionIds: [],
      completedVideoAssetVersionIds: [],
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };

    this.shotsById.set(shot.id, shot);
    return shot;
  }

  async findShot(shotId: string): Promise<ShotRecord | undefined> {
    return this.shotsById.get(shotId);
  }

  async deleteShot(shotId: string): Promise<void> {
    this.shotsById.delete(shotId);
  }

  async saveShot(shot: ShotRecord): Promise<ShotRecord> {
    const next = {
      ...shot,
      updatedAt: new Date(),
    };
    this.shotsById.set(shot.id, next);
    return next;
  }
}

export async function createShotDraft(
  store: InMemoryShotStore,
  input: {
    organizationId: string;
    projectId: string;
    title: string;
    createdByUserId: string;
  },
) {
  return store.createShot(input);
}

export async function reviseShotContent(
  store: InMemoryShotStore,
  input: {
    shotId: string;
  },
) {
  const shot = await requireShot(store, input.shotId);
  return store.saveShot({
    ...shot,
    contentRevision: shot.contentRevision + 1,
    contentStatus: "ready",
    imageStatus: shot.currentImageAssetVersionId ? "stale" : "ready",
    activeImageTaskId: null,
    activeImageRevision: null,
  });
}

export async function requestShotImageGeneration(
  store: InMemoryShotStore,
  input: {
    shotId: string;
    taskId: string;
  },
) {
  const shot = await requireShot(store, input.shotId);
  return store.saveShot({
    ...shot,
    imageStatus: "generating",
    activeImageTaskId: input.taskId,
    activeImageRevision: shot.contentRevision,
  });
}

export async function completeShotImageGeneration(
  store: InMemoryShotStore,
  input: {
    shotId: string;
    taskId: string;
    assetVersionId: string;
    requestedContentRevision: number;
  },
) {
  const shot = await requireShot(store, input.shotId);
  const completedImageAssetVersionIds = [
    ...shot.completedImageAssetVersionIds,
    input.assetVersionId,
  ];

  const isCurrentResult =
    shot.activeImageTaskId === input.taskId &&
    shot.activeImageRevision === input.requestedContentRevision &&
    shot.contentRevision === input.requestedContentRevision;

  return store.saveShot({
    ...shot,
    completedImageAssetVersionIds,
    currentImageAssetVersionId: isCurrentResult
      ? input.assetVersionId
      : shot.currentImageAssetVersionId,
    imageStatus: isCurrentResult ? "completed" : shot.imageStatus,
    videoStatus: isCurrentResult ? "ready" : shot.videoStatus,
    currentVideoAssetVersionId: isCurrentResult ? null : shot.currentVideoAssetVersionId,
    activeVideoTaskId: isCurrentResult ? null : shot.activeVideoTaskId,
    activeVideoImageAssetVersionId: isCurrentResult ? null : shot.activeVideoImageAssetVersionId,
    activeImageTaskId: isCurrentResult ? null : shot.activeImageTaskId,
    activeImageRevision: isCurrentResult ? null : shot.activeImageRevision,
  });
}

async function requireShot(store: InMemoryShotStore, shotId: string) {
  const shot = await store.findShot(shotId);
  if (!shot) {
    throw new Error("shot_not_found");
  }
  return shot;
}

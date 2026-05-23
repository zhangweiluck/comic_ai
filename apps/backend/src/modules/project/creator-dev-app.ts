import { randomUUID } from "node:crypto";

import {
  computeAssetReviewSummary,
  confirmAssetCandidate,
  createAssetReviewState,
  type AssetReviewState,
  updateAssetCandidateLabel,
} from "./asset-review.service.ts";
import { InMemoryAssetStore } from "./asset.service.ts";
import {
  createCalibrationSession,
  markCalibrationItemReviewed,
  overrideCalibrationSession,
  passCalibrationSession,
  skipCalibrationSession,
  type CalibrationSessionRecord,
} from "./calibration.service.ts";
import { buildExportManifest, type ExportManifest } from "./export-manifest.service.ts";
import { createDeterministicMockParseResult } from "./parse-script.service.ts";
import {
  createProjectDraft,
  InMemoryProjectStore,
  type ProjectBundle,
} from "./project.service.ts";
import {
  finalizeShotImageGenerationBatch,
  startShotImageGenerationBatch,
} from "./shot-image-generation.service.ts";
import { createShotDraft, InMemoryShotStore, type ShotRecord } from "./shot.service.ts";
import {
  finalizeShotVideoGeneration,
  startShotVideoGeneration,
} from "./shot-video-generation.service.ts";

interface CreatorShotView {
  id: string;
  episodeId: string | null;
  title: string;
  contentRevision: number;
  imageStatus: string;
  videoStatus: string;
  currentImageAssetVersionId: string | null;
  currentVideoAssetVersionId: string | null;
}

export interface CreatorDevStateSnapshot {
  project: ProjectBundle["project"] | null;
  script: ProjectBundle["script"] | null;
  assetReview: ReturnType<typeof computeAssetReviewSummary> | null;
  assetCandidates: AssetReviewState | null;
  calibration: CalibrationSessionRecord | null;
  shots: CreatorShotView[];
  exportPreview: ExportManifest | null;
}

export class CreatorDevApp {
  private readonly projectStore = new InMemoryProjectStore();
  private readonly assetStore = new InMemoryAssetStore();
  private readonly shotStore = new InMemoryShotStore();
  private activeBundle: ProjectBundle | null = null;
  private activeAssetReview: AssetReviewState | null = null;
  private activeCalibration: CalibrationSessionRecord | null = null;
  private shotIds: string[] = [];
  private exportPreview: ExportManifest | null = null;
  private requestCounter = 0;

  async createProject(input: {
    name: string;
    scriptInput: string;
    aspectRatio: string;
    resolution: string;
    seedBundle?: ProjectBundle;
  }) {
    if (input.seedBundle) {
      this.activeBundle = input.seedBundle;
      this.activeAssetReview = null;
      this.activeCalibration = null;
      this.shotIds = [];
      this.exportPreview = null;
      return input.seedBundle;
    }

    this.requestCounter += 1;
    const created = await createProjectDraft(this.projectStore, {
      organizationId: "dev-org",
      workspaceId: "dev-workspace",
      createdByUserId: "dev-user",
      name: input.name,
      scriptInput: input.scriptInput,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      idempotencyKey: `creator-dev-create-${this.requestCounter}`,
    });

    this.activeBundle = {
      project: created.project,
      script: created.script,
    };
    this.activeAssetReview = null;
    this.activeCalibration = null;
    this.shotIds = [];
    this.exportPreview = null;

    return created;
  }

  async seedShotRecords(shots: ShotRecord[]) {
    this.shotIds = [];
    for (const shot of [...shots].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const saved = await this.shotStore.saveShot(shot);
      this.shotIds.push(saved.id);
    }
  }

  async parseScript(input?: { episodeIdForSourceId?: (sourceEpisodeId: string) => string }) {
    const bundle = this.requireBundle();
    const parsed = createDeterministicMockParseResult(bundle.script.inputText);

    this.shotIds = [];
    for (const shot of parsed.shots) {
      const created = await createShotDraft(this.shotStore, {
        organizationId: bundle.project.organizationId,
        projectId: bundle.project.id,
        episodeId: input?.episodeIdForSourceId?.(shot.episodeId) ?? shot.episodeId,
        title: `Shot ${String(shot.sequence).padStart(3, "0")}`,
        createdByUserId: bundle.project.createdByUserId,
      });
      this.shotIds.push(created.id);
    }

    this.activeAssetReview = createAssetReviewState({
      characters: parsed.candidateAssets
        .filter((candidate) => candidate.kind === "character")
        .map((candidate) => ({
          assetKey: candidate.id,
          label: candidate.name,
          required: true,
        })),
      scenes: parsed.candidateAssets
        .filter((candidate) => candidate.kind === "scene")
        .map((candidate) => ({
          assetKey: candidate.id,
          label: candidate.name,
          required: true,
        })),
      props: parsed.candidateAssets
        .filter((candidate) => candidate.kind === "prop")
        .map((candidate) => ({
          assetKey: candidate.id,
          label: candidate.name,
          required: false,
        })),
    });

    this.exportPreview = null;

    return {
      parse: parsed,
      assetReview: computeAssetReviewSummary(this.activeAssetReview),
      shots: await this.listShotRecords(),
    };
  }

  confirmAllAssets() {
    const review = this.requireAssetReview();
    let next = review;

    for (const candidate of review.characters) {
      next = confirmAssetCandidate(next, {
        group: "character",
        assetKey: candidate.assetKey,
      });
    }
    for (const candidate of review.scenes) {
      next = confirmAssetCandidate(next, {
        group: "scene",
        assetKey: candidate.assetKey,
      });
    }
    for (const candidate of review.props) {
      next = confirmAssetCandidate(next, {
        group: "prop",
        assetKey: candidate.assetKey,
      });
    }

    this.activeAssetReview = next;
    return {
      assetReview: computeAssetReviewSummary(next),
      assetCandidates: next,
    };
  }

  confirmAsset(input: {
    group: "character" | "scene" | "prop";
    assetKey: string;
  }) {
    const next = confirmAssetCandidate(this.requireAssetReview(), input);
    this.activeAssetReview = next;
    return {
      assetReview: computeAssetReviewSummary(next),
      assetCandidates: next,
    };
  }

  updateAssetLabel(input: {
    group: "character" | "scene" | "prop";
    assetKey: string;
    label: string;
  }) {
    const next = updateAssetCandidateLabel(this.requireAssetReview(), input);
    this.activeAssetReview = next;
    return {
      assetReview: computeAssetReviewSummary(next),
      assetCandidates: next,
    };
  }

  async createShot(input: { title?: string | null; episodeId?: string | null }) {
    const bundle = this.requireBundle();
    const created = await createShotDraft(this.shotStore, {
      organizationId: bundle.project.organizationId,
      projectId: bundle.project.id,
      episodeId: input.episodeId ?? null,
      title: input.title?.trim() || `Shot ${String(this.shotIds.length + 1).padStart(3, "0")}`,
      createdByUserId: bundle.project.createdByUserId,
    });
    const sorted = await this.shotStore.saveShot({
      ...created,
      sortOrder: this.shotIds.length,
    });
    this.shotIds.push(sorted.id);
    this.exportPreview = null;
    return { shot: sorted, shots: await this.listShotRecords() };
  }

  async updateShot(input: { shotId: string; title?: string | null }) {
    const shot = await this.shotStore.findShot(input.shotId);
    if (!shot || !this.shotIds.includes(input.shotId)) {
      throw new Error("creator_shot_missing");
    }
    const updated = await this.shotStore.saveShot({
      ...shot,
      title: input.title?.trim() || shot.title,
      contentRevision: shot.contentRevision + 1,
      contentStatus: "ready",
      imageStatus: shot.currentImageAssetVersionId ? "stale" : shot.imageStatus,
      videoStatus: shot.currentVideoAssetVersionId ? "stale" : shot.videoStatus,
      activeImageTaskId: null,
      activeImageRevision: null,
      activeVideoTaskId: null,
      activeVideoImageAssetVersionId: null,
    });
    this.exportPreview = null;
    return { shot: updated, shots: await this.listShotRecords() };
  }

  async deleteShot(input: { shotId: string }) {
    if (!this.shotIds.includes(input.shotId)) {
      throw new Error("creator_shot_missing");
    }
    await this.shotStore.deleteShot(input.shotId);
    this.shotIds = this.shotIds.filter((shotId) => shotId !== input.shotId);
    await this.rewriteShotSortOrder();
    this.exportPreview = null;
    return { shots: await this.listShotRecords() };
  }

  async reorderShots(input: { shotIds: string[] }) {
    const known = new Set(this.shotIds);
    if (input.shotIds.some((shotId) => !known.has(shotId))) {
      throw new Error("creator_shot_missing");
    }
    const provided = new Set(input.shotIds);
    this.shotIds = [
      ...input.shotIds,
      ...this.shotIds.filter((shotId) => !provided.has(shotId)),
    ];
    await this.rewriteShotSortOrder();
    this.exportPreview = null;
    return { shots: await this.listShotRecords() };
  }

  async runCalibration() {
    let calibration = await this.createReviewedCalibrationSession();
    calibration = passCalibrationSession(calibration, {
      decidedByUserId: this.requireBundle().project.createdByUserId,
    });

    this.activeCalibration = calibration;
    return { calibration };
  }

  async skipCalibration(input: { reason: string }) {
    let calibration = await this.createReviewedCalibrationSession();
    calibration = skipCalibrationSession(calibration, {
      decidedByUserId: this.requireBundle().project.createdByUserId,
      reason: input.reason,
    });

    this.activeCalibration = calibration;
    return { calibration };
  }

  async overrideCalibration(input: { reason?: string | null }) {
    let calibration = await this.createReviewedCalibrationSession({
      failedShotIndex: 0,
    });
    calibration = overrideCalibrationSession(calibration, {
      decidedByUserId: this.requireBundle().project.createdByUserId,
      reason: input.reason ?? null,
    });

    this.activeCalibration = calibration;
    return { calibration };
  }

  async generateImages() {
    const shots = await this.listShots();
    const bindings = shots.map((shot, index) => ({
      shotId: shot.id,
      taskId: `image-task-${index + 1}`,
      storageObjectKey: `generated/${shot.id}.png`,
      sourceAttemptId: randomUUID(),
    }));
    return this.generateImagesForTasks(bindings);
  }

  async generateImagesForTasks(
    bindings: Array<{
      shotId: string;
      taskId: string;
      storageObjectKey: string;
      sourceAttemptId: string;
    }>,
  ) {
    const started = await startShotImageGenerationBatch(this.shotStore, {
      calibration: this.requireCalibration(),
      requests: bindings.map((binding) => ({
        shotId: binding.shotId,
        taskId: binding.taskId,
      })),
    });

    const results = await finalizeShotImageGenerationBatch(this.assetStore, this.shotStore, {
      organizationId: this.requireBundle().project.organizationId,
      projectId: this.requireBundle().project.id,
      createdByUserId: this.requireBundle().project.createdByUserId,
      results: started.map((shot) => {
        const binding = bindings.find((candidate) => candidate.shotId === shot.id);
        if (!binding) {
          throw new Error(`creator_image_binding_missing:${shot.id}`);
        }

        return {
          shotId: shot.id,
          taskId: binding.taskId,
          requestedContentRevision: shot.activeImageRevision ?? 1,
          status: "succeeded" as const,
          storageObjectKey: binding.storageObjectKey,
          metadata: {
            mimeType: "image/png",
            width: 720,
            height: 1280,
          },
          sourceAttemptId: binding.sourceAttemptId,
        };
      }),
    });

    this.exportPreview = null;
    return {
      ...results,
      shots: await this.listShotRecords(),
    };
  }

  async generateVideos() {
    const shots = await this.listShots();
    const bindings = shots.map((shot, index) => ({
      shotId: shot.id,
      taskId: `video-task-${index + 1}`,
      storageObjectKey: `generated/${shot.id}.mp4`,
      sourceAttemptId: randomUUID(),
    }));
    return this.generateVideosForTasks(bindings);
  }

  async generateVideosForTasks(
    bindings: Array<{
      shotId: string;
      taskId: string;
      storageObjectKey: string;
      sourceAttemptId: string;
    }>,
  ) {
    const started = [];

    for (const binding of bindings) {
      started.push(
        await startShotVideoGeneration(this.shotStore, {
          shotId: binding.shotId,
          taskId: binding.taskId,
        }),
      );
    }

    const results = [];
    for (const shot of started) {
      const binding = bindings.find((candidate) => candidate.shotId === shot.id);
      if (!binding) {
        throw new Error(`creator_video_binding_missing:${shot.id}`);
      }

      results.push(
        await finalizeShotVideoGeneration(this.assetStore, this.shotStore, {
          organizationId: this.requireBundle().project.organizationId,
          projectId: this.requireBundle().project.id,
          createdByUserId: this.requireBundle().project.createdByUserId,
          shotId: shot.id,
          taskId: binding.taskId,
          requestedImageAssetVersionId: shot.currentImageAssetVersionId ?? "",
          status: "succeeded",
          storageObjectKey: binding.storageObjectKey,
          metadata: {
            mimeType: "video/mp4",
            width: 720,
            height: 1280,
          },
          sourceAttemptId: binding.sourceAttemptId,
        }),
      );
    }

    return {
      results,
      shots: await this.listShotRecords(),
    };
  }

  async previewExport() {
    this.exportPreview = buildExportManifest({
      projectId: this.requireBundle().project.id,
      shots: (await this.listShots()).map((shot) => ({
        shotId: shot.id,
        title: shot.title,
        currentImageAssetVersionId: shot.currentImageAssetVersionId,
      })),
    });

    return { export: this.exportPreview };
  }

  async getState(): Promise<CreatorDevStateSnapshot> {
    return {
      project: this.activeBundle?.project ?? null,
      script: this.activeBundle?.script ?? null,
      assetReview: this.activeAssetReview
        ? computeAssetReviewSummary(this.activeAssetReview)
        : null,
      assetCandidates: this.activeAssetReview,
      calibration: this.activeCalibration,
      shots: await this.listShots(),
      exportPreview: this.exportPreview,
    };
  }

  private async listShots(): Promise<CreatorShotView[]> {
    const shotRecords = await this.listShotRecords();
    return shotRecords.map((shot) => ({
      id: shot.id,
      episodeId: shot.episodeId,
      title: shot.title,
      contentRevision: shot.contentRevision,
      imageStatus: shot.imageStatus,
      videoStatus: shot.videoStatus,
      currentImageAssetVersionId: shot.currentImageAssetVersionId,
      currentVideoAssetVersionId: shot.currentVideoAssetVersionId,
    }));
  }

  private async listShotRecords(): Promise<ShotRecord[]> {
    const shots: ShotRecord[] = [];
    for (const shotId of this.shotIds) {
      const shot = await this.shotStore.findShot(shotId);
      if (!shot) {
        continue;
      }
      shots.push(shot);
    }
    return shots;
  }

  private async rewriteShotSortOrder() {
    for (const [index, shotId] of this.shotIds.entries()) {
      const shot = await this.shotStore.findShot(shotId);
      if (shot) {
        await this.shotStore.saveShot({
          ...shot,
          sortOrder: index,
        });
      }
    }
  }

  private requireBundle() {
    if (!this.activeBundle) {
      throw new Error("creator_project_missing");
    }
    return this.activeBundle;
  }

  private requireAssetReview() {
    if (!this.activeAssetReview) {
      throw new Error("creator_asset_review_missing");
    }
    return this.activeAssetReview;
  }

  private requireCalibration() {
    if (!this.activeCalibration) {
      throw new Error("creator_calibration_missing");
    }
    return this.activeCalibration;
  }

  private async createReviewedCalibrationSession(input?: { failedShotIndex?: number }) {
    const shots = await this.listShots();
    let calibration = createCalibrationSession({
      organizationId: this.requireBundle().project.organizationId,
      projectId: this.requireBundle().project.id,
      shotIds: shots.slice(0, 3).map((shot) => shot.id),
      createdByUserId: this.requireBundle().project.createdByUserId,
    });

    for (const [index, item] of calibration.items.entries()) {
      calibration = markCalibrationItemReviewed(calibration, {
        shotId: item.shotId,
        qualityReviewResult:
          input?.failedShotIndex === index ? "failed" : "passed",
      });
    }

    return calibration;
  }
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createCreatorApplication } from "../creator-application.service.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("creator application service", { concurrency: false }, () => {
  it("runs the creator flow through formal handlers and writes calibration audit plus export records", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      const created = await creator.createProject({
        user,
        body: {
          name: "Creator application service",
          scriptInput: "Episode 1: Dawn over the mechanical city.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-create",
        now: new Date("2026-05-18T10:00:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-parse",
        now: new Date("2026-05-18T10:01:00.000Z"),
      });
      const confirmed = await creator.confirmAllAssets({ user });
      const calibration = await creator.runCalibration({
        user,
        now: new Date("2026-05-18T10:02:00.000Z"),
      });
      const images = await creator.generateImages({
        user,
        now: new Date("2026-05-18T10:03:00.000Z"),
      });
      const videos = await creator.generateVideos({
        user,
        now: new Date("2026-05-18T10:03:30.000Z"),
      });
      const exportPreview = await creator.previewExport({
        user,
        now: new Date("2026-05-18T10:04:00.000Z"),
      });
      const reloadedCreator = createCreatorApplication({
        db,
        workspaceId,
      });
      const reloadedState = await reloadedCreator.getState({ user });

      const counts = await db.query<{
        calibration_audit_count: number;
        export_record_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM audit_events WHERE event_type = 'calibration.passed') AS calibration_audit_count,
            (SELECT count(*)::int FROM export_records) AS export_record_count
        `,
      );

      assert.equal(created.status, 200);
      assert.equal(parsed.status, 202);
      assert.equal(confirmed.status, 200);
      assert.equal(calibration.status, 200);
      assert.equal(images.status, 200);
      assert.equal(videos.status, 200);
      assert.equal(exportPreview.status, 200);
      assert.equal(
        (calibration.body as { auditEvent?: { eventType: string } }).auditEvent?.eventType,
        "calibration.passed",
      );
      assert.equal(
        (exportPreview.body as { exportRecord?: { manifestStatus: string } }).exportRecord
          ?.manifestStatus,
        "ready",
      );
      assert.equal(reloadedState.status, 200);
      assert.equal(reloadedState.body.project?.phase, "export");
      assert.equal(reloadedState.body.script?.status, "parsed");
      assert.equal(reloadedState.body.shots.length, 3);
      assert.equal(reloadedState.body.calibration?.status, "passed");
      assert.equal(
        reloadedState.body.shots.every((shot) => shot.currentImageAssetVersionId),
        true,
      );
      assert.equal(
        reloadedState.body.shots.every((shot) => shot.currentVideoAssetVersionId),
        true,
      );
      assert.deepEqual(counts.rows[0], {
        calibration_audit_count: 1,
        export_record_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("supports single-asset confirmation and label editing through the formal application layer", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-assets-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator asset controls",
          scriptInput: "Episode 2: The hero enters the neon forest with a lantern.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-assets-create",
        now: new Date("2026-05-18T11:00:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-assets-parse",
        now: new Date("2026-05-18T11:01:00.000Z"),
      });
      const firstCharacter = (
        parsed.body as {
          parse: { candidateAssets: Array<{ id: string; kind: string }> };
        }
      ).parse.candidateAssets.find((candidate) => candidate.kind === "character");

      assert.ok(firstCharacter);

      const confirmed = await (creator as any).confirmAsset({
        user,
        body: {
          group: "character",
          assetKey: firstCharacter.id,
        },
      });
      const renamed = await (creator as any).updateAssetLabel({
        user,
        body: {
          group: "character",
          assetKey: firstCharacter.id,
          label: "Hero Prime",
        },
      });
      const reloadedCreator = createCreatorApplication({
        db,
        workspaceId,
      });
      const reloadedState = await reloadedCreator.getState({ user });

      assert.equal(confirmed.status, 200);
      assert.equal(
        confirmed.body.assetCandidates.characters.some(
          (candidate: { assetKey: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id && candidate.confirmed,
        ),
        true,
      );
      assert.equal(renamed.status, 200);
      assert.equal(
        renamed.body.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string }) =>
            candidate.assetKey === firstCharacter.id,
        )?.label,
        "Hero Prime",
      );
      assert.equal(
        reloadedState.body.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id,
        )?.label,
        "Hero Prime",
      );
      assert.equal(
        reloadedState.body.assetCandidates.characters.find(
          (candidate: { assetKey: string; label: string; confirmed: boolean }) =>
            candidate.assetKey === firstCharacter.id,
        )?.confirmed,
        true,
      );
    } finally {
      await db.close();
    }
  });

  it("supports calibration skip and override plus export history queries", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-calibration-session");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator calibration controls",
          scriptInput: "Episode 3: Storm clouds close over the ancient harbor.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-calibration-create",
        now: new Date("2026-05-18T12:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-calibration-parse",
        now: new Date("2026-05-18T12:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });

      const skipped = await (creator as any).skipCalibration({
        user,
        body: {
          reason: "Approved style frames already cover this sequence.",
        },
        now: new Date("2026-05-18T12:02:00.000Z"),
      });
      const overridden = await (creator as any).overrideCalibration({
        user,
        body: {
          reason: "Director approved a deliberate departure from the calibration frame.",
        },
        now: new Date("2026-05-18T12:03:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T12:04:00.000Z"),
      });
      await creator.previewExport({
        user,
        now: new Date("2026-05-18T12:05:00.000Z"),
      });
      const history = await (creator as any).listExportHistory({
        user,
        now: new Date("2026-05-18T12:06:00.000Z"),
      });

      assert.equal(skipped.status, 200);
      assert.equal(skipped.body.auditEvent.eventType, "calibration.skipped");
      assert.equal(overridden.status, 200);
      assert.equal(overridden.body.auditEvent.eventType, "calibration.override");
      assert.equal(history.status, 200);
      assert.equal(history.body.records.length, 1);
      assert.equal(history.body.records[0]?.manifestStatus, "ready");
    } finally {
      await db.close();
    }
  });

  it("finalizes parse workflow into durable domain facts", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-parse-finalization");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator parse finalization",
          scriptInput: "Episode 4: Parse finalization must land durable facts.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-parse-finalization-create",
        now: new Date("2026-05-18T13:00:00.000Z"),
      });
      const parsed = await creator.parseScript({
        user,
        idempotencyKey: "creator-application-parse-finalization-parse",
        now: new Date("2026-05-18T13:01:00.000Z"),
      });

      const workflow = await db.query<{
        workflow_status: string;
        task_status: string;
        project_phase: string;
        script_status: string;
        asset_candidate_count: number;
        shot_count: number;
      }>(
        `
          SELECT
            (SELECT status FROM workflows WHERE id = $1) AS workflow_status,
            (SELECT status FROM tasks WHERE id = $2) AS task_status,
            (SELECT phase FROM projects ORDER BY created_at DESC, id DESC LIMIT 1) AS project_phase,
            (SELECT status FROM scripts ORDER BY created_at DESC, id DESC LIMIT 1) AS script_status,
            (SELECT count(*)::int FROM asset_review_candidates) AS asset_candidate_count,
            (SELECT count(*)::int FROM shots) AS shot_count
        `,
        [
          (parsed.body as { workflow: { workflowId: string; taskId: string } }).workflow.workflowId,
          (parsed.body as { workflow: { workflowId: string; taskId: string } }).workflow.taskId,
        ],
      );

      assert.equal(parsed.status, 202);
      assert.deepEqual(workflow.rows[0], {
        workflow_status: "succeeded",
        task_status: "succeeded",
        project_phase: "asset_review",
        script_status: "parsed",
        asset_candidate_count: 3,
        shot_count: 3,
      });
    } finally {
      await db.close();
    }
  });

  it("advances the project to export after generation and export finalization", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-phase-progression");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator phase progression",
          scriptInput: "Episode 5: Project phases must progress through export.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-phase-progression-create",
        now: new Date("2026-05-18T14:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-phase-progression-parse",
        now: new Date("2026-05-18T14:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T14:02:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T14:03:00.000Z"),
      });
      await creator.generateVideos({
        user,
        now: new Date("2026-05-18T14:03:30.000Z"),
      });
      await creator.previewExport({
        user,
        now: new Date("2026-05-18T14:04:00.000Z"),
      });

      const project = await db.query<{
        phase: string;
        image_task_statuses: string[];
        video_task_statuses: string[];
        export_task_statuses: string[];
      }>(
        `
          SELECT
            (SELECT phase FROM projects ORDER BY created_at DESC, id DESC LIMIT 1) AS phase,
            ARRAY(SELECT status FROM tasks WHERE task_type = 'generate_shot_image' ORDER BY created_at ASC) AS image_task_statuses,
            ARRAY(SELECT status FROM tasks WHERE task_type = 'generate_shot_video' ORDER BY created_at ASC) AS video_task_statuses,
            ARRAY(SELECT status FROM tasks WHERE task_type = 'create_export' ORDER BY created_at ASC) AS export_task_statuses
        `,
      );

      assert.deepEqual(project.rows[0], {
        phase: "export",
        image_task_statuses: ["succeeded", "succeeded", "succeeded"],
        video_task_statuses: ["succeeded", "succeeded", "succeeded"],
        export_task_statuses: ["succeeded"],
      });
    } finally {
      await db.close();
    }
  });

  it("retries a single failed image and video shot through creator-facing APIs", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-shot-retry");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator shot retry",
          scriptInput: "Episode 6: Failed frames need creator-side retry.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-shot-retry-create",
        now: new Date("2026-05-18T15:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-shot-retry-parse",
        now: new Date("2026-05-18T15:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T15:02:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      await db.query(
        `
          UPDATE shots
          SET image_status = 'failed',
              current_image_asset_version_id = NULL,
              video_status = 'not_ready',
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T15:03:00.000Z")],
      );

      const imageRetry = await (creator as any).retryShotImage({
        user,
        body: { shotId },
        now: new Date("2026-05-18T15:04:00.000Z"),
      });
      await db.query(
        `
          UPDATE shots
          SET video_status = 'failed',
              current_video_asset_version_id = NULL,
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T15:05:00.000Z")],
      );
      const videoRetry = await (creator as any).retryShotVideo({
        user,
        body: { shotId },
        now: new Date("2026-05-18T15:06:00.000Z"),
      });

      const state = await creator.getState({ user });
      const taskCounts = await db.query<{
        image_tasks: number;
        video_tasks: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_image') AS image_tasks,
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_video') AS video_tasks
        `,
      );
      const retriedShot = state.body.shots.find((shot) => shot.id === shotId);

      assert.equal(imageRetry.status, 200);
      assert.equal(videoRetry.status, 200);
      assert.equal(imageRetry.body.shot.id, shotId);
      assert.equal(videoRetry.body.shot.id, shotId);
      assert.equal(retriedShot?.imageStatus, "completed");
      assert.equal(retriedShot?.videoStatus, "completed");
      assert.ok(retriedShot?.currentImageAssetVersionId);
      assert.ok(retriedShot?.currentVideoAssetVersionId);
      assert.deepEqual(taskCounts.rows[0], {
        image_tasks: 1,
        video_tasks: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("rejects shot retry before a shot has failed or gone stale", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-retry-guard");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator retry guard",
          scriptInput: "Episode 7: Ready shots must not be retryable.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-retry-guard-create",
        now: new Date("2026-05-18T16:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-retry-guard-parse",
        now: new Date("2026-05-18T16:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T16:02:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      const imageRetry = await (creator as any).retryShotImage({
        user,
        body: { shotId },
        now: new Date("2026-05-18T16:03:00.000Z"),
      });
      const videoRetry = await (creator as any).retryShotVideo({
        user,
        body: { shotId },
        now: new Date("2026-05-18T16:04:00.000Z"),
      });

      assert.equal(imageRetry.status, 409);
      assert.deepEqual(imageRetry.body, { error: "shot_image_retry_unavailable" });
      assert.equal(videoRetry.status, 409);
      assert.deepEqual(videoRetry.body, { error: "current_image_required" });
    } finally {
      await db.close();
    }
  });

  it("claims image shot retry before provider work under concurrent requests", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-image-retry-race");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator image retry race",
          scriptInput: "Episode 8: Concurrent image retry clicks must not fork provider work.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-image-retry-race-create",
        now: new Date("2026-05-18T17:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-image-retry-race-parse",
        now: new Date("2026-05-18T17:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T17:02:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      await db.query(
        `
          UPDATE shots
          SET image_status = 'failed',
              current_image_asset_version_id = NULL,
              video_status = 'not_ready',
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T17:03:00.000Z")],
      );

      const results = await Promise.all([
        (creator as any).retryShotImage({
          user,
          body: { shotId },
          now: new Date("2026-05-18T17:04:00.000Z"),
        }),
        (creator as any).retryShotImage({
          user,
          body: { shotId },
          now: new Date("2026-05-18T17:04:00.000Z"),
        }),
      ]);
      const counts = await db.query<{
        image_tasks: number;
        image_provider_requests: number;
        image_storage_objects: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_image') AS image_tasks,
            (SELECT count(*)::int FROM provider_requests WHERE provider_operation = 'shot.image.generate') AS image_provider_requests,
            (SELECT count(*)::int FROM storage_objects WHERE object_key LIKE '%/image-%') AS image_storage_objects
        `,
      );

      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 409],
      );
      assert.deepEqual(counts.rows[0], {
        image_tasks: 1,
        image_provider_requests: 1,
        image_storage_objects: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("claims video shot retry before provider work under concurrent requests", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-video-retry-race");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator video retry race",
          scriptInput: "Episode 9: Concurrent video retry clicks must not fork provider work.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-video-retry-race-create",
        now: new Date("2026-05-18T18:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-video-retry-race-parse",
        now: new Date("2026-05-18T18:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T18:02:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T18:03:00.000Z"),
      });

      const firstShot = await db.query<{ id: string }>(
        `
          SELECT id
          FROM shots
          ORDER BY created_at ASC
          LIMIT 1
        `,
      );
      const shotId = firstShot.rows[0]!.id;

      await db.query(
        `
          UPDATE shots
          SET video_status = 'failed',
              current_video_asset_version_id = NULL,
              updated_at = $2
          WHERE id = $1
        `,
        [shotId, new Date("2026-05-18T18:04:00.000Z")],
      );

      const results = await Promise.all([
        (creator as any).retryShotVideo({
          user,
          body: { shotId },
          now: new Date("2026-05-18T18:05:00.000Z"),
        }),
        (creator as any).retryShotVideo({
          user,
          body: { shotId },
          now: new Date("2026-05-18T18:05:00.000Z"),
        }),
      ]);
      const counts = await db.query<{
        video_tasks: number;
        video_provider_requests: number;
        video_storage_objects: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_video') AS video_tasks,
            (SELECT count(*)::int FROM provider_requests WHERE provider_operation = 'shot.video.generate') AS video_provider_requests,
            (SELECT count(*)::int FROM storage_objects WHERE object_key LIKE '%/video-%') AS video_storage_objects
        `,
      );

      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 409],
      );
      assert.deepEqual(counts.rows[0], {
        video_tasks: 1,
        video_provider_requests: 1,
        video_storage_objects: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("runs the creator flow with runtime provider and storage overrides", async () => {
    const db = await createMigratedTestDb();
    const originalEnv = {
      MODEL_PROVIDER_MODE: process.env.MODEL_PROVIDER_MODE,
      MODEL_PROVIDER_ENDPOINT: process.env.MODEL_PROVIDER_ENDPOINT,
      MODEL_PROVIDER_NAME: process.env.MODEL_PROVIDER_NAME,
      STORAGE_ADAPTER_MODE: process.env.STORAGE_ADAPTER_MODE,
      STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL,
      STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    };
    const originalFetch = globalThis.fetch;

    try {
      process.env.MODEL_PROVIDER_MODE = "http";
      process.env.MODEL_PROVIDER_ENDPOINT = "https://provider.example.test";
      process.env.MODEL_PROVIDER_NAME = "provider-http-smoke";
      process.env.STORAGE_ADAPTER_MODE = "public_base_url";
      process.env.STORAGE_PUBLIC_BASE_URL = "https://cdn.example.test/assets";
      process.env.STORAGE_BUCKET = "creator-smoke";
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            externalRequestId: "provider-request-smoke",
            status: "accepted",
            redactedResponse: { accepted: true },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )) as typeof fetch;

      await seedTenant(db);
      const session = await seedSession(db, userId, "creator-application-runtime-overrides");
      const creator = createCreatorApplication({
        db,
        workspaceId,
      });
      const user = {
        id: userId,
        sessionToken: session.token,
      };

      await creator.createProject({
        user,
        body: {
          name: "Creator runtime overrides",
          scriptInput: "Episode 6: Runtime adapters must hold through the full creator flow.",
          aspectRatio: "9:16",
          resolution: "1080p",
        },
        idempotencyKey: "creator-application-runtime-overrides-create",
        now: new Date("2026-05-18T15:00:00.000Z"),
      });
      await creator.parseScript({
        user,
        idempotencyKey: "creator-application-runtime-overrides-parse",
        now: new Date("2026-05-18T15:01:00.000Z"),
      });
      await creator.confirmAllAssets({ user });
      await creator.runCalibration({
        user,
        now: new Date("2026-05-18T15:02:00.000Z"),
      });
      await creator.generateImages({
        user,
        now: new Date("2026-05-18T15:03:00.000Z"),
      });
      await creator.generateVideos({
        user,
        now: new Date("2026-05-18T15:03:30.000Z"),
      });
      const exportPreview = await creator.previewExport({
        user,
        now: new Date("2026-05-18T15:04:00.000Z"),
      });

      const providerRequests = await db.query<{
        provider_name: string;
      }>(
        `
          SELECT provider_name
          FROM provider_requests
          ORDER BY created_at ASC
        `,
      );
      const storageObjects = await db.query<{
        bucket: string;
      }>(
        `
          SELECT bucket
          FROM storage_objects
          ORDER BY created_at ASC
        `,
      );

      assert.equal(exportPreview.status, 200);
      assert.equal(
        exportPreview.body.exportRecord?.manifestStatus,
        "ready",
      );
      assert.match(
        exportPreview.body.platform?.signedUrl ?? "",
        /^https:\/\/cdn\.example\.test\/assets\//,
      );
      assert.equal(providerRequests.rows.length > 0, true);
      assert.equal(
        providerRequests.rows.every((row) => row.provider_name === "provider-http-smoke"),
        true,
      );
      assert.equal(storageObjects.rows.length > 0, true);
      assert.equal(
        storageObjects.rows.every((row) => row.bucket === "creator-smoke"),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      await db.close();
    }
  });
});

async function seedTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138000', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        $1,
        $2,
        $3,
        'creator',
        'active'
      )
    `,
    [organizationId, workspaceId, userId],
  );
}

async function seedSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  seededUserId: string,
  token: string,
) {
  const session = await createAuthSession({
    userId: seededUserId,
    token,
    now: new Date("2026-05-18T09:59:00.000Z"),
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-05-18T09:59:00.000Z"),
    ],
  );
  return session;
}

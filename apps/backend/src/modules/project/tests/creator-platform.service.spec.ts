import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createCreatorPlatformRuntime } from "../creator-platform.config.ts";
import {
  createCreatorExportArtifact,
  requestCreatorImageGenerationPlatformBatch,
  requestCreatorVideoGenerationPlatformBatch,
} from "../creator-platform.service.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";

describe("creator platform service", { concurrency: false }, () => {
  it("creates real workflow, provider-request, and storage records for image generation", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedTenantAndSession(db, "creator-platform-image");
      const result = await requestCreatorImageGenerationPlatformBatch(db, {
        sessionToken: session.token,
        projectId,
        now: new Date("2026-05-18T10:00:00.000Z"),
        shots: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            title: "Shot 001",
            contentRevision: 1,
            currentImageAssetVersionId: null,
          },
          {
            id: "50000000-0000-4000-8000-000000000002",
            title: "Shot 002",
            contentRevision: 1,
            currentImageAssetVersionId: null,
          },
        ],
      });

      const counts = await db.query<{
        workflow_count: number;
        task_count: number;
        provider_request_count: number;
        storage_object_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows WHERE workflow_type = 'shot.image.generate') AS workflow_count,
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_image') AS task_count,
            (SELECT count(*)::int FROM provider_requests WHERE provider_operation = 'shot.image.generate') AS provider_request_count,
            (SELECT count(*)::int FROM storage_objects WHERE project_id = $1) AS storage_object_count
        `,
        [projectId],
      );

      assert.equal(result.workflowStatus, "succeeded");
      assert.equal(result.tasks.length, 2);
      assert.deepEqual(counts.rows[0], {
        workflow_count: 1,
        task_count: 2,
        provider_request_count: 2,
        storage_object_count: 2,
      });
    } finally {
      await db.close();
    }
  });

  it("creates video generation platform records only for shots with a current image", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedTenantAndSession(db, "creator-platform-video");
      const result = await requestCreatorVideoGenerationPlatformBatch(db, {
        sessionToken: session.token,
        projectId,
        now: new Date("2026-05-18T10:05:00.000Z"),
        shots: [
          {
            id: "50000000-0000-4000-8000-000000000011",
            title: "Shot 011",
            contentRevision: 1,
            currentImageAssetVersionId: "image-version-011",
          },
          {
            id: "50000000-0000-4000-8000-000000000012",
            title: "Shot 012",
            contentRevision: 1,
            currentImageAssetVersionId: null,
          },
        ],
      });

      const counts = await db.query<{
        workflow_count: number;
        task_count: number;
        provider_request_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows WHERE workflow_type = 'shot.video.generate') AS workflow_count,
            (SELECT count(*)::int FROM tasks WHERE task_type = 'generate_shot_video') AS task_count,
            (SELECT count(*)::int FROM provider_requests WHERE provider_operation = 'shot.video.generate') AS provider_request_count
        `,
      );

      assert.equal(result.workflowStatus, "succeeded");
      assert.equal(result.tasks.length, 1);
      assert.deepEqual(counts.rows[0], {
        workflow_count: 1,
        task_count: 1,
        provider_request_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("creates an export artifact and signed URL through storage scope enforcement", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedTenantAndSession(db, "creator-platform-export");
      const result = await createCreatorExportArtifact(db, {
        sessionToken: session.token,
        projectId,
        now: new Date("2026-05-18T10:10:00.000Z"),
        manifest: {
          status: "ready",
          allowPartialExport: false,
          items: [
            {
              shotId: "50000000-0000-4000-8000-000000000021",
              title: "Shot 021",
              imageAssetVersionId: "asset-version-021",
            },
          ],
          missingAssets: [],
        },
      });

      const counts = await db.query<{
        workflow_count: number;
        task_count: number;
        storage_object_count: number;
        export_record_count: number;
      }>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows WHERE workflow_type = 'export.create') AS workflow_count,
            (SELECT count(*)::int FROM tasks WHERE task_type = 'create_export') AS task_count,
            (SELECT count(*)::int FROM storage_objects WHERE project_id = $1 AND content_type = 'application/json') AS storage_object_count,
            (SELECT count(*)::int FROM export_records WHERE project_id = $1) AS export_record_count
        `,
        [projectId],
      );

      assert.equal(result.workflowStatus, "succeeded");
      assert.match(result.signedUrl, /^https:\/\/dev-storage\.local\//);
      assert.equal(result.exportRecord.manifestStatus, "ready");
      assert.deepEqual(counts.rows[0], {
        workflow_count: 1,
        task_count: 1,
        storage_object_count: 1,
        export_record_count: 1,
      });
    } finally {
      await db.close();
    }
  });

  it("switches provider and storage behavior from runtime config", async () => {
    const db = await createMigratedTestDb();
    const requests: Array<{
      providerName: string;
      payloadRef: string;
    }> = [];
    const server = BunLikeHttpServer.create(async (request) => {
      const body = (await request.json()) as {
        providerName: string;
        payloadRef: string;
      };
      requests.push(body);
      return new Response(
        JSON.stringify({
          externalRequestId: `ext-${requests.length}`,
          status: "accepted",
          redactedResponse: { accepted: true },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    await server.listen();

    try {
      const session = await seedTenantAndSession(db, "creator-platform-runtime");
      const runtime = createCreatorPlatformRuntime(
        {
          MODEL_PROVIDER_MODE: "http",
          MODEL_PROVIDER_ENDPOINT: server.url,
          MODEL_PROVIDER_NAME: "openai-images",
          STORAGE_ADAPTER_MODE: "public_base_url",
          STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test/assets",
          STORAGE_BUCKET: "creator-prod",
          CREATOR_PAYLOAD_SCHEME: "creator",
          CREATOR_IMAGE_WORKER_ID: "image-http-worker",
          CREATOR_SIGNED_URL_EXPIRES_SECONDS: "1200",
        },
        { fetchImpl: fetch },
      );

      const imageResult = await requestCreatorImageGenerationPlatformBatch(
        db,
        {
          sessionToken: session.token,
          projectId,
          now: new Date("2026-05-18T10:12:00.000Z"),
          shots: [
            {
              id: "50000000-0000-4000-8000-000000000031",
              title: "Shot 031",
              contentRevision: 2,
              currentImageAssetVersionId: null,
            },
          ],
        },
        { runtime },
      );

      const exportResult = await createCreatorExportArtifact(
        db,
        {
          sessionToken: session.token,
          projectId,
          now: new Date("2026-05-18T10:13:00.000Z"),
          manifest: {
            status: "ready",
            allowPartialExport: false,
            items: [
              {
                shotId: "50000000-0000-4000-8000-000000000031",
                title: "Shot 031",
                imageAssetVersionId: "asset-version-031",
              },
            ],
            missingAssets: [],
          },
        },
        { runtime },
      );

      const providerRows = await db.query<{
        provider_name: string;
        payload_ref: string;
      }>(
        `
          SELECT provider_name, payload_ref
          FROM provider_requests
          WHERE workflow_id = $1
        `,
        [imageResult.workflowId],
      );
      const attemptRows = await db.query<{ locked_by: string }>(
        `
          SELECT locked_by
          FROM task_attempts
          WHERE workflow_id = $1
        `,
        [imageResult.workflowId],
      );
      const objectRows = await db.query<{ bucket: string }>(
        `
          SELECT bucket
          FROM storage_objects
          WHERE project_id = $1
          ORDER BY created_at ASC
        `,
        [projectId],
      );

      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.providerName, "openai-images");
      assert.equal(
        requests[0]?.payloadRef,
        "creator://projects/40000000-0000-4000-8000-000000000001/shots/50000000-0000-4000-8000-000000000031/image",
      );
      assert.deepEqual(providerRows.rows[0], {
        provider_name: "openai-images",
        payload_ref: "creator://projects/40000000-0000-4000-8000-000000000001/shots/50000000-0000-4000-8000-000000000031/image",
      });
      assert.deepEqual(attemptRows.rows[0], {
        locked_by: "image-http-worker",
      });
      assert.equal(objectRows.rows[0]?.bucket, "creator-prod");
      assert.match(
        exportResult.signedUrl,
        /^https:\/\/cdn\.example\.test\/assets\/creator-prod\//,
      );
      assert.equal(
        exportResult.expiresAt.toISOString(),
        "2026-05-18T10:33:00.000Z",
      );
    } finally {
      await server.close();
      await db.close();
    }
  });

  it("supports deferring image task finalization so business facts can be written inside the finalization transaction", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedTenantAndSession(db, "creator-platform-image-deferred");
      const result = await requestCreatorImageGenerationPlatformBatch(
        db,
        {
          sessionToken: session.token,
          projectId,
          now: new Date("2026-05-18T10:20:00.000Z"),
          shots: [
            {
              id: "50000000-0000-4000-8000-000000000041",
              title: "Shot 041",
              contentRevision: 3,
              currentImageAssetVersionId: null,
            },
          ],
        },
        {
          deferFinalization: true,
        },
      );

      const workflow = await db.query<{
        workflow_status: string;
        task_status: string;
        attempt_status: string;
      }>(
        `
          SELECT
            (SELECT status FROM workflows WHERE id = $1) AS workflow_status,
            (SELECT status FROM tasks WHERE id = $2) AS task_status,
            (SELECT status FROM task_attempts WHERE id = $3) AS attempt_status
        `,
        [result.workflowId, result.tasks[0]?.taskId, result.tasks[0]?.attemptId],
      );

      assert.equal(result.workflowStatus, "running");
      assert.deepEqual(workflow.rows[0], {
        workflow_status: "running",
        task_status: "running",
        attempt_status: "running",
      });
    } finally {
      await db.close();
    }
  });
});

async function seedTenantAndSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  token: string,
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
  await db.query(
    `
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id
      )
      VALUES ($1, $2, $3, 'Platform Project', '9:16', '1080p', 'shot_generation', $4)
    `,
    [projectId, organizationId, workspaceId, userId],
  );

  const session = await createAuthSession({
    userId,
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

class BunLikeHttpServer {
  static create(handler: (request: Request) => Promise<Response> | Response) {
    return new BunLikeHttpServer(handler);
  }

  readonly #handler: (request: Request) => Promise<Response> | Response;
  #server?: import("node:http").Server;
  #port?: number;

  private constructor(handler: (request: Request) => Promise<Response> | Response) {
    this.#handler = handler;
  }

  get url() {
    if (!this.#port) {
      throw new Error("server_not_listening");
    }

    return `http://127.0.0.1:${this.#port}`;
  }

  async listen() {
    const { createServer } = await import("node:http");

    this.#server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on("end", async () => {
        const request = new Request(`http://127.0.0.1${req.url ?? "/"}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
        });
        const response = await this.#handler(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        const body = Buffer.from(await response.arrayBuffer());
        res.end(body);
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.#server!.once("error", reject);
      this.#server!.listen(0, "127.0.0.1", () => {
        const address = this.#server!.address();
        if (!address || typeof address === "string") {
          reject(new Error("server_address_unavailable"));
          return;
        }

        this.#port = address.port;
        resolve();
      });
    });
  }

  async close() {
    if (!this.#server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.#server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

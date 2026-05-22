import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { maskCnPhone } from "../modules/identity/phone-auth.utils.ts";
import {
  createPersistentLoginChallenge,
  findPersistentAuthSessionByToken,
  revokePersistentAuthSession,
  verifyPersistentLoginChallenge,
} from "../modules/identity/persistent-auth.service.ts";
import { CreatorDevApp } from "../modules/project/creator-dev-app.ts";
import {
  createCreatorApplication,
} from "../modules/project/creator-application.service.ts";
import { queryOne } from "../modules/shared/db/sql.ts";
import { createMigratedTestDb } from "../modules/shared/db/test-db.ts";

const webRoot = join(process.cwd(), "apps", "web");
const devOrganizationId = "10000000-0000-4000-8000-000000000001";
const devWorkspaceId = "20000000-0000-4000-8000-000000000001";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

interface AuthHttpResponse<T> {
  status: number;
  body: T;
  cookies?: string[];
}

interface AuthenticatedUser {
  id: string;
  phone: string;
}

export interface PhoneAuthDevServer {
  origin: string;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
}

async function readJsonBody(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  let body = "";

  for await (const chunk of request) {
    body += String(chunk);
  }

  return body ? JSON.parse(body) : {};
}

function sessionCookie(token: string): string {
  return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearSessionCookie(): string {
  return "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function writeJson(response: ServerResponse, payload: AuthHttpResponse<unknown>) {
  response.statusCode = payload.status;
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (payload.cookies?.length) {
    response.setHeader("set-cookie", payload.cookies);
  }

  response.end(JSON.stringify(payload.body));
}

async function serveStatic(pathname: string, response: ServerResponse) {
  if (pathname === "/favicon.ico") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const normalizedPath =
    pathname === "/" ? "/login.html" : pathname === "/login" ? "/login.html" : pathname;
  const filePath = join(webRoot, normalizedPath.replace(/^\/+/, ""));
  const file = await readFile(filePath, "utf8");

  response.statusCode = 200;
  response.setHeader(
    "content-type",
    contentTypes[extname(filePath)] ?? "text/plain; charset=utf-8",
  );
  response.end(file);
}

async function ensureDevWorkspaceAccess(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  userId: string,
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Comic AI Studio', 'active')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `,
    [devOrganizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Creator Workspace', 'active')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `,
    [devWorkspaceId, devOrganizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, 'creator', 'active')
      ON CONFLICT (organization_id, workspace_id, user_id)
      DO UPDATE SET role = 'creator', status = 'active'
    `,
    [randomUUID(), devOrganizationId, devWorkspaceId, userId],
  );
}

async function findAuthenticatedUser(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  cookieHeader: string | undefined,
  now: Date,
): Promise<{ sessionToken: string; user: AuthenticatedUser } | undefined> {
  const sessionToken = parseCookies(cookieHeader).auth_session;
  if (!sessionToken) {
    return undefined;
  }

  const session = await findPersistentAuthSessionByToken(db, {
    token: sessionToken,
    now,
  });
  if (!session) {
    return undefined;
  }

  const user = await queryOne<{
    id: string;
    phone_e164: string;
    status: "active" | "disabled";
  }>(db, "SELECT id, phone_e164, status FROM users WHERE id = $1", [session.userId]);

  if (!user || user.status !== "active") {
    return undefined;
  }

  return {
    sessionToken,
    user: {
      id: user.id,
      phone: user.phone_e164,
    },
  };
}

export function createPhoneAuthDevServer(): PhoneAuthDevServer {
  const dbPromise = createMigratedTestDb();
  const debugChallengeCodes = new Map<string, string>();
  const creatorApps = new Map<string, CreatorDevApp>();
  const creatorSqlStates = new Map<
    string,
    { projectId: string | null; scriptId: string | null }
  >();
  const httpServer = createServer(async (request, response) => {
    try {
      const db = await dbPromise;
      const creatorApplication = createCreatorApplication({
        db,
        workspaceId: devWorkspaceId,
        creatorApps,
        creatorSqlStates,
      });
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname;

      if (request.method === "POST" && pathname === "/api/auth/code/request") {
        const body = (await readJsonBody(request)) as { phone: string };
        const challenge = await createPersistentLoginChallenge(db, {
          phone: body.phone,
          now: new Date(),
        });
        debugChallengeCodes.set(challenge.challengeId, challenge.plainCode);
        return writeJson(response, {
          status: 200,
          body: {
            challengeId: challenge.challengeId,
            maskedPhone: maskCnPhone(challenge.phoneE164),
            expiresAt: challenge.expiresAt.toISOString(),
            retryAfterSeconds: 60,
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/code/verify") {
        const body = (await readJsonBody(request)) as {
          challengeId: string;
          phone: string;
          code: string;
        };
        const verified = await verifyPersistentLoginChallenge(db, {
          challengeId: body.challengeId,
          phone: body.phone,
          code: body.code,
          now: new Date(),
        });

        if (verified.kind !== "verified") {
          const error =
            verified.kind === "challenge_not_found"
              ? "challenge_not_found"
              : verified.kind === "expired"
                ? "challenge_expired"
                : verified.kind === "consumed"
                  ? "challenge_consumed"
                  : verified.kind === "locked"
                    ? "verify_locked"
                    : verified.kind === "phone_mismatch"
                      ? "invalid_phone"
                      : verified.kind === "user_disabled"
                        ? "user_disabled"
                        : "code_invalid";

          return writeJson(response, {
            status:
              error === "challenge_not_found"
                ? 404
                : error === "invalid_phone"
                  ? 400
                  : error === "user_disabled"
                    ? 403
                    : 409,
            body: { error },
          });
        }

        await ensureDevWorkspaceAccess(db, verified.user.id);

        return writeJson(response, {
          status: 200,
          body: {
            user: {
              id: verified.user.id,
              phone: verified.user.phone,
            },
            session: {
              id: verified.session.id,
              expiresAt: verified.session.expiresAt.toISOString(),
            },
          },
          cookies: [sessionCookie(verified.token)],
        });
      }

      if (request.method === "GET" && pathname === "/api/auth/session") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        const session = await findPersistentAuthSessionByToken(db, {
          token: authenticated.sessionToken,
          now: new Date(),
        });
        return writeJson(response, {
          status: 200,
          body: {
            authenticated: true,
            user: authenticated.user,
            session: {
              id: session!.id,
              expiresAt: session!.expiresAt.toISOString(),
            },
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/logout") {
        const sessionToken = parseCookies(request.headers.cookie).auth_session;
        if (sessionToken) {
          await revokePersistentAuthSession(db, {
            token: sessionToken,
            now: new Date(),
          });
        }

        return writeJson(response, {
          status: 204,
          body: {},
          cookies: [clearSessionCookie()],
        });
      }

      if (
        request.method === "GET" &&
        pathname.startsWith("/api/auth/dev/challenges/")
      ) {
        const challengeId = pathname.split("/").at(-1) ?? "";
        const code = debugChallengeCodes.get(challengeId);

        if (!code) {
          return writeJson(response, {
            status: 404,
            body: { error: "challenge_not_found" },
          });
        }

        const challenge = await queryOne<{
          phone_e164: string;
          expires_at: Date;
          status: string;
        }>(
          db,
          `
            SELECT phone_e164, expires_at, status
            FROM login_challenges
            WHERE id = $1
          `,
          [challengeId],
        );

        if (!challenge) {
          return writeJson(response, {
            status: 404,
            body: { error: "challenge_not_found" },
          });
        }

        return writeJson(response, {
          status: 200,
          body: {
            challengeId,
            phone: challenge.phone_e164,
            code,
            expiresAt: challenge.expires_at.toISOString(),
            status: challenge.status,
          },
        });
      }

      if (pathname.startsWith("/api/creator/")) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        if (request.method === "GET" && pathname === "/api/creator/state") {
          return writeJson(
            response,
            await creatorApplication.getState({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/projects") {
          return writeJson(
            response,
            await creatorApplication.listProjects({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/project/create") {
          const body = (await readJsonBody(request)) as {
            name: string;
            scriptInput: string;
            aspectRatio: string;
            resolution: string;
          };
          return writeJson(
            response,
            await creatorApplication.createProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              idempotencyKey: `dev-create-${authenticated.user.id}-${Date.now()}`,
              now: new Date(),
            }),
          );
        }

        if (request.method === "PATCH" && pathname === "/api/creator/project") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            name?: string | null;
            phase?: "script_input" | "asset_review" | "shot_generation" | "export" | null;
            coverImageUrl?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "DELETE" && pathname === "/api/creator/project") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.deleteProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/project/cover") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            coverImageUrl?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/parse") {
          return writeJson(
            response,
            await creatorApplication.parseScript({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              idempotencyKey: `dev-parse-${authenticated.user.id}-${Date.now()}`,
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/assets/library") {
          return writeJson(
            response,
            await creatorApplication.listAssetLibrary({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/import") {
          const body = (await readJsonBody(request)) as {
            kind: "character" | "scene" | "prop" | "image" | "video";
            name?: string | null;
            storageObjectKey?: string | null;
            mimeType?: string | null;
            width?: number | null;
            height?: number | null;
          };
          return writeJson(
            response,
            await creatorApplication.importAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/generate") {
          const body = (await readJsonBody(request)) as {
            kind: "character" | "scene" | "prop" | "image" | "video";
            name?: string | null;
            prompt?: string | null;
            model?: string | null;
            width?: number | null;
            height?: number | null;
          };
          return writeJson(
            response,
            await creatorApplication.generateAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname.startsWith("/api/creator/assets/versions/")) {
          const assetId = pathname.split("/").at(-1) ?? "";
          return writeJson(
            response,
            await creatorApplication.listAssetVersions({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              assetId,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/confirm-all") {
          return writeJson(
            response,
            await creatorApplication.confirmAllAssets({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/confirm") {
          const body = (await readJsonBody(request)) as {
            group: "character" | "scene" | "prop";
            assetKey: string;
          };
          return writeJson(
            response,
            await creatorApplication.confirmAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/update-label") {
          const body = (await readJsonBody(request)) as {
            group: "character" | "scene" | "prop";
            assetKey: string;
            label: string;
          };
          return writeJson(
            response,
            await creatorApplication.updateAssetLabel({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/calibration/run") {
          return writeJson(
            response,
            await creatorApplication.runCalibration({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/calibration/skip") {
          const body = (await readJsonBody(request)) as {
            reason: string;
          };
          return writeJson(
            response,
            await creatorApplication.skipCalibration({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/calibration/override") {
          const body = (await readJsonBody(request)) as {
            reason?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.overrideCalibration({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/shots") {
          const body = (await readJsonBody(request)) as {
            title?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.createShot({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "PATCH" && pathname === "/api/creator/shots") {
          const body = (await readJsonBody(request)) as {
            shotId: string;
            title?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateShot({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "DELETE" && pathname === "/api/creator/shots") {
          const body = (await readJsonBody(request)) as {
            shotId: string;
          };
          return writeJson(
            response,
            await creatorApplication.deleteShot({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/shots/reorder") {
          const body = (await readJsonBody(request)) as {
            shotIds: string[];
          };
          return writeJson(
            response,
            await creatorApplication.reorderShots({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/images/generate") {
          const body = (await readJsonBody(request)) as {
            shotId?: string | null;
            promptOverride?: string | null;
            model?: string | null;
            parameters?: Record<string, unknown> | null;
          };
          return writeJson(
            response,
            await creatorApplication.generateImages({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/videos/generate") {
          const body = (await readJsonBody(request)) as {
            shotId?: string | null;
            motionPrompt?: string | null;
            model?: string | null;
            parameters?: Record<string, unknown> | null;
            audioEnabled?: boolean | null;
            musicEnabled?: boolean | null;
            lipSyncEnabled?: boolean | null;
          };
          return writeJson(
            response,
            await creatorApplication.generateVideos({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/export/preview") {
          return writeJson(
            response,
            await creatorApplication.previewExport({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/export/history") {
          return writeJson(
            response,
            await creatorApplication.listExportHistory({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }
      }

      if (request.method === "GET") {
        return await serveStatic(pathname, response);
      }

      response.statusCode = 404;
      response.end("Not Found");
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "internal_error",
        }),
      );
    }
  });

  return {
    origin: "http://127.0.0.1:0",
    async listen(port: number) {
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, "127.0.0.1", () => resolve());
      });

      const address = httpServer.address();

      if (!address || typeof address === "string") {
        throw new Error("server_address_unavailable");
      }

      this.origin = `http://127.0.0.1:${address.port}`;
    },
    async close() {
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }

      const db = await dbPromise;
      await db.close();
    },
  };
}

export type { Server };

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createPhoneAuthDevServer();
  const port = Number(process.env.PORT ?? "4310");

  server
    .listen(port)
    .then(() => {
      console.log(`Phone auth dev server listening on ${server.origin}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

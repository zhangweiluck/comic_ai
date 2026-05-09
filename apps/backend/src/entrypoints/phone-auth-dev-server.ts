import { createServer } from "node:http";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import {
  createAuthHandlers,
  createInMemoryAuthContext,
  type AuthHttpResponse,
} from "../modules/identity/auth-http.handlers.ts";

const webRoot = join(process.cwd(), "apps", "web");

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

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

function writeJson(response: import("node:http").ServerResponse, payload: AuthHttpResponse<unknown>) {
  response.statusCode = payload.status;
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (payload.cookies?.length) {
    response.setHeader("set-cookie", payload.cookies);
  }

  response.end(JSON.stringify(payload.body));
}

async function serveStatic(
  pathname: string,
  response: import("node:http").ServerResponse,
) {
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

export function createPhoneAuthDevServer(): PhoneAuthDevServer {
  const authHandlers = createAuthHandlers(createInMemoryAuthContext());
  const httpServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname;

      if (request.method === "POST" && pathname === "/api/auth/code/request") {
        const body = (await readJsonBody(request)) as { phone: string };
        return writeJson(
          response,
          await authHandlers.requestCode({ body, now: new Date() }),
        );
      }

      if (request.method === "POST" && pathname === "/api/auth/code/verify") {
        const body = (await readJsonBody(request)) as {
          challengeId: string;
          phone: string;
          code: string;
        };
        return writeJson(
          response,
          await authHandlers.verifyCode({ body, now: new Date() }),
        );
      }

      if (request.method === "GET" && pathname === "/api/auth/session") {
        return writeJson(
          response,
          await authHandlers.getSession({
            cookies: parseCookies(request.headers.cookie),
            now: new Date(),
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/auth/logout") {
        return writeJson(
          response,
          await authHandlers.logout({
            cookies: parseCookies(request.headers.cookie),
            now: new Date(),
          }),
        );
      }

      if (
        request.method === "GET" &&
        pathname.startsWith("/api/auth/dev/challenges/")
      ) {
        const challengeId = pathname.split("/").at(-1) ?? "";
        return writeJson(
          response,
          await authHandlers.getDevChallenge({
            params: { challengeId },
          }),
        );
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
      if (!httpServer.listening) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
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

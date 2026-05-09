import { randomUUID } from "node:crypto";

import { createLoginChallenge, verifyLoginChallengeCode } from "./login-challenge.service.ts";
import type { LoginChallenge } from "./phone-auth.types.ts";
import { maskCnPhone, normalizeCnPhone } from "./phone-auth.utils.ts";
import {
  createAuthSession,
  revokeAuthSession,
  type AuthSession,
  verifySessionToken,
} from "./session.service.ts";

interface AuthUser {
  id: string;
  phone: string;
  status: "active" | "disabled";
}

interface AuthContextOptions {
  debugMode?: boolean;
}

interface InMemoryAuthContext {
  debugMode: boolean;
  challenges: Map<string, LoginChallenge>;
  usersByPhone: Map<string, AuthUser>;
  sessions: Map<string, AuthSession>;
}

export interface AuthHttpResponse<T> {
  status: number;
  body: T;
  cookies?: string[];
}

export function createInMemoryAuthContext(
  options: AuthContextOptions = {},
): InMemoryAuthContext {
  return {
    debugMode: options.debugMode ?? true,
    challenges: new Map(),
    usersByPhone: new Map(),
    sessions: new Map(),
  };
}

function sessionCookie(token: string): string {
  return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearSessionCookie(): string {
  return "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function createAuthHandlers(context: InMemoryAuthContext) {
  return {
    async requestCode(input: {
      body: { phone: string };
      now: Date;
    }): Promise<
      AuthHttpResponse<{
        challengeId: string;
        maskedPhone: string;
        expiresAt: string;
        retryAfterSeconds: number;
      }>
    > {
      const challenge = await createLoginChallenge({
        phone: input.body.phone,
        now: input.now,
      });
      context.challenges.set(challenge.id, challenge);

      return {
        status: 200,
        body: {
          challengeId: challenge.id,
          maskedPhone: maskCnPhone(challenge.phoneE164),
          expiresAt: challenge.expiresAt.toISOString(),
          retryAfterSeconds: 60,
        },
      };
    },

    async verifyCode(input: {
      body: { challengeId: string; phone: string; code: string };
      now: Date;
    }): Promise<
      AuthHttpResponse<{
        user: { id: string; phone: string };
        session: { id: string; expiresAt: string };
      } | { error: string }>
    > {
      const challenge = context.challenges.get(input.body.challengeId);

      if (!challenge) {
        return { status: 404, body: { error: "challenge_not_found" } };
      }

      const result = verifyLoginChallengeCode({
        challenge,
        phone: input.body.phone,
        code: input.body.code,
        now: input.now,
      });

      context.challenges.set(challenge.id, result.challenge);

      if (result.kind !== "verified") {
        const error =
          result.kind === "expired"
            ? "challenge_expired"
            : result.kind === "consumed"
              ? "challenge_consumed"
              : result.kind === "locked"
                ? "verify_locked"
                : result.kind === "phone_mismatch"
                  ? "invalid_phone"
                  : "code_invalid";

        return {
          status: error === "invalid_phone" ? 400 : 409,
          body: { error },
        };
      }

      const phone = normalizeCnPhone(input.body.phone);
      let user = context.usersByPhone.get(phone);

      if (!user) {
        user = { id: randomUUID(), phone, status: "active" };
        context.usersByPhone.set(phone, user);
      }

      if (user.status !== "active") {
        return { status: 403, body: { error: "user_disabled" } };
      }

      const createdSession = await createAuthSession({
        userId: user.id,
        now: input.now,
      });
      context.sessions.set(createdSession.session.id, createdSession.session);

      return {
        status: 200,
        body: {
          user: {
            id: user.id,
            phone: user.phone,
          },
          session: {
            id: createdSession.session.id,
            expiresAt: createdSession.session.expiresAt.toISOString(),
          },
        },
        cookies: [sessionCookie(createdSession.token)],
      };
    },

    async getSession(input: {
      cookies?: { auth_session?: string };
      now: Date;
    }): Promise<
      AuthHttpResponse<
        | {
            authenticated: true;
            user: { id: string; phone: string };
            session: { id: string; expiresAt: string };
          }
        | { error: string }
      >
    > {
      const token = input.cookies?.auth_session;

      if (!token) {
        return { status: 401, body: { error: "unauthenticated" } };
      }

      const session = [...context.sessions.values()].find((candidate) =>
        verifySessionToken(candidate, token, input.now),
      );

      if (!session) {
        return { status: 401, body: { error: "unauthenticated" } };
      }

      const user = [...context.usersByPhone.values()].find(
        (candidate) => candidate.id === session.userId,
      );

      if (!user || user.status !== "active") {
        return { status: 401, body: { error: "unauthenticated" } };
      }

      return {
        status: 200,
        body: {
          authenticated: true,
          user: {
            id: user.id,
            phone: user.phone,
          },
          session: {
            id: session.id,
            expiresAt: session.expiresAt.toISOString(),
          },
        },
      };
    },

    async logout(input: {
      cookies?: { auth_session?: string };
      now: Date;
    }): Promise<AuthHttpResponse<Record<string, never>>> {
      const token = input.cookies?.auth_session;

      if (token) {
        for (const [sessionId, session] of context.sessions.entries()) {
          if (verifySessionToken(session, token, input.now)) {
            context.sessions.set(sessionId, revokeAuthSession(session, input.now));
            break;
          }
        }
      }

      return {
        status: 204,
        body: {},
        cookies: [clearSessionCookie()],
      };
    },

    async getDevChallenge(input: {
      params: { challengeId: string };
    }): Promise<
      AuthHttpResponse<
        | {
            challengeId: string;
            phone: string;
            code: string;
            expiresAt: string;
            status: LoginChallenge["status"];
          }
        | { error: string }
      >
    > {
      if (!context.debugMode) {
        return { status: 404, body: { error: "not_found" } };
      }

      const challenge = context.challenges.get(input.params.challengeId);

      if (!challenge || !challenge.plainCode) {
        return { status: 404, body: { error: "challenge_not_found" } };
      }

      return {
        status: 200,
        body: {
          challengeId: challenge.id,
          phone: challenge.phoneE164,
          code: challenge.plainCode,
          expiresAt: challenge.expiresAt.toISOString(),
          status: challenge.status,
        },
      };
    },
  };
}

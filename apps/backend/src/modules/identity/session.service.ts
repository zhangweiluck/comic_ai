import { randomUUID } from "node:crypto";

import {
  currentAuthHashVersion,
  generateSessionToken,
  hashSecret,
  secureHashEquals,
} from "./phone-auth.utils.ts";

export interface AuthSession {
  id: string;
  userId: string;
  status: "active" | "revoked" | "expired";
  sessionTokenHash: string;
  sessionTokenHashVersion: number;
  expiresAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

export async function createAuthSession(input: {
  userId: string;
  now: Date;
  token?: string;
  ttlMs?: number;
}): Promise<{ token: string; session: AuthSession }> {
  const token = input.token ?? generateSessionToken();
  const ttlMs = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000;

  return {
    token,
    session: {
      id: randomUUID(),
      userId: input.userId,
      status: "active",
      sessionTokenHash: hashSecret(token),
      sessionTokenHashVersion: currentAuthHashVersion,
      expiresAt: new Date(input.now.getTime() + ttlMs),
      lastSeenAt: input.now,
      revokedAt: null,
    },
  };
}

export function verifySessionToken(
  session: AuthSession,
  token: string,
  now = new Date(),
): boolean {
  if (session.status !== "active") {
    return false;
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    return false;
  }

  return (
    session.sessionTokenHashVersion === currentAuthHashVersion &&
    secureHashEquals(session.sessionTokenHash, hashSecret(token))
  );
}

// 
export function revokeAuthSession(session: AuthSession, now: Date): AuthSession {
  return {
    ...session,
    status: "revoked",
    revokedAt: now,
  };
}

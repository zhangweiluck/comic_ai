export type LoginChallengeStatus =
  | "issued"
  | "consumed"
  | "expired"
  | "revoked"
  | "locked";

export interface LoginChallenge {
  id: string;
  phoneE164: string;
  codeHash: string;
  codeHashVersion: number;
  status: LoginChallengeStatus;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  plainCode?: string;
}

export type VerifyLoginChallengeResult =
  | { kind: "verified"; challenge: LoginChallenge }
  | { kind: "invalid_code"; challenge: LoginChallenge }
  | { kind: "locked"; challenge: LoginChallenge }
  | { kind: "expired"; challenge: LoginChallenge }
  | { kind: "consumed"; challenge: LoginChallenge }
  | { kind: "revoked"; challenge: LoginChallenge }
  | { kind: "phone_mismatch"; challenge: LoginChallenge };

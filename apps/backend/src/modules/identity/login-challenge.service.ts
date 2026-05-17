import type {
  LoginChallenge,
  VerifyLoginChallengeResult,
} from "./phone-auth.types.ts";
import {
  currentAuthHashVersion,
  generateIdentityId,
  generateVerificationCode,
  hashVerificationCode,
  normalizeCnPhone,
  secureHashEquals,
} from "./phone-auth.utils.ts";

export async function createLoginChallenge(input: {
  phone: string;
  now: Date;
  code?: string;
  maxAttempts?: number;
}): Promise<LoginChallenge> {
  const phoneE164 = normalizeCnPhone(input.phone);
  const challengeId = generateIdentityId();
  const plainCode = input.code ?? generateVerificationCode();

  return {
    id: challengeId,
    phoneE164,
    codeHash: hashVerificationCode({
      challengeId,
      code: plainCode,
    }),
    codeHashVersion: currentAuthHashVersion,
    status: "issued",
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? 5,
    expiresAt: new Date(input.now.getTime() + 5 * 60 * 1000),
    lastSentAt: input.now,
    consumedAt: null,
    revokedAt: null,
    plainCode,
  };
}

export function verifyLoginChallengeCode(input: {
  challenge: LoginChallenge;
  phone: string;
  code: string;
  now: Date;
}): VerifyLoginChallengeResult {
  const normalizedPhone = normalizeCnPhone(input.phone);

  if (normalizedPhone !== input.challenge.phoneE164) {
    return {
      kind: "phone_mismatch",
      challenge: input.challenge,
    };
  }

  if (input.challenge.status === "consumed") {
    return { kind: "consumed", challenge: input.challenge };
  }

  if (input.challenge.status === "revoked") {
    return { kind: "revoked", challenge: input.challenge };
  }

  if (input.challenge.status === "locked") {
    return { kind: "locked", challenge: input.challenge };
  }

  if (input.now > input.challenge.expiresAt) {
    return {
      kind: "expired",
      challenge: {
        ...input.challenge,
        status: "expired",
      },
    };
  }

  const codeHash = hashVerificationCode({
    challengeId: input.challenge.id,
    code: input.code,
  });

  if (
    input.challenge.codeHashVersion === currentAuthHashVersion &&
    secureHashEquals(codeHash, input.challenge.codeHash)
  ) {
    return {
      kind: "verified",
      challenge: {
        ...input.challenge,
        status: "consumed",
        consumedAt: input.now,
      },
    };
  }

  const attemptCount = input.challenge.attemptCount + 1;
  const locked = attemptCount >= input.challenge.maxAttempts;

  return {
    kind: locked ? "locked" : "invalid_code",
    challenge: {
      ...input.challenge,
      attemptCount,
      status: locked ? "locked" : input.challenge.status,
    },
  };
}

import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const currentAuthHashVersion = 1;

export function normalizeCnPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const mainland = digits.startsWith("86") ? digits.slice(2) : digits;

  if (!/^1\d{10}$/.test(mainland)) {
    throw new Error("invalid_phone");
  }

  return `+86${mainland}`;
}

export function hashSecret(value: string): string {
  return hmacSha256(value);
}

export function hashVerificationCode(input: {
  challengeId: string;
  code: string;
}): string {
  return hmacSha256(`${input.challengeId}:${input.code}`);
}

export function secureHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function generateIdentityId(): string {
  return randomUUID();
}

export function maskCnPhone(phoneE164: string): string {
  const mainland = phoneE164.slice(3);
  return `${mainland.slice(0, 3)}****${mainland.slice(-4)}`;
}

function hmacSha256(value: string): string {
  return createHmac("sha256", getAuthPepper()).update(value).digest("hex");
}

function getAuthPepper(): string {
  return process.env.AUTH_SECRET_PEPPER ?? "comic-ai-local-auth-pepper";
}
